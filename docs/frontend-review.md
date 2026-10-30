# ManageAPI 插件前端评审：现状问题 · 可借鉴设计 · 改进方案

- 评审对象：`dsh-manage-api` v0.8.1（主面板 + 设置页 section，9 个视图）
- 评审基准：`lib/client.js`（7029 行构建产物）、`src/parts/*.js`（9 个源码分片，共 5381 行）、`lib/theme.js`（710 条作用域化 CSS 规则）
- 证据说明：所有结论均给出 `文件:行号`。逐条细目见同目录 `_research/audit.md`（70 条：A 逻辑层 40 条，B 设计层 30 条）与 `_research/references.md`（115 条参考结论）。本文件是在此之上的**归纳、排序与落地方案**。
- 环境限制：本次无法截图（本机 bsk 浏览器 daemon 起不来：`cannot start an independent Windows daemon; the host may prohibit Job Object breakaway`），视觉结论来自 CSS/结构与宿主令牌实测；实际观感请以面板为准。

---

## 一、现状问题

### 1.1 先看结论：四个根因

70 条问题不是 70 个独立缺陷，收敛后是四个结构性根因：

| 根因 | 表现 | 直接后果 |
| --- | --- | --- |
| **R1 没有统一数据层** | Shell 注入 `state` 与视图自取 `fetchJson` 两套并存；轮询无竞态保护、无 catch、无按需 | 一次网络抖动全站卡"加载中"；15s 拉 407KB 全量快照；旧响应覆盖新数据 |
| **R2 没有状态语义** | `state === null`（加载中/失败）与"真的没数据"共用 `{}`，各视图写法不一 | 首屏闪"还没有站点/暂无用量"；接口 500 被伪装成空态；错误态不可重试 |
| **R3 没有设计系统桥接** | 自带 48 个 CSS 变量、73 处硬编码色、11 种圆角；宿主 `--dsw-alias-*` 用了 **0 次** | 深浅色/圆角/字号/间距与宿主脱节；主题切换面板不跟随；视觉永远对不齐 |
| **R4 没有反馈与无障碍层** | 无 toast 层（`.toast` 只有 CSS）、无骨架屏、`aria-*` 仅 3 种、`tabIndex` 0 处、modal 无焦点管理 | 写操作静默失败、按钮永久禁用、键盘/读屏不可用、长任务无进度感 |

### 1.2 逻辑层（P0 全部，P1 择要）

| # | 问题 | 证据 | 影响 |
| --- | --- | --- | --- |
| L1 | **金额符号重复**：`fmtMoney` 自带 `¥`，概览页又拼 `sym` | `lib/client.js:186-190`、`src/parts/05-overview.js:212,253` | `¥¥12.00` / `$¥12.00`，金额直接错 |
| L2 | **轮询无竞态保护、无失败兜底**：`Promise.all([health,state])` 后无 `.catch`，`alive` 只在 interval 里判断 | `lib/client.js:340-401` | 一次抖动永久卡"加载中"；卸载后 setState |
| L3 | **重启失败被当成功**：`restart` 不看 `writeOp` 返回 | `lib/client.js:390-397` | 用户以为已重启 |
| L4 | **决策页死锁**：`fetchJson('state?full=1')` 无 `.catch`，刷新按钮 `disabled: loading` | `src/parts/60-decision.js:277-303,465` | 永久"正在读取全量快照"且无法重试 |
| L5 | **探针重复提交**：回车后 `blur()` 再触发 `onBlur`，去重守卫用闭包旧值 | `src/parts/70-probes.js:424-458` | 同值发两次 PATCH，可能回滚用户修改 |
| L6 | **全站轮询 407KB/15s**：`?light=1` 实测是空操作（407,638 vs 407,640 字节） | `lib/client.js:372-388`、实测 `curl -w size_download` | ≈1.6MB/分钟无差别传输；切 tab 不改变请求 |
| L7 | **加载态当空态**：`state=null` 时 7 处先判空再判 loading | `src/parts/05-overview.js:166-188`、`30-gateway.js:97-99`、`50-pricing.js:662`、`80-usage.js:215` 等 | 首屏闪"从添加一个中转站开始"，像配置丢了 |
| L8 | **状态 pill 首屏误报**：`health && health.daemon ? … : 'down'`，null 落 down | `lib/client.js:485-495` | 首屏红点"守护进程未运行" |
| L9 | **死 UI 与白名单脱节**：`PATCH /api/offers/:id`、`PUT /decisions/:model/order`、`POST /api/fx/refresh` 已在白名单，UI 仍禁用且文案自相矛盾 | `lib/write-proxy.js:43-45` vs `src/parts/50-pricing.js:626-639`、`40-benchmark.js:146-149` | 明明能写却写不了；同段文案既说"失焦即保存"又说"本面板为只读" |
| L10 | **用量 7/90 天永久禁用**：快照只有 30 天窗口 | `src/parts/80-usage.js:232-254` | 分段控件一半是死的，无解释入口 |
| L11 | **数字格式化 5 套并行**：`fmtMoney`/`gatewayTokens`/`usageFormatTokens`/`pricingMoney`/`monitorTokens`；`≈`/`—`/千分位口径不一 | `lib/client.js:186`、`30-gateway.js:30`、`80-usage.js:7`、`50-pricing.js:24`、`10-monitor.js:118` | 同一数字跨页不同样；负值渲染 `+-5%` |
| L12 | **双数据源、三处解包**：`viewProps` 同时给 `state`（信封）和 `api`；组件用 `pickState`、Shell 用 `api.state.state`、网关重建信封 | `lib/client.js:334-338,6792-6824`、`30-gateway.js:23-27` | 改一处漏两处；组件分不清"空"和"没拿到" |
| L13 | **随包发布死代码**：旧版 SitesTab/KeysTab/SiteWizard/PricesTab/DecisionsTab/ProbesTab/UsageTab 仍在 bundle，仅 `__internals` 暴露 | `lib/client.js:501-1283` | ≈780 行无人调用却被 review/grep；旧 KeysTab 还在渲染 Key，与"不再展示 Key"冲突 |
| L14 | **写路径普遍无 catch**：失败即永久 disable、无错误文案 | `src/parts/50-pricing.js:794-806`、`60-decision.js:359-383`、`70-probes.js:353-408` | 用户唯一出路是刷新整页 |
| L15 | **主题不跟随宿主切换**：`useTheme` 只订阅 `matchMedia` | `lib/client.js:233-283` | 宿主切深/浅色，面板保持旧色 |

### 1.3 设计层（P1 全部，P2 择要）

| # | 问题 | 证据 | 影响 |
| --- | --- | --- | --- |
| D1 | **9 个 tab 单行横排 + 双行文案 + 滚动条被隐藏** | `lib/client.js:322-332,50-51` | 1280px 下最后 2-3 个 tab 在视口外且**没有任何可滚动暗示** |
| D2 | **导航无 tablist 语义、无方向键** | `lib/client.js:6891-6913` | 键盘要 Tab 9 次；读屏只念"按钮" |
| D3 | **无骨架屏、无 spinner，加载只有一行灰字** | 全文件 `skeleton`=0 | 切 tab 一次"空了又满"，感知性能差 |
| D4 | **无 toast 层**：CSS 有 `.toast`，JS 从不渲染 | `lib/client.js:34` 仅样式 | 配合 L14 变成静默失败 |
| D5 | **与宿主视觉脱节**：`--dsw-*` 0 处；硬编码字号 8 种、圆角 11 种、hex 73 处 | `lib/theme.js`、`lib/client.js:34` | 同一屏出现"宿主风格 + 网页版风格"两套 |
| D6 | **KPI 卡三套实现**（概览 4 卡 / 监控 6 卡 / 用量 4 卡），密度单位各写一套 | `05-overview.js:38-63`、`10-monitor.js:279-336`、`80-usage.js:268-281` | 跨页对比时同指标长得不一样 |
| D7 | **表格语义与可读性**：无 caption/scope、不可排序、数字列未统一右对齐、`min-width:1000px` 12 列表 + sticky 首末列 | `lib/client.js:436-478`、`50-pricing.js:168-233` | 笔记本上价格列恰好被 sticky 挡住 |
| D8 | **空态只传达"这里空"**：单句文案，无插画/无下一步，不区分"没配"与"配了没数据" | `80-usage.js:32-38`、`40-benchmark.js:239-242` | 空态是最好的引导位被浪费 |
| D9 | **错误态不可操作**：只有一行文本，无重试、无错误码 | `60-decision.js:404-440`、`50-pricing.js:273` | 用户只能刷新整页且不知有没有用 |
| D10 | **灰按钮把 `title` 当唯一解释** | `20-free.js:195-197`、`50-pricing.js:99` | 触屏点不出 title，键盘拿不到 → 黑箱 |
| D11 | **开发者术语直接给用户看**："由当前快照派生""`POST /api/probes/run（limit: 1）`""大概 400KB""这个页面还没装好" | `10-monitor.js:720`、`70-probes.js:243,572`、`60-decision.js:466` | 用户读不懂也不知道做什么 |
| D12 | **关键数值只挂 hover**：图表靠 `onMouseMove` 读 `data-chart-day`，柱状图只有 `title` | `10-monitor.js:640-647`、`80-usage.js:63-93` | 触屏/键盘拿不到数值 |
| D13 | **模态框不完整**：点遮罩即关（丢勾选）、无 `aria-modal`/Esc/焦点陷阱 | `50-pricing.js:714-964` | 误点丢整轮勾选 |
| D14 | **标题层级假层级**：`h3.section-title` 与伪标题 `.group-head` 交替 | `30-gateway.js:166-170`、`60-decision.js:124-184` | 读屏拿不到文档大纲 |

### 1.4 值得保留的既有优点（改造时不要改坏）

严格区分 `null` 与 `0`（`10-monitor.js:26-30,92-98`）；图表断档不画假线（`10-monitor.js:477-486`）；SVG 注入前转义（`10-monitor.js:141-144`）；免费额度闸门可解释（`20-free.js:76-87`）；探针把权重算法摊开讲（`70-probes.js:69-183`）；基准价 `useMemo` 依赖正确（`40-benchmark.js:74-100`）；host 侧已剥离 `gateway.keys[].key` 与 `providers[].adminToken`（`lib/routes.js:100-121`）；写操作统一走白名单代理（`lib/routes.js:345-369`）；决策页是唯一把加载/错误/空态三分支分开的视图（`60-decision.js:404-440`）——**它就是其它视图改造的模板**。

---

## 二、可借鉴设计

参考对象都是本机已装的 DSH UI 插件（`C:\Users\ZYH\.dsh\profiles\desktop\node_modules\`）。先给一个横向事实核对，避免"抄错前提"：

| 维度 | task-board | skill-explorer | usage-billing | dsh-ops | rewind | 我们 v0.8.1 |
| --- | --- | --- | --- | --- | --- | --- |
| 宿主令牌 `var(--dsw-*)` | 244 处 | 77 处 | `--ds-*` 588 处（旧代 token） | 有 | 36 处 | **0 处** |
| `aria-*` / `role=` | 65 / 10 | 16 / 3 | 多处 | 有 | 9 / 0 | 3 种 / 1 |
| `tabIndex` | 5 | 0 | 有 | 有 | 0 | **0** |
| 骨架屏 skeleton | 0 | 0 | 0 | 0 | 0 | 0 |
| toast | 0 | 0 | 0 | 0 | 0 | 0（只有 CSS） |
| `data-testid` | 0 | 0 | 0 | 0 | 0 | 0 |

> 结论：**骨架屏、toast、testid 不是同类现状**——这三项我们做了就是领先，不是"补课"；真正要补的是官方的令牌体系、a11y 契约和错误/危险操作范式。

### 2.1 task-board：主面板骨架与交互契约（参考价值最高）

- **modal 无障碍全套**：`MODAL_STACK` 顶层判定 + `useDialog` 焦点进入/归还 + Tab 环绕 + Esc 仅在"进场腿"响应（避免退场再触发一次关闭）。证据 `task-board lib/client.js:4820-4900`。**适用：直接可用**——正好补我们 D13/A17。
- **错误按 cause 分档并写下一步**：`board.hostError.*` 区分 notMounted / ledgerLocked（带 `{pid}` 且明说"反复重启本实例无效"）/ unauthorized / forbidden / timeout / unreachable / unexpected。证据 `task-board lib/client.js:3437-3446`。**适用：直接可用**——把 L2/L4/L14 的原始 error 变成可读文案。
- **本地控制令牌 + data-* 状态驱动 + 44px 热区 + focus-visible 统一配方**：`--dsh-tb-control-h:30px/--dsh-tb-hit-size:44px`、`[data-status=running]` 配色、`:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary)}`、`@container (width<=768px)` + 移动端 `min-height:44px`、`prefers-reduced-motion` 全量关动效。证据 `task-board lib/client.js:4336`（压缩样式串）。**适用：部分适用**——令牌/热区/focus 配方照抄；横排列式看板骨架不适用。
- **顶部工具条模式**：搜索框 `flex:0 260px` + 密度切换 + 计数胶囊，全部 `var(--dsw-*)`。**适用**：可作为 9 tab 导航改造的替代形态（搜索/分组）。

### 2.2 skill-explorer：筛选与偏好持久化

- **facet 筛选条 + "轴内 OR / 轴间 AND"**：证据 `skill-explorer lib/client.js:1775-1900`。**适用**：比价页 51 条模型供给 + 45 个忽略模型，正需要一个"站点 × 厂牌 × 价格区间"的 facet 条。
- **搜索命中分级排序**：完全匹配 > 前缀 > 包含。证据 `:1345-1420`。**适用**：比价/探针的模型搜索。
- **偏好持久化四道保险**：key 带 `v1` 版本、64 条/8KB 上限、逐字段白名单校验、存不进不算错（降级为内存）。证据 `:1208-1340`。**适用**：我们需要记住 tab、密度、自动刷新开关、筛选条件——照这个写才不会把面板写崩。

### 2.3 usage-billing：表格数字与空态（压缩产物，按关键词引用）

- **数值列三件套**：`numCol`（右对齐 + `tabular-nums` + `nowrap`）、估算值前缀 `≈`、缺失值统一 `—`，格式化器用 `Intl.NumberFormat` 缓存 Map。证据：压缩产物关键词 `numCol`/`cellEstimateHint`（offset≈280486）、`task-board lib/client.js:7407-7422`。**适用：直接可用**——正好收掉 L11 的五套格式化。
- **设置页信息架构**：左侧分组导航（带图标）+ 右侧内容、开关/分段控件、密度与动效偏好、空态插画、range toggle。**适用：部分适用**——插画体量（96×64）对我们过重，但"分组导航 + 分段"正是 9 tab 平铺的解法。

### 2.4 dsh-ops：危险动作与表单

- **plan → 预览 → 可取消 execute**：`api.plan()` 返回 `details[]/available/reason`，`AbortController` 取消，失败结果带 `effectState:'unknown'` 并明说"可能已经发生更改"。证据 `dsh-ops/lib/client/runtime-panel.js:1-108`。**适用：直接可用**——我们的删除站点/同步模型/全部探测都是不可逆动作。
- **模块化组织**：`lib/client/{forms,index,locales,runtime-panel,selections,shell-form,styles}.js` 分文件，而不是单文件 7000 行。**适用**：长期可维护性方向（我们已有 `src/parts` + 合并脚本，可继续拆 `lib/` 侧的 `data/format/feedback/ui`）。

---

## 三、改进方案（按优先级）

排序原则：**先修"用户会踩到并卡死"的，再修"不好用"的，最后做"更专业"的**。每项给：现状问题 → 参考对象 → 具体改法 → 影响范围。

### P0（建议本周做，4 项，全部是"面板不可用/出错"级别）

#### P0-1 统一数据层：请求编号 + 失败兜底 + 按需拉取
- **现状**：L2/L4/L6/L14——无竞态保护、无 catch、407KB/15s。
- **参考**：`dsh-ops/lib/client/runtime-panel.js:5-36` 的 `refreshEpoch` + `cancellation.current?.abort()` + `mounted` 三重守卫；`task-board` 的 cause 分档错误。
- **改法**：
  1. 新增 `lib/client/data.js`（源码放 `src/`，构建时并入）：`createResource(path, {pollMs})` 返回 `{data, loading, error, reload, abort}`，内部 `epoch` 递增丢弃旧响应、`AbortController` 取消在飞请求、`.catch` 统一转 `{ok:false,error}`。
  2. `useApi` 改为基于它；health 与 state 分开管理（health 10s、state 按 tab）。
  3. 只有「概览/站点/比价/决策/探针」需要 state；「网关/用量/基准价」走各自轻接口。切 tab 才拉对应数据，`document.visibilityState !== 'visible'` 时暂停轮询。
  4. 顺手把 `?light=1` 换成服务端真裁剪（daemon 侧 `GET /api/state?light=1` 只回 `summary/modelIndex/settings/ranked`，目标 <80KB），或改为按需子接口。
- **影响范围**：`lib/client.js`（基座 340-401）、`src/parts/10-monitor.js`（自取数据改走同一资源）、`lib/routes.js`（可选裁剪）、`scripts/check.mjs`（加竞态用例）。
- **验收**：断网/杀 daemon 后面板显示可重试错误而非永久加载；`network` 里切 tab 不重复拉 400KB；两次快速刷新结果顺序正确。

#### P0-2 三态语义：加载 / 错误 / 空 三件套组件
- **现状**：L7/L8/L9(D9)——`null` 当空、错误当空、错误不可重试。
- **参考**：`task-board` 的 cause 分档文案；我们自己的 `60-decision.js:404-440` 三分支（直接推广）。
- **改法**：
  1. 新增 `<AsyncBoundary loading error empty onRetry>`（源码 `src/parts/00-state.js`），统一渲染骨架/错误卡（含"重试"与"复制诊断信息"）/空态（标题 + 一句为什么 + 主行动按钮）。
  2. `statusPill` 区分 `unknown/loading/down/up` 四态，首屏显示灰点"连接中"。
  3. 全站 7 处"先判空"改为 `AsyncBoundary` 包裹；错误态保留 `daemon` 原始 error 文案。
- **影响范围**：9 个视图 + Shell 顶栏；改动集中在各视图 return 外层，不动业务。
- **验收**：首屏不再闪"还没有站点"；接口 500 时出现"读不到数据 · 重试"；`check.mjs` 加三个状态快照断言。

#### P0-3 格式化与反馈收口：一个 `fmt` + 一个 `toast`
- **现状**：L1 金额 `¥¥`、L11 五套格式化、D4 无 toast、L5 重复提交。
- **参考**：`usage-billing` 的 `numCol/≈/—` + `Intl` 缓存；`task-board` 的 `focus-visible`/44px 热区。
- **改法**：
  1. `lib/format.js`（源码 `src/parts/00-format.js` 之上抽）：`money(v, {currency, digits})` 只返回数字+符号一处拼接；`compact/int/rate/ms/duration` 各一个；`tabular-nums` CSS 类统一。
  2. 全局 `<ToastHost>`：`notify({tone,title,desc,action})`，写操作成功/失败/需确认三类走它；`writeOp` 内部 catch 后自动 toast。
  3. 表单提交统一 `useSubmit()`：in-flight 期间 disable + 幂等键，回车与 blur 共用一个提交入口（修 L5）。
- **影响范围**：全站视图的数值渲染与写操作调用点（约 40 处），机械替换为主。
- **验收**：金额只出现 `¥12.00`/`$12.00`；所有写失败有 toast 且按钮恢复；探针输入只发一次 PATCH。

#### P0-4 导航可用性：可视滚动 + tablist 语义 + 入口分组
- **现状**：D1/D2——最后 2-3 个 tab 看不见；键盘不可达。
- **参考**：`skill-explorer`/`usage-billing` 的左侧分组导航；`task-board` 的 focus 配方。
- **改法**：
  1. 短期（1 天）：去掉隐藏滚动条，改 `scrollbar-width:thin` + 右侧渐隐遮罩；tab 加 `role=tablist/tab`、`aria-selected`、←→/Home/End 键盘、`aria-controls`。
  2. 中期：分两组——「看板」（概览/站点/用量）、「优化」（比价/智能决策/探针/网关/免费/基准价），组间加分隔与组标题；窄屏收成下拉/抽屉。
- **影响范围**：`lib/client.js` 顶栏与 EXTRA_CSS；纯 UI。
- **验收**：1280/1024 宽度下能发现全部 9 个入口；Tab 键进不去时 ←→ 可切换。

### P1（下一轮，5 项）

| 项 | 现状 | 参考 | 改法要点 | 影响面 |
| --- | --- | --- | --- | --- |
| P1-1 宿主令牌桥接 | 0 处 `--dsw-*`，73 硬编码色 | task-board 244 处 | `lib/theme.js` 改为「语义变量 → 宿主令牌」映射层：`--bg: var(--dsw-alias-bg-base, #fafafa)`、`--text: var(--dsw-alias-label-primary, #…)`、`--border: var(--dsw-alias-border-l2, …)`；删除深色第二套 token（宿主已适配）；保留 fallback 保证独立可用 | theme.js 生成脚本 + 全站视觉 |
| P1-2 骨架屏 | 0 处 | （同类也没有，属领先） | `<Skeleton variant="kpi/table/chart">`，首屏与切 tab 用骨架替代"空了又满" | AsyncBoundary 内 |
| P1-3 modal 契约 | 点遮罩即关、无 Esc/焦点陷阱 | task-board `useDialog` | 抽 `src/parts/00-dialog.js`：焦点进入/归还、Tab 环绕、Esc 仅进场腿、遮罩点击可配 `dismissable=false`、`aria-modal` | 忽略模型弹窗 + 站点向导 |
| P1-4 表格规范 | 12 列、sticky 挡价格、数字不齐 | usage-billing `numCol` | `<DataTable>`：列定义 `{key,label,width,align,render,sortable}`、`scope=col`、数字列 `tabular-nums`、空态/骨架内置、可选虚拟滚动 | 比价/探针/网关/用量四表 |
| P1-5 空态升级 | 单句文案 | usage-billing 空态 | 空态三要素：一句为什么 + 一个主行动 + 一个"看文档/查看示例"次行动；区分"没配/没数据/没权限" | 全站 9 处 empty |

### P2（择机，5 项）

- **P2-1 死代码清理**：删 `lib/client.js:501-1283` 旧版 Tab 组件与 `__internals` 里的旧导出，`check.mjs` 改为直接断言新视图（预计 -780 行、包体 -30KB）。
- **P2-2 主题跟随宿主**：`useTheme` 增加 `MutationObserver(document.documentElement[data-theme])`，宿主切换即时跟。
- **P2-3 i18n**：文案抽到 `locale/zh.json` + `en.json`，视图用 `t('key')`；先只抽导航/按钮/空态（约 120 条）。
- **P2-4 虚表/分页**：比价 51 行、探针明细、网关日志按需分页或虚拟化；`hidden` 详情行改条件渲染。
- **P2-5 数据新鲜度**：每个 KPI 卡加"截至 HH:mm:ss"，monitor 自取数据与 shell 轮询合并（L13/A11）。

### 落地顺序建议

```
第 1 周：P0-1（数据层）→ P0-3（格式化/toast）  ← 先把"卡死/报错"清掉
第 2 周：P0-2（三态）→ P0-4（导航）→ P1-2（骨架）
第 3 周：P1-1（令牌桥接）→ P1-4（表格）→ P1-3（modal）
之后按需：P1-5、P2-*
```

工程量估计：P0 合计约 3-4 个工作日（数据层 1.5d、三态 0.5d、格式化/toast 1d、导航 0.5d）；P1 合计约 4-5 天；P2 每项 0.5-1 天。每项都应在 `scripts/check.mjs` 增断言（当前 95 项），避免改回旧样子。

---

## 四、需要你确认的三件事

1. **P0-1 是否允许改 daemon 侧**：`?light=1` 现在实际不减包（407,638 vs 407,640 字节）。要真瘦身，需要在母仓 `daemon/server.js` 的 `/api/state` 里实现字段裁剪（只回 `summary/modelIndex/settings/ranked`）。不改也能做——客户端只拉需要的接口，但收益小一半。
2. **P1-1 是否接受"跟随宿主外观"**：改成桥接 `--dsw-*` 后，面板配色将由 DSH 主题决定（不再"网页版原色"），深浅色自动跟随；如果仍想保持网页版观感，就只做令牌 fallback + 手工深浅两套。
3. **落地方式**：先按顺序实现 P0 四项并逐项验收，还是先只做 P0-1 + P0-3 给你看效果再继续？
