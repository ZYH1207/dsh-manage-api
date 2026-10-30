// ── 站点（移植网页版 renderMonitor：KPI → 用量图 → 实时流量 → 站点卡网格 → 告警/排名 → 路由明细）──
// 网页版这块读 daemon 的 /api/monitor 产物（余额曲线 / 告警 / 公告 / 同步记录），插件只能拿 /api/state
// 快照：曲线换成「按天请求量 + 平均首字」，告警与排名由站点/路由派生，公告与同步记录没有数据源用 .empty
// 兜底。class 名与文案尽量和网页版 1:1。

var MONITOR_PAGE_SIZE = 9
var MONITOR_CHART_WINDOWS = [7, 14, 30]
var MONITOR_FX_FALLBACK = 7.2

// ── 数值 / 时间 ───────────────────────────────────────────────

/** null / '' / 非数字一律当「没有数据」，不能变成 0。 */
function monitorNum(value) {
  if (value === null || value === undefined || value === '') return null
  var n = typeof value === 'number' ? value : Number(value)
  return isFinite(n) ? n : null
}

function monitorTs(ts) {
  if (typeof ts === 'number') return isFinite(ts) ? ts : 0
  var t = Date.parse(String(ts || ''))
  return isFinite(t) ? t : 0
}

function monitorAgo(ts) {
  var t = monitorTs(ts)
  if (!t) return ''
  var m = Math.max(0, Math.floor((Date.now() - t) / 60000))
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  var hr = Math.floor(m / 60)
  if (hr < 24) return hr + ' 小时前'
  var d = Math.floor(hr / 24)
  return d < 30 ? d + ' 天前' : Math.floor(d / 30) + ' 个月前'
}

function monitorStamp(ts) {
  var t = monitorTs(ts)
  if (!t) return '—'
  var d = new Date(t)
  var p = function (v) { return v < 10 ? '0' + v : String(v) }
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function monitorMs(value) {
  var n = monitorNum(value)
  if (n === null || n <= 0) return '—'
  if (n < 1000) return Math.round(n) + 'ms'
  var s = n / 1000
  return (s < 10 ? s.toFixed(1) : String(Math.round(s))) + 's'
}

/** 0..1 → 百分比 */
function monitorPct(value) {
  var n = monitorNum(value)
  return n === null ? '—' : (n * 100).toFixed(1) + '%'
}

function monitorMoney(value) {
  var n = monitorNum(value)
  return n === null ? '—' : fmtMoney(n)
}

function monitorTokens(value) {
  var n = monitorNum(value)
  return n === null ? '—' : n >= 10000 ? fmtCompact(n) : fmtInt(n)
}

/** 美元 → 人民币：settings.fxUsdCny，其次 settings.fx.USD，最后 7.2 */
function monitorFx(settings) {
  var s = settings || {}
  var direct = monitorNum(s.fxUsdCny)
  if (direct && direct > 0) return direct
  if (s.fx && typeof s.fx === 'object') return monitorNum(s.fx.USD) || monitorNum(s.fx.usd) || MONITOR_FX_FALLBACK
  return MONITOR_FX_FALLBACK
}

/** 站点余额折成人民币；没有余额数据返回 null（不能拿 0 冒充）。 */
function monitorCnyOf(provider, fx) {
  var p = provider || {}
  var q = monitorNum(p.quotaRemaining)
  if (q === null) return null
  var cur = String(p.currency || 'USD').toUpperCase()
  return cur === 'CNY' || cur === 'RMB' ? q : q * (fx || MONITOR_FX_FALLBACK)
}

// ── 数据整形 ──────────────────────────────────────────────────

function monitorDayKeys(usage) {
  var keys = Object.keys((usage && usage.byDay) || {})
  if (keys.length === 0 && usage && Array.isArray(usage.days)) keys = usage.days.slice()
  return keys.sort()
}

/** 取最后 N 天的逐日序列；整段没数据时返回空数组，由调用方兜底。 */
function monitorDaySeries(usage, days) {
  var byDay = (usage && usage.byDay) || {}
  var keys = monitorDayKeys(usage)
  if (keys.length === 0) return []
  return keys.slice(Math.max(0, keys.length - days)).map(function (day) {
    var s = byDay[day] || {}
    return {
      day: String(day), requests: monitorNum(s.requests) || 0, ttft: monitorNum(s.avgTtftMs) || 0,
      input: monitorNum(s.input) || 0, output: monitorNum(s.output) || 0, cached: monitorNum(s.cached) || 0,
    }
  })
}

/** 每个站点一份视图：Key、供给、已定价数、分组倍率、折人民币余额。 */
function monitorBuildViews(state) {
  var fx = monitorFx(state.settings)
  var credBy = {}
  var offerBy = {}
  ;(Array.isArray(state.credentials) ? state.credentials : []).forEach(function (c) {
    if (c && c.providerId) (credBy[c.providerId] = credBy[c.providerId] || []).push(c)
  })
  ;(Array.isArray(state.offers) ? state.offers : []).forEach(function (o) {
    if (o && o.providerId) (offerBy[o.providerId] = offerBy[o.providerId] || []).push(o)
  })
  var providers = Array.isArray(state.providers) ? state.providers : []
  return providers.map(function (p) {
    var offs = offerBy[p.id] || []
    var priced = 0
    var groups = []
    var seen = {}
    offs.forEach(function (o) {
      if (monitorNum(o.inPrice) !== null || monitorNum(o.outPrice) !== null) priced += 1
      var label = String(o.group || '').trim() || '默认分组'
      if (seen[label]) return
      seen[label] = true
      var ratio = monitorNum(o.ratio)
      groups.push({ key: label, label: label, ratio: ratio === null ? monitorNum(o.siteRatio) : ratio })
    })
    groups.sort(function (a, b) { return (a.ratio || 0) - (b.ratio || 0) })
    return { provider: p, credentials: credBy[p.id] || [], priced: priced, total: offs.length, groups: groups, cny: monitorCnyOf(p, fx) }
  })
}

/** 告警由快照派生：令牌失效 / 余额低于阈值 / 已暂停 / 最近路由失败。 */
function monitorBuildAlerts(state, views) {
  var settings = state.settings || {}
  var fx = monitorFx(settings)
  var warnCny = monitorNum(settings.balanceWarnCny)
  var warnUsd = monitorNum(settings.balanceWarnUsd)
  var limit = warnCny !== null ? warnCny : warnUsd !== null ? warnUsd * fx : null
  var items = []
  views.forEach(function (view) {
    var p = view.provider
    var name = p.name || p.id
    if (p.tokenStatus === 'invalid') {
      items.push({
        key: 'tok:' + p.id, level: 'red', title: name + ' 的令牌已失效',
        detail: p.tokenStatusMessage || '站点返回鉴权失败，重新填一次后台令牌就会恢复采集。',
        meta: name + ' · ' + (monitorAgo(p.tokenStatusAt || p.updatedAt) || '刚刚'),
        at: monitorTs(p.tokenStatusAt || p.updatedAt),
      })
    }
    if (limit !== null && view.cny !== null && view.cny < limit) {
      items.push({
        key: 'bal:' + p.id, level: 'yellow', title: name + ' 余额低于阈值',
        detail: '剩余 ' + monitorMoney(view.cny) + '，阈值 ' + monitorMoney(limit) + '。',
        meta: name + ' · ' + (monitorAgo(p.quotaUpdatedAt) || '还没同步过'), at: monitorTs(p.quotaUpdatedAt),
      })
    }
    if (p.paused) {
      items.push({
        key: 'pause:' + p.id, level: 'yellow', title: name + ' 已暂停',
        detail: '暂停后不接新请求、不跑探针，也不进比价和决策。',
        meta: name + ' · 手动暂停', at: monitorTs(p.updatedAt),
      })
    }
  })
  ;(Array.isArray(state.routing) ? state.routing : []).slice(0, 12).forEach(function (r, i) {
    if (!r || r.outcome === 'ok') return
    var fails = Array.isArray(r.failures) ? r.failures : []
    items.push({
      key: 'route:' + (r.id || i), level: 'red', title: '路由失败：' + (r.model || '未知模型'),
      detail: fails.length ? String(fails[0].error || fails[0].reason || '') || '所有候选站点都没打通。' : '所有候选站点都没打通，看一眼探针和令牌。',
      meta: (r.chosenProviderName || '未选中站点') + ' · ' + (monitorAgo(r.ts) || '刚刚'), at: monitorTs(r.ts),
    })
  })
  return items.sort(function (a, b) { return b.at - a.at })
}

// ── 网页版独有图标（ICONS 表里没有的，就地内联）─────────────────

function monitorSvg(size, paths) {
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  }, paths.map(function (d, i) { return h('path', { key: 'p' + i, d: d }) }))
}

function monitorPauseIcon(size) {
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', stroke: 'none', 'aria-hidden': 'true',
  }, h('rect', { x: 7, y: 5, width: 3.5, height: 14, rx: 1 }), h('rect', { x: 13.5, y: 5, width: 3.5, height: 14, rx: 1 }))
}

function monitorLoginIcon(size) { return monitorSvg(size, ['M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', 'M15 8l4 4-4 4', 'M19 12H9']) }
function monitorDownloadIcon(size) { return monitorSvg(size, ['M12 4v10', 'M8 10l4 4 4-4', 'M5 19h14']) }

// ── KPI ──────────────────────────────────────────────────────

function monitorKpiCard(key, k, v, unit, sub, icon, tone, hint) {
  return h('div', { key: key, className: 'stat' },
    h('div', { className: 'stat-main' },
      h('div', { className: 'k', title: hint || '' }, k),
      h('div', { className: 'v' }, v, unit ? h('small', null, unit) : null),
      h('div', { className: 'sub' }, sub)),
    h('div', { className: 'stat-icon ' + tone }, Icon(icon, { size: 18 })))
}

// ── 用量图（余额曲线没有数据源，改画按天的请求量 + 平均首字）───────

function MonitorChartCard(props) {
  var usage = props.usage || {}
  var daysPair = React.useState(14)
  var days = daysPair[0]
  var setDays = daysPair[1]
  var hoverPair = React.useState(-1)
  var hover = hoverPair[0]
  var setHover = hoverPair[1]
  var series = React.useMemo(function () { return monitorDaySeries(usage, days) }, [usage, days])

  var seg = h('div', { className: 'seg' }, MONITOR_CHART_WINDOWS.map(function (w) {
    return h('button', {
      key: 'win' + w, type: 'button', className: days === w ? 'active' : '',
      onClick: function () { setDays(w); setHover(-1) },
    }, w + ' 天')
  }))

  var body
  if (series.length === 0) {
    body = h('div', { className: 'empty small' },
      h('h3', null, '还没有用量数据'),
      h('p', null, '等网关转几次请求，这里会按天画出请求量和平均首字。'))
  } else {
    var W = 760, H = 240, PAD_L = 54, PAD_R = 54, PAD_T = 14, PAD_B = 26
    var innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B, n = series.length
    var maxReq = 1, maxTtft = 1, hasTtft = false
    series.forEach(function (d) {
      if (d.requests > maxReq) maxReq = d.requests
      if (d.ttft > maxTtft) maxTtft = d.ttft
      if (d.ttft > 0) hasTtft = true
    })
    var slot = innerW / n
    var barW = Math.max(3, Math.min(26, slot * 0.46))
    var xAt = function (i) { return n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (n - 1) }
    var yReq = function (v) { return PAD_T + innerH * (1 - v / maxReq) }
    var yTtft = function (v) { return PAD_T + innerH * (1 - v / maxTtft) }

    var marks = []
    ;[0, 1 / 3, 2 / 3, 1].forEach(function (t, i) {
      var y = PAD_T + innerH * t
      marks.push(h('line', { key: 'gl' + i, className: 'grid-line', x1: PAD_L, y1: y.toFixed(1), x2: W - PAD_R, y2: y.toFixed(1) }))
      marks.push(h('text', { key: 'la' + i, className: 'axis-label', x: PAD_L - 8, y: (y + 4).toFixed(1), textAnchor: 'end' }, fmtCompact(maxReq * (1 - t))))
      marks.push(h('text', { key: 'lb' + i, className: 'axis-label', x: W - PAD_R + 8, y: (y + 4).toFixed(1), textAnchor: 'start' }, monitorMs(maxTtft * (1 - t))))
    })

    var bars = series.map(function (d, i) {
      var by = yReq(d.requests)
      return h('rect', {
        key: 'bar' + i, className: 'spend-bar', x: (PAD_L + slot * i + (slot - barW) / 2).toFixed(1), y: by.toFixed(1),
        width: barW.toFixed(1), height: Math.max(0, PAD_T + innerH - by).toFixed(1), rx: 2,
      })
    })

    var dots = hasTtft ? h('g', { className: 'dots' }, series.map(function (d, i) {
      return h('circle', { key: 'dot' + i, cx: xAt(i).toFixed(1), cy: yTtft(d.ttft).toFixed(1), r: 2.6 })
    })) : null

    var labelStep = Math.max(1, Math.ceil(n / 7))
    var dayLabels = series.map(function (d, i) {
      if (i % labelStep !== 0 && i !== n - 1) return null
      return h('text', { key: 'day' + i, className: 'axis-label', x: xAt(i).toFixed(1), y: H - 8, textAnchor: 'middle' }, d.day.slice(5))
    })

    var hitters = series.map(function (d, i) {
      return h('rect', {
        key: 'hit' + i, x: (PAD_L + slot * i).toFixed(1), y: PAD_T, width: slot.toFixed(1), height: innerH,
        fill: 'transparent', style: { pointerEvents: 'all', cursor: 'crosshair' },
        onMouseEnter: function () { setHover(i) }, onMouseLeave: function () { setHover(-1) },
      })
    })

    var cur = hover >= 0 && hover < n ? series[hover] : null
    var tip = h('div', {
      className: 'chart-tip' + (cur ? ' is-on' : ''),
      style: cur ? { left: (xAt(hover) / W) * 100 + '%', transform: 'translateX(-50%)' } : undefined,
    }, cur ? [
      h('div', { key: 'th', className: 'chart-tip-head' }, cur.day),
      h('div', { key: 't1', className: 'chart-tip-row' }, h('span', null, '请求'), h('b', null, fmtInt(cur.requests))),
      h('div', { key: 't2', className: 'chart-tip-row' }, h('span', null, '平均首字'), h('b', null, monitorMs(cur.ttft))),
      h('div', { key: 'sep', className: 'chart-tip-sep' }),
      h('div', { key: 't3', className: 'chart-tip-row' }, h('span', null, '输入'), h('b', null, monitorTokens(cur.input))),
      h('div', { key: 't4', className: 'chart-tip-row' }, h('span', null, '输出'), h('b', null, monitorTokens(cur.output))),
    ] : null)

    body = h('div', { className: 'chart-wrap' },
      h('svg', { className: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img' },
        marks, bars,
        hasTtft ? h('path', {
          className: 'line',
          d: series.map(function (d, i) { return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yTtft(d.ttft).toFixed(1) }).join(' '),
        }) : null,
        dots, dayLabels, hitters),
      tip,
      h('div', { className: 'chart-legend' },
        h('span', null, h('i', { className: 'legend-bar' }), '每日请求'),
        h('span', null, h('i', { className: 'legend-line' }), '平均首字')))
  }

  return h('div', { className: 'card monitor-chart-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '用量概览'), h('div', { className: 'meta' }, '按天统计的网关请求量与平均首字')),
      seg),
    body)
}

// ── 实时流量（最近路由决策）────────────────────────────────────

function MonitorFlowCard(props) {
  var list = (props.routing || []).slice(0, 14)
  var body = list.length === 0
    ? h('div', { className: 'empty small' }, h('p', null, '还没有路由记录。经 ManageAPI 网关转发的请求会实时出现在这里。'))
    : h('div', { className: 'monitor-flow-list' }, list.map(function (r, i) {
        var ok = r.outcome === 'ok'
        return h('div', { key: r.id || 'route' + i, className: 'monitor-flow-row' },
          h('div', { className: 'monitor-flow-top' },
            h('span', { className: 'monitor-flow-key', title: r.model || '' }, r.model || '未知模型'),
            h('span', { className: 'badge ' + (ok ? 'ok' : 'danger') }, ok ? '成功' : '失败')),
          h('div', { className: 'monitor-flow-meta' },
            h('span', null, r.chosenProviderName || '未选中站点'),
            h('span', null, monitorMs(monitorNum(r.ttftMs) !== null ? r.ttftMs : r.latencyMs)),
            monitorNum(r.attempts) > 1 ? h('span', null, r.attempts + ' 次尝试') : null,
            h('span', null, monitorAgo(r.ts) || '刚刚')))
      }))

  return h('div', { className: 'card monitor-flow-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '实时流量'), h('div', { className: 'meta' }, '最近 ' + list.length + ' 条路由决策')),
      h('span', { className: 'hint', style: { margin: 0 } }, '模型 → 实际选中的站点')),
    body)
}

// ── 告警动态 / 站点排名 ───────────────────────────────────────

function MonitorAlertsCard(props) {
  var list = (props.alerts || []).slice(0, 40)
  var body = list.length === 0
    ? h('div', { className: 'empty small' }, h('p', null, '没有需要处理的告警，余额、令牌和路由都正常。'))
    : h('div', { className: 'monitor-feed-scroll' }, list.map(function (a) {
        return h('div', { key: a.key, className: 'monitor-feed-row' },
          h('span', { className: 'dot ' + (a.level === 'red' ? 'red' : 'yellow') }),
          h('div', { className: 'monitor-feed-body' },
            h('div', { className: 'monitor-feed-title' }, a.title),
            a.detail ? h('div', { className: 'monitor-feed-detail' }, a.detail) : null,
            h('div', { className: 'monitor-feed-meta' }, a.meta)))
      }))

  return h('div', { className: 'card monitor-feed-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '告警动态'), h('div', { className: 'meta' }, '由当前快照派生：令牌 / 余额 / 暂停 / 路由失败')),
      h('div', { className: 'monitor-head-actions' },
        h('span', { className: 'hint', style: { margin: 0 } }, list.length + ' 条'),
        h('button', {
          type: 'button', className: 'ghost tiny', disabled: true,
          title: '告警是本地派生的，daemon 没有已读状态接口，宿主也没开放 /api/monitor/alerts 的写权限',
        }, '全部已读'))),
    body)
}

function MonitorRankingCard(props) {
  var rows = (props.ranking || []).slice(0, 20)
  var body = rows.length === 0
    ? h('div', { className: 'empty small' }, h('p', null, '还没有站点排名，跑一轮探针后按得分排序。'))
    : h('div', { className: 'monitor-feed-scroll' }, rows.map(function (r, i) {
        var score = monitorNum(r.score)
        var tone = score === null ? 'info' : score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'danger'
        return h('div', { key: r.providerId || 'rank' + i, className: 'monitor-flow-row' },
          h('div', { className: 'monitor-flow-top' },
            h('span', { className: 'monitor-flow-key', title: r.providerName || '' }, (i + 1) + '. ' + (r.providerName || r.providerId || '未知站点')),
            h('span', { className: 'badge ' + tone }, score === null ? '未评分' : score.toFixed(1))),
          h('div', { className: 'monitor-flow-meta' },
            h('span', null, '在线率 ' + monitorPct(r.uptime)),
            h('span', null, '平均首字 ' + monitorMs(r.avgTtft)),
            h('span', null, (monitorNum(r.modelCount) || 0) + ' 个模型'),
            h('span', null, (monitorNum(r.probes) || 0) + ' 次探针'),
            h('span', null, monitorAgo(r.lastAt) || '还没探过')))
      }))

  return h('div', { className: 'card monitor-feed-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '站点排名'), h('div', { className: 'meta' }, '得分 / 在线率 / 首字，来自探针与流量样本')),
      h('span', { className: 'hint', style: { margin: 0 } }, (monitorNum(props.probeTotal) || 0) + ' 次探针')),
    body)
}

// ── 路由明细表 ────────────────────────────────────────────────

function MonitorRoutingTable(props) {
  var all = props.routing || []
  if (all.length === 0) {
    return h('div', { className: 'card' },
      h('div', { className: 'card-head' }, h('h3', null, '最近路由明细')),
      h('div', { className: 'empty small' }, h('p', null, '还没有路由记录。')))
  }
  return h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('h3', null, '最近路由明细'),
      h('span', { className: 'hint', style: { margin: 0 } }, '共 ' + all.length + ' 条')),
    h('div', { className: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, '时间'), h('th', null, '模型'), h('th', null, '选中站点'), h('th', null, '结果'),
        h('th', { className: 'num' }, '耗时'), h('th', { className: 'num' }, '首字'))),
      h('tbody', null, all.slice(0, 12).map(function (r, i) {
        var ok = r.outcome === 'ok'
        return h('tr', { key: r.id || 'row' + i },
          h('td', { className: 'mono' }, monitorStamp(r.ts)),
          h('td', null, r.model || '—'),
          h('td', null, r.chosenProviderName || '—'),
          h('td', null, h('span', { className: 'badge ' + (ok ? 'ok' : 'danger') }, ok ? '成功' : '失败')),
          h('td', { className: 'num' }, monitorMs(r.latencyMs)),
          h('td', { className: 'num' }, monitorMs(r.ttftMs)))
      })))),
    h('p', { className: 'hint' }, '同步只读站点公开 / 后台数据，不会改站点设置。'))
}

// ── 新增站点（POST /api/providers，再 POST /api/credentials）─────

function MonitorAddProvider(props) {
  var formPair = React.useState({ name: '', baseUrl: '', siteUrl: '', secret: '', kind: 'unknown' })
  var form = formPair[0]
  var setForm = formPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errPair = React.useState('')
  var err = errPair[0]
  var setErr = errPair[1]
  var inputStyle = { minWidth: '150px', flex: '1 1 180px' }

  /** 每个输入框共用一份样板 onChange，省掉五份重复的 setState。 */
  function input(key, placeholder, extra) {
    var p = {
      key: key, style: inputStyle, placeholder: placeholder, value: form[key],
      onChange: function (e) { var next = Object.assign({}, form); next[key] = e.target.value; setForm(next) },
    }
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k] })
    return h('input', p)
  }

  function submit() {
    if (busy) return
    if (!String(form.name).trim()) { setErr('站点名称不能为空'); return }
    if (!String(form.baseUrl).trim() && !String(form.siteUrl).trim()) { setErr('网站地址和 API 端点至少要填一个'); return }
    setErr('')
    setBusy(true)
    writeOp('POST', '/api/providers', {
      name: String(form.name).trim(), baseUrl: String(form.baseUrl).trim(),
      siteUrl: String(form.siteUrl).trim(), kind: form.kind || 'unknown',
    }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'HTTP ' + res.status)
      var created = res.summary && res.summary.provider
      var secret = String(form.secret).trim()
      if (!created || !created.id || !secret) return null
      return writeOp('POST', '/api/credentials', { providerId: created.id, label: '默认', secret: secret })
        .then(function (rk) {
          if (!rk.ok) throw new Error('站点建好了，但 Key 没存上：' + (rk.error || 'HTTP ' + rk.status))
          return null
        })
    }).then(function () {
      setBusy(false)
      setForm({ name: '', baseUrl: '', siteUrl: '', secret: '', kind: 'unknown' })
      if (props.onDone) props.onDone()
    }).catch(function (error) {
      setBusy(false)
      setErr((error && error.message) || String(error))
    })
  }

  return h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '新增站点'), h('div', { className: 'meta' }, '填地址和一个 Key，保存后自动探测系别并拉模型列表')),
      h('button', { type: 'button', className: 'ghost tiny', onClick: props.onCancel }, '关闭')),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' } },
      input('name', '站点名称，例如「凌风」'),
      input('baseUrl', 'API 端点，例如 https://api.example.com/v1'),
      input('siteUrl', '网站地址（可选，卡片上的「打开站点」）'),
      h('select', {
        key: 'kind', style: { minWidth: '120px', flex: '0 0 auto' }, value: form.kind,
        title: '站点系别，留空由 daemon 自动探测',
        onChange: function (e) { var next = Object.assign({}, form); next.kind = e.target.value; setForm(next) },
      },
        h('option', { value: 'unknown' }, '自动识别'),
        h('option', { value: 'new-api' }, 'NewAPI'),
        h('option', { value: 'one-api' }, 'OneAPI'),
        h('option', { value: 'sub2api' }, 'Sub2API'),
        h('option', { value: 'vendor' }, '厂商直连')),
      input('secret', 'API Key（可选，填了立刻能同步）', { type: 'password' }),
      h('button', { key: 'save', type: 'button', className: 'primary', disabled: busy, onClick: submit }, busy ? '保存中…' : '保存站点')),
    err ? h('p', { className: 'hint', style: { color: 'var(--danger)' } }, err) : null,
    h('p', { className: 'hint' }, '只有站点名是必填；Key 可以之后再补，但没 Key 就同步不了模型。'))
}

// ── 站点卡（1:1 照 providersHtml）───────────────────────────────

function monitorSiteCard(view, ctx) {
  var p = view.provider
  var id = p.id
  var name = p.name || p.id
  var pane = ctx.panes[id] || ''
  var expanded = !!ctx.groupOpen[id]
  var groups = view.groups || []
  var moreGroups = Math.max(0, groups.length - 6)
  var hasToken = !!p.hasAdminToken
  var tokenBroken = p.tokenStatus === 'invalid'
  var openUrl = p.siteUrl || p.baseUrl || ''
  var kindLabel = KIND_LABEL[p.kind] || (p.kind === 'relay' ? '中转' : '')
  var freeCount = Array.isArray(p.freeModels) ? p.freeModels.length : 0
  var busyHere = String(ctx.busy || '').indexOf(id) >= 0
  var limit = ctx.limit

  function iconBtn(key, cls, title, icon, handler) {
    return h('button', { key: key, type: 'button', className: 'icon-btn ' + cls, title: title, disabled: busyHere, onClick: handler }, icon)
  }

  function act(key, icon, label, tip, handler, on) {
    return h('button', {
      key: key, type: 'button', className: on ? 'primary' : '', title: tip || label,
      disabled: busyHere && !on, onClick: handler,
    }, icon, label)
  }

  function actPost(key, icon, label, tip, path, okText) {
    return act(key, icon, label, tip, function () {
      ctx.run(key + ':' + id, okText, function () {
        return writeOp('POST', '/api/providers/' + encodeURIComponent(id) + path, {})
      })
    })
  }

  function confirmThen(text, okText, fn) {
    var ask = typeof window !== 'undefined' && window.confirm ? window.confirm : null
    if (ask && !ask(text)) return
    ctx.run('del:' + id, okText, fn)
  }

  var balanceTitle = monitorNum(p.quotaRemaining) === null
    ? '还没有余额数据：需要站点后台令牌'
    : '原始币种 ' + String(p.currency || 'USD') + ' ' + Number(p.quotaRemaining).toFixed(3) + '，按汇率折算成人民币'

  var statusNode
  if (limit === null) statusNode = h('span', { className: 'hint', style: { margin: 0 } }, '未设阈值')
  else if (view.cny === null) statusNode = h('span', { className: 'badge' }, '无余额数据')
  else if (view.cny < limit) statusNode = h('span', { className: 'badge warn' }, '低于阈值')
  else statusNode = h('span', { className: 'badge ok' }, '正常')

  var tokenNode = tokenBroken
    ? h('span', { className: 'badge danger', title: p.tokenStatusMessage || '' }, '已失效')
    : hasToken
      ? h('span', { className: 'badge ok', title: '尾号 ' + String(p.adminTokenTail || '----') }, '已填')
      : h('span', { className: 'badge' }, '未填')

  var keyPane = pane === 'keys' ? h('div', { className: 'prov-detail', 'data-pane': 'keys' },
    h('div', { className: 'keylist' }, view.credentials.length === 0
      ? h('div', { className: 'detail-line dim' }, '这个站还没有 Key。')
      : view.credentials.map(function (c) {
          return h('div', { key: c.id, className: 'detail-line', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('b', null, c.label || '默认'),
            h('span', { className: 'dim' }, '尾号 ' + (c.tail || '----')),
            c.group ? h('span', { className: 'dim', title: c.group }, '· ' + c.group) : null,
            h('button', {
              type: 'button', className: 'ghost tiny', style: { marginLeft: 'auto' }, title: '删除这把 Key',
              onClick: function () {
                confirmThen('删除 Key「' + (c.label || '默认') + '」？对应的模型供给会一起消失。', 'Key 已删除', function () {
                  return writeOp('DELETE', '/api/credentials/' + encodeURIComponent(c.id))
                })
              },
            }, '删除'))
        }))) : null

  var ratePane = pane === 'rates' ? h('div', { className: 'prov-detail', 'data-pane': 'rates' },
    h('div', { className: 'prov-groups' },
      h('div', { className: 'k' }, '站点公布的分组与倍率'),
      groups.length === 0
        ? h('span', { className: 'hint', style: { margin: 0 } }, '还没同步模型，读不到分组倍率。')
        : h('div', { className: 'prov-group-chips' }, groups.map(function (g) {
            return h('span', { key: 'full' + g.key, className: 'group-chip', title: g.label },
              monitorNum(g.ratio) === null ? '÷' : '×' + Number(g.ratio).toFixed(2),
              monitorNum(g.ratio) === null ? null : h('span', { className: 'chip-note' }, ' ' + g.label))
          })))) : null

  return h('div', {
    key: id, className: 'card prov-card' + (p.paused ? ' is-paused' : ''),
    'data-provider': id, 'data-has-token': hasToken ? '1' : '0',
  },
    h('div', { className: 'prov-head' },
      h('div', { className: 'prov-id' },
        h('span', {
          className: 'dot ' + (tokenBroken ? 'red' : hasToken ? 'green' : ''),
          title: tokenBroken ? '令牌已失效' : hasToken ? '令牌可用' : '还没填后台令牌',
        }),
        h('b', { title: name }, name),
        openUrl ? h('a', {
          className: 'icon-btn prov-open', href: openUrl, target: '_blank', rel: 'noopener noreferrer', title: '打开站点',
          onClick: function (e) { e.stopPropagation() },
        }, Icon('external', { size: 13 })) : null,
        kindLabel ? h('span', { className: 'badge ' + (p.kind === 'vendor' ? 'kindchip-vendor' : 'kindchip-relay') }, kindLabel) : null,
        freeCount > 0 ? h('span', { className: 'badge prov-free', title: '免费模型' }, Icon('gift', { size: 11 }), '免费 ' + freeCount) : null,
        p.paused ? h('span', { className: 'badge warn' }, '已暂停') : null),
      h('div', { className: 'prov-head-right' },
        h('span', { className: 'hint', title: p.quotaUpdatedAt || '还没同步过' }, monitorAgo(p.quotaUpdatedAt) || '还没同步过'),
        iconBtn('pause', 'prov-pause', p.paused ? '恢复：重新接请求、跑探针、进比价' : '暂停：不接新请求、不探针、不进比价', monitorPauseIcon(13), function () {
          ctx.run((p.paused ? 'resume:' : 'pause:') + id, p.paused ? '已恢复' : '已暂停', function () {
            return writeOp('PATCH', '/api/providers/' + encodeURIComponent(id), { paused: !p.paused })
          })
        }),
        iconBtn('del', 'prov-del-icon', '删除站点', Icon('trash', { size: 13 }), function () {
          confirmThen('删除站点「' + name + '」？它的 Key 和模型列表会一起删掉，这个操作不能撤销。', '站点已删除', function () {
            return writeOp('DELETE', '/api/providers/' + encodeURIComponent(id))
          })
        }))),
    h('div', { className: 'prov-tiles' },
      h('div', null, h('div', { className: 'k' }, '余额'), h('b', { title: balanceTitle }, view.cny === null ? '—' : monitorMoney(view.cny))),
      h('div', null, h('div', { className: 'k' }, '已定价'), h('b', null, view.priced, h('span', { className: 'of' }, '/ ' + view.total))),
      h('div', null, h('div', { className: 'k' }, 'Key'), h('b', null, view.credentials.length, h('span', { className: 'of' }, '把')))),
    h('div', { className: 'prov-tiles prov-tiles--3' },
      h('div', null, h('div', { className: 'k' }, '阈值 · 状态'), h('b', null, statusNode)),
      h('div', null, h('div', { className: 'k' }, '充值汇率'), h('input', {
        className: 'unit-price', type: 'number', step: '0.01', min: '0',
        defaultValue: monitorNum(p.unitPrice) === null ? '' : String(p.unitPrice),
        title: '1 个站点货币单位值多少人民币，回车或失焦保存',
        onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur() },
        onBlur: function (event) {
          var raw = String(event.target.value || '').trim()
          var next = raw === '' ? null : monitorNum(raw)
          if (raw !== '' && (next === null || next <= 0)) {
            ctx.notify('充值汇率要是正数')
            event.target.value = monitorNum(p.unitPrice) === null ? '' : String(p.unitPrice)
            return
          }
          if (next === monitorNum(p.unitPrice)) return
          ctx.run('unit:' + id, '充值汇率已保存', function () {
            return writeOp('PATCH', '/api/providers/' + encodeURIComponent(id), { unitPrice: next })
          })
        },
      })),
      h('div', null, h('div', { className: 'k' }, '令牌'), h('b', null, tokenNode))),
    groups.length ? h('div', { className: 'prov-groups' },
      h('div', { className: 'k' }, '分组'),
      h('div', { className: 'prov-group-chips' },
        (expanded ? groups : groups.slice(0, 6)).map(function (g) {
          return h('span', { key: 'grp' + g.key, className: 'group-chip', title: g.label },
            monitorNum(g.ratio) === null ? g.label : '×' + Number(g.ratio).toFixed(2),
            monitorNum(g.ratio) === null ? null : h('span', { className: 'chip-note' }, ' ' + g.label))
        }),
        moreGroups > 0 ? h('button', {
          type: 'button', className: 'group-chip group-more', onClick: function () { ctx.toggleGroups(id) },
        }, expanded ? '收起' : '还有 ' + moreGroups + ' 个') : null)) : null,
    h('div', { className: 'prov-actions' },
      h('button', {
        key: 'login', type: 'button', disabled: true,
        title: '需要站点后台账号密码；插件侧还没移植登录表单',
      }, monitorLoginIcon(14), '账号登录'),
      actPost('sync', Icon('refresh', { size: 14 }), '一键同步', '重新拉这个站的模型列表', '/sync', '已同步「' + name + '」'),
      act('keys', Icon('key', { size: 14 }), '密钥', '查看这个站的 Key', function () { ctx.togglePane(id, 'keys') }, pane === 'keys'),
      act('rates', Icon('columns', { size: 14 }), '分组倍率', '站点公布的分组与倍率', function () { ctx.togglePane(id, 'rates') }, pane === 'rates'),
      actPost('balance', Icon('wallet', { size: 14 }), '查余额', '重新读一次站点余额', '/balance', '已刷新「' + name + '」的余额'),
      actPost('usage', Icon('receipt', { size: 14 }), '用量核对', '核对站点侧用量与实际消耗', '/usage-check', '已核对「' + name + '」的用量'),
      h('button', {
        key: 'export', type: 'button', disabled: true,
        title: '宿主白名单没开放导出接口，先备份 daemon 的 data 目录',
      }, monitorDownloadIcon(14), '导出配置')),
    keyPane,
    ratePane)
}

// ── 主视图 ────────────────────────────────────────────────────

function MonitorView(props) {
  var api = (props && props.api) || {}
  var env = (props && props.state) || null
  var state = pickState(props || {}) || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var routing = Array.isArray(state.routing) ? state.routing : []
  var ranking = Array.isArray(state.siteRanking) ? state.siteRanking : []
  var usage = state.usage || {}
  var settings = state.settings || {}
  var totals = usage.totals || {}
  var fx = monitorFx(settings)

  var queryPair = React.useState('')
  var query = queryPair[0]
  var setQuery = queryPair[1]
  var pagePair = React.useState(1)
  var page = pagePair[0]
  var setPage = pagePair[1]
  var addPair = React.useState(false)
  var showAdd = addPair[0]
  var setShowAdd = addPair[1]
  var panePair = React.useState({})
  var panes = panePair[0]
  var setPanes = panePair[1]
  var groupPair = React.useState({})
  var groupOpen = groupPair[0]
  var setGroupOpen = groupPair[1]
  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var noticePair = React.useState(null)
  var notice = noticePair[0]
  var setNotice = noticePair[1]
  var formPair = React.useState({ interval: '', warn: '', price: '' })
  var syncForm = formPair[0]
  var setSyncForm = formPair[1]

  React.useEffect(function () {
    var fill = function (v, fallback) { var n = monitorNum(v); return n === null ? fallback : String(n) }
    setSyncForm({
      interval: fill(settings.monitorIntervalMinutes, '30'),
      warn: fill(settings.balanceWarnUsd, '1.5'),
      price: fill(settings.defaultUnitPrice, ''),
    })
  }, [settings.monitorIntervalMinutes, settings.balanceWarnUsd, settings.defaultUnitPrice])

  var views = React.useMemo(function () { return monitorBuildViews(state) }, [state])
  var alerts = React.useMemo(function () { return monitorBuildAlerts(state, views) }, [state, views])
  var warnCny = monitorNum(settings.balanceWarnCny)
  var warnUsd = monitorNum(settings.balanceWarnUsd)
  var limit = warnCny !== null ? warnCny : warnUsd !== null ? warnUsd * fx : null

  function reload() {
    try {
      if (api && typeof api.reload === 'function') api.reload()
    } catch (e) {
      /* 刷新失败不影响已经提示的结果 */
    }
  }

  function notify(text) {
    setNotice({ tone: 'warn', text: text })
  }

  /** 统一的写操作包装：跑之前置忙、跑完给结果并刷新快照。 */
  function run(key, okText, fn) {
    if (busy) return
    setBusy(key)
    setNotice(null)
    Promise.resolve().then(fn).then(function (res) {
      setBusy('')
      if (res && res.ok === false) setNotice({ tone: 'warn', text: '失败：' + (res.error || 'HTTP ' + res.status) })
      else setNotice({ tone: 'ok', text: okText || '完成' })
      reload()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '失败：' + ((error && error.message) || String(error)) })
    })
  }

  function togglePane(id, name) {
    var next = Object.assign({}, panes)
    next[id] = panes[id] === name ? '' : name
    setPanes(next)
  }

  function toggleGroups(id) {
    var next = Object.assign({}, groupOpen)
    next[id] = !groupOpen[id]
    setGroupOpen(next)
  }

  function saveSettings() {
    var payload = {}
    var iv = monitorNum(syncForm.interval)
    var wn = monitorNum(syncForm.warn)
    var pr = monitorNum(syncForm.price)
    if (iv !== null && iv > 0) payload.monitorIntervalMinutes = iv
    if (wn !== null && wn >= 0) payload.balanceWarnUsd = wn
    if (pr !== null && pr > 0) payload.defaultUnitPrice = pr
    if (Object.keys(payload).length === 0) {
      notify('同步设置三项都空着，没东西可保存')
      return
    }
    run('settings', '同步设置已保存', function () { return writeOp('PATCH', '/api/settings', payload) })
  }

  // KPI：余额折人民币 / 今日流量 / 平均首字 / 告警
  var withBalance = 0
  var totalCny = 0
  var totalUsd = 0
  var latestQuotaAt = 0
  views.forEach(function (v) {
    if (v.cny !== null) {
      withBalance += 1
      totalCny += v.cny
    }
    if (String(v.provider.currency || 'USD').toUpperCase() !== 'CNY') {
      var q = monitorNum(v.provider.quotaRemaining)
      if (q !== null) totalUsd += q
    }
    var at = monitorTs(v.provider.quotaUpdatedAt)
    if (at > latestQuotaAt) latestQuotaAt = at
  })

  var dayKeys = monitorDayKeys(usage)
  var latestDay = dayKeys.length ? dayKeys[dayKeys.length - 1] : ''
  var todayStat = (usage.byDay && usage.byDay[latestDay]) || {}
  var todayTokens = (monitorNum(todayStat.input) || 0) + (monitorNum(todayStat.output) || 0)
  var avgTtft = monitorNum(totals.avgTtftMs)

  var kpi = h('div', { className: 'stats monitor-kpi' },
    monitorKpiCard('kpi-sites', '站点', withBalance + '/' + providers.length, '', '有余额数据 ' + withBalance + ' 个',
      'servers', 'tint-muted', '有余额数据的站点数 / 站点总数'),
    monitorKpiCard('kpi-balance', '总余额', monitorMoney(totalCny), '',
      withBalance === 0 ? '还没有余额数据' : '≈ $' + totalUsd.toFixed(2) + '（按汇率 ' + fx + ' 折算）',
      'wallet', 'tint-accent', '各站点 quotaRemaining 按汇率折算成人民币后求和'),
    monitorKpiCard('kpi-flow', '今日流量', todayTokens > 0 ? monitorTokens(todayTokens) : '', '',
      (monitorNum(todayStat.requests) || 0) + ' 次请求 · 缓存 ' + monitorTokens(monitorNum(todayStat.cached) || 0),
      'receipt', 'tint-warn', '最新一天（' + (latestDay || '—') + '）的输入 + 输出 token'),
    monitorKpiCard('kpi-ttft', '平均首字', avgTtft === null ? '—' : monitorMs(avgTtft), '',
      (monitorNum(totals.requests) || 0) + ' 次请求 / ' + (monitorNum(totals.errors) || 0) + ' 次失败',
      'swap', 'tint-muted', '全部流量的平均首字时间'),
    monitorKpiCard('kpi-alert', '告警', alerts.length, '条', '上次同步 ' + (monitorAgo(latestQuotaAt) || '还没同步过'),
      'alert', alerts.length > 0 ? 'tint-warn' : 'tint-muted', '令牌失效 + 余额低于阈值 + 暂停 + 最近路由失败'))

  // 站点区：搜索 + 分页（每页 9 张，和网页版一致）
  var matched = React.useMemo(function () {
    var q = String(query || '').trim().toLowerCase()
    if (!q) return views
    return views.filter(function (v) {
      var p = v.provider || {}
      return String(p.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(p.baseUrl || '').toLowerCase().indexOf(q) >= 0 ||
        String(p.siteUrl || '').toLowerCase().indexOf(q) >= 0
    })
  }, [views, query])

  var pageCount = Math.max(1, Math.ceil(matched.length / MONITOR_PAGE_SIZE))
  var safePage = Math.min(Math.max(1, page), pageCount)
  var from = matched.length ? (safePage - 1) * MONITOR_PAGE_SIZE + 1 : 0
  var to = Math.min(safePage * MONITOR_PAGE_SIZE, matched.length)
  var pageRows = matched.slice((safePage - 1) * MONITOR_PAGE_SIZE, safePage * MONITOR_PAGE_SIZE)

  var ctx = {
    busy: busy, panes: panes, groupOpen: groupOpen, limit: limit,
    run: run, notify: notify, togglePane: togglePane, toggleGroups: toggleGroups,
  }

  var syncNumber = function (key, placeholder, title) {
    return h('input', {
      key: key, type: 'number', placeholder: placeholder, title: title, value: syncForm[key],
      onChange: function (e) {
        var next = Object.assign({}, syncForm)
        next[key] = e.target.value
        setSyncForm(next)
      },
    })
  }

  var syncPanel = h('div', { className: 'sync-panel' },
    syncNumber('interval', '间隔', '同步间隔（分钟）'),
    syncNumber('warn', '阈值', '告警阈值（美元）'),
    syncNumber('price', '汇率', '默认充值汇率：1 个站点货币单位值多少人民币'),
    h('button', { type: 'button', className: 'primary tiny', disabled: busy === 'settings', onClick: saveSettings }, '保存'))

  var sitesHead = providers.length ? h('div', { className: 'sites-head' },
    h('div', { className: 'sites-title-block' },
      h('h3', null, '站点余额与分组'),
      h('span', { className: 'hint' }, '分组倍率来自站点公布的可用渠道')),
    h('div', { className: 'sites-bar' },
      h('input', {
        id: 'site-search', type: 'search', placeholder: '搜索站点名或地址', value: query,
        onChange: function (e) { setQuery(e.target.value); setPage(1) },
      }),
      h('span', { className: 'site-pager' },
        h('span', { className: 'hint range' }, '显示 ' + from + '-' + to + '，共 ' + matched.length + ' 个'),
        h('button', { type: 'button', className: 'ghost tiny', disabled: safePage <= 1, onClick: function () { setPage(safePage - 1) } }, '上一页'),
        h('span', { className: 'hint' }, safePage + ' / ' + pageCount),
        h('button', { type: 'button', className: 'ghost tiny', disabled: safePage >= pageCount, onClick: function () { setPage(safePage + 1) } }, '下一页')),
      h('span', { className: 'grow' }),
      syncPanel,
      h('div', { className: 'sites-actions' },
        h('button', {
          type: 'button', disabled: true,
          title: '宿主白名单没开放 /api/monitor/collect；要刷新数据请用每张站点卡上的「一键同步」',
        }, Icon('refresh', { size: 14 }), '立即同步'),
        h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
          Icon('plus', { size: 14 }), '新增站点')))) : null

  var siteCards = h('div', { className: 'site-cards' }, pageRows.length
    ? pageRows.map(function (v) { return monitorSiteCard(v, ctx) })
    : h('div', { className: 'empty small' }, h('p', null, '没有匹配的站点。')))

  var addSiteBtn = h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
    Icon('plus', { size: 14 }), '新增站点')

  var sitesSection = providers.length
    ? h('div', { className: 'sites-section' }, h('div', { className: 'monitor-sites' }, sitesHead, siteCards))
    : h('div', { className: 'sites-section' }, h(Empty, {
        title: '还没有站点',
        desc: '先添加一个中转站，填上它的地址和一个 Key，就能拉取模型列表开始比价。',
        action: addSiteBtn,
      }))

  var noticeBar = notice ? h('div', { className: 'notice' + (notice.tone === 'warn' ? ' danger' : '') },
    h('span', { className: 'name' }, notice.tone === 'warn' ? '操作失败' : '操作完成'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, notice.text)) : null

  var offlineBar = env && env.ok === false ? h('div', { className: 'notice danger' },
    h('span', { className: 'name' }, '读不到 daemon 状态'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, '宿主路由没有返回快照，先确认 ManageAPI daemon 起起来了。')) : null

  return h('section', { className: 'view wide' },
    offlineBar,
    noticeBar,
    kpi,
    h('div', { className: 'monitor-cols monitor-cols--overview' },
      h(MonitorChartCard, { usage: usage }),
      h(MonitorFlowCard, { routing: routing })),
    sitesSection,
    showAdd ? h(MonitorAddProvider, {
      onDone: function () {
        setShowAdd(false)
        setNotice({ tone: 'ok', text: '站点已添加' })
        reload()
      },
      onCancel: function () { setShowAdd(false) },
    }) : null,
    h('div', { className: 'monitor-cols monitor-cols--feed' },
      h(MonitorAlertsCard, { alerts: alerts }),
      h(MonitorRankingCard, { ranking: ranking, probeTotal: state.probeTotal })),
    h(MonitorRoutingTable, { routing: routing }))
}
