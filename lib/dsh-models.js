/**
 * 把「选中的 ManageAPI 模型」接进 DSH 自己的 provider 配置。
 *
 * ## 为什么在 host 侧做
 *
 * 客户端的渲染进程是沙箱（无 process / 无 fs / 不能写 profile）。而 DSH 的模型列表与默认模型
 * 分别归两个 host 服务管：
 *
 * - `configEditor`：持久化并应用 raw config（走 Loader 正常路径），用来把模型追加进
 *   `providers['manage-api'].models`；
 * - `agentDefaultModel.saveSelection()`：写默认模型（会顺带落 profile）。
 *
 * 两者都是 `@Remote` 语义之外的服务，只能在 host 半边调。
 *
 * ## 幂等
 *
 * 同一个模型重复选择不会重复追加；已存在的 id 只更新 name（保持用户可能改过的名字不动，
 * 因为 id 被 ManageAPI 的 `/v1/models` 决定了，name 只是显示名）。
 *
 * ## 为什么只写 manage-api 这一家
 *
 * 写别的 provider 会踩到用户既有配置（chatcode 等），也超出「把 ManageAPI 模型接进 DSH」的范围。
 */

/** 本插件在 DSH 里自己拥有的 provider id（与 profile 的 cordis.patch.yml 一致）。 */
export const DSH_PROVIDER = 'dsh-manage-api'

/** 模型 id：允许字母数字开头，包含 `. _ - / :`，长度 1..80。 */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,79}$/

/**
 * provider 路由的兜底字段。
 *
 * llm-pi-ai 对 providers 下的每个 route 都有硬性要求：至少要有 `api`（线上协议）
 * 和 `baseURL`，schema 对 `defaultContextWindow` / `defaultMaxTokens` 有默认值，可以不管。
 * 而 provider 块在 Layer 合并里是「整体替换」——只写 models 就会丢 api，报
 * `model "x" needs an api; the installed catalog does not describe it`。
 *
 * `displayName` 就是模型选择器里那一组的分组名，所以用插件自己的名字。
 */
const ROUTE_DEFAULTS = {
  api: 'openai-completions',
  apiKeyEnv: 'MANAGE_API_API_KEY',
  displayName: 'DSH ManageAPI',
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {}
}

/**
 * 取 provider 的合并后配置（继承层 + 覆盖层，覆盖层优先）。
 *
 * @param {any} row `configEditor.configuration()` 的一行
 * @param {string} provider
 */
function providerOf(row, provider) {
  const inherited = asRecord(asRecord(asRecord(row && row.inherited).providers)[provider])
  const override = asRecord(asRecord(asRecord(row && row.override).providers)[provider])
  return { inherited, override, merged: { ...inherited, ...override } }
}

/**
 * @param {any} value
 * @returns {string[]}
 */
function modelIdsOf(value) {
  const models = Array.isArray(asRecord(value).models) ? asRecord(value).models : []
  const ids = []
  for (const item of models) {
    const id = item && typeof item === 'object' ? String(item.id || '') : ''
    if (id && ids.indexOf(id) < 0) ids.push(id)
  }
  return ids
}

/**
 * @param {{
 *   ctx: any,
 *   provider?: string,
 *   baseUrl?: () => string,
 *   log?: (...args: any[]) => void,
 * }} options
 */
export function createDshModel(options) {
  const ctx = options.ctx
  const provider = options.provider || DSH_PROVIDER
  const baseUrl = typeof options.baseUrl === 'function' ? options.baseUrl : () => 'http://127.0.0.1:4319/v1'
  const log = typeof options.log === 'function' ? options.log : () => {}

  /** 服务是可选依赖：每次现取，避免激活顺序问题（拿不到就报清楚）。 */
  function services() {
    return {
      configEditor: ctx && typeof ctx.get === 'function' ? ctx.get('configEditor', false) : false,
      agentDefaultModel: ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel', false) : false,
    }
  }

  /** 当前 DSH 默认模型。 */
  function selection() {
    const { agentDefaultModel } = services()
    if (!agentDefaultModel || typeof agentDefaultModel.currentSelection !== 'function') return null
    try {
      return agentDefaultModel.currentSelection() || null
    } catch {
      return null
    }
  }

  /**
   * 找到承载 `providers` 的那一行配置。
   *
   * 通常是 `- id: llm-pi-ai`，但不硬编码 id：按形状找，兼容以后改名/换插件。
   * provider 块可能还不存在（首次选模型时才建），所以退回到「providers 键最多」的那一行。
   */
  function findRow() {
    const { configEditor } = services()
    if (!configEditor || typeof configEditor.configuration !== 'function') return null
    const rows = configEditor.configuration()
    const list = Array.isArray(rows) ? rows : []
    let best = null
    let bestCount = 0
    let shaped = null
    for (const row of list) {
      const inherited = asRecord(row && row.inherited)
      const override = asRecord(row && row.override)
      const inheritedProviders = asRecord(inherited.providers)
      const overrideProviders = asRecord(override.providers)
      if (inheritedProviders[provider] || overrideProviders[provider]) return row
      // 形状对了但一条 provider 都还没有（比如刚装好、配置还是空的）：记下来当兜底。
      if (!shaped && ('providers' in inherited || 'providers' in override)) shaped = row
      const count = Object.keys({ ...inheritedProviders, ...overrideProviders }).length
      if (count > bestCount) {
        best = row
        bestCount = count
      }
    }
    return best || shaped
  }

  /**
   * 读现状：provider 里已登记的模型 id、默认模型、写入通道是否可用。
   */
  function snapshot() {
    const { configEditor, agentDefaultModel } = services()
    const row = findRow()
    const route = row ? providerOf(row, provider).merged : {}
    const exists = Object.keys(asRecord(route)).length > 0
    const models = exists ? modelIdsOf(route) : []
    const selectionValue = selection()
    return {
      ok: Boolean(row),
      provider,
      displayName: typeof route.displayName === 'string' && route.displayName ? route.displayName : ROUTE_DEFAULTS.displayName,
      exists,
      entryId: row && row.entry && row.entry.id ? String(row.entry.id) : '',
      models,
      selection: selectionValue,
      configurable: Boolean(configEditor && typeof configEditor.edit === 'function'),
      selectable: Boolean(agentDefaultModel && typeof agentDefaultModel.saveSelection === 'function'),
      error: row ? '' : 'DSH 配置里找不到承载 llm providers 的配置行（llm-pi-ai）',
    }
  }

  /**
   * 把「provider 拓扑变了」广播给宿主和已连接的客户端。
   *
   * `llm` 服务在路由变更时会自己调 `emitAdaptersUpdated()`（内部 `ctx.events.dispatch('emit',
   * ['llm/adapters-updated'])`）。我们只是改某个 provider 的 models，不一定走到那条路径，
   * 所以手动补一次；拿不到实例就返回 false，由 UI 侧再兜一层（`nudgeModelCatalog`）。
   *
   * @returns {boolean}
   */
  function notifyAdaptersUpdated() {
    const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm', false) : false
    if (!llm) return false
    try {
      if (typeof llm.emitAdaptersUpdated === 'function') {
        llm.emitAdaptersUpdated()
        return true
      }
      if (ctx && typeof ctx.emit === 'function') {
        ctx.emit('llm/adapters-updated')
        return true
      }
    } catch (error) {
      log(`广播 llm/adapters-updated 失败：${String(error && error.message ? error.message : error)}`)
    }
    return false
  }

  /**
   * 开/关一个模型在 DSH 里的可用性（多选，互不影响）。
   *
   * - `enabled: true`  → 追加进 `providers[<provider>].models`（幂等）并设为 DSH 默认模型；
   *   provider 块不存在时**顺手建出来**（`dsh-manage-api` 这组由插件独占，和用户手写的
   *   `manage-api` 网关路由互不干扰），建的时候把 `api`/`baseURL`/`apiKeyEnv`/`displayName`
   *   一并写上，否则 llm-pi-ai 会报 `model "x" needs an api`。
   * - `enabled: false` → 从 models 里摘掉；摘空则把整组删掉。若被摘的是 DSH 当前默认模型，
   *   自动改指该组剩下的第一个；若组里一个都不剩则拒绝（否则 DSH 默认模型会指向不存在的模型）。
   *
   * @param {string} model 模型 id（ManageAPI 的 modelKey）
   * @param {{enabled?: boolean}} [options]
   */
  async function configure(model, options) {
    const id = String(model || '').trim()
    const enabled = !(options && options.enabled === false)
    if (!MODEL_ID_RE.test(id)) {
      return { ok: false, error: `模型名不合法：${JSON.stringify(String(model).slice(0, 60))}` }
    }
    const { configEditor, agentDefaultModel } = services()
    if (!configEditor || typeof configEditor.edit !== 'function') {
      return { ok: false, error: 'DSH 的 configEditor 服务不可用，无法写入 provider 模型列表' }
    }
    if (!agentDefaultModel || typeof agentDefaultModel.saveSelection !== 'function') {
      return { ok: false, error: 'DSH 的 agentDefaultModel 服务不可用，无法设置默认模型' }
    }
    const row = findRow()
    if (!row) return { ok: false, error: 'DSH 配置里找不到承载 llm providers 的配置行（llm-pi-ai）' }

    const before = modelIdsOf(providerOf(row, provider).merged)
    const sel = selection()
    const isCurrent = Boolean(sel && sel.provider === provider && sel.model === id)

    if (!enabled) {
      if (!before.includes(id)) {
        // 幂等：本来就不在组里，什么都不用做。
        return { ok: true, provider, model: id, enabled: false, added: false, created: false, removed: false, nudged: false, state: snapshot() }
      }
      if (before.length === 1 && isCurrent) {
        return {
          ok: false,
          error: '这是分组里最后一个模型，而且正是 DSH 当前默认模型。请先把 DSH 默认模型切到别的模型，再关掉它。',
        }
      }
    }

    let added = false
    let created = false
    let removed = false
    let modelsAfter = []
    await configEditor.edit(row.entry, (currentConfig, inheritedConfig) => {
      const current = asRecord(currentConfig)
      const inherited = asRecord(inheritedConfig)
      const currentProviders = { ...asRecord(current.providers) }
      const inheritedProviders = asRecord(inherited.providers)
      // provider 块是「整体替换」语义：只写 { models } 会把继承来的 api/baseURL/apiKeyEnv/displayName
      // 一起顶掉，llm-pi-ai 随后就报 `model "x" needs an api`。所以先把继承层 + 已有覆盖层合并回来。
      const base = {
        ...asRecord(inheritedProviders[provider]),
        ...asRecord(currentProviders[provider]),
      }
      created = enabled && Object.keys(base).length === 0
      const list = Array.isArray(base.models) ? base.models.map((item) => ({ ...asRecord(item) })) : []
      if (enabled) {
        modelsAfter = list
        if (!list.some((item) => String(item.id || '') === id)) {
          modelsAfter.push({ id, name: id })
          added = true
        }
      } else {
        modelsAfter = list.filter((item) => String(item.id || '') !== id)
        removed = modelsAfter.length !== list.length
      }
      if (modelsAfter.length === 0) {
        // 一个都不剩 → 整组删掉（不留空 provider，免得选择器里出现一个点不开的空组）。
        delete currentProviders[provider]
        return { ...current, providers: currentProviders }
      }
      const next = { ...base, models: modelsAfter }
      // 兜底：新建的 provider（或继承层漏字段）补上完整路由，免得写进去就是个坏路由。
      if (next.api === undefined) next.api = ROUTE_DEFAULTS.api
      if (next.baseURL === undefined) next.baseURL = baseUrl()
      if (next.apiKeyEnv === undefined) next.apiKeyEnv = ROUTE_DEFAULTS.apiKeyEnv
      if (next.displayName === undefined) next.displayName = ROUTE_DEFAULTS.displayName
      currentProviders[provider] = next
      return { ...current, providers: currentProviders }
    })

    // 默认模型：开 → 指到它；关掉的是当前默认 → 指到组里剩下的第一个。
    let selectionChanged = enabled
    if (enabled) {
      await agentDefaultModel.saveSelection({ provider, model: id })
    } else if (isCurrent) {
      const fallback = modelsAfter[0] && String(modelsAfter[0].id || '')
      if (fallback) {
        await agentDefaultModel.saveSelection({ provider, model: fallback })
        selectionChanged = true
      }
    }

    // 通知所有已连接客户端重拉模型目录。
    // 会话输入框下方的模型选择器按 Host generation 缓存 `buildModelCatalog()` 的结果，
    // 只在 `llm/adapters-updated` / `settings/document-updated` 这类远端事件到达时刷新；
    // 写 configEditor 不保证把事件送到客户端，所以这里补一次（llm 服务自己也是这么广播的）。
    const nudged = notifyAdaptersUpdated()

    log(
      enabled
        ? `DSH 已启用 ${provider}/${id}${created ? '（新建分组）' : added ? '（追加到分组）' : '（本来就在）'}`
        : `DSH 已停用 ${provider}/${id}${removed ? '' : '（本来就不在）'}${modelsAfter.length === 0 ? '（分组已清空删除）' : ''}`,
    )
    return {
      ok: true,
      provider,
      model: id,
      enabled,
      added,
      created,
      removed,
      selectionChanged,
      nudged,
      state: snapshot(),
    }
  }

  /**
   * 诊断：宿主 llm 注册表里到底有哪些 provider、各自能列出哪些模型。
   *
   * 会话输入框下方的模型选择器（`conversation.input.model` 槽）读的是
   * `buildModelCatalog()` → `ctx.llm.listProviders()` + `ctx.llm.listModels(id)`，
   * 而它会把「模型数为 0」的 provider 整组过滤掉；llm-pi-ai 的 `listModels()`
   * 在 API Key 解析不出来时正好返回空数组，所以 provider 会整组消失。
   *
   * @returns {Promise<any>}
   */
  async function catalog() {
    const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm', false) : false
    if (!llm || typeof llm.listProviders !== 'function') {
      return { ok: false, error: 'DSH 的 llm 服务不可用' }
    }
    const providers = llm.listProviders() || []
    const groups = []
    for (const item of providers) {
      const id = item && item.id ? String(item.id) : ''
      const entry = { id, name: (item && item.name) || id, models: [], resolved: [], error: '' }
      try {
        const models = await llm.listModels(id)
        entry.models = (models || []).map((model) => model && model.id).filter(Boolean)
      } catch (error) {
        entry.error = String(error && error.message ? error.message : error)
      }
      // 模型选择器除了 listModels 还会逐个 resolveModelInfo；任何一个抛错，整组都会被
      // buildModelCatalog 记成 failure 而不进 routableProviders（= 在选择器里整组消失）。
      if (typeof llm.resolveModelInfo === 'function') {
        for (const modelId of entry.models) {
          try {
            const info = await llm.resolveModelInfo(id, modelId)
            entry.resolved.push({ id: modelId, ok: true, name: (info && info.name) || '' })
          } catch (error) {
            entry.resolved.push({ id: modelId, ok: false, error: String(error && error.message ? error.message : error) })
          }
        }
      }
      groups.push(entry)
    }
    return {
      ok: true,
      provider,
      total: groups.length,
      groups,
      managed: groups.filter((group) => group.id === provider),
    }
  }

  return { provider, snapshot, configure, selection, findRow, catalog }
}
