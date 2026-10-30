# ManageAPI 前端现状审计

审计对象：`dsh-manage-api` v0.8.1 前端实现（主面板 + 设置页 section，9 个视图）。
只读审计，未修改任何源码。

## 证据定位说明

- 前端发布物是构建产物 `lib/client.js`（7029 行 / 354126 字节）：1-1285 为手写基座，1286 `// >>> parts:begin`，其后按 `src/parts/*.js` 文件名顺序内联，6684 `// <<< parts:end`，6685-7029 为尾部（CostChip / ManageShell / 注册）。
- 分片在 `lib/client.js` 中的行号 = `src/parts/NN-*.js` 行号 + 固定偏移：

| 分片 | 偏移 | 例 |
| --- | --- | --- |
| `src/parts/05-overview.js` | +1286 | 05:166 → client.js:1452 |
| `src/parts/10-monitor.js` | +1735 | 10:881 → client.js:2616 |
| `src/parts/20-free.js` | +3169 | 20:195 → client.js:3364 |
| `src/parts/30-gateway.js` | +3749 | 30:97 → client.js:3846 |
| `src/parts/40-benchmark.js` | +3934 | 40:111 → client.js:4045 |
| `src/parts/50-pricing.js` | +4211 | 50:626 → client.js:4837 |
| `src/parts/60-decision.js` | +5177 | 60:277 → client.js:5454 |
| `src/parts/70-probes.js` | +5685 | 70:353 → client.js:6038 |
| `src/parts/80-usage.js` | +6360 | 80:215 → client.js:6575 |

- 下表优先用 `src/parts/*.js:行号`（可维护的源），基座与尾部用 `lib/client.js:行号`。
- 一个必须知道的事实：`lib/client.js:34` 是**单行 72741 字符**的 `THEME_CSS` 字符串（由 `tools/embed-theme.mjs` 从 `lib/theme.js` 灌入）。因此任何 `grep` 类名/`aria`/颜色都会整行吐回 72KB；同时也意味着**同一张 72KB 样式表在发布包里存在两份**（`lib/theme.js` 76884 字节 + `lib/client.js` 内联）。
- 统计口径：`skeleton`/`spinner` 出现 0 次（无骨架屏）；`aria-` 全文件仅 6 处；`role:` 仅 1 处；`tabIndex` 0 处；`.focus()` 0 处；`.toast` 只存在于 CSS（JS 从未渲染）。

---

## A 逻辑层问题

| # | 问题 | 证据（文件:行号） | 影响 | 严重度 |
| --- | --- | --- | --- | --- |
| A1 | `useApi.reload` 无 in-flight 去重、无 AbortController；`alive` 只在 interval 回调里判断，`reload` 内部完全不检查。15s 轮询 + 手动刷新 + 写后 `reload()` 可同时在飞 | `lib/client.js:351-370`（reload）、`lib/client.js:372-388`（effect） | 慢响应时旧响应覆盖新响应；组件卸载后仍 `setHealth/setData/setBusy`，React 报内存泄漏警告 | P0 |
| A2 | `reload` 用 `Promise.all([health,state])` 且无 `.catch`：任一请求 reject 就跳过整个 `.then`，`setBusy(false)` 也不执行 | `lib/client.js:353-369` | 一次网络抖动即让全站"加载中"永久卡死，只能刷新整页 | P0 |
| A3 | `useApi.restart` 忽略 `writeOp` 的返回：失败时为 `{ok:false}` 但代码只 `.then` 不看结果，也没有 `.catch` | `lib/client.js:390-397` | 守护进程重启失败仍提示"完成"并 reload，用户以为已生效；失败时 busy 永真 | P0 |
| A4 | 视图层写操作统一 `writeOp(...).then()` 无 `.catch`，`busy` 状态只在成功分支复位 | `src/parts/50-pricing.js:794-806`、`src/parts/60-decision.js:359-383`、`src/parts/70-probes.js:353-371`、`src/parts/70-probes.js:373-390`、`src/parts/70-probes.js:392-408` | 失败即永久禁用按钮（保存/开关/全部探测），且无任何错误文案，用户只能刷新 | P0 |
| A5 | `AutoDshCard` 保存双触发：`label` 上挂 `onClick`（400）与 `radio` 上挂 `onChange`（407）都调 `save(name)`；守卫 `if (!model \|\| busy) return`（351）里的 `busy` 是 useState，同 tick 不更新 | `src/parts/05-overview.js:400`、`src/parts/05-overview.js:407`、`src/parts/05-overview.js:351` | 一次点击可能发两次 `POST /dsh-model`；键盘空格选中也走 onClick，行为不可预期 | P0 |
| A6 | 货币符号叠加：基座 `fmtMoney` 自带 `¥` 前缀，概览页又先算 `sym` 再 `sym + fmtMoney(...)` | `lib/client.js:186-190`、`src/parts/05-overview.js:212`、`src/parts/05-overview.js:253` | 出现 `¥¥12.00` 或 `$¥12.00`，金额直接显示错误 | P0 |
| A7 | `loadDecisions` 的 `.then` 无 `.catch`：fetch reject 时 `setLoading(false)` 永不执行，而刷新按钮 `disabled: loading` | `src/parts/60-decision.js:277-303`、`src/parts/60-decision.js:465` | 页面永久卡在"正在读取全量快照"，且唯一的重试入口被自己禁用——死锁 | P0 |
| A8 | 探针输入回车提交后会 `event.target.blur()`，onBlur 再次提交；去重守卫 `hours === savedMaxAge` 用的是未更新的闭包值 | `src/parts/70-probes.js:451-458`、`src/parts/70-probes.js:424-438` | 同一值发两次 PATCH；第二次可能带旧值把用户的修改回滚 | P0 |
| A9 | `statusPill` 用 `health && health.daemon ? ... : 'down'` 判守护进程状态，首屏 `health === null` 也落到 down | `lib/client.js:485-495` | 首屏显示红点"未运行"，把"加载中"误报成故障，是最容易被当成 bug 的体验问题 | P1 |
| A10 | 全站把 `state === null`（加载中/失败）与"真的没有数据"当同一件事，空态先于 loading 判定 | `src/parts/05-overview.js:166-188`、`src/parts/30-gateway.js:97-99`、`src/parts/30-gateway.js:162-164`、`src/parts/50-pricing.js:662-692`、`src/parts/60-decision.js:385-402`、`src/parts/70-probes.js:534-545`、`src/parts/80-usage.js:215-231` | 首屏 200~800ms 内 7 个视图齐刷刷显示"还没有站点/暂无用量/网关运行中"，用户以为是配置丢了 | P1 |
| A11 | 监控接口只在 `[days, reloadTick]` 变化时拉取，而 KPI（总余额/真实花费/24h 变动/未读告警）全部来自该接口 | `src/parts/10-monitor.js:1104-1124` | 同页出现两种新鲜度：站点状态 15s 一刷、KPI 停在打开页面那一刻，且无"数据截至"时间戳 | P1 |
| A12 | `days` 既是图表窗口又是 fetch 依赖 | `src/parts/10-monitor.js:1104`、`src/parts/10-monitor.js:1407` | 点"30 天"会把整份 monitor 数据（含 KPI/余额）重新请求一遍，交互成本远大于收益 | P1 |
| A13 | busy 用字符串 + 子串匹配表达行级状态：`String(ctx.busy\|\|'').indexOf(id) >= 0`；同时 `run` 里 `if (busy) return` 是全局互斥 | `src/parts/10-monitor.js:881`、`src/parts/10-monitor.js:1146` | 站点 id 互为子串时（`p1`/`p10`）忙态串台；点 A 时再点 B 无任何反馈（按钮没 disable，动作被静默丢弃） | P1 |
| A14 | 同步设置校验把非法值从 payload 里"悄悄拿掉"，全非法时报"三项都空着，没东西可保存" | `src/parts/10-monitor.js:1172-1185` | 用户明明填了值却被告知"空着"，且不知道哪一项非法、合法范围是什么 | P1 |
| A15 | 探针数值输入越界（`hours<1 \|\| >72`、`ms<0 \|\| >60000`）直接 `return`，输入被回退且无提示 | `src/parts/70-probes.js:427`、`src/parts/70-probes.js:435` | 用户输入 100 小时，页面静默变回 24，无法判断是保存成功还是被拒绝 | P1 |
| A16 | 比价页帮助文案自相矛盾：同一次渲染里既说"价格直接改，失焦即保存"，又说"本面板为只读…输入框已禁用" | `src/parts/50-pricing.js:632`、`src/parts/50-pricing.js:639` | 用户按第一句去点输入框，发现全是 disabled，信任受损 | P1 |
| A17 | 忽略模型弹窗：点遮罩直接关闭并丢弃未保存勾选；无 `role="dialog"`、无 `aria-modal`、无 Esc、无焦点陷阱 | `src/parts/50-pricing.js:714-964`、`src/parts/50-pricing.js:874-882` | 一次误点丢失整轮勾选；键盘/读屏用户无法感知这是模态框 | P1 |
| A18 | 保存成功后 `api.reload()` 不 await 且立刻 `onClose()`，无成功反馈 | `src/parts/50-pricing.js:803-804` | 乐观关闭，保存失败也只能在列表里发现"没生效"，没有 toast 可依赖 | P1 |
| A19 | `AutoDshCard` 的 info 只在 mount 拉一次（`useEffect(..., [])`，无 alive 守卫），页面 15s 轮询不会更新它 | `src/parts/05-overview.js:343-348` | 用户改了模型再回来看，卡片仍显示旧现状，与其它 KPI 的实时感冲突 | P1 |
| A20 | 双数据源/双解包口径并存：`viewProps` 同时传 `state`（信封）与 `api`，组件用 `pickState` 取 `env.state`，Shell 自己又取 `api.state.state`；网关还每渲染重建一次信封 | `lib/client.js:6792-6800`、`lib/client.js:6824`、`lib/client.js:334-338`、`src/parts/30-gateway.js:23-27` | 三处解包，改一处漏两处；组件无法判断拿到的 `{}` 是"空"还是"没拿到" | P1 |
| A21 | 数字/货币格式化有 5 套并行实现：`fmtMoney`、`gatewayTokens`、`usageFormatTokens`、`pricingMoney`、`monitorMoney/monitorTokens` | `lib/client.js:186-190`、`src/parts/30-gateway.js:30-36`、`src/parts/80-usage.js:7-13`、`src/parts/50-pricing.js:24-36`、`src/parts/10-monitor.js:118-131` | 同一个数字在不同页显示不同（`8M` vs `8,000,000`），A6 的 `¥¥` 只是其中一个后果 | P1 |
| A22 | 汇率回退常量 `7.2` 三处硬编码，三份 `Fx` 取数逻辑 | `src/parts/50-pricing.js:7-13`、`src/parts/40-benchmark.js:35-41`、`src/parts/10-monitor.js:8` | 汇率策略变更要改三处；三处对"汇率为 0/缺省"的处理还不一致 | P1 |
| A23 | 写成功后各视图各自 `api.reload()`，与 15s 轮询叠加且无合并 | `src/parts/70-probes.js:388`、`src/parts/70-probes.js:406`、`lib/client.js:372-388` | 一次"全部探测"触发多轮全量 state 拉取（每份含 providers/offers/gateway），写放大 | P1 |
| A24 | 概览页完全没有 error 分支：只处理 `state`，不读 `api.error`/`state.error` | `src/parts/05-overview.js:126-296` | 接口 500 时概览页显示为"什么都没有"，用户被引导去"新增站点"——错误被伪装成空态 | P1 |
| A25 | 大面积永久 disabled 的死 UI（不是权限灰度，是没实现）：比价 12 列表/复制供给/标为免费、网关开关、基准价导入三按钮+刷新汇率、免费页全部写操作、决策排序箭头、用量 7/90 天 | `src/parts/50-pricing.js:129-137`、`src/parts/50-pricing.js:168-233`、`src/parts/50-pricing.js:434-437`、`src/parts/30-gateway.js:109`、`src/parts/40-benchmark.js:146-149`、`src/parts/40-benchmark.js:206`、`src/parts/20-free.js:195-197`、`src/parts/60-decision.js:46-70`、`src/parts/80-usage.js:233-254` | 9 个 tab 里 5 个的主交互面不可用；用户学会"这个面板只能看"，等于把产品定位降级成只读看板 | P1 |
| A26 | 魔法数字散落各处：轮询 15000、决策节流 60000、每页 9 卡、每日柱最小高度 3、每 5 天一个标签、探针上限 72 小时 | `lib/client.js:375`、`src/parts/60-decision.js:283`、`src/parts/10-monitor.js:7`、`src/parts/10-monitor.js:77`、`src/parts/80-usage.js:77-78`、`src/parts/70-probes.js:427` | 调参靠全局搜索；同一语义（轮询/上限）没有单一来源 | P2 |
| A27 | `useMemo` 基本失效：monitor 依赖 `[state]` 而 `state` 每轮都是新对象；pricing 的 `ctx` 每次渲染新建对象，`panels` 的 memo 全量重算 | `src/parts/10-monitor.js:1126-1127`、`src/parts/50-pricing.js:572-586` | 15s 一次的全量重排实际没被 memo 拦住，大表场景白算 | P2 |
| A28 | 派生计算 O(n×m) 且每次渲染重算：每个 score 线性搜 offers/providers；每个 provider 里再 `filter` offers/creds；网关每行扫全量 offers | `src/parts/05-overview.js:136-158`、`src/parts/05-overview.js:202`、`src/parts/05-overview.js:258`、`src/parts/30-gateway.js:58-68`、`src/parts/70-probes.js:480` | 提供商/模型数增长后每 15s 出现明显掉帧 | P2 |
| A29 | 大表全量渲染，无虚拟化/分页：每个模型一张 12 列表、网关 200 行、探针详情行常驻 DOM 仅用 `hidden` 切换 | `src/parts/50-pricing.js:579-586`、`src/parts/30-gateway.js:138`、`src/parts/70-probes.js:255-263` | 几百模型时首屏秒级白屏；`hidden` 的详情行仍在布局/无障碍树里 | P2 |
| A30 | 索引当 key / 空表头占位：`'r' + ri`；决策面板用空 `<th>` 占 66px 列宽 | `lib/client.js:458-461`、`src/parts/60-decision.js:170` | 行增删时 React 复用错行（输入框/展开态串位）；空 th 让表格语义残缺 | P2 |
| A31 | i18n 全缺：时间格式硬编码 `'zh-CN'`，全部文案硬编码中文，`locale/*.json` 基本未使用 | `lib/client.js:223-230`、`locale/en.json`（258 字节）、`locale/zh.json`（231 字节） | 无法出英文版；CSS 里还留着网页版的 `lang-btn`/`lang-menu` 样式但没有对应 UI | P2 |
| A32 | 回调/对象每渲染重建（`ctx` 字面量、内联 `onClick: function(){}`），即便加 `React.memo` 也会失效 | `src/parts/10-monitor.js:1304-1307`、`src/parts/50-pricing.js:572-577` | 子组件无法 memo，与 A27 叠加 | P2 |
| A33 | 受控/非受控混用：汇率输入用 `defaultValue + onBlur`；基准价汇率用 `key: 'fx-'+rate` 强制重挂载；探针同一数字有 `draft/saved/edits` 三份状态 | `src/parts/10-monitor.js:990-1008`、`src/parts/40-benchmark.js:191-204`、`src/parts/70-probes.js:410-414` | 输入过程中被外部刷新覆盖或光标丢失；三份状态容易不同步 | P2 |
| A34 | 同一份 Shell 被注册两次（主面板 + 设置页 section），主题也注入了两次（apply 里一次 + Shell 的 effect 一次） | `lib/client.js:6920-6926`、`lib/client.js:6931`、`lib/client.js:6781-6783` | 靠 `injectStyle` 按 id 去重兜底才没重复插样式；两处注册参数一旦分叉就会出现"设置页和主面板不一样" | P2 |
| A35 | `CostChip` 的 `chipPending` 是模块级单例，第二个 sessionId 挂载时会拿到第一个 session 的 in-flight promise；`chipCache` 比对 key 但 pending 不比对 | `lib/client.js:6686-6706`、`lib/client.js:6708-6745` | 多会话并排时 token 数字串号（显示别人的用量） | P2 |
| A36 | 随包发布的旧实现死代码：基座 501-1283 保留整套旧版 SitesTab/KeysTab/PricesTab/DecisionsTab/ProbesTab/UsageTab，与分片新版功能重叠，只在 `__internals` 暴露；外加完全相同的 if/else 死分支 | `lib/client.js:501-1283`、`lib/client.js:6996-7027`、`lib/client.js:6815-6816` | 约 780 行无人调用的代码仍被 review、被 grep、被误改；旧实现自带独立缺陷（下面 B 部分个别项即来自它） | P2 |
| A37 | 复制网关地址：`navigator.clipboard.writeText` 不 await、无成功/失败反馈，无 `clipboard` 时静默跳过 | `src/parts/30-gateway.js:113-119` | 点了没反应，用户不知道是复制好了还是浏览器拦了；http 环境下 clipboard 不存在也没有兜底 | P1 |
| A38 | 基准价 `patchSettings` 无 in-flight 互斥、无 `.catch`，两次快速切换可并发 PATCH | `src/parts/40-benchmark.js:129-138` | 请求乱序时界面显示与后端最终值不一致；失败只有底部一行内联 hint | P1 |
| A39 | 基准价导入的 `<select id="import-provider">` 无 label，且同一区块三个按钮全 disabled —— 该 select 永远不会被读取 | `src/parts/40-benchmark.js:144`、`src/parts/40-benchmark.js:146-149` | 死控件：能选、能改，但没有代码读它 | P2 |
| A40 | 用量页 `.slice(0, 15)` 静默只渲染前 15 个模型，无"仅显示前 15"提示 | `src/parts/80-usage.js:177` | 用户以为只有 15 个模型有用量，实际被截断 | P1 |

---

## B 设计层问题

| # | 问题 | 证据（文件:行号） | 影响 | 严重度 |
| --- | --- | --- | --- | --- |
| B1 | 9 个 tab 单行横排 + 每个按钮带两行（标题 + `desc` 副标题），超宽就横向滚动，且 CSS 把滚动条隐藏了 | `lib/client.js:322-332`、`lib/client.js:50-51` | 1280px 下最后 2-3 个 tab 在视口外且**没有任何可滚动暗示**；用户不知道还有"探针/网关/用量/基准价" | P1 |
| B2 | 自绘 tab 导航无 `role="tablist"/"tab"/"aria-selected"`，无方向键、无 Home/End | `lib/client.js:6891-6913` | 读屏只念"按钮"；键盘用户要 Tab 9 次才能进内容区 | P1 |
| B3 | "自动刷新"开关用绿点表达状态，无 `aria-pressed`、无文字（开/关）；旁边还有一个孤立绿点（`health.probe.ok`）无文字无 title | `lib/client.js:6875-6888` | 两个绿点含义不同但外观一样；色觉障碍用户无法区分开/关 | P1 |
| B4 | 全站无骨架屏、无 spinner，加载态只有一行灰字（"正在读取监控数据…"等） | `src/parts/10-monitor.js:1377-1383`；全文件 `skeleton`/`spinner` 计数 0 | 每次切 tab 都是一次"页面空了又满"的跳动，感知性能差 | P1 |
| B5 | 没有 toast/通知层：CSS 里有 `.toast` 样式但 JS 从未渲染，写操作结果只能靠内联文本或无声消失 | `lib/client.js:34`（仅 CSS 定义）、`src/parts/40-benchmark.js:273` | 成功无反馈、失败易漏（配合 A4 变成静默失败），是 A 层多个问题的共同放大器 | P1 |
| B6 | 设置页 section 复用同一个 Shell 且 `initialTab: 'overview'`，9 个 tab 全量塞进设置页 | `lib/client.js:6920-6926` | 设置页里出现"概览/探针/网关"这类运维视图，与"设置"心智不符；两个入口的内容与状态互相独立 | P1 |
| B7 | KPI 卡有三套互不相干的实现（概览 4 卡 / 监控 6 卡 / 用量 4 卡），密度、字号、单位后缀各写一套 | `src/parts/05-overview.js:38-63`、`src/parts/10-monitor.js:279-336`、`src/parts/80-usage.js:268-281` | 跨页对比时同一指标长得不一样，视觉语言不统一 | P1 |
| B8 | 单位与量纲混排：同一张卡里主值 `¥`、副行 `$`；概览卡的单位有"条/个模型/%" | `src/parts/10-monitor.js:1207`、`src/parts/10-monitor.js:1220`、`src/parts/05-overview.js:41-45` | 用户要在脑内做两次换算才能读懂一张卡 | P1 |
| B9 | 标题层级混乱：`h3.section-title` 与 `.group-head` 里的伪标题（非 h 级）交替出现，形成"同级但不同级"的假层级 | `src/parts/30-gateway.js:166-170`、`src/parts/60-decision.js:124-184` | 读屏用户拿不到文档大纲；视觉上分组关系也靠边距猜 | P2 |
| B10 | 表格语义与可读性：无 `<caption>`、`<th>` 无 `scope`、不可排序、数字列未右对齐、金额与文本混在同一列 | `lib/client.js:436-478`、`src/parts/80-usage.js:283-320`、`src/parts/50-pricing.js:168-233` | 长表难以逐行对比；读屏无法把单元格归到表头 | P1 |
| B11 | 比价主表 12 列 + `min-width: 1000px` + 首列与末两列 sticky，窄屏只能横向拖 | `lib/client.js:34`（`.pricing-table{min-width:1000px}` 及 sticky 规则）、`src/parts/50-pricing.js:168-233` | 1024-1280px 笔记本上必须横向滚动才能看到价格列，而价格列恰好是被 sticky 挡住的那几列 | P1 |
| B12 | 断点碎片化：6 个宽度断点，其中 1040/1100/1180 三档仅差 40-60px，另有 `@container (max-width:400px)` 与 460px 两套容器查询 | `lib/theme.js:516`、`lib/theme.js:578`、`lib/theme.js:642`、`lib/theme.js:645`、`lib/theme.js:648` | 调一个断点要同时改 3-4 处；中间宽度出现"卡在两种布局之间"的畸形态 | P2 |
| B13 | 设计令牌形同虚设：`--fs-1..--fs-5` 定义了但全表 `var(--fs-` 使用 0 次，字号硬编码 8 种（12px×56、13px×35、11px×34…）；`border-radius` 出现 11 种取值 | `lib/theme.js:14`；`lib/client.js:34`（72KB 单行内） | 想统一调字号/圆角等于重写样式表；视觉细节永远对不齐 | P2 |
| B14 | 颜色双轨：CSS 有 `--` 令牌与深色主题，JS 里又硬编码调色板（`MONITOR_SERIES_COLORS` 8 色） | `src/parts/10-monitor.js:18-21`、`lib/theme.js:14` 等 | 深色主题下图表颜色不一定合规；改主题要改 JS | P2 |
| B15 | 密度过高：12px 正文 + 12 列表格 + 999px 胶囊徽标 + 卡片内再套表格，单屏信息量远超可扫读阈值 | `lib/client.js:34`、`src/parts/50-pricing.js:101-235` | 首次进入比价页不知道先看哪；扫读成本高 | P2 |
| B16 | 空态几乎都是单句"还没有 X / 无数据"，无插画、无下一步动作、不区分"没配"与"配了但没数据" | `src/parts/80-usage.js:32-38`、`src/parts/40-benchmark.js:239-242`、`src/parts/30-gateway.js:162-164` | 空态本是最好的引导位，现在只传达"这里空" | P1 |
| B17 | 错误态不可操作：有 error 分支的地方也只有一行文本，没有重试按钮、没有错误码/排查入口 | `src/parts/60-decision.js:404-440`、`src/parts/50-pricing.js:273` | 用户唯一能做的是刷新整页（且不知道刷新有没有用） | P1 |
| B18 | 开发者术语/实现细节直接给用户看："由当前快照派生：令牌 / 余额 / 暂停 / 路由失败"、`POST /api/probes/run（limit: 1）`、"大概 400KB"、"这个页面还没装好" | `src/parts/10-monitor.js:720`、`src/parts/70-probes.js:243`、`src/parts/70-probes.js:572`、`src/parts/60-decision.js:466`、`lib/client.js:481-483` | 用户读不懂"快照/派生/limit"，也不知道该做什么 | P1 |
| B19 | 永久 disabled 按钮把 `title` 当作唯一解释（触屏点不出 title，键盘也拿不到） | `src/parts/20-free.js:195-197`、`src/parts/50-pricing.js:99`、`src/parts/10-monitor.js:1022-1034` | 灰按钮 = 黑箱，用户既不知道为什么不能点，也不知道去哪里点 | P1 |
| B20 | 关键信息只挂在 hover 上：图表数值靠 `onMouseMove` 读 `data-chart-day`，用量柱状图只有 `title` | `src/parts/10-monitor.js:640-647`、`src/parts/80-usage.js:63-93` | 触屏与键盘用户完全拿不到数值（配合 A30 的 `title`-only 图表） | P1 |
| B21 | 同一列里数字口径不一：配额列 `8M`（压缩）与卡片 `8,000,000`（千分位）并存；`+` 号恒加导致负值渲染成 `+-5%`；0ms 显示成 `—` | `src/parts/20-free.js:299`、`src/parts/20-free.js:310`、`src/parts/50-pricing.js:232`、`src/parts/50-pricing.js:223` | 负增长看起来像笔误；0 与"无数据"混淆 | P1 |
| B22 | 时间格式三套口径：`fmtTime`（`zh-CN` 本地化）、`gatewayDateTime`（手写 `MM-DD HH:mm`，无年份无时区）、`monitorStamp` 各自为政 | `lib/client.js:223-230`、`src/parts/30-gateway.js:38-43` | 跨页看同一事件时间显示不同，跨年数据会显示错误 | P2 |
| B23 | 布局契约不一致：部分视图自己 `<section className="view wide">`，部分由 Shell 包 `.view`；`selfRoot` 标记决定是否重复包裹，属于不成文约定 | `lib/client.js:6815-6819`、`src/parts/10-monitor.js:1377-1383` | 新加视图很容易多套一层 padding 或漏掉 `wide`，导致栅格宽度不一致 | P2 |
| B24 | 深色主题有 token 与规则，但 UI 上没有任何切换入口（`data-ma-theme` 只能靠外部设置） | `lib/theme.js`（`.ma-root[data-ma-theme='dark']`）、`lib/client.js:6781-6783` | 70KB 深色样式白写；用户在暗色环境下面板偏亮 | P2 |
| B25 | 模态框视觉与行为不完整：无标题栏关闭按钮、点遮罩即关（丢数据）、层级依赖 `z-index` 硬编码 | `src/parts/50-pricing.js:714-964`、`src/parts/50-pricing.js:879-882` | 与 A17 叠加：既危险又不符合弹窗惯例 | P2 |
| B26 | 行级点击展开与行内按钮热区重叠（探针行整行 `onClick` 展开，行内还有运行按钮） | `src/parts/70-probes.js:203-213` | 点"运行"时可能同时触发展开/收起，界面跳动 | P2 |
| B27 | 复制类操作无"已复制"状态反馈（网关地址），按钮文案不变 | `src/parts/30-gateway.js:113-119` | 用户重复点击，或以为失败 | P2 |
| B28 | 长句硬塞进 KPI 卡/标题（"同样用 X，现在选「Y」最划算：¥0.19/百万 token，比最贵的站省 80%"） | `src/parts/05-overview.js:26-33` | 卡片高度被文案撑开，扫读时先读到句子而不是数字 | P2 |
| B29 | 徽标体系三套并存（`pill` / `chip` / `dot`），语义边界模糊，同一含义在不同页用不同形态 | `lib/client.js:34`、`src/parts/30-gateway.js:46-68`、`src/parts/10-monitor.js:38-41` | 视觉噪音；用户要重新学每种徽标的含义 | P2 |
| B30 | 72KB 样式表以单行字符串形式内联进 JS，同时 `lib/theme.js` 还发布了一份同样的内容 | `lib/client.js:34`、`lib/theme.js`、`tools/embed-theme.mjs:10-19` | 无法 diff/blame/按需加载；首屏必须解析完 72KB 字符串才能注入 | P2 |

---

## 亮点（值得保留的部分）

1. **金额空值处理克制**：`monitorNum` 严格区分 `null` 与 `0`（`src/parts/10-monitor.js:26-30`），`monitorCnyOf` 缺余额时返回 `null` 而不是拿 `0` 冒充（`src/parts/10-monitor.js:92-98`）。这是全站最该被推广的一条约定。
2. **图表不画假线**：数据断档处直接断开路径，不连线补点（`src/parts/10-monitor.js:477-486`）。
3. **SVG 注入前转义**：`monitorEsc` 对动态文案做 HTML 转义（`src/parts/10-monitor.js:141-144`），4 处 `dangerouslySetInnerHTML` 都有对应转义意识。
4. **免费额度闸门可解释**：`freeJudge` 不只给"能不能用"，还逐条给出理由与 80% 阈值（`src/parts/20-free.js:76-87`）；`freeDaysLeft` 明确"窗口不足半天不估速率"（`src/parts/20-free.js:67`）；`freeAggregate` 拒绝跨单位相加（`src/parts/20-free.js:127-134`）。
5. **探针把算法摊开讲**：`probesDetail` 用可读文案解释"可用率 × 完整性"、`×0.5/×0.3/×0.2` 权重、平滑规则，并注明"模型自述仅供参考"（`src/parts/70-probes.js:69-183`）；`655-657` 解释有效期与探测间隔的关系。
6. **有真正的 memo**：基准价页 `useMemo` 依赖正确（`src/parts/40-benchmark.js:74-100`），是全站少见的正例，可作为改造其它视图的模板。
7. **有"为什么"的文案**：基准价层叠逻辑留了"新用户全折叠会像导入失败"的注释与兜底（`src/parts/40-benchmark.js:110-111`），监控页有"最低余额"兜底文案（`src/parts/10-monitor.js:1188-1207`）。
8. **host 侧脱敏到位**：`gateway.keys[].key` 与 `providers[].adminToken` 在出站快照里被剥离（`lib/routes.js:100-121`），前端确实拿不到密钥——这解释了网关页删掉 Key 列是正确决策，而非功能缺失。
9. **写操作走白名单代理**：前端不直连 4319，统一 `POST /write {method,path,payload}`（`lib/routes.js:345-369`），并有 `checkLocalOrigin` 403 兜底（`lib/routes.js:141-145`）。
10. **加载/错误/空态三分支**：决策视图是唯一把三者分开的地方（`src/parts/60-decision.js:404-440`），其它视图应照此统一。
11. **常量集中**：tab 表、状态映射表（`PROBES_STATUS`/`MONITOR_SPEND_RANGES`/`PRICING_VENDOR_LABEL`）都是数据驱动，没有散落的 if-else 链（`lib/client.js:322-332`、`src/parts/70-probes.js:5-26`、`src/parts/10-monitor.js:11-15`）。
12. **CSS 作用域化**：整张样式表统一 `.ma-root` 前缀 + 深浅两套 token（`lib/theme.js`），不会污染宿主 DSH 的样式，这是复用网页版 CSS 的正确做法。
13. **节流意图明确**：决策页用 `stampRef` + 60s 节流避免重复拉 400KB 快照（`src/parts/60-decision.js:279-283`），思路对，只是失败路径没兜住（见 A7）。
14. **输入兜底**：监控页对"余额缺失"仍给出可读文案而不是空白（`src/parts/10-monitor.js:1188-1207`）。

---

## 统计

- A 逻辑层：40 条（P0 8 / P1 20 / P2 12）
- B 设计层：30 条（P0 0 / P1 16 / P2 14）
- 合计 70 条：P0 8 条、P1 36 条、P2 26 条

### 一句话结论

数据层先把"竞态 + 失败兜底"补齐（A1-A4、A7、A8），再统一 `null` 与空值的语义（A9、A10、A24）；设计层最划算的三件事是给 tab 导航加可视滚动提示与 aria（B1-B3）、建一套 toast（B5）、把五套数字格式化收成一套（A21）。
