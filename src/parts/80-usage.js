// ── 用量页：移植 web/app.js renderUsage()（2628-2749）─────────────────
// 数据只有快照里的 30 天（state.usage）。网页版 7/90 天走 GET /api/usage?days=N，
// 宿主没有这条代理路由 → 那两个按钮禁用并在 title 里说明。

var USAGE_RANGE_TITLE = '宿主只代理了 GET state（含最近 30 天），没有 /api/usage 路由：7 / 90 天切换不可用'

function usageFormatTokens(value) {
  var n = Number(value) || 0
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

function usageTokenTotal(row) {
  if (!row) return 0
  return (Number(row.input) || 0) + (Number(row.output) || 0)
}

/** byKey / byModel / byProvider 都是 map → 按 token 总量降序的条目数组。 */
function usageSortedEntries(map) {
  var entries = []
  Object.keys(map || {}).forEach(function (key) {
    entries.push([key, map[key] || {}])
  })
  entries.sort(function (a, b) {
    return usageTokenTotal(b[1]) - usageTokenTotal(a[1])
  })
  return entries
}

function usageEmptyRow(cols) {
  return h(
    'tr',
    null,
    h('td', { colSpan: cols, style: { textAlign: 'center', color: 'var(--faint)', padding: '20px' } }, '无数据'),
  )
}

function usageTable(heads, rows, emptyCols) {
  return h(
    'div',
    { className: 'table-wrap' },
    h(
      'table',
      null,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          heads.map(function (head, index) {
            return h('th', { key: 'h' + index, className: head.num ? 'num' : undefined, title: head.title }, head.label)
          }),
        ),
      ),
      h('tbody', null, rows.length ? rows : usageEmptyRow(emptyCols || heads.length)),
    ),
  )
}

function UsageBars(props) {
  var entries = props.entries || []
  var maxTokens = props.maxTokens
  var showLabels = props.showLabels
  return h(
    'div',
    { className: 'card', style: { padding: '14px 16px 10px' } },
    h(
      'div',
      { className: 'bars' },
      entries.map(function (entry, index) {
        var day = entry[0]
        var row = entry[1]
        var total = usageTokenTotal(row)
        var height = total ? Math.max(Math.round((total / maxTokens) * 100), 3) : 1
        var label = showLabels || index % 5 === 0 || index === entries.length - 1 ? String(day).slice(5) : ''
        return h(
          'div',
          {
            key: day,
            className: 'bar-item' + (total ? '' : ' zero'),
            title: day + ' · ' + total + ' token · ' + (row.requests || 0) + ' 次请求',
          },
          h('div', { className: 'bar', style: { height: height + '%' } }),
          h('span', { className: 'bar-label' }, label),
        )
      }),
    ),
    h('div', { className: 'hint', style: { marginTop: '8px' } }, '柱高按 token 总量，悬停看当天明细。'),
  )
}

function UsageView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var usage = state.usage || {}
  var totals = usage.totals || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var gatewayKeys = state.gateway && Array.isArray(state.gateway.keys) ? state.gateway.keys : []

  var rangePair = React.useState(30)
  var range = rangePair[0]
  var setRange = rangePair[1]

  var dayEntries = React.useMemo(
    function () {
      return Object.keys(usage.byDay || {})
        .sort(function (a, b) {
          return String(a).localeCompare(String(b))
        })
        .map(function (day) {
          return [day, usage.byDay[day] || {}]
        })
    },
    [usage],
  )

  var maxTokens = React.useMemo(
    function () {
      var max = 1
      dayEntries.forEach(function (entry) {
        var total = usageTokenTotal(entry[1])
        if (total > max) max = total
      })
      return max
    },
    [dayEntries],
  )

  var providerNames = React.useMemo(
    function () {
      var map = {}
      providers.forEach(function (provider) {
        map[provider.id] = provider.name || provider.id
      })
      return map
    },
    [providers],
  )

  var keyNames = React.useMemo(
    function () {
      var map = {}
      gatewayKeys.forEach(function (key) {
        map[key.id] = key.name || key.id
      })
      return map
    },
    [gatewayKeys],
  )

  var keyRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byKey).map(function (entry) {
        var keyId = entry[0]
        var row = entry[1]
        var name = keyNames[keyId] || (keyId === '-' ? '（未认证）' : keyId)
        return h(
          'tr',
          { key: 'k' + keyId },
          h('td', null, name),
          h('td', { className: 'num' }, row.requests || 0),
          h('td', { className: 'num' }, usageFormatTokens(row.input)),
          h('td', { className: 'num' }, usageFormatTokens(row.output)),
          h('td', { className: 'num' }, row.avgTtftMs ? row.avgTtftMs + 'ms' : '—'),
        )
      })
    },
    [usage, keyNames],
  )

  var modelRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byModel)
        .slice(0, 15)
        .map(function (entry) {
          var model = entry[0]
          var row = entry[1]
          return h(
            'tr',
            { key: 'm' + model },
            h('td', { className: 'mono' }, model),
            h('td', { className: 'num' }, row.requests || 0),
            h('td', { className: 'num' }, usageFormatTokens(row.input)),
            h('td', { className: 'num' }, usageFormatTokens(row.output)),
            h('td', { className: 'num' }, row.avgTtftMs ? row.avgTtftMs + 'ms' : '—'),
          )
        })
    },
    [usage],
  )

  var providerRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byProvider).map(function (entry) {
        var providerId = entry[0]
        var row = entry[1]
        var name = providerNames[providerId] || (providerId === '-' ? '（未成功）' : providerId)
        return h(
          'tr',
          { key: 'p' + providerId },
          h('td', null, name),
          h('td', { className: 'num' }, row.requests || 0),
          h('td', { className: 'num' }, usageFormatTokens(row.input)),
          h('td', { className: 'num' }, usageFormatTokens(row.output)),
          h('td', { className: 'num' }, row.avgLatencyMs ? row.avgLatencyMs + 'ms' : '—'),
        )
      })
    },
    [usage, providerNames],
  )

  if (!totals.requests) {
    return h(
      'section',
      { className: 'view' },
      h(
        'div',
        { className: 'empty' },
        h('h3', null, '暂无用量数据'),
        h('p', null, '在客户端里把 Base URL 指向网关、填上 Key 之后，这里会开始记录。'),
        h(
          'button',
          { className: 'primary', type: 'button', disabled: true, title: '插件面板不支持跨页跳转，请用左侧「网关」页' },
          '去配置网关',
        ),
      ),
    )
  }

  var days = range === 7 || range === 90 ? range : 30
  var seg = h(
    'div',
    { className: 'seg' },
    [7, 30, 90].map(function (value) {
      var unavailable = value !== 30
      return h(
        'button',
        {
          key: 'r' + value,
          type: 'button',
          className: value === days ? 'active' : '',
          disabled: unavailable,
          title: unavailable ? USAGE_RANGE_TITLE : '快照自带的统计窗口就是 30 天',
          onClick: function () {
            setRange(value)
          },
        },
        value + ' 天',
      )
    }),
  )

  return h(
    'section',
    { className: 'view' },
    seg,
    h(
      'p',
      { className: 'hint', style: { marginTop: '10px' } },
      '最近 ' + days + ' 天 · ' + (totals.requests || 0) + ' 次请求 · ' + usageFormatTokens(usageTokenTotal(totals)) + ' token',
    ),
    h(
      'div',
      { className: 'stats', style: { marginTop: '16px' } },
      h('div', { className: 'stat' }, h('div', { className: 'k' }, '请求数'), h('div', { className: 'v' }, totals.requests)),
      h(
        'div',
        { className: 'stat' },
        h('div', { className: 'k' }, '输入 token'),
        h('div', { className: 'v' }, usageFormatTokens(totals.input)),
      ),
      h(
        'div',
        { className: 'stat' },
        h('div', { className: 'k' }, '输出 token'),
        h('div', { className: 'v' }, usageFormatTokens(totals.output)),
      ),
      h('div', { className: 'stat' }, h('div', { className: 'k' }, '错误'), h('div', { className: 'v' }, totals.errors || 0)),
    ),
    h('h3', { className: 'section-title' }, '按天'),
    h(UsageBars, { entries: dayEntries, maxTokens: maxTokens, showLabels: dayEntries.length <= 10 }),
    h('h3', { className: 'section-title' }, '按 Key'),
    usageTable(
      [
        { label: 'Key' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均首字', num: true },
      ],
      keyRows,
      5,
    ),
    h('h3', { className: 'section-title' }, '按模型'),
    usageTable(
      [
        { label: '模型' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均首字', num: true },
      ],
      modelRows,
      5,
    ),
    h('h3', { className: 'section-title' }, '按站点'),
    usageTable(
      [
        { label: '站点' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均耗时', num: true },
      ],
      providerRows,
      5,
    ),
  )
}
