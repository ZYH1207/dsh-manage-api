    /**
     * 免费池视图。移植自网页版 renderFree()（web/app.js:1730-1748）与它的两个
     * 纯渲染模块 web/free-relay.js / web/free-platform.js。
     *
     * 两栏（中转站免费模型 / 平台积分）各自空态兜底；分段控件永远显示——
     * 它就是这一页的导航，藏起来会让人以为「没有免费模型就没有平台栏」。
     *
     * 写操作受限：免费池的增删 / 签到 / 授权 / 配额都不在插件写白名单里，
     * 一律渲染成禁用按钮 + title 说明，不假装能点。
     */

    var FREE_LOCKED = '当前插件版本未开放（免费池的写操作不在插件的写白名单里）'
    var FREE_UNIT = { request: '次', token: 'token', credit: '积分' }
    var FREE_DAY = 86400000
    var FREE_WIN = { day: FREE_DAY, month: 30 * FREE_DAY }
    var FREE_MIN = 0.8

    function freeEnv(props) {
      var p = props || {}
      var api = p.api || {}
      return { api: api, state: pickState({ state: p.state || api.state || null }), reload: p.onReload || api.reload || function () {} }
    }

    function freePad(n) { return String(n).length < 2 ? '0' + n : String(n) }

    /** 大数字压缩，避免配额列把表格撑变形（与 free-relay.js 同口径）。 */
    function freeQty(value) {
      var n = Number(value)
      if (!isFinite(n)) return '—'
      return n >= 1e6 ? Math.round(n / 1e5) / 10 + 'M' : n >= 1e3 ? Math.round(n / 100) / 10 + 'k' : String(Math.round(n))
    }

    /** 千分位：token 额度动辄七位数，8000000 没法一眼读。 */
    function freeInt(value) {
      if (!isFinite(Number(value))) return '—'
      return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function freeReset(iso) {
      var d = new Date(iso)
      if (!isFinite(d.getTime())) return ''
      return freePad(d.getMonth() + 1) + '-' + freePad(d.getDate()) + ' ' + freePad(d.getHours()) + ':' + freePad(d.getMinutes())
    }

    /** 只认能算出上限的配额；「不限量」返回 null，与「额度为 0」是两件事。 */
    function freeReadQuota(raw) {
      if (!raw || typeof raw !== 'object') return null
      var limit = Number(raw.limit)
      if (!isFinite(limit)) return null
      var used = Number(raw.used)
      return {
        unit: FREE_UNIT[raw.unit] ? raw.unit : 'request',
        limit: limit,
        used: isFinite(used) ? used : 0,
        window: raw.window === 'month' ? 'month' : 'day',
        resetAt: raw.resetAt || null,
      }
    }

    /** 还能撑几天：剩余量 ÷ 近期消耗速率（窗口刚开始半天不足以估速率）。 */
    function freeDaysLeft(q, now) {
      if (!q) return null
      var win = FREE_WIN[q.window] || FREE_DAY
      var reset = q.resetAt ? new Date(q.resetAt).getTime() : NaN
      if (!isFinite(reset)) return null
      var elapsed = (win - (reset - now)) / FREE_DAY
      if (!(elapsed >= 0.5)) return null
      var perDay = q.used / Math.min(elapsed, win / FREE_DAY)
      return perDay > 0 ? Math.max(0, (q.limit - q.used) / perDay) : null
    }

    /** 闸门兜底：服务端（core/rank-free.js）已给出 offer.gate，这里只在老快照没带时按同一套阈值重算。 */
    function freeJudge(offer, score) {
      var q = freeReadQuota(offer && offer.freeQuota)
      function out(label, why) { return { quota: q, gate: { label: label, why: why } } }
      if (q && q.used > q.limit) return out('超出配额', '用量已经超过这个窗口的上限，等重置后再用')
      if (q && q.limit - q.used <= 0) return out('额度用尽', '这个窗口的免费额度已经用完')
      if (!score || !score.samples) return out('未探测', '还没有探测记录，免费站不能靠猜')
      if (score.stale === true) return out('评分过期', '上次探测太久远，先重新探测再放行')
      if (score.blocked) return out('冷却中', score.blockedLabel || '额度不足 / 限流中，稍后再试')
      if (score.availability === null || score.availability === undefined) return out('证据不足', '探针多次失败（额度/限流），还没有可靠性证据')
      if (typeof score.availability === 'number' && score.availability < FREE_MIN) return out('不稳定', '可用率 ' + Math.round(score.availability * 100) + '% · 低于门槛 80%')
      if (Array.isArray(score.integrityFaults) && score.integrityFaults.length) return out('结果可疑', String(score.integrityFaults.join('、')))
      if (typeof score.fingerprintRate === 'number' && score.fingerprintRate < FREE_MIN) return out('指纹不符', '指纹 ' + Math.round(score.fingerprintRate * 100) + '% · 低于门槛 80%')
      // truncationRate 是「未截断比例」：判据是 < 0.8
      if (typeof score.truncationRate === 'number' && score.truncationRate < FREE_MIN) return out('输出截断', '未截断 ' + Math.round(score.truncationRate * 100) + '% · 低于门槛 80%')
      return { quota: q, gate: null }
    }

    /** 首字母色块：颜色由名字哈希决定，同一个平台每次渲染颜色都一样。 */
    function freeAvatar(label) {
      var text = (String(label || '?').trim() || '?')
      var hash = 0
      for (var i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360
      var style = { width: '34px', height: '34px', borderRadius: '9px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 600, color: '#fff', background: 'hsl(' + hash + ' 46% 45%)' }
      return h('span', { style: style }, text.charAt(0).toUpperCase())
    }

    /** 「现在能用多少」：本周期剩余优先；只读得到剩余量时直接用剩余量。 */
    function freeRemaining(account) {
      var q = account && account.quota
      if (!q) return 0
      var cycle = Number(q.cycleRemaining)
      if (isFinite(cycle)) {
        if (q.remainingIncludesOneTime && isFinite(Number(q.remaining))) return Math.max(0, Number(q.remaining))
        return Math.max(0, cycle)
      }
      if (isFinite(Number(q.remaining))) return Math.max(0, Number(q.remaining))
      return isFinite(Number(q.limit)) ? Math.max(0, Number(q.limit) - (Number(q.used) || 0)) : 0
    }

    /** 同一租户的多张卡不能重复计入总额（WorkBuddy 国际版/国内版读回同一份余额）。 */
    function freeDedupe(accounts) {
      var seen = {}
      var out = []
      ;(accounts || []).forEach(function (a) {
        var key = a && a.quota && a.quota.tenantKey
        if (key) {
          if (seen[key]) return
          seen[key] = true
        }
        out.push(a)
      })
      return out
    }

    /** 一张卡下所有账号的额度汇总；不同单位不能相加，只按第一份额度的单位算。 */
    function freeAggregate(accounts) {
      var rows = (accounts || []).map(function (a) { return a && a.quota }).filter(function (q) {
        return q && (Number(q.limit) > 0 || isFinite(Number(q.remaining)))
      })
      if (!rows.length) return null
      var unit = rows[0].unit || 'credit'
      var same = rows.filter(function (q) { return (q.unit || 'credit') === unit })
      var now = Date.now()
      var resets = same.map(function (q) { return q.resetAt }).filter(function (at) { return at && new Date(at).getTime() > now }).sort()
      function sum(pick) {
        return same.reduce(function (t, q) { var n = Number(pick(q)); return t + (isFinite(n) ? n : 0) }, 0)
      }
      function nums(pick) { return same.map(pick).filter(function (n) { return isFinite(n) }) }
      var cycles = nums(function (q) { return Number(q.cycleRemaining) })
      var sizes = nums(function (q) { return Number(q.cycleSize) })
      var bonuses = nums(function (q) { return Number(q.bonusTokens) }).filter(function (n) { return n > 0 })
      return {
        unit: unit,
        window: same[0].window === 'month' ? 'month' : 'day',
        hasLimit: same.some(function (q) { return Number(q.limit) > 0 }),
        limit: sum(function (q) { return q.limit }),
        used: sum(function (q) { return q.used }),
        remaining: same.reduce(function (t, q) { return t + freeRemaining({ quota: q }) }, 0),
        capacity: sum(function (q) { return q.remaining }),
        cycleRemaining: cycles.length ? cycles.reduce(function (a, b) { return a + b }) : null,
        cycleSize: sizes.length ? sizes.reduce(function (a, b) { return a + b }) : null,
        bonusTokens: bonuses.length ? bonuses.reduce(function (a, b) { return a + b }) : null,
        resetAt: resets[0] || null,
      }
    }

    /** 有 resetAt 就用它；没有就按窗口推下一个重置点。 */
    function freeResetAt(q) {
      if (q && q.resetAt) return q.resetAt
      if (!q || !q.window) return null
      var now = new Date()
      if (q.window === 'month') return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    }

    function freeRelative(iso) {
      if (!iso) return '—'
      var diff = new Date(iso).getTime() - Date.now()
      if (!isFinite(diff)) return '—'
      if (diff <= 0) return '即将重置'
      return diff / 3600000 < 1 ? Math.max(1, Math.round(diff / 60000)) + ' 分钟后' : Math.round(diff / 3600000) + ' 小时后'
    }

    function freeDayKey(value) {
      var d = value instanceof Date ? value : new Date(value === undefined ? Date.now() : value)
      if (isNaN(d.getTime())) return ''
      return d.getFullYear() + '-' + freePad(d.getMonth() + 1) + '-' + freePad(d.getDate())
    }

    function freeStat(k, v, unit) {
      return h('div', { className: 'stat' }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v, unit ? h('small', null, unit) : null))
    }

    function freeStatIcon(k, v, unit, iconName, tint) {
      return h(
        'div',
        { className: 'stat' },
        h('div', { className: 'stat-main' }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v, unit ? h('small', null, unit) : null)),
        h('div', { className: 'stat-icon ' + (tint || 'tint-muted') }, Icon(iconName, { size: 15 })),
      )
    }

    function freeLocked(label, cls) {
      return h('button', { type: 'button', className: cls || undefined, disabled: true, title: FREE_LOCKED }, label)
    }

    /** 两栏共用的边界说明（.note-card 原文整段照抄）。 */
    function FreeNote() {
      return h(
        'div',
        { className: 'note-card' },
        h('b', null, '免费池独立于付费比价'),
        h('span', { className: 'desc', style: { display: 'block', marginTop: '2px' } },
          '这里的供给不参与「最便宜」判断和自动选站。只有你在客户端写 ',
          h('code', null, 'free/'),
          ' 前缀，或把地址换成 ',
          h('code', null, '/free/v1'),
          ' 时才会用到。'),
      )
    }

    // ── 中转站侧（free-relay.js）──────────────────────────────────
    function FreeRelayPane(props) {
      var relay = Array.isArray(props.relay) ? props.relay : []
      var providers = Array.isArray(props.providers) ? props.providers : []
      var crossPane = props.crossPane || 'remaining'

      var model = React.useMemo(
        function () {
          var names = {}
          providers.forEach(function (p) { names[p.id] = p.name })
          var now = Date.now()
          var rows = relay.map(function (offer) {
            var score = offer.score || null
            var judged = freeJudge(offer, score)
            // 服务端已经算过闸门与剩余天数，以它为准；本地 judge 只作兜底
            var gate = Object.prototype.hasOwnProperty.call(offer, 'gate') ? offer.gate : judged.gate
            var daysLeft = Object.prototype.hasOwnProperty.call(offer, 'daysLeft')
              ? offer.daysLeft
              : gate ? null : freeDaysLeft(judged.quota, now)
            return { offer: offer, score: score, quota: judged.quota, gate: gate, daysLeft: daysLeft }
          })
          function ttft(row) { return row.score && typeof row.score.ttftMs === 'number' ? row.score.ttftMs : Infinity }
          function byTtft(a, b) { return ttft(a) - ttft(b) }
          function byDaysLeft(a, b) {
            if (a.daysLeft === null && b.daysLeft === null) return byTtft(a, b)
            if (a.daysLeft === null) return 1
            if (b.daysLeft === null) return -1
            return a.daysLeft !== b.daysLeft ? b.daysLeft - a.daysLeft : byTtft(a, b)
          }
          var usable = rows.filter(function (r) { return !r.gate })
          var blocked = rows.filter(function (r) { return r.gate })
          // relay 偏好下不重排：用户选了「中转站优先」，同栏内就按导入顺序来
          var ordered = crossPane === 'relay' ? usable.concat(blocked) : usable.sort(byDaysLeft).concat(blocked)
          function avgOf(pick) {
            var values = rows.map(pick).filter(function (v) { return typeof v === 'number' })
            return values.length ? values.reduce(function (s, v) { return s + v }, 0) / values.length : null
          }
          return {
            names: names,
            ordered: ordered,
            usableCount: usable.length,
            total: rows.length,
            avgFp: avgOf(function (r) { return r.score && r.score.fingerprintRate }),
            avgTtft: avgOf(function (r) { return r.score && r.score.ttftMs }),
            longest: usable.reduce(function (best, r) {
              return r.daysLeft !== null && (best === null || r.daysLeft > best) ? r.daysLeft : best
            }, null),
          }
        },
        [relay, providers, crossPane],
      )

      if (!relay.length) {
        return h(
          'div',
          { className: 'empty' },
          h('h3', null, '还没有免费模型'),
          h('p', null, '免费池只收「实际价为 0」的模型。分组名叫「免费」但价格没填的，不算——空不等于 0。'),
          h('p', { className: 'hint', style: { margin: '0 0 14px' } },
            '去「比价」页把它的输入/输出价填 0，或直接点「标为免费」；也可以先「导入倍率」，实际价算下来是 0 的会自动进来。'),
          h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
            freeLocked('去比价页标免费', 'primary'),
            freeLocked('去站点导入倍率', 'ghost')),
        )
      }

      // 只剩半天时整数会显示成「0 天」，保留一位小数才看得出「快没了」
      var longestText =
        model.longest === null ? '—' : model.longest >= 10 ? String(Math.round(model.longest)) : String(Math.round(model.longest * 10) / 10)

      var rows = model.ordered.map(function (row) {
        var offer = row.offer || {}
        var score = row.score || {}
        var fp = typeof score.fingerprintRate === 'number' ? Math.round(score.fingerprintRate * 100) + '%' : '—'
        var ttft = typeof score.ttftMs === 'number' ? Math.round(score.ttftMs) + 'ms' : '—'
        var group = offer.group
          ? h('span', { className: 'gtag vchip-free' }, offer.group)
          : h('span', { style: { color: 'var(--faint)' } }, '默认')
        var status = row.gate
          ? h(Badge, { tone: 'warn', title: row.gate.why || row.gate.label }, row.gate.label)
          : h(Badge, { tone: 'ok' }, '可用')
        var quotaNode
        if (!row.quota) {
          quotaNode = h('div', { className: 'quota' },
            h('span', { className: 'quota-text', title: '未设置配额' }, '—'),
            h('input', { type: 'number', min: 0, value: '', readOnly: true, disabled: true, title: FREE_LOCKED, style: { width: '70px' } }))
        } else {
          var q = row.quota
          var ratio = q.limit > 0 ? Math.min(1, q.used / q.limit) : 1
          // 快用完是黄，用满是灰：进度条承担「还能不能继续用」的判断
          var fillCls = ratio >= 1 ? ' empty' : ratio >= 0.8 ? ' warn' : ''
          var title = (q.window === 'month' ? '每月重置' : '每天重置') + (q.resetAt ? ' · ' + freeReset(q.resetAt) : '')
          quotaNode = h('div', { className: 'quota' },
            h('div', { className: 'quota-track' },
              h('div', { className: 'quota-fill' + fillCls, style: { width: Math.round(ratio * 100) + '%' } })),
            h('span', { className: 'quota-text', title: title }, freeQty(q.used) + '/' + freeQty(q.limit) + ' ' + FREE_UNIT[q.unit]),
            h('input', { type: 'number', min: 0, value: String(q.limit), readOnly: true, disabled: true, title: FREE_LOCKED, style: { width: '70px' } }))
        }
        return {
          cells: [
            { cls: 'mono', node: offer.upstreamName || '—' },
            model.names[offer.providerId] || '—',
            group,
            quotaNode,
            { cls: 'mono', node: fp },
            { cls: 'mono', node: ttft },
            status,
          ],
        }
      })

      return h('div', null,
        h('div', { className: 'stats' },
          freeStat('可用供给', model.usableCount + '/' + model.total, '条'),
          freeStat('平均指纹', model.avgFp === null ? '—' : Math.round(model.avgFp * 100), model.avgFp === null ? '' : '%'),
          freeStat('平均首字', model.avgTtft === null ? '—' : Math.round(model.avgTtft), model.avgTtft === null ? '' : 'ms'),
          freeStat('预计撑最久', longestText, model.longest === null ? '' : '天')),
        h(Table, { heads: ['模型', '站点', '分组', '配额', '指纹', '首字', '状态'], rows: rows, scroll: true }),
        h('p', { className: 'hint', style: { marginTop: '10px' } },
          '免费模型是探针最有价值的场景：没人会白送，最常见的偷工方式是拿小模型冒充大模型。指纹不到 100% 的那几行值得点开看看。'))
    }

    // ── 平台侧（free-platform.js）────────────────────────────────
    /** 手动建一个平台：字段与网页版一致，但「保存」要 POST /api/free/platforms（未开放）。 */
    function freeManualForm(onCancel) {
      return h('div', { className: 'form-card' },
        h('h3', { style: { margin: '0 0 4px' } }, '添加一个平台'),
        h('p', { className: 'hint', style: { margin: '0 0 14px' } },
          '只记额度也能用：能算「还能撑几天」、到期前提醒你。自动读取模型目录要等连接器。'),
        h('div', { className: 'inline-form', style: { flexWrap: 'wrap', gap: '12px' } },
          h('label', { className: 'field-inline' }, '常用平台',
            h('select', { style: { width: '160px' }, defaultValue: '' }, h('option', { value: '' }, '自定义'))),
          h('label', { className: 'field-inline' }, '名称',
            h('input', { type: 'text', placeholder: 'Trae', style: { width: '130px' }, defaultValue: '' })),
          h('label', { className: 'field-inline' }, '额度上限',
            h('input', { type: 'number', min: 0, step: 1, placeholder: '100', style: { width: '90px' }, defaultValue: '' })),
          h('label', { className: 'field-inline' }, '单位',
            h('select', { style: { width: '88px' }, defaultValue: 'credit' },
              h('option', { value: 'credit' }, '积分'),
              h('option', { value: 'request' }, '次'),
              h('option', { value: 'token' }, 'token'))),
          h('label', { className: 'field-inline' }, '窗口',
            h('select', { style: { width: '88px' }, defaultValue: 'day' },
              h('option', { value: 'day' }, '每天'),
              h('option', { value: 'month' }, '每月')))),
        h('div', { className: 'form-actions' },
          freeLocked('保存', 'primary'),
          h('button', { type: 'button', className: 'ghost', onClick: onCancel }, '取消')))
    }

    var FREE_HELP = [
      '· 额度上限 —— 平台给的总量，写数字就行（20、100、500000）',
      '· 单位 —— 平台按「次」给就选次，按积分就选积分，按 token 就选 token；拿不准选积分',
      '· 窗口 —— 每天重置选「每天」，每月重置选「每月」',
      '· 平台名 —— 随便起，只用于你自己识别',
      '· 连接 —— 想让程序自动读额度就用「连接」（WorkBuddy / CodeBuddy 支持）；其余平台先手动记，用完了自己更新',
    ].join('\n')

    function FreePlatformPane(props) {
      var list = Array.isArray(props.platforms) ? props.platforms : []
      var allAccounts = Array.isArray(props.accounts) ? props.accounts : []
      var presets = Array.isArray(props.presets) ? props.presets : []
      var formOpen = Boolean(props.formOpen)
      var onToggleForm = props.onToggleForm || function () {}
      var pending = props.pending || null

      // 内置平台里「还没添加」的那些，作为卡片直接摆出来——用户不用先知道自己要加什么
      var addedPresets = {}
      var addedConnectors = {}
      list.forEach(function (p) {
        if (p.presetId) addedPresets[p.presetId] = true
        if (p.connectorId && p.connectorId !== 'manual') addedConnectors[p.connectorId] = true
      })
      var available = presets.filter(function (p) {
        if (addedPresets[p.id]) return false
        return !(p.connectorId !== 'manual' && addedConnectors[p.connectorId])
      })

      var presetBlock = available.length
        ? h('div', null,
            h('h3', { className: 'section-title', style: { marginTop: '20px' } }, '内置平台'),
            h('div', { className: 'grid preset-grid' }, available.map(function (p) {
              return h('div', { className: 'preset-card', key: p.id },
                h('div', { className: 'preset-main' }, freeAvatar(p.label),
                  h('div', { className: 'preset-text' }, h('h3', null, p.label), h('div', { className: 'meta' }, p.note || ''))),
                h('div', { className: 'preset-actions' },
                  freeLocked('添加', 'ghost tiny'),
                  p.connectorId !== 'manual' ? freeLocked('添加并连接', 'tiny') : null))
            })))
        : null

      var helpBlock = h('div', { className: 'alert calm', style: { marginTop: '18px', alignItems: 'flex-start' } },
        h('span', { className: 'grow', style: { lineHeight: 1.75 } },
          h('b', null, '参数怎么填'),
          h('span', { className: 'desc', style: { display: 'block', marginTop: '2px', whiteSpace: 'pre-line' } }, FREE_HELP)))

      if (!list.length) {
        return h('div', null, presetBlock, helpBlock,
          formOpen
            ? freeManualForm(onToggleForm)
            : h('div', { style: { marginTop: '14px' } },
                h('button', { type: 'button', disabled: true, title: FREE_LOCKED, onClick: onToggleForm },
                  '手动添加一个不在列表里的平台')))
      }

      function isConnected(p) { return Boolean(p && p.connected) }
      var connected = list.filter(isConnected)

      // 汇总只看「现在能用多少」，并按单位分开算：积分和 token 相加是无意义的数字
      var totals = {}
      freeDedupe(allAccounts).forEach(function (a) {
        var unit = (a && a.quota && a.quota.unit) || 'credit'
        var value = freeRemaining(a)
        if (!isFinite(value)) return
        totals[unit] = (totals[unit] || 0) + value
      })
      var units = Object.keys(totals)
      var totalLabel = units.length === 0
        ? '0'
        : units.length === 1
          ? freeInt(totals[units[0]])
          : units.map(function (u) { return freeInt(totals[u]) + ' ' + (FREE_UNIT[u] || '积分') }).join(' · ')

      var today = freeDayKey()
      var checkable = allAccounts.filter(function (a) {
        var owner = null
        list.forEach(function (p) { if (p.id === a.platformId) owner = p })
        return owner ? owner.canCheckin !== false : false
      })
      var checkedToday = checkable.filter(function (a) { return a.lastCheckinAt && freeDayKey(a.lastCheckinAt) === today }).length

      var cards = list.map(function (platform) {
        var isOn = isConnected(platform)
        var mine = allAccounts.filter(function (a) { return a.platformId === platform.id })
        var quota = freeAggregate(freeDedupe(mine))
        var name = platform.label || platform.connectorId || '—'
        var unitLabel = FREE_UNIT[(quota && quota.unit) || 'credit'] || '积分'
        var dot = h('span', { title: isOn ? '已连接' : '未连接', style: { display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', marginLeft: '7px', verticalAlign: 'middle', background: isOn ? 'var(--accent)' : 'var(--faint)' } })
        // 自动连接走的是平台未公开的接口，标出来免得用户以为是官方支持
        var beta = platform.connectorId && platform.connectorId !== 'manual'
          ? h('span', { className: 'badge', style: { marginLeft: '7px' }, title: '自动连接使用平台未公开接口，可能随平台升级失效' }, '实验性')
          : null
        var isPending = Boolean(pending) && pending.platformId === platform.id
        var meta = isOn
          ? mine.length + ' 个账号'
          : isPending
            ? pending.local ? '正在读本机客户端里的登录态…' : '等待授权… 已 ' + Math.round((pending.elapsedMs || 0) / 1000) + ' 秒'
            : '尚未连接'

        var body
        if (isOn) {
          var when = (quota && quota.window) === 'month' ? '本月' : '今日'
          var hasLimit = Boolean(quota && quota.hasLimit)
          var pct = hasLimit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0
          var fillClass = pct >= 100 ? ' empty' : pct >= 80 ? ' warn' : ''
          var quotaText = !quota ? '—' : hasLimit
            ? when + '已用 ' + freeInt(quota.used) + '/' + freeInt(quota.limit) + ' ' + unitLabel
            : '剩余 ' + freeInt(quota.remaining) + ' ' + unitLabel
          var resetText = freeRelative(freeResetAt(quota))
          var cycle = Number(quota && quota.cycleRemaining)
          var capacity = Number(quota && quota.capacity)
          var hasCycle = isFinite(cycle)
          var cycleLine = !hasCycle ? null : cycle <= 0
            ? h('div', { className: 'hint', style: { color: 'var(--danger)' } }, '本周期已用满，' + resetText + '重置')
            : h('div', { className: 'hint' }, isFinite(capacity) && capacity > 0
                ? '本周期还剩 ' + freeInt(cycle) + '/' + freeInt(capacity) + ' ' + unitLabel
                : '本周期还剩 ' + freeInt(cycle) + ' ' + unitLabel)
          var capacityLine = hasCycle && isFinite(capacity) && capacity > 0 && capacity !== cycle
            ? h('div', { className: 'hint' }, '套餐容量 ' + freeInt(capacity) + ' ' + unitLabel)
            : null
          var bonus = Number(quota && quota.bonusTokens)
          var bonusLine = isFinite(bonus) && bonus > 0
            ? h('div', { className: 'hint' }, '另有赠量 ' + freeInt(bonus) + ' ' + unitLabel + '（按次消耗，不计入本周期）')
            : null
          body = h('div', null,
            h('div', { className: 'quota', style: { marginTop: '12px' } },
              hasLimit ? h('div', { className: 'quota-track' },
                h('div', { className: 'quota-fill' + fillClass, style: { width: pct + '%' } })) : null,
              h('span', { className: 'quota-text' }, quotaText)),
            cycleLine, capacityLine, bonusLine,
            hasCycle ? null : h('div', { className: 'hint' }, '下次重置：' + resetText))
        } else if (isPending) {
          body = h('div', null,
            h('div', { className: 'hint' }, pending.local
              ? 'ZCode 额度就在本机客户端里，正在读取…读到就会自动出现在卡片上。'
              : '已打开授权页。在浏览器里登录，如果弹出「打开 WorkBuddy」，先点取消、留在网页上，直到页面显示授权成功。'),
            pending.reason ? h('div', { className: 'hint', style: { color: 'var(--faint)' } }, '最近状态：' + pending.reason) : null)
        } else {
          body = h('div', { className: 'hint' }, '连接后自动读取模型目录、剩余积分与重置时间。')
        }

        var del = freeLocked('删除', 'ghost danger')
        var actions = isOn
          ? [platform.canCheckin !== false ? freeLocked('签到', 'ghost') : null,
             freeLocked('账号', 'ghost'), freeLocked('刷新', 'ghost'), freeLocked('诊断', 'ghost'), del]
          : isPending
            ? [freeLocked('重新打开授权页', 'ghost'), freeLocked('取消', 'ghost'), del]
            : [h('span', { className: 'badge' }, '尚未连接'), freeLocked('连接'), del]

        return h('div', { className: 'card', key: platform.id || platform.connectorId },
          h('div', { className: 'card-head' },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
              freeAvatar(name),
              h('div', { style: { minWidth: 0 } },
                h('h3', { style: { display: 'flex', alignItems: 'center' } }, name, dot, beta),
                h('div', { className: 'meta' }, meta)))),
          body,
          h('div', { className: 'card-actions', style: { marginTop: '12px' } }, actions))
      })

      return h('div', null,
        h('div', { className: 'stats' },
          freeStatIcon('已连接平台', connected.length, '个', 'servers', 'tint-muted'),
          freeStatIcon('账号', allAccounts.length, '个', 'layers', 'tint-accent'),
          freeStatIcon('剩余额度', totalLabel, '', 'wallet', 'tint-muted'),
          freeStatIcon('今日已签', checkedToday + '/' + checkable.length, '', 'receipt', 'tint-warn')),
        h('div', { className: 'note-card', style: { marginBottom: '10px' } },
          h('b', null, '平台积分仅用于展示余额'),
          h('span', { className: 'desc', style: { display: 'block', marginTop: '2px' } },
            '各平台对第三方调用检测严格（反代/客户端识别），为避免账号风控，「把平台额度接入网关代发对话」已暂停开发。这里的积分只能看、不能通过网关消耗；要在客户端用，请去对应平台自己的入口。')),
        h('div', { className: 'toolbar', style: { margin: '0 0 10px' } },
          h('span', { className: 'hint', style: { margin: 0 } }, '额度是平台给的总量，用完自己更新；想自动读就点「连接」。'),
          h('span', { className: 'grow' }),
          freeLocked('手动添加')),
        h('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' } }, cards),
        formOpen ? freeManualForm(onToggleForm) : null,
        presetBlock,
        helpBlock)
    }

    // ── 整页 ──────────────────────────────────────────────────────

    // 接入免费模型开关：写 settings.dshFreeModels，「接入」页的模型列表按它过滤
    // （daemon 侧 applyDshSettings 落库；裸名只路由付费池，所以免费模型以 free/ 前缀接入）。
    function FreeDshSwitch(props) {
      var env = props || {}
      var settings = (env.state && env.state.settings) || {}
      var on = settings.dshFreeModels === true
      var busyPair = React.useState(false)
      var busy = busyPair[0]
      var setBusy = busyPair[1]
      var errPair = React.useState('')
      var err = errPair[0]
      var setErr = errPair[1]

      function toggle(next) {
        if (busy) return
        setBusy(true)
        setErr('')
        writeOp('PATCH', '/api/settings', { dshFreeModels: next }).then(function (r) {
          setBusy(false)
          if (r && r.ok) {
            if (typeof env.reload === 'function') env.reload()
          } else {
            setErr('保存失败：' + String((r && r.error) || '未知错误'))
          }
        })
      }

      return h(
        'div',
        { className: 'card free-dsh-card' },
        h(
          'label',
          { className: 'switch', title: on ? '点击关闭：接入页不再列出免费池模型' : '点击打开：免费池模型以 free/ 前缀出现在接入页' },
          h('input', {
            type: 'checkbox',
            checked: on,
            disabled: busy,
            onChange: function () {
              toggle(!on)
            },
          }),
          h('span', { className: 'switch-track' }, h('span', { className: 'switch-knob' })),
          h(
            'span',
            { className: 'switch-text' },
            h('b', null, '接入免费模型'),
            h(
              'span',
              null,
              '开：免费池模型以 free/模型名 出现在「接入」页的模型列表，写进 DSH 后调用强制走免费通道；关：接入页只列付费模型。免费池与付费池在 daemon 侧分开路由。',
            ),
          ),
        ),
        err ? h('p', { className: 'msg-line is-err', role: 'alert' }, err) : null,
      )
    }

    function FreeView(props) {
      var env = freeEnv(props)
      var pool = env.state.freePool || {}
      var relay = Array.isArray(pool.relay) ? pool.relay : []
      var platforms = Array.isArray(pool.platforms) ? pool.platforms : []
      var accounts = Array.isArray(pool.accounts) ? pool.accounts : []
      var presets = (env.state.catalog && Array.isArray(env.state.catalog.platforms) && env.state.catalog.platforms) || []
      var panePair = React.useState('relay')
      var pane = panePair[0]
      var setPane = panePair[1]
      var formPair = React.useState(false)
      var formOpen = formPair[0]
      var setFormOpen = formPair[1]

      function segButton(id, label, count) {
        return h('button', { type: 'button', className: pane === id ? 'active' : undefined, onClick: function () { setPane(id) } },
          label, h('span', { className: 'seg-count' }, count))
      }

      return h('section', { className: 'view' },
        FreeNote(),
        h(FreeDshSwitch, { state: env.state, api: env.api, reload: env.reload }),
        h('div', { className: 'seg' }, segButton('relay', '中转站免费模型', relay.length), segButton('platform', '平台积分', platforms.length)),
        h('div', { style: { marginTop: '16px' } },
          pane === 'relay'
            ? h(FreeRelayPane, { relay: relay, providers: env.state.providers || [], crossPane: pool.crossPane || 'remaining' })
            : h(FreePlatformPane, {
                platforms: platforms,
                accounts: accounts,
                presets: presets,
                formOpen: formOpen,
                onToggleForm: function () { setFormOpen(!formOpen) },
                pending: null,
              })))
    }
