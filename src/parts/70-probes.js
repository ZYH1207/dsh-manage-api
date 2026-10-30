// ── 探针页：移植 web/app.js renderProbes()（2364-2481）────────────────
// 主动探测（POST /api/probes/run 在白名单里，真实可用）＋ 三个设置项
// （PATCH /api/settings 也在白名单里）。展开行照网页版两栏 detail-grid。

var PROBES_STATUS = {
  healthy: { label: '健康', cls: 'ok' },
  degraded: { label: '结果可疑', cls: 'warn' },
  unstable: { label: '不稳定', cls: 'danger' },
  inconclusive: { label: '证据不足', cls: '' },
  stale: { label: '评分过期', cls: 'warn' },
  unknown: { label: '未探测', cls: '' },
}

var PROBES_CONFIDENCE = {
  high: '置信度高',
  medium: '置信度中',
  low: '置信度低（样本少）',
}

var PROBES_INTERVALS = [
  [0, '关闭'],
  [30, '30 分钟'],
  [60, '1 小时'],
  [180, '3 小时'],
  [360, '6 小时'],
]

function probesStatus(status) {
  return PROBES_STATUS[status || 'unknown'] || PROBES_STATUS.unknown
}

function probesBlockedLabel(blocked) {
  if (typeof decisionBlockedLabel === 'function') return decisionBlockedLabel(blocked)
  var labels = { quota: '额度不足', budget: '单次预算超限', 'rate-limit': '限流中', 'model-missing': '模型不可用' }
  return ((blocked && labels[blocked.kind]) || '暂时不可用') + ' · 冷却中'
}

function probesChip(freeMap, providerId, group) {
  if (typeof pricingGroupChipClass === 'function') return pricingGroupChipClass(freeMap, providerId, group)
  return ''
}

function probesPct(value) {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  return Math.round(Number(value) * 100) + '%'
}

function probesFixed(value) {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  return Number(value).toFixed(2)
}

function probesRelTime(iso) {
  if (!iso) return '—'
  var stamp = new Date(iso).getTime()
  if (!isFinite(stamp)) return '—'
  var diff = Date.now() - stamp
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return Math.floor(diff / 86400000) + ' 天前'
}

function probesConfidence(level) {
  return PROBES_CONFIDENCE[level] || PROBES_CONFIDENCE.low
}

/** 展开行：把「质量怎么算的」和「为什么判它可疑」摊开给人看。 */
function probesDetail(score) {
  if (!score || !score.samples) {
    return h('div', { className: 'detail-grid' }, h('div', { className: 'detail-line dim' }, '还没探测过，点右侧「探测」跑一次。'))
  }
  var probe = score.lastProbe || {}
  var reasons = []
  if (probe.fingerprintOk === false) reasons.push('指纹不符：要求精确输出固定内容，返回的不是——模型可能被掉包')
  if (probe.truncated === true) reasons.push('输出被截断：要求数到 120 没数完，上游压低了 max_tokens')
  if (probe.billingInflated === true) reasons.push('用量虚报：返回的 prompt_tokens 远超实际请求规模')
  if (score.availability !== null && score.availability !== undefined && score.availability < 0.8) {
    reasons.push('可用率过低（' + probesPct(score.availability) + '）')
  }
  if (score.stale) reasons.push('评分已过期：超过有效期没重新探测')

  var evidenceLine =
    '（探针 ' +
    (score.samples || 0) +
    ' + 真实调用 ' +
    (score.trafficSamples || 0) +
    '）· 最近一次 ' +
    probesRelTime(score.evidenceAt) +
    ' · 置信度 ' +
    probesConfidence(score.confidence)

  return h(
    'div',
    { className: 'detail-grid' },
    h(
      'div',
      null,
      h('div', { className: 'detail-title' }, '质量怎么算出来的'),
      h(
        'div',
        { className: 'detail-line' },
        '可用率 ',
        h('b', null, probesPct(score.availability)),
        h('span', { className: 'dim' }, '= 探针 ' + (score.samples || 0) + ' 次 + 真实流量 ' + (score.trafficSamples || 0) + ' 次的成功率'),
      ),
      h(
        'div',
        { className: 'detail-line' },
        '完整性 ',
        h('b', null, probesFixed(score.integrity)),
        h(
          'span',
          { className: 'dim' },
          '= 指纹 ' +
            probesPct(score.fingerprintRate) +
            '×0.5 + 未截断 ' +
            probesPct(score.truncationRate) +
            '×0.3 + 计费正常 ' +
            probesPct(score.billingRate) +
            '×0.2',
        ),
      ),
      h(
        'div',
        { className: 'detail-line dim' },
        '通过率按 (通过+1)/(样本+1) 平滑：样本少时一次异常只轻微降权，判「结果可疑」另有更严的原始证据规则',
      ),
      score.realQualitySamples
        ? h(
            'div',
            { className: 'detail-line' },
            '真实响应抽样 ',
            h('b', null, score.realQualitySamples),
            ' 次',
            h(
              'span',
              { className: 'dim' },
              '异常 ' + (score.realBadRate === null || score.realBadRate === undefined ? '样本不足，暂不判定' : probesPct(score.realBadRate) + '（空回答 / 计费虚报）'),
            ),
          )
        : null,
      h(
        'div',
        { className: 'detail-line' },
        '质量 ',
        h('b', null, probesFixed(score.quality)),
        h('span', { className: 'dim' }, '= 可用率 × 完整性，低于 0.8 就不参与路由'),
      ),
      h(
        'div',
        { className: 'detail-line' },
        '证据 ',
        h('b', null, (score.samples || 0) + (score.trafficSamples || 0)),
        ' 个样本',
        h('span', { className: 'dim' }, evidenceLine),
      ),
    ),
    h(
      'div',
      null,
      h('div', { className: 'detail-title' }, '最近一次探测的证据'),
      reasons.length
        ? reasons.map(function (reason, index) {
            return h('div', { key: 'r' + index, className: 'detail-line danger' }, '· ' + reason)
          })
        : h('div', { className: 'detail-line dim' }, '各项正常'),
      probe.fingerprintRaw ? h('div', { className: 'detail-line mono dim' }, '实际返回：' + probe.fingerprintRaw) : null,
      probe.truncationDetail ? h('div', { className: 'detail-line mono dim' }, probe.truncationDetail) : null,
      probe.cacheDetail ? h('div', { className: 'detail-line mono dim' }, '缓存：' + probe.cacheDetail) : null,
      probe.identityClaim
        ? h(
            'div',
            { className: 'detail-line dim' },
            '模型自述：',
            h('b', null, probe.identityClaim),
            '（仅供参考——模型经常认错自己，不能当作掉包证据）',
          )
        : null,
      probe.error ? h('div', { className: 'detail-line danger' }, '错误：' + probe.error) : null,
    ),
  )
}

function probesOfferRows(provider, offers, ctx) {
  var rows = []
  offers.forEach(function (offer) {
    var score = ctx.scores[offer.id]
    var status = probesStatus(score && score.status)
    var hasDetail = Boolean(score && score.samples > 0)
    var isOpen = Boolean(ctx.expanded[offer.id])
    var busy = ctx.busyOffer === offer.id
    var statusCell = score && score.blocked
      ? h('span', { className: 'badge warn' }, probesBlockedLabel(score.blocked))
      : [
          h('span', { key: 'badge', className: 'badge ' + status.cls }, status.label),
          score && score.confidence !== 'high'
            ? h('div', { key: 'samples', className: 'sub' }, (score.samples || 0) + (score.trafficSamples || 0) + ' 样本')
            : null,
        ]

    rows.push(
      h(
        'tr',
        {
          key: offer.id,
          style: hasDetail ? { cursor: 'pointer' } : undefined,
          onClick: hasDetail
            ? function () {
                ctx.toggleDetail(offer.id)
              }
            : undefined,
        },
        h(
          'td',
          { className: 'mono' },
          offer.upstreamName,
          offer.group
            ? h('span', { className: 'badge ' + probesChip(ctx.freeMap, offer.providerId, offer.group) }, offer.group)
            : null,
          hasDetail ? h('span', { style: { color: 'var(--faint)', fontSize: '10px' } }, ' ▾') : null,
        ),
        h('td', null, statusCell),
        h('td', { className: 'num' }, probesPct(score && score.availability)),
        h('td', { className: 'num' }, probesPct(score && score.fingerprintRate)),
        h('td', { className: 'num' }, probesPct(score && score.truncationRate)),
        h('td', { className: 'num' }, probesPct(score && score.billingRate)),
        h('td', { className: 'num' }, score && score.ttftMs ? score.ttftMs + 'ms' : '—'),
        h(
          'td',
          { style: { color: 'var(--faint)' }, title: '探针：' + probesRelTime(score && score.lastProbeAt) },
          probesRelTime(score && score.evidenceAt),
        ),
        h(
          'td',
          { className: 'num' },
          h(
            'button',
            {
              type: 'button',
              className: 'ghost',
              disabled: ctx.probingAll || busy,
              title: 'POST /api/probes/run（limit: 1）：给这个供给发 5 个请求',
              onClick: function (event) {
                event.stopPropagation()
                ctx.runProbe(offer.id)
              },
            },
            busy ? '探测中…' : '探测',
          ),
        ),
      ),
    )

    if (hasDetail) {
      rows.push(
        h(
          'tr',
          { key: offer.id + ':detail', className: 'detail-row', hidden: !isOpen },
          h('td', { colSpan: 9 }, probesDetail(score)),
        ),
      )
    }
  })
  return rows
}

function ProbesView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var settings = state.settings || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var scores = state.scores || {}

  var collapsePair = React.useState({})
  var collapse = collapsePair[0]
  var setCollapse = collapsePair[1]
  var expandedPair = React.useState({})
  var expanded = expandedPair[0]
  var setExpanded = expandedPair[1]
  var busyPair = React.useState('')
  var busyOffer = busyPair[0]
  var setBusyOffer = busyPair[1]
  var allPair = React.useState(false)
  var probingAll = allPair[0]
  var setProbingAll = allPair[1]
  var noticePair = React.useState(null)
  var notice = noticePair[0]
  var setNotice = noticePair[1]
  var draftPair = React.useState({})
  var draft = draftPair[0]
  var setDraft = draftPair[1]
  var savingPair = React.useState(false)
  var savingSettings = savingPair[0]
  var setSavingSettings = savingPair[1]
  // 数值输入的编辑缓冲：打字时只改这里，失焦 / 回车才落库（网页版是 change 事件，等于失焦才写）
  var editsPair = React.useState({})
  var edits = editsPair[0]
  var setEdits = editsPair[1]

  var providersWithOffers = React.useMemo(
    function () {
      return providers.filter(function (provider) {
        return offers.some(function (offer) {
          return offer.providerId === provider.id
        })
      })
    },
    [providers, offers],
  )

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

  var toggleDetail = React.useCallback(function (offerId) {
    setExpanded(function (prev) {
      var next = Object.assign({}, prev)
      if (next[offerId]) delete next[offerId]
      else next[offerId] = true
      return next
    })
  }, [])

  function reloadNow() {
    if (!api.reload) return Promise.resolve()
    return Promise.resolve(api.reload()).catch(function () {})
  }

  function dropDraft(patch) {
    setDraft(function (prev) {
      var next = Object.assign({}, prev || {})
      Object.keys(patch).forEach(function (key) {
        delete next[key]
      })
      return next
    })
  }

  function saveSetting(patch, okText) {
    setDraft(function (prev) {
      return Object.assign({}, prev || {}, patch)
    })
    setSavingSettings(true)
    setNotice(null)
    writeOp('PATCH', '/api/settings', patch).then(function (res) {
      setSavingSettings(false)
      if (!res || !res.ok) {
        dropDraft(patch)
        setNotice({ tone: 'danger', text: (res && (res.error || res.message)) || '保存设置失败' })
        return
      }
      setNotice({ tone: 'ok', text: okText })
      reloadNow().then(function () {
        dropDraft(patch)
      })
    })
  }

  function runProbe(offerId) {
    setBusyOffer(offerId)
    setNotice(null)
    writeOp('POST', '/api/probes/run', { offerId: offerId, limit: 1 }).then(function (res) {
      setBusyOffer('')
      if (!res || !res.ok) {
        setNotice({ tone: 'danger', text: (res && (res.error || res.message)) || '探测失败' })
        return
      }
      var summary = res.summary || {}
      var text =
        summary.probed === undefined
          ? '探测完成，评分已更新'
          : '探测完成：看了 ' + summary.probed + ' 个供给' + (summary.failed ? '，' + summary.failed + ' 个失败' : '')
      setNotice({ tone: 'ok', text: text })
      reloadNow()
    })
  }

  function runAll() {
    setProbingAll(true)
    setNotice(null)
    writeOp('POST', '/api/probes/run', { limit: 5 }).then(function (res) {
      setProbingAll(false)
      if (!res || !res.ok) {
        setNotice({ tone: 'danger', text: (res && (res.error || res.message)) || '探测失败' })
        return
      }
      var summary = res.summary || {}
      setNotice({
        tone: 'ok',
        text: summary.probed === undefined ? '探测完成，最多取了 5 个最缺证据的供给' : '探测完成：' + summary.probed + ' 个供给' + (summary.failed ? '，' + summary.failed + ' 个失败' : ''),
      })
      reloadNow()
    })
  }

  var interval = draft.probeIntervalMinutes === undefined ? Number(settings.probeIntervalMinutes) || 0 : Number(draft.probeIntervalMinutes)
  var savedMaxAge = draft.scoreMaxAgeHours === undefined ? Number(settings.scoreMaxAgeHours) || 6 : Number(draft.scoreMaxAgeHours)
  var savedMaxTtft = draft.maxTtftMs === undefined ? Number(settings.maxTtftMs) || 0 : Number(draft.maxTtftMs)
  var maxAgeText = edits.age === undefined ? String(savedMaxAge) : edits.age
  var maxTtftText = edits.ttft === undefined ? String(savedMaxTtft) : edits.ttft

  function clearEdit(key) {
    setEdits(function (prev) {
      var next = Object.assign({}, prev || {})
      delete next[key]
      return next
    })
  }

  function commitMaxAge(event) {
    var hours = Number(edits.age === undefined ? event.target.value : edits.age)
    clearEdit('age')
    if (!isFinite(hours) || hours < 1 || hours > 72) return
    if (hours === savedMaxAge) return
    saveSetting({ scoreMaxAgeHours: hours }, '评分有效期改为 ' + hours + ' 小时')
  }

  function commitMaxTtft(event) {
    var ms = Number(edits.ttft === undefined ? event.target.value : edits.ttft)
    clearEdit('ttft')
    if (!isFinite(ms) || ms < 0 || ms > 60000) return
    if (ms === savedMaxTtft) return
    saveSetting({ maxTtftMs: ms }, ms > 0 ? '首字超过 ' + ms + 'ms 的供给将被跳过' : '已取消首字延迟限制')
  }

  function editsOnChange(key) {
    return function (event) {
      var value = event.target.value
      setEdits(function (prev) {
        var next = Object.assign({}, prev || {})
        next[key] = value
        return next
      })
    }
  }

  function commitOnEnter(commit) {
    return function (event) {
      if (event.key === 'Enter') {
        commit(event)
        event.target.blur()
      }
    }
  }

  var ctx = React.useMemo(
    function () {
      return {
        scores: scores,
        expanded: expanded,
        busyOffer: busyOffer,
        probingAll: probingAll,
        freeMap: freeMap,
        toggleDetail: toggleDetail,
        runProbe: runProbe,
      }
    },
    [scores, expanded, busyOffer, probingAll, freeMap, toggleDetail],
  )

  var panels = React.useMemo(
    function () {
      return providersWithOffers.map(function (provider) {
        var panelKey = 'probe:' + provider.id
        var isCollapsed = Boolean(collapse[panelKey])
        var own = offers.filter(function (offer) {
          return offer.providerId === provider.id
        })
        return h(
          'div',
          { className: 'table-wrap', key: provider.id },
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
                  toggle(panelKey)
                },
              },
              isCollapsed ? '▸' : '▾',
            ),
            h('span', { className: 'model' }, provider.name),
            h('span', { className: 'count' }, own.length + ' 个模型'),
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
                    h('th', null, '模型'),
                    h('th', null, '状态'),
                    h('th', { className: 'num' }, '可用率'),
                    h('th', { className: 'num' }, '指纹'),
                    h('th', { className: 'num' }, '截断'),
                    h('th', { className: 'num' }, '计费'),
                    h('th', { className: 'num' }, 'TTFT'),
                    h('th', { title: '最近一次有效证据（探针或真实调用）' }, '最近证据'),
                    h('th', null, ''),
                  ),
                ),
                h('tbody', null, probesOfferRows(provider, own, ctx)),
              ),
        )
      })
    },
    [providersWithOffers, offers, collapse, toggle, ctx],
  )

  if (!providersWithOffers.length) {
    return h(
      'section',
      { className: 'view wide' },
      h(
        'div',
        { className: 'empty' },
        h('h3', null, '还没有可探测的模型'),
        h('p', null, '先在「站点」里同步模型列表，并加一个 Key。'),
      ),
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    h(
      'div',
      { className: 'card' },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
        h(
          'div',
          { style: { flex: 1, minWidth: '240px' } },
          h('div', { style: { fontWeight: 500 } }, '主动探测'),
          h(
            'div',
            { className: 'hint', style: { margin: '4px 0 0' } },
            '每个模型发 5 个请求：指纹 + 计费、截断、缓存（连发两次）、身份自述。结果进入评分，路由据此排除可疑的站。',
          ),
        ),
        h(
          'button',
          {
            className: 'primary',
            type: 'button',
            disabled: probingAll || Boolean(busyOffer),
            title: 'POST /api/probes/run（limit: 5，取最缺证据的 5 个供给）',
            onClick: runAll,
          },
          Icon('play', { size: 14 }),
          probingAll ? '探测中…' : '探测全部（最多 5 个）',
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px dashed var(--border)',
          },
        },
        h(
          'label',
          { className: 'field-inline' },
          '自动探测',
          h(
            'select',
            {
              value: String(interval),
              disabled: savingSettings,
              onChange: function (event) {
                var minutes = Number(event.target.value)
                saveSetting(
                  { probeIntervalMinutes: minutes },
                  minutes ? '自动探测已开启：每 ' + (minutes >= 60 ? minutes / 60 + ' 小时' : minutes + ' 分钟') : '自动探测已关闭',
                )
              },
            },
            PROBES_INTERVALS.map(function (pair) {
              return h('option', { key: 'iv' + pair[0], value: String(pair[0]) }, pair[1])
            }),
          ),
        ),
        h(
          'label',
          { className: 'field-inline' },
          '评分有效期',
          h('input', {
            type: 'number',
            min: '1',
            max: '72',
            value: maxAgeText,
            disabled: savingSettings,
            style: { width: '68px' },
            title: '1 ~ 72 小时；回车或移开焦点才保存',
            onChange: editsOnChange('age'),
            onBlur: commitMaxAge,
            onKeyDown: commitOnEnter(commitMaxAge),
          }),
          '小时',
        ),
        h(
          'label',
          { className: 'field-inline' },
          '首字上限',
          h('input', {
            type: 'number',
            min: '0',
            max: '60000',
            step: '500',
            value: maxTtftText,
            disabled: savingSettings,
            style: { width: '82px' },
            title: '0 ~ 60000ms；回车或移开焦点才保存',
            onChange: editsOnChange('ttft'),
            onBlur: commitMaxTtft,
            onKeyDown: commitOnEnter(commitMaxTtft),
          }),
          'ms',
        ),
        h('span', { className: 'hint', style: { margin: 0 } }, '0 = 不限；超过上限的供给不参与路由'),
      ),
      h(
        'div',
        { className: 'hint', style: { marginTop: '8px' } },
        '有效期决定「允许错过几轮探测」：最近一次有效证据（探针或真实调用）超过它就判过期。探测间隔不能超过有效期的一半，否则供给会在两轮探测之间整段过期。',
      ),
    ),
    notice
      ? h(
          'div',
          { className: 'alert' + (notice.tone === 'danger' ? ' danger' : ''), style: { marginTop: '12px' } },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, notice.text)),
        )
      : null,
    h(
      'p',
      { className: 'hint' },
      '指纹 100% 表示每次都精确返回了要求的内容，低于这个值说明上游可能把请求转给了别的模型。截断一栏是「没被截断」的比例，计费一栏是「用量正常」的比例。',
    ),
    panels,
  )
}
