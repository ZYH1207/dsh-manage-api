// ── 概览（1:1 移植网页版 renderOverview：headline → stats → 需要关注 → 站点速览）──
// 说明：网页版还有「运行状态 / 今日用量」两块只在当前插件里出现过，为了和网页版一致已移除；
// 守护进程状态改由顶栏状态 pill 承载，用量详见「用量」页。

// ── 面板忽略名单的公共工具（其余 part 合并进同一作用域后可直接用）──────────────
// daemon ≥0.3.1 才有 settings.panelIgnoredModels（面板自己的忽略名单，不参与路由）；
// 老 daemon 没有这个字段，退回 settings.ignoredModels，保持「点忽略就能藏起来」的旧行为，
// 免得用户升级插件没升级 daemon 时遇到一个点了没反应的按钮。
function panelIgnoreList(settings) {
  var s = settings || {}
  if (Array.isArray(s.panelIgnoredModels)) return s.panelIgnoredModels
  return Array.isArray(s.ignoredModels) ? s.ignoredModels : []
}

/** 写面板忽略名单的补丁体：新 daemon 写 panelIgnoredModels，老 daemon 只能写 ignoredModels。 */
function panelIgnorePayload(settings, list) {
  var s = settings || {}
  if (Array.isArray(s.panelIgnoredModels)) return { panelIgnoredModels: list }
  return { ignoredModels: list }
}

function overviewIssueScore(score, entry) {
  entry.count += 1
  if (score.status === 'unstable') entry.severe = true
  if (score.stale) entry.reasons['评分过期'] = 1
  if (typeof score.availability === 'number' && score.availability < 0.8) entry.reasons['可用率低'] = 1
  if (typeof score.fingerprintRate === 'number' && score.fingerprintRate < 1) entry.reasons['指纹不符'] = 1
  if (typeof score.truncationRate === 'number' && score.truncationRate < 1) entry.reasons['输出截断'] = 1
  if (typeof score.billingRate === 'number' && score.billingRate < 1) entry.reasons['用量虚报'] = 1
  return entry
}

function OverviewHeadline(props) {
  var line = props.headline
  if (!line) return null
  return h(
    'div',
    { className: 'headline' },
    h(
      'div',
      { className: 'line' },
      '同样用 ',
      line.modelKey,
      '，现在选「',
      h('strong', null, line.providerName),
      '」最划算：',
      h('strong', null, fmtMoney(line.price) + '/百万 token'),
      '，比最贵的站省 ',
      h('strong', null, line.spreadPct),
      '%',
    ),
  )
}

/** 总金额：所有站点余额折成人民币求和（外币站按当前汇率），与站点页余额图同口径。 */
function overviewBalanceCny(providers, fx) {
  var total = 0
  var counted = 0
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i] || {}
    if (typeof monitorNum !== 'function') break
    var q = monitorNum(p.quotaRemaining)
    if (q === null) continue
    var isUsd = String(p.currency || 'CNY').toUpperCase() === 'USD'
    total += isUsd ? q * fx : q
    counted += 1
  }
  return counted > 0 ? Math.round(total * 100) / 100 : null
}

/**
 * 真实花费卡（自站点页移入概览）：只认站点账单口径（siteSpend），
 * 时间段按钮只改本地状态、不重新拉数据。数据由 OverviewView 统一拉取后传入。
 */
function OverviewSpendCard(props) {
  var settings = props.settings || {}
  var data = props.data || null
  var rangePair = React.useState('today')
  var range = rangePair[0]
  var setRange = rangePair[1]
  if (data === null) {
    return monitorKpiCard('ov-spend', {
      k: [h('span', { key: 'k-em', className: 'k-em' }, '真实花费'), ' · 今天'],
      v: h('b', { key: 'amount', className: 'spend-actual spend-muted' }, '读取中…'),
      sub: '正在读站点账单',
      ic: 'receipt',
      tint: 'tint-warn',
      hint: '站点账单接口读到的真实扣费 | 按「默认充值汇率」换算成人民币 | 读不到账单时先检查站点令牌',
    })
  }
  return monitorKpiCard('ov-spend', monitorSpendKpi(data, settings, range, setRange))
}

function OverviewStats(props) {
  var s = props.summary || {}
  var providers = Array.isArray(props.providers) ? props.providers : []
  var settings = props.settings || {}
  var fx = typeof monitorFx === 'function' ? monitorFx(settings) : 7.2
  var totalCny = overviewBalanceCny(providers, fx)
  // 顺序固定（用户 2026-11-02 指定）：站点 → 总金额 → 真实花费 → 模型供给 → 可横向比较
  return h(
    'div',
    { className: 'stats' },
    monitorKpiCard('ov-sites', {
      k: '站点',
      // summary.providerCount 是「有付费供给的站」（比价汇总口径），会和站点页的
      // 全量站点数对不上——这里一律用全部站点数（providers.length）。
      v: providers.length,
      sub: '',
      ic: 'servers',
      tint: 'tint-muted',
      hint: '站点总数（含只有免费模型的站）',
    }),
    monitorKpiCard('ov-balance', {
      k: '总金额',
      v: totalCny === null ? '—' : monitorPriceText(totalCny),
      sub: totalCny === null ? '还没有余额数据' : '≈ $' + monitorMoneyShort(totalCny / fx) + '（按汇率折算）',
      ic: 'wallet',
      tint: 'tint-accent',
      hint: '所有站点余额折成人民币后求和（外币站按当前汇率）',
    }),
    h(OverviewSpendCard, { settings: settings, data: props.spendData }),
    monitorKpiCard('ov-offers', {
      k: '模型供给',
      v: s.offerCount === undefined ? props.offerCount : s.offerCount,
      sub: '',
      ic: 'layers',
      tint: 'tint-accent',
      hint: '在役模型供给条数',
    }),
    monitorKpiCard('ov-comparable', {
      k: '可横向比较',
      v: s.comparableCount === undefined ? '—' : s.comparableCount,
      sub: '个模型',
      ic: 'columns',
      tint: 'tint-muted',
      hint: '有两个及以上站点在卖、能直接比价的模型数',
    }),
  )
}

function OverviewIssues(props) {
  var issues = props.issues || []
  var openPair = React.useState(false)
  var open = openPair[0]
  var setOpen = openPair[1]
  var PREVIEW = 4
  var hidden = open ? 0 : Math.max(0, issues.length - PREVIEW)
  var list = open ? issues : issues.slice(0, PREVIEW)

  var head =
    issues.length === 0
      ? h('h3', { className: 'section-title' }, h('span', { className: 's-icon' }, Icon('alert', { size: 14 })), '需要关注')
      : h(
          'h3',
          { className: 'section-title' },
          h('span', { className: 's-icon' }, Icon('alert', { size: 14 })),
          '需要关注（' + issues.length + ' 个站点）',
        )

  var rows =
    issues.length === 0
      ? [
          h(
            'div',
            { key: 'calm', className: 'notice calm' },
            h('span', { className: 'name' }, '一切正常'),
            h('span', { className: 'grow' }),
            h('span', { className: 'desc' }, '所有探测过的供给都在正常范围'),
          ),
        ]
      : list.map(function (issue, i) {
          return h(
            'div',
            { key: 'iss' + i, className: 'notice' + (issue.severe ? ' danger' : '') },
            h('span', { className: 'name' }, issue.name),
            h('span', { className: 'desc' }, issue.count + ' 个模型'),
            h('span', { className: 'grow' }),
            h('span', { className: 'desc' }, issue.reasonText),
          )
        })

  if (hidden > 0 || (open && issues.length > PREVIEW)) {
    rows.push(
      h(
        'button',
        {
          key: 'more',
          type: 'button',
          className: 'notice-more',
          onClick: function () {
            setOpen(!open)
          },
        },
        hidden > 0 ? '还有 ' + hidden + ' 个站点，展开全部' : '收起',
      ),
    )
  }

  return h('div', null, head, h('div', { className: 'notice-list' }, rows))
}

function OverviewView(props) {
  var state = pickState(props)
  var providers = state.providers || []
  var offers = state.offers || []
  var scores = state.scores || {}
  var creds = state.credentials || []
  var ranking = state.siteRanking || []
  var routing = state.routing || []

  // 余额概览 / 真实花费的数据源：概览页自己拉一次 GET /api/monitor（与站点页同接口）。
  // 「刷新」后 state.settings 是新对象 → effect 依赖变化 → 自动重拉。
  var daysPair = React.useState(7)
  var chartDays = daysPair[0]
  var setChartDays = daysPair[1]
  var chartSitePair = React.useState('ALL')
  var chartSite = chartSitePair[0]
  var setChartSite = chartSitePair[1]
  var monitorPair = React.useState(null)
  var monitorData = monitorPair[0]
  var setMonitorData = monitorPair[1]
  React.useEffect(
    function () {
      var alive = true
      fetchJson('monitor?days=' + chartDays).then(function (res) {
        if (!alive) return
        var body = res && res.body
        if (res && res.ok && body && body.data) setMonitorData(body.data)
        else setMonitorData({})
      })
      return function () { alive = false }
    },
    [chartDays, state.settings],
  )

  // 探针判定有问题的供给——按站点聚合，避免同一个站刷屏
  var issueMap = {}
  Object.keys(scores).forEach(function (offerId) {
    var score = scores[offerId] || {}
    if (['degraded', 'unstable', 'stale'].indexOf(score.status) < 0) return
    var offer = null
    for (var i = 0; i < offers.length; i += 1) {
      if (offers[i].id === offerId) {
        offer = offers[i]
        break
      }
    }
    if (!offer) return
    var provider = null
    for (var j = 0; j < providers.length; j += 1) {
      if (providers[j].id === offer.providerId) {
        provider = providers[j]
        break
      }
    }
    if (!provider) return
    var entry = issueMap[provider.id] || { name: provider.name, count: 0, reasons: {}, severe: false }
    overviewIssueScore(score, entry)
    issueMap[provider.id] = entry
  })
  var issues = []
  Object.keys(issueMap).forEach(function (id) {
    var entry = issueMap[id]
    entry.reasonText = Object.keys(entry.reasons).join(' · ')
    issues.push(entry)
  })

  // 加载中 ≠ 没有站点：首答之前只给骨架，避免「从添加一个中转站开始」误导用户。
  var loading = (props && props.loading) || (props && props.api && props.api.loading)
  if (loading && providers.length === 0) {
    return h('div', null, h(Skeleton, { cards: 2, rows: 4 }))
  }

  if (providers.length === 0) {
    return h(
      'div',
      null,
      h(OverviewHeadline, { headline: state.headline }),
      h(Empty, {
        title: '从添加一个中转站开始',
        desc: '填上地址和一个 Key，同步模型列表，就能看到跨站比价。',
        action: h(
          'button',
          {
            type: 'button',
            className: 'primary',
            onClick: function () {
              if (props.onGoTab) props.onGoTab('monitor')
            },
          },
          Icon('plus', { size: 14 }),
          '新增站点',
        ),
      }),
    )
  }

  var rankingMap = {}
  ranking.forEach(function (row) {
    rankingMap[row.providerId] = row
  })

  var ordered = providers.slice().sort(function (a, b) {
    var ra = rankingMap[a.id] ? rankingMap[a.id].score : -1
    var rb = rankingMap[b.id] ? rankingMap[b.id].score : -1
    return (rb === null || rb === undefined ? -1 : rb) - (ra === null || ra === undefined ? -1 : ra)
  })

  var siteRows = ordered.map(function (provider) {
    var mine = offers.filter(function (offer) {
      return offer.providerId === provider.id
    })
    var healthy = mine.filter(function (offer) {
      return scores[offer.id] && scores[offer.id].routable
    }).length
    var hasQuota = typeof provider.quotaRemaining === 'number'
    var rank = rankingMap[provider.id]
    var issue = issueMap[provider.id]
    var dotClass = issue ? (issue.severe ? 'red' : 'yellow') : rank ? 'green' : 'gray'
    var sym = (provider.currency || 'CNY') === 'USD' ? '$' : '¥'

    var scoreCell = rank
      ? h(
          'div',
          null,
          h(
            'div',
            { className: 'score-wrap' },
            h('b', null, rank.score),
            h(
              'div',
              { className: 'score-bar' },
              h('i', {
                className: rank.score >= 80 ? 'good' : rank.score >= 60 ? 'mid' : 'bad',
                style: { width: Math.min(rank.score, 100) + '%' },
              }),
            ),
          ),
          h(
            'div',
            { className: 'sub' },
            '可用 ' +
              Math.round((rank.uptime || 0) * 100) +
              '%' +
              (rank.avgQuality === null || rank.avgQuality === undefined ? '' : ' · 质量 ' + Number(rank.avgQuality).toFixed(2)) +
              (rank.avgTtft ? ' · ' + rank.avgTtft + 'ms' : '') +
              (rank.probes ? ' · ' + rank.probes + ' 次' : ''),
          ),
        )
      : h('span', { style: { color: 'var(--faint)' } }, '未探测')

    return {
      cells: [
        h('span', null, h('span', { className: 'dot ' + dotClass }), provider.name),
        { num: true, node: scoreCell },
        { num: true, node: mine.length },
        { num: true, node: healthy ? h(Badge, { tone: 'ok' }, healthy) : h(Badge, null, 0) },
        {
          num: true,
          node: hasQuota
            ? h('span', null, sym + fmtMoney(provider.quotaRemaining))
            : h('span', { style: { color: 'var(--faint)' } }, '未录入'),
        },
        {
          num: true,
          node: creds.filter(function (cred) {
            return cred.providerId === provider.id
          }).length,
        },
      ],
    }
  })

  var summary = state.summary || {}

  return h(
    'div',
    null,
    h(OverviewHeadline, { headline: state.headline }),
    h(OverviewStats, {
      summary: summary,
      providerCount: providers.length,
      offerCount: offers.length,
      providers: providers,
      settings: state.settings || {},
      spendData: monitorData,
    }),
    h('div', { className: 'monitor-cols monitor-cols--overview' },
      h(MonitorChartCard, {
        data: monitorData || {},
        days: chartDays,
        onDays: function (next) { setChartDays(next) },
        selected: chartSite,
        onSelect: function (next) { setChartSite(next) },
        settings: state.settings || {},
      }),
      h(MonitorFlowCard, { routing: routing })),
    h(OverviewIssues, { issues: issues }),
    h(
      'h3',
      { className: 'section-title' },
      h('span', { className: 's-icon' }, Icon('table', { size: 14 })),
      '站点速览',
      h(
        'a',
        {
          className: 'link',
          onClick: function () {
            if (props.onGoTab) props.onGoTab('monitor')
          },
        },
        '全部站点 →',
      ),
    ),
    h(Table, {
      heads: ['站点', { label: '长期评分', num: true }, { label: '模型', num: true }, { label: '健康供给', num: true }, { label: '余额', num: true }, { label: 'Key', num: true }],
      rows: siteRows,
    }),
  )
}

// 兼容旧名字（scripts/check.mjs 里仍按 OverviewTab 冒烟）

function OverviewTab(props) {
  return OverviewView(props)
}
