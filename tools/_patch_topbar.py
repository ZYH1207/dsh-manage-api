import io, re

p = r'D:\AgentWorkPlace\DSH\dsh-manage-api\lib\client.js'
s = io.open(p, encoding='utf-8').read()

# 1) 自动刷新开关
s = s.replace(
    "      var theme = useTheme()\n      var api = useApi(15000)\n",
    "      var theme = useTheme()\n      var autoPair = React.useState(true)\n      var auto = autoPair[0]\n      var setAuto = autoPair[1]\n      var api = useApi(auto ? 15000 : 0)\n",
    1,
)

# 2) 顶栏：刷新按钮带文字 + 自动刷新开关
old = """              h(
                'button',
                {
                  type: 'button',
                  className: 'top-btn',
                  title: '刷新',
                  onClick: function () {
                    api.reload()
                  },
                },
                Icon('refresh', { size: 14 }),
              ),
              h('span', { className: 'dot ' + (health.probe && health.probe.ok ? 'green' : 'yellow') }),"""
new = """              h(
                'button',
                {
                  type: 'button',
                  className: 'top-btn refresh-btn',
                  title: '刷新',
                  onClick: function () {
                    api.reload()
                  },
                },
                Icon('refresh', { size: 14 }),
                h('span', null, '刷新'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'top-btn autorefresh-btn',
                  title: '每 15 秒自动刷新一次',
                  onClick: function () {
                    setAuto(!auto)
                  },
                },
                h('span', { className: 'dot ' + (auto ? 'green' : '') }),
                h('span', null, '自动刷新'),
              ),
              h('span', { className: 'dot ' + (health.probe && health.probe.ok ? 'green' : 'yellow') }),"""
assert old in s
s = s.replace(old, new, 1)

# 3) 站点 tab 的副标题 id 对齐（sites -> monitor）
s = s.replace("} else if (snap && snap.providers && tab === 'sites') {", "} else if (snap && snap.providers && tab === 'monitor') {", 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('topbar patched')
