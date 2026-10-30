// ── 智能决策页：移植 web/app.js renderDecision()（2171-2281）──────────
// 与网页版的差异只有两处，都因为宿主写通道没开放：
//   · ↑↓ 手动排序 / 「恢复自动」走 PUT /api/decisions/:model/order → 禁用
//   · 「放行可疑供给」走 PATCH /api/settings → 白名单里有，保持可用
// decisions 只在全量 state 里（GET state?full=1），轻量快照没有，所以要自己取。

var DECISION_ORDER_TITLE = '手动排序：把该供给在候选表里上移/下移（保存到 daemon 的 manualOrder）'

function decisionBlockedLabel(blocked) {
  var labels = {
    quota: '额度不足',
    budget: '单次预算超限',
    'rate-limit': '限流中',
    'model-missing': '模型不可用',
  }
  var label = (blocked && labels[blocked.kind]) || '暂时不可用'
  return label + ' · 冷却中'
}

/** 与网页版 decisionState() 同序同文案：tooSlow → 放行标记 → blocked → 状态机。 */
function decisionStatus(candidate) {
  if (!candidate) return { label: '未探测', cls: '' }
  if (candidate.tooSlow) return { label: '太慢', cls: 'warn' }
  var passed = candidate.routable && candidate.probeOk === false
  function tag(label, cls) {
    return { label: passed ? label + ' · 已放行' : label, cls: passed ? 'warn' : cls }
  }
  if (candidate.blocked) return tag(decisionBlockedLabel(candidate.blocked), 'warn')
  if (candidate.status === 'stale') return tag('评分过期', 'warn')
  if (candidate.status === 'degraded') return tag('结果可疑', 'warn')
  if (candidate.status === 'unstable') return tag('不稳定', 'danger')
  if (candidate.status === 'inconclusive') return tag('证据不足', '')
  if (candidate.status === 'unknown') return tag('未探测', '')
  return { label: '可用', cls: 'ok' }
}

function decisionPriceText(cny, settings) {
  if (typeof pricingPriceText === 'function') return pricingPriceText(cny, settings)
  return fmtMoney(cny)
}

function decisionRow(candidate, index, decision, ctx) {
  var badge = decisionStatus(candidate)
  var isChosen = candidate.offerId === decision.chosenOfferId
  var reorder = ctx && ctx.reorder
  var arrows = candidate.routable
    ? [
        h(
          'button',
          {
            key: 'up',
            type: 'button',
            className: 'ghost tiny',
            disabled: !reorder || !ctx.canMove(decision, candidate, -1),
            title: DECISION_ORDER_TITLE,
            onClick: function () {
              if (reorder) reorder(decision.modelKey, candidate, -1)
            },
          },
          '↑',
        ),
        h(
          'button',
          {
            key: 'down',
            type: 'button',
            className: 'ghost tiny',
            disabled: !reorder || !ctx.canMove(decision, candidate, 1),
            title: DECISION_ORDER_TITLE,
            onClick: function () {
              if (reorder) reorder(decision.modelKey, candidate, 1)
            },
          },
          '↓',
        ),
      ]
    : null
  var showUpstream = candidate.upstreamName && candidate.upstreamName !== decision.modelKey
  var qualitySub =
    candidate.confidence && candidate.confidence !== 'high'
      ? h('div', { className: 'sub' }, fmtInt(candidate.samples) + ' 样本')
      : null

  return h(
    'tr',
    { key: candidate.offerId || 'c' + index, className: isChosen ? 'cheapest' : undefined },
    h('td', { style: { whiteSpace: 'nowrap' } }, arrows),
    h('td', { className: 'num', style: { color: 'var(--faint)' } }, index + 1),
    h(
      'td',
      null,
      candidate.providerName || '—',
      isChosen ? h('span', { key: 'chosen', className: 'badge ok' }, '当前') : null,
      showUpstream ? h('div', { className: 'sub mono' }, candidate.upstreamName) : null,
    ),
    h(
      'td',
      null,
      candidate.group
        ? h(
            'span',
            {
              className: 'badge ' + (typeof pricingGroupChipClass === 'function' ? pricingGroupChipClass(ctx.freeMap, candidate.providerId, candidate.group) : ''),
            },
            candidate.group,
          )
        : h('span', { style: { color: 'var(--faint)' } }, '默认'),
    ),
    h('td', { className: 'num' }, candidate.price === null || candidate.price === undefined ? '—' : decisionPriceText(candidate.price, ctx.settings)),
    h(
      'td',
      { className: 'num' },
      candidate.quality === null || candidate.quality === undefined ? '—' : Number(candidate.quality).toFixed(2),
      qualitySub,
    ),
    h(
      'td',
      { className: 'num' },
      candidate.effective === null || candidate.effective === undefined ? '—' : decisionPriceText(candidate.effective, ctx.settings),
    ),
    h('td', { className: 'num' }, candidate.ttftMs === null || candidate.ttftMs === undefined ? '—' : candidate.ttftMs + 'ms'),
    h(
      'td',
      null,
      h('span', { className: 'badge ' + badge.cls }, badge.label),
      candidate.statusReason ? h('div', { className: 'sub' }, candidate.statusReason) : null,
    ),
  )
}

function decisionPanel(decision, ctx) {
  var panelKey = 'decision:' + decision.modelKey
  var isCollapsed = Boolean(ctx.collapse[panelKey])
  var candidates = Array.isArray(decision.candidates) ? decision.candidates : []
  var rows = candidates.map(function (candidate, index) {
    return decisionRow(candidate, index, decision, ctx)
  })
  return h(
    'div',
    { className: 'table-wrap', key: decision.modelKey },
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
      h('span', { className: 'model mono' }, decision.modelKey),
      h('span', { className: 'spread' }, decision.chosenProviderName ? '当前选 ' + decision.chosenProviderName : '没有可用供给'),
      decision.manual
        ? h(
            'button',
            {
              type: 'button',
              className: 'ghost tiny',
              title: '清掉手动顺序，回到「有效成本 = 价格 ÷ 质量」自动排序',
              onClick: function () {
                if (ctx.resetOrder) ctx.resetOrder(decision.modelKey)
              },
            },
            '恢复自动',
          )
        : null,
    ),
    isCollapsed
      ? null
      : h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { style: { width: '66px' } }),
              h('th', { className: 'num' }, '#'),
              h('th', null, '站点'),
              h('th', null, '分组'),
              h('th', { className: 'num' }, '价格'),
              h('th', { className: 'num' }, '质量'),
              h('th', { className: 'num' }, '有效成本'),
              h('th', { className: 'num' }, '首字'),
              h('th', null, '状态'),
            ),
          ),
          h('tbody', null, rows),
        ),
  )
}

function DecisionUntrustedSwitch(props) {
  var settings = props.settings
  var saving = props.saving
  var checked = props.checked
  return h(
    'div',
    { className: 'switch-row', style: { marginBottom: '12px' } },
    h(
      'label',
      { className: 'switch', title: saving ? '正在保存…' : '写入 PATCH /api/settings 的 allowUntrusted' },
      h('input', {
        type: 'checkbox',
        checked: checked,
        disabled: saving,
        onChange: function (event) {
          props.onChange(event.target.checked)
        },
      }),
      h('span', { className: 'switch-track' }, h('span', { className: 'switch-knob' })),
      h(
        'span',
        { className: 'switch-text' },
        h('b', null, '放行可疑供给'),
        h('span', null, '探针判定可疑（指纹不符 / 输出截断 / 用量虚报 / 评分过期）的站，也按有效成本正常参与选站'),
      ),
    ),
    checked
      ? h(
          'div',
          { className: 'alert', style: { marginTop: '10px', background: 'var(--warn-soft)', borderColor: 'var(--warn-border)' } },
          h(
            'div',
            null,
            h('div', { className: 'name' }, '已放行：可疑的站会正常参与选站'),
            h(
              'div',
              { className: 'desc' },
              '它们仍然按「价格 ÷ 质量」排序——质量差一半，成本就翻倍，只有便宜到足够多才会被选中。首字上限仍然独立生效。如果你更在意输出是否可信，把这个开关关掉。',
            ),
          ),
        )
      : null,
  )
}

function DecisionView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var settings = state.settings || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var embedded = Array.isArray(state.decisions) ? state.decisions : null
  var at = api.state && api.state.at

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var collapsePair = React.useState({})
  var collapse = collapsePair[0]
  var setCollapse = collapsePair[1]
  var fetchedPair = React.useState(null)
  var fetched = fetchedPair[0]
  var setFetched = fetchedPair[1]
  var loadingPair = React.useState(false)
  var loading = loadingPair[0]
  var setLoading = loadingPair[1]
  var loadErrorPair = React.useState('')
  var loadError = loadErrorPair[0]
  var setLoadError = loadErrorPair[1]
  var savingPair = React.useState(false)
  var saving = savingPair[0]
  var setSaving = savingPair[1]
  var saveErrorPair = React.useState('')
  var saveError = saveErrorPair[0]
  var setSaveError = saveErrorPair[1]
  var pendingPair = React.useState(null)
  var pending = pendingPair[0]
  var setPending = pendingPair[1]

  var mountedRef = React.useRef(true)
  var lastFetchRef = React.useRef(0)
  var stampRef = React.useRef('')
  var stamp = String(at === undefined || at === null ? '' : at)

  React.useEffect(function () {
    mountedRef.current = true
    return function () {
      mountedRef.current = false
    }
  }, [])

  var loadDecisions = React.useCallback(
    function (force) {
      if (embedded) return
      var now = Date.now()
      if (!force) {
        if (stamp && stampRef.current === stamp && lastFetchRef.current) return
        if (lastFetchRef.current && now - lastFetchRef.current < 60000) return
      }
      setLoading(true)
      setLoadError('')
      fetchJson('state?full=1').then(function (res) {
        if (!mountedRef.current) return
        setLoading(false)
        if (!res || !res.ok) {
          setLoadError((res && res.error) || '读取全量快照失败')
          return
        }
        var body = res.body || {}
        var inner = body.state || body
        var list = inner && Array.isArray(inner.decisions) ? inner.decisions : []
        lastFetchRef.current = Date.now()
        stampRef.current = stamp
        setFetched(list)
      })
    },
    [embedded, stamp],
  )

  React.useEffect(
    function () {
      if (embedded) return
      if (!providers.length) return
      loadDecisions(false)
    },
    [embedded, providers.length, loadDecisions],
  )

  var decisions = embedded || fetched || []
  var freeMap = React.useMemo(
    function () {
      return typeof pricingGroupFreeMap === 'function' ? pricingGroupFreeMap(offers) : {}
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

  var visible = React.useMemo(
    function () {
      var text = String(search || '').trim().toLowerCase()
      if (!text) return decisions
      return decisions.filter(function (decision) {
        return String(decision.modelKey || '').toLowerCase().indexOf(text) >= 0
      })
    },
    [decisions, search],
  )

  // ── 手动排序（PUT /api/decisions/:model/order 已在宿主白名单）────────
  var orderBusyPair = React.useState('')
  var orderBusy = orderBusyPair[0]
  var setOrderBusy = orderBusyPair[1]
  var orderErrorPair = React.useState('')
  var orderError = orderErrorPair[0]
  var setOrderError = orderErrorPair[1]

  function candidateIds(decision) {
    return (decision.candidates || [])
      .map(function (candidate) {
        return candidate.offerId
      })
      .filter(function (id) {
        return Boolean(id)
      })
  }

  function canMove(decision, candidate, delta) {
    if (orderBusy) return false
    var ids = candidateIds(decision)
    var index = ids.indexOf(candidate.offerId)
    if (index < 0) return false
    var next = index + delta
    return next >= 0 && next < ids.length
  }

  function reorder(decision, candidate, delta) {
    if (!decision || orderBusy) return
    var ids = candidateIds(decision)
    var index = ids.indexOf(candidate.offerId)
    var next = index + delta
    if (index < 0 || next < 0 || next >= ids.length) return
    var moved = ids.slice()
    moved.splice(index, 1)
    moved.splice(next, 0, candidate.offerId)
    setOrderBusy(decision.modelKey)
    setOrderError('')
    writeOp('PUT', '/api/decisions/' + encodeURIComponent(decision.modelKey) + '/order', { order: moved })
      .then(function (res) {
        setOrderBusy('')
        if (!res || !res.ok) {
          setOrderError('保存顺序失败：' + ((res && res.error) || '未知错误'))
          return
        }
        if (loadDecisions) loadDecisions(true)
      })
      .catch(function (err) {
        setOrderBusy('')
        setOrderError('保存顺序失败：' + String(err && err.message ? err.message : err))
      })
  }

  function resetOrder(modelKey) {
    if (orderBusy) return
    setOrderBusy(modelKey)
    setOrderError('')
    writeOp('PUT', '/api/decisions/' + encodeURIComponent(modelKey) + '/order', { order: [] })
      .then(function (res) {
        setOrderBusy('')
        if (!res || !res.ok) {
          setOrderError('恢复自动失败：' + ((res && res.error) || '未知错误'))
          return
        }
        if (loadDecisions) loadDecisions(true)
      })
      .catch(function (err) {
        setOrderBusy('')
        setOrderError('恢复自动失败：' + String(err && err.message ? err.message : err))
      })
  }

  var ctx = React.useMemo(
    function () {
      return {
        settings: settings,
        collapse: collapse,
        toggle: toggle,
        freeMap: freeMap,
        canMove: canMove,
        reorder: reorder,
        resetOrder: resetOrder,
      }
    },
    [settings, collapse, toggle, freeMap, orderBusy],
  )

  var panels = React.useMemo(
    function () {
      return visible.map(function (decision) {
        return decisionPanel(decision, ctx)
      })
    },
    [visible, ctx],
  )

  var allowUntrusted = pending === null ? Boolean(settings.allowUntrusted) : Boolean(pending)

  function saveAllowUntrusted(next) {
    setPending(next)
    setSaving(true)
    setSaveError('')
    writeOp('PATCH', '/api/settings', { allowUntrusted: next }).then(function (res) {
      setSaving(false)
      if (!res || !res.ok) {
        setPending(null)
        setSaveError((res && (res.error || res.message)) || '保存失败')
        return
      }
      if (api.reload) {
        Promise.resolve(api.reload()).then(
          function () {
            setPending(null)
          },
          function () {
            setPending(null)
          },
        )
      } else {
        setPending(null)
      }
    })
  }

  if (!providers.length) {
    return h(
      'section',
      { className: 'view wide' },
      h(
        'div',
        { className: 'empty' },
        h('h3', null, '还没有站点'),
        h('p', null, '先添加站点并同步模型，这里会显示路由怎么选。'),
        h(
          'button',
          {
            className: 'primary',
            type: 'button',
            onClick: function () {
              if (props.onGoTab) props.onGoTab('monitor')
            },
          },
          Icon('plus', { size: 14 }),
          '新增站点',
        ),
      ),
    )
  }

  if (!decisions.length) {
    return h(
      'section',
      { className: 'view wide' },
      loading
        ? h('p', { className: 'hint' }, '正在读取全量快照（决策需要 GET state?full=1）…')
        : loadError
          ? h(
              'div',
              { className: 'alert' },
              h(
                'div',
                { className: 'grow' },
                h('div', { className: 'name' }, '读不到决策数据'),
                h('div', { className: 'desc' }, loadError),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ghost tiny',
                  onClick: function () {
                    loadDecisions(true)
                  },
                },
                Icon('refresh', { size: 14 }),
                '重试',
              ),
            )
          : h(
              'div',
              { className: 'empty' },
              h('h3', null, '还没有可决策的模型'),
              h('p', null, '先在比价页给模型填上价格。'),
            ),
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    h(
      'div',
      { className: 'toolbar' },
      h('input', {
        id: 'decision-search',
        className: 'search',
        type: 'search',
        placeholder: '搜索模型名…',
        value: search,
        onChange: function (event) {
          setSearch(event.target.value)
        },
      }),
      h('span', { className: 'hint', style: { margin: 0 } }, visible.length + ' / ' + decisions.length + ' 个模型'),
      h('span', { className: 'grow' }),
      h(
        'button',
        {
          type: 'button',
          className: 'with-icon',
          disabled: loading,
          title: '决策数据来自全量快照（GET state?full=1），大概 400KB，点了才重新取',
          onClick: function () {
            loadDecisions(true)
          },
        },
        Icon('refresh', { size: 14 }),
        loading ? '读取中…' : '刷新决策',
      ),
    ),
    loadError
      ? h(
          'div',
          { className: 'alert' },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, '决策没刷新成功'), h('div', { className: 'desc' }, loadError)),
        )
      : null,
    h(DecisionUntrustedSwitch, {
      settings: settings,
      loading: loading,
      saving: saving,
      checked: allowUntrusted,
      onChange: saveAllowUntrusted,
    }),
    saveError
      ? h(
          'div',
          { className: 'alert danger' },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, '保存失败'), h('div', { className: 'desc' }, saveError)),
        )
      : null,
    orderError
      ? h(
          'div',
          { className: 'alert danger', role: 'alert' },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, '排序保存失败'), h('div', { className: 'desc' }, orderError)),
        )
      : null,
    h('p', { className: 'hint' }, '默认按「有效成本 = 价格 ÷ 质量」排序，用 ↑↓ 手动调整「可用」那几条的先后——不可信的站不会因为你拖它而排到前面。'),
    h(
      'p',
      { className: 'hint' },
      '注意：',
      h('b', null, '同一个模型在不同站的状态是各自独立的'),
      '（A 站健康、B 站掉包很正常），所以这里按「站 × 模型」逐条评估，状态下方会写明具体原因。',
    ),
    panels,
  )
}
