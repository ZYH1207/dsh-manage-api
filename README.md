# dsh-manage-api

DSH 的 [ManageAPI](https://github.com/ZYH1207/ManageAPI) 插件端：把 ManageAPI 的守护进程、站点比价、智能决策、探针与真实用量，变成 DSH 里的原生功能。

## 安装

```bash
# 本地链接（开发/自用）
dsh plugin --profile desktop add "link:D:/AgentWorkPlace/DSH/dsh-manage-api"

# 或直接从 GitHub 安装
dsh plugin --profile desktop add "github:ZYH1207/dsh-manage-api"
```

装好后重启 DSH（或在插件页重载），打开 **设置 → ManageAPI**。
运行时（ManageAPI 本体）来自 [ZYH1207/ManageAPI](https://github.com/ZYH1207/ManageAPI)，可用 `config.runtimeDir` 指向本机目录，或装 `manage-api` npm 包。

## 它做什么

| 能力 | 落点 | 状态 |
|---|---|---|
| **主面板（左侧栏图标 + 中央功能区，和 plugins / task-board 平级）** | `sidebar.panellist`（id `manage-api`）+ `main`（key `manage-api`） | ✅ |
| 设置页常驻面板（概览 / 比价 / 决策 / 探针 / 用量） | `settings.section`（id `manage-api`） | ✅ |
| daemon 生命周期托管（attach-or-spawn、孤儿防护） | host 半边 | ✅ |
| 同源只读代理（只认 loopback + 自建 Origin 校验） | `webServer.register('/api/manage-api/*')` | ✅ |
| **站点 / Key 可管理（加站点向导、同步模型、查余额、删站点、加删 Key、账号登录）** | `webServer.register` + 白名单写代理 `lib/write-proxy.js` | ✅ |
| **比价页改价（模式切换 / 单价 / 币种 / 标为免费 / 复制供给，失焦即存）** | 比价页 → `PATCH /api/offers/:id` + `POST /api/offers/:id/duplicate` | ✅ |
| **决策页手动排序（↑↓ / 恢复自动）** | 智能决策 → `PUT /api/decisions/:key/order` | ✅ |
| **站点落价工具集（应用分组 / 改分组倍率 / 恢复站点值 / 识别分组 / 站点排序 / 账号登录）** | 站点卡 → `apply-group` / `group-ratio` / `restore-ratio` / `detect-groups` / `reorder` / `login` | ✅ |
| **基准价全量写（单条编辑 / 删除 / 从站导入 / 广场导入 / 内置参考价）** | 基准价页 → `PUT/DELETE /api/benchmarks*` + 三种导入 | ✅ |
| **免费池写操作（配额上限 / 平台增删 / 连接轮询 / 签到 / 刷新 / 诊断 / 账号管理）** | 免费页 → `/api/free/*`（14 条路由全接通） | ✅ |
| **网关开关（打开 / 关闭，带确认）** | 接入页 → `PATCH /api/gateway` | ✅ |
| **忽略模型（按厂牌分组、整组勾选、搜索，写 `ignoredModels`）** | 比价页弹窗 → `PATCH /api/settings` | ✅ |
| **模型接入（原「自动 DSH」）：选一个未忽略模型 → 写进 DSH 的 manage-api provider 并设为默认模型** | 接入页卡片（原网关页，第 2 个页签）→ `POST /api/manage-api/dsh-model`（`configEditor` + `agentDefaultModel`） | ✅ |
| **接入免费模型（开关在免费页；免费池模型以 `free/模型名` 接入，调用强制走免费通道）** | 免费页开关 → `PATCH /api/settings`（daemon `applyDshSettings`） | ✅ |
| 模型选择器刷新（写完立刻让输入框下方的选择器看到新模型） | host 广播 `llm/adapters-updated` + 客户端 `ctx.modelDirectories.catalog.refresh()` | ✅ |
| 诊断：宿主真实可选的 provider × 模型（含 `resolveModelInfo` 逐条结果） | `GET /api/manage-api/dsh-catalog` | ✅ |
| 最近请求路由决策（**不再展示 / 导出 Key**；接入地址收进模型接入卡） | 接入页底部（原网关页） | ✅ |
| 请求观测（`llm/stream` tee，取 usage/finish/ttft） | host 半边 | ✅ |
| 会话成本 chip（本会话 token / 调用次数） | `conversation.chat.assistant-actions` | ✅ |
| 真实流量回写评分（非 ManageAPI 渠道用量） | `POST /api/ingest/usage`（daemon 侧 ~50 行） | ✅ |
| 系统提示注入实时上下文 | `systemPrompt.context`（30s 刷新缓存） | ✅ |
| 模型/用量工具（给模型用） | `tools.register`：`manageapi_status/models/usage` | ✅ |
| `/manage` 命令（给人用，不进模型上下文） | `commands.register` | ✅ |
| 预算熔断 + 面板告警 | `tools.guard` + `settings.section` 顶部横幅 | ✅ |
| 模型列表动态化 | `llm.registerModelDiscovery` | ⛔ 受限（改由「模型接入」写 provider 模型列表，见下） |

### 为什么"模型列表动态化"没做成

`llm.registerModelDiscovery(settingsNs, discover)` 只能为**插件自己拥有的 settings 命名空间**注册发现器；
ManageAPI 这个 provider 的命名空间属于 `llm-pi-ai`，第三方插件无权注册（会与它冲突）。
所以模型选择器里那两条硬编码模型仍由 `llm-pi-ai` 的配置管理，插件侧改用三条路覆盖同一需求：
`manageapi_models` 工具（模型可自查）、`/manage models` 命令（人可自查）、设置页「比价」子页（全量视图）。

## 入口在哪

- **主面板**：左侧栏的 ManageAPI 图标（和「插件」「任务板」同一列）→ 在中央主视图整页打开，宽屏布局、可滚动。
- **设置页**：设置 → ManageAPI（同一面板的紧凑版，随时可达）。
- **会话里**：每条助手消息下方的 `⇄ N tok / M 次` 成本 chip；以及 `/manage` 命令。

## 模型接入（原「自动 DSH」）与「不再展示 Key」

两件事是一起的：DSH 用户不需要拿 ManageAPI 的网关 Key 去填别的客户端——模型直接写进 DSH 自己的 provider 即可。

- **模型接入**（接入页卡片，原网关页、第 2 个页签）：列出 `modelIndex` 里**未被忽略**的模型，点选即保存。
  host 半边用 `configEditor.edit()` 把 `{id, name}` 幂等追加到 provider（`dshProvider`，默认 `manage-api`）的 `models` 列表，
  再调 `agentDefaultModel.saveSelection({provider, model})` 设为默认模型。纯写 DSH 配置，不碰 ManageAPI 的库。
  卡片内附接入地址（原「网关入口」卡收编成一行）与「网关未启用」告警。
- **接入免费模型**（开关在免费页）：daemon 侧裸名只路由付费池、`free/模型名` 前缀强制免费池，
  所以免费池独有的模型只有在开关打开时才以 `free/模型名` 进接入列表（设置键 `settings.dshFreeModels`，默认关）。
- **不展示 Key**：接入页只留「最近请求」路由决策表；`/state` 响应里
  `gateway.keys[].key`（明文）与 `providers[].adminToken`（AES 密文）在 host 侧 `sanitizeState()` 剔除后才下发到渲染进程。
  daemon 的 `/v1` 与 Key 鉴权**保持不变**（DSH 的 manage-api provider 仍然走它），只是插件不再展示、不再引导复制。

## 界面与网页版一致（怎么做到的）

面板不是另画一套 UI，而是**把 ManageAPI 网页版（`web/style.css`）的样式表作用域化后内置进插件**：

- `tools/vendor-theme.mjs` 读 `../ManageAPI/web/style.css`，把 `:root` → `.ma-root`、
  `[data-theme='dark']` → `.ma-root[data-ma-theme='dark']`、`html/body/*` 这些宿主级锚点改写掉，
  其余 710 个选择器全部加 `.ma-root` 前缀（越界 0），产出 `lib/theme.js`；
- `tools/embed-theme.mjs` 把这张表灌进 `lib/client.js` 的 `// >>> theme:begin … // <<< theme:end`
  标记块之间（客户端是手写 bundle、没有构建步骤，所以样式必须内联）；
- `lib/client.js` 用 React 重写 DOM，但**沿用网页版的 class 与结构**（`.topbar` / `.card` /
  `.table-wrap` / `.stats` / `.badge` / `.notice` / `.score-wrap` …），所以配色、圆角、字阶、
  状态色、表格样式与网页版一致；明暗主题跟随宿主（`prefers-color-scheme`），深色 token 直接复用。

改了网页版样式后重新生成：

```bash
npm run theme        # = vendor-theme.mjs && embed-theme.mjs
npm run check        # 70 项自检（含渲染冒烟）
```

不做的两件事：**不用 iframe**（拿不到主题 token / 明暗切换 / locale），**不重写 `web/app.js`**
（5700 行、47 处全量 innerHTML 重渲染，搬不动也没必要）。

## 写操作怎么走（为什么不直连 4319）

面板上的「加站点 / 加 Key / 同步模型 / 删站点」**不直连 daemon**，而是发到插件自己的
`POST /api/manage-api/write`，由 `lib/write-proxy.js` 按白名单转发：

- 白名单只有 12 条（站点 CRUD、同步、识别系别、查余额/用量、账号登录、Key 增删、改设置、跑探针），
  不在表里的一律 403 —— 避免把 daemon 的整个管理面变成免鉴权插件路由；
- 请求体固定 `{ method, path, payload }`，**不接受 query**（防止绕过瘦身裁剪）；
- daemon 的写接口多数 `return buildState()`（实测 416KB），这里只回传小字段
  （`sync` / `loginResult` / 新建站点的 id），客户端写完后自己重拉 `/api/manage-api/state`；
- 失败文案原样透传 daemon 的中文提示（「站点名称不能为空」「该 API 端点已存在」）。

## 常用命令

```text
/manage            概览：站点数 / 供给数 / 最划算的站 / 今日用量 / 预算
/manage models     模型比价（★ = 该模型最便宜的站）
/manage models glm 只看匹配的模型
/manage usage      今日全渠道用量 + 本进程观测到的会话
/manage budget     本会话 / 今日预算与是否已熔断
```

命令结果直接显示在会话里，**不会进入消息历史、不发给模型**。

## 依赖关系（重要）

- **不重复造轮子**：选站、换站、记账、探针都在 ManageAPI 的 daemon 里，插件只做"让 DSH 知道这些"。
- **daemon 在跑 = 最有利状态**：插件探测到 `/api/health` 通就 **attach**（不抢实例锁、不写库、退出时不动它）。
- **只装了插件端也能用**：插件会自己 spawn 内置/依赖的 ManageAPI 运行时（`ELECTRON_RUN_AS_NODE=1`），DSH 退出时一起停。
- **唯一写通道是 daemon HTTP**：插件不在宿主进程里写 `db.json`（两个进程同时写会互相覆盖）。

## 运行时解析顺序

1. `cordis.patch.yml` 里的 `config.runtimeDir`
2. npm 依赖 `manage-api`（`createRequire().resolve('manage-api/package.json')`）
3. 包内 `runtime/`（内嵌形态）
4. 同仓开发目录（`dsh-plugin/..`）

## 配置项（都在 `cordis.patch.yml` 的 `config` 里）

```yaml
- insert:
    - id: manage-api
      name: dsh-manage-api
      config:
        port: 4319              # daemon 端口（默认 4319）
        autoStart: true         # 探不到 daemon 就自己拉起
        runtimeDir: ""          # 显式指定 ManageAPI 目录；空则按「运行时解析顺序」找
        waitMs: 10000           # 冷启动等待上限
        ingestExternalUsage: true  # 把非 ManageAPI 渠道的真实用量回写给 daemon
        promptContext: true     # 把站点/比价/用量注入系统提示词上下文
        mainPanel: true         # 注册左侧栏图标 + 中央主面板；false 则只留设置页分区
        budget:                 # 0 = 不设限；超限后拒绝一切工具调用逼模型收尾
          sessionTokens: 0
          dailyTokens: 0
```

> 预算只作用于**工具调用**：模型请求由宿主直接发出，插件是旁观者。拒绝一切工具后 agent
> 无法继续扩大动作面，配合提示词里的超限警告通常会自己收尾。

## 安装（开发期）

```bash
# 在 profile 里安装并注册 bundle
dsh plugin --profile desktop add "link:D:/AgentWorkPlace/DSH/dsh-manage-api"
# 或：dsh plugin --profile desktop add "github:ZYH1207/dsh-manage-api"
# 再把 "dsh-manage-api" 加进 profile package.json 的 dsh.profile.bundles
```

## 排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 面板显示「宿主路由返回了非 JSON 响应」 | 客户端与宿主的 API 前缀不一致（曾是 `dsh-manage-api` vs `manage-api`） | 已修；刷新页面即可。`scripts/check.mjs` 有一致性断言 |
| 重启 DSH 后面板一直 401 / 非 JSON，但 `/manage` 和工具都正常 | 路由注册用了 `ctx.get('webServer')` 一次性探，激活早于 webServer 就绪时**永久跳过注册** | 已改为 `ctx.inject(['webServer'], …)`，等依赖就绪再注册；自检里有断言 |
| 面板状态「未运行」但端口 4319 有进程 | 那个是旧进程，不认识 `/api/ingest/usage` | 关掉旧进程让插件自己 spawn（`mode: owned`），或用面板的「重启托管」 |
| DSH 能看到模型但调不通 | daemon 没跑（provider 指向 `127.0.0.1:4319`） | 设置页 → ManageAPI → 「启动托管」 |

## 安全

- 所有插件路由只允许 **loopback** 来源；跨站请求（`Sec-Fetch-Site: cross-site` / 非回环 Origin）一律 403。
- 写操作强制 `application/json`（`<form>` 发不出来），堵掉恶意网页的表单/图片触发。
- 本机环境装了 `dsh-remote-web-ui` 且开着隧道，所以这条约束不是可选项。

## 变更记录

- **0.10.2** —— 修「自动 DSH」两个显示 bug：① 开关点击后状态不更新 —— 宿主 `GET /dsh-model` 下发的 `models` 是 id 字符串数组，前端却按 `{id,name}` 对象读，`registered` 永远为空，开关永远显示关；现在两种形态都吃。② 模型行高度失控（卡片下方一大片空白）—— `.auto-dsh-name` 沿用了旧横向列表的 `flex:1 1 240px`，搬进纵向 `.switch-text` 后 flex-basis 变成「高 240px」，每行撑到 280px；改为 `flex:none`，并让行自己 flex、列表不再 46vh 内滚。
- **0.10.1** —— 「自动 DSH」由单选改多选开关：每个模型一个开关，打开＝写进选择器分组 `dsh-manage-api` 并设为 DSH 默认模型，关闭＝从分组里摘掉；多个模型可同时存在于该组、互不影响，默认模型可以在任意已打开的模型上点「设为默认」切换。关掉当前默认模型时自动改指组里剩下的第一个；组里最后一个模型且正是当前默认时拒绝关闭（避免 DSH 默认模型指向不存在的模型），摘空则整组删除。`POST /api/manage-api/dsh-model` 新增 `enabled` 字段（缺省 true）。
- **0.10.0** —— 模型选择器里给插件单独一组：`dsh-manage-api`（分组名「DSH ManageAPI」）。以前「自动 DSH」是往你手写的 `llm-pi-ai` → `manage-api` 路由里追加模型，在会话输入框下方的模型选择器里就混在「ManageAPI」那组里、和客户端网关路由分不开。现在插件独占 provider id `dsh-manage-api`：面板里选中一个模型 → 该组第一次写入时自动建出完整路由（`api: openai-completions` + `baseURL` 指向本机 daemon `/v1` + `apiKeyEnv: MANAGE_API_API_KEY` + `displayName: DSH ManageAPI`）并追加模型，同时设为 DSH 默认模型；你手写的 `manage-api` 网关路由完全不动。`lib/index.js` 的 `dshProvider` 默认值同步改为 `dsh-manage-api`。
- **0.9.3** —— 修「加完模型，会话输入框下方的模型选择器里看不到」。根因不在写入链路：宿主 `ctx.llm` 注册表里 `manage-api` 与模型都在（模型选择器的数据源是 `buildModelCatalog()`），但客户端把这份目录按 Host generation 缓存，只有 `llm/adapters-updated` / `settings/document-updated` 等远端事件到达时才重拉；插件写 provider 走的是宿主 `configEditor`，事件不保证送到客户端，于是「配置已生效、选择器还是旧快照」。现在双保险：① host 侧 `configure()` 成功后主动广播一次 `llm/adapters-updated`（`notifyAdaptersUpdated()`，返回体带 `nudged`）；② 面板「自动 DSH」写入成功后调用客户端 `ctx.modelDirectories.catalog.refresh()`（`nudgeModelCatalog()`），选择器立即重拉。另加诊断端点 `GET /api/manage-api/dsh-catalog`：返回宿主真实可选的 `provider × 模型`（含逐个 `resolveModelInfo` 的成功/失败原因），排查「某个 provider 整组消失」时直接看它。
- **0.9.2** —— ①「自动 DSH」的 provider 写入再补一层：合并继承层时若仍缺路由字段，用 `baseUrl` 兜底补 `api: openai-completions` + `baseURL`（`createDshModel({ baseUrl })`），并把 `apiKeyEnv` 一起带上；真机 `POST /api/manage-api/dsh-model` 往返验证 provider 块始终保持 `api`/`baseURL`/`apiKeyEnv`/`models` 完整。② 决策页「放行可疑供给」开关增加布局兜底：`.switch-text` 加 `flex:1 1 auto; min-width:12em`，避免 flex 收缩把中文标题压成「每行一个字」的竖排。
- **0.9.1** —— 修「自动 DSH」接入必失败：写 `providers.<name>.models` 时原先把整个 provider 块替换成只剩 `models`，把继承来的 `api`/`baseURL`/`apiKeyEnv` 顶掉，`llm-pi-ai` 随即报 `model "x" needs an api; the installed catalog does not describe it`。现在先合并继承层 + 已有覆盖层再写入，缺字段时补兜底路由；接入失败/成功原因也直接显示在卡片上（`msg-line.is-err` / `.is-ok`），模型名不再被省略号截断。
- **0.9.0** —— 前端数据层按 `docs/our-free-model-eval.md` 改造：`useApi` 加竞态序号 + 错误态（断网/daemon 挂掉不再永久「加载中」）、首答前显示骨架、`fetchJson` 不再把 HTML 错误页吞成 `ok:true`；`scripts/check.mjs` 99 项。
- **0.8.1** —— 修写操作全 403：DSH 渲染进程的 POST 不带 `Origin/Referer`，改为「拒绝 `Sec-Fetch-Site: cross-site` + 强制 JSON」双保险（跨站发 JSON 必走 CORS 预检，本服务不回 ACK）。
- **0.8.0** —— 网关页不再展示 API Key（`/state` 侧剥离 `gateway.keys[].key` 与 `providers[].adminToken`）；概览新增「自动 DSH」模型选择卡（写入 provider 模型列表 + 设为默认模型）。
- **0.7.x** —— 站点页改为「真实花费」（新增 `GET /api/manage-api/monitor`）；比价页补齐「忽略模型」弹窗。

## 许可

MIT
