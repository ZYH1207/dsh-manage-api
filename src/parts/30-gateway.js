    /**
     * 网关视图。移植自网页版 renderGateway()（web/app.js:2495-2627）。
     *
     * 安全约束：state.gateway.keys[].key 是明文密钥。网页版也只渲染脱敏串，
     * 这里只拼 `sk-mapi-••••` + 末四位，完整 Key 一律不进 DOM / 属性 / title；
     * 「复制」是唯一的例外通道——只写进剪贴板，不落页面。
     *
     * 写操作受限：网关开关、Key 增删/轮换/改限额都不在白名单里（POST /api/gateway
     * 等被 403），一律渲染成禁用按钮 + title 说明。
     */

    var GATEWAY_LOCKED = '当前插件版本未开放（网关开关与 Key 管理不在插件的写白名单里）'
    var GATEWAY_CN = ['deepseek', 'glm', 'chatglm', 'qwen', 'kimi', 'moonshot', 'doubao', 'hunyuan', 'ernie', 'minimax', 'abab', 'spark', 'yi', 'k3']
    var GATEWAY_OVERSEAS = { gpt: 'vchip-openai', o1: 'vchip-openai', o3: 'vchip-openai', o4: 'vchip-openai', codex: 'vchip-openai', claude: 'vchip-anthropic', gemini: 'vchip-google' }

    function gatewayEnv(props) {
      var p = props || {}
      var api = p.api || {}
      return { api: api, state: pickState({ state: p.state || api.state || null }), reload: p.onReload || api.reload || function () {} }
    }

    /** 与网页版 formatTokens 同口径：B / M / K。 */
    function gatewayTokens(value) {
      var n = Number(value) || 0
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(n)
    }

    function gatewayDateTime(iso) {
      var d = new Date(iso)
      if (!isFinite(d.getTime())) return '—'
      function pad(n) { return String(n).length < 2 ? '0' + n : String(n) }
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    }

    /** 模型前缀 → 厂商胶囊 class（与 free-relay.js 的 vendorChipClass 同一套判定）。 */
    function gatewayVendorChip(modelName) {
      var first = String(modelName || '').toLowerCase().split(/[-_./:]/)[0]
      if (!first) return ''
      if (GATEWAY_CN.indexOf(first) >= 0) return 'vchip-cn'
      if (GATEWAY_OVERSEAS[first]) return GATEWAY_OVERSEAS[first]
      if (!/[0-9]/.test(first)) return ''
      var stem = first.match(/^[a-z]+/)
      if (!stem) return ''
      return GATEWAY_CN.indexOf(stem[0]) >= 0 ? 'vchip-cn' : GATEWAY_OVERSEAS[stem[0]] || ''
    }

    /** 「站点 × 分组」→ 胶囊色：同一分组在所有页面必须同色，所以看该分组的全部供给。 */
    function gatewayGroupChip(offers, providerId, group) {
      var g = String(group || '')
      var mine = (offers || []).filter(function (o) { return o.providerId === providerId && (o.group || '') === g })
      if (!mine.length) return ''
      var allFree = mine.every(function (o) {
        return o.pricingMode === 'manual' ? Number(o.inPrice) === 0 && Number(o.outPrice) === 0 : Number(o.ratio) === 0
      })
      if (allFree) return 'vchip-free'
      var chips = {}
      mine.forEach(function (o) {
        var cls = gatewayVendorChip(o.modelKey || o.upstreamName)
        if (cls) chips[cls] = true
      })
      var list = Object.keys(chips)
      if (!list.length) return ''
      var allCn = list.every(function (c) { return c === 'vchip-cn' })
      if (allCn) return 'vchip-cn'
      return list.length === 1 ? list[0] : ''
    }

    /** 只露末尾四位；完整 Key 绝不进 DOM。 */
    function gatewayMask(key) {
      var raw = String(key || '')
      return 'sk-mapi-••••' + raw.slice(-4)
    }

    function gatewayLocked(label, cls) {
      return h('button', { type: 'button', className: cls || undefined, disabled: true, title: GATEWAY_LOCKED }, label)
    }

    function GatewayView(props) {
      var env = gatewayEnv(props)
      var state = env.state
      var gateway = state.gateway
      var reload = env.reload
      var copiedPair = React.useState('')
      var copied = copiedPair[0]
      var setCopied = copiedPair[1]
      var msgPair = React.useState('')
      var message = msgPair[0]
      var setMessage = msgPair[1]

      function copyText(text, id) {
        try {
          var nav = typeof navigator !== 'undefined' ? navigator : null
          if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== 'function') {
            setMessage('这个环境不允许写剪贴板，请手动复制')
            return
          }
          nav.clipboard.writeText(String(text)).then(
            function () {
              setCopied(id)
              setMessage('')
              setTimeout(function () { setCopied('') }, 1600)
            },
            function () { setMessage('复制失败：浏览器拒绝了剪贴板写入') },
          )
        } catch (err) {
          setMessage('复制失败：' + (err && err.message ? err.message : String(err)))
        }
      }

      var baseUrl = React.useMemo(
        function () {
          var health = env.api.health || {}
          var port = health && health.daemon && health.daemon.port
          return 'http://127.0.0.1:' + (port || 4319) + '/v1'
        },
        [env.api.health],
      )

      var masked = React.useMemo(
        function () {
          var keys = gateway && Array.isArray(gateway.keys) ? gateway.keys : []
          return keys.map(function (record) {
            return { record: record, mask: gatewayMask(record.key) }
          })
        },
        [gateway],
      )

      if (!gateway || !Array.isArray(gateway.keys)) {
        return h('section', { className: 'view' },
          h('div', { className: 'empty' },
            h('h3', null, '网关未初始化'),
            h('p', null, '重启 daemon 会自动初始化。'),
            h('div', { style: { marginTop: '12px' } },
              h('button', { type: 'button', className: 'ghost', onClick: function () { reload() } }, '刷新'))))
      }

      var routing = Array.isArray(state.routing) ? state.routing : []
      var offers = Array.isArray(state.offers) ? state.offers : []
      var scores = state.scores || {}
      var okCount = routing.filter(function (r) { return r.outcome === 'ok' }).length
      var healthyModels = Object.keys(scores).filter(function (id) { return scores[id] && scores[id].routable }).length
      var usage = state.usage || {}
      var byKey = usage.byKey || {}

      // 网页版这里还有一块「刚创建的 Key」横幅：插件没有创建通道，永远不出现。
      var entryCard = h('div', { className: 'card' },
        h('div', { className: 'card-head' },
          h('div', null,
            h('h3', null, '网关入口'),
            h('div', { className: 'meta' }, '客户端填这个地址和任意一把 Key，就能访问全部站点')),
          h('div', { className: 'card-actions' }, gatewayLocked(gateway.enabled ? '关闭网关' : '开启网关'))),
        h('div', { className: 'keyrow' },
          h('span', { style: { width: '52px', color: 'var(--muted)' } }, '地址'),
          h('span', { className: 'mono grow' }, baseUrl),
          h('button', { type: 'button', className: 'ghost', title: '复制网关地址', onClick: function () { copyText(baseUrl, 'base') } },
            copied === 'base' ? '已复制' : '复制')),
        h('div', { className: 'badges' },
          h(Badge, { tone: gateway.enabled ? 'ok' : 'warn' }, gateway.enabled ? '运行中' : '已关闭'),
          h(Badge, null, gateway.keys.length + ' 把 Key'),
          h(Badge, null, healthyModels + ' 条供给可路由')))

      var keyRows = masked.map(function (item) {
        var record = item.record
        var used = byKey[record.id] || {}
        var total = (used.input || 0) + (used.output || 0)
        return {
          cells: [
            record.name || '—',
            { cls: 'mono', node: item.mask },
            { num: true, node: gatewayTokens(total) },
            { num: true, node: record.monthlyTokenLimit ? gatewayTokens(record.monthlyTokenLimit) : '不限' },
            { node: h('button', { type: 'button', className: 'ghost', style: { padding: 0 }, disabled: true, title: GATEWAY_LOCKED },
                h(Badge, { tone: record.enabled ? 'ok' : '' }, record.enabled ? '启用' : '停用')) },
            {
              num: true,
              node: h('span', null,
                h('button', {
                  type: 'button',
                  className: 'ghost',
                  // 唯一允许碰完整 Key 的地方：直接写剪贴板，不经过 DOM
                  title: '复制完整 Key（只写剪贴板，不显示在页面上）',
                  onClick: function () { copyText(record.key, record.id) },
                }, copied === record.id ? '已复制' : '复制'),
                gatewayLocked('轮换', 'ghost'),
                gatewayLocked('删除', 'ghost danger')),
            },
          ],
        }
      })

      var keyBlock = h('div', null,
        h('h3', { className: 'section-title' }, 'API Keys'),
        h('p', { className: 'hint' }, '给每个客户端单独一把 Key，用量才能分开统计；哪一把泄露了，单独轮换即可。'),
        keyRows.length
          ? h(Table, {
              heads: ['名称', 'Key', { label: '30 天 token', num: true }, { label: '月限额', num: true }, '状态', ''],
              rows: keyRows,
              scroll: true,
            })
          : h('div', { className: 'empty small' }, h('h3', null, '还没有 Key'), h('p', null, '网关首次启动会自动建一把。')),
        h('form', {
          className: 'inline-form',
          style: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            marginBottom: '20px',
          },
          onSubmit: function (event) { event.preventDefault() },
        },
          h('input', { name: 'name', placeholder: 'Key 名称，如 Cherry Studio', style: { maxWidth: '300px' }, defaultValue: '' }),
          h('input', { name: 'monthlyTokenLimit', type: 'number', min: 0, placeholder: '月 token 限额（可空）', style: { width: '180px' }, defaultValue: '' }),
          h('button', { type: 'submit', className: 'primary', disabled: true, title: GATEWAY_LOCKED }, '新建 Key')),
        message ? h('p', { className: 'hint' }, message) : null)

      var logHeads = ['时间', 'Key', '请求模型', '选中站点',
        { label: 'token', num: true }, { label: '尝试', num: true }, { label: '首字', num: true }, { label: '耗时', num: true }, '结果']

      var logTable
      if (!routing.length) {
        logTable = h('div', { className: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, logHeads.map(function (head, i) {
              var cell = typeof head === 'string' ? { label: head } : head
              return h('th', { key: 'h' + i, className: cell.num ? 'num' : undefined }, cell.label)
            }))),
            h('tbody', null, h('tr', null,
              h('td', { colSpan: 9, style: { textAlign: 'center', color: 'var(--faint)', padding: '28px' } }, '还没有请求经过网关')))))
      } else {
        logTable = h(Table, {
          heads: logHeads,
          scroll: true,
          rows: routing.map(function (r) {
            var chosen
            if (r.chosenProviderName) {
              var chip = r.pool === 'free' ? 'vchip-free' : gatewayGroupChip(offers, r.chosenProviderId, r.chosenGroup)
              chosen = h('span', null, r.chosenProviderName,
                r.chosenGroup ? h('span', { className: 'badge ' + chip, style: { marginLeft: '4px' } }, r.chosenGroup) : null)
            } else {
              chosen = h(Badge, { tone: 'danger' }, '全部失败')
            }
            return {
              cells: [
                { node: h('span', { style: { color: 'var(--faint)' } }, gatewayDateTime(r.ts)) },
                r.keyName || '—',
                { cls: 'mono', node: r.model || '—' },
                chosen,
                { num: true, node: r.usage ? gatewayTokens((r.usage.prompt_tokens || 0) + (r.usage.completion_tokens || 0)) : '—' },
                { num: true, node: r.attempts || '—' },
                { num: true, node: r.ttftMs ? r.ttftMs + 'ms' : '—' },
                { num: true, node: (r.latencyMs === undefined || r.latencyMs === null ? '—' : r.latencyMs + 'ms') },
                { node: r.outcome === 'ok' ? h(Badge, { tone: 'ok' }, '成功') : h(Badge, { tone: 'danger' }, String(r.outcome || '失败')) },
              ],
            }
          }),
        })
      }

      var logBlock = h('div', null,
        h('h3', { className: 'section-title' }, '最近请求'),
        h('div', { className: 'table-wrap' },
          h('div', { className: 'group-head' },
            h('span', { className: 'model' }, '路由决策'),
            h('span', { className: 'count' }, okCount + ' / ' + routing.length + ' 成功')),
          logTable))

      return h('section', { className: 'view' }, entryCard, keyBlock, logBlock)
    }
