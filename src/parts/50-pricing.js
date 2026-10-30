// ── 比价页：移植 web/app.js renderPricing()（1749-1914）───────────────
// 12 列宽表：站点（左吸附）｜上游模型名｜缓存｜分组｜模式｜输入价｜输出价｜
// 币种/单位｜倍率｜首字｜综合成本（右吸附）｜价差（右吸附）。
// 网页版的价格写入走 PATCH /api/offers/:id，宿主白名单没有它 —— 所有可编辑
// 控件都保留原位（1:1 结构），但设为只读/禁用并在 title 里说明原因。

function pricingFx(settings) {
  var s = settings || {}
  var fromFx = Number(s.fx && s.fx.rates ? s.fx.rates.CNY : null)
  if (isFinite(fromFx) && fromFx > 0) return fromFx
  var legacy = Number(s.fxUsdCny)
  return isFinite(legacy) && legacy > 0 ? legacy : 7.2
}

function pricingShowUsd(settings) {
  return Boolean(settings && settings.displayCurrency === 'USD')
}

function pricingSym(settings) {
  return pricingShowUsd(settings) ? '$' : '¥'
}

/** 与网页版 money() 同口径：≥100 取整、≥1 两位、其余三位。 */
function pricingMoney(value) {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  var n = Number(value)
  if (n >= 100) return n.toFixed(0)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

function pricingPriceText(cny, settings) {
  if (cny === null || cny === undefined || !isFinite(cny)) return '—'
  var v = pricingShowUsd(settings) ? Number(cny) / pricingFx(settings) : Number(cny)
  return pricingSym(settings) + pricingMoney(v)
}

/** 「站点 × 分组」→ 胶囊色。网页版还叠了厂商色，插件没有 vendorChipClass，
 *  只保留能自证的「整组免费」判定，其余走中性 badge。 */
function pricingGroupFreeMap(offers) {
  var map = {}
  ;(offers || []).forEach(function (offer) {
    var key = String(offer.providerId) + '\u0000' + String(offer.group || '')
    var free =
      offer.pricingMode === 'manual'
        ? Number(offer.inPrice) === 0 && Number(offer.outPrice) === 0
        : Number(offer.ratio) === 0
    if (map[key] === undefined) map[key] = free
    else map[key] = map[key] && free
  })
  return map
}

function pricingGroupChipClass(freeMap, providerId, group) {
  var key = String(providerId) + '\u0000' + String(group || '')
  return freeMap[key] ? 'vchip-free' : ''
}

function pricingNumberValue(value) {
  return value === null || value === undefined ? '' : value
}

function pricingUnitBadge(row) {
  var label = row.perCall ? '/次' : row.priceUnit === 'per_1k' ? '/1k' : '/M'
  return h(
    'span',
    {
      className: 'badge unit-badge',
      title: '计费单位：由站点声明的计费形式识别而来；手动修改请到「站点」页的模型行',
    },
    label,
  )
}

/** 综合成本列：按次行显示 /次，按 token 行显示 /百万 token，并带空闲价副行。 */
function pricingCostCell(row, settings) {
  if (row.perCall) {
    var perCall = row.callPriceCny === null || row.callPriceCny === undefined ? '—' : pricingSym(settings) + pricingMoney(row.callPriceCny)
    return h('div', null, perCall, h('span', { className: 'sub' }, '/次'))
  }
  var head = pricingPriceText(row.blendedCnyPerMtok, settings)
  var offPeak =
    row.hasOffPeak && row.offPeakBlendedCnyPerMtok !== null && row.offPeakBlendedCnyPerMtok !== undefined
      ? h('div', { className: 'sub' }, '空闲 ', pricingPriceText(row.offPeakBlendedCnyPerMtok, settings))
      : null
  return h('div', null, head, offPeak)
}

function pricingBadges(row, score, settings) {
  var out = []
  var maxTtft = Number(settings && settings.maxTtftMs) || 0
  var tooSlow = maxTtft > 0 && score && typeof score.ttftMs === 'number' && score.ttftMs > maxTtft
  if (tooSlow) out.push(h(Badge, { key: 'slow', tone: 'warn' }, '超时'))
  else if (score && score.probeTrusted === false) out.push(h(Badge, { key: 'trust', tone: 'warn' }, '可疑'))
  if (row.perCall) out.push(h(Badge, { key: 'call' }, '按次'))
  return out
}

var PRICING_READONLY_TITLE = '宿主写通道未开放改价（PATCH /api/offers/:id 不在白名单）：这里只读，改价请到 daemon 网页版'

function pricingRowElement(row, ctx) {
  var settings = ctx.settings
  var score = ctx.scores[row.offerId]
  var mode = row.pricingMode === 'ratio' ? 'ratio' : 'manual'
  var cacheCell =
    row.cacheHitRate === null || row.cacheHitRate === undefined ? '—' : Math.round(row.cacheHitRate * 100) + '%'
  var groupCell = row.group
    ? h(
        'span',
        { className: 'badge ' + pricingGroupChipClass(ctx.freeMap, row.providerId, row.group), title: row.group },
        row.group,
      )
    : h('span', { style: { color: 'var(--faint)' }, title: '该行的 Key 没有分组' }, '默认')

  return h(
    'tr',
    { key: row.offerId, className: row.isCheapest ? 'cheapest' : undefined },
    h('td', null, ctx.nameMap[row.providerId] || '未知站'),
    h('td', { className: 'mono' }, row.upstreamName, pricingBadges(row, score, settings)),
    h('td', { className: 'num sub-cell' }, cacheCell),
    h(
      'td',
      null,
      h(
        'span',
        { className: 'group-chip-cell' },
        groupCell,
        h(
          'button',
          {
            type: 'button',
            className: 'ghost tiny',
            disabled: true,
            title: '宿主写通道未开放复制供给（POST /api/offers），此操作不可用',
          },
          '＋',
        ),
      ),
    ),
    h(
      'td',
      null,
      h(
        'div',
        { className: 'seg-mini' },
        h(
          'button',
          {
            type: 'button',
            className: mode === 'ratio' ? 'is-on' : '',
            disabled: true,
            title: '宿主写通道未开放切换计价模式（PATCH /api/offers/:id）',
          },
          '倍率',
        ),
        h(
          'button',
          {
            type: 'button',
            className: mode === 'manual' ? 'is-on' : '',
            disabled: true,
            title: '宿主写通道未开放切换计价模式（PATCH /api/offers/:id）',
          },
          '价格',
        ),
      ),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        type: 'number',
        step: '0.001',
        placeholder: '—',
        value: pricingNumberValue(row.inPrice),
        readOnly: true,
        disabled: true,
        title: mode === 'ratio' ? '当前按倍率算；且宿主未开放改价' : PRICING_READONLY_TITLE,
      }),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        type: 'number',
        step: '0.001',
        placeholder: '—',
        value: row.perCall ? '' : pricingNumberValue(row.outPrice),
        readOnly: true,
        disabled: true,
        title: row.perCall ? '按次计费不区分输入/输出' : PRICING_READONLY_TITLE,
      }),
    ),
    h(
      'td',
      null,
      h(
        'div',
        { className: 'unit-cell' },
        h(
          'select',
          { value: row.currency === 'CNY' ? 'CNY' : 'USD', disabled: true, title: PRICING_READONLY_TITLE, style: { width: '70px' } },
          h('option', { value: 'USD' }, 'USD'),
          h('option', { value: 'CNY' }, 'CNY'),
        ),
        pricingUnitBadge(row),
      ),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        type: 'number',
        step: '0.01',
        placeholder: '倍率',
        className: 'ratio',
        value: pricingNumberValue(row.ratio),
        readOnly: true,
        disabled: true,
        title: mode === 'manual' ? '当前按手填单价算；且宿主未开放改价' : PRICING_READONLY_TITLE,
      }),
    ),
    h('td', { className: 'num' }, row.ttftMs ? String(row.ttftMs) + 'ms' : '—'),
    h('td', { className: 'num' }, pricingCostCell(row, settings)),
    h(
      'td',
      { className: 'num' },
      row.isCheapest
        ? h(Badge, { tone: 'ok' }, '最便宜')
        : row.deltaPct === null || row.deltaPct === undefined
          ? '—'
          : '+' + row.deltaPct + '%',
    ),
  )
}

function pricingGroupPanel(group, ctx) {
  var panelKey = 'pricing:' + group.modelKey
  var isCollapsed = Boolean(ctx.collapse[panelKey])
  var rows = (group.rows || []).map(function (row) {
    return pricingRowElement(row, ctx)
  })
  return h(
    'div',
    { className: 'table-wrap', key: group.modelKey },
    h(
      'div',
      { className: 'group-head' },
      h(
        'button',
        {
          type: 'button',
          className: 'ghost tiny',
          title: isCollapsed ? '展开' : '折叠',
          onClick: function () {
            ctx.toggle(panelKey)
          },
        },
        isCollapsed ? '▸' : '▾',
      ),
      h('span', { className: 'model mono' }, group.modelKey),
      group.spreadPct === null || group.spreadPct === undefined
        ? null
        : h('span', { className: 'spread' }, '价差 ' + group.spreadPct + '%'),
      h(
        'span',
        { className: 'count' },
        (group.providerCount || 0) + ' 个站 · ' + (group.rows || []).length + ' 条供给',
      ),
    ),
    isCollapsed
      ? null
      : h(
          'table',
          { className: 'pricing-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, '站点'),
              h('th', null, '上游模型名'),
              h('th', { className: 'num' }, '缓存'),
              h('th', null, '分组'),
              h('th', null, '模式'),
              h('th', { className: 'num' }, '输入价'),
              h('th', { className: 'num' }, '输出价'),
              h('th', null, '币种 / 单位'),
              h('th', { className: 'num' }, '倍率'),
              h('th', { className: 'num' }, '首字'),
              h(
                'th',
                { className: 'num' },
                '综合成本',
                h('div', { className: 'sub' }, pricingSym(ctx.settings) + '/M · 按次行 /次'),
              ),
              h('th', { className: 'num' }, '价差'),
            ),
          ),
          h('tbody', null, rows),
        ),
  )
}

/** 还没定价的供给：新用户进来不能是空白，否则没有入口填价。 */
function pricingUnpricedBlock(unpriced, ctx) {
  if (!unpriced.length) return null
  return h(
    'div',
    { key: 'unpriced' },
    h('h3', { className: 'section-title' }, '还没定价的供给（' + unpriced.length + '）'),
    h(
      'p',
      { className: 'hint' },
      '填「倍率」最省事：实际价 = 基准价 × 倍率。不知道倍率就直接填输入/输出单价。站上真的白送就点「标为免费」。',
    ),
    h(
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
            h('th', null, '站点'),
            h('th', null, '上游模型名'),
            h('th', { className: 'num' }, '基准价'),
            h('th', { className: 'num' }, '输入价'),
            h('th', { className: 'num' }, '输出价'),
            h('th', { className: 'num' }, '倍率'),
            h('th', null, '单位 / 币种'),
            h('th', null, ''),
          ),
        ),
        h(
          'tbody',
          null,
          unpriced.map(function (offer) {
            var bench = ctx.benchmarks[offer.modelKey] || ctx.benchmarks[offer.upstreamName]
            var hasBench = bench && (bench.in !== null || bench.out !== null)
            var benchText = hasBench
              ? (bench.currency === 'CNY' ? '¥' : '$') +
                (bench.in === null || bench.in === undefined ? '—' : bench.in) +
                '/' +
                (bench.out === null || bench.out === undefined ? '—' : bench.out)
              : h('span', { style: { color: 'var(--faint)' } }, '无基准')
            return h(
              'tr',
              { key: offer.id },
              h('td', null, ctx.nameMap[offer.providerId] || '未知站'),
              h(
                'td',
                { className: 'mono' },
                offer.upstreamName,
                offer.group
                  ? h(
                      'span',
                      { className: 'badge ' + pricingGroupChipClass(ctx.freeMap, offer.providerId, offer.group) },
                      offer.group,
                    )
                  : null,
              ),
              h('td', { className: 'num', style: { color: 'var(--faint)' } }, benchText),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  value: pricingNumberValue(offer.inPrice),
                  readOnly: true,
                  disabled: true,
                  title: PRICING_READONLY_TITLE,
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  value: offer.priceUnit === 'per_call' ? '' : pricingNumberValue(offer.outPrice),
                  readOnly: true,
                  disabled: true,
                  title: offer.priceUnit === 'per_call' ? '按次计费不区分输入/输出' : PRICING_READONLY_TITLE,
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  type: 'number',
                  step: '0.01',
                  placeholder: '倍率',
                  className: 'ratio',
                  value: pricingNumberValue(offer.ratio),
                  readOnly: true,
                  disabled: true,
                  title: PRICING_READONLY_TITLE,
                }),
              ),
              h(
                'td',
                null,
                h(
                  'div',
                  { className: 'unit-cell' },
                  h(
                    'select',
                    { value: offer.priceUnit === 'per_1k' ? 'per_1k' : offer.priceUnit === 'per_call' ? 'per_call' : 'per_mtok', disabled: true, title: PRICING_READONLY_TITLE, style: { width: '64px' } },
                    h('option', { value: 'per_mtok' }, '/M'),
                    h('option', { value: 'per_1k' }, '/1k'),
                    h('option', { value: 'per_call' }, '/次'),
                  ),
                  h(
                    'select',
                    { value: offer.currency === 'CNY' ? 'CNY' : 'USD', disabled: true, title: PRICING_READONLY_TITLE, style: { width: '64px' } },
                    h('option', { value: 'USD' }, 'USD'),
                    h('option', { value: 'CNY' }, 'CNY'),
                  ),
                ),
              ),
              h(
                'td',
                null,
                h(
                  'button',
                  { type: 'button', className: 'ghost tiny', disabled: true, title: '宿主写通道未开放「标为免费」（PATCH /api/offers/:id）' },
                  '标为免费',
                ),
              ),
            )
          }),
        ),
      ),
    ),
  )
}

function PricesView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var settings = state.settings || {}
  var ranked = Array.isArray(state.ranked) ? state.ranked : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var providers = Array.isArray(state.providers) ? state.providers : []
  var scores = state.scores || {}
  var benchmarks = state.benchmarks || {}
  var unpriced = Array.isArray(state.unpriced) ? state.unpriced : []

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var collapsePair = React.useState({})
  var collapse = collapsePair[0]
  var setCollapse = collapsePair[1]

  var nameMap = React.useMemo(
    function () {
      var map = {}
      providers.forEach(function (provider) {
        map[provider.id] = provider.name || provider.id
      })
      return map
    },
    [providers],
  )

  var freeMap = React.useMemo(
    function () {
      return pricingGroupFreeMap(offers)
    },
    [offers],
  )

  var toggle = React.useCallback(function (key) {
    setCollapse(function (prev) {
      var next = Object.assign({}, prev)
      if (next[key]) delete next[key]
      else next[key] = true
      return next
    })
  }, [])

  var visibleGroups = React.useMemo(
    function () {
      var text = String(search || '').trim().toLowerCase()
      if (!text) return ranked
      return ranked.filter(function (group) {
        return String(group.modelKey || '').toLowerCase().indexOf(text) >= 0
      })
    },
    [ranked, search],
  )

  var ctx = React.useMemo(
    function () {
      return { settings: settings, scores: scores, nameMap: nameMap, freeMap: freeMap, collapse: collapse, toggle: toggle, benchmarks: benchmarks }
    },
    [settings, scores, nameMap, freeMap, collapse, toggle, benchmarks],
  )

  var panels = React.useMemo(
    function () {
      return visibleGroups.map(function (group) {
        return pricingGroupPanel(group, ctx)
      })
    },
    [visibleGroups, ctx],
  )

  var unpricedBlock = React.useMemo(
    function () {
      return pricingUnpricedBlock(unpriced, ctx)
    },
    [unpriced, ctx],
  )

  var ignoredCount = Array.isArray(settings.ignoredModels) ? settings.ignoredModels.length : 0

  var toolbar = h(
    'div',
    { className: 'toolbar' },
    h('input', {
      className: 'search',
      type: 'search',
      placeholder: '搜索模型名…',
      value: search,
      onChange: function (event) {
        setSearch(event.target.value)
      },
    }),
    h('span', { className: 'hint', style: { margin: 0 } }, visibleGroups.length + ' / ' + ranked.length + ' 个模型'),
    h('span', { className: 'grow' }),
    h(
      'button',
      {
        type: 'button',
        className: 'with-icon',
        disabled: true,
        title: '忽略模型弹窗未移植（忽略名单要改 PATCH /api/settings 的 ignoredModels）',
      },
      Icon('x', { size: 14 }),
      '忽略模型' + (ignoredCount ? ' ' + ignoredCount : ''),
    ),
  )

  var hints = h(
    'div',
    null,
    h(
      'p',
      { className: 'hint' },
      '价格直接改，失焦即保存。「' +
        pricingSym(settings) +
        '/百万 token」是综合成本：输入按 25%、输出按 75% 加权。人民币标价的站按「基准价」页里的汇率折算成美元比较。',
    ),
    h(
      'p',
      { className: 'hint' },
      '本面板为只读：宿主白名单没有改价接口（PATCH /api/offers/:id），输入框保留原位但已禁用；改价请到 daemon 网页版。',
    ),
    ignoredCount
      ? h(
          'p',
          { className: 'hint' },
          '已忽略 ' + ignoredCount + ' 个模型：它们不出现在比价、智能决策、探针和网关里。',
          h('button', { type: 'button', className: 'ghost tiny', disabled: true, title: '忽略模型弹窗未移植' }, '管理'),
        )
      : null,
  )

  if (!ranked.length) {
    return h(
      'section',
      { className: 'view wide' },
      h(
        'div',
        { className: 'empty', style: { marginBottom: '18px' } },
        h('h3', null, unpriced.length ? '模型已同步，但还没定价' : '还没有模型'),
        h(
          'p',
          null,
          unpriced.length
            ? '在下面的表格里给每个模型填一个倍率（或直接填单价），就能开始比价。'
            : '先去「站点」同步模型列表。',
        ),
        h(
          'button',
          {
            className: 'primary',
            type: 'button',
            disabled: true,
            title: unpriced.length
              ? '插件面板不支持跳转到 daemon 的「基准价」页，请到 daemon 网页版操作'
              : '插件面板不支持跨页跳转，请用左侧「站点」页',
          },
          unpriced.length ? '先去载入基准价' : '去站点页',
        ),
      ),
      unpricedBlock,
    )
  }

  return h('section', { className: 'view wide' }, toolbar, hints, panels, unpricedBlock)
}
