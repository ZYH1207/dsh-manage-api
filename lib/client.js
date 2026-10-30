// dsh-manage-api — Client 半边（手写 bundle，无构建步骤）。
//
// ## 为什么手写这个包裹
//
// 宿主契约要求 client 产物自己调用 `window.__ModuleLoader__.load({id, factory})`。
// 直接给 ESM 源码会被当经典脚本执行 → SyntaxError → client-modules 加载失败。
// 本文件不依赖任何打包器：`require` 是宿主的模块解析器，`react` 由宿主提供。
// （先例：dsh-notify-say 也是手写这一层。）
//
// ## 运行环境
//
// client 跑在沙箱渲染进程：sandbox:true / contextIsolation:true / nodeIntegration:false
// → 没有 process、读不了盘。所有数据都走 host 的 /api/manage-api/* route。
// 每一处 fetch 都必须 try/catch：任何一环失败只应"少一块内容"，绝不能让整页崩。
//
// ## 主入口
//
// 设置页常驻分区 `settings.section`（id: manage-api）。不依赖 dsh-better-sidebar。
window.__ModuleLoader__.load({
  id: 'dsh-manage-api',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react') || null
    var name = 'dsh-manage-api'
    // slots 是硬依赖：写在 inject 里，宿主会等它就绪再激活本插件，
    // 避免"激活早于 renderer 提供 slots → 设置分区永久不出现"的竞态。
    var inject = ['slots']

    // 必须与 lib/routes.js 的 PREFIX='"/api/manage-api"' 保持一致（check.mjs 有一致性断言）
    var API_PREFIX = 'manage-api'

    // ── 工具：URL / 请求 ───────────────────────────────────────────────
    //
    // ⚠️ 用 document.baseURI 解析，不写死 origin-absolute 的 `/api/...`：
    //    反向代理挂在子路径下时绝对路径会 404（本机已有先例）。
    function apiUrl(path) {
      try {
        return new URL('api/' + API_PREFIX + '/' + path, document.baseURI).toString()
      } catch (e) {
        return '/api/' + API_PREFIX + '/' + path
      }
    }

    function fetchJson(path, init) {
      var opts = { credentials: 'same-origin', headers: { accept: 'application/json' } }
      if (init) {
        for (var k in init) opts[k] = init[k]
      }
      if (opts.method && opts.method !== 'GET') {
        opts.headers = { 'content-type': 'application/json', accept: 'application/json' }
        opts.body = JSON.stringify(opts.body || {})
      }
      return fetch(apiUrl(path), opts).then(function (res) {
        return res.text().then(function (text) {
          var body = null
          try {
            body = text ? JSON.parse(text) : null
          } catch (e) {
            body = null
          }
          return {
            ok: res.ok,
            status: res.status,
            body: body,
            text: body === null ? String(text || '').slice(0, 120) : '',
          }
        })
      })
    }

    // ── 工具：格式化 ───────────────────────────────────────────────────
    function fmtInt(n) {
      if (typeof n !== 'number' || !isFinite(n)) return '-'
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
      return String(Math.round(n))
    }
    function fmtMoney(n) {
      if (typeof n !== 'number' || !isFinite(n)) return '-'
      if (n >= 100) return n.toFixed(0)
      if (n >= 1) return n.toFixed(2)
      return n.toFixed(3)
    }
    function fmtPct(n) {
      if (typeof n !== 'number' || !isFinite(n)) return '-'
      return (n >= 0 ? '+' : '') + n.toFixed(0) + '%'
    }
    function fmtRate(n) {
      if (typeof n !== 'number' || !isFinite(n)) return '-'
      return Math.round(n * 100) + '%'
    }
    function fmtMs(n) {
      if (typeof n !== 'number' || !isFinite(n)) return '-'
      if (n >= 1000) return (n / 1000).toFixed(1) + 's'
      return Math.round(n) + 'ms'
    }
    function fmtTime(iso) {
      if (!iso) return '-'
      try {
        var d = new Date(iso)
        if (isNaN(d.getTime())) return String(iso)
        return d.toLocaleTimeString()
      } catch (e) {
        return String(iso)
      }
    }

    var MODE_TEXT = {
      owned: '托管中（插件启动）',
      attached: '已连接（外部实例）',
      starting: '启动中…',
      down: '未运行',
      failed: '启动失败',
    }

    // ── 样式（跟着主题 token 走；token 缺失时用中性回退色）──────────────
    var S = {
      alert: {
        border: '1px solid #6e4b0e', background: 'rgba(210,153,34,0.10)',
        borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px',
      },
      alertLine: { fontSize: '12px', lineHeight: 1.5 },
      pre: {
        margin: '6px 0 0', padding: '10px', borderRadius: '6px',
        background: 'var(--dsw-alias-surface-alt, rgba(128,128,128,0.10))',
        fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', maxHeight: '180px', overflow: 'auto',
      },
      wrap: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' },
      // 主面板（中央功能区）专用：宽屏、可滚动、标题栏右侧留刷新按钮位
      page: {
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        boxSizing: 'border-box',
        padding: '18px 22px 32px',
        overflowY: 'auto',
      },
      pageInner: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        maxWidth: '1180px',
        margin: '0 auto',
      },
      pageHead: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      pageTitle: { fontSize: '17px', fontWeight: 600 },
      pageSub: { fontSize: '12px', color: 'var(--dsw-alias-text-secondary, #8b949e)' },
      pageSpacer: { flex: 1 },
      pageBtn: {
        fontSize: '12px',
        padding: '4px 12px',
        borderRadius: '7px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
        background: 'var(--dsw-alias-bg-elevated, rgba(127,127,127,0.14))',
        color: 'inherit',
      },
      head: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' },
      title: { fontSize: '15px', fontWeight: 600 },
      sub: { fontSize: '12px', color: 'var(--dsw-alias-text-secondary, #8b949e)' },
      card: {
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      },
      pill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        padding: '2px 8px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
      },
      dot: { width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        padding: '1px 7px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
        color: 'var(--dsw-alias-text-secondary, #8b949e)',
        fontVariantNumeric: 'tabular-nums',
      },
      tabs: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
      tab: {
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '7px',
        border: '1px solid transparent',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--dsw-alias-text-secondary, #8b949e)',
      },
      tabActive: {
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '7px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
        background: 'var(--dsw-alias-bg-elevated, rgba(127,127,127,0.14))',
        color: 'var(--dsw-alias-text-primary, inherit)',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' },
      metric: { display: 'flex', flexDirection: 'column', gap: '2px' },
      metricLabel: { fontSize: '11px', color: 'var(--dsw-alias-text-secondary, #8b949e)' },
      metricValue: { fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      row: { display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'baseline', flexWrap: 'wrap' },
      kv: { color: 'var(--dsw-alias-text-secondary, #8b949e)', minWidth: '86px' },
      btn: {
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '7px',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      err: { fontSize: '12px', color: 'var(--dsw-alias-text-danger, #f85149)' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
      th: {
        textAlign: 'left',
        fontWeight: 500,
        color: 'var(--dsw-alias-text-secondary, #8b949e)',
        padding: '4px 6px',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.28))',
      },
      td: { padding: '4px 6px', borderBottom: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.14))', fontVariantNumeric: 'tabular-nums' },

      // ── 表单 / 按钮（P3.1 写操作面板用）──────────────────────────────
      form: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' },
      formRow: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' },
      field: { display: 'flex', flexDirection: 'column', gap: '4px' },
      fieldLabel: { fontSize: '12px', color: 'var(--dsw-alias-text-secondary, #8b949e)' },
      input: {
        fontSize: '13px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.32))',
        background: 'var(--dsw-alias-bg-primary, transparent)',
        color: 'var(--dsw-alias-text-primary, inherit)',
        outline: 'none',
      },
      btn: {
        fontSize: '12px',
        padding: '4px 10px',
        marginRight: '6px',
        borderRadius: '6px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.32))',
        background: 'var(--dsw-alias-bg-primary, transparent)',
        color: 'var(--dsw-alias-text-primary, inherit)',
      },
      btnPrimary: {
        fontSize: '12px',
        padding: '4px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.32))',
        background: 'var(--dsw-alias-brand-primary, #2f81f7)',
        color: '#fff',
      },
      btnDanger: {
        fontSize: '12px',
        padding: '4px 10px',
        borderRadius: '6px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border, rgba(127,127,127,0.32))',
        background: 'transparent',
        color: 'var(--dsw-alias-text-danger, #f85149)',
      },
      okLine: { fontSize: '12px', color: 'var(--dsw-alias-text-success, #3fb950)' },
    }

    function dotColor(mode) {
      if (mode === 'owned') return '#3fb950'
      if (mode === 'attached') return '#58a6ff'
      if (mode === 'starting') return '#d29922'
      return '#f85149'
    }

    // ── 数据 hook ─────────────────────────────────────────────────────
    function useManageApi(pollMs) {
      var healthState = React.useState(null)
      var health = healthState[0]
      var setHealth = healthState[1]
      var stateState = React.useState(null)
      var state = stateState[0]
      var setState = stateState[1]
      var errState = React.useState('')
      var error = errState[0]
      var setError = errState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]

      var load = React.useCallback(function () {
        return Promise.all([
          fetchJson('health').catch(function (e) { return { ok: false, body: { error: String(e) } } }),
          fetchJson('state').catch(function (e) { return { ok: false, body: { error: String(e) } } }),
        ]).then(function (results) {
          var h = results[0]
          var s = results[1]
          if (h && h.body) setHealth(h.body)
          if (s && s.body) {
            if (s.body.ok) { setState(s.body); setError('') } else { setState(s.body); setError(s.body.error || '') }
          } else if (s && s.body === null) {
            setError('宿主路由返回了非 JSON 响应（HTTP ' + s.status + '）'
              + (s.text ? '：' + s.text.replace(/\s+/g, ' ').trim() : ''))
          }
        })
      }, [])

      React.useEffect(function () {
        var alive = true
        var tick = function () { if (alive) load() }
        tick()
        var timer = setInterval(tick, pollMs || 15000)
        return function () { alive = false; clearInterval(timer) }
      }, [load, pollMs])

      var restart = React.useCallback(function (action) {
        setBusy(true)
        return fetchJson('daemon/' + action, { method: 'POST', body: {} })
          .then(function () { return load() })
          .catch(function (e) { setError(String(e)) })
          .then(function () { setBusy(false) })
      }, [load])

      return {
        health: health, state: state, error: error, busy: busy,
        reload: load, restart: restart,
      }
    }

    function nothingYet(text) {
      return React.createElement('div', { style: S.sub }, text || '数据加载中…')
    }

    // ── 各子页 ───────────────────────────────────────────────────────
    function OverviewTab(props) {
      var health = props.health
      var envelope = props.state
      var db = envelope && envelope.state ? envelope.state : null
      var daemon = health && health.daemon ? health.daemon : {}
      var summary = db && db.summary ? db.summary : null
      var headline = db && db.headline ? db.headline : null
      var usageTotals = db && db.usage && db.usage.totals ? db.usage.totals : null
      var siteRanking = db && Array.isArray(db.siteRanking) ? db.siteRanking.slice(0, 5) : []

      var ingestInfo = health && health.ingest ? health.ingest : null
      var toolInfo = health && health.tools ? health.tools : null
      var commandInfo = health && health.commands ? health.commands : null
      var promptInfo = health && health.prompt ? health.prompt : null
      var budgetInfo = health && health.budget ? health.budget : null
      var alerts = []
      if (daemon.mode === 'failed' || daemon.mode === 'down') {
        alerts.push({ level: 'error', text: 'ManageAPI daemon 未运行：' + (daemon.lastError || '可在本页点「重启 daemon」') })
      } else if (health && health.probe && health.probe.ok === false) {
        alerts.push({ level: 'error', text: 'daemon 进程在但没有响应：' + String(health.probe.error || '') })
      }
      if (budgetInfo && budgetInfo.over) {
        alerts.push({ level: 'warn', text: '预算已超限，工具调用已被熔断：' + String(budgetInfo.reason || '') })
      }
      if (ingestInfo && ingestInfo.failed > 0) {
        alerts.push({ level: 'warn', text: '用量回写有 ' + ingestInfo.failed + ' 次失败（daemon 版本可能早于 /api/ingest/usage）' })
      }

      var metrics = [
        { label: '站点', value: summary ? fmtInt(summary.providerCount) : '-' },
        { label: '可用供给', value: summary ? fmtInt(summary.offerCount) : '-' },
        { label: '可比价模型', value: summary ? fmtInt(summary.comparableCount) : '-' },
        { label: '模型总数', value: summary ? fmtInt(summary.modelCount) : '-' },
        { label: '平均价差', value: summary ? (typeof summary.avgSpreadPct === 'number' ? summary.avgSpreadPct.toFixed(0) + '%' : '-') : '-' },
        { label: '探针累计', value: db ? fmtInt(db.probeTotal) : '-' },
      ]

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        alerts.length
          ? React.createElement('div', { style: S.alert },
            alerts.map(function (a, i) {
              return React.createElement('div', {
                key: i,
                style: Object.assign({}, S.alertLine, { color: a.level === 'error' ? '#f85149' : '#d29922' }),
              }, (a.level === 'error' ? '⛔ ' : '⚠️ ') + a.text)
            }))
          : null,
        React.createElement(
          'div',
          { style: S.card },
          React.createElement(
            'div',
            { style: S.head },
            React.createElement('span', {
              style: Object.assign({}, S.pill),
            },
              React.createElement('span', { style: Object.assign({}, S.dot, { background: dotColor(daemon.mode) }) }),
              MODE_TEXT[daemon.mode] || String(daemon.mode || '未知'),
            ),
            React.createElement('span', { style: S.sub }, daemon.mode === 'attached'
              ? '外部 daemon 在跑，插件只读不写'
              : daemon.mode === 'owned' ? '由插件托管，DSH 退出时会一起停' : ''),
            React.createElement('span', { style: { flex: 1 } }),
            React.createElement('button', {
              style: S.btn,
              disabled: props.busy,
              onClick: function () { props.restart('restart') },
            }, props.busy ? '重启中…' : '重启 daemon'),
            React.createElement('button', {
              style: S.btn, onClick: props.onReload,
            }, '刷新'),
          ),
          React.createElement(
            'div',
            { style: S.row },
            React.createElement('span', { style: S.kv }, '端口'),
            React.createElement('span', null, String(daemon.port || '-')),
            React.createElement('span', { style: S.kv }, 'PID'),
            React.createElement('span', null, daemon.pid ? String(daemon.pid) : '-'),
            React.createElement('span', { style: S.kv }, '数据源'),
            React.createElement('span', null, envelope && envelope.source
              ? (envelope.source === 'daemon' ? 'daemon（实时）' : 'db.json（只读降级）')
              : '-'),
            React.createElement('span', { style: S.kv }, '运行时'),
            React.createElement('span', null, daemon.runtimeSource || '-'),
            React.createElement('span', { style: S.kv }, '检查于'),
            React.createElement('span', null, fmtTime(health && health.checkedAt)),
          ),
          daemon.lastError
            ? React.createElement('div', { style: S.err }, String(daemon.lastError))
            : null,
        ),
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '概览'),
          React.createElement('div', { style: S.grid }, metrics.map(function (m) {
            return React.createElement('div', { key: m.label, style: S.metric },
              React.createElement('span', { style: S.metricLabel }, m.label),
              React.createElement('span', { style: S.metricValue }, m.value))
          })),
          headline && headline.text
            ? React.createElement('div', { style: Object.assign({}, S.sub, { lineHeight: 1.5 }) }, String(headline.text))
            : null,
        ),
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '今日用量'),
          usageTotals
            ? React.createElement('div', { style: S.grid }, [
              { label: '请求', value: fmtInt(usageTotals.requests) },
              { label: '输入 token', value: fmtInt(usageTotals.input) },
              { label: '输出 token', value: fmtInt(usageTotals.output) },
              { label: '缓存命中', value: fmtInt(usageTotals.cached) },
              { label: '错误', value: fmtInt(usageTotals.errors) },
              { label: '平均延迟', value: fmtMs(usageTotals.avgLatencyMs) },
            ].map(function (m) {
              return React.createElement('div', { key: m.label, style: S.metric },
                React.createElement('span', { style: S.metricLabel }, m.label),
                React.createElement('span', { style: S.metricValue }, m.value))
            }))
            : nothingYet('还没有用量数据'),
        ),
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '运行时能力（Phase 2）'),
          React.createElement('div', { style: S.row },
            React.createElement('span', { style: S.kv }, '用量回写'),
            React.createElement('span', null, ingestInfo
              ? ('已回写 ' + fmtInt(ingestInfo.pushed) + ' · 跳过 ' + fmtInt(ingestInfo.skipped) + ' · 失败 ' + fmtInt(ingestInfo.failed))
              : '不可用'),
            React.createElement('span', { style: S.kv }, '工具'),
            React.createElement('span', null, toolInfo && toolInfo.names && toolInfo.names.length
              ? toolInfo.names.join(' / ')
              : '未注册'),
            React.createElement('span', { style: S.kv }, '命令'),
            React.createElement('span', null, commandInfo && commandInfo.registered ? '/manage' : '未注册'),
            React.createElement('span', { style: S.kv }, '预算'),
            React.createElement('span', null, budgetInfo
              ? (budgetInfo.configured ? ('本会话 ' + fmtInt(budgetInfo.session && budgetInfo.session.tokens) + ' tok' +
                (budgetInfo.limits && budgetInfo.limits.sessionTokens ? ' / 上限 ' + fmtInt(budgetInfo.limits.sessionTokens) : '') +
                (budgetInfo.over ? ' · 已超限' : '')) : '未设置（不熔断）')
              : '-'),
          ),
          promptInfo
            ? React.createElement('div', { style: { marginTop: '10px' } },
              React.createElement('div', { style: S.metricLabel }, '注入到系统提示词的内容'),
              React.createElement('pre', { style: S.pre }, String(promptInfo.text || '（空）')))
            : null,
        ),
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '站点评分前 5'),
          siteRanking.length
            ? React.createElement('table', { style: S.table },
              React.createElement('thead', null, React.createElement('tr', null,
                React.createElement('th', { style: S.th }, '站点'),
                React.createElement('th', { style: S.th }, '评分'),
                React.createElement('th', { style: S.th }, '可用率'),
                React.createElement('th', { style: S.th }, 'TTFT'),
                React.createElement('th', { style: S.th }, '模型'),
                React.createElement('th', { style: S.th }, '探针'),
              )),
              React.createElement('tbody', null, siteRanking.map(function (row, index) {
                return React.createElement('tr', { key: row.providerId || index },
                  React.createElement('td', { style: S.td }, String(row.providerName || row.providerId || '-')),
                  React.createElement('td', { style: S.td }, typeof row.score === 'number' ? row.score.toFixed(0) : '-'),
                  React.createElement('td', { style: S.td }, typeof row.uptime === 'number' ? (row.uptime * 100).toFixed(1) + '%' : '-'),
                  React.createElement('td', { style: S.td }, fmtMs(row.avgTtft)),
                  React.createElement('td', { style: S.td }, fmtInt(row.modelCount)),
                  React.createElement('td', { style: S.td }, fmtInt(row.probes)),
                )
              })),
            )
            : nothingYet('还没有探针数据'),
        ),
      )
    }

    function PricesTab(props) {
      var envelope = props.state
      var db = envelope && envelope.state ? envelope.state : null
      var ranked = db && Array.isArray(db.ranked) ? db.ranked : []
      if (!ranked.length) return nothingYet('还没有比价数据')

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        ranked.slice(0, 12).map(function (model) {
          var rows = Array.isArray(model.rows) ? model.rows.slice(0, 5) : []
          return React.createElement(
            'div',
            { key: model.modelKey, style: S.card },
            React.createElement(
              'div',
              { style: S.head },
              React.createElement('span', { style: S.title }, String(model.modelKey)),
              React.createElement('span', { style: S.sub }, rows.length + ' 条供给'),
              React.createElement('span', { style: S.sub }, '价差 ' + fmtPct(model.spreadPct)),
            ),
            React.createElement('table', { style: S.table },
              React.createElement('thead', null, React.createElement('tr', null,
                React.createElement('th', { style: S.th }, '站点 / 分组'),
                React.createElement('th', { style: S.th }, '¥/Mtok'),
                React.createElement('th', { style: S.th }, 'TTFT'),
                React.createElement('th', { style: S.th }, '延迟'),
                React.createElement('th', { style: S.th }, '缓存率'),
              )),
              React.createElement('tbody', null, rows.map(function (row) {
                return React.createElement('tr', { key: row.offerId },
                  React.createElement('td', { style: S.td },
                    (row.group ? String(row.group) : String(row.upstreamName || row.offerId))
                    + (row.isCheapest ? ' ★' : '')),
                  React.createElement('td', { style: S.td }, typeof row.blendedCnyPerMtok === 'number' ? row.blendedCnyPerMtok.toFixed(2) : '-'),
                  React.createElement('td', { style: S.td }, fmtMs(row.ttftMs)),
                  React.createElement('td', { style: S.td }, fmtMs(row.avgLatencyMs)),
                  React.createElement('td', { style: S.td }, typeof row.cacheHitRate === 'number' ? (row.cacheHitRate * 100).toFixed(0) + '%' : '-'),
                )
              })),
            ),
          )
        }),
      )
    }

    function UsageTab(props) {
      var envelope = props.state
      var db = envelope && envelope.state ? envelope.state : null
      var usage = db && db.usage ? db.usage : null
      if (!usage) return nothingYet('还没有用量数据')

      var byProvider = Array.isArray(usage.byProvider) ? usage.byProvider.slice(0, 12) : []
      var totals = usage.totals || {}

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '总计'),
          React.createElement('div', { style: S.grid }, [
            { label: '请求', value: fmtInt(totals.requests) },
            { label: '错误', value: fmtInt(totals.errors) },
            { label: '输入 token', value: fmtInt(totals.input) },
            { label: '输出 token', value: fmtInt(totals.output) },
            { label: '缓存 token', value: fmtInt(totals.cached) },
            { label: '平均 TTFT', value: fmtMs(totals.avgTtftMs) },
          ].map(function (m) {
            return React.createElement('div', { key: m.label, style: S.metric },
              React.createElement('span', { style: S.metricLabel }, m.label),
              React.createElement('span', { style: S.metricValue }, m.value))
          })),
        ),
        React.createElement(
          'div',
          { style: S.card },
          React.createElement('div', { style: S.metricLabel }, '按站点'),
          byProvider.length
            ? React.createElement('table', { style: S.table },
              React.createElement('thead', null, React.createElement('tr', null,
                React.createElement('th', { style: S.th }, '站点'),
                React.createElement('th', { style: S.th }, '请求'),
                React.createElement('th', { style: S.th }, '输入'),
                React.createElement('th', { style: S.th }, '输出'),
              )),
              React.createElement('tbody', null, byProvider.map(function (row, index) {
                var label = row.providerName || row.provider || row.name || row.providerId || ('#' + index)
                return React.createElement('tr', { key: String(label) + index },
                  React.createElement('td', { style: S.td }, String(label)),
                  React.createElement('td', { style: S.td }, fmtInt(row.requests || row.count)),
                  React.createElement('td', { style: S.td }, fmtInt(row.input)),
                  React.createElement('td', { style: S.td }, fmtInt(row.output)),
                )
              })),
            )
            : nothingYet('还没有按站点统计'),
        ),
      )
    }

    function PlaceholderTab(props) {
      return React.createElement(
        'div',
        { style: S.card },
        React.createElement('div', { style: S.metricLabel }, props.title),
        React.createElement('div', { style: S.sub }, props.hint || '这一页在 Phase 1/2 补齐。'),
      )
    }

    // ── 决策子页：路由记录（谁被选中、试了几次、失败在哪）────────────────
    function buildProviderMap(state) {
      var map = {}
      var list = (state && state.providers) || []
      for (var i = 0; i < list.length; i += 1) {
        var p = list[i]
        if (p && p.id) map[p.id] = p.name || p.id
      }
      return map
    }

    function outcomeText(outcome) {
      if (outcome === 'ok') return '成功'
      if (outcome === 'failed') return '失败'
      return outcome || '—'
    }

    function outcomeColor(outcome) {
      if (outcome === 'ok') return '#3fb950'
      if (outcome === 'failed') return '#f85149'
      return 'var(--dsw-alias-text-secondary, #8b949e)'
    }

    function firstFailureText(row) {
      var failures = row && row.failures
      if (!failures || !failures.length) return ''
      var first = failures[0] || {}
      var parts = []
      if (first.providerName) parts.push(first.providerName)
      if (first.error) parts.push(String(first.error).slice(0, 40))
      var text = parts.join('：')
      if (failures.length > 1) text += ` 等 ${failures.length} 次`
      return text
    }

    function DecisionsTab(props) {
      // props.state 是宿主信封 { ok, source, at, state: <daemon 快照> }，先解出快照
      var state = (props.state && props.state.state) || {}
      var routing = state.routing || []
      if (!routing.length) return nothingYet('还没有路由记录——发起一次对话后这里会按请求列出选站过程。')

      var providerMap = buildProviderMap(state)
      var counts = { ok: 0, failed: 0 }
      for (var i = 0; i < routing.length; i += 1) {
        var outcome = routing[i] && routing[i].outcome
        if (outcome === 'ok') counts.ok += 1
        else if (outcome === 'failed') counts.failed += 1
      }
      var rows = routing.slice().reverse().slice(0, 20)

      return React.createElement(
        'div',
        { style: S.card },
        React.createElement('div', { style: S.metricLabel }, '路由决策（最近 20 条）'),
        React.createElement(
          'div',
          { style: S.row },
          React.createElement('span', { style: S.sub }, `成功 ${counts.ok} · 失败 ${counts.failed} · 共 ${routing.length} 条`),
          React.createElement('span', { style: S.sub }, '换站次数 = 尝试次数 − 1'),
        ),
        React.createElement(
          'table',
          { style: S.table },
          React.createElement('thead', null, React.createElement('tr', null,
            React.createElement('th', { style: S.th }, '时间'),
            React.createElement('th', { style: S.th }, '模型'),
            React.createElement('th', { style: S.th }, '选中站点'),
            React.createElement('th', { style: S.th }, '尝试'),
            React.createElement('th', { style: S.th }, '结果'),
            React.createElement('th', { style: S.th }, 'TTFT'),
            React.createElement('th', { style: S.th }, '总耗时'),
            React.createElement('th', { style: S.th }, '失败摘要'),
          )),
          React.createElement('tbody', null, rows.map(function (row, index) {
            var station = row.chosenProviderName || providerMap[row.chosenProviderId] || '—'
            var failures = firstFailureText(row)
            return React.createElement('tr', { key: String(row.id || index) },
              React.createElement('td', { style: S.td }, fmtTime(row.ts)),
              React.createElement('td', { style: S.td }, String(row.model || '—')),
              React.createElement('td', { style: S.td }, String(station)),
              React.createElement('td', { style: S.td }, String(row.attempts == null ? '—' : row.attempts)),
              React.createElement('td', { style: Object.assign({}, S.td, { color: outcomeColor(row.outcome) }) }, outcomeText(row.outcome)),
              React.createElement('td', { style: S.td }, fmtMs(row.ttftMs)),
              React.createElement('td', { style: S.td }, fmtMs(row.latencyMs)),
              React.createElement('td', { style: S.td }, failures || '—'),
            )
          })),
        ),
        React.createElement('div', { style: S.sub }, '候选与评分细节在「探针」子页；这里只看「为什么这次选它/为什么换了站」。'),
      )
    }

    // ── 探针子页：每个供给的探针证据（可用率/质量/完整性/缓存/新鲜度）────
    function ProbesTab(props) {
      // 同上：props.state 是宿主信封，探针数据在 envelope.state 里
      var state = (props.state && props.state.state) || {}
      var scores = state.scores || {}
      var offers = state.offers || []
      var providerMap = buildProviderMap(state)
      var byOfferId = {}
      for (var i = 0; i < offers.length; i += 1) {
        var offer = offers[i]
        if (offer && offer.id) byOfferId[offer.id] = offer
      }
      var entries = Object.keys(scores).map(function (offerId) {
        var score = scores[offerId] || {}
        var offer = byOfferId[offerId] || {}
        var providerName = providerMap[offer.providerId] || offer.providerId || '—'
        return { offerId: offerId, score: score, providerName: providerName, model: offer.upstreamName || offer.modelKey || '—' }
      })
      if (!entries.length) return nothingYet('还没有探针数据——到 ManageAPI 网页或 daemon 触发一次探针后这里会有证据表。')

      entries.sort(function (a, b) {
        var qa = typeof a.score.quality === 'number' ? a.score.quality : -1
        var qb = typeof b.score.quality === 'number' ? b.score.quality : -1
        return qb - qa
      })
      var shown = entries.slice(0, 25)

      return React.createElement(
        'div',
        { style: S.card },
        React.createElement('div', { style: S.metricLabel }, '探针证据（按质量排序，前 25 条）'),
        React.createElement('div', { style: S.sub }, `共 ${entries.length} 个供给有探针记录 · 历史探针总数 ${fmtInt((state && state.probeTotal) || 0)}`),
        React.createElement(
          'table',
          { style: S.table },
          React.createElement('thead', null, React.createElement('tr', null,
            React.createElement('th', { style: S.th }, '站点'),
            React.createElement('th', { style: S.th }, '上游模型'),
            React.createElement('th', { style: S.th }, '可用率'),
            React.createElement('th', { style: S.th }, '质量'),
            React.createElement('th', { style: S.th }, '完整性'),
            React.createElement('th', { style: S.th }, 'TTFT'),
            React.createElement('th', { style: S.th }, '缓存命中'),
            React.createElement('th', { style: S.th }, '样本'),
            React.createElement('th', { style: S.th }, '证据年龄'),
            React.createElement('th', { style: S.th }, '置信度'),
          )),
          React.createElement('tbody', null, shown.map(function (entry) {
            var score = entry.score
            var title = score.lastError ? String(score.lastError) : ''
            var staleSuffix = score.stale ? '（stale）' : ''
            return React.createElement('tr', { key: entry.offerId, title: title || undefined },
              React.createElement('td', { style: S.td }, entry.providerName),
              React.createElement('td', { style: S.td }, entry.model),
              React.createElement('td', { style: S.td }, fmtRate(score.availability)),
              React.createElement('td', { style: S.td }, fmtRate(score.quality)),
              React.createElement('td', { style: S.td }, fmtRate(score.integrity)),
              React.createElement('td', { style: S.td }, fmtMs(score.ttftMs)),
              React.createElement('td', { style: S.td }, fmtRate(score.cacheHitRate)),
              React.createElement('td', { style: S.td }, fmtInt(score.samples)),
              React.createElement('td', { style: S.td }, (typeof score.evidenceAgeMs === 'number' ? fmtMs(score.evidenceAgeMs) : '—') + staleSuffix),
              React.createElement('td', { style: S.td }, String(score.confidence || '—')),
            )
          })),
        ),
        React.createElement('div', { style: S.sub }, '「质量」综合了指纹/截断/计费三类一致性；悬停某行可看最近错误。'),
      )
    }

    // ── 会话成本 chip（conversation.chat.assistant-actions）──────────────
    var sessionStatsCache = { sessionId: '', at: 0, data: null, pending: null }

    function fetchSessionStats(sessionId) {
      var now = Date.now()
      if (sessionStatsCache.sessionId === sessionId) {
        if (sessionStatsCache.data && now - sessionStatsCache.at < 15000) return Promise.resolve(sessionStatsCache.data)
        if (sessionStatsCache.pending) return sessionStatsCache.pending
      }
      var pending = fetchJson('stream-stats?session=' + encodeURIComponent(sessionId))
        .then(function (result) {
          var stats = result && result.body && result.body.stats ? result.body.stats : null
          var data = { ok: !!(result && result.ok), stats: stats }
          sessionStatsCache = { sessionId: sessionId, at: Date.now(), data: data, pending: null }
          return data
        })
        .catch(function (e) {
          var data = { ok: false, error: String(e) }
          sessionStatsCache = { sessionId: sessionId, at: Date.now(), data: data, pending: null }
          return data
        })
      sessionStatsCache = { sessionId: sessionId, at: sessionStatsCache.at, data: sessionStatsCache.data, pending: pending }
      return pending
    }

    function CostChip(props) {
      if (!React) return null
      var sessionId = props && props.sessionId ? String(props.sessionId) : ''
      var tuple = React.useState(null)
      var state = tuple[0]
      var setState = tuple[1]
      React.useEffect(function () {
        if (!sessionId) return undefined
        var alive = true
        fetchSessionStats(sessionId).then(function (value) {
          if (alive) setState(value)
        })
        return function () { alive = false }
      }, [sessionId])

      var stats = state && state.stats
      if (!stats || !stats.calls) return null
      var title = '本会话经 ManageAPI 路由累计：' + stats.calls + ' 次调用 · ' + fmtInt(stats.tokens) + ' tokens'
        + (stats.model ? ' · 最近模型 ' + stats.model : '')
      return React.createElement('span', { style: S.chip, title: title },
        '⇄ ' + fmtInt(stats.tokens) + ' tok / ' + stats.calls + ' 次')
    }

    // ── 写操作：一律经 host 白名单代理（客户端不直连 4319）─────────────
    //
    // 请求体是 `{ method, path, payload }`，由 lib/write-proxy.js 按白名单转发。
    // 返回里只有小字段（summary），写完由调用方触发 reload 拉最新 state。
    function writeOp(method, path, payload) {
      return fetchJson('write', {
        method: 'POST',
        body: { method: method, path: path, payload: payload || {} },
      }).then(function (res) {
        var body = (res && res.body) || {}
        var failed = !res.ok || body.ok === false
        return {
          ok: !failed,
          status: res.status,
          error: failed ? String(body.error || res.text || '请求失败') : '',
          summary: body.summary || null,
          action: body.action || '',
        }
      })
    }

    function providerNameMap(db) {
      var map = {}
      var list = db && Array.isArray(db.providers) ? db.providers : []
      list.forEach(function (p) {
        if (p && p.id) map[p.id] = p.name || p.id
      })
      return map
    }

    var KIND_LABEL = { 'new-api': 'NewAPI', 'one-api': 'OneAPI', sub2api: 'Sub2API' }
    function kindLabel(kind) {
      var key = String(kind || '').toLowerCase()
      if (!key || key === 'unknown') return '未识别'
      return KIND_LABEL[key] || key
    }

    // ── 子页：站点（列表 + 添加向导 + 同步/查余额/删除）────────────────
    function SitesTab(props) {
      var envelope = props.state
      var db = envelope && envelope.state ? envelope.state : null
      var providers = db && Array.isArray(db.providers) ? db.providers : []
      var credentials = db && Array.isArray(db.credentials) ? db.credentials : []
      var offers = db && Array.isArray(db.offers) ? db.offers : []
      var onReload = props.onReload

      // 每站几把 Key / 几个模型（state 里没有现成计数，这里按 providerId 数一遍）
      var keyCount = {}
      credentials.forEach(function (c) {
        var pid = c && c.providerId
        if (pid) keyCount[pid] = (keyCount[pid] || 0) + 1
      })
      var modelCount = {}
      offers.forEach(function (o) {
        var pid = o && o.providerId
        if (pid) modelCount[pid] = (modelCount[pid] || 0) + 1
      })

      var wizard = React.useState(false)
      var running = React.useState('')
      var note = React.useState(null)
      var busy = !!running[0]

      function say(okFlag, text) {
        note[1]({ ok: okFlag, text: text })
      }

      function run(label, work) {
        running[1](label)
        note[1](null)
        Promise.resolve()
          .then(work)
          .then(function (text) {
            if (text) say(true, text)
            if (typeof onReload === 'function') onReload()
          })
          .catch(function (err) {
            say(false, String(err && err.message ? err.message : err))
          })
          .then(function () {
            running[1]('')
          })
      }

      function syncSite(provider) {
        run('同步 ' + provider.name, function () {
          return writeOp('POST', '/api/providers/' + provider.id + '/sync', {}).then(function (res) {
            if (!res.ok) throw new Error(res.error)
            var s = (res.summary && res.summary.sync) || {}
            return `「${provider.name}」同步完成：拉到 ${s.fetched || 0} 个模型，新增 ${s.added || 0}，下架 ${(s.removed || []).length}`
          })
        })
      }

      function balanceSite(provider) {
        run('查余额 ' + provider.name, function () {
          return writeOp('POST', '/api/providers/' + provider.id + '/balance', {}).then(function (res) {
            if (!res.ok) throw new Error(res.error)
            return `「${provider.name}」余额已刷新`
          })
        })
      }

      function removeSite(provider) {
        var ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`删除站点「${provider.name}」？该站下的 Key 与模型供给会一起消失。`)
          : true
        if (!ok) return
        run('删除 ' + provider.name, function () {
          return writeOp('DELETE', '/api/providers/' + provider.id, {}).then(function (res) {
            if (!res.ok) throw new Error(res.error)
            return `已删除「${provider.name}」`
          })
        })
      }

      var head = React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
        React.createElement('div', { style: S.metricLabel }, `站点 ${providers.length} 个 · Key ${credentials.length} 把`),
        React.createElement('span', { style: { flex: '1 1 auto' } }),
        React.createElement('button', {
          style: S.btnPrimary,
          disabled: busy,
          onClick: function () { wizard[1](true); note[1](null) },
        }, '＋ 添加站点'),
      )

      var noteNode = note[0]
        ? React.createElement('div', { style: note[0].ok ? S.okLine : S.err }, String(note[0].text))
        : null

      var wizardNode = wizard[0]
        ? React.createElement(SiteWizard, {
          busy: busy,
          onCancel: function () { wizard[1](false) },
          onSubmit: function (form) {
            run('添加 ' + form.name, function () {
              return writeOp('POST', '/api/providers', {
                name: form.name,
                baseUrl: form.baseUrl,
                siteUrl: form.siteUrl,
              }).then(function (created) {
                if (!created.ok) throw new Error(created.error)
                var provider = created.summary && created.summary.provider
                if (!provider || !provider.id) throw new Error('站点已建立，但没能拿到站点 id（请刷新后重试）')
                return writeOp('POST', '/api/credentials', {
                  providerId: provider.id,
                  label: form.label || '默认',
                  secret: form.secret,
                  group: form.group || '',
                }).then(function (cred) {
                  if (!cred.ok) throw new Error(`站点已建立，但 Key 保存失败：${cred.error}`)
                  return writeOp('POST', '/api/providers/' + provider.id + '/sync', {}).then(function (sync) {
                    var s = (sync.summary && sync.summary.sync) || {}
                    var tail = sync.ok
                      ? `「${form.name}」已添加：识别为 ${kindLabel(provider.kind)}，同步到 ${s.fetched || 0} 个模型`
                      : `「${form.name}」已添加，Key 已保存，但同步失败：${sync.error}`
                    wizard[1](false)
                    return tail
                  })
                })
              })
            })
          },
        })
        : null

      var table = providers.length
        ? React.createElement(
          'table',
          { style: S.table },
          React.createElement('thead', null, React.createElement('tr', null,
            ['站点', '系别', 'API 端点', 'Key', '模型', '操作'].map(function (label) {
              return React.createElement('th', { key: label, style: S.th }, label)
            }),
          )),
          React.createElement('tbody', null, providers.map(function (p) {
            return React.createElement('tr', { key: p.id },
              React.createElement('td', { style: S.td }, p.name || p.id),
              React.createElement('td', { style: S.td }, kindLabel(p.kind)),
              React.createElement('td', { style: Object.assign({}, S.td, { maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis' }) },
                p.baseUrl || (p.siteUrl ? '（仅网站地址）' : '—')),
              React.createElement('td', { style: S.td }, String(keyCount[p.id] || 0)),
              React.createElement('td', { style: S.td }, String(modelCount[p.id] || 0)),
              React.createElement('td', { style: S.td },
                React.createElement('button', { style: S.btn, disabled: busy, onClick: function () { syncSite(p) } }, '同步'),
                React.createElement('button', { style: S.btn, disabled: busy, onClick: function () { balanceSite(p) } }, '查余额'),
                React.createElement('button', { style: S.btnDanger, disabled: busy, onClick: function () { removeSite(p) } }, '删除'),
              ),
            )
          })),
        )
        : nothingYet('还没有站点。点右上角「＋ 添加站点」，填名称、API 端点和一把 Key 即可。')

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        head,
        noteNode,
        wizardNode,
        running[0] ? React.createElement('div', { style: S.sub }, running[0] + '…') : null,
        React.createElement('div', { style: S.card }, table),
      )
    }

    // 添加站点向导：名称/端点 → Key → 结果（两步输入 + 自动识别系别与同步模型）
    function SiteWizard(props) {
      var step = React.useState(1)
      var name = React.useState('')
      var baseUrl = React.useState('')
      var siteUrl = React.useState('')
      var secret = React.useState('')
      var group = React.useState('')
      var label = React.useState('默认')
      var error = React.useState('')

      function field(labelText, value, onChange, placeholder, type) {
        return React.createElement(
          'label',
          { style: S.field },
          React.createElement('span', { style: S.fieldLabel }, labelText),
          React.createElement('input', {
            style: S.input,
            type: type || 'text',
            value: value,
            placeholder: placeholder || '',
            onChange: function (event) { onChange(event && event.target ? event.target.value : '') },
          }),
        )
      }

      var content = null
      if (step[0] === 1) {
        content = React.createElement(
          'div',
          { style: S.form },
          field('站点名称 *', name[0], name[1], '例如：秋 / 凌风 / 我的中转'),
          field('API 端点', baseUrl[0], baseUrl[1], 'https://api.example.com/v1（多数站以 /v1 结尾）'),
          field('网站地址（可选）', siteUrl[0], siteUrl[1], 'https://console.example.com，用来「打开站点」'),
          error[0] ? React.createElement('div', { style: S.err }, error[0]) : null,
          React.createElement('div', { style: S.formRow },
            React.createElement('button', { style: S.btn, onClick: props.onCancel }, '取消'),
            React.createElement('button', {
              style: S.btnPrimary,
              onClick: function () {
                if (!String(name[0] || '').trim()) return error[1]('站点名称不能为空')
                if (!String(baseUrl[0] || '').trim() && !String(siteUrl[0] || '').trim()) {
                  return error[1]('网站地址和 API 端点至少要填一个')
                }
                error[1]('')
                step[1](2)
              },
            }, '下一步'),
          ),
        )
      } else {
        content = React.createElement(
          'div',
          { style: S.form },
          React.createElement('div', { style: S.sub }, `第 2 步：给「${name[0]}」加一把 Key（加密存在本机，界面只回显后四位）`),
          field('API Key *', secret[0], secret[1], 'sk-…', 'password'),
          field('Key 备注（可选）', label[0], label[1], '默认'),
          field('分组 / 套餐（可选）', group[0], group[1], '例如 default、vip，留空按站点的默认分组'),
          error[0] ? React.createElement('div', { style: S.err }, error[0]) : null,
          React.createElement('div', { style: S.formRow },
            React.createElement('button', { style: S.btn, onClick: function () { step[1](1) } }, '上一步'),
            React.createElement('button', {
              style: S.btnPrimary,
              disabled: !!props.busy,
              onClick: function () {
                if (!String(secret[0] || '').trim()) return error[1]('API Key 不能为空')
                error[1]('')
                props.onSubmit({
                  name: String(name[0] || '').trim(),
                  baseUrl: String(baseUrl[0] || '').trim(),
                  siteUrl: String(siteUrl[0] || '').trim(),
                  secret: String(secret[0] || '').trim(),
                  group: String(group[0] || '').trim(),
                  label: String(label[0] || '').trim() || '默认',
                })
              },
            }, props.busy ? '保存中…' : '保存并同步模型'),
          ),
        )
      }

      return React.createElement(
        'div',
        { style: S.card },
        React.createElement('div', { style: S.metricLabel }, `添加站点 · 第 ${step[0]} / 2 步`),
        content,
      )
    }

    // ── 子页：Keys（列出/新增/删除）───────────────────────────────────
    function KeysTab(props) {
      var envelope = props.state
      var db = envelope && envelope.state ? envelope.state : null
      var credentials = db && Array.isArray(db.credentials) ? db.credentials : []
      var names = providerNameMap(db)
      var onReload = props.onReload

      var running = React.useState('')
      var note = React.useState(null)
      var pid = React.useState('')
      var secret = React.useState('')
      var label = React.useState('默认')
      var group = React.useState('')
      var busy = !!running[0]

      var providerList = db && Array.isArray(db.providers) ? db.providers : []
      var options = providerList.map(function (p) {
        return React.createElement('option', { key: p.id, value: p.id }, p.name || p.id)
      })
      if (!pid[0] && providerList.length) pid[1](providerList[0].id)

      function say(okFlag, text) { note[1]({ ok: okFlag, text: text }) }

      function run(work) {
        running[1]('working')
        note[1](null)
        Promise.resolve()
          .then(work)
          .then(function (text) {
            if (text) say(true, text)
            if (typeof onReload === 'function') onReload()
          })
          .catch(function (err) { say(false, String(err && err.message ? err.message : err)) })
          .then(function () { running[1]('') })
      }

      var form = React.createElement(
        'div',
        { style: S.form },
        React.createElement('div', { style: S.metricLabel }, '新增 Key'),
        providerList.length
          ? React.createElement(
            'label',
            { style: S.field },
            React.createElement('span', { style: S.fieldLabel }, '站点'),
            React.createElement('select', {
              style: S.input,
              value: pid[0],
              onChange: function (event) { pid[1](event && event.target ? event.target.value : '') },
            }, options),
          )
          : React.createElement('div', { style: S.sub }, '先到「站点」页添加一个站点，再回来加 Key。'),
        React.createElement(
          'label',
          { style: S.field },
          React.createElement('span', { style: S.fieldLabel }, 'API Key *'),
          React.createElement('input', {
            style: S.input,
            type: 'password',
            value: secret[0],
            placeholder: 'sk-…',
            onChange: function (event) { secret[1](event && event.target ? event.target.value : '') },
          }),
        ),
        React.createElement(
          'label',
          { style: S.field },
          React.createElement('span', { style: S.fieldLabel }, '备注（可选）'),
          React.createElement('input', {
            style: S.input,
            value: label[0],
            onChange: function (event) { label[1](event && event.target ? event.target.value : '') },
          }),
        ),
        React.createElement(
          'label',
          { style: S.field },
          React.createElement('span', { style: S.fieldLabel }, '分组 / 套餐（可选）'),
          React.createElement('input', {
            style: S.input,
            value: group[0],
            onChange: function (event) { group[1](event && event.target ? event.target.value : '') },
          }),
        ),
        React.createElement('div', { style: S.formRow },
          React.createElement('button', {
            style: S.btnPrimary,
            disabled: busy || !providerList.length,
            onClick: function () {
              if (!String(secret[0] || '').trim()) return say(false, 'API Key 不能为空')
              var target = pid[0]
              run(function () {
                return writeOp('POST', '/api/credentials', {
                  providerId: target,
                  label: String(label[0] || '').trim() || '默认',
                  secret: String(secret[0] || '').trim(),
                  group: String(group[0] || '').trim(),
                }).then(function (res) {
                  if (!res.ok) throw new Error(res.error)
                  secret[1]('')
                  return `已给「${names[target] || target}」添加 Key；到「站点」页点「同步」即可拉到模型`
                })
              })
            },
          }, busy ? '保存中…' : '添加 Key'),
        ),
      )

      var table = credentials.length
        ? React.createElement(
          'table',
          { style: S.table },
          React.createElement('thead', null, React.createElement('tr', null,
            ['站点', '备注', '分组', '后缀', '到期', '操作'].map(function (label2) {
              return React.createElement('th', { key: label2, style: S.th }, label2)
            }),
          )),
          React.createElement('tbody', null, credentials.map(function (c) {
            return React.createElement('tr', { key: c.id },
              React.createElement('td', { style: S.td }, names[c.providerId] || c.providerId),
              React.createElement('td', { style: S.td }, c.label || '默认'),
              React.createElement('td', { style: S.td }, c.group || '—'),
              React.createElement('td', { style: S.td }, c.tail ? '••••' + c.tail : '—'),
              React.createElement('td', { style: S.td }, c.expiresAt ? String(c.expiresAt).slice(0, 10) : '—'),
              React.createElement('td', { style: S.td },
                React.createElement('button', {
                  style: S.btnDanger,
                  disabled: busy,
                  onClick: function () {
                    var ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
                      ? window.confirm(`删除「${names[c.providerId] || c.providerId}」的这把 Key？`)
                      : true
                    if (!ok) return
                    run(function () {
                      return writeOp('DELETE', '/api/credentials/' + c.id, {}).then(function (res) {
                        if (!res.ok) throw new Error(res.error)
                        return '已删除该 Key'
                      })
                    })
                  },
                }, '删除'),
              ),
            )
          })),
        )
        : nothingYet('还没有 Key。给站点加一把 Key 才能同步模型、跑探针、参与路由。')

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        note[0] ? React.createElement('div', { style: note[0].ok ? S.okLine : S.err }, String(note[0].text)) : null,
        React.createElement('div', { style: S.card }, form),
        React.createElement('div', { style: S.card }, table),
      )
    }

    var TABS = [
      { id: 'overview', label: '概览' },
      { id: 'sites', label: '站点' },
      { id: 'keys', label: 'Keys' },
      { id: 'prices', label: '比价' },
      { id: 'decisions', label: '决策' },
      { id: 'probes', label: '探针' },
      { id: 'usage', label: '用量' },
    ]

    // ── 主面板：左侧栏图标（ownerProps: { size, active }）───────────────
    // 单色描边、颜色走 currentColor，选中态由宿主主题投射决定；手写 path，不引外部资源。
    function ManageIcon(props) {
      if (!React) return null
      var size = props && typeof props.size === 'number' ? props.size : 18
      var svg = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }
      return React.createElement(
        'svg',
        svg,
        React.createElement('rect', { x: 2.5, y: 4, width: 12.5, height: 16, rx: 2.5 }),
        React.createElement('path', { d: 'M6 8.8h5.5M6 12h5.5M6 15.2h3.2' }),
        React.createElement('path', { d: 'M16.2 12h5M18.9 9.4 21.5 12l-2.6 2.6' }),
        React.createElement('circle', { cx: 19.6, cy: 6.2, r: 1.2, fill: 'currentColor', stroke: 'none' }),
        React.createElement('circle', { cx: 19.6, cy: 17.8, r: 1.2, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function ManagePanel(props) {
      if (!React) return null
      var main = !!(props && props.variant === 'main')
      var tabState = React.useState('overview')
      var tab = tabState[0]
      var setTab = tabState[1]
      var data = useManageApi(15000)

      var body = null
      if (tab === 'overview') {
        body = React.createElement(OverviewTab, {
          health: data.health, state: data.state, busy: data.busy,
          restart: data.restart, onReload: data.reload,
        })
      } else if (tab === 'sites') {
        body = React.createElement(SitesTab, { state: data.state, onReload: data.reload })
      } else if (tab === 'keys') {
        body = React.createElement(KeysTab, { state: data.state, onReload: data.reload })
      } else if (tab === 'prices') {
        body = React.createElement(PricesTab, { state: data.state })
      } else if (tab === 'usage') {
        body = React.createElement(UsageTab, { state: data.state })
      } else if (tab === 'decisions') {
        body = React.createElement(DecisionsTab, { state: data.state })
      } else {
        body = React.createElement(ProbesTab, { state: data.state })
      }

      var head = React.createElement(
        'div',
        { style: main ? S.pageHead : S.head },
        React.createElement('span', { style: main ? S.pageTitle : S.title }, 'ManageAPI'),
        React.createElement('span', { style: main ? S.pageSub : S.sub }, '多站点模型路由 · 守护进程托管'),
        main ? React.createElement('span', { style: S.pageSpacer }) : null,
        main ? React.createElement('button', {
          style: S.pageBtn,
          onClick: function () { data.reload() },
          disabled: !!data.busy,
        }, data.busy ? '刷新中…' : '刷新') : null,
      )

      var children = [
        head,
        data.error ? React.createElement('div', { style: S.err }, String(data.error)) : null,
        React.createElement('div', { style: S.tabs }, TABS.map(function (item) {
          return React.createElement('button', {
            key: item.id,
            style: item.id === tab ? S.tabActive : S.tab,
            onClick: function () { setTab(item.id) },
          }, item.label)
        })),
        body,
      ]

      if (!main) return React.createElement('div', { style: S.wrap }, children)
      return React.createElement(
        'div',
        { style: S.page },
        React.createElement('div', { style: S.pageInner }, children),
      )
    }

    // 设置页里的常驻分区（保留：随时能从设置进入）
    function PanelSection() {
      return React.createElement(ManagePanel, { variant: 'section' })
    }

    // 中央主面板（点左侧栏 ManageAPI 图标进入）
    function MainPanel() {
      return React.createElement(ManagePanel, { variant: 'main' })
    }

    // ── 生命周期 ──────────────────────────────────────────────────────
    function apply(ctx) {
      var disposers = []
      try {
        var slots = ctx.get('slots', false)
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
          try { console.warn('[dsh-manage-api] slots 不可用，设置页分区未注册') } catch (e) { /* ignore */ }
          return function () {}
        }

        // ① 左侧栏图标 + 中央主面板（与 plugins / task-board 同级的独立功能区）
        var mainDisposers = []
        function dropMainPanels() {
          for (var i = 0; i < mainDisposers.length; i += 1) {
            try { if (typeof mainDisposers[i] === 'function') mainDisposers[i]() } catch (e) { /* ignore */ }
          }
          mainDisposers.length = 0
        }
        slots.inject('main', function () {
          try {
            var d = slots.register({ name: 'main', key: 'manage-api' }, MainPanel)
            if (typeof d === 'function') mainDisposers.push(d)
          } catch (e) { /* ignore */ }
        })
        slots.inject('sidebar.panellist', function () {
          try {
            var d = slots.register({
              name: 'sidebar.panellist',
              id: 'manage-api',
              order: 40,
              label: 'ManageAPI',
            }, ManageIcon)
            if (typeof d === 'function') mainDisposers.push(d)
          } catch (e) { /* ignore */ }
        })
        // 主面板开关在 host 侧（cordis.patch.yml 的 config.mainPanel）；拿到 /health 后决定是否撤掉
        try {
          fetchJson('health').then(function (res) {
            var cfg = res && res.body && res.body.config
            if (cfg && cfg.mainPanel === false) dropMainPanels()
          }).catch(function () { /* 首次失败忽略：下次轮询还有机会 */ })
        } catch (e) { /* ignore */ }

        // ② 设置页常驻分区（保留：也能从设置进入）
        slots.inject('settings.section', function () {
          try {
            var d = slots.register({
              name: 'settings.section',
              id: 'manage-api',
              order: 60,
              label: 'ManageAPI',
            }, PanelSection)
            if (typeof d === 'function') disposers.push(d)
          } catch (e) { /* 注册失败不影响其它功能 */ }
        })

        // ③ 每条 assistant 消息下方的会话用量 chip（会话作用域，拿得到 sessionId）
        slots.inject('conversation.chat.assistant-actions', function () {
          try {
            var d = slots.register({
              name: 'conversation.chat.assistant-actions',
              id: 'manage-api-cost',
              order: 30,
              label: 'ManageAPI 用量',
            }, CostChip)
            if (typeof d === 'function') disposers.push(d)
          } catch (e) { /* ignore */ }
        })
      } catch (e) {
        try { console.warn('[dsh-manage-api] apply 失败', e) } catch (e2) { /* ignore */ }
      }
      return function () {
        try { dropMainPanels() } catch (e) { /* ignore */ }
        for (var i = 0; i < disposers.length; i += 1) {
          try { if (typeof disposers[i] === 'function') disposers[i]() } catch (e) { /* ignore */ }
        }
      }
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = name
    // 仅给 scripts/check.mjs 做渲染冒烟用；宿主不会读这个字段
    exports.__internals = {
      OverviewTab: OverviewTab,
      PricesTab: PricesTab,
      DecisionsTab: DecisionsTab,
      ProbesTab: ProbesTab,
      UsageTab: UsageTab,
      CostChip: CostChip, SitesTab: SitesTab, KeysTab: KeysTab, SiteWizard: SiteWizard, writeOp: writeOp,
      ManageIcon: ManageIcon,
      ManagePanel: ManagePanel,
      PanelSection: PanelSection,
      MainPanel: MainPanel,
    }
    return module.exports
  },
})
