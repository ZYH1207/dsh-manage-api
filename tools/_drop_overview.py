import io

p = r'D:\AgentWorkPlace\DSH\dsh-manage-api\lib\client.js'
s = io.open(p, encoding='utf-8').read()

start = s.index('    // ── 概览（对齐网页版 renderOverview')
end = s.index('    // ── 站点（含凭据管理、添加向导）')
removed = s[start:end]
assert 'function OverviewTab' in removed
s = s[:start] + s[end:]

# 挂载点提示：旧 OverviewTab 已删，概览改由 parts/05-overview.js 提供
s = s.replace(
    "      else body = h(OverviewTab, viewProps)",
    "      else body = h(OverviewView, viewProps)",
    1,
)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('removed old OverviewTab, %d chars' % len(removed))
