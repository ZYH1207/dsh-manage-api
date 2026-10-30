    /**
     * 网关视图。移植自网页版 renderGateway()（web/app.js:2495-2627）。
     *
     * ## 为什么这里没有 Key
     *
     * 网页版把网关 Key 当成「客户端接入凭证」展示（脱敏 + 复制）。对 DSH 用户来说这条路径
     * 没有意义：模型已经在 DSH 的 provider 列表里（「自动 DSH」卡片负责写进去），用户不需要
     * 拿 Key 去填别的客户端。而 `state.gateway.keys[].key` 是**明文密钥**，留在 state 里被
     * 前端接触只会增加泄漏面——所以这里连脱敏串都不渲染，整块 Key 相关 UI（Key 表、把 Key
     * 数 badge、路由日志里的 Key 列、复制到剪贴板的按钮）全部移除。
     *
     * daemon 侧的 `/v1` 与 Key 校验**保持不变**：DSH 的 manage-api provider 仍走
     * `http://127.0.0.1:<port>/v1` + `MANAGE_API_API_KEY`，停掉它会把这个 provider 一起打死。
     * 页面只是不再展示、不再引导用户复制它们。
     *
     * 写操作仍受限：网关开关不在白名单里（POST /api/gateway 被 403），渲染成禁用按钮 + title。
     */

    var GATEWAY_LOCKED = '当前插件版本未开放（网关开关不在插件的写白名单里）'
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
      var first = null
      for (var i = 0; i < offers.length; i++) {
        var offer = offers[i]
        if (!offer || offer.providerId !== providerId) continue
        if (String(offer.group || '') !== String(group || '')) continue
        if (first == null) first = offer
      }
      var chipClass = gatewayVendorChip(first && first.modelKey)
      return h('span', { className: 'vchip ' + (chipClass || '') , title: group || '' }, group || '默认')
    }

    function gatewayLocked(label, cls) {
      return h('button', { className: cls || 'ghost', disabled: true, title: GATEWAY_LOCKED }, label)
    }

    function GatewayView(props) {
      var env = gatewayEnv(props)
      var state = env.state || {}
      var gateway = state.gateway || {}
      var reload = env.reload
      var api = env.api || {}

      var health = (api && api.health) || (props && props.health) || {}
      var daemonPort = (health.daemon && health.daemon.port) || (api && api.port) || 4319
      var baseUrl = 'http://127.0.0.1:' + daemonPort + '/v1'

      var routing = Array.isArray(state.routing) ? state.routing : []
      var offers = Array.isArray(state.offers) ? state.offers : []
      var scores = state.scores && typeof state.scores === 'object' ? state.scores : {}
      var okCount = 0
      for (var i = 0; i < routing.length; i++) if (routing[i] && routing[i].outcome === 'ok') okCount++
      var healthyModels = 0
      for (var key in scores) {
        if (!Object.prototype.hasOwnProperty.call(scores, key)) continue
        if (scores[key] && scores[key].availability != null && Number(scores[key].availability) >= 0.8) healthyModels++
      }

      var badges = [
        h(Badge, { key: 'state', tone: gateway.enabled === false ? 'warn' : 'ok' }, gateway.enabled === false ? '网关未启用' : '网关运行中'),
        h(Badge, { key: 'models' }, healthyModels + ' 条供给可路由'),
      ]

      // 网关入口：地址仍在（DSH 的 provider 就指向它），但只讲"这里是什么"，
      // 不再引导用户复制 Key 去接别的客户端。
      var entryCard = h('div', { className: 'card' },
        h('div', { className: 'card-head' },
          h('div', null,
            h('h3', null, '网关入口'),
            h('p', { className: 'desc' }, 'ManageAPI 在本机起的 OpenAI 兼容入口；DSH 的 ManageAPI provider 已指向它，模型会由「概览 · 自动 DSH」直接写进 DSH。'),
          ),
          h('div', { className: 'card-actions' }, gatewayLocked(gateway.enabled === false ? '开启网关' : '关闭网关')),
        ),
        h('div', { className: 'keyrow' },
          h('span', { className: 'mono' }, baseUrl),
          h('button', {
            className: 'ghost tiny',
            onClick: function () {
              if (navigator && navigator.clipboard) navigator.clipboard.writeText(baseUrl)
            },
            title: '复制网关地址',
          }, '复制地址'),
        ),
        h('div', { className: 'badges' }, badges),
        h('p', { className: 'hint' }, 'Key 由 daemon 自动管理，插件不再展示或导出；如需在别的客户端接入，请到 ManageAPI 网页版查看。'),
      )

      // 最近请求：去掉 Key 列，只留「哪个模型 → 选中哪个站点」以及耗时/结果。
      var logHeads = [
        '时间',
        '请求模型',
        '选中站点',
        { label: 'token', num: true },
        { label: '尝试', num: true },
        { label: '首字', num: true },
        { label: '耗时', num: true },
        '结果',
      ]

      var logRows = []
      var recent = routing.slice().reverse().slice(0, 200)
      for (var r = 0; r < recent.length; r++) {
        var row = recent[r]
        if (!row) continue
        var usage = row.usage || {}
        var tokens = (Number(usage.input) || 0) + (Number(usage.output) || 0)
        var selected = row.chosenOfferId
          ? gatewayGroupChip(offers, row.chosenProviderId, row.chosenGroup)
          : h('span', { className: 'vchip vchip-free' }, row.pool === 'free' ? '免费通道' : '未选中')
        var ok = row.outcome === 'ok'
        logRows.push({
          cells: [
            { cls: 'mono dim', node: gatewayDateTime(row.ts) },
            h('span', { className: 'mono' }, row.model || '—'),
            selected,
            { num: true, node: tokens ? gatewayTokens(tokens) : '—' },
            { num: true, node: String(row.attempts == null ? 1 : row.attempts) },
            { num: true, node: row.ttftMs == null ? '—' : Math.round(row.ttftMs) + 'ms' },
            { num: true, node: row.latencyMs == null ? '—' : (row.latencyMs / 1000).toFixed(1) + 's' },
            h(Badge, { tone: ok ? 'ok' : 'danger' }, ok ? '成功' : '失败'),
          ],
        })
      }

      var logTable = logRows.length
        ? h(Table, { heads: logHeads, rows: logRows, scroll: true })
        : h('div', { className: 'empty' }, '还没有请求经过网关', h('span', { className: 'hint' }, '通过 DSH 或别的客户端调用 ManageAPI 后，这里会按请求列出选站过程。'))

      var logBlock = h('div', { className: 'table-wrap' },
        h('h3', { className: 'section-title' }, '最近请求'),
        h('div', { className: 'group-head' }, '路由决策', h('span', { className: 'hint' }, okCount + ' / ' + routing.length + ' 成功')),
        logTable,
      )

      return h('section', { className: 'view' },
        h('div', { className: 'view-head' },
          h('div', null,
            h('h2', null, '网关'),
            h('p', { className: 'desc' }, '一个入口接管全部站点；模型由「概览 · 自动 DSH」接进 DSH，无需手动配置 Key。'),
          ),
          h('div', { className: 'view-actions' }, h('button', { className: 'ghost', onClick: reload }, '刷新')),
        ),
        entryCard,
        logBlock,
      )
    }
