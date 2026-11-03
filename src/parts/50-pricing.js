// ── 比价页：移植 web/app.js renderPricing()（1749-1914）───────────────
// 12 列宽表：站点（左吸附）｜上游模型名｜缓存｜分组｜模式｜输入价｜输出价｜
// 币种/单位｜倍率｜首字｜综合成本（右吸附）｜价差（右吸附）。
// 价格写入走 PATCH /api/offers/:id（P3.2 起在写代理白名单里）：改价失焦即存，
// 切「倍率/价格」模式即时生效（daemon 侧切手填价时会自动种入当前算出的价格），
// 「标为免费」按 web 版同款五字段写入（manual + 0 价 + CNY）。

/** 供给价格写的统一入口：成功后拉一次新快照，失败把原因放进页首消息行。 */
function pricingSaveOffer(ctx, offerId, body, okText) {
  if (ctx.busy) return
  ctx.setBusy(offerId)
  ctx.setMsg(null)
  writeOp('PATCH', '/api/offers/' + encodeURIComponent(offerId), body).then(function (res) {
    ctx.setBusy('')
    if (res && res.ok) {
      ctx.setMsg({ kind: 'ok', text: okText || '已保存' })
      if (typeof ctx.reload === 'function') ctx.reload()
    } else {
      var err = res && res.error
      var text = err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
      ctx.setMsg({ kind: 'err', text: '保存失败：' + text })
    }
  })
}

/** 数字输入框的失焦提交：空串=清空（null），非法数字回滚原值。 */
function pricingCommitNumber(ctx, offerId, field, okText) {
  return function (event) {
    var raw = String(event.target.value == null ? '' : event.target.value).trim()
    var next = raw === '' ? null : Number(raw)
    if (next !== null && !isFinite(next)) return // number 输入框本身拦住大部分；兜底不提交
    var label = field === 'ratio' ? '倍率' : field === 'inPrice' ? '输入价' : '输出价'
    pricingSaveOffer(ctx, offerId, { [field]: next }, okText || (next === null ? label + '已清空' : label + '已保存'))
  }
}

/** 复制供给（POST /api/offers/:id/duplicate）：按新分组克隆一条，价格记得补填。 */
function pricingDuplicate(ctx, offerId, group) {
  if (ctx.busy) return
  ctx.setBusy(offerId)
  writeOp('POST', '/api/offers/' + encodeURIComponent(offerId) + '/duplicate', { group: group }).then(function (res) {
    ctx.setBusy('')
    if (res && res.ok) {
      ctx.setMsg({ kind: 'ok', text: '已创建分组「' + group + '」，记得填它的价格' })
      ctx.setDupFor(null)
      if (typeof ctx.reload === 'function') ctx.reload()
    } else {
      var err = res && res.error
      var text = err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
      ctx.setMsg({ kind: 'err', text: '复制失败：' + text })
    }
  })
}

/** ＋ 按钮点开后的行内输入（Electron 没有 window.prompt，用行内编辑代替网页版的弹窗输入）。 */
function PricingDupInline(props) {
  var ctx = props.ctx
  var offerId = props.offerId
  var pair = React.useState('')
  var value = pair[0]
  var setValue = pair[1]
  var busy = ctx.busy !== ''
  return h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
    h('input', {
      type: 'text', placeholder: '新分组名', autoFocus: true, value: value, disabled: busy,
      style: { width: '110px' },
      onChange: function (event) { setValue(event.target.value) },
      onKeyDown: function (event) { if (event.key === 'Enter' && value.trim()) pricingDuplicate(ctx, offerId, value.trim()) },
    }),
    h('button', { type: 'button', className: 'ghost tiny', disabled: busy || !value.trim(), onClick: function () { pricingDuplicate(ctx, offerId, value.trim()) } }, '建'),
    h('button', { type: 'button', className: 'ghost tiny', title: '取消', onClick: function () { ctx.setDupFor(null) } }, '×'))
}

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

function pricingRowElement(row, ctx) {
  var settings = ctx.settings
  var score = ctx.scores[row.offerId]
  var mode = row.pricingMode === 'ratio' ? 'ratio' : 'manual'
  var busy = ctx.busy
  var lock = busy !== '' && busy !== row.offerId // 别的行在保存：整表只读，避免并发写错乱
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
        ctx.dupFor === row.offerId
          ? h(PricingDupInline, { ctx: ctx, offerId: row.offerId })
          : h(
              'button',
              {
                type: 'button',
                className: 'ghost tiny',
                disabled: ctx.busy !== '' && ctx.busy !== row.offerId,
                title: '按新分组复制这条供给（适合「同模型多价位」的号池玩法）',
                onClick: function () { ctx.setDupFor(row.offerId) },
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
            disabled: lock,
            title: '按倍率计价：实际价 = 基准价 × 倍率',
            onClick: mode === 'ratio' ? undefined : function () { pricingSaveOffer(ctx, row.offerId, { pricingMode: 'ratio' }, '已切成「按倍率」：价格 = 基准价 × 倍率') },
          },
          '倍率',
        ),
        h(
          'button',
          {
            type: 'button',
            className: mode === 'manual' ? 'is-on' : '',
            disabled: lock,
            title: '按价格计价：直接填输入/输出单价',
            onClick: mode === 'manual' ? undefined : function () { pricingSaveOffer(ctx, row.offerId, { pricingMode: 'manual' }, '已切成「按价格」：直接填输入/输出单价') },
          },
          '价格',
        ),
      ),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        key: row.offerId + ':in:' + mode + ':' + (row.inPrice == null ? '' : row.inPrice),
        type: 'number',
        step: '0.001',
        placeholder: '—',
        defaultValue: pricingNumberValue(row.inPrice),
        disabled: lock || mode === 'ratio',
        title: mode === 'ratio' ? '当前按倍率算，切到「价格」才能填' : '输入单价，失焦保存',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'inPrice'),
      }),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        key: row.offerId + ':out:' + mode + ':' + (row.outPrice == null ? '' : row.outPrice),
        type: 'number',
        step: '0.001',
        placeholder: '—',
        defaultValue: row.perCall ? '' : pricingNumberValue(row.outPrice),
        disabled: lock || row.perCall || mode === 'ratio',
        title: row.perCall ? '按次计费不区分输入/输出' : mode === 'ratio' ? '当前按倍率算，切到「价格」才能填' : '输出单价，失焦保存',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'outPrice'),
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
          { value: row.currency === 'CNY' ? 'CNY' : 'USD', disabled: lock, title: '单价币种', style: { width: '70px' }, onChange: function (event) { pricingSaveOffer(ctx, row.offerId, { currency: event.target.value }, '币种已切换') } },
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
        key: row.offerId + ':ratio:' + mode + ':' + (row.ratio == null ? '' : row.ratio),
        type: 'number',
        step: '0.01',
        placeholder: '倍率',
        className: 'ratio',
        defaultValue: pricingNumberValue(row.ratio),
        disabled: lock,
        title: mode === 'manual' ? '当前按手填单价算；这里填的倍率要切回「倍率」模式才生效' : '实际价 = 基准价 × 倍率',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'ratio'),
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
            var lock = ctx.busy !== '' && ctx.busy !== offer.id
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
                  key: offer.id + ':in:' + offer.priceUnit + ':' + (offer.inPrice == null ? '' : offer.inPrice),
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  defaultValue: pricingNumberValue(offer.inPrice),
                  disabled: lock,
                  title: offer.priceUnit === 'per_call' ? '按次计费：这里填每次请求的价格' : '输入单价，失焦保存',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'inPrice'),
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  key: offer.id + ':out:' + offer.priceUnit + ':' + (offer.outPrice == null ? '' : offer.outPrice),
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  defaultValue: offer.priceUnit === 'per_call' ? '' : pricingNumberValue(offer.outPrice),
                  disabled: lock || offer.priceUnit === 'per_call',
                  title: offer.priceUnit === 'per_call' ? '按次计费不区分输入/输出' : '输出单价，失焦保存',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'outPrice'),
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  key: offer.id + ':ratio:' + (offer.ratio == null ? '' : offer.ratio),
                  type: 'number',
                  step: '0.01',
                  placeholder: '倍率',
                  className: 'ratio',
                  defaultValue: pricingNumberValue(offer.ratio),
                  disabled: lock,
                  title: '实际价 = 基准价 × 倍率（填了倍率还要切「倍率」模式才生效）',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'ratio'),
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
                    {
                      value: offer.priceUnit === 'per_1k' ? 'per_1k' : offer.priceUnit === 'per_call' ? 'per_call' : 'per_mtok',
                      disabled: lock,
                      title: '计价单位：按次 = 输入价填每次请求的价格',
                      style: { width: '64px' },
                      onChange: function (event) {
                        pricingSaveOffer(ctx, offer.id, { priceUnit: event.target.value }, '计价单位已切换')
                      },
                    },
                    h('option', { value: 'per_mtok' }, '/M'),
                    h('option', { value: 'per_1k' }, '/1k'),
                    h('option', { value: 'per_call' }, '/次'),
                  ),
                  h(
                    'select',
                    { value: offer.currency === 'CNY' ? 'CNY' : 'USD', disabled: lock, title: '单价币种', style: { width: '64px' }, onChange: function (event) { pricingSaveOffer(ctx, offer.id, { currency: event.target.value }, '币种已切换') } },
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
                  {
                    type: 'button',
                    className: 'ghost tiny',
                    disabled: lock,
                    title: '写成 0 价（manual + 输入/输出 0 + CNY），免费池判定按实际价算',
                    onClick: function () {
                      pricingSaveOffer(
                        ctx,
                        offer.id,
                        { pricingMode: 'manual', ratio: null, inPrice: 0, outPrice: 0, currency: 'CNY' },
                        '已标为免费，去「免费」页看看',
                      )
                    },
                  },
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
  var ignored = panelIgnoreList(state.settings)
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

  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var msgPair = React.useState(null)
  var msg = msgPair[0]
  var setMsg = msgPair[1]
  var dupPair = React.useState(null)
  var dupFor = dupPair[0]
  var setDupFor = dupPair[1]

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
      return { settings: settings, scores: scores, nameMap: nameMap, freeMap: freeMap, collapse: collapse, toggle: toggle, benchmarks: benchmarks, busy: busy, setBusy: setBusy, setMsg: setMsg, reload: props.onReload, dupFor: dupFor, setDupFor: setDupFor }
    },
    [settings, scores, nameMap, freeMap, collapse, toggle, benchmarks, busy, dupFor],
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

  var ignoredCount = panelIgnoreList(settings).length

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
    // 说明紧跟按钮（原来只有 hover 才看得到，忽略过模型之后才在下方提示区出现一截，
    // 用户反馈「文字说明和按钮分开了」）——可见文案常驻，提示区的条件段随之删除。
    h(
      'span',
      { className: 'hint', style: { margin: 0 } },
      '只影响本面板显示，网关与网页版不受影响',
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'with-icon',
        title: '只影响本面板显示：网关、探针、网页版都按它们自己的忽略名单走',
        onClick: function () {
          setIgnoredOpen(true)
        },
      },
      Icon('eye-off', { size: 14 }),
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
      '改价直接填，失焦即保存；切「倍率 / 价格」模式即时生效（切到「价格」时 daemon 会把当前算出的价格种进输入框）。「标为免费」写成 0 价，免费池判定按实际价算。',
    ),
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
        unpriced.length
          ? h(
              'button',
              { className: 'primary', type: 'button', onClick: function () { if (props.onGoTab) props.onGoTab('benchmark') } },
              '先去载入基准价',
            )
          : h(
              'button',
              { className: 'primary', type: 'button', onClick: function () { if (props.onGoTab) props.onGoTab('monitor') } },
              '去站点页',
            ),
      ),
      unpricedBlock,
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    toolbar,
    msg
      ? h(
          'p',
          { className: 'msg-line ' + (msg.kind === 'err' ? 'is-err' : 'is-ok'), role: msg.kind === 'err' ? 'alert' : 'status' },
          msg.text,
        )
      : null,
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

// ── 忽略模型弹窗（对齐网页版 openIgnoredModels） ──────────────────────
function IgnoredModelsModal(props) {
  var raw = props.state || {}
  var state = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
  var api = props.api || {}
  var settings = state.settings || {}
  var ignored = panelIgnoreList(settings).filter(Boolean).map(String)

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
    writeOp('PATCH', '/api/settings', panelIgnorePayload(settings, checkedNames.slice())).then(function (res) {
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
        h('h3', null, '忽略模型（本面板）'),
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
          '勾上的模型在本面板里不再显示（比价、决策、自动 DSH 用同一份名单）；点厂牌可整组勾选，随时取消。',
        ),
        h(
          'p',
          { className: 'hint' },
          '这份名单只属于 DSH 面板：网关仍按网页版的忽略名单路由，网页端显示也不受影响。',
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

