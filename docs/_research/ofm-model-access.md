# dsh-our-free-model 模型接入机制（v2.1.0）

> 剖析对象：`C:\Users\ZYH\Desktop\新建文件夹\dsh-our-free-model-extract\package`（npm 包解包，v2.1.0，`src` ≈ 40 个 ESM 模块 + 一个 Tauri 侧 `adapter/kernel.js`）。
> 方法：只读源码 + 逐个 `export`/关键分支落行号。凡标"未实现"的，都在全仓 grep 过再下结论。

---

## 0. 一句话架构

它是一个**纯 Cordis 宿主插件**，不是代理进程也不是 provider 配置片段：只 `inject: ['llm']`（`index.js:128`），用 `ctx.llm.registerAdapter(['our-free-model','our-free-model-region'], adapter)` 在宿主 LLM 服务里**占用两个 provider 槽位**（`index.js:436`，id 定义在 `src/adapter.js:36-42`），再把自家 8 条 lane（免费池 / 密封委托 / Kilo / 聚合第三方 / 虚拟 combo）**编译成一张内存 catalog**（`src/core/runtime.js:84-96`），由 adapter 的 `stream()` 逐个候选"**先缓冲、后提交**"地走链（`src/adapter.js:234-283`），把上游 SSE 直接翻成宿主的 `StreamChunk` 生成器。宿主看到的只是一个普通 LLM provider；实际模型清单是插件自己拼的，路由与降级全在插件内完成。

---

## 1. 注册方式（inject / patch / adapter）

### 1.1 包清单里的三个半身

| 声明 | 位置 | 作用 |
|---|---|---|
| `dsh.bundle.patch: ./cordis.patch.yml` | `package.json` | 宿主 bundle 装载时读这份 patch |
| `dsh.client: { platform: 'web', immediately: true, inject: [] }` | `package.json` | 浏览器半身（`client.js`）由宿主注入 |
| `main: ./index.js` + `exports: './client'` | `package.json` | 宿主侧 / 浏览器侧各一个入口 |

`cordis.patch.yml` 只做一件事——插入一行插件节点：

```yaml
# cordis.patch.yml:5-8
- insert:
    - id: our-free-model
      name: 'dsh-our-free-model'
      config: {}
```

同文件注释说明"浏览器半身由 package.json 的 `dsh.client` 声明，并绑定在 `name` 为裸包名的这一行上"。**没有任何 apiKey/模型清单写在 YAML 里**——配置全部走 `settings.json`。

### 1.2 唯一的硬依赖是 `llm` 服务

```js
// index.js:128
export const inject = ['llm']
```

`index.js:107-127` 的注释是这段代码的设计说明：Cordis 只把 `inject` 列出的服务交给插件，其余服务缺失会让 fiber **永久 pending**；v1.2.1 就因为把 `webServer` 写进 `inject` 而卡死整个插件，所以现在只有 `llm` 是硬的，`webServer`/`credentials`/`commands` 全部用 `ctx.inject([...])` 的**可选注入**（`index.js:1048`、`index.js:1426`）。

### 1.3 adapter 注册：三个 API + 一个事件

```js
// index.js:436
const registration = ctx.llm.registerAdapter([ROUTE_MAIN, ROUTE_REGION], adapter)
```

紧随其后是另外两个可选的宿主能力（都带 `?.` 降级）：

- **可配置 provider 声明** —— `index.js:437-439`：`registerConfigurableProviders?.([{ provider: ROUTE_MAIN, displayName, settingsNs, settingsPath: [] }])`。
- **模型发现** —— `index.js:445`：`registerModelDiscovery?.(id, async () => …)`，返回 `{ id, name, contextWindow, maxTokens, inputModalities }`。注意这条路径**只回元数据**，模型行与其能力标记的真身仍在插件 catalog 里。
- **拓扑变更通知** —— `index.js:1612`：`ctx.emit?.('llm/adapters-updated')`，让宿主（及其它消费者）在 catalog 变化后重读模型清单。

两个 provider id 的语义（`src/adapter.js:36-42`）：

| id | 含义 |
|---|---|
| `our-free-model` | 主路由：全部可用 lane（含 combo、聚合） |
| `our-free-model-region` | 区服路由：只暴露 `regionSensitive` 的模型，由 `settings.exposeRegionModels`（`runtime.js:360-372`）开关 |

### 1.4 它"伪装"到什么程度

`adapter/kernel.js` 只有 51 行，且刻意做成 **host 无关薄壳**：

```js
// adapter/kernel.js:42
const { attributionHeaders } = await import('@deepseek-ai/dsh-llm')
```

```js
// adapter/kernel.js:51  （动态 import 失败时的兜底 UA）
return { 'user-agent': `our-free-model\nuser-agent: ${attributionUserAgent}` }
```

配套的 `adapter/dsh-llm.d.ts` 只有一行 `declare module '@deepseek-ai/dsh-llm'`（`:7`）声明 `attributionHeaders`，即**宿主 API 面被压到"一个函数"**，其余契约（`StreamChunk`/`TokenUsage`/finish reason）靠结构化类型在 `src/stream.js` 里手写对齐（见 §5）。这是整个包对宿主耦合最轻的一处设计。

---

## 2. provider 与模型数据结构

### 2.1 provider 条目（第三方聚合 lane 用）

`src/providers/index.js` 把 `registry.json` 归一成固定形状（`:58` 起 `PROVIDERS`），字段白名单在 `:34-46`（`FORMAT_VALUES` / `AUTH_KINDS` / `CATEGORY_VALUES`）：

| 字段 | 例 | 用途 |
|---|---|---|
| `id` / `name` | `openrouter` / `OpenRouter` | 前缀进模型 id：`provider/model`（`:31` 注明 composite id） |
| `category` | `aggregator` / `direct` | 设置页分组、按类别过滤 |
| `auth.kind` | `apiKey` \| `oauth` \| `adc` | **只有 `apiKey` 能走聚合 lane**；oauth/adc 直接抛 `CODE.credential`（`aggregate.js:500-502`） |
| `auth.url` | 发 key 的页面 | 错误文案里直接给用户链接（`aggregate.js:505`） |
| `baseUrl` / `baseUrlOverrideEnv` | — | endpoint 组装；组不出来就整行不入 catalog（`aggregate.js:466`） |
| `format` | `openai` \| `anthropic` | 决定 wire |

### 2.2 模型条目：四条 lane 各自 `entryOf`，字段名统一

统一形状（以免费 lane 为准，`src/catalog.js:107-118`）：

```js
// src/catalog.js:109-118
id: base,
name: displayModelName(base),
wire: isResponsesModel(base) ? 'responses' : 'chat',
vision: caps.vision === true,
reasoning: caps.reasoning !== false,
contextWindow: number(caps.contextWindow) ?? 131072,
maxOutput: number(caps.maxOutput) ?? 32768,
canDisableThinking: caps.canDisableThinking !== false,
regionSensitive: isRegionSensitive(base),
```

完整字段表：

| 字段 | 免费 `catalog.js` | 聚合 `aggregate.js:200` | Combo `combos.js:101-131` | 说明 |
|---|---|---|---|---|
| `id` | `:109` base | `providerId/modelId` | `combo:<slug>`（`:45`） | 全局唯一键 |
| `name` | `:110` | `${provider.name} ${label}` | 用户命名 | 选择器显示名 |
| `channel` | 隐式 `free` | `'aggregate'`（`:58`） | `'combo'`（`:33`） | lane 判别，也用于 UI 分组 |
| `wire` | `:111` chat/responses | 同 provider.format | 固定 `'chat'`（`:128`） | 决定 §5 的 endpoint |
| `vision` | `:112` | — | `every`（`:122`） | Combo 取**交集** |
| `reasoning` | `:113` | — | `some`（`:123`） | Combo 取**并集** |
| `contextWindow` | `:114` | — | `Math.min`（`:124`） | Combo 取最小 |
| `maxOutput` | `:115` | — | `Math.min`（`:125`） | Combo 取最小 |
| `canDisableThinking` | `:116` | — | `every`（`:126`） | 能否关思考 |
| `regionSensitive` | `:117` | — | 固定 `false`（`:127`） | 是否进区服 provider |
| `combo` / `strategy` / `stickyLimit` / `lanes` | — | — | `:118-130` | 仅 combo |

**定价字段：未实现。** 全仓无 `price`/`pricing` 模型字段；唯一与"价"相关的是 `src/image-pricing.js` 把图片折成 **token 数**（`FALLBACK_IMAGE_PRICING:7-19`，`IMAGE_PIXELS_PER_TOKEN = 750:20`），明确写着"免费出口不公布单图定价，所以这是估算而非报价"——供宿主 token 预算用，不是金额。

### 2.3 catalog 与运行时配置的合并

```js
// src/core/runtime.js:84-96
const rebuildCatalog = () => {
  const seen = new Set()
  const merged = []
  for (const entry of [...freeCatalog, ...sealedCatalog, ...kiloCatalog, ...aggregateCatalog]) {
    if (entry === null || entry === undefined || seen.has(entry.id)) continue
    seen.add(entry.id); merged.push(entry)
  }
  const combos = normalizeCombos(settings.get().combos)
  comboCatalog = buildComboCatalog(combos, merged)
  ...
```

- **合并顺序固定**：free → sealed → kilo → aggregate，combo 最后（`:80-81` 注释："a chain's links have to already exist as real rows"）。
- **同名去重是"先到先占"**：`seen.has(entry.id)`（`:89`），后到的同 id 行被静默丢弃；combo 也过同一张 `seen`（`:94-95`）。免费 lane 内部另有**同族版本去重**（`catalog.js:104-106`：按 `baseModelId(id)` 去重，避免 `x`/`x:free` 两行并存）。
- **跨 provider 不会撞 id**：聚合行 id 恒为 `providerId/modelId`（`providers/index.js:31`），所以"多 provider 同名模型"同时存在、不会互相覆盖——它们本来就是不同行。
- 配置变更 → `mergeCatalogs()`（`:98-101`）→ `rebuildCatalog()` → `onTopology()` → 宿主 `llm/adapters-updated`。

---

## 3. 模型选择与路由算法

### 3.1 输入：可用性 + 设置，**没有**价格/延迟/成功率打分

选择算法的输入只有两样：`availability`（探活结果）与 `settings`：

```js
// src/core/runtime.js:106-111
const state = () => ({
  catalog,
  membership: computeMembership(catalog, availability.get(), settings.get()),
  settings: settings.get(),
  attributionUserAgent,
})
```

`computeMembership`（`:360-372`）的判定极简：`verdictOf(entry) !== STATE.unavailable` 即可用；若**全都被判死**则整体放行（`:361` `if (refusedAll) usable = catalog`，避免一次探活失误清空选择器）；主路由排除 `regionBlocked`，区服路由只收 region 行。

**打分/权重/价格/latency 排序：未实现。** 延迟与成功率只进 `stats`（`store.js:298 recordUsage`、`:406 recordTurn`）做展示与统计，**不回流到选择**。这是它与 OpenRouter 式"按价/延迟打分"路由的根本差别：**它是一个"可用性门 + 有序链"，不是一个评分器。**

### 3.2 链的构造：combo 决定顺序

```js
// src/adapter.js:234
const candidates = comboChain(entry, snapshot.catalog)
```

- 普通模型 → 单元素链（`adapter.js:198-207` 先判 `isComboEntry`，combo 走 `runCombo`，否则 `runSingle`）。
- combo → `combos.js:148-165`：`fallback` 原序；`round-robin` 旋转起点并对 `stickyLimit` 轮粘滞（`:36` 的进程内 `Map` 存游标，注释理由："a strict per-turn rotation defeats prompt caching on every provider in the chain"）。

### 3.3 失败切换：**提交前才允许 advance**

这是整个路由的核心机制（`adapter.js:212-283`）：

- chunk 先进 `held` 缓冲（`:251`）；
- 只有 `commitsAnswer(row.value)` 为真（**已产出可见文本或流式 tool call**）才把缓冲吐给用户（`:257-260`）；
- 因此"上游 500 / 空响应 / 配额墙"发生在提交前 → 整个 try 的缓冲被**整体丢弃**，换下一个候选（`:267-277`，含 `warn` 日志 `:277`）；
- 一旦提交，advance 被强制关闭：

```js
// src/adapter.js:495
if (plan.allowAdvance !== true || options.signal?.aborted === true || sawAnswer) return { advance: false, verdict: null }
```

**冷却（cooldown）：只计算、不执行。** `classify.cooldownVerdict`（`classify.js:427`）产出 `cooldownMs`，`classifyFailure`（`:471`）把它并进 verdict，但**全仓没有任何代码把 cooldown 写回 availability 去真封账号**——路由靠"换下一个候选"消解问题，靠 probe 重写 availability。所以报告结论：**存在冷却数值与语义，没有冷却执行器**（可视为"未落地"）。

### 3.4 健康检查：probe 是独立的探活回路

- `probe.js:49 probeModel` 单模型探针（`timeoutMs=45000` 默认）；
- `probe.js:214 probeCatalog(models, options, onResult, concurrency = 2)` —— **硬编码并发 2**，这是全包唯一的并发限流；
- 周期由 `settings.probeIntervalMinutes ?? 15`（`index.js:2264` 附近 `publicSettings`）驱动，结果写 `availability.json`。

---

## 4. 密钥与鉴权

### 4.1 三层密钥，三种安全等级

| lane | 凭据 | 存放 | 加密 |
|---|---|---|---|
| 免费池 | **无需用户凭据** | 无 | — |
| 密封委托 / 区服 | 宿主 `credentials` 服务的 sealed 值 | 宿主凭据库 | 由宿主封 |
| 聚合第三方 | 用户粘贴的 `apiKey` | `settings.json` 明文 `aggregate.providers[id].apiKey` | **不加密**（仅靠 `0o600` 文件权限） |

免费池之所以"免密"，是因为它直接带一个**公共占位 token**：

```js
// src/upstream.js:138-148（节选）
'authorization': `Bearer public`,
```

endpoint 指向 `https://opencode.ai`（`upstream.js:20`）的 zen 网关。Kilo lane 更是**完全没有凭据**（`src/kilo.js:5-6` 注释 + `:40-50` 的请求头构造里无 auth）。

### 4.2 密封委托：AES-256-GCM + 三段式掩码密钥，**每次请求重新解封**

`src/vault.js:1-23` 的文件头就是威胁模型说明：AES-256-GCM 封装；密钥不落单处，而是由 `vault-data.js` / `vault-anchor.js` 里**三份互相掩码的 shard** 经 HKDF 派生：

```js
// src/vault.js:35-37
const HKDF_SALT = ...
const HKDF_INFO = ...
// src/vault.js:40-46
const MASK_PEPPER = ...
const FLAVOR_* = ...
```

- `sealedShards()`（`:107-112`）→ `deriveSealKey()`（`:119-121`）→ `openSealWith()`（`:137-176`，AAD 绑定、`iv|ciphertext|tag` 布局、`mode: direct|worker`）。
- `:67-80 detectSealedHost` 决定"这台机器上谁能解"（Tauri / Electron profile / web 三种宿主形态）。
- **不缓存明文**：`unlockSealedLane`（`:207-213`）在**每个请求**上重新解封，密文只在请求生命周期内存在。
- 代价：解开也只是拿到一个"通道票据"，不是长期 token；`eac.js:156-159 headersFor` 把它塞进私有头，worker 模式下还有 HMAC 签名（`:148-150`）。

### 4.3 登录态 / 账号池持久化

- `src/eac-user.js:55-70 writeEacUser`：`mode 0o600` + 临时文件 + 原子 rename；
- 路径 `DshHome/our-free-model/eac-user.json`（`eac-user.js:27-29` + `store.js:24-28,30`，`DshHome` = `$DSH_HOME` 否则 `~/.dsh`，与宿主 home-paths 解析保持一致）。
- 所有状态文件都走 `JsonStore`（`store.js:35`），写入同样 `{ mode: 0o600 }` + rename（`store.js:110-111`），坏文件会被留档成 `.corrupt-<ts>`（`load()` 内，`:58-72` 区段）而不是被默认值覆盖。

### 4.4 密钥会不会出现在日志/快照/前端

- **聚合 key 到前端时被裁剪成尾巴提示**：

```js
// index.js:2089-2092
const key = typeof value.apiKey === 'string' ? value.apiKey : ''
out[id] = { enabled: …, hasKey: key !== '', keyHint: key === '' ? '' : `…${key.slice(-4)}`, … }
```

- **但有一个例外端点会原样吐出 forward 密钥**：`index.js:1966` `GET /forward/key` 直接返回 `settings.get().forwardKey`。该端点受 `src/trust.js` 的准入篱笆约束（`trust.js:82 rejectionFor`、`:127 structuralRejection`，`isLoopbackHost:31`），即**默认只对 loopback 开放**——设计上承认它是"本机信任边界内的取出通道"。
- 日志侧：`adapter/kernel.js:51` 的 UA 与 `upstream.js:187 applyFingerprint` 都不带凭据；warn 只打候选名与 reason（`adapter.js:277`）。

---

## 5. 请求转发与流式

### 5.1 endpoint 与 wire 的映射

```js
// src/upstream.js:119-132（节选）
'responses' → /zen/v1/responses
'messages'  → /zen/v1/messages
'chat'      → /zen/v1/chat/completions
```

`wire` 来自 catalog 条目（§2.2），所以**同一个插件实例可以同时用三种线协议**。协议转换是三个方向的显式函数：

| 方向 | 入口 |
|---|---|
| 宿主 messages → OpenAI chat | `src/messages.js:163 toChatMessages` |
| 宿主 messages → Anthropic messages | `src/messages.js:267 toClaudeMessages` |
| 宿主 messages → Responses API input | `src/messages.js:330 toResponseInput` |
| tools 三风格 | `src/messages.js:399 toToolDefs` |
| 反向（Anthropic 请求 → 内部） | `src/anthropic.js:222 fromAnthropicRequest` |
| 反向（内部 → Anthropic 帧 / 非流式体） | `anthropic.js:453 anthropicFrames` / `:658 anthropicMessage` |

工具名与图片也在这一层处理：`messages.js:90 repairToolPairing`（修宿主可能给出的坏 tool 配对）、`:425 needsVision`、`baseModelId/restoreToolName`（`:429`，因为上游会把 `/` 等字符在工具名里改写）。

### 5.2 流式：手写 `AsyncGenerator`，对齐宿主 chunk 形状

```js
// src/stream.js:434
export async function * readStream(lines, wire, renameMap, now = () => Date.now(), options = {}) {
```

它返回的结构是宿主 `StreamChunk` 的语义等价物，并在结束时交出一份"这次读取观察到了什么"的账（`stream.js:822` 的 JSDoc：`usage / finish / sawFinish / sawUsage / sawToolCall / sawReasoning / firstDeltaAt / nextIndex / reasoningText`）。三个要点：

- **思考流兼容四种拼写**：`REASONING_FIELDS = ['reasoning','reasoning_content','reasoning_text','thinking']`（`stream.js:768`），注释承认旧版漏读会导致"界面上没有 reasoning 块 + recovery 不触发 + 客户端判空"。
- **usage 映射成不相交 token**：`mapUsage`（`stream.js:218`）把 `prompt_tokens` 减掉 `cached_tokens` 得 `inputTokens`，`cached` 缺省补 0——注释明确写"`undefined` 会让 `inputTokens` 变 `NaN`，而宿主的持久会话日志直接拒收非有限数"。
- **finish reason 归一**：`finishReason`（`stream.js:393`）→ `{kind:'tool-calls'|'max-tokens'|'stop'}`。
- **吞吐的诚实分母**：`windowTokens`（`stream.js:410`）在没有流式思考时把 `reasoningTokens` 从分子里扣掉，否则会把整个思考阶段算进答案窗口。

### 5.3 超时 / 取消 / 重试 / 并发

| 维度 | 实现 | 位置 |
|---|---|---|
| 取消 | 三条信号合并成一条幂等 abort：`req 'aborted'` / `socket 'close'` / `res 'close'` | `src/forward.js:612-623`；adapter 侧镜像 `adapter.js:167-171, 409-410` |
| 单次尝试超时 | 由 recovery policy 计算，`recovering` 时取 `min(maxContinuationMs, remainingMs)` | `adapter.js:413-417` |
| 流空闲超时 | deadline 检查，超时抛 `CODE.timeout` | `src/http.js:460` |
| 重试（端口绑定） | 指数退避 `backoffMs * 2 ** attempt`，仅 `retryable` 才重试 | `forward.js:261-284` |
| 重试（模型） | **不重试同一候选**，直接换链上下一个（§3.3） | `adapter.js:267-277` |
| 并发限制 | **未实现**（除 `probeCatalog` 硬编码 2） | `probe.js:214` |

### 5.4 用量与计费在哪算

- 采集：流结束时 `mapUsage`（`stream.js:218`）→ `adapter.js:453 this.deps.recordUsage({...})`。
- 落盘：`runtime.js:114-119` → `store.js:298 recordUsage(stats, record)`，并在同一处 `pruneDays(value, 120)`（保留 120 天）。
- 轮次级：`store.js:406 recordTurn`（含 tps 可信窗口 `MIN_DECODE_MS:275` / `MAX_CREDIBLE_TPS:276` / `decodeWindow:285`）。
- **金额计费：未实现。** 只有 token 账；没有任何 `$/1M` 换算。

---

## 6. 错误处理与降级

### 6.1 错误的坐标系：`UpstreamError.code` + `FAILURE_KIND` + `FAILURE_SCOPE`

`src/http.js:29-45` 定义 `CODE` 表与 `UpstreamError`（`:47`）；`classify.js` 再叠一层**语义**分类（`FAILURE_KIND:46`、`FAILURE_SCOPE:62`，注释 `:1-30` 说明 scope 的四档：`request` / `account` / `provider` / `transient`，以及"未匹配 4xx 落 request —— 冷却一个健康账号会把真实原因藏起来"）。

### 6.2 三张规则表，**顺序即优先级**

1. **文本规则**（`classify.js:117 ERROR_RULES`）：`'rate limit'`/`'too many requests'`/`'quota exceeded'` → `RATE_LIMIT, ACCOUNT, retryable, backoff`；`'capacity'`/`'overloaded'` → `OVERLOADED, PROVIDER`；`'no credentials'` → `AUTH, ACCOUNT, 冷却 2min`；**"文本优先于状态码"**（`:520-528` 注释："a 400 whose message says rate limit is a rate limit"）。
2. **状态码规则**（紧随其后）：401/402/403/404 各 2min 冷却、429 backoff。
3. **结构化 code 表**（`CODE_VERDICTS`）：`timeout`/`transport`/`server`/`stream_cut`/`empty_response` → `TRANSIENT, retryable`；`client_error` → `REQUEST, 不重试`；`region_blocked`/`authorization_required`/`lane_locked` → `PROVIDER, 不重试, 冷却 0`（注释：这类拒绝"清不掉，换候选也没用，所以什么都不封"）。
4. **上下文溢出单列**：`CONTEXT_WINDOW_CODES` + `CONTEXT_WINDOW_MARKERS`（`classify.js` `:603`、`:605` 区段），在一切之前判定，因为"fix 是更小的请求或更大的窗口，重试同样的字节没用"。

退避：`backoffFor(level)`（`:101`）= `min(2000 * 2^(level-1), 300000)`，level 上限 15（常量 `:82-86`）；provider 报告的 `retryAfterMs` 被钳到 30min（`:80 MAX_PROVIDER_COOLDOWN_MS`），注释理由："providers do report multi-hour resets and honouring one would silently empty a chain"。

### 6.3 降级链的落点

```js
// src/adapter.js:494-497
const advanceVerdict = (code, message, status) => {
  if (plan.allowAdvance !== true || options.signal?.aborted === true || sawAnswer) return { advance: false, verdict: null }
  const verdict = classifyFailure({ status, code, message, ... })
  return { advance: shouldAdvance(verdict), verdict }
}
```

`shouldAdvance`（`classify.js:506`）是唯一的"换渠道"裁决；`adapter.js:604` 另有一条硬侧路：

```js
if (error?.code === CODE.region) this.deps.onRegionBlocked?.(entry.id)
```

即 **region 拒绝不走换链，而是把该模型打进区服名单**（写 availability，随后 topology 变更）。

### 6.4 恢复（不是降级，是续写）

`src/recovery.js:13-18 RECOVERY_DEFAULTS`（30min 窗口等）；`canRecover`（`:40`）/`canRecoverSilentStop`（`:49`）判定"这次失败值不值得带着检查点续写"；`checkpointFits`（`:92`）确保检查点不越窗口；`addUsage`（`:104`）把两段用量合并。续写与换链是两条互斥的子路径，都在 `adapter.js:392-460` 的同一 attempt 结构里分支。

### 6.5 对外错误文案

三层，都是**给用户下一步动作**而不是给堆栈：
- **流内错误帧**：`forward.js:1210` 把错误折成 Anthropic `error` 帧；
- **OpenAI 体**：`forward.js:144 openAiError`；**Anthropic 体**：`forward.js:1231 anthropicError`；
- **可行动文案**：例如缺 key 时直接给发 key 的 URL（`aggregate.js:505`）、provider 被关掉时说"在聚合设置里打开"（`:498`）。

---

## 7. 状态暴露与前端数据获取

### 7.1 一个 HTTP 前缀 + 一个精确事件路径

```js
// index.js:1426  ctx.inject(['webServer']) → 注册前缀
// index.js:1443  精确路由 /api/our-free-model/events
// index.js:1444  push.attach(...)
```

其余全在前缀下（`routePath` 判定，均为实测行）：

| 方法与路径 | 行 | 返回 |
|---|---|---|
| `GET /summary` | `index.js:1738` | `buildSummary(deps)` 全量快照 |
| `GET /stats` | `:1741` | 用量/轮次统计 |
| `GET /providers` | `:1748` | `publicProviderRegistry()`（压缩版 registry，`index.js:2108` 起） |
| `POST /providers` | `:1757` | 改聚合 provider 配置 |
| `GET /forward/key` | `:1966` | 转发网关密钥（见 §4.4） |

### 7.2 推送：SSE 心跳，不是 WebSocket

```js
// src/push.js:19
const HEARTBEAT_MS = 25_000
```

`createPushHub`（`:21`）→ `emit(event, data)`（`:79`），25s 心跳保活。事件类型见调用点：`announcements`（`index.js:368`）、`update`（`:403`）、`upgraded`（`:418`）、`hello`（`:1516`）。

前端只有一个 `EventSource` 覆盖整个应用面：

```js
// client.js:5991
source = new EventSource(`${API}/events`)
```

`client.js:5973-5976` 的注释是本设计的说明："One EventSource for the whole app surface"，`client.js:5992` 还加了断连保护，避免默认无限重连占满连接池。

### 7.3 轮询 vs 推送：**混合**

- 实时性内容（公告、更新、升级完成）走推送；
- 大块状态（`/summary`、`/stats`）仍是**轮询**（前端定时拉）；
- **快照字段裁剪**：有"给前端的投影"这一层（`publicSettings:2259`、`publicAggregate:2085`、`publicProviderRegistry:2108`），密钥被裁成 `keyHint`（§4.4）。
- **light / 增量快照：未实现。** `buildSummary`（`index.js:2323`）每次构造完整对象，没有 `since`/`rev`/字段掩码参数；差异靠前端自己比对。

---

## 8. 与 DSH 宿主契约的关键依赖

| # | 宿主 API | 插件用法 | 位置 | 缺失时 |
|---|---|---|---|---|
| 1 | `ctx.llm`（服务） | `registerAdapter([ids], adapter)` | `index.js:436` | **硬失败**（`inject: ['llm']`，`index.js:128`） |
| 2 | `llm.registerConfigurableProviders` | 声明可配置 provider（displayName/settingsNs） | `index.js:437-439` | `?.` 静默跳过 |
| 3 | `llm.registerModelDiscovery` | 回 `{id,name,contextWindow,maxTokens,inputModalities}` | `index.js:445` | `?.` 静默跳过 |
| 4 | `ctx.emit('llm/adapters-updated')` | 拓扑变更后让宿主重读 | `index.js:1612` | `?.` 静默跳过 |
| 5 | `ctx.inject(['credentials','commands','llm'])` | 密封委托取凭据 + 斜杠命令 | `index.js:1048` | 可选，fiber 不 pending |
| 6 | `ctx.inject(['webServer'])` | 注册 HTTP 前缀与 SSE | `index.js:1426` | 可选（v1.2.1 的教训，`index.js:107-127`） |
| 7 | `@deepseek-ai/dsh-llm#attributionHeaders` | 生成 UA/归因头 | `adapter/kernel.js:42`，声明 `adapter/dsh-llm.d.ts:7` | `:51` 兜底 UA |
| 8 | 宿主 home 解析语义 | `$DSH_HOME` 否则 `~/.dsh` | `store.js:24-28` | 自实现，与宿主对齐 |
| 9 | `StreamChunk` / `TokenUsage` / finish 形状 | 手写对齐，不 import 类型 | `stream.js:218/393/434` | 形状漂移会静默错（已用注释固化理由） |
| 10 | peer 依赖 | `@deepseek-ai/{cordis ^4.0.2, dsh-commands, dsh-credentials, dsh-llm, schemastery ^3.18.4}` | `package.json:66-72` | 安装期即约束 |

**契约结论**：对宿主的耦合被刻意压到 **"一个服务 + 四个可选方法 + 一个事件 + 一份 UA 函数"**；模型数据、路由、降级、密钥、UI 数据全部自持。代价是它必须自己维护 `StreamChunk` 与 `TokenUsage` 的**结构化镜像**（`stream.js`），宿主侧形状一变，这里只能靠注释与单测发现。

---

## 附：判定清单（有/无）

| 能力 | 结论 | 证据 |
|---|---|---|
| registerAdapter 接入 | ✅ | `index.js:436` |
| 模型发现注册 | ✅（仅元数据） | `index.js:445` |
| 金额定价字段 | ❌ 未实现 | 全仓无模型级 price；仅 `image-pricing.js:7-19` 的 token 估算 |
| 按价格/延迟/成功率打分选择 | ❌ 未实现 | 选择输入只有 availability+settings（`runtime.js:106-111`） |
| 权重路由 | ❌ 未实现 | 无 weight 字段 |
| 冷却执行器（真封账号） | ⚠️ 只算不用 | `classify.js:427` 产出 `cooldownMs`，无写回 availability 的代码 |
| 提交前失败自动换链 | ✅ | `adapter.js:251-277` |
| 并发限制 | ❌（仅 probe=2） | `probe.js:214` |
| 金额计费 | ❌ 未实现 | `store.js:298` 只记 token |
| 增量/light 快照 | ❌ 未实现 | `index.js:2323 buildSummary` 全量 |
| 密钥前端脱敏 | ✅（一处例外） | `index.js:2089-2092`；例外 `index.js:1966` 受 `trust.js:82` 篱笆 |
