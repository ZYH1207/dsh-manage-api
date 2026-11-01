    /**
     * 基准价视图。移植自网页版 renderBenchmark()（web/app.js:2778-2917）与它
     * 依赖的汇率小件（fxState / fxNoteHtml / rateCny）。
     *
     * 这是宽页：默认只展开「与本地供给相关」和「手动改过」的基准价，其余收进
     * 折叠行；搜索时强制看全部（搜索意图就是找，别再分层）。
     *
     * 写操作（2026-11-02 独立化第四批起全部接通）：单条编辑走 PUT /api/benchmarks
     * （整条 entry 回写）、删除走 DELETE、三种导入（从站 / 广场 / 内置参考价）
     * 各自的 POST 都在白名单里；「显示币种」和「汇率」走 PATCH /api/settings。
     */

    var BENCH_IMPORT_HINT = '从站点导入官方价：优先用「令牌」读该站的「可用渠道」（数据最全，不要求开广场），读不到再回落「模型广场」。只补空缺、不覆盖你已有的条目。'

    function benchmarkEnv(props) {
      var p = props || {}
      var api = p.api || {}
      return { api: api, state: pickState({ state: p.state || api.state || null }), reload: p.onReload || api.reload || function () {} }
    }

    function benchmarkAgo(iso) {
      if (!iso) return '还没采过'
      var ms = Date.now() - new Date(iso).getTime()
      if (!isFinite(ms)) return '—'
      if (ms < 60 * 1000) return '刚刚'
      var minutes = Math.floor(ms / 60000)
      if (minutes < 60) return minutes + ' 分钟前'
      var hours = Math.floor(minutes / 60)
      if (hours < 24) return hours + ' 小时前'
      return Math.floor(hours / 24) + ' 天前'
    }

    /** 汇率：设置里存的是 settings.fx.rates.CNY，老快照可能只有 fxUsdCny。 */
    function benchmarkRate(state) {
      var settings = state.settings || {}
      var fromFx = Number(settings.fx && settings.fx.rates && settings.fx.rates.CNY)
      if (isFinite(fromFx) && fromFx > 0) return fromFx
      var legacy = Number(settings.fxUsdCny)
      return isFinite(legacy) && legacy > 0 ? legacy : 7.2
    }

    function benchmarkFx(state) {
      var raw = state.settings && state.settings.fx
      return {
        manual: Boolean(raw && raw.manual),
        source: (raw && raw.source) || 'default',
        updatedAt: (raw && raw.updatedAt) || null,
      }
    }

    function BenchmarkView(props) {
      var env = benchmarkEnv(props)
      var state = env.state
      var reload = env.reload
      var benchmarks = state.benchmarks || {}
      var providers = Array.isArray(state.providers) ? state.providers : []
      var offers = Array.isArray(state.offers) ? state.offers : []
      var settings = state.settings || {}
      var reference = state.reference || {}

      var filterPair = React.useState('')
      var filter = filterPair[0]
      var setFilter = filterPair[1]
      var showAllPair = React.useState(false)
      var showAll = showAllPair[0]
      var setShowAll = showAllPair[1]
      var msgPair = React.useState('')
      var message = msgPair[0]
      var setMessage = msgPair[1]
      var fxBusyPair = React.useState(false)
      var fxBusy = fxBusyPair[0]
      var setFxBusy = fxBusyPair[1]

      var filterText = String(filter || '').trim().toLowerCase()

      var entries = React.useMemo(
        function () {
          return Object.keys(benchmarks)
            .filter(function (key) {
              if (!filterText) return true
              var entry = benchmarks[key] || {}
              return key.toLowerCase().indexOf(filterText) >= 0 || String(entry.display || '').toLowerCase().indexOf(filterText) >= 0
            })
            .sort(function (a, b) { return a.localeCompare(b) })
            .map(function (key) { return [key, benchmarks[key] || {}] })
        },
        [benchmarks, filterText],
      )

      // 与本地供给相关的判定：基准 key 被任何一条供给引用（benchmarkKey / modelKey / upstreamName 任一命中）
      var usedKeys = React.useMemo(
        function () {
          var set = {}
          offers.forEach(function (o) {
            ;[o.benchmarkKey, o.modelKey, o.upstreamName].forEach(function (k) {
              if (k) set[String(k).toLowerCase()] = true
            })
          })
          return set
        },
        [offers],
      )

      function isRelevant(pair) {
        return Boolean(usedKeys[pair[0].toLowerCase()]) || String(pair[1].source || '') === 'manual'
      }

      // 搜索时强制看全部（搜索意图就是找，别再分层）
      var layering = !filterText && !showAll
      var matching = layering ? entries.filter(isRelevant) : entries
      // 相关条目为空时不分层：新用户还没有供给，全部折叠会让页面空白，看起来像「导入失败」
      if (layering && matching.length === 0 && entries.length > 0) matching = entries
      var relevantCount = entries.filter(isRelevant).length
      var restCount = entries.length - (layering ? matching.length : relevantCount)

      // 来源值的展示友好化（来源是低频诊断信息，降为模型列的小字）
      function sourceLabel(source) {
        var s = String(source || 'manual')
        if (s === 'manual') return ''
        if (s === 'seed') return '内置'
        if (s.indexOf('reference:') === 0) return '参考价 · ' + s.slice('reference:'.length)
        if (s.indexOf('imported:') === 0) {
          var pid = s.slice('imported:'.length)
          var hit = null
          providers.forEach(function (p) { if (p.id === pid) hit = p })
          return '从站导入 · ' + (hit ? hit.name : pid)
        }
        return s
      }

      function patchSettings(payload, okText) {
        return writeOp('PATCH', '/api/settings', payload).then(function (res) {
          if (!res || res.ok === false) {
            setMessage('失败：' + ((res && res.error) || '写操作被拒绝'))
            return
          }
          setMessage(okText)
          reload()
        })
      }

      var benchBusyPair = React.useState(false)
      var benchBusy = benchBusyPair[0]
      var setBenchBusy = benchBusyPair[1]
      var importProviderPair = React.useState(providers[0] ? providers[0].id : '')
      var importProvider = importProviderPair[0]
      var setImportProvider = importProviderPair[1]

      function benchErr(err) {
        return err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
      }

      /** 单字段编辑：PUT /api/benchmarks 回写整条 entry（与网页版同契约）。 */
      function benchCommit(key, field, numeric) {
        return function (event) {
          var raw = String(event.target.value == null ? '' : event.target.value).trim()
          var value = raw === '' ? null : numeric ? Number(raw) : raw
          if (numeric && value !== null && !isFinite(value)) return
          var current = benchmarks[key] ? benchmarks[key][field] : null
          var currentNorm = current === null || current === undefined ? null : numeric ? Number(current) : String(current)
          if (value === currentNorm) return
          setBenchBusy(true)
          var entry = Object.assign({}, benchmarks[key] || {}, { modelKey: key })
          entry[field] = value
          writeOp('PUT', '/api/benchmarks', entry).then(function (res) {
            setBenchBusy(false)
            if (res && res.ok) {
              setMessage('基准价「' + key + '」已保存')
              reload()
            } else {
              setMessage('保存失败：' + benchErr(res && res.error))
            }
          })
        }
      }

      function benchDelete(key) {
        if (benchBusy) return
        if (!window.confirm('删除基准价「' + key + '」？')) return
        setBenchBusy(true)
        writeOp('DELETE', '/api/benchmarks/' + encodeURIComponent(key), {}).then(function (res) {
          setBenchBusy(false)
          if (res && res.ok) {
            setMessage('基准价「' + key + '」已删除')
            reload()
          } else {
            setMessage('删除失败：' + benchErr(res && res.error))
          }
        })
      }

      /** 三种导入：从站（channels→广场回落）/ 广场（以站点已填价为准）/ 内置参考价。 */
      function runBenchImport(kind) {
        if (benchBusy) return
        if (kind !== 'seed' && !importProvider) {
          setMessage('先在上面选一个站点')
          return
        }
        setBenchBusy(true)
        var path = kind === 'seed' ? '/api/benchmarks/seed' : kind === 'import' ? '/api/benchmarks/import' : '/api/benchmarks/import-plaza'
        var payload = kind === 'seed' ? {} : { providerId: importProvider }
        writeOp('POST', path, payload).then(function (res) {
          setBenchBusy(false)
          var summary = (res && res.summary) || {}
          if (res && res.ok) {
            if (kind === 'seed') {
              var added = ((summary.seedResult || {}).added || []).length
              setMessage(added ? '已载入 ' + added + ' 条参考价，请核对后再用' : '没有可匹配的新模型（可能都已存在或不在内置列表里）')
            } else if (kind === 'import') {
              setMessage('导入 ' + (((summary.importResult || {}).imported) || 0) + ' 条基准价')
            } else {
              var r = summary.plazaBenchResult || {}
              var via = r.source === 'channels' ? '可用渠道' : '模型广场'
              setMessage(r.added > 0
                ? '从' + via + '导入 ' + r.added + ' 条官方价' + (r.skipped ? '（跳过 ' + r.skipped + ' 条：已存在或无官方价）' : '')
                : '没有新增（都已有基准价，或' + via + '没给官方价）')
            }
            reload()
          } else {
            setMessage('导入失败：' + benchErr(res && res.error))
          }
        })
      }

      // ── 导入卡 ──────────────────────────────────────────────────
      var providerOptions = providers.map(function (p) { return h('option', { key: p.id, value: p.id }, p.name) })
      var importCard = h('div', { className: 'card' },
        h('div', { className: 'inline-form', style: { borderTop: 'none', marginTop: 0, paddingTop: 0 } },
          h('select', { value: importProvider, onChange: function (event) { setImportProvider(event.target.value) }, style: { maxWidth: '210px' } },
            providerOptions.length ? providerOptions : h('option', { value: '' }, '还没有站点')),
          h('button', { type: 'button', disabled: benchBusy || !importProvider, title: BENCH_IMPORT_HINT, onClick: function () { runBenchImport('import') } }, '从站点导入官方价'),
          h('button', { type: 'button', disabled: benchBusy || !importProvider, title: '把这个站已经填好的实际价整体设为基准，适合你确信它没虚标的情况', onClick: function () { runBenchImport('plaza') } }, '以此站已填价为准'),
          h('span', { style: { color: 'var(--faint)', fontSize: '12px', margin: '0 2px' } }, '或'),
          h('button', { type: 'button', disabled: benchBusy, title: '用工具内置的一份官方价（截至 ' + (reference.asOf || '—') + '），价格常变，务必核对', onClick: function () { runBenchImport('seed') } }, '载入内置参考价')),
        h('p', { className: 'hint', style: { margin: '10px 0 0' } },
          h('b', null, '从站点导入官方价'),
          '：优先用「令牌」读该站的「可用渠道」（数据最全，不要求开广场），读不到再回落「模型广场」。只补空缺、不覆盖你已有的条目。',
          h('br'),
          h('b', null, '以此站已填价为准'),
          '：把这个站已经填好的实际价整体设为基准，适合你确信它没虚标的情况。',
          h('br'),
          h('b', null, '载入内置参考价'),
          '：用工具内置的一份官方价（截至 ' + (reference.asOf || '—') + '），价格常变，务必核对。'))

      // ── 工具条 ──────────────────────────────────────────────────
      var rate = benchmarkRate(state)
      var fx = benchmarkFx(state)
      var fxNote = fx.manual
        ? '手动汇率'
        : !fx.updatedAt
          ? '还没拉取过自动汇率'
          : '自动 · ' + benchmarkAgo(fx.updatedAt) + '更新'

      var toolbar = h('div', { className: 'toolbar', style: { margin: '18px 0 10px' } },
        h('input', {
          className: 'search',
          type: 'search',
          placeholder: '搜索模型名…',
          value: filter,
          onChange: function (event) { setFilter(event.target.value) },
        }),
        h('span', { className: 'hint', style: { margin: 0 } },
          layering ? matching.length + ' 条与本地供给相关 · 共 ' + entries.length + ' 条' : '共 ' + entries.length + ' 条'),
        h('span', { style: { flex: 1 } }),
        h('label', { className: 'field-inline', title: '只影响价格显示，不影响比较口径（比较一律按美元）' },
          h('span', null, '显示币种'),
          h('select', {
            value: settings.displayCurrency === 'CNY' ? 'CNY' : 'USD',
            style: { width: '78px' },
            onChange: function (event) { patchSettings({ displayCurrency: event.target.value }, '显示币种已切换') },
          },
            h('option', { value: 'USD' }, 'USD $'),
            h('option', { value: 'CNY' }, 'CNY ¥'))),
        h('label', { className: 'field-inline', title: '只影响人民币标价/展示的折算' },
          h('span', null, '汇率 USD→CNY'),
          h('input', {
            type: 'number',
            step: '0.0001',
            min: 1,
            key: 'fx-' + rate,
            defaultValue: String(rate),
            style: { width: '96px' },
            onBlur: function (event) {
              var value = Number(event.target.value)
              // 清空或非正数不提交：Number('') 是 0，直接 PATCH 会把 0 存进设置
              if (!(value > 0) || value === rate) return
              patchSettings({ fxUsdCny: value }, '汇率已更新（手动）')
            },
          })),
        h('span', { className: 'hint' }, fxNote),
        h(
          'button',
          {
            type: 'button',
            className: 'ghost tiny',
            disabled: fxBusy,
            title: '从公开汇率源拉一次 USD→CNY（手动模式下 daemon 会提示先恢复自动）',
            onClick: function () {
              setFxBusy(true)
              // 不走 writeOp：fx/refresh 的失败响应带 hint（比如「手动汇率先恢复自动」），要透出来
              fetchJson('write', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ method: 'POST', path: '/api/fx/refresh', payload: {} }),
              }).then(function (res) {
                setFxBusy(false)
                var body = (res && res.body) || {}
                if (res && res.ok && body.ok) {
                  setMessage('汇率已更新，下一轮比价按新汇率折算')
                  reload()
                } else {
                  setMessage((body && body.hint) || '汇率没更新')
                }
              })
            },
          },
          fxBusy ? '拉取中…' : '刷新汇率',
        ),
        fx.manual
          ? h(
              'button',
              {
                type: 'button',
                className: 'ghost tiny',
                title: '清掉手动汇率，恢复自动拉取（下一轮刷新生效）',
                onClick: function () {
                  patchSettings({ fxAuto: true }, '已恢复自动汇率，下一轮会去拉取')
                },
              },
              '恢复自动',
            )
          : null)

      // ── 表格（原文结构：key 列下挂「显示名 · 来源」小字）─────────
      var bodyRows = matching.map(function (pair) {
        var key = pair[0]
        var entry = pair[1]
        var extras = []
        var display = String(entry.display || '')
        if (display && display !== key) extras.push(display)
        var src = sourceLabel(entry.source)
        if (src) extras.push(src)
        return h('tr', { key: key },
          h('td', { className: 'mono' },
            key,
            extras.length ? h('div', { className: 'sub', style: { color: 'var(--faint)' } }, extras.join(' · ')) : null),
          h('td', { className: 'num' },
            h('input', {
              type: 'number', step: '0.001', placeholder: '—',
              key: key + ':in:' + (entry.in === null || entry.in === undefined ? '' : entry.in),
              defaultValue: entry.in === null || entry.in === undefined ? '' : String(entry.in),
              disabled: benchBusy, title: '空闲时段之外的输入单价，失焦保存',
              onBlur: benchCommit(key, 'in', true),
            })),
          h('td', { className: 'num' },
            h('input', {
              type: 'number', step: '0.001', placeholder: '—',
              key: key + ':out:' + (entry.out === null || entry.out === undefined ? '' : entry.out),
              defaultValue: entry.out === null || entry.out === undefined ? '' : String(entry.out),
              disabled: benchBusy, title: '空闲时段之外的输出单价，失焦保存',
              onBlur: benchCommit(key, 'out', true),
            })),
          h('td', { className: 'num', style: { whiteSpace: 'nowrap' } },
            h('input', {
              type: 'number', step: '0.001', placeholder: '入',
              key: key + ':opi:' + (entry.offPeakIn === null || entry.offPeakIn === undefined ? '' : entry.offPeakIn),
              defaultValue: entry.offPeakIn === null || entry.offPeakIn === undefined ? '' : String(entry.offPeakIn),
              disabled: benchBusy, style: { width: '62px' }, title: '空闲时段输入价（如 DeepSeek 半价时段），没有就留空',
              onBlur: benchCommit(key, 'offPeakIn', true),
            }),
            h('input', {
              type: 'number', step: '0.001', placeholder: '出',
              key: key + ':opo:' + (entry.offPeakOut === null || entry.offPeakOut === undefined ? '' : entry.offPeakOut),
              defaultValue: entry.offPeakOut === null || entry.offPeakOut === undefined ? '' : String(entry.offPeakOut),
              disabled: benchBusy, style: { width: '62px' }, title: '空闲时段输出价',
              onBlur: benchCommit(key, 'offPeakOut', true),
            })),
          h('td', null,
            h('select', { value: entry.currency === 'CNY' ? 'CNY' : 'USD', disabled: benchBusy, title: '基准价币种', style: { width: '70px' }, onChange: benchCommit(key, 'currency', false) },
              h('option', { value: 'USD' }, 'USD'),
              h('option', { value: 'CNY' }, 'CNY'))),
          h('td', { className: 'num' },
            h('button', { type: 'button', className: 'ghost danger', disabled: benchBusy, title: '删除这条基准价', onClick: function () { benchDelete(key) } }, '删除')))
      })

      if (!bodyRows.length) {
        bodyRows = [h('tr', null,
          h('td', { colSpan: 6, style: { color: 'var(--faint)', textAlign: 'center', padding: '24px' } }, '还没有基准价'))]
      }

      var footerRow = null
      if (layering && restCount > 0) {
        footerRow = h('tr', null,
          h('td', { colSpan: 6, style: { textAlign: 'center', padding: '10px', borderTop: '1px dashed var(--border)' } },
            h('button', { type: 'button', className: 'ghost tiny', onClick: function () { setShowAll(true) } },
              '显示其余 ' + restCount + ' 条（未匹配本地供给）')))
      } else if (showAll && !filterText && relevantCount < entries.length) {
        footerRow = h('tr', null,
          h('td', { colSpan: 6, style: { textAlign: 'center', padding: '10px', borderTop: '1px dashed var(--border)' } },
            h('button', { type: 'button', className: 'ghost tiny', onClick: function () { setShowAll(false) } },
              '收起，只看与本地供给相关的 ' + relevantCount + ' 条')))
      }

      var table = h('div', { className: 'table-wrap' },
        h('table', null,
          h('thead', null,
            h('tr', null,
              h('th', null, '模型 ', h('span', { style: { color: 'var(--faint)', fontWeight: 400 } }, '（小字为显示名 / 来源）')),
              h('th', { className: 'num' }, '输入价'),
              h('th', { className: 'num' }, '输出价'),
              h('th', { className: 'num' }, '空闲价（入 / 出）'),
              h('th', null, '币种'),
              h('th'))),
          h('tbody', null, bodyRows, footerRow)))

      return h('section', { className: 'view wide' },
        h('p', { className: 'hint' }, '基准价是「倍率」的换算参照。三条路：从站点导入官方价、以此站已填价为准、或载入内置参考价。'),
        importCard,
        toolbar,
        message ? h('p', { className: 'hint' }, message) : null,
        table)
    }
