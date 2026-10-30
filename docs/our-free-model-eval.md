# our-free-model 的模型接入与前端逻辑：对本项目的参考价值评估

- 评估对象：`dsh-our-free-model@2.1.0`（解包源码 `C:\Users\ZYH\Desktop\新建文件夹\dsh-our-free-model-extract\package`，21,406 行）
- 对照对象：`dsh-manage-api@0.8.1`（`D:\AgentWorkPlace\DSH\dsh-manage-api`）+ 母仓 `ManageAPI`（`D:\AgentWorkPlace\DSH\ManageAPI`）
- 证据来源：本文件引用的一手代码行号均已逐个打开核对；两份额外细目见 `_research/ofm-model-access.md`（模型接入，含字段表与代码片段）与 `_research/ofm-frontend.md`（前端逻辑，585 行、含定量统计）。
- 本次只做评估，未改任何代码。

## 0. 结论

**整体有高参考价值，但价值集中在"接入契约层"和"投放安全/前端基本功"，不在路由算法与状态架构。**

我们的网关路由（健康过滤 + 有效成本）比它成熟；它的架构强项我们恰恰缺：

1. **用宿主 `llm` 服务的三件套让模型清单真正动态化** —— `ctx.llm.registerAdapter(routeKeys, adapter)`（`index.js:436`）+ `registerConfigurableProviders`（`:437`）+ `registerModelDiscovery`（`:445`）。这直接解决我们"模型列表是静态配置、加站/换模型得手改 provider"的根问题（我们的 AutoDshCard 只能往静态名单里追加 id，见 `lib/dsh-models.js:154-168`）。**这是最有价值的一点。**
2. **"提交前才许换链"的缓冲提交协议** —— chunk 先入 `held`，只有 `commitsAnswer`（可见文本 / 流式 tool call）才提交；未提交的失败整链丢弃换下一个候选（`src/adapter.js:248-280`、`:495`）。我们的 `forwardToUpstream` 一旦写出首个 chunk 就 `committed = true`（`daemon/server.js:2212-2219`），首字节质量差就再也换不了站。
3. **失败词表把"是什么错"和"该不该冷却/换谁"分开** —— `kind/retryable/scope` 三件套 + `cooldownMs`（`src/route/classify.js:1-40`、`:427`）。我们的 `core/failure.js:16-26` 只做了"故障 vs 暂时不可用"两分法与冷却时长，缺 `scope`（request/account/provider/transient）这个决定"换不换候选、要不要动账号"的维度。

## 1. 对比表

| 维度 | our-free-model 做法（证据） | 本项目现状（证据） | 是否借鉴 | 理由 |
| --- | --- | --- | --- | --- |
| **注册方式** | `inject=['llm']` 硬依赖（`index.js:128`）；`registerAdapter([ROUTE_MAIN,ROUTE_REGION], adapter)` 占两个 provider 槽（`:436`）；`registerConfigurableProviders`（`:437`）+ `registerModelDiscovery`（`:445`）让模型列表进宿主选择器；路由变化时 `registration.replace(routes())`（`:460`） | 插件 Host 半边不碰 `llm` 的注册面：只 `inject(['webServer'])`（`lib/index.js:170`）、tee `llm/stream`（`:199`）、`tools/commands/systemPrompt`（`:255/:265/:294`）；模型接入完全依赖 profile 静态配置 `baseURL: http://127.0.0.1:4319/v1`（`C:\Users\ZYH\.dsh\profiles\desktop\cordis.patch.yml:60`），模型 id 靠 AutoDshCard 追加进 configEditor（`lib/dsh-models.js:154-168`） | **值得借鉴（最高优先）** | 我们此前认定"discovery 只服务自有 settings 命名空间"（见前端评审 R1 背景）——OFM 证明了正确姿势：先 `registerAdapter` 注册自有 route 与自有 `settingsNs`（`index.js:437-441`），discovery 才归属于自己。这条路能把"添加站点 → 模型自动出现在 DSH 选择器"闭环，而不是手写 JSON。风险：等于把网关提升为正式 adapter，需要实现 `listModels/resolveModel/prepareCall/stream` 四个方法（`src/adapter.js:107/121/151/165`）。 |
| **模型/provider 数据结构** | 多来源 catalog 合并去重：`[...freeCatalog, ...sealedCatalog, ...kiloCatalog, ...aggregateCatalog]` + `seen` 去重 + combos 追加（`src/core/runtime.js:84-96`）；模型条目字段 `id/name/contextWindow/maxOutput/vision`（`index.js:452-458`） | `state.modelIndex`（51 条 `{name,sites}`）由 daemon 从供给聚合；模型 id 就是上游 `modelKey`；无 contextWindow/vision 元数据；`state.ranked` 只有有价模型（`daemon/server.js:343-423`） | **部分值得借鉴** | 去重逻辑与"多来源合并"模式可借（我们的 `core/inventory.js` 已做 `normalizeModelKey`，但缺"多 provider 同名模型去重 + 能力元数据"）；能力元数据（上下文/多模态）我们确实没有，但对"选模型"帮助有限，优先级低。 |
| **模型选择与路由** | **无价格/延迟/成功率打分**：选择输入只有 `availability + settings`（`src/core/runtime.js:106-111`），语义是"可用性门 + 有序链"，逐候选试；`providerRetryPolicy`（`src/adapter.js:73`）只管重试策略 | 显式两步：健康过滤 + `有效成本 = 价格 ÷ 质量` 升序，全不可用时降级放行并标 `degraded`（`core/router.js:1-20`、`:32`）；质量来自探针评分 `core/score.js:335`（`isRoutable`）/`:464`（`effectiveCost`）；手动顺序 `manualOrder` 只影响可用项 | **不借鉴** | 我们的路由是**多维成本最优化**，OFM 是**可用性兜底**——两者目标不同。把打分换成有序链是退步。它唯一可借的是"逐候选试 + 每次失败换下一个"的执行纪律（我们已有：`daemon/server.js:2450-2470` 的 candidate 循环）。 |
| **密钥与鉴权** | 三段式掩码：AES-256-GCM + HKDF，shard 分散 `vault-data`/`vault-anchor`，每请求重解不缓存（`src/vault.js:35-46`、`:207-213`）；免费池零凭据硬带 `Bearer public`（`src/upstream.js:139-149`） | 网关 Key 明文存 daemon settings，`Bearer` 直接字符串比较（`daemon/server.js:2073-2078`）；插件快照已剥离 `gateway.keys[].key` 与 `providers[].adminToken`（`lib/routes.js:99-121`）；写操作走白名单代理（`lib/write-proxy.js:30-47`） | **部分值得借鉴** | 值得借：①"密钥不缓存、用时才解"的姿态；②免费池与付费池凭据分离（我们靠 `splitOffers` 逻辑分离，但同一份 store）。不值得照搬：它的 pepper 是硬编码常量（`src/vault.js:39` `MASK_PEPPER = 'd21f0a5c…'`），代码泄露即等于盐泄露——这是**反面教材**，我们要做就得从宿主环境取材料。 |
| **请求转发与流式** | 自建 OpenAI 兼容转发服务：loopback 绑定解析 + 端口扫描重试（`src/forward.js:160-305`）、LAN 中继（`:492-609`）、SSE 心跳 15s（`:679`）；协议转换到 anthropic/messages（`src/anthropic.js`） | daemon 内 `handleChatCompletions` 直接代理 `/v1/chat/completions` 与 `/v1/models`（`daemon/server.js:2583/2617`），客户端断开即 abort 上游（`:2317-2324`），首字超时/空闲超时（`:2152`），用量与路由决策落库（`:2465-2480`） | **不值得借鉴** | 我们已经有一个更贴合自身数据模型（offer/credential/group）的转发层；它的端口扫描/LAN 中继是为"独立进程 + 局域网共享"设计的，我们插件化后由 daemon 承担，重复造。 |
| **错误处理与降级** | 统一失败词表：`kind` + `retryable` + `scope(request/account/provider/transient)` + `cooldownMs`（`src/route/classify.js:1-40`），规则表文本优先于状态码、限流指数退避、上限 30 分钟（`:40-60` 注释与规则表） | 两分法：站点故障（算可用率）vs 供给暂时不可用（冷却不算故障），冷却表 `quota 30min / budget 5min / rate-limit 5min / model-missing 60min`（`core/failure.js:16-26`），冷却判定进 `score.blocked`（`core/score.js:209-211`） | **值得借鉴** | 我们的冷却**已经落地执行**（比 OFM 强：OFM 的 `cooldownMs` 全仓无写回 availability 的执行器，属"只算不用"），但缺 `scope` 维度：现在拿到 400 参数错也会记到站点头上。加 `scope=request` 直通（不冷却、不换站、原样报错）是一行规则表的收益。 |
| **提交/重试语义** | chunk 进 `held` 缓冲，`commitsAnswer`（可见文本或流式 tool call）为真才 flush；未提交失败丢弃并换下一候选；整体失败时把真实结局交回（`src/adapter.js:248-280`、`:495-500`） | 首个上游 chunk 到达即 `committed = true`（`daemon/server.js:2212-2219`），此后不换站；`committed:false` 的分支只有"未发出/首字超时/非 JSON"（`:2092-2188`） | **值得借鉴** | 可落地：把 `committed` 的判据从"写出首个 chunk"改为"写出首个**有内容**的 chunk"（过滤 `role` 帧、`content:""` 帧），能救"上游 200 但先吐垃圾/空帧"的场景。改动小、风险低。 |
| **状态暴露** | 全量快照 `buildSummary`（`index.js:2323` 起），无 light/增量/ETag；推送只有 SSE 公告/更新（`src/push.js:19` 25s 心跳） | GET `/state` 全量 407KB，`?light=1` 是空操作（实测 407,638 vs 407,640 字节）；同样无增量；轮询 15s（`lib/client.js:381`） | **不借鉴（它更差）** | 两边都缺瘦身。我们已在前端评审 P0-1 里立了"真裁剪到 <80KB"的项；OFM 没有可抄的实现，反而印证了这是通病。 |
| **前端数据获取** | 唯一 `api()` 封装：相对 base 解析（`client.js:2152-2154`）、8s AbortController 超时、`redirect:'error'`、非 2xx 折成 Error、慢路由按调用点放宽（`/bench` 240s、`/update/apply` 600s）（`client.js:2157-2179`）；+ 一条全局 SSE（`client.js:5991`，指数退避 30s→300s，连丢 5 次才 close，计数器刻意放在 `open()` 外 `client.js:5985-6007`）；+ **10 处 setInterval**（1s~90s，`client.js:2250/2871/3101/3285/3368/3811/3867/4145/4466/5576`） | 唯一 `fetchJson`（`lib/client.js:133-172`）+ 唯一 `setInterval` 15s（`:381`），**0 处 EventSource** | **部分借鉴** | 值得借：① `api()` 的"相对 base + 超时 + 错误归一"封装形态（我们的 `fetchJson` 已接近，但无超时）；② SSE + 指数退避用于**低频事件**（公告/更新/模型清单变更），替换我们对 `modelIndex` 的轮询。不值得照搬：10 个独立 interval 各自为政、无 `visibilitychange` 暂停（`visibilitychange` 命中 0 次）——我们单一轮询反而更干净。 |
| **状态管理** | 无集中 store：`createContext`/`useSyncExternalStore` 均 0；`useState` 96 次；props 下传（`client.js:5638` 一次喂 14 字段）+ 两个自研 hook（`useAsync:2261`、`usePanel:4698`）+ `window` CustomEvent 广播（`6026`） | 无 store：useState + props 下传 + `useApi` 单一 hook（`lib/client.js:340-401`）；`useApi` 无 catch、无竞态保护（前端评审 L2） | **部分借鉴** | 值得借：① `usePanel` 的"首答才出骨架、错误不清旧数据、写后不回读"（`client.js:4698-4718`）——正是我们现在缺的三态语义；② `generation` 序号作废在途请求（`client.js:3781-3796`），可直接补进 `useApi`。不值得照搬：整体无 store + 事件总线拼装，规模到 9 视图后会失控。 |
| **模型选择 UI** | 6 页设置（roster/看板/转发/渠道/日志/关于），roster 行带可用性标记与冷却剩余；"一键接入/DETECT MODELS"由宿主 `registerModelDiscovery` 提供（`index.js:445-460`） | v0.8.1 的 `AutoDshCard`：radio 单选未忽略模型 + 显示"N 个站/已在 DSH" + 点选写 configEditor 与默认模型（`src/parts/05-overview.js` 的 `AutoDshCard`；写入 `lib/dsh-models.js:154-168`） | **值得借鉴（改造而非照搬）** | 我们已有"选模型 → 写 DSH"的链路，缺的是**入口位置**：OFM 让宿主原生模型选择器就能看到它的模型（discovery），而我们是面板里自绘 radio。若采纳第 1 点，`AutoDshCard` 可降级为"高级/手动"入口，主路径走宿主选择器。 |
| **比价与展示** | 无价格概念（全仓无 price 字段） | `core/pricing.js` 价格/倍率、`state.ranked`、比价页三套视图（概览/比价/决策） | **不借鉴（它缺失，我们领先）** | 这是我们的核心资产。唯一可借的是数值列格式规范（右对齐/`tabular-nums`/`≈`/`—`），已在前端评审 P0-3 列过。 |
| **错误与加载态（前端）** | `usePanel` 三态 + errorText 归一；但 toast 无 `aria-live`（0 命中），危险动作零确认（rotate/update-apply/reload 均可一键）；tab 上 `aria-selected` 重复键（`client.js:5685-5686`） | 无 toast（只有 CSS）、无骨架屏、错误不可重试（前端评审 D3/D4/D9） | **部分借鉴** | 借它的 `usePanel` 三态与 errorText 归一；其余它也不达标，不能当范本（详见 `_research/ofm-frontend.md` 第 4 节缺陷清单）。 |
| **投放安全（HTML 渲染）** | 自写 HTML 白名单渲染器：tokenizer + 标签/属性/样式三重白名单 + `DROP_CONTENT_TAGS` + 4000 节点上限，**全程无 `innerHTML` 汇点**（`client.js:2323-2482`，`safeUrl:2332`、`sanitizeStyle:2343`），带 headless 测试钩子（`6156`） | 站点页图表直接拼 SVG 字符串注入 DOM，仅靠 `monitorEsc` 转义 4 个字符（`src/parts/10-monitor.js:141-144`） | **值得借鉴** | 公告/升级说明这类"服务端下发的 HTML"我们迟早要渲染；我们的 SVG 拼接目前可控（数据源是自建 daemon），但 `monitorEsc` 只覆盖 `& < > "`，属性名/URL 协议未校验。可先借它的 `safeUrl`/`sanitizeStyle` 两个函数思路，不必整体移植 tokenizer。 |
| **样式注入与宿主一致性** | 单段 864 行 CSS（`client.js:1281-2144`），`ctx.effect` 注入 `<style data-plugin>`、卸载 `remove()`（`5964-5970`），全部 `.ofm_` 前缀不污染全局；`var(--dsw-*)` 367 处但只有 11 个令牌、带 fallback 仅 5 处 | `lib/theme.js` 710 条规则全部 `.ma-root` 作用域，但 `--dsw-*` **0 处**；`THEME_CSS` 72KB 内联（`lib/client.js:34`） | **部分借鉴** | 作用域化我们已做到（甚至更彻底：`theme.js` 由母仓 CSS 生成）。可借：① 宿主令牌的**用法密度**（367 处说明它真的把视觉交给宿主）；② 卸载即移除样式的纪律（我们 `ctx.effect` 已做）。 |
| **可访问性** | `aria-*` 61 次、`role` 15 次、`tabIndex` 1 处、`onKeyDown` 3 个；modal 有 alertdialog+Escape+focus 但无 Tab 圈闭、不归还焦点（`client.js:2550-2594`） | `aria-*` 3 种、`role` 1 处、`tabIndex` 0（前端评审 D2/A17） | **部分借鉴** | 它在 a11y 上也不合格（tabIndex 1 处、无 live region），不能当范本；唯一可借是 dialog 的 alertdialog/Escape 骨架。我们的 P0-4/P1-3 方案已比它完整。 |

## 2. 借鉴清单（按优先级）

### P0-1 让模型清单进宿主选择器：`registerAdapter` + `registerConfigurableProviders` + `registerModelDiscovery`

- **改哪里**：
  - 新建 `lib/dsh-adapter.js`（Host 半边）：实现 `providerInfo / listModels / resolveModel / prepareCall / stream` 五个方法，`stream` 内部把请求转给 daemon `/v1/chat/completions`（复用现有 `lib/http.js` 与 `streamStats` tee）。
  - `lib/index.js`：`inject` 由 `['webServer']` 扩为 `['llm','webServer',...]`（惰性：`llm` 不可用时不注册 adapter），在 `apply` 里调 `ctx.llm.registerAdapter(['manage-api'], adapter)`、`registerConfigurableProviders([{provider:'manage-api', displayName:'ManageAPI', settingsNs: <本插件 id>, settingsPath: []}])`、`registerModelDiscovery(<插件 id>, async () => 模型行数组)`。
  - 模型行直接由 `state.modelIndex` 过滤 `ignoredModels` 生成（`id/name`，可选补 `contextWindow`）。
- **预期收益**：DSH 原生模型选择器里直接出现"ManageAPI 的模型"，用户不用进设置页点 radio；新增站点/同步模型后选择器自动更新（`ctx.emit('llm/adapters-updated')`），彻底解掉"模型列表静态配置"的根问题。前端 `AutoDshCard` 可退化为高级入口。
- **优先级**：P0（但工作量最大，约 2-3 天：adapter 五个方法 + 流式转换 + 测试）。
- **风险**：① 等于把插件变成"真 LLM provider"，任何 adapter bug 会直接影响对话主链路 → 必须先用 `scripts/check.mjs` + 一个 headless 假 daemon 做契约测试，再灰度（配置项 `exposeAdapter:false` 可一键关闭）；② 与现有 profile 里的静态 `llm-pi-ai` provider 有冲突风险（同名模型两处来源）→ 首版只做"新增 provider 槽位"，不删旧配置；③ 宿主版本漂移（`registerModelDiscovery` 是可选 API，`index.js:445` 用了 `?.`）→ 必须同 OFM 一样用 `?.` 做能力探测。

### P0-2 提交判据改为"首个有内容 chunk"

- **改哪里**：`D:\AgentWorkPlace\DSH\ManageAPI\daemon\server.js:2212-2219` 的 `committed = true` 分支，加内容判据（`delta.content` 非空 / `tool_calls` 存在 / 非 `role` 帧）；`committed` 之前的所有 chunk 入 `held` 缓冲，`committed` 时一次性 flush。
- **预期收益**：上游 200 但先吐空帧/`role` 帧/心跳帧时仍可换站，减少"用户看见空回答"的失败；同时让 `attempts` 统计更真实（现在这类会记成 success）。
- **优先级**：P0（半行级改动 + 一个回归用例）。
- **风险**：缓冲期内存（单请求最多几百 KB，可设 64KB 上限即 flush）；必须保证 `res.on('close')` 的 abort 仍能清空缓冲。

### P1-1 失败词表补 `scope`

- **改哪里**：`core/failure.js:26` 起的 `RULES` 表，每条加 `scope: 'request'|'account'|'provider'|'transient'`；`classifyFailure` 返回它；`daemon/server.js:2450-2470` 候选循环据此决定"换站 / 原样报错 / 冷却"。
- **预期收益**：参数错（400）不再冷却站点；限流（429）只冷却当日额度；`provider` 级故障跳过同站其余供给。直接减少"好站被闲置"的误判。
- **优先级**：P1（半天）。
- **风险**：规则表与 `score.blocked` 判定耦合，需要同步改 `core/score.js:209-211` 的冷却入口；改错会导致该冷却的不冷却 → 用现有 `scripts/*test*` 覆盖。

### P1-2 前端 `useApi` 补三态与竞态（合并 OFM 的 `usePanel` + `generation`）

- **改哪里**：`lib/client.js:340-401` —— 加 `epoch` 序号丢弃旧响应、`.catch` 转 `{ok:false,error}`、`reload()` 返回 `abort()`；错误态保留旧数据（"错误不清旧数据"）；骨架只在首答前出现。
- **预期收益**：断网/杀 daemon 不再永久卡"加载中"；快速切 tab 不再旧响应覆盖新数据。这是前端评审 P0-1/P0-2 的最小可行子集。
- **优先级**：P1（半天，可与 P0-1 的前端表达并行）。
- **风险**：改动集中在共享 hook，9 个视图行为同时变化 → 先加 check.mjs 的三态快照断言再改。

### P1-3 低频事件用 SSE 替代轮询（**仅限事件**，不动快照）

- **改哪里**：`lib/routes.js` 加 `GET /api/manage-api/events`（复用 `webServer.register` 的 held-open 响应 + 25s 心跳，参照 `src/push.js:19-62`）；`lib/client.js` 用一条 `EventSource` + 指数退避（参照 `client.js:5985-6007` 的计数器位置教训）订阅"模型清单变化/daemon 重启/公告"；快照仍走现有 15s 轮询。
- **预期收益**：模型清单/守护进程状态变化即时可见，不必等 15s；为 P0-1 的 `adapters-updated` 提供前端同步手段。
- **优先级**：P1（1 天）。
- **风险**：DSH `webServer` 是否允许 held-open 响应需实测（OFM 注释称允许且 gzip 跳过 event-stream，但那是它的实测，我们须自测）；必须清理 `close` 时从 hub 摘除，否则泄漏。

### P2-1 密钥处理姿态（只借原则）

- **改哪里**：母仓 `core/store.js` 的凭据加密（现为 AES-GCM，见 `lib/routes.js:99-121` 剥离的 `adminToken.iv/tag/data` 结构）+ `daemon/server.js:2073-2078` 网关 Key 比较改常量时间比较。
- **预期收益**：密钥不常驻内存（用时解）、比较不泄露长度；同时**反面吸取**：绝不像 `src/vault.js:39` 那样硬编码 pepper。
- **优先级**：P2（涉及母仓数据格式，需迁移）。
- **风险**：改动会碰已存数据，需要一次性迁移 + 回滚脚本；不做也不影响功能安全，只影响纵深防御。

## 3. 不建议借鉴清单

| 项 | 原因 |
| --- | --- |
| **无评分路由（可用性门 + 有序链）** | 我们的 `有效成本 = 价格 ÷ 质量`（`core/router.js:1-20`、`core/score.js:464`）是核心竞争力；换成有序链等于放弃"最划算"这个产品定位。 |
| **冷却只算不用** | OFM 的 `cooldownMs`（`classify.js:427`）全仓没有写回 availability 的执行器，属半成品；我们的冷却**真的执行**（`core/score.js:209-211` 的 `score.blocked` 参与 `isRoutable`），照搬会退步。 |
| **硬编码 pepper 的密钥掩码** | `src/vault.js:39` `MASK_PEPPER` 是源码常量，泄露即失效；密钥方案要么从宿主/OS 取材料，要么不做。 |
| **自建转发服务 + 端口扫描 + LAN 中继** | `src/forward.js:160-609` 是为"独立进程、局域网共享"设计的；我们已插件化、由 daemon 承担转发，重复实现只会多一处攻击面。 |
| **`GET /forward/key` 明文回吐** | `index.js:1966-1968` 原样返回 forward 密钥，仅靠 `trust.js:82` 的 loopback 篱笆；我们的同类接口一律不返回明文（`lib/routes.js:99-121` 已剥）。 |
| **10 个独立 `setInterval` 各自轮询、无 visibility 暂停** | `client.js:2250/2871/3101/3285/3368/3811/3867/4145/4466/5576`，`visibilitychange` 0 命中；我们单一 15s 轮询更干净，改成这样就等于把 P0-1 的"按需拉取"改回去。 |
| **无集中 store + window CustomEvent 总线** | OFM 靠 props 下传 14 字段 + 事件广播（`client.js:5638`、`6026`）；9 个视图规模下会失控。我们要的是"单一数据层 + 切片订阅"，不是这套拼装。 |
| **危险动作零确认** | rotate/update-apply/reload/reprobe 全部一键执行（`client.js:3313/3340/4637/3573/3625/5659`），确认只有 3 处且含 `window.confirm`（`3914`）；这是我们要在 P1-3 里避免的反面。 |
| **`aria-selected` 重复键等 a11y 半成品** | `client.js:5685-5686` 同一属性写两次，说明其 tablist 是未完成状态；不能作为我们的参照实现。 |
| **单文件 6000+ 行无构建的手写 bundle** | `client.js` 6162 行、CSS 864 行同文件；我们已有 `src/parts/*.js` + `tools/merge-views.mjs` 的分片构建，没必要退回单文件（但它的"无构建步骤"理念对基座层有参考价值——我们基座 1285 行手写、分片只覆盖视图，这点其实值得学它"全手工、无打包"的取舍）。 |

## 4. 一句话建议

**值得抄的是它的"接入契约"（llm 三件套 + 提交缓冲 + 失败 scope），不值得抄的是它的"路由算法"和"前端组织方式"。** 若只做一件事，做 P0-1：它同时解决"模型列表静态"和"模型选择入口分裂"两个真问题，并且能让 `AutoDshCard` 从"自绘 radio"退化成兜底入口。
