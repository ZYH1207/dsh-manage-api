#!/usr/bin/env node
/**
 * dsh-plugin 本地自检（不装进 profile 也能跑）。
 *
 * 覆盖四件事：
 *   1. 所有 lib/*.js 语法可解析（node --check）
 *   2. host 半边能 import，并在假 ctx 上完整走通 apply / dispose
 *   3. client 半边能在假 window.__ModuleLoader__ 环境里加载，导出 apply/inject/name，
 *      且在假 slots 上完成 settings.section 注册
 *   4. package.json 的 dsh / exports / files 自洽（文件真实存在）
 *
 * 用法：node scripts/check.mjs
 */

import { execFileSync } from 'node:child_process'
import { readFile, readdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
const checks = []

function ok(label, detail) {
  checks.push({ label, detail })
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label, error) {
  failures.push(`${label}: ${error}`)
  console.log(`  ✗ ${label} — ${error}`)
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// ── 1) 语法检查 ─────────────────────────────────────────────────────
console.log('\n[1/4] 语法检查')
const libDir = join(root, 'lib')
const libFiles = (await readdir(libDir)).filter((f) => f.endsWith('.js'))
for (const file of libFiles) {
  try {
    execFileSync(process.execPath, ['--check', join(libDir, file)], { stdio: 'pipe' })
    ok(`node --check lib/${file}`)
  } catch (err) {
    fail(`node --check lib/${file}`, String(err.stderr || err.message).slice(0, 400))
  }
}

// ── 2) host 半边 ────────────────────────────────────────────────────
console.log('\n[2/4] host 半边加载')
try {
  const mod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
  if (typeof mod.apply === 'function') ok('导出 apply(ctx, config)')
  else fail('导出 apply(ctx, config)', 'apply 不是函数')

  const registered = { effects: [], ons: [], services: new Map(), tools: [], guards: [], contexts: [], commands: [], routes: [], injects: [] }
  const fakeTools = {
    register(definition) {
      registered.tools.push(definition)
      return () => {}
    },
    guard(fn) {
      registered.guards.push(fn)
      return () => {}
    },
  }
  const fakeCommands = {
    register(definition) {
      registered.commands.push(definition)
      return () => {}
    },
  }
  const fakeSystemPrompt = {
    context(context) {
      registered.contexts.push(context)
      return () => {}
    },
  }
  const fakeWebServer = {
    register(route) {
      registered.routes.push(route)
      return () => {}
    },
  }
  const fakeCtx = {
    // 真 Cordis 的 ctx.inject(deps, cb) 在依赖就绪后执行 cb；
    // 这里同步执行，就能覆盖「webServer 就绪后才注册路由」的路径。
    inject(deps, cb) {
      registered.injects.push(deps.join(','))
      const d = cb(fakeCtx)
      if (typeof d === 'function') registered.effects.push({ label: 'inject:' + deps.join(','), dispose: d })
      return () => {}
    },
    effect(fn, label) {
      registered.effects.push({ label, dispose: fn() })
      return () => {}
    },
    on(event, handler) {
      registered.ons.push({ event, handler })
      return () => {}
    },
    get(name) {
      if (name === 'webServer') return fakeWebServer
      if (name === 'tools') return fakeTools
      if (name === 'systemPrompt') return fakeSystemPrompt
      if (name === 'commands') return fakeCommands
      return undefined
    },
    // 真 Cordis 里 set 只能写已 provide 的服务，直接 set 会抛
    // `cannot set property "x" without provide`；这里照实模拟，防止回归。
    set(name) {
      throw new Error(`cannot set property "${name}" without provide`)
    },
    provide(name, value) {
      if (registered.services.has(name)) throw new Error(`service "${name}" 重复 provide`)
      registered.services.set(name, value)
      return () => {}
    },
    logger() {
      return { info() {}, warn() {}, error() {} }
    },
  }
  const dispose = mod.apply(fakeCtx, { autoStart: false, proxyEnabled: false })
  ok('apply() 不抛异常', `${registered.effects.length} 个 effect，${registered.ons.length} 个事件监听`)
  if (registered.ons.some((o) => o.event === 'llm/stream')) ok('注册了 llm/stream tee')
  else fail('注册了 llm/stream tee', '没找到 llm/stream 监听')
  if (registered.services.has("manageApi")) ok("通过 ctx.provide 暴露 manageApi")
  else fail('暴露 ctx.set(manageApi)', '没有 set')

  const toolNames = registered.tools.map((t) => t.name)
  const expectedTools = ['manageapi_status', 'manageapi_models', 'manageapi_usage']
  if (expectedTools.every((n) => toolNames.includes(n))) ok('注册 3 个工具', toolNames.join(', '))
  else fail('注册 3 个工具', JSON.stringify(toolNames))
  if (registered.tools.every((t) => t.parameters && typeof t.parameters === 'object' && t.output && typeof t.output.render === 'function')) {
    ok('每个工具都有 parameters 与 output.render')
  } else fail('工具 schema 完整', '有工具缺 parameters/output.render')
  if (registered.guards.length === 1) ok('注册了预算 guard')
  else fail('注册了预算 guard', String(registered.guards.length))
  if (registered.commands.length === 1 && registered.commands[0].name === 'manage' && typeof registered.commands[0].handler === 'function') {
    ok('注册了 /manage 命令', registered.commands[0].description?.slice(0, 20) || '')
  } else fail('注册了 /manage 命令', JSON.stringify(registered.commands.map((c) => c.name)))
  if (registered.contexts.length === 1 && registered.contexts[0].name === 'manage-api') {
    ok('注册了 systemPrompt.context', `order=${registered.contexts[0].order}`)
  } else fail('注册了 systemPrompt.context', JSON.stringify(registered.contexts.map((c) => c.name)))

  for (const entry of registered.effects) {
    const fn = entry.dispose
    if (typeof fn === 'function') await fn()
    else if (fn && typeof fn.then === 'function') await fn
  }
  ok('所有 effect 的清理函数可调用')
  if (typeof dispose === 'function') {
    dispose()
    ok('apply 返回值可调用')
  }

  // ── [1b] 同源代理路由：proxyEnabled=true 时必须注册 /api/manage-api ──
  //
  // 回归防护：这里曾经是 ctx.get('webServer') 一次性探，服务未就绪就永久跳过注册，
  // 表现是「设置页面板一直报 401 / 非 JSON」。现在必须走 ctx.inject。
  {
    const routes = []
    const injects = []
    const fakeWebServer = {
      register(route) {
        routes.push(route)
        return () => {}
      },
    }
    const routeCtx = {
      inject(deps, cb) {
        injects.push(deps.join(','))
        const d = cb(routeCtx)
        if (typeof d === 'function') d()
        return () => {}
      },
      effect(fn) {
        const d = fn()
        if (typeof d === 'function') d()
        return () => {}
      },
      on() {
        return () => {}
      },
      get(n) {
        if (n === 'webServer') return fakeWebServer
        if (n === 'tools') return fakeTools
        if (n === 'systemPrompt') return fakeSystemPrompt
        if (n === 'commands') return fakeCommands
        return undefined
      },
      set(n) {
        throw new Error('cannot set property "' + n + '" without provide')
      },
      provide() {
        return () => {}
      },
      logger() {
        return { info() {}, warn() {}, error() {} }
      },
    }
    mod.apply(routeCtx, { autoStart: false, proxyEnabled: true, promptContext: false, ingestExternalUsage: false })
    if (injects.includes('webServer')) ok('通过 ctx.inject 等 webServer 就绪')
    else fail('通过 ctx.inject 等 webServer 就绪', JSON.stringify(injects))
    const route = routes.find((r) => r && r.path === '/api/manage-api')
    if (route && route.kind === 'prefix' && typeof route.handler === 'function') {
      ok('注册同源代理前缀 /api/manage-api')
    } else {
      fail('注册同源代理前缀 /api/manage-api', JSON.stringify(routes.map((r) => r && r.path)))
    }
  }
} catch (err) {
  fail('host 半边加载', String(err && err.stack ? err.stack : err).slice(0, 800))
}

// ── 2b) budget / ingest 纯逻辑 ──────────────────────────────────────
console.log('\n[2b] budget / ingest 纯逻辑')
try {
  const { createBudget } = await import(pathToFileURL(join(root, 'lib', 'budget.js')).href)
  const streamStats = new Map([['s1', { tokens: 400, calls: 2, lastAt: Date.now(), model: 'm' }]])
  const budget = createBudget({ config: { budget: { sessionTokens: 1000, dailyTokens: 5000 } }, streamStats, log: () => {} })
  if (budget.denyReason('s1') === undefined) ok('未超预算时不拒绝')
  else fail('未超预算时不拒绝', String(budget.denyReason('s1')))
  streamStats.set('s1', { tokens: 1200, calls: 3, lastAt: Date.now(), model: 'm' })
  if (typeof budget.denyReason('s1') === 'string') ok('会话超预算后拒绝', budget.denyReason('s1').slice(0, 24))
  else fail('会话超预算后拒绝', '仍是 undefined')
  const dailyBudget = createBudget({ config: { budget: { sessionTokens: 0, dailyTokens: 5000 } }, streamStats: new Map(), log: () => {} })
  dailyBudget.absorbUsage({ input: 4000, output: 2000 })
  if (typeof dailyBudget.denyReason() === 'string') ok('日预算超限后拒绝', dailyBudget.denyReason().slice(0, 24))
  else fail('日预算超限后拒绝', '仍是 undefined')
  const unlimited = createBudget({ config: { budget: { sessionTokens: 0, dailyTokens: 0 } }, streamStats, log: () => {} })
  if (unlimited.denyReason('s1') === undefined) ok('0 = 不设限')
  else fail('0 = 不设限', '仍拒绝')

  const { createIngest } = await import(pathToFileURL(join(root, 'lib', 'ingest.js')).href)
  const ingest = createIngest({ port: 1, enabled: true, getMode: () => 'down', log: () => {} })
  ingest.record({ provider: 'chatcode', model: 'm', usage: { inputTokens: 10, outputTokens: 5 } })
  ingest.record({ provider: 'manage-api', model: 'm', usage: { inputTokens: 10, outputTokens: 5 } })
  const snap = ingest.snapshot()
  if (snap && typeof snap === 'object') ok('ingest.snapshot() 可用', JSON.stringify(snap).slice(0, 120))
  else fail('ingest.snapshot() 可用', String(snap))
} catch (err) {
  fail('budget / ingest 纯逻辑', String(err && err.stack ? err.stack : err).slice(0, 800))
}

// ── 2c) 写白名单（面板的「加站点 / 加 Key」全走它，越权必须被拒）────────
console.log('\n[2c] 写白名单 / 响应瘦身')
try {
  const { resolveWrite, summarizeWrite } = await import(pathToFileURL(join(root, 'lib', 'write-proxy.js')).href)
  const allowed = [
    ['POST', '/api/providers'],
    ['PATCH', '/api/providers/p-ab12'],
    ['DELETE', '/api/providers/p-ab12'],
    ['POST', '/api/providers/p-ab12/sync'],
    ['POST', '/api/providers/p-ab12/detect-kind'],
    ['POST', '/api/credentials'],
    ['DELETE', '/api/credentials/c-1'],
    ['POST', '/api/probes/run'],
    ['POST', '/api/monitor/collect'],
    ['POST', '/api/monitor/alerts/read'],
    ['PATCH', '/api/offers/o-1'],
    ['PUT', '/api/decisions/deepseek-v4.1-flash/order'],
    ['POST', '/api/fx/refresh'],
  ]
  const rejected = [
    ['POST', '/api/free/platforms'],
    ['POST', '/api/gateway/keys'],
    ['DELETE', '/api/benchmarks/x'],
    ['PUT', '/api/offers/o-1'],
    ['POST', '/api/monitor/prune'],
    ['POST', '/api/providers/../secrets'],
    ['GET', '/api/providers'],
    ['POST', '/api/providers?full=1'],
    ['POST', 'https://evil.example/api/providers'],
  ]
  const badAllowed = allowed.filter(([m, p]) => !resolveWrite(m, p))
  if (!badAllowed.length) ok('白名单放行面板必需的写操作')
  else fail('白名单放行面板必需的写操作', JSON.stringify(badAllowed))
  const badRejected = rejected.filter(([m, p]) => resolveWrite(m, p))
  if (!badRejected.length) ok('白名单拒绝越权/带 query/非 /api 路径')
  else fail('白名单拒绝越权路径', JSON.stringify(badRejected))

  const slim = summarizeWrite(
    {
      settings: { huge: 'x'.repeat(50) },
      providers: [{ id: 'p-1', name: '新站', kind: 'newapi', baseUrl: 'https://a.example' }],
      offers: new Array(19).fill({}),
      sync: { fetched: 11, added: 3, removed: [], pruned: 0 },
    },
    { name: '新站' },
  )
  if (slim.sync && slim.providers === 1 && slim.provider && slim.provider.id === 'p-1' && slim.settings === undefined) {
    ok('写响应只剩小字段（不带 state / settings）', JSON.stringify(slim).slice(0, 90))
  } else {
    fail('写响应只剩小字段', JSON.stringify(slim).slice(0, 200))
  }
} catch (err) {
  fail('写白名单纯逻辑', String(err && err.stack ? err.stack : err).slice(0, 800))
}

console.log('\n[2d] state 脱敏（网关 Key / 站点 adminToken 不下发到渲染进程）')
try {
  const { sanitizeState } = await import(pathToFileURL(join(root, 'lib', 'routes.js')).href)
  const out = sanitizeState({
    gateway: { enabled: true, keys: [{ id: 'g1', name: 'dsh', key: 'sk-mapi-abcdef1234', enabled: true }] },
    providers: [{ id: 'p1', name: '秋', adminToken: { iv: 'x', tag: 'y', data: 'z' }, adminTokenTail: '1234' }],
  })
  const keyGone = out.gateway.keys[0].key === undefined && out.gateway.keys[0].name === 'dsh' && out.gateway.enabled === true
  const tokenGone = out.providers[0].adminToken === undefined && out.providers[0].adminTokenTail === '1234'
  if (keyGone && tokenGone) ok('state 脱敏：网关 Key 与 adminToken 被剔除，展示字段保留')
  else fail('state 脱敏', JSON.stringify(out))
} catch (err) {
  fail('state 脱敏', String(err && err.stack ? err.stack : err).slice(0, 800))
}

console.log('\n[2e] 自动 DSH：新建独占 provider 分组 + 追加幂等 + 设默认模型（假 configEditor）')
try {
  const { createDshModel, DSH_PROVIDER } = await import(pathToFileURL(join(root, 'lib', 'dsh-models.js')).href)
  // 用户手写的网关路由（llm-pi-ai 的 manage-api）：插件不应该动它。
  const gatewayRoute = { baseURL: 'http://127.0.0.1:4319/v1', api: 'openai-completions', models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek' }] }
  const config = { providers: { 'manage-api': gatewayRoute } }
  const rows = () => [{ entry: { id: 'include:llm-pi-ai' }, inherited: { providers: config.providers }, override: {} }]
  const saved = []
  const ctx = {
    get(name) {
      if (name === 'configEditor') {
        return {
          configuration: () => rows(),
          edit: async (_entry, fn) => {
            const next = fn({ providers: {} }, { providers: config.providers })
            // 真实 YAML 层是「providers 按 key 深合并」：覆盖块里只出现自己那一个 provider，
            // 兄弟 provider（chatcode / 用户手写的 manage-api 等）不受影响。假编辑器照此模拟。
            config.providers = { ...config.providers, ...next.providers }
          },
        }
      }
      if (name === 'agentDefaultModel') {
        return {
          currentSelection: () => saved[saved.length - 1] || { provider: 'chatcode', model: 'x' },
          saveSelection: async (next) => saved.push(next),
        }
      }
      return false
    },
  }
  const dsh = createDshModel({ ctx, baseUrl: () => 'http://127.0.0.1:4319/v1' })
  const before = dsh.snapshot()
  const r1 = await dsh.configure('glm-5.3-flash')
  const r2 = await dsh.configure('glm-5.3-flash')
  const own = config.providers[DSH_PROVIDER] || {}
  const ids = Array.isArray(own.models) ? own.models.map((m) => m.id) : []
  const okAppend = r1.ok && r1.added === true && r1.created === true && ids.includes('glm-5.3-flash')
  const okIdem = r2.ok && r2.added === false && r2.created === false && ids.filter((x) => x === 'glm-5.3-flash').length === 1
  const okSel = saved.length === 2 && saved[1].provider === DSH_PROVIDER && saved[1].model === 'glm-5.3-flash'
  const okBad = (await dsh.configure('bad model!')).ok === false
  const okSnap = before.ok && before.entryId === 'include:llm-pi-ai' && before.exists === false && before.models.length === 0
  // 回归：只写 models 会把 provider 块的 api/baseURL 顶掉，llm-pi-ai 随后报
  // `model "x" needs an api; the installed catalog does not describe it`。新建分组必须带完整路由字段。
  const okRoute =
    own.api === 'openai-completions' &&
    own.baseURL === 'http://127.0.0.1:4319/v1' &&
    own.apiKeyEnv === 'MANAGE_API_API_KEY' &&
    own.displayName === 'DSH ManageAPI'
  const okIsolated = config.providers['manage-api'].models.length === 1 && config.providers['manage-api'].models[0].id === 'deepseek-v4.1-flash'
  if (okAppend && okIdem && okSel && okBad && okSnap && okRoute && okIsolated) {
    ok('自动 DSH：新建 dsh-manage-api 分组 + 追加幂等 + 设默认模型 + 不动手写路由')
  } else {
    fail('自动 DSH 写入链路', JSON.stringify({ okAppend, okIdem, okSel, okBad, okSnap, okRoute, okIsolated, ids, own, saved }))
  }

  // 已有的 provider 块只缺字段时用兜底值补齐（api / baseURL / apiKeyEnv / displayName）
  const bare = { providers: { [DSH_PROVIDER]: {} } }
  const bareRows = [{ entry: { id: 'include:llm-pi-ai' }, inherited: { providers: bare.providers }, override: {} }]
  const bareCtx = {
    get(name) {
      if (name === 'configEditor') {
        return {
          configuration: () => bareRows,
          edit: async (_entry, fn) => {
            bare.providers = { ...bare.providers, ...fn({ providers: {} }, { providers: bare.providers }).providers }
          },
        }
      }
      if (name === 'agentDefaultModel') return { currentSelection: () => null, saveSelection: async () => {} }
      return false
    },
  }
  const bareDsh = createDshModel({ ctx: bareCtx, baseUrl: () => 'http://127.0.0.1:4319/v1' })
  await bareDsh.configure('glm-5.3')
  const filled = bare.providers[DSH_PROVIDER]
  const okFill =
    filled.api === 'openai-completions' &&
    filled.baseURL === 'http://127.0.0.1:4319/v1' &&
    filled.apiKeyEnv === 'MANAGE_API_API_KEY' &&
    filled.displayName === 'DSH ManageAPI'
  if (okFill) ok('自动 DSH：已有分组缺字段时补兜底路由字段', 'api/baseURL/apiKeyEnv/displayName')
  else fail('自动 DSH 兜底路由字段', JSON.stringify(filled))
} catch (err) {
  fail('自动 DSH 写入链路', String(err && err.stack ? err.stack : err).slice(0, 800))
}

console.log('\n[2e2] 自动 DSH：多选开关（开/关互不影响 + 默认模型回落 + 拒绝关掉最后一个默认模型）')
try {
  const { createDshModel, DSH_PROVIDER } = await import(pathToFileURL(join(root, 'lib', 'dsh-models.js')).href)
  const config = { providers: {} }
  const rows = () => [{ entry: { id: 'include:llm-pi-ai' }, inherited: { providers: config.providers }, override: {} }]
  const saved = []
  const ctx = {
    get(name) {
      if (name === 'configEditor') {
        return {
          configuration: () => rows(),
          edit: async (_entry, fn) => {
            const next = fn({ providers: {} }, { providers: config.providers })
            config.providers = { ...config.providers, ...next.providers }
          },
        }
      }
      if (name === 'agentDefaultModel') {
        return {
          currentSelection: () => saved[saved.length - 1] || null,
          saveSelection: async (next) => saved.push(next),
        }
      }
      return false
    },
  }
  const dsh = createDshModel({ ctx, baseUrl: () => 'http://127.0.0.1:4319/v1' })
  const a = await dsh.configure('model-a', { enabled: true })
  const b = await dsh.configure('model-b', { enabled: true })
  const ids2 = () => (((config.providers[DSH_PROVIDER] || {}).models) || []).map((m) => m.id)
  const okBoth = a.ok && b.ok && ids2().length === 2 && ids2().includes('model-a') && ids2().includes('model-b')
  const okDefaultB = Boolean(saved[saved.length - 1] && saved[saved.length - 1].model === 'model-b')
  const offA = await dsh.configure('model-a', { enabled: false })
  const okOffA = offA.ok && offA.removed === true && !ids2().includes('model-a') && ids2().includes('model-b')
  const okDefaultStays = Boolean(saved[saved.length - 1] && saved[saved.length - 1].model === 'model-b')
  const offB = await dsh.configure('model-b', { enabled: false })
  const okRefuseLast = offB.ok === false && ids2().includes('model-b')
  const offGhost = await dsh.configure('model-zzz', { enabled: false })
  const okIdempotentOff = offGhost.ok === true && offGhost.removed === false
  if (okBoth && okDefaultB && okOffA && okDefaultStays && okRefuseLast && okIdempotentOff) {
    ok('自动 DSH 多选开关：开两个 + 关一个 + 默认不动 + 拒绝关最后一个 + 关不存在的幂等')
  } else {
    fail('自动 DSH 多选开关', JSON.stringify({ okBoth, okDefaultB, okOffA, okDefaultStays, okRefuseLast, okIdempotentOff, ids: ids2(), saved, offB }))
  }
} catch (err) {
  fail('自动 DSH 多选开关', String(err && err.stack ? err.stack : err).slice(0, 800))
}

console.log('\n[2f] 本地来源防护（DSH 里的写请求不带 Origin，不能一刀切拒）')
try {
  const { checkLocalOrigin, wantsJson } = await import(pathToFileURL(join(root, 'lib', 'http.js')).href)
  const reqOf = (headers, method = 'POST', address = '127.0.0.1') => ({ socket: { remoteAddress: address }, method, headers })
  const cases = [
    ['无 Origin/Referer 的写请求放行（交给 JSON 强制）', checkLocalOrigin(reqOf({})).ok === true],
    ['非回环地址一律拒', checkLocalOrigin(reqOf({}, 'POST', '10.0.0.5')).ok === false],
    ['sec-fetch-site=cross-site 拒', checkLocalOrigin(reqOf({ 'sec-fetch-site': 'cross-site' })).ok === false],
    ['sec-fetch-site=same-site 拒', checkLocalOrigin(reqOf({ 'sec-fetch-site': 'same-site' })).ok === false],
    ['非回环 Origin 拒', checkLocalOrigin(reqOf({ origin: 'https://evil.example' })).ok === false],
    ['回环 Origin 放行', checkLocalOrigin(reqOf({ origin: 'http://127.0.0.1:64725' })).ok === true],
    ['写操作必须 JSON', wantsJson(reqOf({ 'content-type': 'text/plain' })) === false && wantsJson(reqOf({ 'content-type': 'application/json' })) === true],
  ]
  for (const [label, pass] of cases) {
    if (pass) ok(label)
    else fail(label)
  }
} catch (err) {
  fail('本地来源防护', String(err && err.stack ? err.stack : err).slice(0, 800))
}

// ── 3) client 半边 ──────────────────────────────────────────────────
console.log('\n[3/4] client 半边加载（假 __ModuleLoader__ 环境）')
try {
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  let bundle = null
  const fakeWindow = {
    __ModuleLoader__: {
      load(entry) {
        bundle = entry
      },
    },
  }
  const fakeReact = {
    // 返回轻量节点树，便于断言「渲染出了什么文本」（换行/空态）
    createElement: (type, props, ...children) => ({ type, props: Object.assign({}, props, { children }) }),
    isValidElement: (node) => Boolean(node) && typeof node === 'object' && 'type' in node && 'props' in node,
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v }),
    Fragment: 'Fragment',
  }
  const fakeRequire = (specifier) => {
    if (specifier === 'react') return fakeReact
    throw new Error(`client 只应 require('react')，实际要求：${specifier}`)
  }
  // 客户端是传统脚本（非 ESM）：用 Function 模拟宿主执行方式
  // document 要给到足够真实的壳：注入 <style> 需要 createElement / head.appendChild / getElementById
  const fakeDoc = {
    baseURI: 'http://127.0.0.1:57096/',
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '', remove() {} }),
    body: null,
  }
  const run = new Function('window', 'document', 'fetch', 'console', source)
  run(fakeWindow, fakeDoc, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, config: { mainPanel: true } }),
    text: async () => JSON.stringify({ ok: true, config: { mainPanel: true } }),
  }), console)

  if (!bundle) fail('client bundle 调用 __ModuleLoader__.load', '没有调用')
  else {
    ok('client bundle 调用 __ModuleLoader__.load', `id=${bundle.id}`)
    if (bundle.id !== 'dsh-manage-api') fail('bundle id', `期望 dsh-manage-api，实际 ${bundle.id}`)
    const clientModule = bundle.factory(fakeRequire)
    if (typeof clientModule.apply === 'function') ok('导出 apply(ctx)')
    else fail('导出 apply(ctx)', 'apply 不是函数')
    if (Array.isArray(clientModule.inject) && clientModule.inject.includes('slots')) ok('inject 含 slots')
    else fail('inject 含 slots', JSON.stringify(clientModule.inject))

    const slotCalls = []
    const fakeSlots = {
      inject(ownerKey, cb) {
        slotCalls.push(ownerKey)
        cb()
      },
      register(definition, component) {
        slotCalls.push({ definition, component })
        return () => {}
      },
    }
    const fakeClientCtx = { get: (name) => (name === 'slots' ? fakeSlots : undefined) }
    const dispose = clientModule.apply(fakeClientCtx)
    const section = slotCalls.find((c) => c && c.definition && c.definition.name === 'settings.section')
    if (section) ok('注册 settings.section', `id=${section.definition.id}, order=${section.definition.order}`)
    else fail('注册 settings.section', JSON.stringify(slotCalls.map((c) => (c && c.definition ? c.definition.name : c))))
    const chip = slotCalls.find((c) => c && c.definition && c.definition.name === 'conversation.chat.assistant-actions')
    if (chip) ok('注册 conversation.chat.assistant-actions', `id=${chip.definition.id}, order=${chip.definition.order}`)
    else fail('注册 conversation.chat.assistant-actions', JSON.stringify(slotCalls.map((c) => (c && c.definition ? c.definition.name : c))))
    const mainReg = slotCalls.find((c) => c && c.definition && c.definition.name === 'main')
    if (mainReg && mainReg.definition.key === 'manage-api') ok('注册 main 主面板', `key=${mainReg.definition.key}`)
    else fail('注册 main 主面板', JSON.stringify(slotCalls.map((c) => (c && c.definition ? c.definition.name : c))))
    const panellist = slotCalls.find((c) => c && c.definition && c.definition.name === 'sidebar.panellist')
    if (panellist && panellist.definition.id === 'manage-api') ok('注册 sidebar.panellist 图标', `id=${panellist.definition.id}, order=${panellist.definition.order}`)
    else fail('注册 sidebar.panellist 图标', JSON.stringify(slotCalls.map((c) => (c && c.definition ? c.definition.name : c))))
    if (typeof dispose === 'function') { dispose(); ok('client dispose 可调用') }

    // ── 渲染冒烟：直接用假数据调用每个子页组件，确认不抛错 ──────────
    const internals = clientModule.__internals || {}
    const fixtureState = {
      ok: true,
      source: 'daemon',
      state: {
        providers: [{ id: 'p1', name: '秋' }, { id: 'p2', name: '北辰' }],
        offers: [{ id: 'o1', providerId: 'p1', upstreamName: '秋-官转', modelKey: 'deepseek-v4.1-flash', group: 'default' }],
        ranked: [{ modelKey: 'deepseek-v4.1-flash', spreadPct: 63, providerCount: 2, rows: [
          { offerId: 'o1', providerId: 'p1', group: 'default', isCheapest: true, blendedCnyPerMtok: 0.36, ttftMs: 900, avgLatencyMs: 2200, cacheHitRate: 0.7 },
          { offerId: 'o2', providerId: 'p2', group: 'default', blendedCnyPerMtok: 0.97, ttftMs: 1200, avgLatencyMs: 2600, cacheHitRate: 0.5 }] },
          { modelKey: 'glm-5.3-flash', spreadPct: 12, providerCount: 1, rows: [] }],
        summary: { offerCount: 17, pricedCount: 17, modelCount: 7, comparableCount: 2, providerCount: 10, avgSpreadPct: 63, maxSpreadPct: 63 },
        headline: { modelKey: 'deepseek-v4.1-flash', providerName: '秋', price: 0.36, spreadPct: 63, text: '同样用 deepseek-v4.1-flash，现在选「秋」最划算' },
        siteRanking: [{ providerId: 'p1', providerName: '秋', score: 92, uptime: 0.98, avgQuality: 88, avgTtft: 900, modelCount: 7, probes: 210, weightedSamples: 40, lastAt: Date.now() }],
        scores: { o1: { offerId: 'o1', samples: 30, availability: 0.98, quality: 88, integrity: 96, cacheHitRate: 0.7, ttftMs: 900, latencyMs: 2200, confidence: 0.8, stale: false, evidenceAgeMs: 600000, lastError: '' } },
        routing: [{ id: 'r1', ts: Date.now(), model: 'deepseek-v4.1-flash', chosenProviderName: '秋', attempts: 2, outcome: 'ok', latencyMs: 2400, ttftMs: 900, failures: [{ providerName: 'wawazz', error: '连接失败：fetch failed', ms: 10480 }], candidates: [] }],
        usage: { totals: { requests: 2094, errors: 50, input: 448000000, output: 1081000, cached: 746000000, cacheCreation: 0, avgLatencyMs: 2400, avgTtftMs: 900 }, byProvider: [{ providerId: 'p1', requests: 100, input: 1000, output: 200 }], byDay: [] },
        probeTotal: 5000,
        modelIndex: [{ name: 'deepseek-v4.1-flash', sites: 2 }, { name: 'glm-5.3-flash', sites: 3 }, { name: 'gpt-4o-mini', sites: 0 }],
        settings: {
          currency: 'CNY',
          fx: { usdCny: 7.1 },
          // 路由端的忽略名单（网关/探针用）
          ignoredModels: ['gpt-4o-mini'],
          // 面板自己的忽略名单（比价/决策/自动 DSH 用），两份各走各的
          panelIgnoredModels: ['gpt-4o-mini'],
        },
      },
    }
    const fixtureHealth = {
      ok: true,
      checkedAt: new Date().toISOString(),
      daemon: { mode: 'owned', pid: 1234, port: 4319, runtimeSource: 'config', lastError: '' },
      probe: { ok: true },
      budget: { configured: false, over: false, session: { tokens: 0, calls: 0, over: false }, daily: { tokens: 448669872, requests: 2094, errors: 50 }, limits: { sessionTokens: 0, dailyTokens: 0 } },
      ingest: { pushed: 1, skipped: 0, failed: 0, lastError: '', enabled: true },
      tools: { names: ['manageapi_status', 'manageapi_models', 'manageapi_usage'], failed: [] },
      commands: { name: 'manage', registered: true },
      prompt: { at: Date.now(), text: 'ManageAPI：17 个供给 / 7 个模型' },
    }
    const cases = [
      ['OverviewTab', () => internals.OverviewTab({ health: fixtureHealth, state: fixtureState, busy: false, restart() {}, onReload() {} })],
      ['OverviewTab(daemon down+budget over)', () => internals.OverviewTab({
        health: Object.assign({}, fixtureHealth, {
          daemon: { mode: 'failed', pid: null, port: 4319, lastError: 'spawn ENOENT' },
          budget: Object.assign({}, fixtureHealth.budget, { over: true, reason: '超预算' }),
          ingest: Object.assign({}, fixtureHealth.ingest, { failed: 3 }),
        }),
        state: { ok: false, error: 'boom' }, busy: true, restart() {}, onReload() {},
      })],
      ['PricesTab', () => internals.PricesTab({ state: fixtureState })],
      ['DecisionsTab', () => internals.DecisionsTab({ state: fixtureState })],
      ['ProbesTab', () => internals.ProbesTab({ state: fixtureState })],
      ['UsageTab', () => internals.UsageTab({ state: fixtureState })],
      ['CostChip(有数据)', () => internals.CostChip({ sessionId: 'session-x' })],
      ['ManageIcon(size/active)', () => internals.ManageIcon({ size: 18, active: true })],
      ['SitesTab（站点列表）', () => internals.SitesTab({ state: fixtureState, onReload() {} })],
      ['SitesTab（空数据）', () => internals.SitesTab({ state: { ok: true, state: {} }, onReload() {} })],
      ['KeysTab（Key 列表）', () => internals.KeysTab({ state: fixtureState, onReload() {} })],
      ['SiteWizard（第 1 步）', () => internals.SiteWizard({ busy: false, onSubmit() {}, onCancel() {} })],
      ['MainPanel（中央主面板）', () => internals.MainPanel({})],      ['PanelSection（设置页分区）', () => internals.PanelSection({})],
      ...['MonitorView', 'FreeView', 'PricesView', 'DecisionView', 'ProbesView', 'GatewayView', 'UsageView', 'BenchmarkView'].map((name) => [
        name + '（真实信封）',
        () => {
          const fn = internals[name]
          if (!fn) throw new Error('缺少视图片段 ' + name)
          fn({
            api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
            health: fixtureHealth,
            state: fixtureState,
            onGoTab() {},
            onReload() {},
          })
        },
      ]),
      ['各子页空数据', () => {
        const empty = { ok: false, state: null }
        for (const key of ['OverviewTab', 'PricesTab', 'DecisionsTab', 'ProbesTab', 'UsageTab']) {
          internals[key]({ health: null, state: empty, busy: false, restart() {}, onReload() {} })
        }
      }],
    ]
    for (const [label, runCase] of cases) {
      try {
        runCase()
        ok(`渲染冒烟：${label}`)
      } catch (err) {
        fail(`渲染冒烟：${label}`, String(err && err.message ? err.message : err))
      }
    }

    // ── 左栏 tab 顺序（9 个；2026-11-02 接入页挪到第 2 位，与网页版顺序分叉）──
    try {
      const ids = (internals.TABS || []).map((t) => t.id)
      const want = ['overview', 'gateway', 'monitor', 'free', 'pricing', 'decision', 'probes', 'usage', 'benchmark']
      if (ids.join(',') === want.join(',')) ok('左栏 9 个 tab 顺序（接入页第 2）', ids.join(' '))
      else fail('左栏 tab 顺序', ids.join(','))
    } catch (err) {
      fail('左栏 tab 顺序', String(err && err.message ? err.message : err))
    }

    // ── 顶栏 tab 不带图标（用户要求：删掉标签页图标）──────────────
    try {
      const tree = internals.MainPanel()
      const all = []
      const walkAll = (n) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) { n.forEach(walkAll); return }
        if (typeof n.type === 'function') { walkAll(n.type(n.props)); return }
        all.push(n)
        if (n.props && n.props.children !== undefined) walkAll(n.props.children)
      }
      walkAll(tree)
      const nav = all.find((n) => n.props && n.props.className === 'ma-tabs')
      let svgCount = 0
      if (nav) {
        const walkSvg = (n) => {
          if (!n || typeof n !== 'object') return
          if (Array.isArray(n)) { n.forEach(walkSvg); return }
          if (typeof n.type === 'function') { walkSvg(n.type(n.props)); return }
          if (n.type === 'svg') svgCount += 1
          if (n.props && n.props.children !== undefined) walkSvg(n.props.children)
        }
        walkSvg(nav)
      }
      if (nav && svgCount === 0) ok('左栏 tab 不带图标', '0 个 svg')
      else fail('左栏 tab 不带图标', `svg=${svgCount} navFound=${Boolean(nav)}`)
    } catch (err) {
      fail('左栏 tab 不带图标', String(err && err.message ? err.message : err))
    }

    // ── 决策/探针子页必须能解出宿主信封里的快照 ────────────────────
    // 曾经这两个子页直接读 props.state（信封）而不是 envelope.state（快照），
    // 结果永远是「还没有路由记录 / 还没有探针数据」，即使 daemon 里有 40 条 routing。
    const textOf = (node) => {
      const out = []
      const walk = (n) => {
        if (n === null || n === undefined || n === false) return
        if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
        if (Array.isArray(n)) { for (const item of n) walk(item); return }
        if (typeof n === 'object' && typeof n.type === 'function') { walk(n.type(n.props)); return }
        if (typeof n === 'object' && n.props && n.props.children !== undefined) walk(n.props.children)
      }
      walk(node)
      return out.join(' ')
    }
    const envelopeCases = [
      ['决策子页解出信封里的 routing', () => internals.DecisionsTab({ state: fixtureState }), '选中站点', '还没有路由记录'],
      ['探针子页解出信封里的 scores', () => internals.ProbesTab({ state: fixtureState }), '个供给', '还没有探针数据'],
    ]
    for (const [label, render, mustHave, mustNot] of envelopeCases) {
      try {
        const text = textOf(render())
        if (text.includes(mustHave) && !text.includes(mustNot)) ok(label, `含「${mustHave}」且非空态`)
        else fail(label, text.slice(0, 140))
      } catch (err) {
        fail(label, String(err && err.message ? err.message : err))
      }
    }

    // ── 忽略模型：按钮可用 + 弹窗按厂牌分组（曾经是灰按钮，用户报「打不开」）──
    try {
      const prices = textOf(internals.PricesView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      if (prices.includes('忽略模型') && !prices.includes('忽略模型弹窗未移植')) ok('比价页有「忽略模型」入口且未标注未移植')
      else fail('比价页「忽略模型」入口', prices.slice(0, 140))
    } catch (err) {
      fail('比价页「忽略模型」入口', String(err && err.message ? err.message : err))
    }
    try {
      const modal = internals.IgnoredModelsModal({ state: fixtureState, api: { reload() {} }, onClose() {} })
      const text = textOf(modal)
      const hasTitle = text.includes('忽略模型')
      const hasVendor = text.includes('DeepSeek') && text.includes('智谱 GLM')
      const hasCount = text.includes('已忽略 1 个')
      const hasSite = text.includes('2 个站') || text.includes('3 个站')
      const hasSave = text.includes('保存')
      if (hasTitle && hasVendor && hasCount && hasSite && hasSave) ok('忽略模型弹窗按厂牌分组并标出已忽略', 'DeepSeek/智谱 GLM/已忽略 1 个')
      else fail('忽略模型弹窗渲染', text.slice(0, 160))
    } catch (err) {
      fail('忽略模型弹窗渲染', String(err && err.message ? err.message : err))
    }

    // ── 接入页不再展示 Key（用户要求：DSH 里 API Key 展示已无必要）──────
    try {
      const gw = textOf(internals.GatewayView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      const leaks = ['API Keys', 'sk-mapi', '复制完整 Key', '把 Key', '轮换']
      const hit = leaks.filter((s) => gw.includes(s))
      if (!hit.length && gw.includes('复制地址')) ok('接入页不再展示 Key', '接入地址收编 / 无 Key 文案')
      else fail('接入页不再展示 Key', 'leaks=' + hit.join(',') + ' | ' + gw.slice(0, 120))
    } catch (err) {
      fail('接入页不再展示 Key', String(err && err.message ? err.message : err))
    }

    // ── 「接入」页（原网关页，第 2 个页签）：模型接入卡自概览挪入、入口卡收编、死开关删除 ─────────────
    try {
      const overview = textOf(internals.OverviewView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      if (!overview.includes('模型接入')) ok('概览页不再有「模型接入」卡片（已挪到接入页）')
      else fail('概览页不再有「模型接入」卡片（已挪到接入页）', overview.slice(0, 140))
    } catch (err) {
      fail('概览页不再有「模型接入」卡片', String(err && err.message ? err.message : err))
    }
    try {
      const gwFixture = { ...fixtureState, state: { ...fixtureState.state, gateway: { enabled: true } } }
      const gw = textOf(internals.GatewayView({
        api: { health: fixtureHealth, state: gwFixture, reload() {} },
        health: fixtureHealth,
        state: gwFixture,
      }))
      if (gw.includes('模型接入')) ok('接入页有「模型接入」卡片')
      else fail('接入页有「模型接入」卡片', gw.slice(0, 140))
      if (gw.includes('最近请求')) ok('接入页有「最近请求」路由表')
      else fail('接入页有「最近请求」路由表', gw.slice(0, 140))
      if (gw.includes('http://127.0.0.1:4319/v1')) ok('接入地址收编进模型接入卡')
      else fail('接入地址收编进模型接入卡', gw.slice(0, 140))
      const hasToggle = gw.includes('打开网关') || gw.includes('关闭网关')
      if (hasToggle && !gw.includes('网页版（4319）打开网关')) ok('网关开关是真按钮（开/关按状态渲染，不再引导去网页版）')
      else fail('网关开关是真按钮（开/关按状态渲染，不再引导去网页版）', gw.slice(0, 160))

      // KPI 卡重组（用户 2026-11-02 指定）：概览 5 卡定序，最大价差删除；站点页移出两卡
      const ov = textOf(internals.OverviewView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      const order = ['站点', '总金额', '真实花费', '模型供给', '可横向比较']
      const pos = order.map((t) => ov.indexOf(t))
      const ordered = pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1]))
      if (ordered) ok('概览 KPI 顺序：站点→总金额→真实花费→模型供给→可横向比较', pos.join(','))
      else fail('概览 KPI 顺序', JSON.stringify({ pos, order }))
      if (!ov.includes('最大价差')) ok('概览已删「最大价差」卡（headline 已含同数）')
      else fail('概览已删「最大价差」卡', ov.slice(0, 160))

      const mv = textOf(internals.MonitorView({
        api: { health: fixtureHealth, state: fixtureState, reload() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      if (!mv.includes('总余额') && !mv.includes('真实花费') && !mv.includes('余额概览') && !mv.includes('实时流量')) ok('站点页已移出「总余额 / 真实花费 / 余额概览 / 实时流量」')
      else fail('站点页已移出「总余额 / 真实花费 / 余额概览 / 实时流量」', mv.slice(0, 160))

      // 两张运营卡（余额概览 / 实时流量）在概览页、位于「需要关注」上方
      const chartPos = ov.indexOf('余额概览')
      const flowPos = ov.indexOf('实时流量')
      const issuesPos = ov.indexOf('需要关注')
      if (chartPos >= 0 && flowPos >= 0 && issuesPos >= 0 && chartPos < issuesPos && flowPos < issuesPos) {
        ok('概览页有「余额概览 / 实时流量」，且排在需要关注之前', `chart@${chartPos} flow@${flowPos} issues@${issuesPos}`)
      } else {
        fail('概览页有「余额概览 / 实时流量」，且排在需要关注之前', JSON.stringify({ chartPos, flowPos, issuesPos }))
      }

      // 站点数口径：概览卡片与横幅都用全量 providers.length（曾误用比价汇总的
      // summary.providerCount，只算有付费供给的站，和站点页对不上）
      const srcAll = await readFile(join(root, 'lib', 'client.js'), 'utf8')
      const sitesFixed = !srcAll.includes("snap.summary.providerCount + ' 个站点'") && srcAll.includes('v: providers.length')
      if (sitesFixed) ok('概览站点数用全量 providers.length（与站点页一致）')
      else fail('概览站点数用全量 providers.length', '横幅或卡片仍在用 summary.providerCount')
      if (gw.indexOf('模型接入') >= 0 && gw.indexOf('模型接入') < gw.indexOf('最近请求')) ok('接入页顺序：模型接入在最近请求之前')
      else fail('接入页顺序：模型接入在最近请求之前', gw.slice(0, 160))
    } catch (err) {
      fail('接入页渲染', String(err && err.message ? err.message : err))
    }
    // ── 免费池独有模型的接入口径：裸名路由不到免费池，只有开关开着才以 free/ 前缀出现 ─────────────
    try {
      const rowsOff = internals.autoDshModelRows({ ok: true, state: {
        modelIndex: [{ name: 'paid-a', sites: 2 }, { name: 'free-only', sites: 1 }],
        ranked: [{ modelKey: 'paid-a' }],
        settings: {},
      } })
      const namesOff = rowsOff.map((r) => r.name).join(',')
      if (namesOff === 'paid-a') ok('免费开关关：免费池独有模型不进接入列表', namesOff)
      else fail('免费开关关的接入列表', namesOff)

      const rowsOn = internals.autoDshModelRows({ ok: true, state: {
        modelIndex: [{ name: 'paid-a', sites: 2 }, { name: 'free-only', sites: 1 }],
        ranked: [{ modelKey: 'paid-a' }],
        freePool: { relay: [{ offer: { modelKey: 'free-relay-only' } }, { offer: { upstreamName: 'free-only' } }] },
        settings: { dshFreeModels: true },
      } })
      const namesOn = rowsOn.map((r) => r.name).join(',')
      if (namesOn === 'paid-a,free/free-only,free/free-relay-only') ok('免费开关开：免费模型以 free/ 前缀列出且去重', namesOn)
      else fail('免费开关开的接入列表', namesOn)

      const rowsLegacy = internals.autoDshModelRows({ ok: true, state: {
        modelIndex: [{ name: 'any-model', sites: 1 }],
        settings: {},
      } })
      if (rowsLegacy.map((r) => r.name).join(',') === 'any-model') ok('ranked 缺失时退回裸名列表（老数据兼容）')
      else fail('ranked 缺失时的兼容行为', JSON.stringify(rowsLegacy))
    } catch (err) {
      fail('免费模型接入口径', String(err && err.message ? err.message : err))
    }
    // ── 两份忽略名单各走各的：面板只看 panelIgnoredModels，路由端名单不影响面板 ──────
    try {
      const rows = internals.autoDshModelRows({
        ok: true,
        state: {
          modelIndex: [
            { name: 'route-ignored', sites: 1 },
            { name: 'panel-ignored', sites: 1 },
            { name: 'both-ok', sites: 1 },
          ],
          ranked: [{ modelKey: 'route-ignored' }, { modelKey: 'panel-ignored' }, { modelKey: 'both-ok' }],
          settings: { ignoredModels: ['route-ignored'], panelIgnoredModels: ['panel-ignored'] },
        },
      })
      const names = rows.map((r) => r.name).sort().join(',')
      if (names === 'both-ok,route-ignored') ok('自动 DSH 只按面板名单过滤（路由端忽略的模型仍可接入）', names)
      else fail('自动 DSH 的面板忽略口径', names)

      const src = await readFile(join(root, 'lib/client.js'), 'utf8')
      const writesPanel = src.includes('panelIgnorePayload(settings, checkedNames.slice())')
      const readsPanel = (src.match(/panelIgnoreList\(/g) || []).length >= 4
      if (writesPanel && readsPanel) ok('忽略模型读写都走面板名单（不动路由端名单）', 'reads≥4 / writes panelIgnorePayload')
      else fail('忽略模型的读写口径', `writes=${writesPanel} reads=${readsPanel}`)

      // 老 daemon 没有 panelIgnoredModels → 退回路由名单，避免「点了忽略没反应」
      const legacy = { ignoredModels: ['a'] }
      const modern = { ignoredModels: ['a'], panelIgnoredModels: ['b'] }
      const legacyRead = internals.panelIgnoreList(legacy).join(',')
      const modernRead = internals.panelIgnoreList(modern).join(',')
      const legacyWrite = JSON.stringify(internals.panelIgnorePayload(legacy, ['x']))
      const modernWrite = JSON.stringify(internals.panelIgnorePayload(modern, ['x']))
      if (legacyRead === 'a' && modernRead === 'b' && legacyWrite === '{"ignoredModels":["x"]}' && modernWrite === '{"panelIgnoredModels":["x"]}')
        ok('老 daemon 兼容：无 panelIgnoredModels 时退回路由名单', `${legacyRead}/${modernRead}`)
      else fail('老 daemon 兼容', `${legacyRead}|${modernRead}|${legacyWrite}|${modernWrite}`)
    } catch (err) {
      fail('两份忽略名单分离', String(err && err.message ? err.message : err))
    }
    try {
      const free = textOf(internals.FreeView({ state: fixtureState, api: { health: fixtureHealth, reload() {} } }))
      if (free.includes('接入免费模型')) ok('免费页有「接入免费模型」开关')
      else fail('免费页有「接入免费模型」开关', free.slice(0, 140))
    } catch (err) {
      fail('免费页渲染', String(err && err.message ? err.message : err))
    }
    try {
      const card = textOf(internals.AutoDshCard({ state: fixtureState, api: { reload() {} } }))
      const showsAllowed = card.includes('deepseek-v4.1-flash') && card.includes('glm-5.3-flash')
      const showsIgnored = card.includes('gpt-4o-mini')
      if (showsAllowed && !showsIgnored) ok('自动 DSH 只列未忽略模型', '2 个可选 / 忽略的 1 个被排除')
      else fail('自动 DSH 模型过滤', `allowed=${showsAllowed} ignored=${showsIgnored} | ` + card.slice(0, 160))
    } catch (err) {
      fail('自动 DSH 模型过滤', String(err && err.message ? err.message : err))
    }
    // 长模型名不能被省略号吃掉：名字用 auto-dsh-name（可换行断词），不能复用带 ellipsis 的 .mono
    try {
      const card = internals.AutoDshCard({ state: fixtureState, api: { reload() {} } })
      const names = []
      const walk = (node) => {
        if (!node) return
        if (Array.isArray(node)) {
          node.forEach(walk)
          return
        }
        if (typeof node !== 'object') return
        if (node.props && typeof node.props.className === 'string' && node.props.className.includes('auto-dsh-name')) {
          const kids = node.props.children
          names.push(Array.isArray(kids) ? kids.join('') : String(kids == null ? '' : kids))
        }
        if (node.props) walk(node.props.children)
      }
      walk(card)
      const longOk = names.some((name) => name === 'deepseek-v4.1-flash')
      const cssSource = await readFile(join(root, 'lib', 'client.js'), 'utf8')
      const noEllipsis = /'\.ma-root \.auto-dsh-name\{[^']*white-space:normal/.test(cssSource)
      if (longOk && noEllipsis && names.every((name) => name.trim().length > 0)) ok('自动 DSH 长模型名完整显示', 'auto-dsh-name 可换行，不用 .mono 省略号')
      else fail('自动 DSH 长模型名显示', JSON.stringify({ names, noEllipsis }))
    } catch (err) {
      fail('自动 DSH 长模型名显示', String(err && err.message ? err.message : err))
    }
    // 接入失败要能看见原因：错误进 msg-line.is-err，成功进 msg-line.is-ok
    try {
      const src = await readFile(join(root, 'lib', 'client.js'), 'utf8')
      const hasErr = /msg-line ' \+ \(msg\.kind === 'err' \? 'is-err' : 'is-ok'\)/.test(src)
      const errBg = /\.auto-dsh-card \.msg-line\.is-err\{/.test(src)
      if (hasErr && errBg) ok('自动 DSH 失败原因可见', 'msg-line.is-err + role=alert')
      else fail('自动 DSH 失败提示', '缺少 is-err 渲染或样式')
    } catch (err) {
      fail('自动 DSH 失败提示', String(err && err.message ? err.message : err))
    }
  }
} catch (err) {
  fail('client 半边加载', String(err && err.stack ? err.stack : err).slice(0, 800))
}

// ── 4) package.json 自洽 ────────────────────────────────────────────
console.log('\n[3b/4] client 与 host 的 API 前缀一致性')
try {
  const clientSource = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const routesSource = await readFile(join(root, 'lib', 'routes.js'), 'utf8')
  const hostPrefix = (routesSource.match(/const PREFIX = '([^']+)'/) || [])[1] || ''
  const clientPrefix = (clientSource.match(/var API_PREFIX = '([^']+)'/) || [])[1] || ''
  if (hostPrefix && clientPrefix && hostPrefix === '/api/' + clientPrefix) {
    ok('client API 前缀与 host 路由一致', hostPrefix + " <- API_PREFIX='" + clientPrefix + "'")
  } else {
    fail('client API 前缀与 host 路由一致', 'host=' + hostPrefix + ' client=' + clientPrefix)
  }
} catch (err) {
  fail('client API 前缀一致性检查', String(err && err.message ? err.message : err))
}

// ── 第一批解锁的写通道钉死（2026-11-02 独立化）──────────────────
try {
  const src = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  const hasPricingWrite = src.includes("writeOp('PATCH', '/api/offers/'") && src.includes('function pricingSaveOffer')
  if (hasPricingWrite) ok('比价页改价已接入写通道（PATCH /api/offers/:id）')
  else fail('比价页改价已接入写通道', '缺 pricingSaveOffer 或 offers PATCH')

  const hasDecisionOrder = src.includes("writeOp('PUT', '/api/decisions/'") && src.includes('function saveOrder')
  if (hasDecisionOrder) ok('决策页手动排序已接入写通道（PUT order）')
  else fail('决策页手动排序已接入写通道', '缺 saveOrder 或 decisions PUT')

  const hasFxRefresh = src.includes("path: '/api/fx/refresh'") && src.includes('fxAuto: true')
  if (hasFxRefresh) ok('汇率刷新与恢复自动已接入（POST /api/fx/refresh + fxAuto）')
  else fail('汇率刷新与恢复自动已接入', '缺 fx/refresh 调用')

  const hasLogin = src.includes('function MonitorLoginForm') && src.includes('confirmUnknown: true') && src.includes('needConfirm')
  if (hasLogin) ok('站点卡登录表单已移植（双协议 + needConfirm 确认）')
  else fail('站点卡登录表单已移植', '缺 MonitorLoginForm 或 needConfirm 流程')

  const staleTexts = ['PRICING_READONLY_TITLE', 'DECISION_ORDER_TITLE', '不支持跨页跳转', '改价请到 daemon 网页版', '还没移植登录表单']
  const stale = staleTexts.filter((t) => src.includes(t))
  if (!stale.length) ok('过期只读文案已清理', staleTexts.join(' / '))
  else fail('过期只读文案已清理', '仍残留：' + stale.join(' / '))

  // 第三批：站点落价工具集
  const batch3 = [
    ['apply-group', "writeOp('POST', '/api/providers/' + encodeURIComponent(providerId) + '/apply-group'"],
    ['group-ratio', "writeOp('POST', '/api/providers/' + encodeURIComponent(providerId) + '/group-ratio'"],
    ['restore-ratio', "'/restore-ratio'"],
    ['detect-groups', "'/detect-groups'"],
    ['duplicate', "'/duplicate'"],
    ['free-quota', "'/free-quota'"],
    ['reorder', "writeOp('POST', '/api/providers/reorder'"],
  ]
  const missing = batch3.filter((pair) => !src.includes(pair[1]))
  if (!missing.length) ok('站点落价工具集已接通（应用分组/改倍率/恢复/识别/复制/配额/排序）')
  else fail('站点落价工具集已接通', '缺：' + missing.map((m) => m[0]).join(' / '))
  const hasPickPane = src.includes('function MonitorGroupPickPane') && src.includes("fetchJson('providers/'")
  if (hasPickPane) ok('应用分组窗格（GET groups 读代理 + POST apply-group）')
  else fail('应用分组窗格', '缺 MonitorGroupPickPane 或 groups 读取')

  // 第四批：基准价与免费平台
  const batch4 = [
    ['基准价编辑', "writeOp('PUT', '/api/benchmarks'"],
    ['基准价删除', "writeOp('DELETE', '/api/benchmarks/'"],
    ['从站导入', "runBenchImport('import')"],
    ['内置参考价', "runBenchImport('seed')"],
    ['广场导入', "runBenchImport('plaza')"],
    ['免费平台连接', "'/connect'"],
    ['免费平台签到', "'/checkin'"],
    ['免费平台刷新', "'/refresh'"],
    ['免费平台诊断', "'/diagnose'"],
    ['免费平台删除', "writeOp('DELETE', '/api/free/platforms/'"],
    ['免费账号管理', "writeOp('DELETE', '/api/free/accounts/'"],
    ['手动建平台', 'function FreeManualForm'],
  ]
  const missing4 = batch4.filter((pair) => !src.includes(pair[1]))
  if (!missing4.length) ok('基准价与免费平台写通道已接通（编辑/删除/三导入/连接/签到/刷新/诊断/删除/账号）')
  else fail('基准价与免费平台写通道已接通', '缺：' + missing4.map((m) => m[0]).join(' / '))
  const stale4 = src.includes('BENCH_LOCKED') || src.includes('FREE_LOCKED') || src.includes('freeManualForm')
  if (!stale4) ok('基准价与免费页的过期锁定文案已清理')
  else fail('基准价与免费页的过期锁定文案已清理', '仍残留 BENCH_LOCKED / FREE_LOCKED / freeManualForm')
} catch (err) {
  fail('第一批写通道断言', String(err && err.message ? err.message : err))
}



console.log('\n[4/4] package.json 自洽')
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (pkg.name === 'dsh-manage-api') ok('name = dsh-manage-api')
  else fail('name', pkg.name)
  if (pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch) ok('dsh.bundle.patch 存在')
  else fail('dsh.bundle.patch', '缺失')
  if (pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web') ok('dsh.client.platform = web')
  else fail('dsh.client.platform', JSON.stringify(pkg.dsh && pkg.dsh.client))
  if (pkg.exports && pkg.exports['.'] && pkg.exports['./client']) ok('exports 暴露 . 与 ./client')
  else fail('exports', '缺少 . 或 ./client')

  const targets = [pkg.main, pkg.exports['.'], pkg.exports['./client'], pkg.dsh.bundle.patch, 'locale/zh.json', 'locale/en.json', 'icon.svg']
  for (const target of targets) {
    if (!target) continue
    const path = target.startsWith('./') ? target.slice(2) : target
    if (await exists(join(root, path))) ok(`文件存在：${path}`)
    else fail(`文件存在：${path}`, '缺失')
  }
} catch (err) {
  fail('package.json 自检', String(err && err.message ? err.message : err))
}

// ── 3c) 前端数据层的四条不变量（评审 P0-2 / D3 的回归护栏）───────────
console.log('\n[3c/4] 前端数据层不变量')
try {
  const clientSource = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  if (/timeoutMs/.test(clientSource) && /clearTimeout\(/.test(clientSource) && /请求超时/.test(clientSource)) {
    ok('fetchJson 带超时兜底', 'AbortSignal 不可用时 setTimeout({timeoutMs}) 拉闸')
  } else {
    fail('fetchJson 带超时兜底', '未见 timeoutMs/clearTimeout/超时文案')
  }

  if (/非 JSON 响应/.test(clientSource) && /JSON\.parse\(text\)/.test(clientSource)) {
    ok('fetchJson 区分「非 JSON 文本」与「JSON 解析失败」', '不把 HTML 错误页吞成 ok:true')
  } else {
    fail('fetchJson 区分非 JSON 文本', '缺少专门文案')
  }

  if (/epochRef/.test(clientSource) && /answeredRef/.test(clientSource) && /setError\(/.test(clientSource)) {
    ok('useApi 有竞态守卫与错误状态', 'epoch 比对 + answered/error 进返回值')
  } else {
    fail('useApi 竞态守卫/错误状态', '未见 epochRef/isCurrent/setError')
  }

  if (/epoch === epochRef\.current\) setBusy\(false\)/.test(clientSource)) {
    ok('Promise 回调不再直接收尾 busy', '收尾前比对 epoch，过期响应直接丢弃')
  } else {
    fail('Promise 回调收尾', '仍存在无 guard 的 setBusy(false)')
  }
} catch (err) {
  fail('前端数据层不变量', String(err && err.message ? err.message : err))
}

// ── 结果 ────────────────────────────────────────────────────────────
console.log('')
if (failures.length) {
  console.error(`✗ ${failures.length} 项失败：`)
  for (const item of failures) console.error('  - ' + item)
  process.exit(1)
}
console.log(`✓ 全部通过（${checks.length} 项）`)
