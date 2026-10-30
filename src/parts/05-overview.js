// ── 概览（1:1 移植网页版 renderOverview：headline → stats → 需要关注 → 站点速览）──
// 说明：网页版还有「运行状态 / 今日用量」两块只在当前插件里出现过，为了和网页版一致已移除；
// 守护进程状态改由顶栏状态 pill 承载，用量详见「用量」页。

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

function OverviewStats(props) {
  var s = props.summary || {}
  var items = [
    { k: '站点', v: s.providerCount === undefined ? props.providerCount : s.providerCount, unit: '', icon: 'servers', tone: 'tint-muted' },
    { k: '模型供给', v: s.offerCount === undefined ? props.offerCount : s.offerCount, unit: '条', icon: 'layers', tone: 'tint-accent' },
    { k: '可横向比较', v: s.comparableCount === undefined ? '—' : s.comparableCount, unit: '个模型', icon: 'columns', tone: 'tint-muted' },
    { k: '最大价差', v: s.maxSpreadPct === null || s.maxSpreadPct === undefined ? '—' : s.maxSpreadPct, unit: s.maxSpreadPct === null || s.maxSpreadPct === undefined ? '' : '%', icon: 'trend', tone: 'tint-warn' },
  ]
  return h(
    'div',
    { className: 'stats' },
    items.map(function (item, i) {
      return h(
        'div',
        { key: 'st' + i, className: 'stat' },
        h(
          'div',
          { className: 'stat-main' },
          h('div', { className: 'k' }, item.k),
          h('div', { className: 'v' }, item.v, item.unit ? h('small', null, item.unit) : null),
        ),
        h('div', { className: 'stat-icon ' + item.tone }, Icon(item.icon, { size: 18 })),
      )
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
    h(OverviewStats, { summary: summary, providerCount: providers.length, offerCount: offers.length }),
    h(OverviewIssues, { issues: issues }),
    h(AutoDshCard, { state: props.state, api: props.api }),
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

/**
 * 「自动 DSH」卡片：把 ManageAPI 的模型接进 DSH 自己的 provider 列表 + 设为默认模型。
 *
 * 数据来源两处：
 *   - 可选模型 = `state.modelIndex` 去掉 `state.settings.ignoredModels`（与比价页同一口径）
 *   - DSH 侧现状 = `GET /api/manage-api/dsh-model`（由 host 半边读 configEditor + agentDefaultModel）
 *
 * 选择即保存（单选 + 持久化）：选中后 POST 同一个端点，host 侧幂等追加到
 * `providers['manage-api'].models` 并调用 `agentDefaultModel.saveSelection()`。
 */
function autoDshModelRows(state) {
  var raw = state || {}
  var snapshot = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
  var index = Array.isArray(snapshot.modelIndex) ? snapshot.modelIndex : []
  var settings = snapshot.settings || {}
  var ignored = Array.isArray(settings.ignoredModels) ? settings.ignoredModels : []
  var ignoredSet = {}
  for (var i = 0; i < ignored.length; i++) ignoredSet[ignored[i]] = true
  var seen = {}
  var rows = []
  for (var j = 0; j < index.length; j++) {
    var item = index[j]
    if (!item) continue
    var name = typeof item === 'string' ? item : item.name
    if (!name || ignoredSet[name] || seen[name]) continue
    seen[name] = true
    rows.push({ name: name, sites: typeof item === 'object' && item.sites != null ? Number(item.sites) || 0 : 0 })
  }
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
  return rows
}

function AutoDshCard(props) {
  var api = (props && props.api) || {}
  var models = autoDshModelRows(props && props.state)
  var busyState = React.useState('')
  var busy = busyState[0]
  var setBusy = busyState[1]
  var msgState = React.useState('')
  var msg = msgState[0]
  var setMsg = msgState[1]
  var infoState = React.useState(null)
  var info = infoState[0]
  var setInfo = infoState[1]

  React.useEffect(function () {
    fetchJson('dsh-model').then(function (r) {
      if (r && r.ok && r.body && r.body.dsh) setInfo(r.body.dsh)
      else if (r && r.body && r.body.error) setMsg(String(r.body.error))
    })
  }, [])

  function save(model) {
    if (!model || busy) return
    setBusy(model)
    setMsg('')
    fetchJson('dsh-model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model }),
    }).then(function (r) {
      setBusy('')
      var body = (r && r.body) || {}
      if (r && r.ok && body.ok) {
        setMsg('已接入 DSH：' + model + '（已加入 provider 模型列表并设为默认）')
        if (body.state) setInfo(body.state)
        if (typeof api.reload === 'function') api.reload()
      } else {
        setMsg('接入失败：' + String(body.error || (r && r.text) || '未知错误'))
      }
    })
  }

  var current = (info && info.selection && info.selection.provider === (info && info.provider) && info.selection.model) || ''
  var registered = {}
  if (info && Array.isArray(info.models)) {
    for (var k = 0; k < info.models.length; k++) {
      var entry = info.models[k]
      if (entry && entry.id) registered[entry.id] = true
    }
  }
  var configurable = !info || info.configurable !== false

  var body
  if (!models.length) {
    body = h(
      'div',
      { className: 'empty' },
      '没有可选的模型',
      h('span', { className: 'hint' }, '所有模型都在忽略名单里。到「比价」页 →「忽略模型」取消几个再回来。'),
    )
  } else {
    var rows = []
    for (var m = 0; m < models.length; m++) {
      var item = models[m]
      var isCurrent = current === item.name
      rows.push(
        h(
          'label',
          {
            key: item.name,
            className: 'ig-row auto-dsh-row' + (isCurrent ? ' is-current' : ''),
            onClick: function (name) { return function () { save(name) } }(item.name),
          },
          h('input', {
            type: 'radio',
            name: 'auto-dsh-model',
            checked: isCurrent,
            disabled: busy != '' || !configurable,
            onChange: function (name) { return function () { save(name) } }(item.name),
          }),
          h('span', { className: 'mono' }, item.name),
          h('span', { className: 'hint' }, item.sites ? item.sites + ' 个站' : '已不在榜单里'),
          registered[item.name] ? h(Badge, { tone: 'ok' }, '已在 DSH') : null,
          busy === item.name ? h('span', { className: 'hint' }, '接入中…') : null,
        ),
      )
    }
    body = h(
      'div',
      { className: 'ig-list auto-dsh-list' },
      h('div', { className: 'hint' }, '选中的模型会写进 DSH 的 manage-api provider 模型列表，并成为 DSH 默认模型（单选，立即保存）。'),
      rows,
    )
  }

  return h(
    'div',
    { className: 'card auto-dsh-card' },
    h(
      'div',
      { className: 'card-head' },
      h(
        'div',
        null,
        h('h3', null, '自动 DSH'),
        h('p', { className: 'desc' }, '把 ManageAPI 的模型接进 DSH：加入 provider 模型列表 + 设为默认模型，不用改配置文件。'),
      ),
      h('div', { className: 'card-actions' }, h(Badge, null, models.length + ' 个未忽略模型')),
    ),
    body,
    msg ? h('p', { className: 'hint ok-line' }, msg) : null,
    configurable ? null : h('p', { className: 'hint' }, '当前 DSH 版本不允许插件修改配置（configEditor 不可用），请在 profile 的 cordis.patch.yml 里手动添加模型。'),
  )
}

// 兼容旧名字（scripts/check.mjs 里仍按 OverviewTab 冒烟）
function OverviewTab(props) {
  return OverviewView(props)
}
