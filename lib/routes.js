/**
 * 插件自身的 HTTP 路由（host 半边，挂在插件 webServer 的 `/api/manage-api` 前缀下）。
 *
 * ## 三条原则
 *
 * 1. **只做代理，不做业务**：选站/比价/记账/探针都在 daemon 里，插件不重复实现。
 * 2. **daemon 在跑就以它为准**：不在宿主进程里 import `core/store.js` 造第二份状态
 *    （`mutate()` 只保证进程内串行，跨进程最后写入者覆盖）。daemon 不在时才走只读兜底。
 * 3. **只读兜底用裸 `fs.readFile`**：`db.json` 是 tmp+rename 的原子写产物，读到的一定是完整快照；
 *    不走 `core/store.js` 的 `readDbCached`（它按 mtime+size 判缓存，可能给旧值，且会拉起模块级状态）。
 *
 * ## 安全
 *
 * 全部路由先过 `checkLocalOrigin`（只认回环 + 挡跨站），写操作还要求 JSON content-type。
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { checkLocalOrigin, readJsonBody, sendJson, wantsJson } from './http.js'
import { runWrite } from './write-proxy.js'

const PREFIX = '/api/manage-api'

function dataDir() {
  return process.env.MANAGE_API_HOME || join(homedir(), '.manage-api')
}

/**
 * 直读 db.json（daemon 不在时的只读兜底）。
 */
async function readDbFile() {
  const file = join(dataDir(), 'db.json')
  const text = await readFile(file, 'utf8')
  return JSON.parse(text)
}

/**
 * 会话流式用量快照（`llm/stream` tee 攒在宿主内存里的计数）。
 *
 * 只暴露派生数字，不回传原始 options / chunk：里面可能有 prompt 片段。
 *
 * @param {Map<string, {tokens: number, calls: number, lastAt: number, model: string}>} streamStats
 * @param {string} session 会话 id；空串表示要全部（按最近活跃排序，最多 50 条）
 */
function streamStatsSnapshot(streamStats, session) {
  const entries = streamStats && typeof streamStats.get === 'function'
    ? Array.from(streamStats.entries())
    : []
  if (session) {
    const hit = streamStats && typeof streamStats.get === 'function' ? streamStats.get(session) : null
    return { ok: true, at: new Date().toISOString(), session, stats: hit || null }
  }
  const sessions = entries
    .map(([sessionId, value]) => ({
      sessionId,
      tokens: value.tokens || 0,
      calls: value.calls || 0,
      lastAt: value.lastAt || 0,
      model: value.model || '',
    }))
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    .slice(0, 50)
  const totals = sessions.reduce(
    (acc, row) => ({ tokens: acc.tokens + row.tokens, calls: acc.calls + row.calls }),
    { tokens: 0, calls: 0 },
  )
  return { ok: true, at: new Date().toISOString(), totals, sessions }
}

/**
 * 转发到 daemon。
 * @param {{ port: number }} options
 * @param {string} pathWithQuery daemon 侧路径，例如 '/api/state?light=1'
 */
async function forwardToDaemon(options, pathWithQuery) {
  const url = `http://127.0.0.1:${options.port}${pathWithQuery}`
  const res = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 4000) }
  }
  return { status: res.status, body }
}

/**
 * 把 daemon state 里前端不需要的密钥剥掉再发给渲染进程。
 *
 * 网关页已不再展示 Key，DSH 用户也不需要拿 Key 去接别的客户端，所以明文 Key 没有留在
 * 浏览器的理由：`gateway.keys[].key`（`sk-mapi-...` 明文）与 `providers[].adminToken`
 * （AES 密文 iv/tag/data）一律剔除；名称/限额/状态等展示字段保留。
 *
 * 注意：这是展示层脱敏，不改 daemon 的鉴权行为 —— `/v1` 仍然校验 Key。
 */
export function sanitizeState(state) {
  if (!state || typeof state !== 'object') return state
  const out = { ...state }
  if (out.gateway && typeof out.gateway === 'object') {
    const gateway = { ...out.gateway }
    if (Array.isArray(gateway.keys)) {
      gateway.keys = gateway.keys.map((row) => {
        if (!row || typeof row !== 'object') return row
        const { key, ...rest } = row
        return rest
      })
    }
    out.gateway = gateway
  }
  if (Array.isArray(out.providers)) {
    out.providers = out.providers.map((row) => {
      if (!row || typeof row !== 'object') return row
      const { adminToken, ...rest } = row
      return rest
    })
  }
  return out
}

/**
 * 注册路由。
 *
 * @param {{ webServer: any, manager: any, config: any, log: (...a: any[]) => void }} deps
 * @returns {() => void} disposer 集合
 */
export function registerRoutes(deps) {
  const { webServer, manager, config, log, streamStats, budget, ingest, promptRefresh, promptDebug, toolInfo, commandInfo, mainPanel, dshModel, dshModelConfigure, dshModelCatalog } = deps
  if (!webServer || typeof webServer.register !== 'function') {
    log('webServer 不可用，跳过 /api/manage-api 路由（面板将拿不到数据）')
    return () => {}
  }

  const disposers = []

  /** @param {(req: any, res: any) => Promise<void>} handler */
  function route(handler) {
    return async (req, res) => {
      const guard = checkLocalOrigin(req)
      if (!guard.ok) {
        sendJson(res, 403, { ok: false, error: `forbidden: ${guard.reason}` })
        return
      }
      if (!wantsJson(req)) {
        sendJson(res, 415, { ok: false, error: '写操作必须用 application/json' })
        return
      }
      try {
        await handler(req, res)
      } catch (err) {
        const message = String(err && err.message ? err.message : err)
        log(`路由异常：${message}`)
        if (!res.writableEnded) sendJson(res, 500, { ok: false, error: message })
      }
    }
  }

  disposers.push(
    webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: route(async (req, res) => {
        const url = new URL(String(req.url || '/'), 'http://127.0.0.1')
        const sub = url.pathname.slice(PREFIX.length).replace(/^\/+/, '')
        const method = String(req.method || 'GET').toUpperCase()

        // ── GET /api/manage-api/health ────────────────────────────────
        if (sub === 'health' && method === 'GET') {
          if (typeof promptRefresh === 'function') promptRefresh()
          const probe = await manager.probe()
          sendJson(res, 200, {
            ok: true,
            plugin: { name: 'dsh-manage-api', version: config.pluginVersion || '0.1.0' },
            daemon: manager.snapshot(),
            probe: probe.ok ? { ok: true, body: probe.body ?? null } : { ok: false, error: probe.error },
            dataDir: dataDir(),
            budget: budget && typeof budget.snapshot === 'function' ? budget.snapshot() : null,
            ingest: ingest && typeof ingest.snapshot === 'function' ? ingest.snapshot() : null,
            tools: typeof toolInfo === 'function' ? toolInfo() : null,
            commands: typeof commandInfo === 'function' ? commandInfo() : null,
            prompt: typeof promptDebug === 'function' ? promptDebug() : null,
            config: { mainPanel: mainPanel !== false },
            checkedAt: new Date().toISOString(),
          })
          return
        }

        // ── GET /api/manage-api/state ─────────────────────────────────
        if (sub === 'state' && method === 'GET') {
          if (typeof promptRefresh === 'function') promptRefresh()
          const full = url.searchParams.get('full') === '1'
          const snapshot = manager.snapshot()
          if (snapshot.mode === 'owned' || snapshot.mode === 'attached') {
            try {
              // panel=1：这份面板有自己独立的「忽略模型」名单（settings.panelIgnoredModels），
              // 所以要拿全量在役供给自己过滤，不能被路由端的 ignoredModels 先裁一刀。
              const daemonPath = full ? '/api/state?panel=1' : '/api/state?light=1&panel=1'
              const result = await forwardToDaemon({ port: config.port }, daemonPath)
              sendJson(res, result.status === 200 ? 200 : result.status, {
                ok: result.status === 200,
                source: 'daemon',
                at: new Date().toISOString(),
                state: sanitizeState(result.body),
              })
              return
            } catch (err) {
              log(`转发 /api/state 失败：${String(err && err.message ? err.message : err)}`)
            }
          }
          // 兜底：直读文件（只读）
          try {
            const db = await readDbFile()
            sendJson(res, 200, {
              ok: true,
              source: 'file',
              degraded: true,
              at: new Date().toISOString(),
              state: sanitizeState(db),
            })
          } catch (err) {
            sendJson(res, 503, {
              ok: false,
              source: 'none',
              error: `daemon 未运行，且读不到 ${join(dataDir(), 'db.json')}：${String(err && err.message ? err.message : err)}`,
              daemon: manager.snapshot(),
            })
          }
          return
        }

        // ── GET /api/manage-api/stream-stats ─────────────────────────
        // 供会话成本 chip / 用量子页读：宿主内存里的 token 计数，不落盘、不 await。
        if (sub === 'stream-stats' && method === 'GET') {
          sendJson(res, 200, streamStatsSnapshot(streamStats, url.searchParams.get('session') || ''))
          return
        }

        // ── GET /api/manage-api/prompt ───────────────────────────────
        // 诊断用：确认注入系统提示词的文本、刷新时间与 daemon 判定模式。
        if (sub === 'prompt' && method === 'GET') {
          sendJson(res, 200, {
            ok: true,
            at: new Date().toISOString(),
            prompt: promptDebug && typeof promptDebug === 'function' ? promptDebug() : null,
          })
          return
        }

        // ── GET /api/manage-api/budget[?session=] ────────────────────
        // 预算与用量判定：面板、chip 的 title 都从这里读，避免各自算一遍。
        if (sub === 'budget' && method === 'GET') {
          const session = url.searchParams.get('session') || ''
          sendJson(res, 200, {
            ok: true,
            at: new Date().toISOString(),
            session: session || null,
            budget: budget && typeof budget.snapshot === 'function' ? budget.snapshot(session || undefined) : null,
            ingest: ingest && typeof ingest.snapshot === 'function' ? ingest.snapshot() : null,
            tools: typeof toolInfo === 'function' ? toolInfo() : null,
            commands: typeof commandInfo === 'function' ? commandInfo() : null,
            prompt: typeof promptDebug === 'function' ? promptDebug() : null,
          })
          return
        }

        // ── GET /api/manage-api/providers/:id/groups[?credentialId=&fresh=1] ──
        // 站点卡「应用分组」弹窗用：列站点分组 + 命中模型数。daemon 侧有 5 分钟缓存，
        // 但首次会去站点拉 channels/广场，超时给足 30s。
        if (/^providers\/[\w-]+\/groups$/.test(sub) && method === 'GET') {
          const snapshot = manager.snapshot()
          if (snapshot.mode !== 'owned' && snapshot.mode !== 'attached') {
            sendJson(res, 503, { ok: false, error: '守护进程未运行，分组读不到', daemon: snapshot })
            return
          }
          try {
            const result = await forwardToDaemon({ port: config.port, timeoutMs: 30_000 }, '/api/' + sub + (url.search || ''))
            sendJson(res, result.status === 200 ? 200 : result.status, result.body)
            return
          } catch (err) {
            sendJson(res, 502, { ok: false, error: `转发分组读取失败：${String(err && err.message ? err.message : err)}` })
            return
          }
        }

        // ── GET /api/manage-api/monitor[?days=] ─────────────────────
        // 站点页（余额 / 真实花费 / 趋势图）读的是 daemon 的 /api/monitor，
        // 不是 /api/state：账单与余额序列只在 monitor 视图里。透传只读，不缓存。
        if (sub === 'monitor' && method === 'GET') {
          const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))
          const snapshot = manager.snapshot()
          if (snapshot.mode !== 'owned' && snapshot.mode !== 'attached') {
            sendJson(res, 503, { ok: false, source: 'none', error: '守护进程未运行，余额与账单读不到', daemon: snapshot })
            return
          }
          try {
            const result = await forwardToDaemon({ port: config.port, timeoutMs: 60_000 }, `/api/monitor?days=${days}`)
            sendJson(res, result.status === 200 ? 200 : result.status, {
              ok: result.status === 200,
              source: 'daemon',
              at: new Date().toISOString(),
              days,
              data: result.body,
            })
            return
          } catch (err) {
            sendJson(res, 502, { ok: false, error: `转发 /api/monitor 失败：${String(err && err.message ? err.message : err)}` })
            return
          }
        }

        // ── POST /api/manage-api/daemon/{start,stop,restart} ──────────
        const daemonAction = sub.startsWith('daemon/') ? sub.slice('daemon/'.length) : ''
        if (daemonAction && method === 'POST') {
          await readJsonBody(req).catch(() => ({}))
          if (daemonAction === 'start') {
            sendJson(res, 200, { ok: true, daemon: await manager.start() })
            return
          }
          if (daemonAction === 'stop') {
            sendJson(res, 200, { ok: true, daemon: await manager.stop() })
            return
          }
          if (daemonAction === 'restart') {
            sendJson(res, 200, { ok: true, daemon: await manager.restart() })
            return
          }
        }

        // ── GET /api/manage-api/dsh-model ────────────────────────────
        // 面板「模型接入」卡片：读 DSH 侧现状（默认模型 + provider 已登记模型）。
        if (sub === 'dsh-model' && method === 'GET') {
          sendJson(res, 200, {
            ok: true,
            at: new Date().toISOString(),
            dsh: typeof dshModel === 'function' ? dshModel() : null,
          })
          return
        }

        // ── POST /api/manage-api/dsh-model { model } ─────────────────
        // 把选中的模型接进 DSH：追加到 provider.models（幂等）+ 设为默认模型。
        if (sub === 'dsh-model' && method === 'POST') {
          let payload
          try {
            payload = await readJsonBody(req)
          } catch (err) {
            sendJson(res, 400, { ok: false, error: `请求体无法解析：${String(err && err.message ? err.message : err)}` })
            return
          }
          const picked = payload && typeof payload.model === 'string' ? payload.model.trim() : ''
          if (!picked) {
            sendJson(res, 400, { ok: false, error: '缺少 model' })
            return
          }
          if (typeof dshModelConfigure !== 'function') {
            sendJson(res, 503, { ok: false, error: '插件未就绪：DSH 模型接入不可用' })
            return
          }
          const wantEnabled = !(payload && payload.enabled === false)
          const result = await dshModelConfigure(picked, { enabled: wantEnabled })
          sendJson(res, result && result.ok ? 200 : 400, result)
          return
        }

        // ── GET /api/manage-api/dsh-catalog ──────────────────────────
        // 诊断用：宿主 llm 注册表里真实可选的 provider × 模型。
        // 会话输入框下方的模型选择器就是按这个结构渲染的；模型数为 0 的 provider 会被整组过滤掉。
        if (sub === 'dsh-catalog' && method === 'GET') {
          const catalog = typeof dshModelCatalog === 'function' ? await dshModelCatalog() : { ok: false, error: '插件未就绪' }
          sendJson(res, catalog && catalog.ok ? 200 : 503, { ok: Boolean(catalog && catalog.ok), at: new Date().toISOString(), catalog })
          return
        }

        // ── POST /api/manage-api/write ───────────────────────────────
        // 白名单写代理：`{ method, path, payload }` → daemon 的写接口。
        // 面板上的「加站点 / 加 Key / 同步模型 / 删站点」都走这一条，客户端不直连 4319。
        if (sub === 'write' && method === 'POST') {
          if (!wantsJson(req)) {
            sendJson(res, 415, { ok: false, error: '写操作必须用 application/json' })
            return
          }
          let op
          try {
            op = await readJsonBody(req)
          } catch (err) {
            sendJson(res, 400, { ok: false, error: `请求体无法解析：${String(err && err.message ? err.message : err)}` })
            return
          }
          const result = await runWrite({
            port: config.port,
            method: op && op.method,
            path: op && op.path,
            payload: op && op.payload,
            log,
          })
          sendJson(res, result.ok ? 200 : result.status || 500, result)
          return
        }

        sendJson(res, 404, { ok: false, error: `未知路由：${method} ${PREFIX}/${sub}` })
      }),
    }),
  )

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}

export { PREFIX as ROUTE_PREFIX }
