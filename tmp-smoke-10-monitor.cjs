// 假环境 smoke：把 10-monitor.js 当成函数体求值，用 mock 的 h/React/格式化/Empty/Icon 渲染一次。
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'src', 'parts', '10-monitor.js')
const src = fs.readFileSync(FILE, 'utf8')

let hookCalls = 0
const effectRuns = []

const React = {
  useState(init) {
    hookCalls += 1
    return [typeof init === 'function' ? init() : init, function () {}]
  },
  useMemo(fn) {
    hookCalls += 1
    return fn()
  },
  useEffect(fn) {
    hookCalls += 1
    effectRuns.push(fn)
    return undefined
  },
  useCallback(fn) {
    return fn
  },
  useRef(v) {
    return { current: v }
  },
}

const writes = []

function h(tag, props, ...children) {
  const flat = []
  const push = (c) => {
    if (Array.isArray(c)) c.forEach(push)
    else if (c !== null && c !== undefined && c !== false && c !== true) flat.push(c)
  }
  push(children)
  return { tag, props: props || {}, children: flat }
}

const KIND_LABEL = { 'new-api': 'NewAPI', 'one-api': 'OneAPI', sub2api: 'Sub2API', vendor: '厂商直连', unknown: '' }
const fmtMoney = (v, d) => '¥' + Number(v).toFixed(d === undefined ? 2 : d)
const fmtCompact = (v) => String(v)
const fmtInt = (v) => String(Math.round(v))
const fmtRate = (v) => (Number(v) * 100).toFixed(1) + '%'
const fmtPct = (v) => Number(v).toFixed(1) + '%'
const fmtMs = (v) => String(v) + 'ms'
const fmtTime = (ts) => String(ts)
const pickState = (props) => (props && props.state && props.state.state) || {}

function Icon(name, opts) {
  return h('svg', { 'data-icon': name, width: (opts && opts.size) || 14 })
}

function Empty(props) {
  return h('div', { className: 'empty' }, h('h3', null, props.title), props.desc, props.action)
}

function writeOp(method, url, payload) {
  writes.push({ method, url, payload })
  return Promise.resolve({ ok: true, status: 200, summary: { provider: { id: 'p_new', name: '新站' } } })
}

const factory = new Function(
  'h',
  'React',
  'Icon',
  'Empty',
  'KIND_LABEL',
  'fmtMoney',
  'fmtCompact',
  'fmtInt',
  'fmtRate',
  'fmtPct',
  'fmtMs',
  'fmtTime',
  'pickState',
  'writeOp',
  src + '\n;return { MonitorView: MonitorView }',
)

const mod = factory(h, React, Icon, Empty, KIND_LABEL, fmtMoney, fmtCompact, fmtInt, fmtRate, fmtPct, fmtMs, fmtTime, pickState, writeOp)

// ── 一棵完整的假快照（字段对齐真实 daemon state）────────────────
const now = Date.now()
const iso = (msAgo) => new Date(now - msAgo).toISOString()

const fakeState = {
  ok: true,
  source: 'state',
  at: iso(0),
  state: {
    settings: { fxUsdCny: 7.2, monitorIntervalMinutes: 30, balanceWarnUsd: 1.5, defaultUnitPrice: 1, balanceWarnCny: null },
    providers: [
      {
        id: 'p_1',
        name: '秋',
        baseUrl: 'https://api.qiudd.example/v1',
        siteUrl: 'https://qiudd.example',
        kind: 'sub2api',
        note: '',
        sortOrder: 1,
        hasAdminToken: true,
        adminTokenTail: 'P6NltA',
        tokenStatus: 'ok',
        tokenStatusAt: iso(3600e3),
        quotaRemaining: 6.999,
        currency: 'USD',
        quotaUpdatedAt: iso(1800e3),
        unitPrice: 1,
        paused: false,
        freeModels: ['free-1', 'free-2'],
      },
      {
        id: 'p_2',
        name: '凌风',
        baseUrl: 'https://lf.example/v1',
        siteUrl: '',
        kind: 'new-api',
        hasAdminToken: false,
        tokenStatus: 'invalid',
        tokenStatusMessage: '登录态过期',
        quotaRemaining: null,
        currency: 'CNY',
        quotaUpdatedAt: null,
        paused: true,
        freeModels: [],
      },
      {
        id: 'p_3',
        name: '空站点',
        baseUrl: '',
        siteUrl: '',
        kind: 'unknown',
        hasAdminToken: false,
        tokenStatus: null,
        quotaRemaining: 0.2,
        currency: 'USD',
        quotaUpdatedAt: iso(90000e3),
        paused: false,
        freeModels: [],
      },
    ],
    credentials: [
      { id: 'c_1', providerId: 'p_1', label: '国模', group: '[GM2]国模高稳高缓分组', tail: 'b103', expiresAt: null },
      { id: 'c_2', providerId: 'p_1', label: '默认', group: '', tail: '9a01', expiresAt: null },
    ],
    offers: [
      { id: 'o_1', providerId: 'p_1', credentialId: 'c_1', upstreamName: 'deepseek-v4.1-flash', modelKey: 'deepseek', group: '国模', inPrice: 0.19, outPrice: 0.19, ratio: 0.4 },
      { id: 'o_2', providerId: 'p_1', credentialId: 'c_2', upstreamName: 'glm-5', modelKey: 'glm', group: '默认分组', inPrice: null, outPrice: null, ratio: null },
      { id: 'o_3', providerId: 'p_3', credentialId: null, upstreamName: 'x', modelKey: 'x', group: '', inPrice: 1, outPrice: 1, siteRatio: 1.2 },
    ],
    siteRanking: [
      { providerId: 'p_1', providerName: '秋', score: 86.4, uptime: 0.98, avgQuality: 0.9, avgTtft: 1200, modelCount: 12, probes: 320, weightedSamples: 44, lastAt: iso(600e3) },
      { providerId: 'p_2', providerName: '凌风', score: 51, uptime: 0.5, avgQuality: 0.6, avgTtft: 4300, modelCount: 3, probes: 12, weightedSamples: 4, lastAt: null },
    ],
    scores: { o_1: { offerId: 'o_1', samples: 10, quality: null, ttftMs: 900, stale: false } },
    routing: [
      {
        id: 'r_1',
        ts: iso(20e3),
        model: 'deepseek-v4.1-flash',
        chosenProviderId: 'p_1',
        chosenProviderName: '秋',
        outcome: 'ok',
        attempts: 1,
        latencyMs: 2100,
        ttftMs: 900,
        usage: { prompt: 100, completion: 10, total_tokens: 110 },
        keyName: '国模',
        failures: [],
      },
      {
        id: 'r_2',
        ts: iso(90e3),
        model: 'glm-5',
        chosenProviderId: null,
        chosenProviderName: '',
        outcome: 'all-failed',
        attempts: 2,
        latencyMs: 8000,
        ttftMs: 0,
        failures: [{ error: 'ECONNRESET' }],
      },
    ],
    usage: {
      days: ['2026-07-01', '2026-07-02'],
      totals: { requests: 2658, errors: 50, input: 460208704, output: 1473533, cached: 788693262, avgLatencyMs: 23564, avgTtftMs: 17137 },
      byDay: {},
      byProvider: {},
      byModel: {},
      byKey: {},
    },
    summary: { offerCount: 3, providerCount: 3 },
    headline: { modelKey: 'deepseek', providerName: '秋', price: 0.19, spreadPct: 80 },
    probeTotal: 5000,
    gateway: { enabled: true, keys: [{ id: 'k1', name: 'x', key: 'sk-MUST-NOT-RENDER', enabled: true }] },
  },
}

// 30 天的按天数据
const byDay = {}
for (let i = 29; i >= 0; i -= 1) {
  const d = new Date(now - i * 86400e3)
  const k = d.toISOString().slice(0, 10)
  byDay[k] = { requests: 100 + i * 7, errors: 1, input: 1e7 + i * 1e5, output: 5e4, cached: 3e7, avgTtftMs: 8000 + i * 120, avgLatencyMs: 15000 }
}
fakeState.state.usage.byDay = byDay
fakeState.state.usage.days = Object.keys(byDay)

// ── 渲染 + 走树 ────────────────────────────────────────────────
let nodes = 0
const seenClasses = new Set()
const handlers = []

function walk(node, depth) {
  if (depth > 60) throw new Error('递归过深')
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, depth + 1))
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    if (String(node).indexOf('MUST-NOT-RENDER') >= 0) throw new Error('泄漏了 gateway 明文 key！')
    return
  }
  if (typeof node !== 'object') return
  nodes += 1
  if (typeof node.tag === 'function') {
    const props = Object.assign({}, node.props)
    if (node.children.length) props.children = node.children.length === 1 ? node.children[0] : node.children
    walk(node.tag(props), depth + 1)
    return
  }
  if (node.tag === 'svg') {
    if (node.props['data-icon'] && !node.props['data-icon'].trim()) throw new Error('空图标名')
  }
  const cls = node.props && node.props.className
  if (typeof cls === 'string') cls.split(/\s+/).filter(Boolean).forEach((c) => seenClasses.add(c))
  const props = node.props || {}
  ;['onClick', 'onChange', 'onBlur', 'onKeyDown', 'onMouseEnter', 'onMouseLeave'].forEach((k) => {
    if (typeof props[k] === 'function') handlers.push({ tag: node.tag, key: k, fn: props[k], cls })
  })
  if (node.tag === 'a') {
    if (!props.href) throw new Error('a 没有 href')
  }
  if (node.tag === 'input' && props.type === 'search' && typeof props.value !== 'string') {
    throw new Error('搜索框 value 不是字符串')
  }
  node.children.forEach((c) => walk(c, depth + 1))
}

function render(label, props) {
  const out = mod.MonitorView(props)
  nodes = 0
  seenClasses.clear()
  handlers.length = 0
  walk(out, 0)
  console.log('  [' + label + '] ok · ' + nodes + ' 节点 · ' + seenClasses.size + ' class · ' + handlers.length + ' handler')
  return out
}

console.log('smoke: 全量数据')
render('full', { api: {}, state: fakeState })

// KPI / 站点卡 / 图表 / 流量 / 告警 / 排名 / 路由表 都该出现
const required = [
  'monitor-kpi',
  'stat',
  'stat-main',
  'monitor-cols',
  'monitor-cols--overview',
  'monitor-flow-card',
  'monitor-flow-list',
  'monitor-flow-row',
  'monitor-flow-top',
  'monitor-flow-key',
  'monitor-flow-meta',
  'chart',
  'chart-wrap',
  'grid-line',
  'axis-label',
  'spend-bar',
  'chart-legend',
  'sites-section',
  'sites-head',
  'sites-bar',
  'site-pager',
  'site-cards',
  'sites-actions',
  'sync-panel',
  'prov-card',
  'prov-head',
  'prov-id',
  'prov-tiles',
  'prov-tiles--3',
  'prov-groups',
  'prov-group-chips',
  'group-chip',
  'prov-actions',
  'monitor-feed-card',
  'monitor-feed-row',
  'monitor-feed-body',
  'monitor-feed-title',
  'monitor-feed-meta',
  'table-wrap',
]
const missing = required.filter((c) => !seenClasses.has(c))
if (missing.length) throw new Error('缺少 class：' + missing.join(', '))
console.log('  class 覆盖 ok（' + required.length + ' 个关键 class 全在）')

// ── 交互：把 handler 全按一遍（写操作走 writeOp 桩）─────────────
let fired = 0
handlers.slice().forEach((x) => {
  try {
    const ev = {
      target: { value: '1', blur() {}, checked: true },
      key: 'Enter',
      preventDefault() {},
      stopPropagation() {},
    }
    x.fn(ev)
    fired += 1
  } catch (e) {
    throw new Error('handler ' + x.key + ' on <' + x.tag + '> 抛错：' + e.message)
  }
})
console.log('  交互 handler 全触发 ok（' + fired + ' 个）')

// 空快照 / 残缺快照都不能崩
console.log('smoke: 空数据')
render('empty-state', { api: {}, state: { ok: true, state: {} } })
render('empty-envelope', { api: {}, state: null })
render('offline', { api: {}, state: { ok: false, source: 'route', at: '', state: {} } })
render('partial', {
  api: {},
  state: {
    ok: true,
    state: {
      providers: [{ id: 'p_x', name: '怪站点' }],
      routing: [{}],
      siteRanking: [{}],
      usage: null,
      settings: null,
      offers: 'nope',
      credentials: null,
    },
  },
})

setTimeout(() => {
  // 写操作走 Promise 链，微任务跑完再看
  if (writes.length === 0) throw new Error('没有触发任何 writeOp（说明按钮都是死的）')
  console.log('  writeOp 调用：' + writes.map((w) => w.method + ' ' + w.url).join(' · '))
  console.log('smoke OK · hooks 调用 ' + hookCalls + ' 次 · effect ' + effectRuns.length + ' 个')
  console.log('          （effect 未执行，直接调用组件时 React 不会跑 effect）')
}, 20)
