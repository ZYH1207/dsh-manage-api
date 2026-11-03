    /**
     * 接入视图（原「网关」页，2026-11-02 改版：网关挪到第 2 个页签并更名「接入」）。
     *
     * 页面职责收敛为两块：
     *   1. 「模型接入」卡（自概览页挪入）——把 ManageAPI 的模型写进 DSH 的 provider 分组；
     *      原「网关入口」卡撤掉，接入地址（一行 + 复制）与「网关未启用」告警收编进本卡。
     *   2. 「最近请求」路由决策表——逐请求观测，原样保留。
     *
     * ## 为什么这里没有 Key
     *
     * 网页版把网关 Key 当成「客户端接入凭证」展示（脱敏 + 复制）。对 DSH 用户来说这条路径
     * 没有意义：模型已经在 DSH 的 provider 列表里（「模型接入」卡片负责写进去），用户不需要
     * 拿 Key 去填别的客户端。而 `state.gateway.keys[].key` 是**明文密钥**，留在 state 里被
     * 前端接触只会增加泄漏面——所以这里连脱敏串都不渲染，整块 Key 相关 UI（Key 表、把 Key
     * 数 badge、路由日志里的 Key 列、复制到剪贴板的按钮）全部移除。
     *
     * daemon 侧的 `/v1` 与 Key 校验**保持不变**：DSH 的 manage-api provider 仍走
     * `http://127.0.0.1:<port>/v1` + `MANAGE_API_API_KEY`，停掉它会把这个 provider 一起打死。
     * 页面只是不再展示、不再引导用户复制它们。
     *
     * 网关开关：PATCH /api/gateway（2026-11-02 独立化进写白名单），收在「模型接入」卡里——
     * 未启用时告警条带「打开网关」，运行中在地址行给「关闭网关」（带确认）。Key 依旧不展示。
     */

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

    /**
     * 「模型接入」卡片（自概览页挪入）：把 ManageAPI 的模型接进 DSH 自己的 provider 列表
     * + 设为默认模型。
     *
     * 数据来源两处：
     *   - 可选模型 = `state.modelIndex` 去掉 `state.settings.panelIgnoredModels`（面板自己的忽略名单，
     *     与路由端 `ignoredModels` 各走各的：面板里忽略不影响网关/网页版）
     *   - DSH 侧现状 = `GET /api/manage-api/dsh-model`（由 host 半边读 configEditor + agentDefaultModel）
     *
     * 选择即保存（单选 + 持久化）：选中后 POST 同一个端点，host 侧幂等追加到
     * provider 分组的 `models` 列表并调用 `agentDefaultModel.saveSelection()`。
     */
    function autoDshModelRows(state) {
      var raw = state || {}
      var snapshot = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
      var index = Array.isArray(snapshot.modelIndex) ? snapshot.modelIndex : []
      var settings = snapshot.settings || {}
      var ignored = Array.isArray(settings.panelIgnoredModels) ? settings.panelIgnoredModels : []
      var ignoredSet = {}
      for (var i = 0; i < ignored.length; i++) ignoredSet[ignored[i]] = true
      // 裸名只能在付费池路由（daemon 侧 resolvePool 只认 free/ 前缀强制免费），所以付费榜单
      // （state.ranked）里的名字才能裸名接入；不在榜单里的名字是免费池独有，裸名接进去也调不通，
      // 只能以 free/ 前缀接入（settings.dshFreeModels 开着才列出）。
      var ranked = Array.isArray(snapshot.ranked) ? snapshot.ranked : []
      var hasRanked = ranked.length > 0
      var paidSet = {}
      for (var r = 0; r < ranked.length; r++) {
        var key = ranked[r] && ranked[r].modelKey
        if (key) paidSet[String(key)] = true
      }
      var includeFree = settings.dshFreeModels === true
      var seen = {}
      var rows = []
      var freeRows = []
      for (var j = 0; j < index.length; j++) {
        var item = index[j]
        if (!item) continue
        var name = typeof item === 'string' ? item : item.name
        if (!name || ignoredSet[name] || seen[name]) continue
        seen[name] = true
        var sites = typeof item === 'object' && item.sites != null ? Number(item.sites) || 0 : 0
        if (hasRanked && !paidSet[name]) {
          if (includeFree) freeRows.push({ name: 'free/' + name, sites: sites, free: true })
          continue
        }
        rows.push({ name: name, sites: sites })
      }
      if (includeFree) {
        // 免费池补充段：freePool.relay（免费页同源）里 modelIndex 没有的模型也补进来
        var relay = snapshot.freePool && Array.isArray(snapshot.freePool.relay) ? snapshot.freePool.relay : []
        var extra = {}
        for (var q = 0; q < relay.length; q++) {
          var src = relay[q] && relay[q].offer ? relay[q].offer : relay[q]
          var fname = (src && (src.modelKey || src.upstreamName)) || ''
          if (!fname || ignoredSet[fname] || seen[fname]) continue
          extra[fname] = (extra[fname] || 0) + 1
        }
        for (var fname2 in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, fname2)) {
            seen[fname2] = true
            freeRows.push({ name: 'free/' + fname2, sites: extra[fname2], free: true })
          }
        }
      }
      rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
      freeRows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
      return rows.concat(freeRows)
    }

    /**
     * 客户端 ctx 的引用（由 lib/client.js 的 apply() 赋值）。
     *
     * 需要在面板里手动催一下「会话输入框下方的模型选择器」刷新时用得到：
     * 那个选择器的数据来自宿主 `buildModelCatalog()`，客户端把它按 Host generation
     * 缓存起来，只有 `llm/adapters-updated` / `settings/document-updated` 这类远端事件
     * 才会重拉。而我们往 DSH 写模型走的是宿主 configEditor，事件不保证送到客户端，
     * 于是会出现「配置已经写进去了、选择器里还是看不到」。
     */
    var MANAGE_CLIENT_CTX = null

    /**
     * 主动刷新模型选择器的数据源。
     *
     * 选择器插件把 `ModelCatalogDirectory` 挂在客户端服务 `ctx.modelDirectories.catalog` 上，
     * 它的 `refresh()` 会 invalidate + 重新 `remote.session.modelCatalog()`。
     * 服务或方法不存在（用户把那个内置 UI 插件关了）时静默返回 false。
     */
    function nudgeModelCatalog() {
      var ctx = MANAGE_CLIENT_CTX
      if (!ctx || typeof ctx.get !== 'function') return false
      try {
        var dirs = ctx.get('modelDirectories', false)
        var catalog = dirs && dirs.catalog
        if (catalog && typeof catalog.refresh === 'function') {
          catalog.refresh()
          return true
        }
      } catch (err) {
        /* 选择器插件没启用：静默 */
      }
      return false
    }

    function AutoDshCard(props) {
      var api = (props && props.api) || {}
      var baseUrl = (props && props.baseUrl) || ''
      var gateway = (props && props.gateway) || {}
      var models = autoDshModelRows(props && props.state)
      var busyState = React.useState('')
      var busy = busyState[0]
      var setBusy = busyState[1]
      var msgState = React.useState(null)
      var msg = msgState[0]
      var setMsg = msgState[1]
      var infoState = React.useState(null)
      var info = infoState[0]
      var setInfo = infoState[1]
      var gwBusyState = React.useState(false)
      var gwBusy = gwBusyState[0]
      var setGwBusy = gwBusyState[1]

      /** 网关开关（PATCH /api/gateway，2026-11-02 进写白名单）：开/关后拉新快照刷新告警。 */
      function gatewayToggle(next, okText) {
        if (gwBusy) return
        setGwBusy(true)
        setMsg(null)
        writeOp('PATCH', '/api/gateway', { enabled: next }).then(function (res) {
          setGwBusy(false)
          if (res && res.ok) {
            setMsg({ kind: 'ok', text: okText })
            if (typeof api.reload === 'function') api.reload()
          } else {
            var err = res && res.error
            var text = err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
            setMsg({ kind: 'err', text: '网关开关失败：' + text })
          }
        })
      }

      React.useEffect(function () {
        fetchJson('dsh-model').then(function (r) {
          if (r && r.ok && r.body && r.body.dsh) setInfo(r.body.dsh)
          else setMsg({ kind: 'err', text: '读不到 DSH 现状：' + String((r && r.body && r.body.error) || (r && r.error) || '未知错误') })
        })
      }, [])

      function save(model, want) {
        if (!model || busy) return
        setBusy(model)
        setMsg(null)
        fetchJson('dsh-model', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: model, enabled: want }),
        }).then(function (r) {
          setBusy('')
          var body = (r && r.body) || {}
          if (r && r.ok && body.ok) {
            // 写完立刻催一次客户端模型目录：选择器按 Host generation 缓存，
            // 不主动 refresh 的话要等页面刷新才看得到新模型。
            var nudged = nudgeModelCatalog()
            var group = (body.state && body.state.displayName) || (info && info.displayName) || 'DSH ManageAPI'
            var text = want
              ? '已打开 ' + model + '：写进模型选择器分组「' + group + '」，并设为 DSH 默认模型'
              : '已关闭 ' + model + (body.removed === false ? '（本来就不在分组里）' : '：已从分组「' + group + '」移除')
            setMsg({ kind: 'ok', text: text + (nudged ? '，选择器已刷新。' : '；选择器没自动刷新就刷新一次页面。') })
            if (body.state) setInfo(body.state)
            if (typeof api.reload === 'function') api.reload()
          } else {
            setMsg({ kind: 'err', text: '操作失败：' + String(body.error || (r && r.error) || (r && r.text) || '未知错误') })
          }
        })
      }

      var registered = {}
      if (info && Array.isArray(info.models)) {
        for (var k = 0; k < info.models.length; k++) {
          var entry = info.models[k]
          // 宿主 `/dsh-model` 下发的 models 是 id 字符串数组；兼容老版本的对象形态 `{ id, name }`。
          var entryId = typeof entry === 'string' ? entry : entry && entry.id
          if (entryId) registered[entryId] = true
        }
      }
      var current = (info && info.selection && info.selection.provider === (info && info.provider) && info.selection.model) || ''
      var configurable = !info || info.configurable !== false
      var groupName = (info && info.displayName) || 'DSH ManageAPI'

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
          var on = Boolean(registered[item.name])
          var isDefault = on && current === item.name
          rows.push(
            h(
              'div',
              { key: item.name, className: 'switch-row auto-dsh-row' + (isDefault ? ' is-current' : '') },
              h(
                'label',
                {
                  className: 'switch',
                  title: on ? '点击关闭：从 DSH 的「' + groupName + '」分组里移除' : '点击打开：写进 DSH 的「' + groupName + '」分组',
                },
                h('input', {
                  type: 'checkbox',
                  checked: on,
                  disabled: busy != '' || !configurable,
                  onChange: function (name, next) {
                    return function () {
                      save(name, next)
                    }
                  }(item.name, !on),
                }),
                h('span', { className: 'switch-track' }, h('span', { className: 'switch-knob' })),
                h(
                  'span',
                  { className: 'switch-text' },
                  h('b', { className: 'auto-dsh-name' }, item.name,
                    item.free
                      ? h('span', { className: 'vchip vchip-free', style: { marginLeft: '6px' } }, '免费')
                      : null),
                  h(
                    'span',
                    null,
                    (item.free
                      ? '免费池' + (item.sites ? ' · ' + item.sites + ' 条供给' : '')
                      : item.sites
                        ? item.sites + ' 个站'
                        : '已不在榜单') +
                      ' · ' +
                      (isDefault ? 'DSH 当前默认模型' : on ? '已进 DSH' : '未进 DSH'),
                  ),
                ),
              ),
              isDefault ? h(Badge, { tone: 'ok' }, '默认') : null,
              on && !isDefault
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'ghost tiny',
                      disabled: busy != '',
                      onClick: function (name) {
                        return function () {
                          save(name, true)
                        }
                      }(item.name),
                    },
                    '设为默认',
                  )
                : null,
              busy === item.name ? h('span', { className: 'hint' }, '保存中…') : null,
            ),
          )
        }
        body = h(
          'div',
          { className: 'ig-list auto-dsh-list', role: 'group', 'aria-label': '选择要接进 DSH 的 ManageAPI 模型' },
          h(
            'div',
            { className: 'hint' },
            '每个模型一个开关：打开＝写进模型选择器的分组「' +
              groupName +
              '」并可用，关闭＝从该组移出。多选互不影响；默认模型是最后打开的那个，也可以点「设为默认」换。',
          ),
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
            h('h3', null, '模型接入'),
            h(
              'p',
              { className: 'desc' },
              '把 ManageAPI 的模型接进 DSH：在模型选择器的独立分组「' + groupName + '」里多选，默认模型随时可换，不用改配置文件。',
            ),
          ),
          h('div', { className: 'card-actions' }, h(Badge, null, models.length + ' 个未忽略模型')),
        ),
        // 接入地址：原「网关入口」卡收编成一行。DSH 的 ManageAPI provider 就指向它；
        // 要在别的客户端接入请到 ManageAPI 网页版（那里能看到 Key）。
        baseUrl
          ? h(
              'div',
              { className: 'keyrow' },
              h('span', { className: 'mono' }, baseUrl),
              h('button', {
                className: 'ghost tiny',
                onClick: function () {
                  if (navigator && navigator.clipboard) navigator.clipboard.writeText(baseUrl)
                },
                title: '复制接入地址',
              }, '复制地址'),
              gateway && gateway.enabled === false
                ? null
                : h('button', {
                    className: 'ghost tiny',
                    disabled: gwBusy,
                    title: '关闭后本机所有走网关的调用（包括 DSH 的模型请求）都会失败',
                    onClick: function () {
                      if (window.confirm('关闭网关后，本机走网关的调用会全部失败（包括 DSH 的模型请求）。确定关闭？')) {
                        gatewayToggle(false, '网关已关闭')
                      }
                    },
                  }, '关闭网关'),
            )
          : null,
        gateway && gateway.enabled === false
          ? h(
              'div',
              { className: 'alert danger', style: { marginBottom: '10px' } },
              h('span', { className: 'name' }, '网关未启用'),
              h('span', { className: 'grow' }),
              h('span', { className: 'desc' }, 'DSH 的模型调用会失败。'),
              h('button', {
                type: 'button',
                className: 'ghost tiny',
                disabled: gwBusy,
                onClick: function () { gatewayToggle(true, '网关已开启，模型请求恢复') },
              }, gwBusy ? '处理中…' : '打开网关'),
            )
          : null,
        body,
        info && info.selection && info.selection.provider && info.selection.model
          ? h('p', { className: 'hint' }, 'DSH 当前默认模型：' + info.selection.provider + ' / ' + info.selection.model)
          : h('p', { className: 'hint' }, 'DSH 当前还没有设置默认模型。'),
        msg
          ? h(
              'p',
              { className: 'msg-line ' + (msg.kind === 'err' ? 'is-err' : 'is-ok'), role: msg.kind === 'err' ? 'alert' : 'status' },
              msg.text,
            )
          : null,
        configurable ? null : h('p', { className: 'hint' }, '当前 DSH 版本不允许插件修改配置（configEditor 不可用），请在 profile 的 cordis.patch.yml 里手动添加模型。'),
      )
    }

    function GatewayView(props) {
      var env = gatewayEnv(props)
      var state = env.state || {}
      var gateway = state.gateway || {}
      var api = env.api || {}
      var reload = env.reload

      var health = (api && api.health) || (props && props.health) || {}
      var daemonPort = (health.daemon && health.daemon.port) || (api && api.port) || 4319
      var baseUrl = 'http://127.0.0.1:' + daemonPort + '/v1'

      var routing = Array.isArray(state.routing) ? state.routing : []
      var offers = Array.isArray(state.offers) ? state.offers : []
      var okCount = 0
      for (var i = 0; i < routing.length; i++) if (routing[i] && routing[i].outcome === 'ok') okCount++

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
            h('h2', null, '接入'),
            h('p', { className: 'desc' }, '把 ManageAPI 的模型接进 DSH，并观测每个请求实际走到了哪个站点。'),
          ),
          h('div', { className: 'view-actions' }, h('button', { className: 'ghost', onClick: reload }, '刷新')),
        ),
        h(AutoDshCard, { state: props.state, api: api, baseUrl: baseUrl, gateway: gateway }),
        logBlock,
      )
    }
