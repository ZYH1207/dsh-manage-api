import io

p = r'D:\AgentWorkPlace\DSH\dsh-manage-api\lib\client.js'
s = io.open(p, encoding='utf-8').read()

# 1) TABS -> 9 个，与网页版左栏一致
old_tabs_start = s.index('    var TABS = [')
old_tabs_end = s.index('    ]\n', old_tabs_start) + len('    ]\n')
new_tabs = """    var TABS = [
      { id: 'overview', title: '概览', desc: '状态与排名' },
      { id: 'monitor', title: '站点', desc: '余额与分组', wide: true },
      { id: 'free', title: '免费', desc: '额度与积分' },
      { id: 'pricing', title: '比价', desc: '同一模型对比', wide: true },
      { id: 'decision', title: '智能决策', desc: '选站与手动调整', wide: true },
      { id: 'probes', title: '探针', desc: '检测是否偷工', wide: true },
      { id: 'gateway', title: '网关', desc: '一个入口接管' },
      { id: 'usage', title: '用量', desc: '消耗统计' },
      { id: 'benchmark', title: '基准价', desc: '官方价参照', wide: true },
    ]

    // 网页版左栏图标（内联 SVG，沿用 index.html 的 path）
    var TAB_ICONS = {
      overview:
        '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
      monitor: '<path d="M3 3v18h18"/><polyline points="7 14 11 8 15 12 20 4"/>',
      free: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
      pricing: '<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="18" y1="20" x2="18" y2="10"/>',
      decision:
        '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
      probes: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      gateway: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      usage: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      benchmark:
        '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    }

    function TabIcon(props) {
      var html = TAB_ICONS[props.id] || ''
      return h('svg', {
        viewBox: '0 0 24 24',
        dangerouslySetInnerHTML: { __html: html },
      })
    }
"""
s = s[:old_tabs_start] + new_tabs + s[old_tabs_end:]

# 2) 视图分发：按 tab id 映射到组件；未带 selfRoot 的用 section.view 包一层
old_body_start = s.index('      var body\n      if (tab === \'sites\')')
old_body_end = s.index('      var activeTab =', old_body_start)
new_body = """      var activeTab =
        TABS.filter(function (item) {
          return item.id === tab
        })[0] || TABS[0]

      var viewProps = {
        api: api,
        health: health,
        state: api.state,
        busy: api.busy,
        restart: api.restart,
        onReload: api.reload,
        onGoTab: setTab,
      }

      var body
      if (tab === 'monitor') body = h(MonitorView, viewProps)
      else if (tab === 'free') body = h(FreeView, viewProps)
      else if (tab === 'pricing') body = h(PricesView, viewProps)
      else if (tab === 'decision') body = h(DecisionView, viewProps)
      else if (tab === 'probes') body = h(ProbesView, viewProps)
      else if (tab === 'gateway') body = h(GatewayView, viewProps)
      else if (tab === 'usage') body = h(UsageView, viewProps)
      else if (tab === 'benchmark') body = h(BenchmarkView, viewProps)
      else body = h(OverviewTab, viewProps)

      if (!activeTab.selfRoot) {
        body = h('section', { className: 'view' + (activeTab.wide ? ' wide' : '') }, body)
      }

"""
s = s[:old_body_start] + new_body + s[old_body_end:]

# 3) 删掉原来重复的 activeTab 计算
dup_start = s.index('      var activeTab =', s.index(new_body) + len(new_body))
dup_end = s.index('      var sub = activeTab.desc', dup_start)
s = s[:dup_start] + s[dup_end:]

# 4) 顶栏 tab 图标
s = s.replace("                Icon(item.icon, { size: 15 }),", "                h(TabIcon, { id: item.id }),")

# 5) body 容器改为 .content（沿用网页版 .content/.view 宽度规则）
s = s.replace("h('div', { className: 'ma-body' }, errorLine, body),", "h('div', { className: 'content' }, errorLine, body),")

# 6) EXTRA_CSS 调整
s = s.replace(
    '".ma-root .ma-body{padding:16px 20px 8px;min-width:0}"',
    '".ma-root .content{padding:16px 20px 60px;min-width:0;overflow:visible}"',
)
s = s.replace(
    '".ma-root.ma-section .ma-body{padding:14px 0 0}"',
    '".ma-root.ma-section .content{padding:14px 0 20px}"',
)
s = s.replace(
    '".ma-root .ma-page{width:100%;max-width:1120px;margin:0 auto;padding:0 0 8px}"',
    '".ma-root .ma-page{width:100%;margin:0 auto;padding:0 0 8px}"',
)
s = s.replace(
    '".ma-root.ma-section .ma-page{max-width:none}"',
    '".ma-root.ma-section .ma-page{max-width:none}"\n    ".ma-root .ma-tabs svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}"',
)
s = s.replace(
    '".ma-root .ma-body{padding:16px 20px 8px;min-width:0}"',
    '".ma-root .content{padding:16px 20px 60px;min-width:0;overflow:visible}"',
)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('shell patched')
