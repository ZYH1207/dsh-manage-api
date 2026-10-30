// 用真实 daemon 快照冒烟渲染各个视图（只在开发机用，不进包）
// 用法：node tools/_smoke_live.mjs [guiPort]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:http'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = process.argv[2] || process.env.DSH_GUI_PORT || '59887'

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const req = get({ host: '127.0.0.1', port: Number(port), path, timeout: 8000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (text += c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) })
        } catch (err) {
          reject(new Error('非 JSON：' + text.slice(0, 120)))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

const health = (await fetchJson('/api/manage-api/health')).body
const state = (await fetchJson('/api/manage-api/state?light=1')).body
console.log('health ok:', Boolean(health && health.ok), '| state snapshot keys:', Object.keys(state.state || {}).length)

const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
let bundle = null
const fakeWindow = { __ModuleLoader__: { load: (entry) => (bundle = entry) } }
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: Object.assign({}, props, { children }) }),
  isValidElement: (node) => Boolean(node) && typeof node === 'object' && 'type' in node && 'props' in node,
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
}
const fakeDocument = {
  baseURI: 'http://127.0.0.1:' + port + '/',
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', appendChild() {}, remove() {} }),
  head: { appendChild() {} },
  documentElement: {},
}
const fakeFetch = async () => ({ ok: true, status: 200, text: async () => '{}' })
const factory = new Function('window', 'document', 'fetch', 'console', source)
factory(fakeWindow, fakeDocument, fakeFetch, { log() {}, warn() {}, error() {} })
const clientModule = bundle.factory((name) => (name === 'react' ? fakeReact : {}))

const internals = (clientModule && clientModule.__internals) || {}
const props = {
  api: { health, state, busy: false, reload() {}, restart() {} },
  health,
  state,
  onGoTab() {},
  onReload() {},
  busy: false,
}

const textOf = (node) => {
  const out = []
  const walk = (n) => {
    if (n === null || n === undefined || n === false) return
    if (typeof n === 'string' || typeof n === 'number') return void out.push(String(n))
    if (Array.isArray(n)) return n.forEach(walk)
    if (typeof n === 'object' && typeof n.type === 'function') return walk(n.type(n.props))
    if (typeof n === 'object' && n.props && n.props.children !== undefined) walk(n.props.children)
  }
  walk(node)
  return out.join(' ')
}

const names = ['OverviewView', 'MonitorView', 'FreeView', 'PricesView', 'DecisionView', 'ProbesView', 'GatewayView', 'UsageView', 'BenchmarkView']
let bad = 0
for (const name of names) {
  const fn = internals[name]
  if (!fn) {
    console.log('— ' + name + '：片段缺失')
    continue
  }
  try {
    const node = fn(props)
    const text = textOf(node).replace(/\s+/g, ' ').trim()
    console.log('✓ ' + name + '：' + text.slice(0, 150))
  } catch (err) {
    bad += 1
    console.log('✗ ' + name + '：' + (err && err.message))
    console.log('   ' + String(err && err.stack).split('\n').slice(0, 3).join('\n   '))
  }
}
process.exit(bad ? 1 : 0)
