// ── 站点（移植网页版 renderMonitor：KPI → 余额概览 → 实时流量 → 站点卡网格 → 告警/排名 → 路由明细）──
// 数据源是宿主新通道 GET /api/manage-api/monitor?days=N（转 daemon 的 /api/monitor 产物：余额曲线 /
// 站点账单花费 / 告警 / 公告 / 同步记录）。站点卡网格仍读 /api/state 快照（那是每张卡自己的用量口径，
// 网页版也是分开的）。class 名与文案尽量和网页版 1:1。

var MONITOR_PAGE_SIZE = 9
var MONITOR_CHART_WINDOWS = [7, 14, 30]
var MONITOR_FX_FALLBACK = 7.2

// 网页版 SPEND_RANGES：真实花费卡的三个时间段（今天 / 本周 / 本月）
var MONITOR_SPEND_RANGES = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// 网页版 SERIES_COLORS：站点胶囊与堆叠柱的取色顺序（和 theme.js 里的 .series-N 一一对应）
var MONITOR_SERIES_COLORS = [
  'hsl(226 55% 52%)', 'hsl(18 60% 52%)', 'hsl(166 45% 38%)', 'hsl(268 42% 56%)',
  'hsl(340 48% 55%)', 'hsl(43 65% 45%)', 'hsl(200 50% 45%)', 'hsl(100 30% 42%)',
]

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

/** 网页版 money()：不带符号——>=100 取整、>=1 两位、其余三位，没有数据给「—」。 */
function monitorMoneyShort(value) {
  var n = monitorNum(value)
  if (n === null) return '—'
  var abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

/** 网页版 priceSym() + money()：插件统一按人民币显示（不做 displayCurrency 切换）。 */
function monitorPriceText(cny) {
  return '¥' + monitorMoneyShort(cny)
}

function monitorTimeOnly(ts) {
  var t = monitorTs(ts)
  if (!t) return ''
  var d = new Date(t)
  var p = function (v) { return v < 10 ? '0' + v : String(v) }
  return p(d.getHours()) + ':' + p(d.getMinutes())
}

/** 网页版 siteUnitPriceForTotal()：站点账单金额按「1 单位值多少人民币」换算，默认 1。 */
function monitorUnitPrice(settings) {
  var n = monitorNum((settings || {}).defaultUnitPrice)
  return n !== null && n > 0 ? n : 1
}

/** 网页版 latestSiteFetchedAt()：所有站点里最晚一次读到账单的时间（字符串比较即可）。 */
function monitorLatestSiteFetchedAt(data) {
  var by = (data && data.siteSpend && data.siteSpend.byProvider) || {}
  var latest = ''
  Object.keys(by).forEach(function (pid) {
    var at = String((by[pid] && by[pid].todayFetchedAt) || '')
    if (at > latest) latest = at
  })
  return latest
}

/** SVG 要当字符串塞进 DOM，站点名里的 & / < 得先转义。 */
function monitorEsc(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

/** 同步设置面板的初始值（settings 变化后也用它回填）。 */
function monitorSyncForm(settings) {
  var s = settings || {}
  var fill = function (v, fallback) { var n = monitorNum(v); return n === null ? fallback : String(n) }
  return {
    interval: fill(s.monitorIntervalMinutes, '30'),
    warn: fill(s.balanceWarnUsd, '1.5'),
    price: fill(s.defaultUnitPrice, ''),
  }
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

/**
 * 一张 KPI 卡。item 里的 k / v 是 React 节点（真实花费卡要塞时间段按钮），
 * hint 走 title，wrap 对应网页版的 sub--wrap。
 */
function monitorKpiCard(key, item) {
  var it = item || {}
  return h('div', { key: key, className: 'stat' },
    h('div', { className: 'stat-main' },
      h('div', { className: 'k', title: it.hint || '' }, it.k || ''),
      h('div', { className: 'v' }, it.v === undefined || it.v === null ? '—' : it.v),
      h('div', { className: 'sub' + (it.wrap ? ' sub--wrap' : '') }, it.sub || '')),
    h('div', { className: 'stat-icon ' + (it.tint || 'tint-muted') }, Icon(it.ic || 'info', { size: 18 })))
}

/**
 * 网页版 spendStat(range)：真实花费只认站点自己的账单（siteSpend），不是估算口径。
 * 时间段按钮只改上层状态，不重新拉数据。
 */
function monitorSpendKpi(data, settings, range, onRange) {
  var siteSpend = (data && data.siteSpend) || {}
  var site = siteSpend[range] || null
  var siteCount = site ? monitorNum(site.providers) : null
  var hasSite = siteCount !== null && siteCount > 0
  var actualCny = hasSite ? (monitorNum(site.actual) || 0) * monitorUnitPrice(settings) : null

  var label = '今天'
  MONITOR_SPEND_RANGES.forEach(function (item) { if (item.key === range) label = item.label })

  var seg = h('span', { className: 'spend-range' }, MONITOR_SPEND_RANGES.map(function (item) {
    return h('button', {
      key: 'spend-' + item.key, type: 'button', className: item.key === range ? 'is-on' : '',
      onClick: function () { if (typeof onRange === 'function') onRange(item.key) },
    }, item.label)
  }))

  var asOf = ''
  if (range === 'today') {
    var timeText = monitorTimeOnly(monitorLatestSiteFetchedAt(data))
    if (timeText) asOf = '截至 ' + timeText
  }
  var truncated = range === 'today' && !!siteSpend.anyTruncated
  var sub = [
    hasSite ? siteCount + ' 个站点账单' : '站点未提供账单接口或令牌无效',
    asOf,
    truncated ? '有明细未拉全' : '',
  ].filter(function (part) { return !!part }).join(' · ')

  return {
    k: [h('span', { key: 'k-em', className: 'k-em' }, '真实花费'), ' · ' + label],
    v: [
      hasSite
        ? h('b', { key: 'amount', className: 'spend-actual' }, monitorPriceText(actualCny))
        : h('b', { key: 'amount', className: 'spend-actual spend-muted' }, '读不到账单'),
      h('span', { key: 'range-row', className: 'spend-range-row' }, seg),
    ],
    sub: sub,
    wrap: true,
    ic: 'receipt',
    tint: 'tint-warn',
    hint: '站点账单接口读到的真实扣费 | 按「默认充值汇率」换算成人民币 | 只有「今天」会标未拉全的明细 | 读不到账单时先检查站点令牌',
  }
}

// ── 余额概览（网页版 monitorChartSvg + chartCard 的移植）─────────

/** 图表几何：和网页版 760×240 / 54 边距保持一致。 */
var MONITOR_CHART_W = 760
var MONITOR_CHART_H = 240
var MONITOR_CHART_PAD_L = 54
var MONITOR_CHART_PAD_R = 54
var MONITOR_CHART_PAD_T = 14
var MONITOR_CHART_PAD_B = 26

/** 第 i 天的横坐标；只有一天时居中。 */
function monitorChartX(i, n) {
  var innerW = MONITOR_CHART_W - MONITOR_CHART_PAD_L - MONITOR_CHART_PAD_R
  return MONITOR_CHART_PAD_L + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
}

/** 折线的一段（至少两个点才画得出来）。 */
function monitorChartPath(points) {
  if (!points || points.length < 2) return ''
  return '<path class="line" d="' + points.map(function (p, idx) {
    return (idx === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)
  }).join(' ') + '"/>'
}

/**
 * 余额折线 + 各站花费堆叠柱。网页版 monitorChartSvg() 的 1:1 移植，只是返回字符串
 * （挂到 dangerouslySetInnerHTML 上）——170 行 SVG 用 h() 重写一遍可读性反而更差。
 *
 * options: { selected, providerIds, colorOf, seriesClassOf, fx }
 */
function monitorChartSvg(balanceSeries, spendSeries, options) {
  var bal = Array.isArray(balanceSeries) ? balanceSeries : []
  var spend = Array.isArray(spendSeries) ? spendSeries : []
  var opt = options || {}
  var selected = opt.selected || 'ALL'
  var providerIds = Array.isArray(opt.providerIds) ? opt.providerIds : []
  var fx = monitorNum(opt.fx) || MONITOR_FX_FALLBACK
  var colorOf = typeof opt.colorOf === 'function'
    ? opt.colorOf
    : function () { return MONITOR_SERIES_COLORS[0] }
  var isAll = selected === 'ALL'
  var accent = isAll ? 'var(--accent)' : colorOf(selected)
  var W = MONITOR_CHART_W
  var H = MONITOR_CHART_H
  var padL = MONITOR_CHART_PAD_L
  var padR = MONITOR_CHART_PAD_R
  var padT = MONITOR_CHART_PAD_T
  var padB = MONITOR_CHART_PAD_B
  var innerW = W - padL - padR
  var innerH = H - padT - padB
  var n = Math.max(bal.length, spend.length)
  if (n === 0) return ''
  var i

  // 余额序列：全部站点用 total（已折人民币），单站用 perProvider × 汇率
  var balVals = []
  for (i = 0; i < n; i += 1) {
    var brow = bal[i] || {}
    if (isAll) {
      balVals.push(typeof brow.total === 'number' ? brow.total : null)
    } else {
      var per = (brow.perProvider || {})[selected]
      balVals.push(typeof per === 'number' ? per * fx : null)
    }
  }
  var known = balVals.filter(function (v) { return v !== null })

  var hasSpend = false
  for (i = 0; i < n && !hasSpend; i += 1) {
    var srow = spend[i] || {}
    var by = srow.byProvider || {}
    if (isAll) {
      for (var k = 0; k < providerIds.length; k += 1) {
        if ((monitorNum(by[providerIds[k]]) || 0) > 0) { hasSpend = true; break }
      }
    } else if ((monitorNum(by[selected]) || 0) > 0) {
      hasSpend = true
    }
  }
  // 余额和花费全空时不画图，交给调用方出 .empty
  if (known.length === 0 && !hasSpend) return ''

  var min = known.length ? Math.min.apply(null, known) : 0
  var max = known.length ? Math.max.apply(null, known) : 1
  if (min === max) { min = Math.max(0, min - 1); max += 1 }
  max += (max - min) * 0.15

  var spendVals = []
  for (i = 0; i < n; i += 1) {
    var spRow = spend[i] || {}
    if (isAll) {
      var sum = 0
      providerIds.forEach(function (pid) { sum += monitorNum((spRow.byProvider || {})[pid]) || 0 })
      spendVals.push(sum)
    } else {
      spendVals.push(monitorNum((spRow.byProvider || {})[selected]) || 0)
    }
  }
  var spendMax = Math.max.apply(null, [0.01].concat(spendVals)) * 1.15

  var x = function (idx) { return monitorChartX(idx, n) }
  var yBal = function (v) { return padT + innerH * (1 - (v - min) / (max - min || 1)) }
  var slot = innerW / Math.max(n, 1)
  var barW = Math.max(3, Math.min(24, slot * 0.5))
  var parts = []

  // 网格 + 左右两侧刻度（左余额、右花费，都是人民币）
  ;[0, 1, 2, 3].forEach(function (step) {
    var ratio = step / 3
    var y = padT + innerH * ratio
    parts.push('<line class="grid-line" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>')
    parts.push('<text class="axis-label" x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' +
      '¥' + monitorEsc(monitorMoneyShort(max - (max - min) * ratio)) + '</text>')
    parts.push('<text class="axis-label" x="' + (W - padR + 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="start">' +
      '¥' + monitorEsc(monitorMoneyShort(spendMax * (1 - ratio))) + '</text>')
  })

  // 柱：全部站点时按站堆叠，选中单站时只有一根淡色柱
  for (i = 0; i < n; i += 1) {
    var left = (x(i) - barW / 2).toFixed(1)
    if (isAll) {
      var stackRow = spend[i] || {}
      var cum = 0
      providerIds.forEach(function (pid) {
        var v = monitorNum((stackRow.byProvider || {})[pid]) || 0
        if (v <= 0) return
        var hgt = Math.max(0.8, (v / spendMax) * innerH)
        var top = padT + innerH - ((cum + v) / spendMax) * innerH
        parts.push('<rect x="' + left + '" y="' + top.toFixed(1) + '" width="' + barW.toFixed(1) +
          '" height="' + hgt.toFixed(1) + '" fill="' + monitorEsc(colorOf(pid)) + '" opacity="0.85"/>')
        cum += v
      })
    } else if (spendVals[i] > 0) {
      var h2 = Math.max(1, (spendVals[i] / spendMax) * innerH)
      parts.push('<rect x="' + left + '" y="' + (padT + innerH - h2).toFixed(1) + '" width="' + barW.toFixed(1) +
        '" height="' + h2.toFixed(1) + '" fill="' + monitorEsc(accent) + '" opacity="0.3"/>')
    }
  }

  // 折线：中间断档（那天没采到余额）要断开，不能连成一条假线
  var seg = []
  balVals.forEach(function (v, idx) {
    if (v === null) {
      if (seg.length) { parts.push(monitorChartPath(seg)); seg = [] }
      return
    }
    seg.push([x(idx), yBal(v)])
  })
  if (seg.length) parts.push(monitorChartPath(seg))

  var dots = []
  balVals.forEach(function (v, idx) {
    if (v === null) return
    dots.push('<circle cx="' + x(idx).toFixed(1) + '" cy="' + yBal(v).toFixed(1) + '" r="2.6"/>')
  })
  if (dots.length) parts.push('<g class="dots">' + dots.join('') + '</g>')

  // 日标签：太密就抽稀，最后一天永远显示
  var labelStep = Math.max(1, Math.ceil(n / 7))
  for (i = 0; i < n; i += 1) {
    var keep = (i > 0 && i % labelStep === 0) || (i === n - 1 && n > 1)
    if (!keep) continue
    var dayRow = bal[i] || spend[i] || {}
    var day = String(dayRow.day || '')
    if (!day) continue
    parts.push('<text class="axis-label" x="' + x(i).toFixed(1) + '" y="' + (H - 8) +
      '" text-anchor="' + (i === n - 1 ? 'end' : 'middle') + '">' + monitorEsc(day.slice(5)) + '</text>')
  }

  // 每列一块透明命中区，hover 靠 data-chart-day 定位
  for (i = 0; i < n; i += 1) {
    parts.push('<rect x="' + (x(i) - slot / 2).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) +
      '" height="' + innerH + '" fill="transparent" pointer-events="all" data-chart-day="' + i + '"/>')
  }

  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="余额与花费趋势"' +
    ' style="--chart-accent:' + monitorEsc(accent) + '">' + parts.join('') + '</svg>'
}

/** 「余额概览」卡片：7/14/30 天、站点胶囊、hover 明细。 */
function MonitorChartCard(props) {
  var data = props.data || {}
  var days = props.days || 7
  var balanceSeries = Array.isArray(data.balanceSeries) ? data.balanceSeries : []
  var spendSeries = Array.isArray(data.spendSeries) ? data.spendSeries : []
  var rows = Array.isArray(data.balanceByProvider) ? data.balanceByProvider : []
  var fx = monitorFx(props.settings)
  var hoverPair = React.useState(-1)
  var hover = hoverPair[0]
  var setHover = hoverPair[1]

  // 有余额或有花费的站点才进图例与胶囊（否则一排 0 线只会误导）
  var chartProviders = []
  var nameOf = {}
  rows.forEach(function (row) {
    if (!row || row.providerId === undefined || row.providerId === null) return
    nameOf[row.providerId] = row.name || String(row.providerId)
    if (row.balance !== null && row.balance !== undefined) { chartProviders.push(row.providerId); return }
    var spent = spendSeries.some(function (d) {
      return (monitorNum(((d && d.byProvider) || {})[row.providerId]) || 0) > 0
    })
    if (spent) chartProviders.push(row.providerId)
  })

  var colorOf = function (pid) {
    var idx = Math.max(0, chartProviders.indexOf(pid))
    return MONITOR_SERIES_COLORS[idx % MONITOR_SERIES_COLORS.length]
  }
  var seriesClassOf = function (pid) {
    var idx = Math.max(0, chartProviders.indexOf(pid))
    return 'series-' + (idx % MONITOR_SERIES_COLORS.length + 1)
  }

  var selected = props.selected || 'ALL'
  if (selected !== 'ALL' && chartProviders.indexOf(selected) < 0) selected = 'ALL'

  var n = Math.max(balanceSeries.length, spendSeries.length)
  var svg = monitorChartSvg(balanceSeries, spendSeries, {
    selected: selected, providerIds: chartProviders, colorOf: colorOf, seriesClassOf: seriesClassOf, fx: fx,
  })

  var balAt = function (idx) {
    var row = balanceSeries[idx] || {}
    if (selected === 'ALL') return typeof row.total === 'number' ? row.total : null
    var v = (row.perProvider || {})[selected]
    return typeof v === 'number' ? v * fx : null
  }
  var spendAt = function (idx, pid) {
    return monitorNum((((spendSeries[idx] || {}).byProvider) || {})[pid]) || 0
  }
  var spendSum = function (idx) {
    if (selected !== 'ALL') return spendAt(idx, selected)
    var sum = 0
    chartProviders.forEach(function (pid) { sum += spendAt(idx, pid) })
    return sum
  }
  var dayAt = function (idx) {
    var row = balanceSeries[idx] || spendSeries[idx] || {}
    return String(row.day || '')
  }

  var tipRows = null
  if (hover >= 0 && hover < n) {
    var balValue = balAt(hover)
    tipRows = [
      h('div', { key: 'head', className: 'chart-tip-head' },
        dayAt(hover) + (selected === 'ALL' ? '' : ' · ' + (nameOf[selected] || selected))),
      h('div', { key: 'bal', className: 'chart-tip-row' },
        h('span', null, selected === 'ALL' ? '余额合计' : '余额'),
        h('b', null, balValue === null ? '—' : monitorPriceText(balValue))),
    ]
    if (selected === 'ALL') {
      var ranked = chartProviders.map(function (pid) {
        return { id: pid, value: spendAt(hover, pid) }
      }).filter(function (row) { return row.value > 0 }).sort(function (a, b) { return b.value - a.value })
      if (ranked.length) {
        tipRows.push(h('div', { key: 'sep1', className: 'chart-tip-sep' }))
        ranked.forEach(function (row) {
          tipRows.push(h('div', { key: 'site-' + row.id, className: 'chart-tip-row' },
            h('span', null, h('i', { className: 'chart-tip-dot', style: { background: colorOf(row.id) } }),
              nameOf[row.id] || String(row.id)),
            h('b', null, monitorPriceText(row.value))))
        })
        tipRows.push(h('div', { key: 'sep2', className: 'chart-tip-sep' }))
        tipRows.push(h('div', { key: 'sum', className: 'chart-tip-row' },
          h('span', null, '花费合计'), h('b', null, monitorPriceText(spendSum(hover)))))
      }
    } else {
      tipRows.push(h('div', { key: 'spend', className: 'chart-tip-row' },
        h('span', null, '花费'), h('b', null, monitorPriceText(spendSum(hover)))))
    }
  }

  var tip = h('div', {
    className: 'chart-tip' + (tipRows ? ' is-on' : ''),
    role: 'tooltip',
    style: tipRows ? { left: (monitorChartX(hover, n) / MONITOR_CHART_W) * 100 + '%' } : undefined,
  }, tipRows)

  var seg = h('span', { className: 'seg' }, MONITOR_CHART_WINDOWS.map(function (w) {
    return h('button', {
      key: 'days-' + w, type: 'button', className: days === w ? 'active' : '',
      onClick: function () { setHover(-1); if (typeof props.onDays === 'function') props.onDays(w) },
    }, w + ' 天')
  }))

  var chips = h('div', { className: 'monitor-chips' },
    h('button', {
      key: 'chip-all', type: 'button', className: 'monitor-chip' + (selected === 'ALL' ? ' is-on' : ''),
      onClick: function () { setHover(-1); if (typeof props.onSelect === 'function') props.onSelect('ALL') },
    }, h('span', { className: 'dot' }), '全部站点'),
    chartProviders.map(function (pid) {
      return h('button', {
        key: 'chip-' + pid, type: 'button',
        className: 'monitor-chip ' + seriesClassOf(pid) + (selected === pid ? ' is-on' : ''),
        onClick: function () { setHover(-1); if (typeof props.onSelect === 'function') props.onSelect(pid) },
      }, h('span', { className: 'dot' }), nameOf[pid] || String(pid))
    }))

  var body = svg
    ? h('div', {
        className: 'chart-wrap',
        onMouseMove: function (e) {
          var target = e && e.target
          var raw = target && target.getAttribute ? target.getAttribute('data-chart-day') : null
          if (raw === null || raw === undefined || raw === '') return
          var idx = Number(raw)
          if (isFinite(idx) && idx >= 0 && idx < n && idx !== hover) setHover(idx)
        },
        onMouseLeave: function () { setHover(-1) },
      },
      h('div', { dangerouslySetInnerHTML: { __html: svg } }),
      tip)
    : h('div', { className: 'empty small' }, h('p', null, '还没有同步到余额。点右上角「立即同步」跑一轮。'))

  return h('div', { className: 'card monitor-chart-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '余额概览'), h('div', { className: 'meta' }, '余额合计与各站花费，按天')),
      seg),
    body,
    h('div', { className: 'chart-legend' },
      h('span', null, h('i', { className: 'legend-line' }),
        selected === 'ALL' ? '余额合计（¥，其他币种按汇率折算）' : '该站余额（¥）'),
      h('span', null, h('i', { className: 'legend-bar' }),
        selected === 'ALL' ? '各站花费（堆叠）' : '该站每日花费')),
    chips)
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
  // 优先用 daemon 的告警流水（有已读状态）；拿不到时退回由快照派生的本地提醒
  var fromDaemon = Array.isArray(props.monitorAlerts)
  var rows = fromDaemon && props.monitorAlerts.length ? props.monitorAlerts : (props.alerts || []).slice(0, 40)
  var unread = monitorNum(props.unread)
  var body = rows.length === 0
    ? h('div', { className: 'empty small' },
      h('p', null, fromDaemon
        ? '还没有告警。余额低于阈值、倍率变化、同步失败都会记在这里。'
        : '没有需要处理的告警，余额、令牌和路由都正常。'))
    : h('div', { className: 'monitor-feed-scroll' }, rows.slice(0, 40).map(function (a) {
        var level = a.level === 'danger' ? 'red' : 'yellow'
        var meta = [a.providerName, monitorAgo(a.at) || '刚刚'].filter(function (part) { return !!part }).join(' · ')
        return h('div', { key: a.id || a.key, className: 'monitor-feed-row' + (a.readAt ? ' read' : '') },
          h('span', { className: 'dot ' + level }),
          h('div', { className: 'monitor-feed-body' },
            h('div', { className: 'monitor-feed-title' }, a.title),
            a.detail ? h('div', { className: 'monitor-feed-detail' }, a.detail) : null,
            h('div', { className: 'monitor-feed-meta' }, meta)))
      }))

  var readDisabled = props.busy === 'alerts' || (unread !== null && unread <= 0)
  return h('div', { className: 'card monitor-feed-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '告警动态'),
        h('div', { className: 'meta' }, unread === null
          ? '由当前快照派生：令牌 / 余额 / 暂停 / 路由失败'
          : '余额低于阈值、倍率变化、同步失败都会记在这里')),
      h('div', { className: 'monitor-head-actions' },
        h('span', { className: 'hint', style: { margin: 0 } },
          unread === null ? rows.length + ' 条' : unread + ' 条未读'),
        h('button', {
          type: 'button', className: 'ghost tiny', disabled: readDisabled,
          title: readDisabled ? '没有未读告警' : '把 daemon 里所有未读告警标成已读',
          onClick: function () { if (!readDisabled && typeof props.onRead === 'function') props.onRead() },
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
  var openDetail = ctx.open

  /**
   * 卡片整体可点，进站点详情。卡片里本来就有按钮 / 链接 / 输入框 / 展开面板，
   * 它们自己有点击语义，点到这些元素时不要顺手跳走。
   */
  function openCard(event) {
    if (typeof openDetail !== 'function') return
    var target = event && event.target
    if (target && typeof target.closest === 'function' &&
      target.closest('button, a, input, select, textarea, .prov-detail')) return
    openDetail(id)
  }

  function openCardByKey(event) {
    if (!event) return
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    var target = event.target
    if (target && typeof target.closest === 'function' &&
      target.closest('button, a, input, select, textarea')) return
    event.preventDefault()
    if (typeof openDetail === 'function') openDetail(id)
  }

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
    key: id, className: 'card prov-card ma-row-link' + (p.paused ? ' is-paused' : ''),
    'data-provider': id, 'data-has-token': hasToken ? '1' : '0',
    role: 'link', tabIndex: 0, 'aria-label': '查看「' + name + '」的站点详情',
    onClick: openCard, onKeyDown: openCardByKey,
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
        })),
      h('span', { className: 'ma-chev', style: { marginLeft: '2px' }, 'aria-hidden': 'true' }, '›')),
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
  var settings = state.settings || {}
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
  var formPair = React.useState(function () { return monitorSyncForm(settings) })
  var syncForm = formPair[0]
  var setSyncForm = formPair[1]

  // 监控数据（宿主 GET /api/manage-api/monitor → daemon /api/monitor）
  var daysPair = React.useState(7)
  var days = daysPair[0]
  var setDays = daysPair[1]
  var dataPair = React.useState(null)
  var monitorData = dataPair[0]
  var setMonitorData = dataPair[1]
  var loadingPair = React.useState(true)
  var loading = loadingPair[0]
  var setLoading = loadingPair[1]
  var errorPair = React.useState('')
  var loadError = errorPair[0]
  var setLoadError = errorPair[1]
  var tickPair = React.useState(0)
  var reloadTick = tickPair[0]
  var setReloadTick = tickPair[1]
  var spendPair = React.useState('today')
  var spendRange = spendPair[0]
  var setSpendRange = spendPair[1]
  var chartSitePair = React.useState('ALL')
  var chartSite = chartSitePair[0]
  var setChartSite = chartSitePair[1]

  React.useEffect(function () {
    setSyncForm(monitorSyncForm(settings))
  }, [settings.monitorIntervalMinutes, settings.balanceWarnUsd, settings.defaultUnitPrice])

  // 拉监控数据：切天数或点完「立即同步 / 全部已读」都会重跑（alive 防止旧请求盖掉新结果）
  React.useEffect(function () {
    var alive = true
    setLoading(true)
    setLoadError('')
    fetchJson('monitor?days=' + days).then(function (res) {
      if (!alive) return
      var body = res && res.body
      if (!res || !res.ok || !body || body.ok === false || !body.data) {
        setLoading(false)
        setLoadError((body && body.error) || (res && res.error) || ('HTTP ' + ((res && res.status) || '?')))
        return
      }
      setMonitorData(body.data)
      setLoading(false)
    }).catch(function (error) {
      if (!alive) return
      setLoading(false)
      setLoadError((error && error.message) || String(error))
    })
    return function () { alive = false }
  }, [days, reloadTick])

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

  // KPI：站点 / 总余额 / 真实花费 / 24 小时变动 / 未读告警（全部来自 monitor 数据）
  var mkpi = (monitorData && monitorData.kpi) || {}
  var balanceSeries = (monitorData && Array.isArray(monitorData.balanceSeries)) ? monitorData.balanceSeries : []
  var latestBalance = null
  for (var bi = balanceSeries.length - 1; bi >= 0; bi -= 1) {
    if (balanceSeries[bi] && typeof balanceSeries[bi].total === 'number') { latestBalance = balanceSeries[bi]; break }
  }
  var totalCny = latestBalance ? latestBalance.total : null
  var lowestBalance = mkpi.lowest || null
  var withBalance = monitorNum(mkpi.withBalance)
  var providerCount = monitorNum(mkpi.providerCount)
  var rateChanges = monitorNum(mkpi.rateChanges24h)
  var unreadAlerts = monitorNum(mkpi.unreadAlerts)

  var balanceSub
  if (totalCny === null) {
    balanceSub = lowestBalance
      ? '最低：' + lowestBalance.name + ' ' + String(lowestBalance.currency || '') + ' ' + monitorMoneyShort(lowestBalance.balance)
      : '还没有余额数据'
  } else {
    balanceSub = '≈ $' + monitorMoneyShort(totalCny / fx) + '（按汇率折算）'
  }

  var kpi = h('div', { className: 'stats monitor-kpi' },
    monitorKpiCard('kpi-sites', {
      k: '站点',
      v: (withBalance === null ? 0 : withBalance) + '/' + (providerCount === null ? providers.length : providerCount),
      sub: '有余额数据',
      ic: 'servers', tint: 'tint-muted',
      hint: '已读到余额的站点数 / 站点总数（来自 daemon 的余额快照）',
    }),
    monitorKpiCard('kpi-balance', {
      k: '总余额',
      v: totalCny === null ? '—' : monitorPriceText(totalCny),
      sub: balanceSub,
      ic: 'wallet', tint: 'tint-accent',
      hint: '所有站点余额折成人民币后求和（外币站按当前汇率）',
    }),
    monitorKpiCard('kpi-spend', monitorSpendKpi(monitorData, settings, spendRange, setSpendRange)),
    monitorKpiCard('kpi-change', {
      k: '24 小时变动',
      v: rateChanges === null ? 0 : rateChanges,
      sub: '倍率 / 价格',
      ic: 'swap', tint: 'tint-muted',
      hint: '最近 24 小时里检测到的分组倍率或模型价格变动条数',
    }),
    monitorKpiCard('kpi-alert', {
      k: '未读告警',
      v: unreadAlerts === null ? 0 : unreadAlerts,
      sub: '上次同步 ' + (monitorAgo(mkpi.lastRunAt) || '还没同步过'),
      ic: 'alert', tint: (unreadAlerts || 0) > 0 ? 'tint-warn' : 'tint-muted',
      hint: '余额低于阈值、倍率变动、同步失败等未读告警数',
    }))

  /** 「立即同步」：让 daemon 现采一轮（会真的去站点拉余额与账单），成功后重拉监控数据。 */
  function collectNow() {
    if (busy) return
    setBusy('collect')
    setNotice(null)
    writeOp('POST', '/api/monitor/collect', { days: days }).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '同步失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      setNotice({ tone: 'ok', text: '已同步一轮站点余额与账单' })
      setReloadTick(function (n) { return n + 1 })
      reload()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '同步失败：' + ((error && error.message) || String(error)) })
    })
  }

  /** 全部已读：daemon 侧 POST /api/monitor/alerts/read。 */
  function readAlerts() {
    if (busy) return
    setBusy('alerts')
    setNotice(null)
    writeOp('POST', '/api/monitor/alerts/read', {}).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '标记已读失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      setNotice({ tone: 'ok', text: '告警已全部标记为已读' })
      setReloadTick(function (n) { return n + 1 })
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '标记已读失败：' + ((error && error.message) || String(error)) })
    })
  }

  /** 监控数据读取失败后的重试（不动 /api/state 快照）。 */
  function retryMonitor() {
    setLoadError('')
    setReloadTick(function (n) { return n + 1 })
  }

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
    // 卡片点进详情：路由在宿主侧（viewProps.openDetail 推 hash），这里只转一次手
    open: function (target) {
      if (typeof props.openDetail === 'function') props.openDetail(target)
    },
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
          type: 'button', disabled: busy === 'collect',
          title: '让 daemon 现采一轮余额与站点账单（要几秒到几十秒）',
          onClick: collectNow,
        }, Icon('refresh', { size: 14 }), '立即同步'),
        h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
          Icon('plus', { size: 14 }), '新增站点')))) : null

  var siteCards = h('div', { className: 'site-cards' }, pageRows.length
    ? pageRows.map(function (v) { return monitorSiteCard(v, ctx) })
    : h('div', { className: 'empty small' }, h('p', null, '没有匹配的站点。')))

  var addSiteBtn = h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
    Icon('plus', { size: 14 }), '新增站点')

  // 三态分开：还在首答就是骨架，读失败给错误行，只有真读到「零个站点」才引导新增
  var listLoading = Boolean(props.loading) && providers.length === 0
  var sitesSection = providers.length
    ? h('div', { className: 'sites-section' }, h('div', { className: 'monitor-sites' }, sitesHead, siteCards))
    : listLoading
      ? h('div', { className: 'sites-section' }, h(Skeleton, { cards: 1, rows: 3 }))
      : h('div', { className: 'sites-section' }, h(Empty, {
          title: '还没有站点',
          desc: '先添加一个中转站，填上它的地址和一个 Key，就能拉取模型列表开始比价。',
          action: addSiteBtn,
        }))

  var noticeBar = notice ? h('div', { className: 'notice' + (notice.tone === 'warn' ? ' danger' : '') },
    h('span', { className: 'name' }, notice.tone === 'warn' ? '操作失败' : '操作完成'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, notice.text)) : null

  // 站点快照没读到时也要能重试，不能只报 daemon 状态
  var snapshotMissing = Boolean(props.error) && providers.length === 0
  var offlineBar = (env && env.ok === false) || snapshotMissing ? h('div', { className: 'notice danger' },
    h('span', { className: 'name' }, snapshotMissing ? '读不到站点数据' : '读不到 daemon 状态'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, snapshotMissing
      ? (props.error || '宿主没有返回站点快照。')
      : '宿主路由没有返回快照，先确认 ManageAPI daemon 起起来了。'),
    h('button', {
      type: 'button', className: 'ghost tiny',
      onClick: function () { if (typeof props.onReload === 'function') props.onReload(); else reload() },
    }, '重试')) : null

  // 详情段：路由 extra 是站点 id 时整页换成详情（列表的搜索/分页状态留在本组件里，返回即恢复）
  if (props.detail) {
    return h(SiteDetailView, {
      id: props.detail,
      state: props.state,
      loading: props.loading,
      error: props.error,
      api: api,
      onReload: function () { reload() },
      closeDetail: props.closeDetail,
    })
  }

  // 首次加载 / 拉失败：整页只给 loading 或重试入口（和网页版一致），站点卡等数据就绪后再出
  if (!monitorData) {
    if (loading) {
      return h('section', { className: 'view wide' },
        h('div', { className: 'empty' },
          h('h3', null, '正在读取监控数据…'),
          h('p', null, '第一次打开会现采一轮，稍等一下。')))
    }
    return h('section', { className: 'view wide' },
      h('div', { className: 'empty' },
        h('h3', null, '监控数据读取失败'),
        h('p', null, loadError || '宿主没有返回监控数据，先确认 ManageAPI daemon 起起来了。'),
        h('button', { type: 'button', className: 'primary', onClick: retryMonitor }, '重试')))
  }

  // 已经有数据、但后台重拉失败：只在顶部提示，不清空页面
  var staleBar = loadError ? h('div', { className: 'notice danger' },
    h('span', { className: 'name' }, '监控数据没有刷新'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, loadError),
    h('button', { type: 'button', className: 'ghost tiny', onClick: retryMonitor }, '重试')) : null

  return h('section', { className: 'view wide' },
    offlineBar,
    staleBar,
    noticeBar,
    kpi,
    h('div', { className: 'monitor-cols monitor-cols--overview' },
      h(MonitorChartCard, {
        data: monitorData,
        days: days,
        onDays: function (next) { setDays(next) },
        selected: chartSite,
        onSelect: function (next) { setChartSite(next) },
        settings: settings,
      }),
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
      h(MonitorAlertsCard, {
        monitorAlerts: Array.isArray(monitorData.alerts) ? monitorData.alerts : null,
        alerts: alerts,
        unread: unreadAlerts,
        busy: busy,
        onRead: readAlerts,
      }),
      h(MonitorRankingCard, { ranking: ranking, probeTotal: state.probeTotal })),
    h(MonitorRoutingTable, { routing: routing }))
}

// ── 站点详情（列表 → 详情两段式）────────────────────────────────

/** 详情页的价格：沿用站点自己公布的单位（/M、/1k、/次）与币种，不做二次换算。 */
function sitePriceText(offer, value) {
  var o = offer || {}
  var n = monitorNum(value)
  if (n === null) return '—'
  var unit = o.priceUnit === 'per_call' ? '/次' : o.priceUnit === 'per_1k' ? '/1k' : '/M'
  var sym = String(o.currency || 'USD').toUpperCase() === 'CNY' ? '¥' : '$'
  return sym + monitorMoneyShort(n) + unit
}

/** 概览里的一格：结构和 .stats / .stat 一致，副标题借 .hint 并压掉它的上边距。 */
function siteDetailStat(key, label, value, sub) {
  return h('div', { key: key, className: 'stat' },
    h('div', { className: 'k' }, label),
    h('div', { className: 'v' }, value),
    sub ? h('div', { className: 'hint', style: { margin: '4px 0 0', lineHeight: 1.5 } }, sub) : null)
}

/** 详情页头部的状态徽标：令牌失效 > 已暂停 > 未填令牌 > 正常。 */
function siteStatusBadge(provider) {
  var p = provider || {}
  if (p.tokenStatus === 'invalid') return h(Badge, { tone: 'danger', title: p.tokenStatusMessage || '' }, '令牌失效')
  if (p.paused) return h(Badge, { tone: 'warn' }, '已暂停')
  if (!p.hasAdminToken) return h(Badge, null, '未填令牌')
  return h(Badge, { tone: 'ok' }, '正常')
}

/**
 * 站点详情页：props.detail 是 provider id 时由 MonitorView 整页换成它。
 * 写操作只接 lib/write-proxy.js 的 WRITE_RULES 里真实存在的条目；
 * 白名单没有、或插件还没移植表单的，一律 disabled 并说明原因，不造假按钮。
 */
function SiteDetailView(props) {
  var p = props || {}
  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var noticePair = React.useState(null)
  var notice = noticePair[0]
  var setNotice = noticePair[1]

  var snap = pickState(p) || {}
  // 兼容直接把解包后的快照当 state 传进来的宿主
  if (!Array.isArray(snap.providers) && p.state && Array.isArray(p.state.providers)) snap = p.state
  var providers = Array.isArray(snap.providers) ? snap.providers : []
  var offers = Array.isArray(snap.offers) ? snap.offers : []
  var scores = snap.scores && typeof snap.scores === 'object' ? snap.scores : {}
  var settings = snap.settings || {}
  var fx = monitorFx(settings)
  var id = p.id === null || p.id === undefined ? '' : String(p.id)
  var provider = null
  for (var pi = 0; pi < providers.length; pi += 1) {
    if (providers[pi] && String(providers[pi].id) === id) { provider = providers[pi]; break }
  }
  var hasSnapshot = Boolean(p.state && (p.state.state || Array.isArray(p.state.providers)))
  var loading = Boolean(p.loading) && !hasSnapshot
  var failure = p.error || (p.state && p.state.ok === false ? p.state.error : '')

  function back() {
    if (typeof p.closeDetail === 'function') p.closeDetail()
  }

  function reload() {
    if (typeof p.onReload === 'function') p.onReload()
    else if (p.api && typeof p.api.reload === 'function') p.api.reload()
  }

  function head(name, extra) {
    return h('div', { className: 'ma-detail-head' },
      h('button', { type: 'button', className: 'ghost', onClick: back }, '← 站点'),
      h('h2', null, name),
      extra || null)
  }

  function failBar(text) {
    return h('div', { className: 'notice danger' },
      h('span', { className: 'name' }, '读不到站点数据'),
      h('span', { className: 'grow' }),
      h('span', { className: 'desc' }, text || '宿主没有返回站点快照。'),
      h('button', { type: 'button', className: 'ghost tiny', onClick: reload }, '重试'))
  }

  // 三态①：首答之前只给骨架，不能把「加载中」渲染成空态引导
  if (loading) {
    return h('section', { className: 'view wide' },
      head('站点详情'),
      h(Skeleton, { cards: 2, rows: 4 }))
  }
  // 三态②：快照没读到，给错误行 + 重试
  if (!provider) {
    if (!hasSnapshot && failure) {
      return h('section', { className: 'view wide' }, head('站点详情'), failBar(failure))
    }
    return h('section', { className: 'view wide' },
      head('站点详情'),
      h(Empty, {
        title: '找不到这个站点',
        desc: '它可能已经被删除，或者链接里的站点 id 不对。',
        action: h('button', { type: 'button', className: 'primary', onClick: back }, '返回站点列表'),
      }))
  }

  var name = String(provider.name || provider.baseUrl || id)
  var currency = String(provider.currency || 'USD').toUpperCase()
  var views = monitorBuildViews(snap)
  var view = null
  for (var vi = 0; vi < views.length; vi += 1) {
    if (views[vi] && views[vi].provider && String(views[vi].provider.id) === id) { view = views[vi]; break }
  }
  var groups = view && Array.isArray(view.groups) ? view.groups : []
  var priced = view ? view.priced : 0
  var total = view ? view.total : 0
  var credCount = view && Array.isArray(view.credentials) ? view.credentials.length : 0
  var cny = view ? view.cny : monitorCnyOf(provider, fx)
  var providerPath = '/api/providers/' + encodeURIComponent(id)

  function run(key, okText, method, path, payload) {
    if (busy) return
    setBusy(key)
    setNotice(null)
    Promise.resolve().then(function () {
      return writeOp(method, path, payload || {})
    }).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      setNotice({ tone: 'ok', text: okText || '完成' })
      reload()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '失败：' + ((error && error.message) || String(error)) })
    })
  }

  function act(key, label, iconNode, method, path, payload, okText, cls) {
    return h('button', {
      key: key, type: 'button', className: cls || '', disabled: Boolean(busy),
      title: method + ' ' + path,
      onClick: function () { run(key, okText, method, path, payload) },
    }, iconNode, busy === key ? '处理中…' : label)
  }

  function blocked(key, label, iconNode, why) {
    return h('button', {
      key: key, type: 'button', disabled: true,
      title: '当前插件版本未开放：' + why,
    }, iconNode, label)
  }

  function removeSite() {
    if (busy) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' &&
      !window.confirm('删除站点「' + name + '」？它的 Key 和模型列表会一起删掉，这个操作不能撤销。')) return
    setBusy('delete')
    setNotice(null)
    writeOp('DELETE', providerPath).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '删除失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      reload()
      back()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '删除失败：' + ((error && error.message) || String(error)) })
    })
  }

  var statNodes = [
    siteDetailStat('balance', '余额（折人民币）', cny === null ? '—' : monitorMoney(cny),
      cny === null ? '站点没返回余额，先填后台令牌再点「查余额」' : '原始余额 ' + currency + ' ' + monitorMoneyShort(provider.quotaRemaining)),
    siteDetailStat('currency', '币种', currency, '站点自己的记账币种'),
    siteDetailStat('groups', '分组', groups.length + ' 个',
      groups.length ? groups.slice(0, 3).map(function (g) { return g.label }).join('、') : '还没同步模型'),
    siteDetailStat('models', '模型', priced + ' / ' + total, '已定价 / 全部'),
    siteDetailStat('keys', 'Key', credCount + ' 把', '密钥在列表页的「密钥」面板里'),
    siteDetailStat('sync', '最近同步', monitorAgo(provider.quotaUpdatedAt) || '—', '余额与账单的采集时间'),
  ]
  // 快照里目前没有「已用 / 限额」，只有站点真的返回了才显示，不拿 0 冒充
  var usedFee = monitorNum(provider.quotaUsed)
  var limitFee = monitorNum(provider.quotaLimit)
  if (usedFee !== null || limitFee !== null) {
    statNodes.splice(2, 0, siteDetailStat('used', '已用 / 限额',
      (usedFee === null ? '—' : monitorMoneyShort(usedFee)) + ' / ' + (limitFee === null ? '—' : monitorMoneyShort(limitFee)),
      '站点后台原币种：' + currency))
  }

  var mine = offers.filter(function (offer) { return offer && String(offer.providerId) === id })
  var rows = mine.map(function (offer) {
    var score = scores[offer.id] || null
    var group = String(offer.group || '').trim()
    return {
      cells: [
        h('span', { title: String(offer.modelKey || '') }, offer.upstreamName || offer.modelKey || '—'),
        group ? h('span', { className: 'badge' }, group) : h('span', { className: 'hint', style: { margin: 0 } }, '默认'),
        { num: true, node: sitePriceText(offer, offer.inPrice) },
        { num: true, node: offer.priceUnit === 'per_call' ? '按次' : sitePriceText(offer, offer.outPrice) },
        { num: true, node: score ? monitorPct(score.availability) : '—' },
        { num: true, node: score ? monitorPct(score.fingerprintRate) : '—' },
      ],
    }
  })

  var noticeBar = notice ? h('div', { className: 'notice' + (notice.tone === 'warn' ? ' danger' : '') },
    h('span', { className: 'name' }, notice.tone === 'warn' ? '操作失败' : '操作完成'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, notice.text)) : null

  var modelsCard = h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('div', null,
        h('h3', null, '模型清单'),
        h('div', { className: 'meta' }, mine.length + ' 个供给 · 价格是站点自己公布的单位')),
      h('span', { className: 'hint', style: { margin: 0 } }, '可用率 / 指纹来自探针与流量样本')),
    rows.length
      ? h(Table, {
          heads: ['模型', '分组', { label: '输入价', num: true }, { label: '输出价', num: true }, { label: '可用率', num: true }, { label: '指纹', num: true }],
          rows: rows,
          scroll: true,
        })
      : h(Empty, { title: '还没有模型', desc: '点下面的「同步模型」拉一次列表。' }))

  var opsCard = h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('div', null,
        h('h3', null, '站点操作'),
        h('div', { className: 'meta' }, '只开放白名单里的写操作，灰按钮是真的不能点'))),
    h('div', { className: 'prov-actions' },
      act('sync', '同步模型', Icon('refresh', { size: 14 }), 'POST', providerPath + '/sync', {}, '已同步「' + name + '」的模型列表', 'primary'),
      act('balance', '查余额', Icon('wallet', { size: 14 }), 'POST', providerPath + '/balance', {}, '余额已刷新'),
      act('usage', '用量核对', Icon('receipt', { size: 14 }), 'POST', providerPath + '/usage-check', {}, '用量已核对'),
      act('kind', '识别系别', Icon('servers', { size: 14 }), 'POST', providerPath + '/detect-kind', {}, '系别已识别'),
      act(provider.paused ? 'resume' : 'pause', provider.paused ? '恢复站点' : '暂停站点', monitorPauseIcon(14),
        'PATCH', providerPath, { paused: !provider.paused }, provider.paused ? '已恢复' : '已暂停'),
      h('button', {
        key: 'delete', type: 'button', className: 'danger', disabled: Boolean(busy),
        title: 'DELETE ' + providerPath + '：连 Key 与模型列表一起删',
        onClick: removeSite,
      }, Icon('trash', { size: 14 }), busy === 'delete' ? '删除中…' : '删除站点'),
      blocked('login', '账号登录', monitorLoginIcon(14), '要站点后台账号密码，插件侧还没移植登录表单'),
      blocked('export', '导出配置', monitorDownloadIcon(14), '宿主白名单没有导出接口，先备份 daemon 的 data 目录')),
    h('div', { className: 'hint' },
      '同步模型 POST /api/providers/:id/sync · 查余额 /balance · 用量核对 /usage-check · 识别系别 /detect-kind · 暂停 PATCH /api/providers/:id · 删除 DELETE /api/providers/:id'))

  return h('section', { className: 'view wide' },
    head(name, siteStatusBadge(provider)),
    h('div', { className: 'hint', style: { margin: '0 0 14px' } },
      '站点 id：' + id + (provider.baseUrl ? ' · ' + provider.baseUrl : '')),
    noticeBar,
    h('div', { className: 'stats' }, statNodes),
    modelsCard,
    opsCard)
}
