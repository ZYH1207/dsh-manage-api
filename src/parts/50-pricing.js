// ── 比价页：移植 web/app.js renderPricing()（1749-1914）───────────────
// 12 列宽表 + 详情箭头：站点（左吸附）｜上游模型名｜缓存｜分组｜模式｜输入价｜
// 输出价｜币种/单位｜倍率｜首字｜综合成本（右吸附）｜价差（右吸附）｜›。
// 网页版的价格写入走 PATCH /api/offers/:id，宿主写通道已放行（lib/write-proxy.js
// 的「改供给价格」）。列表只做导航：价格控件保留原位但只读，点行进 ModelDetailView
// 改单价 / 倍率；所有写请求都从详情页发出。

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

// 列表里的控件只读，但都指向「去详情改」——不写任何「宿主没有改价接口」的过时说明。
var PRICING_LIST_PRICE_TITLE = '点进模型详情改价（列表只读，避免误触）'
var PRICING_LIST_MODE_TITLE = '点进模型详情切换「倍率 / 价格」'
var PRICING_LIST_CURRENCY_TITLE = '币种由站点声明，插件里只读'
// 未定价供给还不在榜单里，也就没有详情入口——如实说明，不冒充「白名单没开」。
var PRICING_UNPRICED_TITLE = '还不在比价榜里：先在 daemon 网页版填价，或到「基准价」页载入基准'

function pricingRowElement(row, ctx, modelKey) {
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
    { key: row.offerId, className: (row.isCheapest ? 'cheapest ' : '') + 'ma-row-link', onClick: function () { if (typeof ctx.openDetail === 'function') ctx.openDetail(modelKey) } },
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
            title: '插件暂不支持复制供给（POST /api/offers/:id/duplicate 未放行）',
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
            title: PRICING_LIST_MODE_TITLE,
          },
          '倍率',
        ),
        h(
          'button',
          {
            type: 'button',
            className: mode === 'manual' ? 'is-on' : '',
            disabled: true,
            title: PRICING_LIST_MODE_TITLE,
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
        title: mode === 'ratio' ? '当前按倍率折算；点进详情切到「价格」再改单价' : PRICING_LIST_PRICE_TITLE,
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
        title: row.perCall ? '按次计费不区分输入/输出' : PRICING_LIST_PRICE_TITLE,
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
          { value: row.currency === 'CNY' ? 'CNY' : 'USD', disabled: true, title: PRICING_LIST_CURRENCY_TITLE, style: { width: '70px' } },
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
        title: mode === 'manual' ? '当前按手填单价算；点进详情改单价' : PRICING_LIST_PRICE_TITLE,
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
    h('td', { className: 'ma-chev', 'aria-hidden': 'true' }, '›'),
  )
}

function pricingGroupPanel(group, ctx) {
  var panelKey = 'pricing:' + group.modelKey
  var isCollapsed = Boolean(ctx.collapse[panelKey])
  var rows = (group.rows || []).map(function (row) {
    return pricingRowElement(row, ctx, group.modelKey)
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
              h('th', { className: 'ma-chev', 'aria-hidden': 'true' }, ''),
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
                  title: PRICING_UNPRICED_TITLE,
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
                  title: offer.priceUnit === 'per_call' ? '按次计费不区分输入/输出' : PRICING_UNPRICED_TITLE,
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
                  title: PRICING_UNPRICED_TITLE,
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
                    { value: offer.priceUnit === 'per_1k' ? 'per_1k' : offer.priceUnit === 'per_call' ? 'per_call' : 'per_mtok', disabled: true, title: PRICING_UNPRICED_TITLE, style: { width: '64px' } },
                    h('option', { value: 'per_mtok' }, '/M'),
                    h('option', { value: 'per_1k' }, '/1k'),
                    h('option', { value: 'per_call' }, '/次'),
                  ),
                  h(
                    'select',
                    { value: offer.currency === 'CNY' ? 'CNY' : 'USD', disabled: true, title: PRICING_UNPRICED_TITLE, style: { width: '64px' } },
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
                  { type: 'button', className: 'ghost tiny', disabled: true, title: '插件暂未接线「标为免费」：可到 daemon 网页版操作，或在详情页把输入/输出都填 0' },
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

// ── 忽略模型：厂牌分组与已知模型（对齐网页版 knownModels/groupModels） ─────
var PRICING_VENDOR_LABEL = {
  gpt: 'OpenAI', o1: 'OpenAI', o3: 'OpenAI', o4: 'OpenAI', codex: 'OpenAI',
  claude: 'Anthropic', gemini: 'Gemini', grok: 'Grok', llama: 'Llama', mistral: 'Mistral',
  deepseek: 'DeepSeek', glm: '智谱 GLM', chatglm: '智谱 GLM', qwen: '通义千问',
  kimi: 'Moonshot', moonshot: 'Moonshot', doubao: '豆包', hunyuan: '腾讯混元',
  ernie: '文心一言', minimax: 'MiniMax', abab: 'MiniMax', spark: '讯飞星火', yi: '零一万物',
}

function pricingVendorOf(name) {
  var prefix = String(name || '').toLowerCase().split(/[-_./:]/)[0]
  return prefix || '其它'
}

function pricingVendorLabel(prefix) {
  return PRICING_VENDOR_LABEL[prefix] || prefix
}

/** 出现过的模型名 + 覆盖站点数（含已被忽略的） */
function pricingKnownModels(state) {
  var counts = new Map()
  var index = Array.isArray(state.modelIndex) ? state.modelIndex : []
  index.forEach(function (row) {
    if (row && row.name) counts.set(String(row.name), Number(row.sites) || 0)
  })
  var unpriced = Array.isArray(state.unpriced) ? state.unpriced : []
  unpriced.forEach(function (offer) {
    var key = String((offer && (offer.modelKey || offer.upstreamName)) || '').trim()
    if (key && !counts.has(key)) counts.set(key, 1)
  })
  var ignored = (state.settings && state.settings.ignoredModels) || []
  ignored.forEach(function (key) {
    var name = String(key || '').trim()
    if (name && !counts.has(name)) counts.set(name, 0)
  })
  return Array.from(counts.entries()).sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]))
  })
}

/** 按厂牌分组；组内按名字，组间按模型数降序 */
function pricingGroupModels(rows, ignoredNames) {
  var ignored = new Set(ignoredNames || [])
  var groups = new Map()
  rows.forEach(function (pair) {
    var key = pricingVendorOf(pair[0])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pair)
  })
  return Array.from(groups.entries())
    .map(function (entry) {
      var items = entry[1]
      return {
        key: entry[0],
        label: pricingVendorLabel(entry[0]),
        items: items,
        ignoredCount: items.filter(function (pair) {
          return ignored.has(pair[0])
        }).length,
      }
    })
    .sort(function (a, b) {
      return b.items.length - a.items.length || String(a.label).localeCompare(String(b.label))
    })
}

function PricesView(props) {
  var api = props.api || {}
  var detail = typeof props.detail === 'string' && props.detail ? props.detail : ''
  // 真机由 ManageShell 同时给 api 与 state；这里两者都认，避免只拿到 envelope 时整页误判为空。
  var envelope = api.state || props.state
  var state = pickState({ state: envelope }) || {}
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
  var ignoredOpenPair = React.useState(false)
  var ignoredOpen = ignoredOpenPair[0]
  var setIgnoredOpen = ignoredOpenPair[1]
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
      return {
        settings: settings,
        scores: scores,
        nameMap: nameMap,
        freeMap: freeMap,
        collapse: collapse,
        toggle: toggle,
        benchmarks: benchmarks,
        openDetail: props.openDetail,
      }
    },
    [settings, scores, nameMap, freeMap, collapse, toggle, benchmarks, props.openDetail],
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

  // 三态：首答之前给骨架，别把「还没加载」画成空表。
  var hasSnapshot = Boolean(props.state && props.state.state)
  var loadErrorBlock = props.error
    ? h(
        'div',
        { className: 'notice danger', style: { marginBottom: '12px' } },
        h('span', { className: 'name' }, '读不到比价数据'),
        h('span', { className: 'grow' }),
        h('span', { className: 'desc' }, String(props.error)),
        h(
          'button',
          {
            type: 'button',
            className: 'ghost tiny',
            onClick: function () {
              if (typeof props.onReload === 'function') props.onReload()
            },
          },
          '重试',
        ),
      )
    : null

  if (props.loading && !hasSnapshot) {
    return h('section', { className: 'view wide' }, h(Skeleton, { cards: 2, rows: 4 }))
  }

  // 详情：路由 extra 就是模型 key。放在列表分支之前，被忽略的模型也进得来、取消得了。
  if (detail) {
    return h(ModelDetailView, {
      detail: detail,
      state: props.state,
      loading: Boolean(props.loading),
      error: props.error,
      onReload: props.onReload,
      closeDetail: props.closeDetail,
    })
  }

  if (!hasSnapshot) {
    return h(
      'section',
      { className: 'view wide' },
      loadErrorBlock ||
        h(
          'div',
          { className: 'empty' },
          h('h3', null, '还没有数据'),
          h('p', null, '宿主还没返回比价快照。'),
          h(
            'button',
            {
              type: 'button',
              className: 'primary',
              onClick: function () {
                if (typeof props.onReload === 'function') props.onReload()
              },
            },
            '重试',
          ),
        ),
    )
  }

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
        title: '忽略后不再参与比价、智能决策、探针和网关',
        onClick: function () {
          setIgnoredOpen(true)
        },
      },
      Icon('eye', { size: 14 }),
      '忽略模型' + (ignoredCount ? ' ' + ignoredCount : ''),
    ),
  )

  var hints = h(
    'div',
    null,
    h(
      'p',
      { className: 'hint' },
      '点模型行（或行尾 ›）进详情改价，失焦即保存。「' +
        pricingSym(settings) +
        '/百万 token」是综合成本：输入按 25%、输出按 75% 加权。人民币标价的站按「基准价」页里的汇率折算成美元比较。',
    ),
    h(
      'p',
      { className: 'hint' },
      '列表里的价格只读；倍率模式的供给要先在详情切到「价格」，系统会把当前折算价种进手填框，再改单价。',
    ),
    ignoredCount
      ? h(
          'p',
          { className: 'hint' },
          '已忽略 ' + ignoredCount + ' 个模型：它们不出现在比价、智能决策、探针和网关里。',
          h(
            'button',
            {
              type: 'button',
              className: 'ghost tiny',
              title: '管理忽略名单',
              onClick: function () {
                setIgnoredOpen(true)
              },
            },
            '管理',
          ),
        )
      : null,
  )

  if (!ranked.length) {
    return h(
      'section',
      { className: 'view wide' },
      loadErrorBlock,
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

  return h(
    'section',
    { className: 'view wide' },
    loadErrorBlock,
    toolbar,
    hints,
    panels,
    unpricedBlock,
    ignoredOpen
      ? h(IgnoredModelsModal, {
          state: state,
          api: api,
          onClose: function () {
            setIgnoredOpen(false)
          },
        })
      : null,
  )
}

// ── 模型详情（路由 extra = 模型 key）：改单价 / 倍率 / 忽略 ──────────────
// 写入都走宿主白名单里的 PATCH /api/offers/:id（lib/write-proxy.js:43），
// body 字段与 daemon/server.js:1510-1562 对齐：pricingMode / inPrice / outPrice /
// ratio；切到 manual 时 daemon 会按当前倍率折算并种进 inPrice/outPrice(1550-1558)。
function pricingNormalizeModelName(name) {
  var text = String(name === null || name === undefined ? '' : name).trim().toLowerCase()
  if (!text) return ''
  text = text.replace(/\s+/g, '-')
  text = text.replace(/^[a-z0-9_.-]+\//, '')
  text = text.replace(/[-:]free$/, '')
  return text
}

function pricingDetailModelRows(state, modelKey) {
  var ranked = Array.isArray(state.ranked) ? state.ranked : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var target = pricingNormalizeModelName(modelKey)
  var rows = []
  var seen = {}
  ranked.forEach(function (group) {
    if (pricingNormalizeModelName(group.modelKey) !== target) return
    ;(group.rows || []).forEach(function (row) {
      if (!row || !row.offerId || seen[row.offerId]) return
      seen[row.offerId] = true
      rows.push(row)
    })
  })
  // 被忽略 / 未定价的供给不在 ranked 里，仍要出现在详情，否则取消忽略后一片空白。
  offers.forEach(function (offer) {
    if (!offer || !offer.id || seen[offer.id]) return
    if (pricingNormalizeModelName(offer.modelKey || offer.upstreamName) !== target) return
    seen[offer.id] = true
    rows.push({
      offerId: offer.id,
      providerId: offer.providerId,
      credentialId: offer.credentialId,
      upstreamName: offer.upstreamName,
      group: offer.group,
      pricingMode: offer.pricingMode,
      ratio: offer.ratio,
      benchmarkKey: offer.benchmarkKey,
      currency: offer.currency,
      priceUnit: offer.priceUnit,
      perCall: offer.priceUnit === 'per_call',
      inPrice: offer.inPrice,
      outPrice: offer.outPrice,
      blendedCnyPerMtok: null,
      hasOffPeak: false,
      deltaPct: null,
      isCheapest: false,
    })
  })
  return rows
}

function ModelDetailView(props) {
  var raw = props.state
  var state = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw || {}
  var settings = state.settings || {}
  var scores = state.scores || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var modelKey = String(props.detail || '')
  var rows = pricingDetailModelRows(state, modelKey)
  var normalized = pricingNormalizeModelName(modelKey)
  var ignoredList = Array.isArray(settings.ignoredModels) ? settings.ignoredModels.slice() : []
  var ignored = ignoredList.some(function (name) {
    return pricingNormalizeModelName(name) === normalized
  })
  var providerName = {}
  providers.forEach(function (provider) {
    providerName[provider.id] = provider.name || provider.id
  })

  var draftPair = React.useState({})
  var draft = draftPair[0]
  var setDraft = draftPair[1]
  var savingPair = React.useState('')
  var saving = savingPair[0]
  var setSaving = savingPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]
  var savedPair = React.useState(false)
  var saved = savedPair[0]
  var setSaved = savedPair[1]
  var ignorePair = React.useState(false)
  var ignoreBusy = ignorePair[0]
  var setIgnoreBusy = ignorePair[1]
  var savedTimer = React.useRef(null)

  React.useEffect(function () {
    return function () {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  var dirtyCount = Object.keys(draft).length

  function fieldKey(offerId, field) {
    return String(offerId) + '\u0000' + field
  }

  function serverValue(row, field) {
    var value = field === 'ratio' ? row.ratio : field === 'inPrice' ? row.inPrice : row.outPrice
    return value === null || value === undefined ? '' : String(value)
  }

  function dropDraft(offerId) {
    setDraft(function (prev) {
      var next = Object.assign({}, prev)
      Object.keys(next).forEach(function (key) {
        if (key.indexOf(String(offerId) + '\u0000') === 0) delete next[key]
      })
      return next
    })
  }

  function offerPatch(offerId) {
    var patch = {}
    ;['inPrice', 'outPrice', 'ratio'].forEach(function (field) {
      var key = fieldKey(offerId, field)
      if (draft[key] === undefined) return
      var text = String(draft[key]).trim()
      patch[field] = text === '' ? null : Number(text)
    })
    return patch
  }

  function runWrite(offerId, patch) {
    setSaving(String(offerId))
    setError('')
    return writeOp('PATCH', '/api/offers/' + offerId, patch).then(function (res) {
      setSaving('')
      if (!res || !res.ok) {
        // 失败必须回滚：删掉这条草稿，输入框立刻回到服务端值——不留「看着改了实际没改」。
        dropDraft(offerId)
        if (savedTimer.current) clearTimeout(savedTimer.current)
        setSaved(false)
        setError((res && res.error) || '保存失败，已恢复原价')
        return false
      }
      dropDraft(offerId)
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(function () {
        setSaved(false)
      }, 1500)
      if (typeof props.onReload === 'function') props.onReload()
      return true
    })
  }

  function saveRow(row) {
    var patch = offerPatch(row.offerId)
    if (!Object.keys(patch).length) return Promise.resolve(true)
    return runWrite(row.offerId, patch)
  }

  function saveAll() {
    var ids = []
    Object.keys(draft).forEach(function (key) {
      var id = key.split('\u0000')[0]
      if (id && ids.indexOf(id) < 0) ids.push(id)
    })
    var chain = Promise.resolve(true)
    ids.forEach(function (id) {
      chain = chain.then(function (ok) {
        if (!ok) return false
        return runWrite(id, offerPatch(id))
      })
    })
    return chain
  }

  function hasDraft(offerId) {
    var prefix = String(offerId) + '\u0000'
    return Object.keys(draft).some(function (key) {
      return key.indexOf(prefix) === 0
    })
  }

  function switchMode(row, mode) {
    if ((row.pricingMode === 'ratio' ? 'ratio' : 'manual') === mode) return
    runWrite(row.offerId, { pricingMode: mode })
  }

  function toggleIgnore() {
    setIgnoreBusy(true)
    setError('')
    var next = ignoredList.filter(function (name) {
      return pricingNormalizeModelName(name) !== normalized
    })
    if (!ignored) next.push(modelKey)
    writeOp('PATCH', '/api/settings', { ignoredModels: next }).then(function (res) {
      setIgnoreBusy(false)
      if (!res || !res.ok) {
        setError((res && res.error) || '忽略名单保存失败')
        return
      }
      if (typeof props.onReload === 'function') props.onReload()
    })
  }

  function priceCell(row, field) {
    var mode = row.pricingMode === 'ratio' ? 'ratio' : 'manual'
    var locked = row.perCall || (field === 'ratio' ? mode !== 'ratio' : mode === 'ratio')
    var key = fieldKey(row.offerId, field)
    var value = draft[key] !== undefined ? draft[key] : serverValue(row, field)
    var unit = row.currency === 'CNY' ? '¥' : '$'
    var title = locked
      ? row.perCall
        ? '按次计费不区分输入/输出'
        : field === 'ratio'
          ? '当前按手填单价算；先切到「倍率」再改'
          : '当前按倍率折算；先切到「价格」再改'
      : '改完回车或点别处即保存'
    return h(
      'div',
      null,
      h('input', {
        type: 'number',
        step: field === 'ratio' ? '0.01' : '0.001',
        placeholder: '—',
        value: value,
        disabled: locked,
        title: title,
        'aria-label': field === 'ratio' ? '倍率' : field === 'inPrice' ? '输入单价' : '输出单价',
        style: { width: '82px' },
        onChange: function (event) {
          var next = event.target.value
          setDraft(function (prev) {
            var copy = Object.assign({}, prev)
            if (next === serverValue(row, field)) delete copy[key]
            else copy[key] = next
            return copy
          })
        },
        onBlur: function () {
          saveRow(row)
        },
        onKeyDown: function (event) {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        },
      }),
      h('span', { className: 'hint' }, field === 'ratio' ? '×' : unit + '/M'),
    )
  }

  function scoreCell(row) {
    var score = scores[row.offerId] || {}
    var avail = score.availability === null || score.availability === undefined ? '—' : fmtRate(score.availability)
    var fp = score.fingerprintRate === null || score.fingerprintRate === undefined ? '—' : fmtRate(score.fingerprintRate)
    return h(
      'div',
      null,
      h('div', null, '可用率 ' + avail),
      h('div', { className: 'sub' }, '指纹 ' + fp),
    )
  }

  var head = h(
    'div',
    { className: 'ma-detail-head' },
    h(
      'button',
      {
        type: 'button',
        className: 'ghost',
        onClick: function () {
          if (typeof props.closeDetail === 'function') props.closeDetail()
        },
      },
      '← 比价',
    ),
    h('h2', null, modelKey),
    h('span', { className: 'grow' }),
    h(
      'button',
      {
        type: 'button',
        className: ignored ? 'ghost' : 'primary',
        disabled: ignoreBusy,
        title: ignored ? '恢复参与比价、决策、探针和网关' : '忽略后不再参与比价、决策、探针和网关',
        style: { marginLeft: 'auto' },
        onClick: toggleIgnore,
      },
      ignoreBusy ? '处理中…' : ignored ? '取消忽略' : '忽略此模型',
    ),
  )

  var body
  if (!rows.length) {
    body = h(Empty, {
      title: ignored ? '已忽略此模型' : '这个模型暂无供给',
      desc: ignored
        ? '它不参与比价、智能决策、探针和网关；点右上角「取消忽略」可以恢复。'
        : '去「站点」页同步模型列表，或到「基准价」页给它配一份基准价。',
    })
  } else {
    body = h(
      'div',
      { className: 'table-wrap' },
      h(
        'div',
        { className: 'group-head' },
        h('span', { className: 'model mono' }, modelKey),
        h('span', { className: 'count' }, rows.length + ' 条供给 · 改价失焦即保存'),
      ),
      h(
        'table',
        { className: 'pricing-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, '站点'),
            h('th', null, '分组'),
            h('th', { className: 'num' }, '输入 /M'),
            h('th', { className: 'num' }, '输出 /M'),
            h('th', { className: 'num' }, '综合成本'),
            h('th', null, '可用率 / 指纹'),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map(function (row) {
            var mode = row.pricingMode === 'ratio' ? 'ratio' : 'manual'
            return h(
              'tr',
              { key: row.offerId },
              h(
                'td',
                null,
                h('div', null, providerName[row.providerId] || row.providerId || '—'),
                h('div', { className: 'sub' }, row.upstreamName || '—'),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ghost tiny',
                    disabled: Boolean(saving) || row.perCall || hasDraft(row.offerId),
                    title: hasDraft(row.offerId)
                      ? '先保存这一行的改价（失焦或点「保存」），再切计价模式'
                      : mode === 'ratio'
                        ? '切到「价格」：系统会按当前倍率折算一份初始单价，之后再改'
                        : '切回「倍率」：按「基准价」页的基准价 × 倍率折算',
                    onClick: function () {
                      switchMode(row, mode === 'ratio' ? 'manual' : 'ratio')
                    },
                  },
                  mode === 'ratio' ? '倍率 → 切到价格' : '手填价 → 切到倍率',
                ),
              ),
              h('td', null, row.group || '—'),
              h('td', { className: 'num' }, priceCell(row, 'inPrice')),
              h('td', { className: 'num' }, row.perCall ? '—' : priceCell(row, 'outPrice')),
              h('td', { className: 'num' }, pricingCostCell(row, settings)),
              h('td', null, scoreCell(row)),
            )
          }),
        ),
      ),
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    head,
    props.error
      ? h(
          'div',
          { className: 'notice danger', style: { marginBottom: '12px' } },
          h('span', { className: 'name' }, '读不到比价数据'),
          h('span', { className: 'grow' }),
          h('span', { className: 'desc' }, String(props.error)),
          h(
            'button',
            {
              type: 'button',
              className: 'ghost tiny',
              onClick: function () {
                if (typeof props.onReload === 'function') props.onReload()
              },
            },
            '重试',
          ),
        )
      : null,
    body,
    h(SaveBar, {
      dirty: dirtyCount > 0,
      saving: Boolean(saving),
      error: error,
      saved: saved,
      message: '有 ' + dirtyCount + ' 处改价没保存',
      onDiscard: function () {
        setDraft({})
        setError('')
      },
      onSave: saveAll,
    }),
  )
}

// ── 忽略模型弹窗（对齐网页版 openIgnoredModels） ──────────────────────
function IgnoredModelsModal(props) {
  var raw = props.state || {}
  var state = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
  var api = props.api || {}
  var settings = state.settings || {}
  var ignored = Array.isArray(settings.ignoredModels)
    ? settings.ignoredModels.filter(Boolean).map(String)
    : []

  var known = React.useMemo(
    function () {
      return pricingKnownModels(state)
    },
    [state],
  )

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var foldedPair = React.useState({})
  var folded = foldedPair[0]
  var setFolded = foldedPair[1]
  var initialChecked = {}
  ignored.forEach(function (name) {
    initialChecked[name] = true
  })
  var checkedPair = React.useState(initialChecked)
  var checked = checkedPair[0]
  var setChecked = checkedPair[1]
  var savingPair = React.useState(false)
  var saving = savingPair[0]
  var setSaving = savingPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]

  var groups = React.useMemo(
    function () {
      var query = String(search || '').trim().toLowerCase()
      var rows = query
        ? known.filter(function (pair) {
            return String(pair[0]).toLowerCase().indexOf(query) >= 0
          })
        : known
      return pricingGroupModels(rows, ignored)
    },
    [known, search, ignored.join('\u0000')],
  )

  var totalShown = groups.reduce(function (sum, group) {
    return sum + group.items.length
  }, 0)
  var checkedNames = Object.keys(checked).filter(function (name) {
    return !!checked[name]
  })

  function toggleOne(name) {
    var next = Object.assign({}, checked)
    next[name] = !checked[name]
    setChecked(next)
  }

  function toggleGroup(group) {
    var all = group.items.every(function (pair) {
      return !!checked[pair[0]]
    })
    var next = Object.assign({}, checked)
    group.items.forEach(function (pair) {
      next[pair[0]] = !all
    })
    setChecked(next)
  }

  function toggleFold(key) {
    var next = Object.assign({}, folded)
    if (next[key]) delete next[key]
    else next[key] = true
    setFolded(next)
  }

  function save() {
    setSaving(true)
    setError('')
    writeOp('PATCH', '/api/settings', { ignoredModels: checkedNames.slice() }).then(function (res) {
      setSaving(false)
      if (!res || !res.ok) {
        setError((res && res.error) || '保存失败')
        return
      }
      if (typeof api.reload === 'function') api.reload()
      if (typeof props.onClose === 'function') props.onClose()
    })
  }

  var groupNodes = groups.map(function (group) {
    var allChecked = group.items.every(function (pair) {
      return !!checked[pair[0]]
    })
    var isFolded = !!folded[group.key]
    return h(
      'div',
      { className: 'ig-group', key: group.key },
      h(
        'div',
        { className: 'ig-row ig-group-head' },
        h(
          'button',
          {
            type: 'button',
            className: 'ig-caret' + (isFolded ? ' is-collapsed' : ''),
            title: isFolded ? '展开' : '折叠',
            onClick: function () {
              toggleFold(group.key)
            },
          },
          isFolded ? '▸' : '▾',
        ),
        h('input', {
          type: 'checkbox',
          checked: allChecked,
          title: '整组勾选',
          onChange: function () {
            toggleGroup(group)
          },
        }),
        h('span', { className: 'ig-vendor' }, group.label),
        h(
          'span',
          { className: 'hint' },
          group.items.length + ' 个模型 · 已忽略 ' + group.ignoredCount,
        ),
      ),
      isFolded
        ? null
        : h(
            'div',
            { className: 'ig-children' },
            group.items.map(function (pair) {
              return h(
                'label',
                { className: 'ig-row ig-child', key: pair[0] },
                h('input', {
                  type: 'checkbox',
                  checked: !!checked[pair[0]],
                  onChange: function () {
                    toggleOne(pair[0])
                  },
                }),
                h('span', { className: 'mono' }, pair[0]),
                h(
                  'span',
                  { className: 'hint' },
                  pair[1] > 0 ? pair[1] + ' 个站' : '已不在榜单里',
                ),
              )
            }),
          ),
    )
  })

  return h(
    'div',
    { className: 'modal' },
    h('div', {
      className: 'modal-backdrop',
      onClick: function () {
        if (typeof props.onClose === 'function') props.onClose()
      },
    }),
    h(
      'div',
      { className: 'modal-panel', style: { width: 'min(760px, calc(100vw - 40px))' } },
      h(
        'div',
        { className: 'modal-head' },
        h('h3', null, '忽略模型'),
        h(
          'button',
          {
            type: 'button',
            className: 'ghost',
            onClick: function () {
              if (typeof props.onClose === 'function') props.onClose()
            },
          },
          '关闭',
        ),
      ),
      h(
        'div',
        { className: 'modal-body' },
        h(
          'p',
          { className: 'hint' },
          '勾上的模型不再参与比价、智能决策、探针和网关；点厂牌可整组勾选，随时取消。',
        ),
        h(
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
          h(
            'span',
            { className: 'hint', style: { margin: 0 } },
            totalShown + ' / ' + known.length + ' 个模型',
          ),
          h('span', { className: 'grow' }),
          h('span', { className: 'hint', style: { margin: 0 } }, '已忽略 ' + checkedNames.length + ' 个'),
        ),
        groups.length
          ? h('div', { className: 'ig-list' }, groupNodes)
          : h('p', { className: 'hint' }, '没有匹配的模型。'),
        error ? h('p', { className: 'alert danger' }, error) : null,
        h(
          'div',
          { className: 'toolbar', style: { marginTop: '12px' } },
          h('span', { className: 'grow' }),
          h(
            'button',
            {
              type: 'button',
              className: 'ghost',
              onClick: function () {
                if (typeof props.onClose === 'function') props.onClose()
              },
            },
            '取消',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'primary',
              disabled: !!saving,
              title: '保存忽略名单（PATCH /api/settings）',
              onClick: save,
            },
            saving ? '保存中…' : '保存',
          ),
        ),
      ),
    ),
  )
}

