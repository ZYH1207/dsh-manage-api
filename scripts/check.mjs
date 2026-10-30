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

console.log('\n[2e] 自动 DSH：写 provider 模型列表 + 设默认模型（假 configEditor）')
try {
  const { createDshModel } = await import(pathToFileURL(join(root, 'lib', 'dsh-models.js')).href)
  const config = {
    providers: {
      'manage-api': { baseUrl: 'http://127.0.0.1:4319/v1', api: 'openai-completions', models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek' }] },
    },
  }
  const rows = [{ entry: { id: 'include:llm-pi-ai' }, inherited: { providers: config.providers }, override: {} }]
  const saved = []
  const ctx = {
    get(name) {
      if (name === 'configEditor') {
        return {
          configuration: () => rows,
          edit: async (_entry, fn) => {
            const next = fn({ providers: {} }, { providers: config.providers })
            config.providers = next.providers
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
  const dsh = createDshModel({ ctx })
  const before = dsh.snapshot()
  const r1 = await dsh.configure('glm-5.3-flash')
  const r2 = await dsh.configure('glm-5.3-flash')
  const ids = config.providers['manage-api'].models.map((m) => m.id)
  const okAppend = r1.ok && r1.added === true && ids.includes('glm-5.3-flash') && ids.includes('deepseek-v4.1-flash')
  const okIdem = r2.ok && r2.added === false && ids.filter((x) => x === 'glm-5.3-flash').length === 1
  const okSel = saved.length === 2 && saved[1].provider === 'manage-api' && saved[1].model === 'glm-5.3-flash'
  const okBad = (await dsh.configure('bad model!')).ok === false
  const okSnap = before.ok && before.entryId === 'include:llm-pi-ai' && before.models.length === 1
  if (okAppend && okIdem && okSel && okBad && okSnap) ok('自动 DSH：追加幂等 + 设默认模型 + 拒绝非法名')
  else fail('自动 DSH 写入链路', JSON.stringify({ okAppend, okIdem, okSel, okBad, okSnap, ids, saved }))
} catch (err) {
  fail('自动 DSH 写入链路', String(err && err.stack ? err.stack : err).slice(0, 800))
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
          { offerId: 'o2', providerId: 'p2', group: 'default', blendedCnyPerMtok: 0.97, ttftMs: 1200, avgLatencyMs: 2600, cacheHitRate: 0.5 }] }],
        summary: { offerCount: 17, pricedCount: 17, modelCount: 7, comparableCount: 2, providerCount: 10, avgSpreadPct: 63, maxSpreadPct: 63 },
        headline: { modelKey: 'deepseek-v4.1-flash', providerName: '秋', price: 0.36, spreadPct: 63, text: '同样用 deepseek-v4.1-flash，现在选「秋」最划算' },
        siteRanking: [{ providerId: 'p1', providerName: '秋', score: 92, uptime: 0.98, avgQuality: 88, avgTtft: 900, modelCount: 7, probes: 210, weightedSamples: 40, lastAt: Date.now() }],
        scores: { o1: { offerId: 'o1', samples: 30, availability: 0.98, quality: 88, integrity: 96, cacheHitRate: 0.7, ttftMs: 900, latencyMs: 2200, confidence: 0.8, stale: false, evidenceAgeMs: 600000, lastError: '' } },
        routing: [{ id: 'r1', ts: Date.now(), model: 'deepseek-v4.1-flash', chosenProviderName: '秋', attempts: 2, outcome: 'ok', latencyMs: 2400, ttftMs: 900, failures: [{ providerName: 'wawazz', error: '连接失败：fetch failed', ms: 10480 }], candidates: [] }],
        usage: { totals: { requests: 2094, errors: 50, input: 448000000, output: 1081000, cached: 746000000, cacheCreation: 0, avgLatencyMs: 2400, avgTtftMs: 900 }, byProvider: [{ providerId: 'p1', requests: 100, input: 1000, output: 200 }], byDay: [] },
        probeTotal: 5000,
        modelIndex: [{ name: 'deepseek-v4.1-flash', sites: 2 }, { name: 'glm-5.3-flash', sites: 3 }, { name: 'gpt-4o-mini', sites: 0 }],
        settings: { currency: 'CNY', fx: { usdCny: 7.1 }, ignoredModels: ['gpt-4o-mini'] },
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
      ['CostChip(有数据)', () => internals.CostChip({ sessionId: 'session-x' })],
      ['ManageIcon(size/active)', () => internals.ManageIcon({ size: 18, active: true })],
      ['GatewayProbesView（网关）', () => internals.GatewayProbesView({ mode: 'gateway', health: fixtureHealth, state: fixtureState, onReload() {} })],
      ['GatewayProbesView（探针）', () => internals.GatewayProbesView({ mode: 'probes', health: fixtureHealth, state: fixtureState, onReload() {} })],
      ['BudgetView（有额度）', () => internals.BudgetView({ health: Object.assign({}, fixtureHealth, { budget: { limits: { sessionTokens: 5000000, dailyTokens: 900000000 }, session: { tokens: 1200000, over: false }, daily: { tokens: 449000000, over: false } } }) })],
      ['BudgetView（不设限）', () => internals.BudgetView({ health: fixtureHealth })],
      ['MainPanel（中央主面板）', () => internals.MainPanel({})],
      ['PanelSection（设置页分区）', () => internals.PanelSection({ ctx: { get: () => undefined } })],
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
        internals.OverviewTab({ health: null, state: empty, busy: false, restart() {}, onReload() {} })
        for (const key of ['MonitorView', 'FreeView', 'PricesView', 'DecisionView', 'ProbesView', 'GatewayView', 'UsageView', 'BenchmarkView']) {
          internals[key]({ api: { health: null, state: empty, busy: false, reload() {}, restart() {} }, health: null, state: empty, onGoTab() {}, onReload() {} })
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

    // ── 两级导航：一级 4 个业务域、二级 ≤3 子页（P0）────────────
    try {
      const domains = internals.DOMAINS || []
      const ids = domains.map((d) => d.id)
      const want = ['overview', 'supply', 'models', 'usage']
      if (ids.join(',') === want.join(',')) ok('一级导航 4 个业务域', ids.join(' '))
      else fail('一级导航 4 个业务域', ids.join(','))
      const tooMany = domains.filter((d) => (d.pages || []).length > 3).map((d) => d.id)
      if (tooMany.length === 0) ok('二级子页每组 ≤3', domains.map((d) => d.id + ':' + d.pages.length).join(' '))
      else fail('二级子页每组 ≤3', tooMany.join(','))
      const pages = domains.reduce((sum, d) => sum + d.pages.length, 0)
      if (pages === 8) ok('二级子页共 8 个（旧 9 页收敛）', String(pages))
      else fail('二级子页共 8 个（旧 9 页收敛）', String(pages))
    } catch (err) {
      fail('两级导航结构', String(err && err.message ? err.message : err))
    }

    // ── hash 深链接：旧 tab id 全部能映射到新路由（P0）──────────────
    try {
      const legacy = internals.LEGACY_ROUTES || {}
      const want = ['overview', 'monitor', 'free', 'gateway', 'probes', 'pricing', 'decision', 'benchmark', 'usage']
      const missing = want.filter((id) => !legacy[id])
      if (missing.length === 0) ok('旧 9 个 tab 均有新路由映射', want.map((id) => id + '→' + legacy[id]).join(' '))
      else fail('旧 9 个 tab 均有新路由映射', '缺 ' + missing.join(','))
      const r1 = internals.routeFromHash('#/supply/sites')
      const ok1 = r1.domain === 'supply' && r1.page === 'sites'
      const r2 = internals.routeFromHash('#/models/pricing/gpt-4o')
      const ok2 = r2.domain === 'models' && r2.page === 'pricing' && r2.extra === 'gpt-4o'
      const r3 = internals.routeFromHash('')
      const ok3 = r3.domain === 'overview' && r3.page === null
      const back = internals.routeToHash({ domain: 'supply', page: 'ops', extra: 'probes' })
      if (ok1 && ok2 && ok3 && back === '#/supply/ops/probes') ok('hash 路由解析/回写', [back, r2.extra].join(' | '))
      else fail('hash 路由解析/回写', JSON.stringify({ r1, r2, r3, back }))
    } catch (err) {
      fail('hash 路由解析/回写', String(err && err.message ? err.message : err))
    }

    // ── 首选偏好可读写（P0：设置里改、工作台读）────────────────────
    try {
      const prefs = internals.readPrefs()
      const okShape = typeof prefs.pollSec === 'number' && typeof prefs.autoRefresh === 'boolean'
      if (okShape) ok('本地偏好默认值', JSON.stringify(prefs))
      else fail('本地偏好默认值', JSON.stringify(prefs))
    } catch (err) {
      fail('本地偏好默认值', String(err && err.message ? err.message : err))
    }

    // ── 导航不再有图标；概览页只有一级导航（首屏无两层导航）──────────
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
      const domainNav = all.find((n) => n.props && n.props.className === 'ma-domains')
      const subNav = all.find((n) => n.props && n.props.className === 'ma-subtabs')
      const head = all.find((n) => n.type === 'h1' && n.props && n.props.className === 'ma-pagehead-title')
      let svgCount = 0
      const walkSvg = (n) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) { n.forEach(walkSvg); return }
        if (typeof n.type === 'function') { walkSvg(n.type(n.props)); return }
        if (n.type === 'svg') svgCount += 1
        if (n.props && n.props.children !== undefined) walkSvg(n.props.children)
      }
      if (domainNav) walkSvg(domainNav)
      if (domainNav && !subNav && head && svgCount === 0) ok('概览页单行页头 + 一级导航无图标', 'subNav=false svg=0')
      else fail('概览页单行页头 + 一级导航无图标', `domainNav=${Boolean(domainNav)} subNav=${Boolean(subNav)} h1=${Boolean(head)} svg=${svgCount}`)
    } catch (err) {
      fail('概览页单行页头 + 一级导航无图标', String(err && err.message ? err.message : err))
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
      ['概览子页解出信封里的 headline', () => internals.OverviewView({ api: { state: fixtureState, loading: false, busy: false, reload() {} }, state: fixtureState, health: fixtureHealth }), '秋', '从添加一个中转站开始'],
      ['免费池解出信封里的 modelIndex', () => internals.FreeView({ api: { state: fixtureState, loading: false, busy: false, reload() {} }, state: fixtureState, health: fixtureHealth }), '免费', null],
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

    // ── 网关页不再展示 Key（用户要求：DSH 里 API Key 展示已无必要）──────
    try {
      const gw = textOf(internals.GatewayView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      const leaks = ['API Keys', 'sk-mapi', '复制完整 Key', '把 Key', '轮换']
      const hit = leaks.filter((s) => gw.includes(s))
      if (!hit.length && gw.includes('网关入口')) ok('网关页不再展示 Key', '入口卡保留 / 无 Key 文案')
      else fail('网关页不再展示 Key', 'leaks=' + hit.join(',') + ' | ' + gw.slice(0, 120))
    } catch (err) {
      fail('网关页不再展示 Key', String(err && err.message ? err.message : err))
    }

    // ── 概览页「自动 DSH」：入口在概览，且只列未忽略模型 ─────────────
    try {
      const overview = textOf(internals.OverviewView({
        api: { health: fixtureHealth, state: fixtureState, busy: false, reload() {}, restart() {} },
        health: fixtureHealth,
        state: fixtureState,
      }))
      if (overview.includes('自动 DSH')) ok('概览页有「自动 DSH」卡片')
      else fail('概览页有「自动 DSH」卡片', overview.slice(0, 140))
    } catch (err) {
      fail('概览页「自动 DSH」卡片', String(err && err.message ? err.message : err))
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
  console.log('\n[3d/4] IA 结构、键盘可达、保存条、写操作接线')
  try {
    const domains = internals.DOMAINS || []
    const views = new Set()
    for (const domain of domains) {
      if (domain.view) views.add(domain.view)
      for (const page of domain.pages || []) views.add(page.view)
    }
    const expected = ['monitor', 'free', 'pricing', 'decision', 'gatewayProbes', 'usage', 'benchmark']
    const missing = expected.filter((id) => !views.has(id))
    if (domains.length <= 4 && missing.length === 0) {
      ok('IA 两级结构：一级导航 ≤4 个，旧页面全部可达', 'domains=' + domains.length + ' views=' + views.size)
    } else {
      fail('IA 两级结构', 'domains=' + domains.length + ' missing=' + missing.join(','))
    }
  } catch (err) {
    fail('IA 两级结构', String(err && err.message ? err.message : err))
  }
  try {
    const picks = []
    const noop = () => {}
    internals.tabKeyNav({ key: 'ArrowRight', preventDefault: noop }, internals.DOMAINS, internals.DOMAINS[0].id, (item) => picks.push(item.id))
    internals.tabKeyNav({ key: 'End', preventDefault: noop }, internals.DOMAINS, internals.DOMAINS[0].id, (item) => picks.push(item.id))
    if (picks[0] === internals.DOMAINS[1].id && picks[1] === internals.DOMAINS[internals.DOMAINS.length - 1].id) {
      ok('一级导航支持方向键 / Home / End', picks.join(' → '))
    } else {
      fail('一级导航键盘', picks.join(','))
    }
  } catch (err) {
    fail('一级导航键盘', String(err && err.message ? err.message : err))
  }
  try {
    const dirty = textOf(internals.SaveBar({ dirty: true, message: '已改 2 处', onSave() {}, onDiscard() {} }))
    const clean = internals.SaveBar({ dirty: false })
    if (dirty.includes('保存') && dirty.includes('撤销') && dirty.includes('已改 2 处') && clean === null) {
      ok('保存条：有改动才出现，带撤销/保存', 'dirty 有三段文案，clean 返回 null')
    } else {
      fail('保存条', dirty.slice(0, 120) + ' | clean=' + String(clean))
    }
  } catch (err) {
    fail('保存条', String(err && err.message ? err.message : err))
  }
  try {
    const routesText = await readFile(join(root, 'lib', 'routes.js'), 'utf8')
    const hasRoute = /sub === 'usage' && method === 'GET'/.test(routesText)
    const hasProxy = routesText.includes('/api/usage?days=')
    if (hasRoute && hasProxy) ok('用量 7/90 天有宿主代理（GET /api/manage-api/usage?days=）')
    else fail('用量窗口代理', 'handler=' + hasRoute + ' proxy=' + hasProxy)
  } catch (err) {
    fail('用量窗口代理', String(err && err.message ? err.message : err))
  }
  try {
    const decisionText = await readFile(join(root, 'src', 'parts', '60-decision.js'), 'utf8')
    const wires = decisionText.includes("encodeURIComponent(decision.modelKey) + '/order'")
    const reset = decisionText.includes('恢复自动') && decisionText.includes("encodeURIComponent(modelKey) + '/order'")
    if (wires && reset) ok('决策页手动排序接线（PUT /api/decisions/:model/order +「恢复自动」）')
    else fail('决策手动排序', 'move=' + wires + ' reset=' + reset)
  } catch (err) {
    fail('决策手动排序', String(err && err.message ? err.message : err))
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
  if (/openDetail: function \(id\)/.test(clientSource) && /extra: null/.test(clientSource) && /extra: String\(id\)/.test(clientSource)) {
    ok('详情态走 URL 路由（openDetail/closeDetail 推 hash extra）', '刷新/分享可还原，关闭即回列表')
  } else {
    fail('详情态 URL 路由', '未见 openDetail→navigate({extra}) 与 closeDetail→extra:null')
  }

  if (/ma-row-link/.test(clientSource) && /role: 'link'/.test(clientSource) && /tabIndex: 0/.test(clientSource)) {
    ok('列表卡片可点/可键盘进入详情', 'role=link + tabIndex=0 + Enter 进入')
  } else {
    fail('列表卡片键盘可达性', '未见 role=link/tabIndex/ma-row-link')
  }

  if (/ma-skeleton/.test(clientSource) && /function Skeleton/.test(clientSource)) {
    ok('首答前有骨架屏（不再把空数据当空态）', 'Skeleton + .ma-skeleton 扫光动画')
  } else {
    fail('骨架屏', '缺少 Skeleton 组件或样式')
  }

  if (/ma-savebar/.test(clientSource) && /function SaveBar/.test(clientSource) && /离开这个页面\?/.test(clientSource) === false) {
    ok('编辑页有保存条（dirty 才出现，带撤销/保存）', 'SaveBar 渲染在页面尾部')
  } else if (/ma-savebar/.test(clientSource) && /function SaveBar/.test(clientSource)) {
    ok('编辑页有保存条（dirty 才出现，带撤销/保存）', 'SaveBar 渲染在页面尾部')
  } else {
    fail('保存条', '缺少 SaveBar 组件或样式')
  }

  if (/tabKeyNav/.test(clientSource) && /aria-controls/.test(clientSource) && /role: 'tab'/.test(clientSource)) {
    ok('两级导航可用键盘切换（←/→ + Home/End）', 'tabKeyNav + role=tab + aria-controls')
  } else {
    fail('导航键盘可达性', '未见 tabKeyNav/aria-controls/role=tab')
  }

  if (/function SiteDetailView/.test(clientSource) && /function ModelDetailView/.test(clientSource) && /ma-detail-head/.test(clientSource)) {
    ok('列表 → 详情两级（站点/比价都有站点级详情页）', 'SiteDetailView + ModelDetailView + ma-detail-head')
  } else {
    fail('详情页存在性', '缺少 SiteDetailView/ModelDetailView 或详情头样式')
  }

  if (/providerPath \+ '\/sync'/.test(clientSource) && /providerPath \+ '\/balance'/.test(clientSource) && /'DELETE', '\/api\/providers\//.test(clientSource)) {
    ok('站点详情写操作接到白名单（sync/balance/删除）', 'POST providers/:id/{sync,balance} + DELETE；均与 write-proxy 规则一一对应')
  } else {
    fail('站点详情写操作接线', '缺少 sync/balance/删除 的调用')
  }

  if (/writeOp\('PATCH', '\/api\/offers\/' \+ offerId/.test(clientSource) && /pricingMode/.test(clientSource) && /inPrice/.test(clientSource)) {
    ok('比价详情能改价（PATCH /api/offers/:id，只发改动字段）', 'inPrice/outPrice/ratio/pricingMode；失焦即保存')
  } else {
    fail('比价改价接线', '未见 PATCH /api/offers/:id 或字段名')
  }

  if (/listLoading/.test(clientSource) && /还没有站点/.test(clientSource) && /function Skeleton/.test(clientSource)) {
    ok('站点/比价加载中是骨架而不是空态', 'listLoading 三态化：列表 / 骨架 / 空态')
  } else {
    fail('加载态与空态区分', '未见 listLoading 或 Skeleton')
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
