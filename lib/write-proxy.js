/**
 * 白名单写代理：客户端只发 `{ method, path, payload }`，插件按白名单转发到 daemon。
 *
 * ## 为什么要白名单，而不是通用反代
 *
 * daemon 有 51 条写路由（删站点、改设置、导入基准价、网关 key 轮换……）。如果插件
 * 做一个「什么都能转」的反代，等于把 daemon 的整个管理面暴露成插件路由——而插件路由
 * **不受宿主 `/api` 网关鉴权保护**（见 `http.js` 文件头）。所以这里只放行第一版面板真正
 * 需要的那几条，其余一律 403；以后要加，就在 WRITE_RULES 里加一行，意图明确。
 *
 * ## 三条硬约束
 *
 * 1. **只认 method + path 完全匹配**：不接受 query（避免 `?full=0` 之类绕过裁剪）、
 *    不接受 `..`；
 * 2. **响应必须瘦**：daemon 的写接口多数 `return buildState()`（实测 416KB），
 *    原样回给浏览器既慢又把明文网关 Key 带进渲染进程；这里只挑小字段回传
 *    （sync / loginResult / provider 摘要），其余让客户端写完再拉 `/state?light=1`；
 * 3. **失败原样透传**：daemon 的中文提示（「站点名称不能为空」「该 API 端点已存在」）
 *    是给用户看的，不要包装成英文。
 */

import { daemonSend } from './daemon.js'

/** 允许转发的写操作表。默认拒绝：不在表里的一律 403。 */
const WRITE_RULES = [
  { name: '新增站点', method: 'POST', pattern: /^\/api\/providers$/ },
  { name: '修改站点', method: 'PATCH', pattern: /^\/api\/providers\/[\w-]+$/ },
  { name: '删除站点', method: 'DELETE', pattern: /^\/api\/providers\/[\w-]+$/ },
  { name: '同步模型', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/sync$/ },
  { name: '识别系别', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/detect-kind$/ },
  { name: '查余额', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/balance$/ },
  { name: '查用量', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/usage-check$/ },
  { name: '账号登录', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/login$/ },
  { name: '新增 Key', method: 'POST', pattern: /^\/api\/credentials$/ },
  { name: '删除 Key', method: 'DELETE', pattern: /^\/api\/credentials\/[\w-]+$/ },
  { name: '改设置', method: 'PATCH', pattern: /^\/api\/settings$/ },
  { name: '跑探针', method: 'POST', pattern: /^\/api\/probes\/run$/ },
  // 站点页的「立即同步」与告警/公告已读（daemon 侧是 POST，会真的去站点拉余额账单）
  { name: '同步余额账单', method: 'POST', pattern: /^\/api\/monitor\/collect$/ },
  { name: '告警标已读', method: 'POST', pattern: /^\/api\/monitor\/alerts\/read$/ },
  { name: '公告标已读', method: 'POST', pattern: /^\/api\/monitor\/announcements\/read$/ },
  // P3.2：比价页改价/忽略模型、决策页上下移、汇率刷新
  { name: '改供给价格', method: 'PATCH', pattern: /^\/api\/offers\/[\w-]+$/ },
  { name: '决策排序', method: 'PUT', pattern: /^\/api\/decisions\/[\w.\/-]+\/order$/ },
  { name: '刷新汇率', method: 'POST', pattern: /^\/api\/fx\/refresh$/ },
  // DSH 接入页的网关开关（2026-11-02 独立化放开：开关低危，关掉只影响本机调用；
  // Key 的增删轮换仍不开放——插件按 v3 决策不展示、不接触 Key）
  { name: '网关开关', method: 'PATCH', pattern: /^\/api\/gateway$/ },
  // DSH 站点卡落价工具集（2026-11-02 独立化第三批）：与网页版同一批写操作
  { name: '应用分组', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/apply-group$/ },
  { name: '改分组倍率', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/group-ratio$/ },
  { name: '恢复站点倍率', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/restore-ratio$/ },
  { name: '识别分组', method: 'POST', pattern: /^\/api\/providers\/[\w-]+\/detect-groups$/ },
  { name: '复制供给', method: 'POST', pattern: /^\/api\/offers\/[\w-]+\/duplicate$/ },
  { name: '免费额度', method: 'POST', pattern: /^\/api\/offers\/[\w-]+\/free-quota$/ },
  { name: '站点排序', method: 'POST', pattern: /^\/api\/providers\/reorder$/ },
]

/**
 * 判断一个写操作是否在白名单里。
 * @param {string} method
 * @param {string} path 必须是不带 query 的 daemon 侧路径（`/api/...`）
 * @returns {{ name: string, method: string, pattern: RegExp } | null}
 */
export function resolveWrite(method, path) {
  const verb = String(method || '').toUpperCase()
  const target = String(path || '')
  if (!target.startsWith('/api/')) return null
  if (target.includes('..') || target.includes('?') || target.includes('#')) return null
  for (const rule of WRITE_RULES) {
    if (rule.method === verb && rule.pattern.test(target)) return rule
  }
  return null
}

/** 从 daemon 响应里挑出值得回传的小字段（其余一律丢掉）。 */
const SMALL_KEYS = ['sync', 'loginResult', 'groupRatioResult', 'needConfirm', 'groupResult']

/**
 * @param {any} body daemon 的 JSON 响应
 * @param {any} payload 我们发出去的请求体（用来定位新建的站点）
 */
export function summarizeWrite(body, payload) {
  const summary = {}
  if (!body || typeof body !== 'object') return summary
  for (const key of SMALL_KEYS) {
    if (body[key] !== undefined) summary[key] = body[key]
  }
  // 新建站点：响应是全量 state，按名字反查刚建的那条，回传 id 供客户端立即同步模型
  if (payload && typeof payload.name === 'string' && payload.name.trim() && Array.isArray(body.providers)) {
    const hit = [...body.providers].reverse().find((p) => p && p.name === payload.name.trim())
    if (hit) {
      summary.provider = { id: hit.id, name: hit.name, kind: hit.kind || 'unknown', baseUrl: hit.baseUrl || null }
    }
  }
  if (Array.isArray(body.providers)) summary.providers = body.providers.length
  if (Array.isArray(body.offers)) summary.offers = body.offers.length
  return summary
}

/**
 * 执行一条白名单写操作。
 *
 * @param {{ port: number, method: string, path: string, payload: unknown, log?: (...a: any[]) => void, timeoutMs?: number }} input
 * @returns {Promise<{ ok: boolean, status: number, action?: string, summary?: any, error?: string }>}
 */
export async function runWrite({ port, method, path, payload, log, timeoutMs = 20_000 }) {
  const rule = resolveWrite(method, path)
  if (!rule) {
    return { ok: false, status: 403, error: `不在写白名单：${String(method).toUpperCase()} ${path}` }
  }
  const result = await daemonSend(port, rule.method, path, payload, timeoutMs)
  if (!result.ok) {
    if (typeof log === 'function') log(`写操作失败（${rule.name} ${path}）：${result.error}`)
    return { ok: false, status: result.status || 502, error: result.error || 'daemon 拒绝了这次操作' }
  }
  return { ok: true, status: result.status, action: rule.name, summary: summarizeWrite(result.body, payload) }
}

export { WRITE_RULES }
