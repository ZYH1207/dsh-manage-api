# 同类插件设计参考

> 调研对象：本机 `C:\Users\ZYH\.dsh\profiles\desktop\node_modules\` 下已安装的 6 个 DSH UI 插件。
> 方法：只读源码；`//#region` 标记完整的产物（task-board / skill-explorer）按行号取证；压缩产物（usage-billing 5 行、dsh-context 27 行）按**字符 offset + 片段关键词**取证并已注明。
> 缩写约定：`tb` = `@linxin666/dsh-client-ui-task-board/lib/client.js`；`se` = `@linxin666/dsh-client-ui-skill-explorer/lib/client.js`；`ub` = `@kenz1117/dsh-ui-usage-billing/lib/client.js`；`ops` = `dsh-ops/lib/client/*`；`rw` = `dsh-rewind-plugin/lib/client.js`；`ctx` = `dsh-context/lib/client.js`。
> 适用性口径：本项目 = 一个「多站点模型路由 / 比价 / 用量」面板（12 列比价宽表 + 用量图表 + 路由决策 + 设置页），已有 `ma-` 前缀样式与自研 token 层。

---

## 1. task-board（参考价值最高）

整体评价：唯一一个把**设计系统、无障碍契约、响应式、文案分档、面板注册**都写全的插件，且注释里直接写了「为什么这么做」。下面按「能直接抄」的程度排序。

### 可借鉴点

#### A. 样式工程

- **构建期 CSS Modules + 运行期 `<style>` 注入去重**：产物里每个 CSS Module 被编译成「一段字符串 `css$3` + 一个哈希类名映射对象」，注入前用 `document.querySelector('style[data-plugin-css=...]') === null` 守卫，`tag.dataset.plugin` / `tag.dataset.pluginCss` 双标记，同一模块重复加载不会出现第二份样式 —— 证据 `tb lib/client.js:4337-4344` —— 适用性：**适合**（本项目 `injectStyle(doc,id,css)` 已是同一思路，但缺「模块级 tagId + dataset 双标记」，补齐即可获得 HMR/多实例安全）。
- **类名哈希前缀 + 语义映射表，源码里只用语义名**：编译产物是 `board_module_css_default = { board: "_7D6uKa_board", boardHeader: "_7D6uKa_boardHeader", … }`（键按字母序），组件里一律 `board_module_css_default.modalBackdrop`，组合类名用模板串拼 —— 证据 `tb lib/client.js:4345-4460`（映射表）、`tb lib/client.js:4927`（使用） —— 适用性：**部分适合**。本项目是手写 `ma-` 前缀字符串拼接，已足够；但「组合类名统一走一个小工具/模板串」值得照抄，避免出现 `ma-x ma-x--active` 手写三遍。
- **零硬编码颜色，全部走宿主设计令牌**：整套 CSS 只用 `var(--dsw-alias-bg-base)` / `-bg-layer-2` / `-bg-mask-1` / `-label-primary|secondary|tertiary` / `-border-l1..l4` / `-separator-primary` / `-interactive-bg-hover` / `-state-warn|success|error|business-primary` / `-button-primary-fill|hover` / `--dsw-specific-input-major` / `--dsw-shadow-lv1|lv2|lv3` / `--dsw-font-family`；唯一硬编码是 6 组标签色与 `#0000`（透明） —— 证据 `tb lib/client.js:4336`（整行 CSS 声明块） —— 适用性：**适合**。本项目自研 token 层（`--surface/--border/--faint`）与之并行不冲突，但**建议加一层别名**：`--ma-surface: var(--dsw-alias-bg-base, #fff)`，让皮肤切换自动生效（见 §4 dsh-ops 的兜底写法）。
- **本地控制令牌集中在根节点，一处改全局**：`._7D6uKa_board{--dsh-tb-control-h:30px;--dsh-tb-control-radius:8px;--dsh-tb-control-gap:8px;--dsh-tb-icon-size:30px;--dsh-tb-hit-size:44px;--dsh-tb-motion-enter:.16s;--dsh-tb-motion-close:.14s;--dsh-tb-ease:cubic-bezier(.2,0,0,1)}`，之后所有按钮/输入/下拉统一 `height:var(--dsh-tb-control-h)` —— 证据 `tb lib/client.js:4336` —— 适用性：**最适合本项目**。比价页有 6 类控件（按钮/输入/下拉/分段/搜索/图标钮），统一 3 个令牌就能获得一致的行高与密度，且天然给「紧凑度切换」留了钩子（改根节点一个变量即可）。
- **容器查询取代 media query**：根节点 `container:_7D6uKa_task-board-view/inline-size`，之后全用 `@container _7D6uKa_task-board-view (width<=768px) / (720px) / (600px)` —— 证据 `tb lib/client.js:4336`（`@container` 段） —— 适用性：**适合**。本项目面板既可挂 sidebar 又可挂 main，宽度不确定；用容器查询后「窄容器→竖排、宽容器→12 列表格」是同一份 CSS，不需要 JS 量宽度。
- **移动端滚动画廊式看板**：`grid-auto-columns:86cqw` + `scroll-snap-type:inline mandatory` + `scroll-snap-align:start` + `padding-inline:2px 14cqw`（故意露出下一列的 14%）+ 隐藏滚动条 —— 证据 `tb lib/client.js:4336`（`@container … width<=768px` 内 `.columns` 段） —— 适用性：**不适合**（列式看板的产物；本项目比价是「行式宽表」，横向滚动靠 sticky 首末列解决，见 §7 结论）。
- **30px 图标按钮配 44px 触控热区（伪元素外扩）**：`._7D6uKa_iconButton:after{content:"";width:var(--dsh-tb-hit-size);height:var(--dsh-tb-hit-size);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}` —— 证据 `tb lib/client.js:4336` —— 适用性：**最适合本项目**。比价表行内会有刷新/探测/收藏类小图标，视觉必须小（30px 内）、热区必须大，这一招零成本。
- **focus-visible 一个分组选择器覆盖全部交互元素**：`._7D6uKa_primaryButton:focus-visible,._7D6uKa_ghostButton:focus-visible,…._7D6uKa_formSectionHeader:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}`，卡片内层改用 `outline-offset:-2px` 以免被 `overflow:hidden` 裁掉 —— 证据 `tb lib/client.js:4336`（文件末尾 focus 段）、`tb lib/client.js:4336`（`.cardOpen:focus-visible`） —— 适用性：**适合**。本项目目前依赖浏览器默认 outline，统一配方后键盘导航才像成品。
- **过渡只列属性、不用 `all`**：`transition:background-color .12s,color .12s,border-color .12s,outline-color .12s,box-shadow .12s,transform .12s`；按压 `translateY(1px)`，卡片 hover `translateY(-1px)+shadow-lv2`，紧凑态 `[data-compact]:hover{box-shadow:none;transform:none}` —— 证据 `tb lib/client.js:4336`（末尾 transition/active 段） —— 适用性：**适合**（`all` 会让表格行高变化时抖一下）。
- **`prefers-reduced-motion` 整体降级**：同一段里把上述 transition 全部 `transition:none`、spinner `animation:none`、modal 动画换成纯 opacity 的 `dshTbBackdropIn/Out` —— 证据 `tb lib/client.js:4336`（`@media (prefers-reduced-motion:reduce)` 段） —— 适用性：**适合**（本项目有脉动/流式效果，用户关动效后应只剩数值更新）。
- **状态用 `data-*` 属性驱动 CSS，一行一个状态**：`[data-status=backlog|todo|running|done|failed]`、`[data-tone=running|succeeded|failed|cancelled]`、`[data-compact]`、`[data-active]`、`[data-open=true]`、`[data-state=closing]`、`[data-result]`、`[data-clamped=true]`、`[data-declared]` —— 证据 `tb lib/client.js:4336`（`.statusDot[data-status=todo]{background:var(--dsw-alias-state-business-primary)}` 等 5 行连排） —— 适用性：**最适合本项目**。比价行的「在售/探测失败/未探测/限流」、站点的「可用/异常/冷却」都能这样一行一个状态，不用给每种组合造类名。
- **卡片左缘 3px 状态条（伪元素，不吃布局）**：`._7D6uKa_card:before{content:"";pointer-events:none;background:0 0;width:3px;position:absolute;inset:0 auto 0 0}` + `._7D6uKa_card[data-tone=running]:before{background:var(--dsw-alias-state-warn-primary)}` —— 证据 `tb lib/client.js:4336` —— 适用性：**适合**（比价行左缘标「最便宜/最贵」色条，比在单元格里加色块更省横向空间）。
- **6 色标签体系：同色 RGB + 18% / 40% 两级 alpha**：`[data-tag-tone="0"]{--dsh-task-tag-fill:#4e93e82e;--dsh-task-tag-border:#4e93e866}`，标签与前端的筛选 chip **共用这两个局部变量**，active 时才填 `fill` —— 证据 `tb lib/client.js:4336`（`cardTag/tagChip[data-tag-tone="0..5"]` 6 行） —— 适用性：**适合**。本项目「站点分组/供给类型」需要 ≤6 种可区分配色（蓝 `#4e93e8`、绿 `#2ea36a`、橙 `#d08a2a`、紫 `#b456c8`、粉 `#cf5f7a`、青 `#4a9fb5`），`#RRGGBB2E` 这种写法在明暗主题下都不会脏。
- **溢出渐隐而不是「展开更多」按钮常驻**：`._7D6uKa_clampBody[data-clamped=true]{max-height:160px;overflow:hidden}` + `:after{background:linear-gradient(to bottom, transparent, var(--dsw-alias-bg-base));height:44px}` —— 证据 `tb lib/client.js:4336` —— 适用性：**适合**（长 JSON/探测原始响应预览）。
- **滚动条自绘（细、圆、可悬停加深）**：`scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3) var(--dsw-alias-interactive-bg-hover)` + `::-webkit-scrollbar{height:10px}` + thumb `background-clip:content-box;border:2px solid #0000;border-radius:999px` —— 证据 `tb lib/client.js:4336`（`.columns` 段） —— 适用性：**适合**（12 列宽表的横向滚动条是最容易被看漏的细节）。
- **按钮只有四档，disabled 用两档透明度**：`primaryButton`（`button-primary-fill`，`:hover` 换 `-hover`）/`dangerButton`（`state-error-primary` + `hover filter:brightness(1.08)`、`active brightness(.94)`）/`ghostButton`（`border-l2` 描边，`[data-active=true]` 时变实心主色）/`iconButton`/`linkButton`；disabled `opacity:.5`（实心钮）与 `.45`（ghost/icon） —— 证据 `tb lib/client.js:4336`（按钮段） —— 适用性：**适合**（本项目已有主/次/文字钮，缺 danger 与 active 态统一）。
- **spinner 用半透明边框法，10px**：`._7D6uKa_cardSpinner{border:2px solid var(--dsw-alias-state-warn-primary);border-top-color:#0000;border-radius:50%;width:10px;height:10px;animation:.8s linear infinite _7D6uKa_dshTbSpin}` —— 证据 `tb lib/client.js:4336` —— 适用性：**适合**（比价表「正在探测」的行内指示，尺寸小到不撑行）。

#### B. 图标体系

- **统一 stroke 配方常量 + 极薄包装组件，每个图标只有一条 `path`**：`const GLYPH = { viewBox:"0 0 16 16", fill:"none", stroke:"currentColor", strokeWidth:1.3, strokeLinecap:"round", strokeLinejoin:"round", "aria-hidden": true }`，`function Glyph({size=14, children}) => <svg {...GLYPH} width={size} height={size}>{children}</svg>`，之后 `IconPlus = "M8 3.5v9M3.5 8h9"`、`IconClose = "M4.5 4.5l7 7M11.5 4.5l-7 7"`、`IconChevronLeft = "M10 3.5 5.5 8 10 12.5"` —— 证据 `tb lib/client.js:4464-4481` —— 适用性：**最适合本项目**。本项目图标散在各分片，照抄这 15 行即可统一：16×16 画布、1.3 描边、圆头、`currentColor`、默认 14px、`aria-hidden`。
- **面板入口图标单独实现但参数对齐 shell**：`TaskBoardPanelIcon` 用同样 `viewBox 0 0 16 16` + `stroke 1.3` + `currentColor`，额外带 `data-dsh-panel-entry={TASK_BOARD_PANEL_ID}` 供皮肤认领 —— 证据 `tb lib/client.js:11100-11120` —— 适用性：**适合**（本项目若挂 sidebar 行，图标必须能跟随 shell 的 size/颜色）。

#### C. 布局骨架与信息层级

- **三层骨架 + header 收口所有全局工具**：`<div.board>` → `<header.boardHeader>`（返回钮 + `<h2.boardTitle>` + host meta `<span.detailMeta>` + `<div.boardTools>` 右对齐工具区）→ 内容区。`board{padding:14px 16px 16px;gap:12px;display:flex;flex-direction:column;height:100%;min-height:0}`，`boardTools{flex:auto;justify-content:flex-end;margin-left:auto;min-width:0}` —— 证据 `tb lib/client.js:10608-10700`（状态）、`tb lib/client.js:10740-10795`（JSX） —— 适用性：**最适合本项目**。比价页 = header（标题 + 币种/站点筛选 + 搜索 + 刷新）+ 主体宽表，直接套这个 DOM 顺序；`min-width:0` 与 `margin-left:auto` 是让右对齐工具区不被长标题挤爆的关键。
- **列头 = 状态点 + 标题 + 计数 pill**：`columnHeader` 内 `<span.statusDot data-status=...>`（8px 圆点）+ `<h3.columnTitle>` + `<span.columnCount>`（`background:interactive-bg-hover;border-radius:999px;padding:1px 8px`），计数用 pill 而不是括号 —— 证据 `tb lib/client.js:4336`（`.columnHeader/.columnCount/.statusDot`）、`tb lib/client.js:4336`（`.statusDot[data-status=…]` 5 行） —— 适用性：**适合**（分组表头「站点组 + 条数」）。
- **整卡可点但避免按钮嵌套**：卡片内铺一层绝对定位透明 `<button.cardOpen aria-label={title}>`（`inset:0;z-index:0`），内容层用 `._7D6uKa_card > :not(._7D6uKa_cardOpen){z-index:1;position:relative}` 抬起来 —— 证据 `tb lib/client.js:4336` —— 适用性：**适合**（比价行点击打开站点详情时同理；行内已有按钮，用 `<tr onClick>` + `role` 会丢键盘可达性）。
- **搜索框固定 260px、移动端整行**：`.search{height:var(--dsh-tb-control-h);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);flex:0 260px}`，窄容器下 `flex:1 0 100%` —— 证据 `tb lib/client.js:4336` —— 适用性：**适合**。
- **空态是一句话，不是插画、不是「暂无数据」**：`.columnEmpty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 8px;font-size:12px}`，文案 `board.empty` =「这个状态还没有任务」、`archive.empty` =「没有已归档的任务」 —— 证据 `tb lib/client.js:4336`（`.columnEmpty`）、`tb lib/client.js:3420+`（locales） —— 适用性：**适合**（比价表空态应说「当前筛选下没有可比的站点，试试清除缓存维度」这类可执行的话）。

#### D. 表格/列表的数据逻辑

- **筛选组合的「互相让路」规则**：`searchActive = filter.trim() !== "" || tagFilter.length > 0`，`hidingSubtasks = hideSubtasks && !searchActive` —— 一旦开始搜索就自动取消「隐藏子任务」，避免「明明有却搜不到」；`visible = onBoard.filter(t => (projectId===""||…) && (!hidingSubtasks||t.parentId===void 0) && matchesFilter(t,filter) && matchesTagFilter(t,tagFilter))` —— 证据 `tb lib/client.js:10655-10662` —— 适用性：**最适合本项目**。比价页有「只看有价的 / 只看某分组 / 隐藏未探测」三个开关，任何一个与搜索叠加时都可能把结果清零；抄这条「搜索激活时放宽收窄型开关」的规则即可。
- **搜索覆盖全部可见字段，并支持 `#` 前缀**：`matchesFilter`（`tb lib/client.js:10552-10568`）= `trim().toLowerCase()`，空则全通过；`query.startsWith("#") ? query.slice(1) : query`；haystack 由 title + description + 标签名 + 目标/进度/下一步 + 递归展开的集成分支（`collectSearchLeaves`）拼成，`some(text => text.toLowerCase().includes(needle))` —— 证据 `tb lib/client.js:10552-10568` —— 适用性：**适合**。比价搜的不应只是站点名，还应含上游模型名、分组、备注 —— 否则「搜 glm 找不到」。
- **多选筛选用合取而不是并集，且注释写明理由**：`matchesTagFilter` = `selected.every(name => names.has(name))`，注释解释「加选第二个标签若用并集，会把无关卡片拉回来」 —— 证据 `tb lib/client.js:10569-10582` —— 适用性：**部分适合**。站点多选通常期望并集（选 A 站或 B 站），但「模型 × 分组」这种维度轴应各自合取 —— 结论：**同一轴内并集、不同轴之间交集**（与 §2 skill-explorer 的做法一致，两家在此互相印证）。
- **偏好落 localStorage，按列独立记忆**：`compactColumns` 初值 `useState(() => readCompactColumns(globalThis.localStorage))`，切换时 `writeCompactColumns(globalThis.localStorage, next)` —— 证据 `tb lib/client.js:10612`、`tb lib/client.js:10689` —— 适用性：**适合**（比价页「紧凑/舒适」密度、隐藏列、币种都应记住）。
- **分组头带计数与展开语义**：组头 `cardGroupHeader`（11px/600/`label-tertiary`）+ `cardGroupCount` + 右侧 `linkButton` 带 `aria-expanded`，折叠按钮文案带数量 `board.group.expand {count}` —— 证据 `tb lib/client.js:10725-10740`、`tb lib/client.js:10734` —— 适用性：**适合**（按「供给类型 / 站点地区」分组时）。
- **把数据口径写进 header**：`board.hostMeta {revision, timeZone}` 直接显示「数据版本 + 时区」 —— 证据 `tb lib/client.js:10740-10795`、`tb lib/client.js:3420+`（`board.hostMeta` 插值 `{revision, timeZone}`） —— 适用性：**最适合本项目**。比价/用量的数字极易被误解（汇率、单位、抓取时间），header 尾放 `最后抓取 12:03 · 汇率 7.12 · 单位 ¥/百万` 三件套能消掉一半客服问题。

#### E. 数据格式化

- **`Intl` 格式化器按 key 缓存**：`HOST_TIMESTAMP_FORMATS = new Map()` + `hostTimestampFormat(timeZone)`，注释写明「构造 `Intl.DateTimeFormat` 比格式化贵几个数量级，看板每帧渲染几十个时间戳」；`CARD_DATE_FORMATS` 同法；`try/catch` 兜底 `toISOString()` —— 证据 `tb lib/client.js:7407-7422`、`tb lib/client.js:7446` —— 适用性：**最适合本项目**。比价表一次渲染 10 站 × 12 列，金额格式化器同理必须缓存（`Intl.NumberFormat` 按 currency+locale+digits 建 Map）。
- **相对时间优先，且时区口径统一**：`formatTime` / `formatCardTime` = `<1min → t("time.justNow")`、`<60min → "{n}m"`、`<1440min → "{n}h"`、否则按 Host 时区出 `YYYY-MM-DD`（`en-CA` + `2-digit`）；注释点明「卡片绝不显示浏览器本地日期再配 Host 时区 tooltip」 —— 证据 `tb lib/client.js:7427`、`tb lib/client.js:7456` —— 适用性：**适合**（「3 分钟前抓取」比「2026-10-31 02:00」更可读，但悬停要给绝对时间）。

#### F. 状态、反馈与无障碍契约

- **`usePresence(open, exitMs=140)`：先播退场动画再卸载**：返回 `{mounted, phase}`，关闭时先 `phase:"closing"` 挂 140ms 定时器再卸载；DOM 上 `data-state={phase}` 驱动 `dshTbBackdropOut` / `dshTbSurfaceOut` —— 证据 `tb lib/client.js:4789-4820` —— 适用性：**适合**（本项目弹窗/抽屉若加动效，这是唯一不闪的实现方式）。
- **`useDialog` 一整套 modal 契约（最值得逐条抄）**：① `attach` 回调 ref 记录节点并首次聚焦，优先 `node.querySelector("[data-dsh-autofocus]")` 否则节点自身；② 卸载时若 `document.activeElement` 记录的 opener 仍 `isConnected` 就 `restore.focus()`；③ `MODAL_STACK` + `topMostDialog()` 让**只有最上层**响应键盘，嵌套确认框时一次 Esc 只关一层；④ Esc 仅在 `phase !== "closing"` 时生效，防退场重复关闭；⑤ Tab/Shift+Tab 在 `FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'` 内环绕 —— 证据 `tb lib/client.js:4820-4900` —— 适用性：**最适合本项目**。这 5 条是目前本项目最大的无障碍缺口，且全部是纯 JS，不依赖任何库。
- **确认框用 `role="alertdialog"` + 遮罩「按下即关」**：`<div role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} className={modal}>`，`onMouseDown={dialog.onMouseDown}` 挂在 backdrop 上（按下就关，避免「在框内拖选文本、松手落在遮罩上」被误关），`data-state={phase}` 驱动退场；危险动作走 `dangerButton`，取消永远在左 `ghostButton` —— 证据 `tb lib/client.js:8523-8568` —— 适用性：**适合**（删除供给源 / 清空用量历史）。
- **保存态用 `role="status"` 播报而不是弹 toast**：设置页保存中/已保存/失败三处都是 `<span role="status">` —— 证据 `tb lib/client.js:11428`、`tb lib/client.js:11441`、`tb lib/client.js:11450` —— 适用性：**适合**。全库 6 个插件**没有一家用 toast**（见 §7），本项目的「已切换路由」「已刷新价格」应就地一行文字 + `role="status"`。
- **自绘下拉必须是 `role="listbox"` + `role="option"`**：`tb lib/client.js:11672`、`tb lib/client.js:11676` —— 证据同上 —— 适用性：**适合**（币种/站点下拉若嫌原生 `<select>` 不能带副标题）。
- **语义钩子用 `data-dsh-*`，不用 `data-testid`**：`data-dsh-taskboard-board`、`data-dsh-plugin="task-board"`、`data-dsh-center-view-back`、`data-dsh-part="project-filter"` / `"card-group-toggle"`、`data-dsh-panel-entry`、`data-dsh-autofocus`、`data-dsh-taskboard-view`；**全文件 `data-testid` 出现 0 次，`aria-` 出现 64 次** —— 证据 `tb lib/client.js:10740-10795`（board 根节点 `data-dsh-taskboard-board`）、`tb lib/client.js:11100-11120`（`data-dsh-panel-entry`） —— 适用性：**部分适合**。理由：`data-dsh-*` 是给**宿主皮肤**认领的契约（L2 换肤要靠它定位行/面板），不能当测试选择器用；本项目若两者都要，应同时给 `data-ma-part`（皮肤契约）与 `data-testid`（自动化），但**别用同一个名字**（见 §3 usage-billing 的 227 个 testid 就是纯测试用途）。
- **折叠/展开必须带 `aria-expanded`**：`tb lib/client.js:10734` —— 适用性：**适合**。

#### G. 文案风格（locales.ts）

- **zh-first 字典 + en 回退 + 按 `document.language` 选**：字典以 zh 为键集唯一来源，注释说明「故意不依赖 dsh locale service，好让 DOM 注入的入口行和独立面板树共用一份小查找」 —— 证据 `tb lib/client.js:3420+`（`locales.ts` region） —— 适用性：**适合**（本项目若同时挂 sidebar 行 + main 页，两棵树要能共用文案）。
- **`{name}` 占位插值，`t()` 只做 replaceAll**：`function t(key, params){ if (runtimeT !== void 0) return runtimeT(key, params); let text = dictionary()[key]; if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, value); return text }`，且可被宿主 translate seat 接管（`setRuntimeTranslate`） —— 证据 `tb lib/client.js:4328-4334` —— 适用性：**最适合本项目**。本项目文案里大量拼字符串（`'¥' + n + '/百万'`），改成 `t('pricing.perMillion', {price, currency})` 后，单位/汇率口径只需改字典。
- **错误文案按 cause 分档，且直说「哪条路无效」**：`board.hostError.*` 一整族 —— `notMounted`（后台接口没挂载，重启 DSH 服务后再试）、`ledgerLocked`（带 `{pid}`，「关闭那个 DSH 实例，或等它退出后再点重试——**反复重启本实例无效**」）、`unauthorized`（登录态失效，刷新页面）、`forbidden`（同源校验未过，桌面外壳/反代没传浏览器标记）、`timeout`（「后台 {seconds} 秒内没有响应」）、`unreachable`（「连接不上本机 DSH 服务，请确认它仍在运行」）、`unexpected`（「后台返回了无法识别的响应（HTTP {status}）」） —— 证据 `tb lib/client.js:3437-3446` —— 适用性：**最适合本项目**。本项目探测失败目前是同一句「请求失败」，而实际至少有 5 种（超时 / 401 / 429 限流 / 5xx / 返回非 JSON），用户拿到不同错误要知道「等 1 分钟」「换 key」「站点挂了」。
- **AI/自动化字段的解释写在 `fieldHint` 里，并划清边界**：`new.aiParseHint` =「把从别处复制的一段话粘进来，让模型整理成标题、描述和执行 Prompt；解析结果只填进下面的表单，你可以先改再创建。」 —— 证据 `tb lib/client.js:3420+` —— 适用性：**适合**（本项目「自动探测/自动比价」这类会动网络的开关，必须在旁边说清「只读、会发 1 次请求、不改配置」）。

#### H. 面板注册方式（native-panel.tsx 注释即范本）

- **不做 DOM 接管，只向 shell 声明的 seat 贡献内容**：向 `sidebar.panellist` 贡献一行、向 layout 的 `main` 槽贡献页面；行盒子/标签/高亮/折叠 rail/切换逻辑全由 shell 拥有；`const PANEL_ORDER = 20`（Plugins=0、Schedule=10） —— 证据 `tb lib/client.js:11067-11130` —— 适用性：**最适合本项目**。本项目已是面板形态，但若未来要加 sidebar 入口，务必照此注册而非自己往 DOM 里插节点。
- **注册走 `ctx.slots.inject`，加载顺序无关**：只在宿主声明 seat 后触发回调，宿主不提供该 seat 时回调永不执行（优雅降级） —— 证据 `tb lib/client.js:11067-11130` —— 适用性：**适合**。
- **页面 wrapper 带锚点属性，兼作容器查询上下文**：`data-dsh-taskboard-view` 同时是皮肤锚点与 `container:` 的作用对象，layout 只在该面板被选中时挂载它 —— 证据 `tb lib/client.js:11067-11130`、`tb lib/client.js:4336`（首行 `[data-dsh-taskboard-view]{…container:_7D6uKa_task-board-view/inline-size}`） —— 适用性：**适合**（省一个单独 wrapper）。

---

## 2. skill-explorer

整体评价：**「列表 + 多轴筛选 + 偏好持久化」的最佳范本**，代码比 task-board 小一个数量级，但把「搜索排序、facet 语义、存储容错」这三件最容易做错的事都做对了。

### 可借鉴点

- **tab / 编辑目标放 controller，不放组件 state**：注释（`se lib/client.js:1993-2008`）明写「layout 只在该面板被选中时挂载本页，本地 state 会在每次切面板时丢掉打开的 tab 和未完成编辑；inactive tab unmounts」，于是把 tab 与编辑目标收进 controller，组件用 `useSyncExternalStore(controller.subscribe, controller.getSnapshot)` 读（`se lib/client.js:2017`） —— 证据 `se lib/client.js:1993-2008`、`se lib/client.js:2017` —— 适用性：**最适合本项目**。本项目面板被切走会 remount，「正在编辑的价格覆盖 / 当前选中的站点」必须放 controller 或 `localStorage`，否则用户切一下侧栏就白填。
- **tab 条用「预留 2px 底边 + 属性选择器换色」，不换布局**：`.tabBar{border-bottom:1px solid var(--dsw-alias-border-l1);gap:2px;display:flex}`、`.tab{border-bottom:2px solid #0000}`、`.tab[data-active]{color:label-primary;border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}`，DOM 是 `div[role=tablist][data-dsh-part=tab-bar]` + `button[role=tab][aria-selected][data-active]`（`data-active` 用 `""`/undefined） —— 证据 `se lib/client.js:517`（`panel.module.css` 单行，类前缀 `ptK59a_`）、`se lib/client.js:1990-2090` —— 适用性：**适合**。本项目 `ma-tabs` 若用「选中项加 border」，切换时会有 1px 抖动，就是没预留透明底边。
- **facet 筛选条：左侧 34px 固定宽轴名 + pill chip + chip 内嵌计数**：`.facetBar{border:1px solid border-l1;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}` > `.facetRow` > `.facetLabel{min-width:34px;font-size:11px;font-weight:600;color:label-secondary}` + `.facetChip{border-radius:999px;padding:2px 9px;font-size:11.5px}` + `.facetCount{font-size:10.5px;color:label-tertiary}`；`aria-pressed` + `data-active=""`；active 时 chip 与计数同时变色 —— 证据 `se lib/client.js:1775-1900`（组件与类名）、`se lib/client.js:517`（CSS） —— 适用性：**最适合本项目**。比价页的「币种 / 缓存 / 分组 / 模式 / 是否限流」正好是 5 条 facet 轴，这个「一轴一行、轴名定宽、chip 带计数」的版式比下拉筛选可读得多，还能让人一眼看到每项有多少条。
- **筛选项本身可折叠，按钮文案带活跃项数量**：`ghostButton` + `aria-expanded={filtersOpen}` + 文案 `筛选 (${activeFacetCount(prefs)})` + `data-active`（有 facet 时高亮），初始态 `useState(() => hasActiveFacets(loadListPrefs(storage)))`（刷新后仍展开） —— 证据 `se lib/client.js:1775-1900` —— 适用性：**适合**（facet 条占 5 行高度，默认收起、有筛选时才展开，避免挤压表格）。
- **搜索框三件套：`type=search` + `spellCheck=false` + Esc 清空**：`onKeyDown` 里 `Escape && query !== '' → setQuery('')` —— 证据 `se lib/client.js:1713-1722` —— 适用性：**适合**（比价页搜索框 90% 的时间是用来「清掉上一个查询」）。
- **switch 用 `aria-checked` 同时驱动样式与语义，不另设 class**：`button[role=switch][aria-checked]` > `span.switchTrack` > `span.switchThumb`；`.switchTrack{width:30px;height:16px;border-radius:99px;background:border-l2;transition:background .18s}`、`.switchThumb{width:12px;height:12px;position:absolute;top:2px;left:2px;transition:left .18s}`、`[aria-checked=true] .switchTrack{background:state-success-primary}`、`[aria-checked=true] .switchThumb{left:16px}` —— 证据 `se lib/client.js:517`（CSS）、`se lib/client.js:1425-1560`（调用处） —— 适用性：**最适合本项目**（「自动切换最便宜站点」「后台定时探测」这类开关）。**30×16 轨道 + 12px 拇指 + 18ms 级位移**是能直接抄的参数，且用绿色而不是主色表示「开」。
- **折叠三角用纯 CSS，不用图标**：`.groupCaret{border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transform:rotate(-45deg);transition:transform .15s}`，`[aria-expanded=true] .groupCaret{transform:rotate(45deg)}` —— 证据 `se lib/client.js:517` —— 适用性：**适合**（省一个图标，且能吃到 `currentColor`）。
- **内联 banner 反馈（`data-kind` 分色），不用 toast**：`p.banner[data-kind=ok|error]`，`.banner{border:1px solid border-l2;border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere}`、`[data-kind=error]{color/border:state-error-primary}` —— 证据 `se lib/client.js:517`（CSS）、`se lib/client.js:1560-1702`（行内错误） —— 适用性：**适合**。`overflow-wrap:anywhere` 是长 URL / 长模型名的必需品。
- **按钮三档 + `linkButton[data-danger]` 做行内删除**：`primaryButton`（disabled `opacity:.5`）/`ghostButton`（`.45`）/`linkButton`（无边框文字钮，`[data-danger]` 转 error 色，`margin-left:4px`） —— 证据 `se lib/client.js:517` —— 适用性：**适合**。
- **列表行：`article` + 底部 1px 分隔 + 末行去边 + hover 底色**：`.skillRow{border-bottom:1px solid border-l1;padding:8px 0}`、`:hover{background:interactive-bg-hover}`、`:last-child{border-bottom:none}` —— 证据 `se lib/client.js:517`、`se lib/client.js:1560-1702` —— 适用性：**适合**（比价表若不用 `<table>` 而用 div 行，这是标准做法；但见 §7 结论：宽表还是用 `<table>`）。
- **状态徽章「语义分色 + 每枚都带 `title` 解释」**：`span.badge`（`border-radius:999px;padding:1px 8px;font-size:11px;border:1px solid border-l2`）+ `badgeInvokable`（success）/`badgeIsolated`（warn）/`badgeWorkspace`，每个都带 `title`（如 `workspace.isolatedHint`、`provider.tooltip`） —— 证据 `se lib/client.js:517`、`se lib/client.js:1560-1702` —— 适用性：**适合**。比价表的「缓存命中/未探测/免费额度」徽章必须能悬停解释，否则用户不知道它是状态还是能力。
- **行内动作互斥用 `busyRef` 双保险，错误就地渲染在行尾**：`const busyRef = useRef(false); if (busyRef.current) return` + 按钮 `disabled={busy}`，错误渲染成该行末尾的 `p.banner[data-kind=error]`（`se lib/client.js:1567`、`se lib/client.js:1690-1700`） —— 证据同上 —— 适用性：**适合**（比价行的「重新探测」按钮；错误若弹全局 toast，用户不知道是哪一行失败了）。**反例**：删除确认用 `window.confirm`（`se lib/client.js:1560-1702`），与 task-board 的 `ConfirmDialog` 不一致 —— 不建议抄。
- **陈旧响应守卫 `loadSeq`**：`const seq = ++loadSeq.current; … if (seq !== loadSeq.current) return;` 在 then/catch/finally 三处都判 —— 证据 `se lib/client.js:1425-1560` —— 适用性：**适合**（比价页切筛选会连发多次请求，慢的回来不能覆盖新的）。
- **三级空态文案**：`emptyText = query !== '' ? t('filter.empty',{query}) : narrowed ? t('filter.emptyWorkspace') : t('list.empty')`——搜索无结果 / 筛选无结果 / 本来就没有 —— 证据 `se lib/client.js:1809` —— 适用性：**最适合本项目**（「搜 'glm' 无结果」与「没有可用站点」是两种完全不同的处境，给同一句话等于没给）。
- **刷新按钮在 loading 时隐藏而不是禁用**：`se lib/client.js:1772-1781` —— 适用性：**部分适合**。隐藏能减少噪音，但会让人误以为功能消失；本项目建议**禁用 + spinner**（task-board 的做法）。
- **搜索命中分级排序**：`matchRank(skill, needle)` = 空 → 0、`name` 命中 → 0、`description` 命中 → 1、否则 undefined（被过滤）；`if (needle !== '') ranked.sort((l,r) => l.rank - r.rank)` —— 证据 `se lib/client.js:1345-1420`（`skill-filter.ts`） —— 适用性：**最适合本项目**。搜「glm」时「GLM 官方」应排在「某站支持 glm-4.6，备注里提到」之前，这 6 行就够。
- **facet 语义：同一轴内并集、不同轴之间交集**：`inMarks = marks.some(m => carried.includes(m))`，注释写明「ticking two boxes widens the result instead of emptying it」；`inStatus` / `inWorkspace` 各一轴；无 workspace 的全局项在工作区轴下恒可见 —— 证据 `se lib/client.js:1345-1420` —— 适用性：**最适合本项目**（与 §1 的合取规则合并成一条总规则：**轴内 OR、轴间 AND**）。
- **组级 facet 先整组过滤再丢空组**：`levels.length === 0 || levels.includes(group.key)`，过滤后 `filter(g => g.skills.length > 0)` —— 证据 `se lib/client.js:1345-1420` —— 适用性：**适合**（按站点分组的比价，筛掉整组后不能留下空标题）。
- **偏好持久化四道保险（逐条都该抄）**：① 单 key 文档 + 版本号 `dsh-skill-explorer:list-view:v1`；② 硬边界 `MAX_LIST_ENTRIES = 64`、`MAX_STORAGE_BYTES = 8*1024`（超长直接当默认）；③ 逐字段校验、一个字段坏不毁整份（`stringList(v, allowed)` 去非字符串/去重/白名单/截断、`collapseMap(v)` 只留 boolean、status 只收 `['all','enabled','disabled']`）；④ `loadListPrefs` 全程 try/catch → `defaultListPrefs()`，`saveListPrefs` 返回 boolean 且**存储被拒不算错误**（注释：「the view still works for this page load」） —— 证据 `se lib/client.js:1208-1340`（`panel-prefs.ts`） —— 适用性：**最适合本项目**（比价页的密度/隐藏列/币种/排序要存，而隐私模式/配额满时 `localStorage.setItem` 会抛）。
- **折叠决策「逆序存储」，让用户的显式选择活过默认值变更**：`isGroupExpanded(key, collapsed) = recorded === undefined ? DEFAULT.includes(key) : !recorded`，`toggleGroupCollapsed` 记 `{...collapsed, [key]: isGroupExpanded(...)}`，注释：「记录显式决定，选择能活过 remount，后续默认值变化也不能悄悄重开」 —— 证据 `se lib/client.js:1208-1340` —— 适用性：**适合**（本项目若改版默认展开某些分组，老用户的选择不能被覆盖）。
- **默认只展开「用户正在用的源」，系统级默认折叠**：`DEFAULT_EXPANDED_LEVELS = ['project-dsh','project-agents','user-dsh','user-agents']` —— 证据 `se lib/client.js:1208-1340` —— 适用性：**适合**（比价页默认只展开有报价的站点组，未探测/无价组折叠）。
- **陈旧 facet 自愈**：payload 到达后把 `prefs.levels` 里已不存在的 key 过滤掉 —— 证据 `se lib/client.js:1707-1716` —— 适用性：**适合**（站点下线后旧筛选值不能导致空列表）。
- **i18n 用 `key in zh` 探测回退**：`providerLabel(p) = key in zh ? tt(key) : p`（未翻译就显示原始 id），组标题/提示同样回退到宿主值 —— 证据 `se lib/client.js:252+`（`locales` region）、`se lib/client.js:1425-1560` —— 适用性：**适合**（模型名/站点名不能强行翻译，但要能加「官方/中转」这类标签译文）。

---

## 3. usage-billing

> **取证说明**：`ub lib/client.js` 是 5 行 / 324 566 字节的压缩产物，**无法给行号**；下列证据用「字符 offset + 片段关键词」定位，关键词可直接在文件里搜到。

整体评价：**数据密集型面板的 UI 纪律最完整**（227 个 testid、`tabular-nums` 45 处、`≈` 估算标记、进度条分级、峰谷两色派生），也是**最值得作为「比价/用量页」直接对标的产品形态**——它已经做了「多 provider 用量 + 定价 + 预算 + 峰谷」这四件事。

### 可借鉴点

- **`data-testid` 命名法：`billing-<区域>-<元素>[-<取值>]`，且状态维度参数化**：`billing-tab-panel-${id}`、`billing-kpi-range-${today|7d|week|month|all}`、`billing-density-${compact|default|comfortable}`、`billing-token-view-${}`、`billing-perf-tab-${}`、`billing-settings-nav-${}`；连异常态都有独立 id：`billing-provider-empty`、`billing-sessions-{empty,stale,unreadable,no-ledger,format-unsupported}`、`billing-stale-snapshot`、`billing-unpriced-hint`、`billing-estimated-tag` —— 证据 `ub lib/client.js`（关键词 `data-testid:"billing-`，共 231 处 / 227 唯一） —— 适用性：**部分适合**。本项目若要做自动化回归，照抄这套「区域-元素-取值」三段式即可；但**不要**像它这样在 227 处散写字符串字面量，应集中成一个 `const T = { tabPanel: id => \`ma-tab-panel-${id}\`, … }`。
- **「估算值」在数字前加 `≈`，并带 `title` 解释**：实测缺失用 `span.na`（文本 `—`），估算用 `≈¥0.12` + `title={t('cellEstimateHint')}`；订阅制价格格是 `≈金额` + `planTagBadge`（「订阅」徽章） —— 证据 `ub lib/client.js`（关键词 `cellEstimateHint`、`≈`、`className:B.na`，offset≈280486 的表格段） —— 适用性：**最适合本项目**。比价表的「综合成本」几乎都是估算（汇率 + 缓存率 + 首字延迟加权），**不标 ≈ 就是把估算当实测卖**；`—` 与 `≈` 必须是两种不同的视觉，不能都是灰色文字。
- **数值列三件套：`tabular-nums` + 右对齐 + `nowrap`**：`td.numCol` 统一 `font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap`（全文件 `tabular-nums` 45 处、`text-align:right` 9 处） —— 证据 `ub lib/client.js`（关键词 `tabular-nums`、`numCol`） —— 适用性：**最适合本项目**。12 列表格里 6 列是数字，缺了 `tabular-nums` 小数点不会对齐，横向扫读会断。
- **宽表外包一层 `div.tableScroll`，表头不 sticky 但容器可滚**：`div.tableScroll[data-testid=billing-table-scroll] > table.modelTable`（全文件 `position:sticky` 仅 2 处、`overflow-x:auto` 2 处） —— 证据 `ub lib/client.js`（关键词 `tableScroll`、`modelTable`） —— 适用性：**部分适合**。本项目 12 列且首末列要吸附，必须比它多两处 sticky（`th:first-child/td:first-child{position:sticky;left:0}` + 末列 `right:0`），并给 sticky 单元格加 `background` 与 `z-index`，否则横向滚动时内容会透过来。
- **金额格式化器分档，单位与精度由数据决定**：`J()/G()/$t()` 三个函数分别处理金额、百分比、计数（计数用 `toLocaleString()`） —— 证据 `ub lib/client.js`（关键词 `toLocaleString`、`budgetSummary`） —— 适用性：**适合**（本项目的 `pricingMoney()` 已分档：`≥100`→0 位、`≥1`→2 位、否则 3 位；建议再抽一个 `formatPercent` 与 `formatCount`，避免各分片各写）。
- **预算进度条：`role="progressbar"` + 三档类名（正常/警告/超支）**：`div.prog[role=progressbar][aria-valuenow=Math.min(pct,100)][aria-valuemin=0][aria-valuemax=100][aria-label=预算][data-testid=billing-budget-track]` > `div.progFill[style.width=Math.min(pct,100)+'%'][className:y(B.progFill, pct>=100&&B.budgetFillOver, pct>=80&&pct<100&&B.budgetFillWarn)]`，旁边 `p.setCardDesc[data-testid=billing-budget-value]` 用 `t('budgetSummary').replace('{used}',…)` —— 证据 `ub lib/client.js`（offset≈259136，关键词 `budgetFillOver`、`budgetFillWarn`、`aria-valuenow`） —— 适用性：**最适合本项目**（每日/每月用量预算、单站余额）。**注意**：`aria-valuenow` 用 `Math.min(pct,100)` 是对的（超支时 120% 会让读屏念出不存在的值），但视觉上 `progFill` 也要 `min(100)`，超支靠颜色+文案表达。
- **两色对比由一色 `color-mix` 派生，不另立 hex**：峰色 `style:{background:'var(--ds-blue)'}`，谷色 `style:{background:'color-mix(in srgb, var(--ds-blue) 30%, var(--dsb-3))'}`；图例 `span.shareDot` 同法；数值 `span.shareValue` 形如 `¥x · 62.3%`（一个格子同时给绝对值与占比） —— 证据 `ub lib/client.js`（offset≈273225，关键词 `shareSegOff`、`color-mix`、`billing-share-peak`） —— 适用性：**最适合本项目**（峰谷电价、缓存命中/未命中、输入/输出 token 占比都属于「两段式占比条」）。`color-mix` 全文件 103 处，是本项目「深色/浅色主题下自动降饱和」的最省事写法。
- **空态用 96×64 低饱和线稿，不用 emoji、不用大字**：`div.emptyState > span.emptyIll[aria-hidden="true"] > svg[viewBox="0 0 96 64"]`（坐标轴线 + 柱状线稿，stroke 用 `var(--ds-border-strong)`） —— 证据 `ub lib/client.js`（offset≈276096，关键词 `emptyIll`、`viewBox:\`0 0 96 64\``） —— 适用性：**不适合**。本项目是工具型高密度面板，插画会挤掉表格可视高度；task-board / skill-explorer 的「一句话空态」更合适。
- **设置页用 `aside[role=navigation]` + 带图标的锚点导航，每节是 `div.setCard`**：`div.settingsLayout > aside.settingsNav[data-testid=billing-settings-nav][role=navigation][aria-label=settings]`，nav 项内联 `svg`（`viewBox="0 0 16 16" fill=none aria-hidden="true" stroke=currentColor strokeWidth="1.5" strokeLinecap="round"`），每节有自己的 `id="settings-display-pref"` 作锚点 —— 证据 `ub lib/client.js`（offset≈253400，关键词 `settingsLayout`、`settingsNav`、`setCard`） —— 适用性：**最适合本项目**。本项目设置页已经有右栏 nav + `nav-desc` 副标题，补「每节 `id` 锚点」即可让「ManageAPI 面板」深链到某一节（配合 `#settings-pricing`）。
- **设置页搜索 = 隐藏不卸载**：`input.settingsSearch[type=search][aria-label]`，无匹配时 `p[data-testid=billing-settings-search-empty]`，文案 `t('settingsSearchEmpty').replace('{query}',…)`；每个 section 用 `hidden` 属性**隐藏而非卸载**（保住滚动位置、焦点、内部状态） —— 证据 `ub lib/client.js`（offset≈255886，关键词 `settingsSearch`、`settingsSearchEmpty`） —— 适用性：**适合**。本项目设置项会越来越多（币种/汇率/探测频率/路由策略），搜索几乎是必需品；「hidden 不卸载」是让搜索后不丢未保存输入的关键。
- **密度是三段控件，不是滑块，且旁边有解释**：`div.densityRow > div.densityLeft`（`<strong>密度</strong>` + `<span>解释</span>` 两行）+ `div.densityButtons` 三个 `button[data-testid=billing-density-${v}][className:y(B.densityButton, active&&B.densityButtonActive, v==='comfortable'&&B.densityButtonComfortable)]`；同卡还有独立的「动效」偏好 `billing-motion-buttons` —— 证据 `ub lib/client.js`（offset≈256703，关键词 `densityRow`、`densityButtonActive`） —— 适用性：**最适合本项目**。12 列表格必须有密度切换（紧凑/标准/舒适），三段比滑块可发现、比下拉少一次点击。
- **时间范围用五档 `aria-pressed` 按钮组，不用下拉**：`button.heatmapRangeButton[aria-pressed][data-testid=billing-kpi-range-${key}]`，取值 `today|7d|week|month|all` —— 证据 `ub lib/client.js`（offset≈242510，关键词 `heatmapRangeButton`、`billing-kpi-range-`） —— 适用性：**最适合本项目**（用量页「今天 / 7 天 / 本月 / 全部」；比价页「实时 / 缓存 1h / 缓存 24h」）。
- **图表 tooltip 靠边界翻转，不靠 `transform` 猜**：`div.chartTooltip[className:y(B.chartTooltip, alignClass)][style:{left:`${x/680*100}%`,top:`${y/200*100}%`}]`，`ne = Math.ceil(80 / Math.max(groupW,1))`，`x >= n-ne → chartTooltipAlignRight`、`x < ne → chartTooltipAlignLeft`；十字线 `line.chartCrosshair` —— 证据 `ub lib/client.js`（offset≈148938，关键词 `chartTooltipAlignRight`、`chartTooltipAlignLeft`、`chartCrosshair`） —— 适用性：**适合**（用量趋势图）。
- **导出条是 `role="group"` + 明确的 CSV/JSON 两个按钮**：`div.exportBar[role=group][aria-label=t('tokenExport')] > span.exportLabel + button.exportButton[data-testid=billing-token-export-csv|-json]` —— 证据 `ub lib/client.js`（关键词 `exportBar`、`billing-token-export-csv`） —— 适用性：**适合**（比价表导出 CSV 便于线下核对）。
- **设置卡头四件套可复用**：`div.setCardHead > div.setCardMeta > h3.setCardTitle`，描述 `p.setCardDesc`，主控件区在卡内 —— 证据 `ub lib/client.js`（多段，关键词 `setCardHead`、`setCardTitle`、`setCardDesc`） —— 适用性：**适合**（本项目设置卡片统一「标题 + 一句说明 + 控件」的顺序）。
- **反例：三代设计令牌混用**：`--ds-*` 588 次（`--ds-blue`/`--ds-t-1..3`/`--ds-border`/`--ds-t-fast`）、`--dsb-*` 70 次、`--dsw-*` 58 次 —— 证据 `ub lib/client.js`（关键词 `var(--ds-`、`var(--dsb-`、`var(--dsw-`） —— 适用性：**不适合**。同一文件三种 token 世代意味着换肤时有一部分颜色不会跟着变。本项目应**只保留一层 `--ma-*`，其值全部引用 `var(--dsw-alias-*, 兜底)`**。

---

## 4. dsh-ops

整体评价：**「设置页 + 危险动作」的工程范本**。代码量最小（`lib/client/*` 共 ~280 行），但把「模块怎么切、表单怎么管状态、不可逆操作怎么确认、失败怎么讲」全部做对，是唯一一个带**类型化远程契约**的插件。

### 可借鉴点

- **按「注册 / 文案 / 样式 / 共享表单原语 / 每个表单一个文件」切模块**：`lib/client/index.js`(24 行，只注册) / `locales.js`(38 行，`export const en/zh` 纯对象) / `styles.js`(26 行，`export const SETTINGS_CSS` 模板串) / `forms.js`(44 行，`useEditor` + `Unavailable` + `FormActions`) / `selections.js`(27 行) / `shell-form.js`(14 行) / `runtime-panel.js`(108 行) —— 证据 `ops lib/client/index.js:1-24`、`ops lib/client/forms.js:1-44`、`ops lib/client/runtime-panel.js:1-108` —— 适用性：**最适合本项目**。本项目 `src/parts/` 九分片是「按页面」切，但缺「共享表单原语」这一层：表单的 busy/dirty/valid/message 逻辑在 05/20/30/70 里各写了一遍。抽一个 `ma-forms.js`（`useEditor` + `FieldActions`）能直接砍掉重复。
- **样式注入用 `ctx.effect` 并返回清理函数**：`ctx.effect(() => { const style = document.createElement('style'); style.dataset.dshOpsSettings = 'true'; style.textContent = SETTINGS_CSS; document.head.append(style); return () => style.remove() }, '…styles')` —— 证据 `ops lib/client/index.js:7-22` —— 适用性：**适合**。本项目 `injectStyle()` 返回 dispose 但调用方普遍不持有；至少要在插件 unload 时 `document.getElementById(id)?.remove()`，否则热重载会堆出多份样式。
- **同一个 slot 注册同时提供「摘要态」与「表单态」**：`props => props.view === 'summary' ? <>{props.t('replacements')}</> : <ReplacementForm {...props}/>` —— 证据 `ops lib/client/index.js:7-22` —— 适用性：**适合**（本项目若在插件行里露一行摘要，如「当前最便宜：凌风 ¥0.19」，就靠这个 `view==='summary'` 分支，而不是另写一个组件）。
- **危险动作三段式：`plan → 预览 → execute`，且执行可取消**：`preview(action)` 先 `api.plan(action)` 拿到 `{available, details[], reason}`，渲染成 `div.ops-settings-preview[role=region][aria-label]`（`h3` 动作名 + `ul` 逐条 `details` + `reason` + `[主按钮 disabled={!plan.available||busy}]` + `[关闭预览]`）；确认后 `const controller = new AbortController(); cancellation.current = controller; api.execute(plan.id, controller.signal)`，执行中显示「取消正在执行的操作」按钮 —— 证据 `ops lib/client/runtime-panel.js:1-108` —— 适用性：**最适合本项目**。本项目的「切换路由目标 / 批量重测全部站点 / 应用新价目表」都是不可逆或昂贵的动作，`plan` 返回的 `details[]` 正好可以放「将影响 7 个模型、3 个站点，预计多花 ¥0.04/百万」。这是**唯一一家把「预览清单」做成数据而不是文案**的实现。
- **执行结果三态，且失败时明说「效果未知」**：成功 `setResult(value)`；失败/取消 `setResult({status: signal.aborted?'cancelled':'failed', effectState:'unknown', message})`；渲染 `result.message` + `exitCode !== undefined && (退出码: x ?? '—')` + **`result.effectState === 'unknown' && <p>{t('unknownEffect')}</p>`**（「可能已经发生更改。再次尝试前，请检查安装状态。」） —— 证据 `ops lib/client/runtime-panel.js:1-108` —— 适用性：**最适合本项目**。探测/切换类操作超时后，宿主可能已经改了配置；直接说失败会诱导用户重复操作。`effectState: 'unknown'` 是一个**该抄进接口协议的字段**。
- **按钮可用性全部由数据推导，而不是由「是否正在加载」一刀切**：`disabled={busy || !snapshot?.managed.some(e => e.owned)}`、`disabled={busy || !snapshot || snapshot.platform !== 'win32'}`、`disabled={busy || !snapshot?.powerShell.supported}`，配套 `snapshot.powerShell.unavailable && <p className="ops-settings-note">原因</p>` —— 证据 `ops lib/client/runtime-panel.js:1-108` —— 适用性：**最适合本项目**。比价页的「应用此价」按钮在「宿主白名单不允许写」时应保持可见但禁用 + 一句原因（本项目 `50-pricing.js` 已经这么做了，只是文案散落；统一样式即可）。
- **表单状态机 `useEditor`：脏值才同步、带 revision、失败不抛**：`ready = form?.state.status === 'ready' && form.state.writable && form.state.mode === 'host'`；`useEffect(…, [revision, status, read, dirty])` 里**只在 `!dirty` 时**把宿主新值拉回 draft；`save(operations)` 有 `busy` 守卫并带 `revision`，`const accepted = await form.mutate(operations, revision)`，成功 `setDirty(false)`，失败也走 `message` 不抛 —— 证据 `ops lib/client/forms.js:1-44` —— 适用性：**最适合本项目**。`!dirty` 才同步这一条尤其重要：后台轮询刷新比价数据时，不能把用户正在输入的自定义价格冲掉。
- **写回用 patch 指令而非整个对象**：`editor.save([{op:'set', path:['bashPath'], value}, {op:'unset', path:['bashPath']}])`，多字段一次提交 `[set enabled, set maxResults, set allowedTools…]` —— 证据 `ops lib/client/shell-form.js:1-14`、`ops lib/client/selections.js:1-27` —— 适用性：**适合**（本项目写价目/配置时，`PATCH` 的 body 用 `{op:'set', path:['price','input'], value}` 而不是整份配置，能避免并发覆盖）。
- **不可写时整块换成一句话，而不是禁用一堆控件**：`Unavailable({form,t}) → <p role="status">{t('loading')||t('unavailable')}</p>` —— 证据 `ops lib/client/forms.js:1-44` —— 适用性：**适合**（宿主没挂载后台接口时，比价页应只剩「后台接口没有挂载」一句，而不是 12 列灰表格）。
- **保存按钮三条件门禁 + 两段文案**：`<button type="submit" disabled={busy || !dirty || !valid}>{busy ? t('saving') : t('save')}</button>`，次按钮 `reset`（「恢复已保存值」），消息 `p[role=status]` —— 证据 `ops lib/client/forms.js:1-44` —— 适用性：**最适合本项目**（「未改动就禁用保存」能直接消灭「点了没反应」）。
- **校验：`aria-invalid` + 就地 `role="alert"` + 原生约束**：`aria-invalid={!valid}`，旁边 `p[role=alert]`（「请输入 1 到 5 的整数」），`input[type=number][min=1][max=5][step=1]` —— 证据 `ops lib/client/selections.js:1-27` —— 适用性：**适合**（汇率、探测超时、并发数）。
- **联动字段的「清理而非留脏」**：从允许池移除某项时同步从 always 里删（`always: checked ? draft.always : draft.always.filter(...)`），且 always 的 checkbox `disabled={!draft.allowed.includes(name)}`；`fieldset disabled={busy}` 整组禁用；帮助文案独立成 `p.ops-settings-note` —— 证据 `ops lib/client/selections.js:1-27` —— 适用性：**适合**（「启用某站点」与「把该站点设为默认」之间的联动）。
- **一行 `accent-color` 把原生 checkbox 主题化**：`.ops-settings-choice input{width:16px;height:16px;accent-color:var(--dsw-alias-button-primary-fill,#356be8)}` —— 证据 `ops lib/client/styles.js:1-26` —— 适用性：**最适合本项目**。比价的「显示列」多选清单用原生 checkbox + `accent-color`，比自绘 16px 方块省 40 行代码且天然支持键盘/读屏。
- **令牌全部带硬兜底值**：`var(--dsw-alias-border-l3,#888)`、`var(--dsw-alias-button-primary-fill,#356be8)`、`var(--dsw-radius-sm,8px)`、`var(--dsw-radius-md,12px)` —— 证据 `ops lib/client/styles.js:1-26` —— 适用性：**最适合本项目**。本项目要在旧版宿主/独立网页里都能看，`var(--x, 兜底)` 是唯一保底手段；task-board 的「零兜底」只适用于确定宿主版本的情况。
- **`:is()` 一次覆盖焦点环**：`.ops-settings :is(button,input):focus-visible{outline:2px solid var(--dsw-alias-button-primary-fill);outline-offset:3px}`；`:disabled{opacity:.5;cursor:not-allowed}` —— 证据 `ops lib/client/styles.js:1-26` —— 适用性：**适合**（比 task-board 的长选择器列表更短）。
- **阅读宽度与两列栅格**：`.ops-settings{display:grid;gap:16px;max-width:48rem}`、`p{max-width:76ch;line-height:1.55;overflow-wrap:anywhere}`、`.ops-settings-columns{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}` + `@media(max-width:440px){grid-template-columns:1fr}` —— 证据 `ops lib/client/styles.js:1-26` —— 适用性：**适合**（设置页；`76ch` 是长段说明的可读上限，`minmax(0,1fr)` 防长单词撑破列）。
- **远程契约带枚举校验与取消声明**：`parseAction` 走白名单、`planId` 走 `/^[a-f0-9-]{36}$/`、`method(name, parameter, cancellable)` 里 `cancellation: { parameter: 'signal' }` —— 证据 `ops lib/client.js`（`settings/runtime-contract.js` region，产物第 1–30 行） —— 适用性：**部分适合**（本项目是自研后端解析，但「入参先白名单校验再发」这条值得照抄，尤其是站点 id / 模型名这种拼进 URL 的值）。
- **卸载/竞态三重守卫**：`mounted = useRef(true)` + `refreshEpoch = useRef(0)`（`const epoch = ++refreshEpoch.current; if (!mounted.current || epoch !== refreshEpoch.current) return`）+ 卸载时 `cancellation.current?.abort()` —— 证据 `ops lib/client/runtime-panel.js:1-108` —— 适用性：**最适合本项目**（比价页轮询 + 切站点，两件事叠加时最容易出现「旧站点的价格写进新站点的行」）。

---

## 5. rewind

整体评价：**命令式 DOM 注入 + 浮层**的代表。它不是 React 面板，而是往宿主工具栏插按钮、自己管一个 popover；因此它在**浮层定位、焦点管理、影响预览**上比 React 派更细。参考价值集中在「popover 引擎」与「破坏性操作两步确认」。

### 可借鉴点

- **类名集中成一张常量表，不在字符串里散写**：`var CLASS = { button:'dsh-rewind-btn', popover:'dsh-rewind-popover', popoverTitle, popoverTarget, popoverOption, popoverOptionLabel, popoverOptionHint, popoverImpact, popoverActions, popoverGhost, … }`，之后一律 `CLASS.popover` —— 证据 `rw lib/client.js:169-186` —— 适用性：**适合**。本项目是手写字符串类名，改一个类名要全局搜；哪怕不重构，新增的部分也该走一张表。
- **popover 定位引擎（完整参数清单，可直接翻译成 React hook）**：`margin = 12`、`gap = 4`；首次算一次是否翻转（`rect.bottom + gap + height > innerHeight - margin` → 翻到上方并 clamp）；水平 `left = clamp(rect.right, margin, innerWidth - margin - root.offsetWidth)`；`requestAnimationFrame` 节流 `schedule()`；`ResizeObserver` 观察自身尺寸变化重算；`window.addEventListener('scroll', onScroll, true)`（**捕获阶段**，能收到任意滚动容器）+ `resize`；`dispose` 里逐项解绑并 `cancelAnimationFrame` —— 证据 `rw lib/client.js:570-631` —— 适用性：**部分适合**。本项目若用 `@floating-ui` 或宿主 primitives 的 `Tooltip`，不必自己写；但**若要做「悬停显示该站点最近 5 次探测」的浮层**，`scroll` 用捕获阶段 + `ResizeObserver` 这两条是必须的（否则滚动表格时浮层留在原地）。
- **延迟一帧再挂「点外关闭」监听**：`setTimeout(0)` 之后才 `addEventListener('pointerdown')`，避免「打开浮层的那一次点击」立刻把浮层关掉 —— 证据 `rw lib/client.js:570-631` —— 适用性：**适合**（所有 dropdown/menu 的通病，本项目如果有自绘下拉，一定踩过）。
- **锚点与浮层的无障碍三件套**：锚点 `aria-expanded="true"|"false"` + `aria-haspopup="dialog"` + `aria-label`；浮层 `role="dialog"` + `aria-label`；`document.addEventListener('keydown', onKeyDown, true)` 捕获阶段处理 `Escape` —— 证据 `rw lib/client.js:407-410`、`lib/client.js:640`、`lib/client.js:654`、`lib/client.js:1454-1457`、`lib/client.js:1506-1507` —— 适用性：**适合**。
- **浮层内焦点环形移动，且跳过「取消」类按钮**：`focusFirst(root)` / `moveFocus(root, dir)`，选择器只收 `button:not(:disabled)` 且排除 ghost 项 —— 证据 `rw lib/client.js:700-760` —— 适用性：**适合**（危险操作浮层里，Tab 应先到「确认」而不是「取消」，避免误触）。
- **破坏性操作先给「影响清单」再确认**：`renderImpactStep` 先渲染 `popover.impact.loading`，再列出影响（`lines.join('\n')`），确认按钮才真正执行；`popover.back` 可返回上一屏；无影响时 `popover.impact.none`，失败时 `popover.impact.failed {message}` —— 证据 `rw lib/client.js:512-568` —— 适用性：**最适合本项目**。与 §4 的 `plan/details` 是同一模式的两个实现（rewind 用字符串清单、dsh-ops 用结构化 `details[]`）——**建议抄 dsh-ops 的结构化版本**，因为它能做「逐条打勾」和「数量汇总」。
- **复用宿主 UI primitives，而不是自己实现开关**：`import { Switch, Tooltip } from …`、`SettingsValueField / SettingsForm / SettingsFormModel / settingsNumberField`（`@dsh/client-ui-primitives`），用法如 `<Switch checked label disabled onChange>`、`<SettingsValueField id label hint overriddenLabel resetLabel invalidLabel placeholder numeric disabled {...state.maxAgeDays} onEdit onReset>` —— 证据 `rw lib/client.js:1790-1830` —— 适用性：**部分适合**。能用宿主 primitives 就先用（换肤/无障碍自动跟上），但它们的视觉密度偏高，**表格内部**的控件仍应自绘；两者混用要保证「同一屏内只有一种开关样式」。
- **开关旁永远跟一句「当前状态」的人话**：`<p className="dsh-rewind-settings-hint">{t(checkpointing ? 'backup.on' : 'backup.off')}</p>` —— 证据 `rw lib/client.js:1790-1830` —— 适用性：**最适合本项目**。「自动切换最便宜站点：开」这种开关，只给一个绿色 toggle 用户不敢确认它到底在做什么；补一句「当前路由：凌风 · 上次切换 2 小时前」才算说清楚。
- **图标是字符串模板拼的 svg，尺寸 15px**：`'<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">'` —— 证据 `rw lib/client.js:186` —— 适用性：**部分适合**。字符串拼 SVG 只适合命令式 DOM；本项目是 React/模板字符串生成 HTML，可以把这段模板抽成一个 `icon(name, size)` 辅助函数统一管理，但**别学它把 viewBox 与尺寸写死两处**。

---

## 6. dsh-context

整体评价：代码只有 27 行（压缩），但注册方式是全场最讲究的：**双 seat 同生同死 + 开关门控 + 延迟求值 label**。适合作为「面板入口」的参考。

### 可借鉴点

- **两个 seat（main + sidebar）由同一个谓词控制，一起注册、一起撤销**：`Ec(store, () => t.insightsEntry() === 'show', () => [ e.slots.inject('main', () => e.slots.register({name:'main', key:'dsh-context', locale:i}, n)), e.slots.inject('sidebar.panellist', () => e.slots.register({name:'sidebar.panellist', id:'dsh-context', order:20, label:() => r('ov.title'), locale:i}, e => h.createElement(T, {size: typeof e.size === 'number' ? e.size : void 0})) ])`；`Ec` 内部：谓词为真且未注册 → 注册并把返回的 dispose 收集起来，谓词转假 → 逐个 `dispose()`；`store.subscribe(o)` —— 证据 `ctx lib/client.js:1-27`（关键词 `sidebar.panellist`、`insightsEntry`） —— 适用性：**最适合本项目**。本项目若同时挂「设置页一节」+「sidebar 行」，用户关掉面板时两者必须一起消失，否则留下死链。
- **`label` 传函数而不是字符串**：`label: () => r('ov.title')`，延迟到渲染时求值 → 切换语言立刻生效 —— 证据 `ctx lib/client.js:1-27` —— 适用性：**适合**。
- **`order: 20` 是约定值**（Plugins=0、Schedule=10、TaskBoard=20、Context=20 并列） —— 证据 `ctx lib/client.js:1-27`、`tb lib/client.js:11067-11130` —— 适用性：**适合**（本项目面板排在 Schedule 之后即可，order 用 30 更稳）。
- **只读时给一句 `role="status"` 说明，而不是隐藏整节**：`!n.writable && n.status === 'ready'` → `<p className="lc-settings-note" role="status">{t('settings.readOnly')}</p>` —— 证据 `ctx lib/client.js:1-27` —— 适用性：**适合**（与 §4 的 `Unavailable` 同构：只读也要解释为什么）。
- **偏好解析用白名单枚举逐字段接受，坏字段丢掉不影响其他字段**：`defaultPlacement ∈ {all,tab,sidebar,hide}`、`defaultGranularity ∈ {step,turn}`、`defaultTrendMode ∈ {total,delta}`、`defaultDeltaBase ∈ {step,turn}`，写法是 `{...cond ? {k: v} : {}, ...}` 逐字段展开 —— 证据 `ctx lib/client.js:1-27` —— 适用性：**适合**（与 §2 的 `panel-prefs` 是同一纪律）。

---

## 7. 横向对比表

| 维度 | task-board | skill-explorer | usage-billing | dsh-ops | rewind | 结论 |
|---|---|---|---|---|---|---|
| 布局骨架 | `board` → `header(boardHeader)` → `columns` 三列横向看板，`height:100%;min-height:0` 逐层传（`tb:4336`/`tb:10608`） | `panel` → `panelHeader` → `tabBar(role=tablist)` → `panelContent`（`se:517`/`se:1990`） | 多 tab 面板 + `settingsLayout(侧栏+内容)`（`ub@253400`） | `grid;max-width:48rem` 单列设置流（`ops styles.js`） | 无布局，往宿主工具栏插按钮 + 自管 popover（`rw:570`） | **抄 task-board 的三层骨架 + header 收口工具区**；比价页不需要列式看板，但 header 结构完全适用 |
| 状态与反馈 | 无 toast：`role=status` 播报 + `ConfirmDialog(alertdialog)` + `usePresence` 退场（`tb:8523`/`tb:11428`） | 无 toast：`p.banner[data-kind]` 就地报错 + 三级空态（`se:517`/`se:1809`） | 无 toast：stale/reconcile/unpriced 提示条各有 testid 可关（`ub@276096`） | 无 toast：`plan` 预览面板 + `role=status` + `effectState:'unknown'`（`ops runtime-panel`） | 无 toast：`impact` 预览 + Esc 关闭（`rw:512`） | **6 家全都不用 toast** → 本项目也不该用；就地 banner + `role=status` + 危险动作预览 |
| 表格与数据 | 卡片流，无数值列；时间用相对格式分档 + `Intl` 缓存（`tb:7407`） | 列表行 + badge；无表格 | **真正的数据表**：`numCol`+`tabular-nums`+右对齐+`nowrap`，`≈` 标估算、`—` 标缺失（`ub@280486`） | 无机 | 无 | **表格直接对标 usage-billing**，但要补 sticky 首末列；`≈`/`—` 双标记必须抄 |
| 控件体系 | 四档按钮 + 搜索 + 自绘 listbox(`role=listbox`) + 分段 chip（`tb:4336`/`tb:11672`） | facet chip 条 + switch(`aria-checked`) + 纯 CSS caret + Esc 清搜索（`se:1775`/`se:517`） | 五档 range(`aria-pressed`) + 三段密度 + `role=progressbar` 预算条 + 设置搜索（`ub@259136`） | 原生 checkbox + `accent-color`，`fieldset disabled` 整组禁用（`ops styles.js`） | 复用宿主 `Switch`/`SettingsValueField`（`rw:1790`） | **抄 skill-explorer 的 facet 条 + usage-billing 的 range/密度/进度条 + dsh-ops 的 accent-color** |
| 样式工程 | CSS Modules 哈希 + `<style>` 注入去重，纯 `--dsw-alias-*` 零兜底（`tb:4337`） | 同上（`ptK59a_`，`se:517`） | 同上（`KFXqYa_`），但 `--ds-*`/`--dsb-*`/`--dsw-*` 三代混用（`ub`） | 纯字符串 + 扁平前缀 + `ctx.effect` 清理 + **token 带兜底**（`ops styles.js`） | 纯字符串 + `CLASS` 常量表 + `dataset.plugin` 标记（`rw:1851`） | **本项目：保留自研 `ma-*`，但值改为 `var(--dsw-alias-*, 兜底)`；注入用 effect 清理；不引入 CSS Modules** |
| 图标体系 | `GLYPH` 常量（16×16/stroke1.3/round/`currentColor`/`aria-hidden`）+ `Glyph({size=14})`（`tb:4464`） | 内联 svg，16×16，stroke 1.5 | 内联 svg，16×16，stroke 1.5，设置导航用 | 无图标（纯 checkbox/文本） | 字符串模板 svg，15px（`rw:186`） | **全库一致：16×16 + `currentColor` + `aria-hidden` + stroke 1.3–1.5 + round cap**；抄 task-board 的常量写法 |
| 可访问性 | `useDialog` 五条契约 + focus trap + restore focus + `aria-expanded`/`role=listbox`（`tb:4820`） | `role=tab`/`switch`/`aria-pressed`/`aria-expanded`，无 focus trap（`se:517`） | `role=progressbar`/`navigation`/`group`，`aria-valuenow` 已 clamp（`ub@259136`） | `role=status` 7 处 / `alert` 1 / `region` 1，`aria-invalid`（`ops`） | `aria-expanded`/`haspopup`/`role=dialog`/Esc/焦点环（`rw:407`/`rw:640`） | **抄 task-board `useDialog` 全套 + dsh-ops 的 `aria-invalid`+`role=alert`**；这 6 家里只有 task-board 做了焦点归还 |
| 文案风格 | zh-first 字典 + `{name}` 插值 + **按 cause 分档的错误族**（`tb:3437`） | `key in zh` 探测回退，未翻译显示原文（`se:252`） | `t(...).replace('{x}',…)`，异常态文案各一（`ub`） | 失败文案写下一步动作（「请恢复最新已保存值后重新检查」）（`ops locales`） | 失败分 `impact.none`/`impact.failed {message}`（`rw:512`） | **抄 task-board 的错误分档 + dsh-ops 的「下一步动作」句式**；本项目探测失败至少要分 5 类 |
| 注册方式 | `ctx.slots.inject('sidebar.panellist'/'main')`，`PANEL_ORDER=20`，绝不接管 DOM（`tb:11067`） | 同（`se:2092`） | 未在此列（配置卡） | `slots.register('plugins.row.config')` + `view==='summary'` 双模态（`ops index.js`） | `inject=[...,'commandUi','configForms']`，往 header actions 插按钮（`rw`） | **抄 task-board 的 seat 贡献模型 + dsh-ops 的 summary/form 双模态** |
| 代码组织 | 单文件 13811 行（产物），靠 `//#region` 分区 | 单文件 2325 行 + 3 个 `.ts` 子模块 | 5 行压缩产物（不可维护，**反例**） | 7 个 ≤108 行的小模块（**范本**） | 单文件 2046 行（命令式） | **抄 dsh-ops 的模块粒度**：本项目 `src/parts/` 已接近，补一个共享 `forms.js` 即可 |

---

## 8. 推荐清单（按对本项目价值排序）

1. **`useDialog` 全套 modal 契约**（focus 归还、Esc 分层、Tab 环绕、退场期间不理 Esc） —— `tb lib/client.js:4820-4900`。比价页的「站点详情 / 价目编辑 / 批量重测确认」都是弹窗，没有这 5 条键盘用户直接卡死。**改动量最小、收益最大**。
2. **错误文案按 cause 分档 + 写清下一步**（超时/401/403/429/5xx/非 JSON 各一句，并说明「反复重启无效」这类反直觉事实） —— `tb lib/client.js:3437-3446`。本项目现在的「请求失败」等于没说话。
3. **危险动作 `plan → 预览清单 → 可取消 execute`，结果带 `effectState:'unknown'`** —— `ops lib/client/runtime-panel.js:1-108`。「切换路由目标 / 批量重测 / 应用价目表」三处直接复用；预览清单用结构化 `details[]` 而非字符串。
4. **数值列三件套 + `≈`/`—` 双标记 + `Intl` 格式化器 Map 缓存** —— `ub@280486`（表格）、`tb lib/client.js:7407-7422`（缓存）、`50-pricing.js`（本项目的 `pricingMoney`）。12 列宽表能不能「扫得动」全看这一条。
5. **本地控制令牌 + `data-*` 状态驱动 + 44px 热区伪元素 + `focus-visible` 统一配方** —— `tb lib/client.js:4336`。四条都是纯 CSS，一次加完，后续所有控件自动一致。
6. **facet 筛选条（轴名定宽 + pill chip + chip 内计数）+ 「轴内 OR / 轴间 AND」+ 搜索命中分级排序** —— `se lib/client.js:1775-1900`、`se lib/client.js:1345-1420`。比价的 5 个筛选轴用这个版式，比 5 个下拉可读得多。
7. **偏好持久化四道保险 + 主题令牌带兜底值** —— `se lib/client.js:1208-1340`（存储）、`ops lib/client/styles.js`（`var(--dsw-…, 兜底)`）。隐私模式下 `localStorage` 会抛，不能让它把整页带崩。
8. **`GLYPH` 常量 + `Glyph({size=14})`** —— `tb lib/client.js:4464-4481`。15 行代码统一全项目图标。
9. **搜索/筛选的「互相让路」规则**（搜索激活时自动放宽收窄型开关） —— `tb lib/client.js:10655-10662`。避免「明明有价却搜不到」这类最伤信任的 bug。
10. **header 尾放数据口径（抓取时间 · 汇率 · 单位）** —— `tb lib/client.js:10740-10795`（`board.hostMeta {revision, timeZone}`）。比价数字被误解的成本极高，一行字解决。

---

## 9. 适用性评估（针对「多站点模型路由 / 比价 / 用量」面板）

### 9.1 明确适合、建议直接落地

| 模式 | 来源 | 为什么适合 |
|---|---|---|
| `useDialog` 五条契约 | `tb:4820-4900` | 本项目 3 个弹窗、2 个确认框，全是键盘可达性缺口 |
| 错误按 cause 分档 | `tb:3437-3446` | 探测/比价失败原因天然有 5–6 种，且用户要知道「等 / 换 key / 换站」 |
| `plan → 预览 → 可取消 execute` | `ops runtime-panel` | 路由切换与批量重测都是「昂贵且部分不可逆」 |
| 数值列 `tabular-nums`+右对齐+`nowrap` | `ub@280486` | 12 列 × 10 行全是数字 |
| `≈` 估算 / `—` 缺失双标记 | `ub@280486` | 「综合成本」本来就是加权估算，不标就是误导 |
| 本地控制令牌 + `data-*` 状态 | `tb:4336` | 站点/供给状态多（可用/限流/未探测/免费），一行一个 `[data-status]` 即可 |
| facet 筛选条（轴内 OR、轴间 AND） | `se:1775-1900`、`se:1345-1420` | 币种/缓存/分组/模式/限流 5 轴 |
| 偏好持久化四道保险 | `se:1208-1340` | 密度/隐藏列/币种/排序都要记，且不能因配额满而崩 |
| 令牌带兜底 `var(--x, fallback)` | `ops styles.js` | 本项目要同时跑在桌面外壳与独立网页 |
| `GLYPH` 常量 | `tb:4464-4481` | 图标散落九分片，统一成本极低 |
| header 尾数据口径 | `tb:10740-10795` | 汇率/单位/抓取时间是比价页最容易被问的三件事 |
| `role="progressbar"` 预算条 + 三档色 | `ub@259136` | 日预算/站余额 |
| `accent-color` 主题化 checkbox | `ops styles.js` | 「显示列」多选清单 |

### 9.2 部分适合（需要改造后使用）

| 模式 | 来源 | 改造点 |
|---|---|---|
| CSS Modules 哈希 + 类名映射表 | `tb:4337-4460` | 只抄「`<style>` 注入去重 + dataset 标记」，不引入构建期 CSS Modules（本项目是分片拼接产物） |
| 容器查询响应式 | `tb:4336` | 抄思路；本项目窄容器应该「隐藏低优先级列 + 允许横向滚动」，而不是把看板变成竖排 |
| 整卡可点（`cardOpen` 铺满） | `tb:4336` | 表格行不能这么干；改用 `<tr>` + 行内首列 `<button>`，或整行 `tabIndex=0` + Enter 打开 |
| `data-testid` 三段式命名 | `ub` 227 处 | 只抄命名法，集中成常量函数；且与 `data-ma-part`（皮肤契约）分开命名 |
| 复用宿主 `Switch`/`SettingsValueField` | `rw:1790` | 仅设置页用；表格内部自绘，避免一屏两种开关 |
| `impact` 影响预览 | `rw:512` | 改成 `ops` 的结构化 `details[]`，便于打勾与汇总 |
| 相对时间分档 | `tb:7427` | 用于「最后探测 N 分钟前」，但悬停必须给绝对时间 + 时区 |

### 9.3 明确不适合、不建议引入

| 模式 | 来源 | 为什么不适合 |
|---|---|---|
| 横向列式看板骨架（`grid-auto-flow:column` + 状态列） | `tb:4336`/`tb:10608` | 比价是「站点 × 指标」的行列矩阵，按状态分列会把同一站点的价格拆到 4 个列里，无法横向比较 |
| 移动端 `86cqw` 滚动画廊 + `scroll-snap` | `tb:4336` | 12 列表格横向滚动时应冻结首列（站点名）与末列（价差），不是整列吸附 |
| 空态插画（96×64 线稿） | `ub@276096` | 工具型面板可视高度宝贵；巧合的是 task-board/skill-explorer 两家都只用一句话 |
| `window.confirm` 做删除确认 | `se:1560-1702` | 无法展示影响清单、不跟随主题、不可键盘聚焦管理；本项目已有能力做 `alertdialog` |
| 三代令牌混用（`--ds-*`/`--dsb-*`/`--dsw-*`） | `ub`（588/70/58 次） | 换肤时部分颜色不跟随；本项目只保留一层 `--ma-*` 引用 `--dsw-alias-*` |
| 单行压缩产物作为长期形态 | `ub`（5 行）、`ctx`（27 行） | 无法 review、无法按行取证；本项目应保持 `src/parts/` 分片 + 可读产物 |
| 命令式 DOM 注入 + 自管 popover | `rw:570-631` | 本项目是模板字符串渲染 + 已有弹层；除非要做「悬停浮层」再考虑其定位参数 |
| 刷新按钮在 loading 时隐藏 | `se:1772-1781` | 会让人以为功能消失；应禁用 + spinner |
| AI/自动探测开关不给边界说明 | 反例（多家） | 会发网络请求、会改路由的开关必须写清「发几次请求、改不改配置」 |

### 9.4 一句话总结

**骨架学 task-board（header 收口 + `useDialog` 契约 + 控制令牌 + `data-*` 状态），列表/筛选学 skill-explorer（facet 条 + 轴语义 + 偏好容错），表格与数字学 usage-billing（`tabular-nums` + `≈`/`—` + 进度条），设置页与危险动作用 dsh-ops（模块粒度 + `plan` 预览 + 可取消 + `effectState`），浮层定位参考 rewind，注册门控参考 dsh-context。**
