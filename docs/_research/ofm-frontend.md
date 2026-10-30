# dsh-our-free-model 前端逻辑剖析（v2.1.0）

- 分析对象：`C:\Users\ZYH\Desktop\新建文件夹\dsh-our-free-model-extract\package`
- 前端主体：`client.js`（6162 行，461 674 B，**未压缩**，可读手写源码）+ `locale/{zh,en}.json` + `icon.svg`
- 宿主交叉验证：`index.js`（2373 行路由表）、`src/push.js`（SSE hub）
- 全文行号均相对上述 `package/` 根目录；只读剖析，未改动任何源码。
- 行宽统计：均值 73.9 字符，最长行 9851 字符（`client.js:3648`，`BRAND_ICON` 内联 base64 JPEG）→ 排除 SVGO/压缩可能，确认是人类手写。

## 0. 结论速览

| 维度 | 结论 | 关键证据 |
| --- | --- | --- |
| 数据获取 | **双通道**：同源 REST 拉取（唯一 `fetch` 封装）+ 一条全局 SSE；另有 10 处 `setInterval` 轮询、1 处 cordis RPC | `client.js:2157`、`client.js:5991`、`client.js:2250/2871/3101/3285/3368/3811/3867/4145/4466/5576` |
| 状态管理 | **无集中 store**：`createContext`=0、`useSyncExternalStore`=0；`useState` 96 次，靠 props 下传 + 两个自研 loader hook + `window` CustomEvent 广播 | `client.js:2261`、`client.js:4698`、`client.js:6026/6037/6042/6047/4151` |
| 竞态保护 | 仅"闭包 alive + 单点 generation 序号"，无请求序号、无取消语义 → 手动 reload 可被慢响应覆盖 | `client.js:2264-2268`、`client.js:3743/3781-3796` |
| 设计令牌 | `var(--dsw-*)` 共 **367 处 / 11 个令牌**，`var(--sys-color-*)` **0 处**；CSS 单段 864 行为一个 `<style>` 注入 | `client.js:1281-2144`、`client.js:5964-5970` |
| 可访问性 | `aria-*` 属性共 **61 次（56 行）**，`role` 15 次，`tabIndex` 1 次，`aria-live` **0 次** | §7 计数表 |
| 最大缺陷 | ① 轮询无 visibility 暂停 ② toast 无 live region ③ 危险动作（rotate key / update·apply）零确认 ④ `useAsync.reload` 返回的 cleanup 被丢弃 ⑤ tab 上 `aria-selected` 重复键 | §6、§7、§5、§2、`client.js:5685-5686` |

`client.js` 是手写 ModuleLoader bundle（无构建步骤、仅依赖 shell 提供的 `react` / `react-dom`）：

```js
// client.js:21
window.__ModuleLoader__.load({
  id: 'dsh-our-free-model',
  factory: require => { … }
```

---

## 1. 数据获取与推送

### 1.1 唯一的 HTTP 封装

全文件只有 **1 次** `fetch(` 调用，且被包在一个 8 s 超时兜底的 `api()` 里：

```js
// client.js:2166-2170
const { timeout = 8000, ...fetchOptions } = options ?? {}
const ctrl = new AbortController()
const timer = setTimeout(() => ctrl.abort(), timeout)
const response = await fetch(`${API}${path}`, { ...fetchOptions, redirect: 'error', signal: ctrl.signal })
```

- **base URL 用相对解析**，不用 origin-absolute（反代子路径部署会 404，见 `client.js:2146-2154` 注释与 #54）：
  `const API = (() => { try { return new URL('api/our-free-model', document.baseURI).pathname } catch { return '/api/our-free-model' } })()`（`client.js:2152-2154`）
- 错误归一：非 2xx 一律 `throw new Error(payload?.error ?? \`HTTP ${response.status}\`)`（`client.js:2174`），不做错误码分类。
- 超时是**唯一**的 AbortController 用途（全文 `AbortController` 仅 2 次：`client.js:2167`、`client.js:3708`），不用于"新请求取消旧请求"。
- `post()` 是薄封装（`client.js:2181-2186`），慢路由按调用点显式放宽 timeout：`/bench` 240 s（`client.js:5600`）、`/update/apply` 600 s（`client.js:3573`）、`/refresh`·`/reprobe` 600 s（`client.js:5659/5663`）、`/eac/status` 20 s（`client.js:5572`）。

### 1.2 端点清单（前端实际调用，共 21 个 GET + 21 个 POST）

| 方法 | 端点 | 调用点 | 备注 / 体积量级（估算） |
| --- | --- | --- | --- |
| GET | `/summary` | `client.js:5565`、`6129` | **最大单文档**：catalog（每模型含 `detail`/`ttftMs`/`latencyMs`/`budgets` 阶梯，`index.js:2336-2351`）+ settings + forward/egress + update + announcements；N 模型 × ~0.6–1 KB → 量级 **10–60 KB** |
| GET | `/stats` | `client.js:5566`、`3101` | 日聚合 + 每模型 token 总和，供热力图（119 格）与趋势；量级 10–40 KB |
| GET | `/pool` | `client.js:2856` | EAC 池容量，30 s 轮询 |
| GET | `/eac/status` | `client.js:2961`、`5572` | 20 s 超时，60 s 轮询 |
| GET | `/announcement` | `client.js:6124` | onboarding 的 ack 位（最小文档） |
| GET | `/announcements` | `client.js:3469`、`5988` | 列表 + `notifyOs` |
| GET | `/meta` | `client.js:6064` | `reloadedAt` / `version` / `reloadCount` |
| GET | `/update/status` | `client.js:3550` | 升级状态 |
| GET | `/outlet` | `client.js:3363` | egress 出口，15 s 轮询 |
| GET | `/providers` | `client.js:5051` | 聚合车道 provider 注册表 |
| GET | `/combos` | `client.js:5486` | 备用链 |
| GET | `/token-saver` + `/local-optimize` | `client.js:5170` | 一个 `Promise.all` 两请求 |
| GET | `/clients`、`/chan-gateway`、`/chan-gateway/key` | `client.js:4542/4549/4562` | 局域网网关 |
| GET | `/forward/key`、`/forward/lan/key`、`/forward/lan/addresses` | `client.js:3250/3270/3281` | 转发密钥与 LAN 地址 |
| GET | `/egress/url` | `client.js:3357` | |
| POST | `/settings` | `client.js:3501`、`5586` | **唯一写开关的入口**（`apply(patch)`） |
| POST | `/refresh`、`/reprobe` | `client.js:5659/5663` | 600 s，"一键探测" |
| POST | `/bench` | `client.js:5600` | 240 s，单模型测速 |
| POST | `/providers` `|` `/providers/remove` `|` `/providers/test` `|` `/providers/discover` | `client.js:4927/4932/4999/4941/4945` | 聚合车道 CRUD |
| POST | `/combos` | `client.js:5505`、`5512` | 覆盖式写入（整表提交） |
| POST | `/token-saver`、`/local-optimize` | `client.js:5189/5196` | patch 语义 |
| POST | `/update/check`、`/update/apply`、`/reload` | `client.js:3568/3573/3625` | 600 s / 热重载 |
| POST | `/forward/rotate`、`/forward/lan/rotate`、`/chan-gateway/apply`、`/chan-gateway/rotate` | `client.js:3313/3340/4559/4637` | 密钥轮换 |
| POST | `/eac/login/start`、`/eac/login/cancel`、`/eac/logout` | `client.js:3036/3015/3048` | 交互登录 |
| POST | `/announcements/ack`、`/announcements/refresh`、`/announcement/ack?version=` | `client.js:3489/3493/5852`、`6020` | ack 带版本号（幂等语义） |

宿主侧路由一一对应：`index.js:1738-2010`（`/summary` 1738、`/stats` 1741、`/providers` 1748、`/eac/login/poll` 1808、`/update/apply` 1872、`/settings` 1896、`/refresh` 1958、`/chan-gateway/apply` 1978 …），前缀注册在 `index.js:1428`，SSE 精确路由在 `index.js:1432`（精确路由优先于前缀，见 `index.js:1429-1431` 注释）。

### 1.3 第二条数据通道：cordis RPC（不走 HTTP）

渠道页 / 看板 / 日志页要的账号、模型、积分、token 账本来源是 **RPC**，不是上面那些 REST 路由：

```js
// client.js:3706-3714
const rpc = async (method, payload, timeoutMs = 60_000) => {
  if (connection?.rpc?.call === undefined) throw new Error('no-connection')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const result = await connection.rpc.call('/api', 'channel-pack', { method, payload }, controller.signal)
  if (result?.ok === true) return result.value
```

- `ctx.connection` 缺失时降级为 `ctx.get('connection')`（`client.js:3703-3705`），仍缺失则 `available:false`，页面渲染"网关不可用"而非崩溃（`client.js:3717`、`4483`）。
- RPC 方法名：`provider.status`（`4127`）、`account.list`（`3760`）、`usage.tokenLedger`（`4309`，`limit:400`）、`usage.tokenLedgerHistory`（`4310`，`sinceDays:90`）。

### 1.4 SSE：一条全局 EventSource

整个插件表面只有 **1 条** EventSource，挂在 `apply()` 的 `ctx.effect` 里，生命周期跟插件（不是跟页面）：

```js
// client.js:5991
source = new EventSource(`${API}/events`)
```

- 服务端：`src/push.js:47-62` `attach()` 写 `text/event-stream; charset=utf-8` + `cache-control: no-cache, no-transform` + `x-accel-buffering: no`，25 s 一次 `: ping` 心跳（`src/push.js:19`、`31-38`），按 `req.on('close')` 摘除；`dispose()` 关闭全部（`src/push.js:96-102`）。
- 4 个事件：`announcements`（`client.js:6009`）、`update`（`6028`）、`upgraded`（`6039`）、`hello`（`6044`）。
- 收到事件后**双路分发**：直接 `showToast` / `showUrgentModal`，并 `window.dispatchEvent(new CustomEvent('ofm:…'))`（`client.js:6026/6037/6042/6047`）给已挂载面板自取。
- **重连策略是本文件最讲究的一段**（注释解释了为什么计数器必须在 `open()` 之外）：

```js
// client.js:5998-6007
source.onerror = () => {
  errCount += 1
  if (errCount < 5) return
  try { source.close() } catch { }
  if (disposed || retryTimer !== undefined) return
  retryTimer = setTimeout(() => { retryTimer = undefined; open() }, Math.min(30_000 * 2 ** retries, 300_000))
  retries += 1
}
```

即：默认让浏览器自愈，连续失败 ≥5 次才主动关闭让出连接池，再按 30 s→60 s→…→封顶 5 min 指数退避重开。`client.js:5985-5987` 记录了反面教训："计数器若在 `open()` 里会被清零，退避就永远是第一档"。

### 1.5 轮询全表（10 处 `setInterval`）

| # | 位置 | 周期 | 条件 | 拉什么 |
| --- | --- | --- | --- | --- |
| 1 | `client.js:2250` | 1000 ms | 无（**常驻**） | `hostShown()` 安全网轮询 |
| 2 | `client.js:2871` | 30 000 ms | 组件挂载 | `/pool` |
| 3 | `client.js:3101` | 60 000 ms | 组件挂载 | `/stats`（看板近实时） |
| 4 | `client.js:3285` | 15 000 ms | `lan.running === true` | `/forward/lan/addresses` |
| 5 | `client.js:3368` | 15 000 ms | `egress.active === true` | `/outlet` |
| 6 | `client.js:3811` | 90 000 ms | 该渠道支持积分 | RPC `credits` |
| 7 | `client.js:3867` | 2500 ms | 登录 pending 中 | `/eac/login/poll`（串行，见 §2） |
| 8 | `client.js:4145` | 45 000 ms | `available` | RPC `provider.status`（13 渠道批量） |
| 9 | `client.js:4466` | 10 000 ms | 用户手动开 `auto` | token 账本 |
| 10 | `client.js:5576` | 60 000 ms | 组件挂载 | `/eac/status`（20 s 超时） |

另有一处"完成后才排下一次"的 setTimeout 自调度：`client.js:3003-3005`（EAC 登录轮询），注释明确"慢响应不得产生重叠采集者"。

**缺口**：全文 `visibilitychange` / `document.hidden` / `visibilityState` 命中 **0 次** → 切到后台标签页后 10 个定时器照常跑（`/stats` 60 s、`provider.status` 45 s、`/pool` 30 s 都在耗宿主 CPU 与探测配额）。

### 1.6 缓存 / 增量 / 版本号

- **无 ETag、无 `If-None-Match`、无 `Last-Modified`、无增量游标**：客户端 `api()` 不读响应头（`client.js:2171` 只 `await response.text()`），宿主侧统一 `cache-control: no-store`（`index.js:1731`）。
- 实测佐证：直接 `curl` 三个端点均被信任围栏挡回（`index.js:1728-1736` 的 `rejectionFor`），返回 `HTTP 401 24B {"error":"unauthorized"}` → 也说明**响应体积无法在未授权状态下测量**，上表体积为按 payload 构造代码的估算。
- 唯一近似"版本号"的两处：
  - `summary.announcementVersion`（`index.js:2356`）→ 拼进 ack 的 query（`client.js:5852`），实现"改文案才重新公告一次"；
  - `/meta.reloadedAt`（`client.js:6064-6070`）→ 与 `localStorage['ofm.reloadedAt']` 比对，热重载后只弹一次提示。
- 因此**刷新语义是"整树重取"**：任何写操作成功都 `summary.reload(); stats.reload()`（`client.js:5587`、`5659`、`5663`）。

---

## 2. 状态管理

### 2.1 没有集中 store，只有三层拼装

| 手段 | 计数 | 位置 |
| --- | --- | --- |
| `createContext` | **0** | — |
| `useSyncExternalStore` | **0** | — |
| `useState` | 96 | 各页局部 |
| `useEffect` | 37 | — |
| `useRef` | 14 | 竞态/串行守卫 |
| `useCallback` | 16 | 多为了让 `setInterval` 依赖稳定 |
| `useMemo` | 8 | 见 §6 |

数据流是**单向 props 下传**，`Shell` 一次性把 14 个字段喂给 9 个页面：

```js
// client.js:5638
const { t, data, counts, summary, stats, eacAuth, setEacAuth, eacLogin, busy, setBusy, apply, bench, benches, ctx } = props
```

页面切换是 `tab === 'x' ? h(Page…) : …` 的九分支三元链（`client.js:5693-5709`）——**没有路由、没有 keep-alive，切页即卸载重挂**（这也是各页 `useEffect` 必须自己清理的原因）。

### 2.2 两个自研 loader hook（真正的"store"）

`useAsync`（只读、整树替换）与 `usePanel`（可 patch、写后不回读）分工很明确：

```js
// client.js:2261-2272
function useAsync(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: '' })
  const run = useCallback(() => {
    let alive = true
    setState(current => ({ ...current, status: 'loading' }))
    loader().then(data => { if (alive) setState({ status: 'ready', data, error: '' }) })
      .catch(error => { if (alive) setState({ status: 'error', data: undefined, error: String(error?.message ?? error) }) })
    return () => { alive = false }
  }, deps)
  useEffect(() => run(), [run])
  return { ...state, reload: run }
}
```

`usePanel`（`client.js:4698-4718`）额外做三件事，并在 `client.js:4690-4697` 写明了设计理由：

1. **首答才出骨架**：`status: current.data === undefined ? 'loading' : 'ready'`（`4702`）——写后 reload 不塌回骨架；
2. **写后不回读**：POST 的应答即宿主落库状态，由调用方 `patch()` 合并（`4714-4716`）；
3. **错误不清数据**：有旧数据时保持 `status:'ready'` 只带 `error`（`4707-4709`），页面不会闪成错误页。

### 2.3 跨组件通信：`window` CustomEvent，不是 store

| 事件 | 派发点 | 订阅方 |
| --- | --- | --- |
| `ofm:announcements` | `client.js:6026` | NewsPanel |
| `ofm:update` | `client.js:6037` | UpgradePanel（`client.js:3556` 起监听） |
| `ofm:upgraded` | `client.js:6042` | UpgradePanel |
| `ofm:hello` | `client.js:6047` | 面板刷新 |
| `ofm:channels` | `client.js:4151` | 渠道页内部同步 |

`useChannelRpc(ctx)` 用 `useMemo` 造"每 ctx 一个实例"的 RPC 句柄（`client.js:3700-3718`），是全文唯一近似"单例服务"的写法。

### 2.4 竞态保护（本节的实质结论）

**做到了的：**

- **闭包 `alive` + effect cleanup**：37 个 `useEffect` 里绝大多数有 `let alive = true` + `return () => { alive = false }`；`deps` 变化时 React 会跑上一次的 cleanup，因此"deps 驱动的重取"是安全的（`client.js:2264-2268`、`4701-4711`）。
- **单点请求序号**：只有余额一处用了 generation 号，且做得完整——

```js
// client.js:3781-3796
const generation = ++balanceGeneration.current
…
if (generation === balanceGeneration.current) setBalances(value?.accounts ?? [])
…
if (balancePending.current === request) balancePending.current = null
```

卸载时还会自增作废在途请求：`return () => { balanceGeneration.current++; balancePending.current = null }`（`client.js:3804`）。
- **请求去重 / 串行化**：`claimPending`（`3744`，领积分）、`modelBatchPending`（`3739`，批量开关模型）、`balancePending`（`3742`）三个 `useRef` 布尔/句柄守卫；EAC 登录用"完成后才排下一次"保证不重叠（`client.js:2968-2970`、`3003`）。
- **卸载安全**：`clearInterval` / `clearTimeout` / `removeEventListener` 全部有成对清理（如 `client.js:2255`、`2872`、`5577`、`5887`）。

**没做到的（可直接列为改进项）：**

1. **手动 `reload()` 无卸载/覆盖保护**：`run` 返回的 cleanup 只在 `useEffect(() => run(), [run])`（`2261-2272`、`4713`）里被 React 接住；用户点"重试""刷新"时调用的 `summary.reload()`（`5611`、`5659`）**丢弃了返回的 cleanup**，于是既不阻止卸载后 `setState`，也无法取消在途请求。
2. **无请求序号**：两次 `reload()` 并发时，先发后到的响应会覆盖新响应（除余额那一处外全无 `generation`）。
3. **AbortController 只做超时，不做取消**：`api()` 的 `ctrl` 不暴露给调用方（`client.js:2167`），组件卸载不会 abort 任何 fetch。
4. **无 `dedupe` 层**：同页 `/summary` 与 `/stats` 分别打（`5565-5566`），`/announcements` 在 `5988` 与 `3469` 各打一次。

---

## 3. 模型选择 UI 逻辑

### 3.1 列表从哪来、怎么排序过滤

排序与"可用性"判定**全在宿主完成**，前端只做展示与分组：

- `index.js:2336-2351` 逐模型算 `availability` / `detail` / `probedAt` / `ttftMs` / `budgets`（思考档位阶梯）/ `route`（`our-free-model` | `our-free-model-region` | `null`）。
- 前端分组在 `Roster`（`client.js:2765-2798`）：按 `route` 拆 available / region-blocked 两组，且 **unavailable 不再单独成组**（`2772-2775`、`2792-2793` 注释："用户要求移除「不在选择器中」区块"，状态改由统计芯片与卡片徽章呈现）。
- 可用性标记直接映射 CSS 类与文案键：`h('span', { className: 'ofm_badge ' + m.availability }, t(\`state.${m.availability}\`))`（`client.js:2737`），不可用卡片降透明 `dim`（`2729`）。
- 另一处排序：onboarding 第二页把 `route === null` 的模型排到最后（`client.js:5929`），理由是"新用户第一眼不该看到被拒绝的 id"。

### 3.2 搜索（仅一处）

**只有备用链编辑器里的成员选择器有搜索框**，其余列表无搜索：

```js
// client.js:5313-5316
const needle = query.trim().toLowerCase()
const rows = models
  .filter(row => needle === '' || `${row.id} ${row.name}`.toLowerCase().includes(needle))
  .slice(0, 60)
```

- 大小写不敏感；匹配 `id` + `name` 两字段拼接（避免跨字段误匹配）；**硬截断 60 条**且无"还有 N 条"提示。
- 空结果 → `t('routing.noModel')`（`client.js:5324`）。
- 行内带车道标签与 vision 标记（`5333-5334`），选中态用 `aria-pressed`（`5327`）。

### 3.3 切换模型 / 持久化 / 回写

**没有"默认模型选择器"这类控件**——本插件不改宿主模型选择器（`client.js:9-11` 明确"no shadowing of the stock model picker"）。前端的"选择"只发生在两处，持久化路径都是 `POST /settings`：

```js
// client.js:5583-5592
const apply = async patch => {
  setBusy(true)
  try { await post('/settings', patch); summary.reload(); stats.reload() }
  catch (error) { showToast({ title: t('settings.failed'), body: String(error?.message ?? error), tone: 'warn' }) }
  finally { setBusy(false) }
}
```

- **无乐观更新、无本地副本**：写入后立刻整树重取 `summary` + `stats`（`5587`）。`client.js:4690-4697` 说明了为什么不patch：避免开关短暂显示"点过的值"而非"存下来的值"。
- 备用链成员顺序（真正的"模型选择"）走 `POST /combos` 整表覆盖（`client.js:5505`、`5512`），编辑器内是就地增删/上移下移（`5358-5365`、`5424-5426`），不用自由文本输入——`5341-5343` 注释说明理由："文本框里一个 typo 就是一条永远解析不了的链"。

### 3.4 "一键接入 / 自动配置"

| 能力 | 位置 | 交互 |
| --- | --- | --- |
| 一键刷新（全量探测，600 s） | `client.js:5657-5660` → `POST /refresh` | `busy` 期间按钮 `disabled` |
| 一键重探测（只重测，600 s） | `client.js:5661-5664` → `POST /reprobe` | 同上 |
| 单模型测速 | `client.js:5594-5605` → `POST /bench`（240 s） | 每模型独立 `running`，互不阻塞 |
| 渠道自动领积分 | `client.js:4172-4176`（`chan.auto` 开关 + 状态胶囊）、`3923-3937` → RPC `credits.claim` | `claimPending` 防重 |
| provider 模型发现 | `client.js:4945` → `POST /providers/discover`（60 s） | 行内按钮 |
| GitHub 交互登录 | `client.js:2945-3054`（`useEacLogin`）、`POST /eac/login/start` | 弹外链 + 2.5 s 轮询，10 min TTL |

---

## 4. 错误与加载态

### 4.1 加载态

- **骨架**：`PanelSkeleton` 只给"三张 shimmer 卡"（`client.js:4721-4724`，`aria-hidden="true"`），用于 3 个新页（`5090`、`5206`、`5526`）；`ofm_skel` 类共 12 处（含日志页整块占位 `4484`、账本 `4391` 一带）。
- **旧页面是纯文字**：`t('loading')` 6 处（如 `5607`、`5769`、`5930`），无 spinner、无骨架。
- **首答策略差异明显**：`SettingsPage` 认为"骨架比文字更差"以外的老路径直接返回 `<p>loading</p>`（`5607`）；`AnnouncementGate` 反过来——"宁可 null 也不要先画骨架再抹掉"（`client.js:6102-6104` 注释，`6149` 返回 `null`）。

### 4.2 错误分类与重试

- **没有错误分类枚举**。`api()` 只把非 2xx 折成一条字符串（`client.js:2174`）；唯一做过"原因 → 安全文案"白名单的是 EAC 轮询：

```js
// client.js:2999-3001
const safe = /^gateway-http-\d{3}$/.test(reason) ? `HTTP ${reason.slice(-3)}`
  : ['unreachable','malformed','not-writable','cancelled','no-lane','bad-link','timeout'].includes(reason) ? reason : 'unreachable'
setNotice(reason === 'not-writable' ? t('eac.saveFailed') : t('eac.pollFailed').replace('{reason}', safe))
```

注释点明动机："Never render response HTML, URL or credentials as diagnostics"（`2998`）——**错误文案不反射服务端原文**，这是可复用的安全模式。
- **重试入口覆盖不全**：`PanelError`（`client.js:4734-4741`）带 `onRetry`，但只用在 4 处（`4644`、`5092`、`5208`、`5528`）；全文件 `t('retry')` 只出现 **2 次**（`4740`、`5611`）；`ofm_callout ofm_error` 共 **13 处**，其中多数只陈列 `error` 字符串、不给按钮（如 `5610`、`4177`）。
- 有界重试：渠道状态在冷启动时最多重试 4 次、间隔 4 s，之后才认定失败（`client.js:4131-4136`）。

### 4.3 空态

`t('routing.noModel')`（`5324`）、`t('routing.memberEmpty')`（`5418`）、`t('free.tankEmpty')`（`5761`）、`t('chan.rpc.unavailable')`（`4483`）、`t('roster.noLane')`（`2791`，注释说明这是"页面唯一能解释空车道原因"的地方，issue #60）、`t('loading')`（`5930`）。**空态文案都带原因，不是一句"暂无数据"**——这是该插件一贯的做法。

### 4.4 通知层（toast / 模态 / OS 通知）

- `showToast`（`client.js:2494-2547`）：**命令式 DOM，不是 React**。一个 `.ofm_toasts` 宿主（`2484-2492`，`position:fixed; right/bottom:18px; z-index:1200`，`1487`），最多保留 **4 条**（`2539`），默认 10 s 自动关（`2494` 的 `holdMs = 10000`），支持 `actions` 按钮组（`2525-2537`），整体 `try/catch`——"a toast must never break its caller"（`2545`）。
- `showUrgentModal`（`2550-2594`）：`role="alertdialog"` + `aria-modal="true"`（`2558-2559`），Escape 关闭（`2579-2583`），关前统一 `removeEventListener`（`2575`），打开后 `ok.focus()`（`2592`）。
- `osNotify`（`2597-2602`）：仅当 `Notification.permission === 'granted'`，正文截 200 字符。
- **缺陷**：`.ofm_toasts` 容器没有任何 `role` / `aria-live`（全文 `aria-live` 命中 **0**）→ 屏幕阅读器不会播报推送型通知，而推送恰恰是本插件的主要告知通道。

---

## 5. 写操作与危险动作

### 5.1 确认弹窗：只有 3 处，且都是"二次点击"或原生 confirm

| 动作 | 确认形态 | 证据 |
| --- | --- | --- |
| 删除渠道账号 | **原生 `window.confirm`**（唯一一处） | `client.js:3914-3915`：`!window.confirm(t('chan.confirm.delete').replace('{name}', …))` 直接 return |
| 移除聚合 provider | 二次点击（按钮文案切换 + 警示句） | `4996`、`5001-5004`（`confirm` state → `t('agg.removeWarn')`） |
| 删除备用链 | 二次点击（`routing.deleteConfirm` + `deleteWarn`） | `5553-5555`、`5473` |

**没有确认的危险动作（均可一次点击完成）：**

- `/forward/rotate`、`/forward/lan/rotate`（密钥轮换）——`client.js:3313`、`3340`，仅按钮 `title` 里带警告文案（`t('forward.rotateWarn')`）。
- `/chan-gateway/rotate`——`4637`。
- `/update/apply`（下载+校验+安装整包，600 s）——`3573`。
- `/reload`（热重载，页面状态全丢）——`3625`。
- `/refresh`、`/reprobe`（600 s 探测，会真实打上游、烧配额）——`5659`、`5663`。
- `/combos` 整表覆盖（`5505`）——链的新增/编辑走同一个覆盖写，无 diff 保护。

### 5.2 乐观更新：**明确未实现**

`client.js:4690-4697` 解释了为什么：

> "every control's POST already answers with the state the host stored, and a re-read would either double the round trips or open a window where a switch shows what was *clicked* rather than what was saved."

落地方式：`await post()` → 用应答 `patch()` 本地状态，或 `summary.reload()`。因此**不需要回滚逻辑**——失败时 UI 保持旧值，只补一条错误提示（`5591` toast / `5379` inline / `3568` setError）。

### 5.3 幂等 / 防重复提交

三重叠加，做得比较到位：

1. **状态机 `busy`**：`busy === ''` 表示空闲，取值即"正在做哪件事"（`client.js:3736`、`5563`）；所有危险按钮 `disabled: busy !== ''`（`4047`、`4985`、`5001`、`5003`）。
2. **`useRef` 旗标**：`claimPending.current` / `modelBatchPending.current` / `balancePending.current`（`3744`、`3739`、`3742`），在 `finally` 里复位（`3937`、`3909`）。
3. **可访问的忙碌态**：`aria-busy="true"` 9 处（如 `3968`、`3970`、`3983`、`4061`）。

开关还额外做了"请求飞行中不可点"的修复记录：`client.js:2609-2613` 注释——"Several call sites already pass `disabled` … and it was silently dropped, so a switch stayed clickable through a write it could not survive"。

---

## 6. 性能

### 6.1 大列表：无虚拟化，只有截断与分页

| 列表 | 策略 | 位置 |
| --- | --- | --- |
| 请求日志 | **真分页**：10/20/50/100 每页，可切换 | `client.js:4461`、`4471-4474`、`4477-4480` |
| 模型选择器 | 硬截断前 60 条 | `5316` |
| provider 选择器 | 过滤后截断 48 条 | `4850` |
| 账本明细表 | 前 12 行 | `4392` |
| onboarding 模型页 | 前 8 条 | `5933` |
| 热力图 | 固定 119 格 | `2663` |
| 备用链 | 无上限（用户自建，通常 <10） | `5419-5427` |

→ **没有 react-window 类虚拟化**。当前数据量（模型 ~10–20、日志由宿主 `limit:400` 封顶、`sinceDays:90`）下可接受，但 `tokenLedger limit:400`（`4309`）一旦调到上千行就是一次全量 DOM。

### 6.2 `useMemo` / `useCallback` 是否合理

- `useMemo` **8 处，全部有实际收益**：热力图单元格 `2646`、统计日排序 `3092`、累计曲线 `3118`、公告 HTML 解析 `3531`/`3586`（解析器有 4000 节点上限，`2327`）、RPC 句柄 `3700`、链查找 Map `5491`。没有"包个空数组"式滥用。
- `useCallback` **16 处**，主要目的是让 `setInterval(…, [load])` 的依赖稳定（`3285`、`3368`、`3811`、`4145`、`4466`、`5576`），属于正确用法。
- 反例：`tabs` 数组、`counts` 归约（`5618`）每次渲染重算，但都是 O(n) 小数组，影响可忽略。

### 6.3 轮询暂停：**未实现**

- `visibilitychange` / `document.hidden` / `visibilityState` 全文 **0 命中** → 页面不可见时 10 个定时器全部照跑（见 §1.5 表）。
- 唯一"按条件不轮询"的写法是 `if (!running) return undefined`（`3284`、`3367`、`3810`、`4144`、`4465`），条件是**业务开关**而非页面可见性。
- 额外常驻开销：`useHostShown` 每秒轮询 + 两个 MutationObserver（`client.js:2245-2250`），只要 onboarding step 在场就一直跑。
- 反面做得好的：所有 interval 都有 `clearInterval` 清理（§2.4），SSE 关闭时会把重连定时器一起清掉（`6053`）。

### 6.4 其他

- `timer.unref?.()` 两处（`2251`、`2542`）——在 Node 侧 lint/headless 环境中不阻止进程退出，属于为 headless 测试做的小让步。
- `redirect: 'error'`（`2170`）防止反代把 API 302 到登录页后前端把 HTML 当 JSON 解析。
- 全文件仅 2 次 `JSON.stringify`（`2184`、`2931`），无序列化热点。

---

## 7. 可访问性（含计数表）

### 7.1 定量统计（`grep -o` 属性级计数，非行数）

| 属性 / API | 次数 | 典型位置 |
| --- | --- | --- |
| `aria-pressed` | **15** | 分段按钮 `3235-3236`、选择行 `5327`、分页 `4478` |
| `aria-hidden` | **9** | 骨架 `4722`、装饰层 `5679`、`5712` |
| `aria-busy` | **9** | 渠道按钮 `3968`、`3970`、`3983`、`4061`、`4066` |
| `aria-label` | **7** | toast 关闭 `2508`、dialog `5891`、进度 `5901` |
| `aria-checked` | **7** | `Switch` 组件 `2608` |
| `aria-selected` | **4** | tablist `5685-5686` |
| `aria-modal` | **4** | `2559`、`5891` |
| `aria-valuenow` / `-min` / `-max` | 2 / 2 / 2 | 公告进度条 `5898-5900` |
| **`aria-*` 合计** | **61 次（分布在 56 行）** | — |
| `role`（作为 prop） | **15** | `switch` 1、`tab` 1、`tablist` 2、`dialog` 2、`group` 2、`img` 3、`progressbar` 2、`status` 1、`alert` 1 |
| `setAttribute('role', …)` | **2** | `alertdialog` `2558` |
| `tabIndex` | **1** | 仅公告 dialog `5891` |
| `onKeyDown` | **3 个处理函数**（6 次文本命中） | `2579`、`5863`；移除监听 `2575`、`5887` |
| `aria-live` / `role="status"` 于 toast | **0** | — |

### 7.2 做到了什么

- **统一聚焦环**：只对键盘生效，鼠标不出现——
  `.ofm_root :focus-visible{outline:2px solid …;outline-offset:2px;box-shadow:0 0 0 4px …}`（`client.js:1300`），注释"只给键盘聚焦画聚焦环"（`1299`）。
- **一个真正合格的模态**：公告对话框 `role="dialog"` + `aria-modal="true"` + `tabIndex:-1` + 挂载即 `focus()`（`5891`、`5862`），并在 `document` 上做 **Tab / Shift+Tab 圈闭**：

```js
// client.js:5870-5884
focusables = Array.from(node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
…
if (event.shiftKey && (active === first || !node.contains(active))) { event.preventDefault(); final.focus() }
else if (!event.shiftKey && active === final) { event.preventDefault(); first.focus() }
```

  且 Escape 走与"稍后"完全相同的落点（`5864-5867`），注释指出 `aria-modal="true"` 就该兑现这两件事（`5856-5858`）。**它还被 portal 到 `document.body`**（`5914`），因为壳会把 `#root` 设成 `opacity:0`+`inert`（`5842-5849`、`2210-2222`）。
- **自定义控件的语义**：`Switch` 用 `button` + `role="switch"` + `aria-checked`（`2604-2615`）；分段控件用 `aria-pressed`（`3235-3236`）；进度条用 `progressbar` + `aria-valuenow/min/max`（`5897-5901`）。
- **动效可降级**：4 段 `prefers-reduced-motion`（`1553`、`1690`、`1704`、`1840`、`2143`），把 `animation/transition` 压到 0.01ms。

### 7.3 缺口（可逐条列为改进项）

1. **toast 无 live region**：`.ofm_toasts`（`1487`）与每张 `.ofm_toast` 都没有 `role="status"`/`aria-live="polite"`；而 `showToast` 是推送、更新、错误的主通道（`6014`、`6023`、`5591`、`4156`）。
2. **`showUrgentModal` 不是完整模态**：有 `alertdialog`/`aria-modal`/Escape/`focus()`（`2558-2592`），但**没有 Tab 圈闭**、没有背景 `inert`/`aria-hidden`、关闭后**不归还焦点**（`dismiss` 里只 `scrim.remove()`，`2574-2578`）。
3. **tablist 只做了一半**：`role="tablist"` + `role="tab"` + `aria-selected`（`5682-5689`），但**无 roving tabindex、无方向键、无 `aria-controls`/`tabpanel`**；且 `'aria-selected'` 在同一个对象字面量里**写了两次**（`5685`、`5686`），后者覆盖前者——功能上无害，是明显的复制粘贴残留。
4. **`tabIndex` 全文仅 1 处**：除公告 dialog 外没有任何元素参与显式焦点顺序管理，`focus()` 只在 `2592`、`5862` 两处出现，**无 focus restore**。
5. **键盘快捷键为零**：无 `keydown` 的全局快捷键、无 Esc 关闭 drawer（渠道卡片 `open` 状态只靠点击切换，`3729`、`4099` 一带）。
6. 装饰性 SVG（Tank/Sparkline/TrendChart，`2680-2723`、`2821`）未统一加 `aria-hidden`（部分加在容器上，如 `5712`）。

---

## 8. 样式注入与宿主一致性

### 8.1 CSS 是什么形态

单段模板字符串常量 `CSS`，`client.js:1281` 开始、`2144` 结束（**864 行**，全部压缩为单行选择器块，无嵌套、无预处理器），文件头部就写明令牌约定：

```
/* client.js:1284-1286
   统一令牌：所有色值取自宿主 --dsw-alias-* 变量，昼夜由宿主切换。
   层级约定：layer-3 凹槽/页面底 · layer-2 面板 · layer-1 浮起元素。
   动效约定：transform/opacity 优先；常规 150–300ms、覆盖层 300–400ms。 */
```

### 8.2 注入方式：`<style>` 一次性注入，带 plugin 标记与清理

```js
// client.js:5964-5970
ctx.effect(() => {
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'dsh-our-free-model')
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}, 'our-free-model: styles')
```

- **不是** inline style、**不是**独立 `.css` 文件、**不经过**任何打包器的 CSS 管线（与"手写 ModuleLoader bundle、无构建步骤"一致，`client.js:19-20`）。
- 生命周期挂在 `ctx.effect` 上 → 热重载/卸载时 `<style>` 随之移除，不留孤儿节点。`data-plugin` 属性使它在 DevTools 里可识别、也便于测试脚本定位。
- 全文 `document.createElement('style')` 只有这 1 处；布局性内联 style 是零星的手写对象（如 `5320` `flex:'1 1 200px'`、`5683` glider 的 `transform`），没有"整页内联样式"。

### 8.3 宿主令牌使用

| 令牌 | 出现次数 |
| --- | --- |
| `--dsw-alias-state-business-primary` | 109 |
| `--dsw-alias-label-tertiary` | 36 |
| `--dsw-alias-border-l1` | 36 |
| `--dsw-alias-bg-layer-1` | 31 |
| `--dsw-alias-border-l2` | 30 |
| `--dsw-alias-label-primary` | 26 |
| `--dsw-alias-state-error-primary` | 25 |
| `--dsw-alias-label-secondary` | 24 |
| `--dsw-alias-state-success-primary` | 20 |
| `--dsw-alias-bg-layer-3` | 15 |
| `--dsw-alias-bg-layer-2` | 15 |
| **合计** | **367 次（11 个不同令牌）** |

- `var(--sys-color-*)`：**0 次** → 只用 `--dsw-alias-*` 一套，未混用旧命名。
- 带 fallback 的只有 **5 处**，且都集中在可选令牌上：`var(--dsw-alias-state-warning-primary,#f0a441)`（`1316`、`1332`、`1334` 一带）——即"宿主没定义警告色也不至于透明"。
- 配色派生大量使用 `color-mix(in srgb, var(--dsw-…) N%, transparent)`（如 `1295`、`1302`、`1325`），把令牌当成基色做透明叠加；**没有硬编码主题色**，硬编码只剩 `rgb(255 255 255 / x%)` 的内高光与 `rgba` 噪声纹理（`1289`）——语义是"提亮/材质"，深浅色主题下都可接受。
- 深色主题兜底：3 段 `@media not (prefers-color-scheme: dark)`（`1810`、`1992`、`2007`），说明作者预期宿主可能不自带暗色令牌。

### 8.4 是否污染全局

- **没有** `html` / `body` / `*` / `:root` / `#root` / 裸标签选择器（grep 结果为空）——**所有规则都以 `.ofm_` 前缀开头**。
- 唯二挂到 `body` 的是被 portal 出去的两层：`.ofm_toasts`（`1487`）与 `.ofm_scrim`（模态 `5890`），且类名都带 `ofm_` 命名空间，选择器本身仍前缀限定。
- 作用域根是 `.ofm_root`（`1288`），`box-sizing` 只作用于 `.ofm_root *`（`1291`），滚动条样式也只作用于 `.ofm_root ::-webkit-scrollbar`（`1292-1296`）——**未触碰宿主滚动条**。
- 一个刻意的"越界"：`.ofm_root::before` 用 `position:fixed; inset:0` 铺满视口做噪点纹理（`1289`），但 `pointer-events:none` + `opacity:.022` + `z-index:0`，且 `.ofm_root>*` 抬到 `z-index:1`（`1290`），不会挡住宿主 UI。
- 字体：`font-family:inherit`（`1487`）与 `ui-monospace, SFMono-Regular, Menlo, monospace`（`1335`、`2141`），不引入外部字体。

---

## 9. 可直接复用的函数/模式清单（含 file:line）

> 复用时括号里是"必须一起搬走/注意"的东西。

### 9.1 基础设施（单文件可摘）

| # | 名称 | 位置 | 复用时注意 |
| --- | --- | --- | --- |
| 1 | `API` 相对 base 解析 | `client.js:2152-2154` | 反代子路径部署必用；`document.baseURI` 缺失时回退 `/api/…` |
| 2 | `api(path, options)` 8 s 超时封装 | `client.js:2157-2179` | 把非 2xx 折成 `Error(payload.error ?? HTTP n)`；`redirect:'error'`；`timeout` 可按调用点放宽 |
| 3 | `post(path, body, timeout)` | `client.js:2181-2186` | 注意 `...body === undefined ? {} : {body}` 的写法，`undefined` 时**不发 body** |
| 4 | `useAsync(loader, deps)` | `client.js:2261-2272` | 只读整树替换；`reload` 返回的 cleanup 调用方要接住（现状没接，见 §2.4） |
| 5 | `usePanel(loader, deps)` + `patch` | `client.js:4698-4718` | **写后不回读**的首选；首答才出骨架、错误不清数据 |
| 6 | `hostShown()` / `useHostShown()` | `client.js:2202-2225` / `2237-2259` | 判断"宿主是否真的把页面给用户看"（`#root.inert`、`opacity:0`、`[data-desktop-onboarding-surface]`）；MutationObserver + 1 s 兜底轮询 |
| 7 | SSE 订阅（含指数退避重连） | `client.js:5979-6056` | 退避计数器必须活在 `open()` 外（`5985-5987`）；`errCount>=5` 才主动 close 让出连接池 |
| 8 | `useChannelRpc(ctx)` | `client.js:3700-3718` | `ctx.connection` 取不到时降级 `ctx.get('connection')`；`result.ok===true` 才是值 |
| 9 | `kilo` / `ago` / `copy` / `legacy` | `client.js:2274` / `2281` / `2293` / `2301` | `copy` 有 `navigator.clipboard` → `execCommand` 双路径；`ago` 手写中英双语相对时间 |

### 9.2 安全 / 渲染

| # | 名称 | 位置 | 复用时注意 |
| --- | --- | --- | --- |
| 10 | `parseSafeHtml` + `htmlToReact` / `htmlToDom` | `client.js:2323-2482`（白名单集合 `2323-2329`，解析器 `2396`，两个物化器 `2459`/`2466`） | **无 `innerHTML` 汇点**：自写 tokenizer + 标签/属性/样式白名单 + 4000 节点上限（`2327`）+ `DROP_CONTENT_TAGS`（`2325`）；`safeUrl` 只放 http(s)/mailto/#/内联图（`2332-2341`）；`sanitizeStyle` 只放 6 个属性（`2328`）。**这是本仓最值得整体复用的模块**，且有 headless 测试钩子 `exports.__test`（`6156-6159`） |
| 11 | 错误文案白名单（不反射服务端原文） | `client.js:2998-3001` | 只把已知 reason 映射成人类文案，其余一律 `unreachable` |
| 12 | `showToast`（命令式、可带 actions、最多 4 条） | `client.js:2494-2547` | 内部 `try/catch` 吞异常（"a toast must never break its caller"）；**记得补 `role="status"`/`aria-live`** |
| 13 | `showUrgentModal` | `client.js:2550-2594` | `alertdialog` + Escape + 统一 dismiss 路径；缺 Tab 圈闭与焦点归还 |

### 9.3 UI 模式

| # | 模式 | 位置 | 说明 |
| --- | --- | --- | --- |
| 14 | `Switch` / `Pill` / `Button` / `Section` / `Panel` 原子件 | `client.js:2604-2641` | `Switch` = `button` + `role="switch"` + `aria-checked` + `disabled` 透传（`2609-2613` 记录了"漏传 disabled"的 bug） |
| 15 | `PanelSkeleton` + `PanelError` | `client.js:4721-4724` / `4734-4741` | 骨架 `aria-hidden`；错误块 = 标题 + 消息 + 重试，**标题由调用方传**（"读不到 provider 注册表"和"读不到链设置"是两句话） |
| 16 | `CopyButton` | `client.js:4744-4756` | 1.4 s "已复制"反馈，避免静默复制 |
| 17 | 二次点击确认（不用原生 confirm） | `client.js:5553-5555`、`5473`；`4996-5004` | `confirming === id ? delete : setConfirm(id)`，比 `window.confirm` 更适合玻璃风格 UI |
| 18 | Tab shell + `localStorage` 记忆页签 | `client.js:5638-5715`（`TAB_KEY` `5635-5636`） | glider 用 `offsetLeft/offsetTop/offsetWidth/offsetHeight` 做双轴滑块（`5654`、`5683`）；**注意 `5685-5686` 的重复 `aria-selected`** |
| 19 | 手绘 SVG 图表（heatmap / trend / sparkline / tank） | `client.js:2644-2723`、`2663`、`2821` | 零依赖；`vectorEffect="non-scaling-stroke"`（`2722`）保证缩放后线宽稳定 |
| 20 | "完成后才排下一次"的串行轮询 | `client.js:2968-3007`（`3003` 递归 `setTimeout`） | 慢响应不会叠出并发采集者；配合 `pendingRef.current?.link !== pending.link` 丢弃过期结果（`2982`、`2995`） |
| 21 | generation 序号作废在途请求 | `client.js:3743`、`3781`、`3788-3796`、`3804` | 全文唯一正确实现；复制到 `useAsync`/`usePanel` 即可补齐 §2.4 的 3 个缺口 |
| 22 | `busy` 状态机 + `aria-busy` | `client.js:3736`、`3968-3985`、`4061-4066` | `busy` 存"正在做哪件事"而非布尔，天然互斥且可渲染对应文案（`'…'`） |
| 23 | 有界重试（冷启动竞态） | `client.js:4124-4137` | `attempt < 4` + 4 s 间隔，之后才报错；避免"异步 pack 还没 import 完就判失败" |

### 9.4 建议搬迁顺序（若要在别的插件里复用）

1. `client.js:2323-2482`（HTML 白名单渲染，安全边界，独立无依赖）
2. `client.js:2152-2186`（`API` + `api` + `post`，任何同源插件都需要）
3. `client.js:4698-4718` + `4721-4741`（`usePanel` + 骨架 + 错误块，写后不回读的正确形态）
4. `client.js:5979-6056` + `src/push.js:19-102`（SSE 一套，含服务端 hub 与退避重连）
5. `client.js:2202-2259`（`hostShown`，桌面壳首启遮罩下唯一可靠的可见性判据）

---

## 附：本次剖析的验证方式与局限

- **静态**：`wc -l`、`awk` 行宽统计（均 73.9 / max 9851 @3648）、`grep -o` 属性级计数（aria 61 次、令牌 367 次、`setInterval` 10 处、`createContext` 0、`aria-live` 0）、结构大纲（`^  function` / `^    function` 共 90+ 声明）。
- **动态**：`curl http://127.0.0.1:64725/api/our-free-model/{summary,stats,meta,announcement}` 全部 `HTTP 401 24B {"error":"unauthorized"}`，与 `index.js:1728-1736` 的信任围栏一致。因此**各端点响应体积是按其构造代码估算的区间，不是实测值**——若需精确字节数，需要在具备 `connection` 准入凭证的会话中取一次。
- **未覆盖**：`src/adapter.js` 等宿主侧业务逻辑（本报告只在"前端调了什么"的层面上引用 `index.js` 路由与 `src/push.js`）；`README.md` 的 83 KB 文案未参与代码结论。
