# DSH 插件端方案 v3：把管理面搬进 DSH（写操作内建）

> 状态：**方案稿，待确认后开工**。日期 2026-10-30。
>
> 触发原因（用户原话）："你这不还是依赖原先的客户端吗，重新出一套方案，我现在都没办法添加站点"。
>
> 结论先说：**v2 做的是「只读观测面」，管理动作（加站点/加 Key/改价/跑探针）仍然只能在 `http://127.0.0.1:4319` 的旧网页里做。v3 把这些动作全部内建成 DSH 原生能力，4319 网页降级为可选。**

---

## 1. 问题：v2 的能力边界卡在哪

| 动作 | v2（现状） | 用户的感受 |
|---|---|---|
| 看比价 / 决策 / 探针 / 用量 | ✅ 设置页面板 | 满意 |
| 看成本 / 看提示词上下文 | ✅ chip / 系统提示 | 满意 |
| **加站点、加 Key** | ❌ 只能开 4319 网页 | **卡住** |
| 改价格 / 跑探针 / 改设置 | ❌ 同上 | 卡住 |
| 删站点 / 换 Key | ❌ 同上 | 卡住 |

根因不是"插件没做管理"，而是 v2 把插件定位成「观测层」，写操作整段留给了旧网页。用户装的插件若还要靠旧网页才能用起来，等于没装。

## 2. 目标

1. **零浏览器**完成日常管理：新用户从「装插件」到「能跑通一个站点」全程不出 DSH。
2. 写操作与 `4319` 网页**同一套后端、同一份数据**（不新增第二写者）。
3. 密钥类输入只走一次单向通道：不进日志、不回显、不进模型上下文。
4. 旧网页保留可用，但**不再是被迫路径**。

## 3. 架构：写通道怎么走

```
DSH 渲染进程（React 表单）
   │  fetch /api/manage-api/...（宿主会话内、同源）
   ▼
插件 host 半边：白名单写代理（唯一安全边界）
   │  ① connection.requestRejection(req)  —— 必须是已登录的 DSH GUI 会话
   │  ② 方法白名单 + 路径白名单（逐条，不做通用转发）
   │  ③ 强制 application/json
   │  daemonPost(port, '/api/providers', body)
   ▼
ManageAPI daemon（127.0.0.1:4319，已有 51 条路由）
   │
   ▼  返回 buildState()（≈400KB）
插件代理：裁剪成 { ok, summary, changedId } + 客户端按需拉 /state?light=1
```

三条"不做"的硬规则（沿用 v2 已验证的结论）：

- **不让 client 直连 4319**：端口可被 `EADDRINUSE` 自动 +1、跨源、密钥会进渲染进程日志、`/api/*` 无鉴权（本机还开着 remote 隧道）。
- **不在宿主进程 import `core/store.js`**：core 有 6 处模块级写链，同进程 import 两次 = 两条写链，跨进程更会互相覆盖。
- **不做通用 `/api/*` 反向代理**：一旦做成通配转发，宿主进程就成了本机任意程序的免鉴权写入口。

安全升级（相对 v2 的只读代理）：v2 用自建 Origin 校验，只能挡浏览器跨站；v3 的写路由直接调 `connection.requestRejection(req)`，复用宿主的**浏览器登录态**，非登录会话一律 401。读路由维持现状（loopback + Origin 校验）。

## 4. 接口映射：daemon 已经全有，插件只做翻译

写通道需要的 daemon 端点全部**已存在**（`daemon/server.js`，路由表 `:445` 起，51 条）：

### 4.1 站点（P3.1 核心）

| 面板动作 | daemon 端点 | 关键字段 |
|---|---|---|
| 新增站点 | `POST /api/providers` | `{name*, baseUrl?, siteUrl?, kind?, note?}`；baseUrl 与 siteUrl 至少给一个 |
| 编辑站点 | `PATCH /api/providers/:id` | `{name?, baseUrl?, siteUrl?, kind?, kindSource?, note?, adminToken?}` |
| 删除站点 | `DELETE /api/providers/:id` | — |
| 拖拽排序 | `POST /api/providers/reorder` | `{ids: string[]}` |
| 识别系别 | `POST /api/providers/:id/detect-kind` | —（带令牌再探一次） |
| 账号密码登录 | `POST /api/providers/:id/login` | `{user*, password*, confirmUnknown?}`；返回 409 + `needConfirm` 时二次确认 |
| 同步模型 | `POST /api/providers/:id/sync` | `{credentialId?}`；无 Key 时报「该站点还没有 Key」 |
| 余额 / 用量检查 | `POST /api/providers/:id/balance`、`/usage-check` | — |
| 分组倍率 | `POST /api/providers/:id/{group-ratio,apply-group,detect-groups,restore-ratio}` | 按旧网页同参 |

### 4.2 Key / 凭据

| 动作 | 端点 | 字段 |
|---|---|---|
| 新增 Key | `POST /api/credentials` | `{providerId*, label?, secret*, group?, expiresAt?}`；只回 `tail` 后四位 |
| 改 Key | `PATCH /api/credentials/:id` | `{label?, group?, expiresAt?}`（不改明文） |
| 删 Key | `DELETE /api/credentials/:id` | — |

### 4.3 其余资源（P3.2/P3.3）

- 供给：`PATCH /api/offers/:id`、`POST /api/offers/:id/duplicate`、`/free-quota`
- 设置：`PATCH /api/settings`（汇率/忽略模型/展示项）
- 探针：`POST /api/probes/run`（单站或全量）
- 免费池：`POST|DELETE /api/free/platforms`、`/accounts`、`/checkin`、`/connect`、`/connect/poll`、`/refresh`、`/diagnose`
- 网关：`POST|PATCH|DELETE /api/gateway/keys`、`/rotate`、`PATCH /api/gateway`
- 基准价：`PUT|DELETE /api/benchmarks`、`/import`、`/seed`、`/import-plaza`
- 汇率：`POST /api/fx/refresh`；监控：`POST /api/monitor/collect|alerts/read|announcements/read`
- 决策排序：`PUT /api/decisions/:key/order`

## 5. 两个必须解决的技术点

### 5.1 写接口的 400KB 响应

daemon 所有写接口末尾都是 `return buildState()`，一次保存回 416KB。方案二选一：

- **A（推荐）**：daemon 加一个统一中间件——写路由的返回按 `?light=1` 或 `x-ma-light: 1` 走 `buildLightState()`（约 15 行，和读接口一致）。插件写通道固定带这个头，响应从 416KB 降到 ~10KB。
- B：插件侧裁剪（只回 `{ok:true}` + 客户端重新拉 `?light=1`）。不改 daemon，但每次保存仍要传 416KB 一次。

倾向 A：一次改动换来所有写动作的响应瘦身，且对旧网页零影响（不带 header 就走老路径）。

### 5.2 写操作的"事后一致性"

- 写成功后：客户端立即重拉 `/state?light=1` + `/health`，面板与 `/manage` 数字同源。
- 并发写：daemon 的 `store.mutate()` 进程内串行、跨进程有实例锁；插件只走 HTTP，天然是唯一写者。
- 失败：把 daemon 的中文错误（`HttpError` 400/500 文案）**原样**展示，不翻译、不吞掉——"站点名称不能为空"这种提示比"保存失败"有用得多。

## 6. 客户端 UI

新增两个只读 tab 变成可写，再加两个新 tab：

```
ManageAPI
├─ 概览      （只读，已有）
├─ 站点      ★ 新：卡片列表 + 新增/编辑/删除/排序/登录/同步/探针
├─ Keys      ★ 新：按站点分组的 Key 列表（tail 后四位）+ 新增/删除/改分组
├─ 比价      （已有，P3.2 加"改价"）
├─ 决策      （只读，P3.2 加手动排序）
├─ 探针      （已有，P3.2 加"跑一次"）
└─ 用量      （已有）
```

**添加站点向导（3 步，一屏内）**

1. 站点名 + API 端点 + 网站地址（三者关系写在输入框下方，不再让人猜 `/v1` 要不要带）
2. 系别（自动 / vendor / relay / one-api / new-api / sub2api）+ 第一把 Key（可选，可后补）
3. 保存后自动跑：识别系别 →（有 Key 时）同步模型 → 显示"拉到 N 个模型"

**表单原语**（手写，无构建，复用 `S` 样式表）：`Field`（label + hint + error）、`TextField`、`SecretField`（密码框 + 显示/隐藏）、`SelectField`、`SwitchField`、`Button`、`DangerButton`（删除要输入站点名确认）。

**状态**：`idle → saving → ok/error`；保存中禁用按钮；取消/保存常驻底部；错误就地显示在字段下方（对应字段）或顶部（整体）。

## 7. 分期

| 期 | 内容 | 工作量 | 验收 |
|---|---|---|---|
| **P3.1** | 写通道（白名单 + 认证）+ 站点 CRUD + Key CRUD + 同步模型 + 识别系别 + 添加向导 | 1–2 天 | 在 DSH 面板里从零完成"建站 → 填 Key → 同步模型 → 探针 → 选站生效"，全程不开浏览器 |
| **P3.2** | 改价 / 忽略模型 / 设置 / 跑探针 / 决策手动排序 | 1 天 | 面板能改任一供给价格并立刻影响选站 |
| **P3.3** | 免费池 / 网关 Key / 基准价 / 备份导入导出 / 分组倍率 | 按需 | 旧网页的每个写动作在面板都有等价入口 |

P3.1 交付即可回答"我现在没法添加站点"。

## 8. 不做什么

- 不重写 `web/`（旧 vanillajs 页面），不改它的行为；只给 daemon 加一个 `light` 响应开关。
- 不用 iframe 嵌 4319 网页（拿不到主题、拿不到 locale、跨源取不到数据、还要处理端口漂移）。
- 不做通用反向代理，不做"任意路径转发"模式。
- 不在面板里回显任何密钥明文；`adminToken` / `secret` 只进不出。

## 9. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 表单太复杂，写错就想放弃 | 中 | 添加向导只强制 2 个字段；其余用"自动识别/默认值"兜 |
| daemon 写接口语义不统一（有的要 `confirmUnknown`、有的 409） | 中 | 逐条在插件里建模，不追求"通用表单" |
| 写通道变成免鉴权入口 | 高（本机有 remote 隧道） | 写路由强制 `connection.requestRejection` + 方法/路径白名单 |
| 密钥进入日志/上下文 | 高 | 只走 host 直传；`SecretField` 不写 state；`/health` 不回显；不 `log()` 请求体 |
| daemon 版本老（不认 `light` 头） | 低 | 响应大一点，功能不受影响（降级不报错） |

## 10. 今天就能加站点的两条临时路径（P3.1 上线前）

1. **给我三样东西**（站点名 / API 端点 / Key），我直接通过 daemon API 建好并跑通。
2. **自己跑一条命令**（在 PowerShell 里，Key 换成你自己的）：

```powershell
$body = @{ name = '我的站'; baseUrl = 'https://api.example.com/v1'; siteUrl = 'https://example.com' } | ConvertTo-Json
$p = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4319/api/providers' -ContentType 'application/json' -Body $body
$p.providers | Where-Object { $_.name -eq '我的站' } | Select-Object id, name, baseUrl
```

拿到 `id` 后再加 Key：

```powershell
$body = @{ providerId = 'p_xxx'; label = '默认'; secret = 'sk-xxxx' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4319/api/credentials' -ContentType 'application/json' -Body $body | Out-Null
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4319/api/providers/p_xxx/sync' -ContentType 'application/json' -Body '{}' | Out-Null
```
