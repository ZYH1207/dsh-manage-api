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

/** 本插件对应的 DSH provider id（与 profile 的 cordis.patch.yml 一致）。 */
export const DSH_PROVIDER = 'manage-api'

/** 模型 id：允许字母数字开头，包含 `. _ - / :`，长度 1..80。 */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,79}$/

/**
 * provider 路由的兜底字段。
 *
 * llm-pi-ai 对 providers 下的每个 route 都有硬性要求：至少要有 `api`（线上协议）
 * 和 `baseURL`，schema 对 `defaultContextWindow` / `defaultMaxTokens` 有默认值，可以不管。
 * 而 provider 块在 Layer 合并里是「整体替换」——只写 models 就会丢 api，报
 * `model "x" needs an api; the installed catalog does not describe it`。
 */
const ROUTE_DEFAULTS = {
  api: 'openai-completions',
  apiKeyEnv: 'MANAGE_API_API_KEY',
  displayName: 'ManageAPI',
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
   * 找到承载 `providers[<provider>]` 的那一行配置。
   * 通常是 `- id: llm-pi-ai`，但不硬编码 id：按形状找，兼容以后改名/换插件。
   */
  function findRow() {
    const { configEditor } = services()
    if (!configEditor || typeof configEditor.configuration !== 'function') return null
    const rows = configEditor.configuration()
    const list = Array.isArray(rows) ? rows : []
    for (const row of list) {
      const merged = asRecord(asRecord(row && row.inherited).providers)
      const override = asRecord(asRecord(row && row.override).providers)
      if (merged[provider] || override[provider]) return row
    }
    return null
  }

  /**
   * 读现状：provider 里已登记的模型 id、默认模型、写入通道是否可用。
   */
  function snapshot() {
    const { configEditor, agentDefaultModel } = services()
    const row = findRow()
    const models = row ? modelIdsOf(providerOf(row, provider).merged) : []
    const selectionValue = selection()
    return {
      ok: Boolean(row),
      provider,
      entryId: row && row.entry && row.entry.id ? String(row.entry.id) : '',
      models,
      selection: selectionValue,
      configurable: Boolean(configEditor && typeof configEditor.edit === 'function'),
      selectable: Boolean(agentDefaultModel && typeof agentDefaultModel.saveSelection === 'function'),
      error: row ? '' : `DSH 配置里找不到 provider「${provider}」`,
    }
  }

  /**
   * 把模型接进 DSH：追加进 provider.models（幂等）+ 设为默认模型。
   *
   * @param {string} model 模型 id（ManageAPI 的 modelKey）
   */
  async function configure(model) {
    const id = String(model || '').trim()
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
    if (!row) return { ok: false, error: `DSH 配置里找不到 provider「${provider}」` }

    let added = false
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
      const models = Array.isArray(base.models) ? base.models.map((item) => ({ ...asRecord(item) })) : []
      if (!models.some((item) => String(item.id || '') === id)) {
        models.push({ id, name: id })
        added = true
      }
      const next = { ...base, models }
      // 兜底：万一继承层本身缺字段（用户手写配置漏了），也补上，免得写进去就是个坏路由。
      if (next.api === undefined) next.api = ROUTE_DEFAULTS.api
      if (next.baseURL === undefined) next.baseURL = baseUrl()
      if (next.apiKeyEnv === undefined) next.apiKeyEnv = ROUTE_DEFAULTS.apiKeyEnv
      if (next.displayName === undefined) next.displayName = ROUTE_DEFAULTS.displayName
      currentProviders[provider] = next
      return { ...current, providers: currentProviders }
    })

    await agentDefaultModel.saveSelection({ provider, model: id })
    log(`DSH 默认模型 → ${provider}/${id}${added ? '（已追加到 provider 模型列表）' : '（模型已在列表中）'}`)
    return { ok: true, provider, model: id, added, state: snapshot() }
  }

  return { provider, snapshot, configure, selection, findRow }
}
