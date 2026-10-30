// dsh-manage-api — Client 半边（手写 bundle，无构建步骤）。
//
// ## 视觉语言
//
// 直接沿用 ManageAPI 网页版（`web/style.css` 的作用域化副本，见 lib/theme.js）：
// 同样的 token（灰底 + 单一青色强调色、12px 圆角、5 档字阶）、同样的
// .topbar / .card / .table-wrap / .stats / .badge / .notice 结构。
// 所有选择器都挂在 `.ma-root` 下，注入宿主页面不会污染宿主样式。
//
// 为什么不用 iframe：宿主明确禁止，且 iframe 里拿不到主题 token、明暗切换和 locale。
// 所以这里是「把网页版的样式搬过来 + 把 DOM 用 React 重写一遍」。
//
// ## 运行环境
//
// client 跑在沙箱渲染进程：sandbox:true / contextIsolation:true / nodeIntegration:false
// → 没有 process、读不了盘。所有数据都走 host 的 /api/manage-api/* route。
// 每一处 fetch 都必须兜底：任何一环失败只应"少一块内容"，绝不能让整页崩。
window.__ModuleLoader__.load({
  id: 'dsh-manage-api',
  factory: function (require) {
    'use strict'

    var React = require('react')
    var h = React.createElement
    var name = 'dsh-manage-api'
    // slots 是硬依赖：写在 inject 里，宿主会等它就绪再激活本插件。
    var inject = ['slots']

    var API_PREFIX = 'manage-api'

    // ── 样式（由 tools/vendor-theme.mjs 从 ManageAPI/web/style.css 生成） ──
    // >>> theme:begin
    // 由 tools/embed-theme.mjs 从 lib/theme.js 灌入，请勿手改这一段。
    var THEME_CSS = ".ma-root { --bg: #fafafa; --surface: #ffffff; --surface-2: #fbfbfc; --hover: #f4f4f5; --code-bg: #f4f4f5; --divider: #f0f0f2; --border: #e6e6e9; --border-strong: #d4d4d9; --text: #14161a; --muted: #616a76; --faint: #949ba6; --accent: #0f766e; --accent-soft: #ecfdf5; --accent-mid: #99f6e4; --success: #0f9d6b; --success-soft: #f1fbf6; --row-cheapest-hover: #f0fbf6; --danger: #b42318; --danger-strong: #e0483f; --danger-soft: #fef3f2; --warn: #92400e; --warn-strong: #e0a216; --warn-soft: #fffaeb; --info: #3b5bdb; --info-soft: #eef1fd; --info-border: #d9e0fb; --radius: 12px; --shadow: 0 1px 2px rgba(16, 24, 40, 0.04); --topbar-bg: rgba(255, 255, 255, 0.86); --warn-border: #f2e2be; --danger-border: #f2d7d4; --alert-desc: #5a636e; --fs-1: 11px; --fs-2: 12px; --fs-3: 13px; --fs-4: 15px; --fs-5: 22px; --quota-track: #eff0f2; --quota-fill: #0f9d6b; --quota-warn: #e0a216; --quota-empty: #c9ced6; }\n.ma-root[data-ma-theme='dark'] { --bg: #0b0d10; --surface: #111418; --surface-2: #14181d; --hover: #191e24; --code-bg: #171b21; --divider: #1b2027; --border: #232a32; --border-strong: #333c46; --text: #e8edf3; --muted: #98a4b3; --faint: #6b7787; --accent: #34d399; --accent-soft: rgba(52, 211, 153, 0.10); --accent-mid: rgba(52, 211, 153, 0.40); --success: #34d399; --success-soft: rgba(52, 211, 153, 0.07); --row-cheapest-hover: rgba(52, 211, 153, 0.08); --danger: #f87171; --danger-strong: #ef4444; --danger-soft: rgba(248, 113, 113, 0.10); --warn: #fbbf24; --warn-strong: #f59e0b; --warn-soft: rgba(251, 191, 36, 0.10); --info: #93a7f8; --info-soft: rgba(147, 167, 248, 0.14); --info-border: rgba(147, 167, 248, 0.30); --shadow: 0 1px 2px rgba(0, 0, 0, 0.40); --topbar-bg: rgba(11, 13, 16, 0.86); --warn-border: rgba(251, 191, 36, 0.28); --danger-border: rgba(248, 113, 113, 0.42); --alert-desc: rgba(255, 255, 255, 0.76); --quota-track: #222a33; --quota-fill: #34d399; --quota-warn: #fbbf24; --quota-empty: #3a4450; color-scheme: dark; }\n.ma-root, .ma-root * { box-sizing: border-box; }\n.ma-root { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, \"Microsoft YaHei\", sans-serif; font-size: 13px; line-height: 1.62; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }\n.ma-root h1, .ma-root h2, .ma-root h3 { margin: 0; font-weight: 500; }\n.ma-root button { font: inherit; cursor: pointer; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); padding: 5px 11px; border-radius: 8px; transition: background 0.15s, border-color 0.15s, color 0.15s; }\n.ma-root button:hover { background: var(--hover); }\n.ma-root button:active { background: var(--code-bg); }\n.ma-root button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }\n.ma-root button.primary:hover { background: #0d655d; border-color: #0d655d; }\n.ma-root[data-ma-theme='dark'] button.primary { color: #06231b; }\n.ma-root[data-ma-theme='dark'] button.primary:hover { background: #6ee7b7; border-color: #6ee7b7; }\n.ma-root button.ghost { border-color: transparent; color: var(--muted); padding: 4px 8px; }\n.ma-root button.ghost:hover { background: var(--hover); color: var(--text); }\n.ma-root button.danger { color: var(--danger); border-color: var(--danger-border); }\n.ma-root button.danger:hover { background: var(--danger-soft); border-color: var(--danger); }\n.ma-root button:disabled { opacity: 0.5; cursor: default; }\n.ma-root button.is-busy { opacity: 0.6; pointer-events: none; position: relative; }\n.ma-root button.is-busy::after { content: ''; display: inline-block; width: 10px; height: 10px; margin-left: 6px; vertical-align: -1px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: ma-busy-spin 0.7s linear infinite; }\n@keyframes ma-busy-spin { to { transform: rotate(360deg); } }\n.ma-root input, .ma-root select { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border-strong); border-radius: 8px; padding: 5px 9px; width: 100%; transition: border-color 0.15s, box-shadow 0.15s; }\n.ma-root input:focus, .ma-root select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }\n.ma-root .shell { display: flex; height: 100vh; overflow: hidden; }\n.ma-root .sidebar { width: 216px; flex-shrink: 0; background: var(--bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 14px 0 12px; }\n.ma-root .brand { display: flex; align-items: center; gap: 9px; padding: 0 16px 18px; }\n.ma-root .logo { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 7px; background: linear-gradient(140deg, var(--accent), #115e59); color: #fff; flex-shrink: 0; box-shadow: none; }\n.ma-root .logo svg { width: 16px; height: 16px; }\n.ma-root .brand-text { display: flex; flex-direction: column; line-height: 1.25; }\n.ma-root .brand h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }\n.ma-root .brand .sub { color: var(--faint); font-size: 11px; }\n.ma-root .nav { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; flex: 1; overflow-y: auto; }\n.ma-root .nav button { display: flex; align-items: center; gap: 10px; border: 1px solid transparent; background: none; text-align: left; padding: 7px 9px; border-radius: 8px; color: var(--muted); font-size: 13px; position: relative; transition: background 0.12s, color 0.12s, border-color 0.12s; }\n.ma-root .nav button svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; opacity: 0.7; }\n.ma-root .nav-text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }\n.ma-root .nav-title { font-size: 13px; }\n.ma-root .nav-desc { font-size: 11px; color: var(--faint); margin-top: 1px; white-space: nowrap; }\n.ma-root .nav button:hover { background: var(--hover); color: var(--text); }\n.ma-root .nav button:hover svg { opacity: 1; }\n.ma-root .nav button.active { background: var(--surface); border-color: var(--border); color: var(--text); font-weight: 500; box-shadow: var(--shadow); }\n.ma-root .nav button.active svg { opacity: 1; color: var(--accent); }\n.ma-root .nav button.active .nav-desc { color: var(--accent); opacity: 0.7; }\n.ma-root .sidebar-foot { margin-top: auto; padding: 10px 10px 4px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }\n.ma-root .side-link { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: none; background: none; border-radius: 9px; color: var(--muted); font-size: 13px; text-align: left; cursor: pointer; transition: background 0.12s, color 0.12s; }\n.ma-root .side-link:hover { background: var(--hover); color: var(--text); }\n.ma-root .side-link svg { width: 17px; height: 17px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }\n.ma-root .side-link span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .sidebar { transition: width 0.18s ease; }\n.ma-root .sidebar.collapsed { width: 64px; }\n.ma-root .sidebar.collapsed .brand { justify-content: center; padding: 0 0 18px; }\n.ma-root .sidebar.collapsed .brand-text { display: none; }\n.ma-root .sidebar.collapsed .nav { padding: 0 8px; }\n.ma-root .sidebar.collapsed .nav-text { display: none; }\n.ma-root .sidebar.collapsed .nav button { justify-content: center; padding: 9px 0; }\n.ma-root .sidebar.collapsed .nav button.active::before { left: -8px; }\n.ma-root .sidebar.collapsed .sidebar-foot { padding: 10px 8px 4px; }\n.ma-root .sidebar.collapsed .side-link { justify-content: center; padding: 9px 0; }\n.ma-root .sidebar.collapsed .side-link span { display: none; }\n.ma-root .sidebar.collapsed #sidebar-toggle svg { transform: rotate(180deg); }\n.ma-root .modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }\n.ma-root .modal[hidden] { display: none; }\n.ma-root .modal-backdrop { position: absolute; inset: 0; background: rgba(15, 26, 23, 0.32); backdrop-filter: blur(2px); }\n.ma-root .modal-panel { position: relative; width: min(700px, calc(100vw - 40px)); max-height: min(740px, calc(100vh - 60px)); background: var(--surface); border-radius: 14px; box-shadow: 0 20px 50px rgba(15, 26, 23, 0.18); display: flex; flex-direction: column; overflow: hidden; }\n.ma-root .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }\n.ma-root .modal-head h3 { font-size: 15px; font-weight: 600; }\n.ma-root .diagnose-text { width: 100%; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; color: var(--text); background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }\n.ma-root .modal-body { padding: 18px 22px 26px; overflow-y: auto; font-size: 13px; line-height: 1.95; color: var(--muted); }\n.ma-root .modal-body p { margin: 0; }\n.ma-root .modal-body h4 { margin: 20px 0 6px; font-size: 13px; color: var(--text); font-weight: 600; }\n.ma-root .modal-body h5 { margin: 14px 0 4px; font-size: 13px; color: var(--accent); font-weight: 600; }\n.ma-root .modal-body h5 + p { margin-top: 0; }\n.ma-root .modal-body b { color: var(--text); font-weight: 500; }\n.ma-root .modal-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; color: var(--text); }\n.ma-root .contact-intro { display: flex; align-items: center; gap: 14px; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }\n.ma-root .contact-logo { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, var(--accent), #14b8a6); color: #fff; flex-shrink: 0; box-shadow: 0 3px 10px rgba(15, 110, 86, 0.2); }\n.ma-root .contact-logo svg { width: 22px; height: 22px; }\n.ma-root .contact-name { font-size: 15px; font-weight: 600; color: var(--text); }\n.ma-root .contact-tagline { font-size: 12px; color: var(--faint); margin-top: 2px; }\n.ma-root .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }\n.ma-root .contact-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; background: var(--surface); transition: border-color 0.15s, background 0.15s, transform 0.1s; }\n.ma-root .contact-card:hover { border-color: var(--accent-mid); background: var(--accent-soft); }\n.ma-root .contact-card:active { transform: scale(0.985); }\n.ma-root .contact-icon { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; background: var(--hover); color: var(--muted); flex-shrink: 0; transition: background 0.15s, color 0.15s; }\n.ma-root .contact-card:hover .contact-icon { background: #fff; color: var(--accent); }\n.ma-root .contact-icon svg { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }\n.ma-root .contact-text { display: flex; flex-direction: column; min-width: 0; }\n.ma-root .contact-text b { font-size: 13px; font-weight: 500; color: var(--text); }\n.ma-root .contact-text span { font-size: 11px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .contact-note { margin-top: 18px !important; font-size: 12px !important; color: var(--faint) !important; }\n.ma-root .contact-empty { font-size: 12px; color: var(--faint); line-height: 1.9; }\n.ma-root .contact-empty code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }\n@media (max-width: 560px) {\n  .ma-root .contact-grid { grid-template-columns: 1fr; }\n}\n.ma-root .doc { max-width: 800px; font-size: 13px; line-height: 1.95; color: var(--muted); }\n.ma-root .doc-lead { font-size: 13px; color: var(--text); margin: 0 0 22px; }\n.ma-root .doc-h3 { font-size: 15px; font-weight: 600; color: var(--text); margin: 34px 0 10px; padding-top: 20px; border-top: 1px solid var(--border); }\n.ma-root .doc-h3:first-of-type { border-top: none; padding-top: 0; margin-top: 24px; }\n.ma-root .doc-h4 { font-size: 13px; font-weight: 600; color: var(--accent); margin: 20px 0 6px; }\n.ma-root .doc p { margin: 0 0 10px; }\n.ma-root .doc b { color: var(--text); font-weight: 500; }\n.ma-root .doc code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; color: var(--text); }\n.ma-root .doc-steps { margin: 0 0 10px; padding-left: 22px; }\n.ma-root .doc-steps li { margin-bottom: 6px; }\n.ma-root .doc-note { margin: 12px 0; padding: 8px 12px; border-left: 2px solid var(--accent); background: var(--accent-soft); border-radius: 0 6px 6px 0; color: var(--muted); }\n.ma-root .doc-note a { color: var(--accent); }\n.ma-root .help-panel { width: min(920px, calc(100vw - 40px)); height: min(760px, calc(100vh - 60px)); }\n.ma-root .help-body { display: flex; flex: 1; min-height: 0; }\n.ma-root .help-toc { width: 186px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; padding: 12px 8px 20px; background: var(--surface-2); }\n.ma-root .toc-item { display: block; width: 100%; text-align: left; padding: 5px 10px; border: none; background: none; font-size: 12px; color: var(--muted); border-radius: 6px; cursor: pointer; transition: background 0.12s, color 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .toc-item.lvl1 { font-weight: 500; color: var(--text); margin-top: 6px; }\n.ma-root .toc-item.lvl2 { padding-left: 20px; font-size: 12px; color: var(--faint); }\n.ma-root .toc-item:hover { background: var(--hover); }\n.ma-root .toc-item.active { background: var(--accent-soft); color: var(--accent); }\n.ma-root .help-content { flex: 1; overflow-y: auto; padding: 18px 26px 34px; }\n.ma-root .help-content .doc { max-width: none; }\n.ma-root .ghost-btn { font-size: 12px; color: var(--faint); text-decoration: none; padding: 4px 8px; border-radius: 6px; }\n.ma-root .ghost-btn:hover { background: var(--hover); color: var(--muted); }\n.ma-root main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }\n.ma-root .topbar { height: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 28px; background: var(--topbar-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); z-index: 10; }\n.ma-root .topbar-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }\n.ma-root .topbar-left h2 { font-size: 15px; font-weight: 600; letter-spacing: 0.2px; }\n.ma-root .topbar-sub { font-size: 12px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }\n.ma-root .notify-wrap { position: relative; }\n.ma-root .notify-btn { position: relative; width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; color: var(--muted); }\n.ma-root .notify-btn:hover { background: var(--hover); color: var(--text); }\n.ma-root .notify-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }\n.ma-root .notify-dot { position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--danger-strong); border: 1.5px solid var(--surface); }\n.ma-root .notify-panel { position: absolute; top: 40px; right: 0; width: 330px; max-height: 440px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 32px rgba(15, 26, 23, 0.12); overflow: hidden; display: flex; flex-direction: column; z-index: 60; }\n.ma-root .notify-panel[hidden] { display: none; }\n.ma-root .notify-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--muted); }\n.ma-root .notify-list { overflow-y: auto; }\n.ma-root .notify-empty { padding: 30px 14px; text-align: center; color: var(--faint); font-size: 12px; }\n.ma-root .notify-item { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--divider); }\n.ma-root .notify-item:last-child { border-bottom: none; }\n.ma-root .notify-bar { width: 3px; border-radius: 2px; flex-shrink: 0; background: var(--faint); }\n.ma-root .notify-item.danger .notify-bar { background: var(--danger-strong); }\n.ma-root .notify-item.warn .notify-bar { background: var(--warn-strong); }\n.ma-root .notify-item.info .notify-bar { background: var(--accent-mid); }\n.ma-root .notify-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }\n.ma-root .notify-text b { font-size: 13px; font-weight: 500; color: var(--text); }\n.ma-root .notify-text span { font-size: 12px; color: var(--muted); line-height: 1.5; }\n.ma-root .notify-item.read { opacity: 0.88; }\n.ma-root .notify-item.read .notify-bar { opacity: 0.45; }\n.ma-root .content { flex: 1; overflow-y: auto; padding: 22px 28px 80px; }\n.ma-root .content > .view { max-width: 1120px; }\n.ma-root .content > .view.wide { max-width: 1680px; }\n@media (max-width: 820px) {\n  .ma-root .shell { flex-direction: column; height: auto; overflow: visible; }\n  .ma-root .sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 12px 0 0; }\n  .ma-root .brand { padding-bottom: 10px; }\n  .ma-root .nav { flex-direction: row; overflow-x: auto; padding: 0 12px; gap: 2px; flex: none; }\n  .ma-root .nav button { white-space: nowrap; border-radius: 8px 8px 0 0; }\n  .ma-root .nav button.active::before { display: none; }\n  .ma-root .nav button.active { border-radius: 8px; }\n  .ma-root .sidebar-foot { border-top: none; padding: 10px 16px 12px; flex-direction: row; gap: 8px; }\n  .ma-root .sidebar-foot .side-link { width: auto; }\n  .ma-root main { overflow: visible; }\n  .ma-root .topbar { padding: 0 16px; }\n  .ma-root .content { overflow: visible; padding: 18px 16px 60px; }\n}\n.ma-root .headline { padding: 0 0 18px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }\n.ma-root .headline .kicker { font-size: 11px; color: var(--faint); letter-spacing: 1.2px; margin-bottom: 6px; }\n.ma-root .headline .line { font-size: 15px; line-height: 1.7; font-weight: 400; color: var(--muted); }\n.ma-root .headline .line strong { color: var(--text); font-weight: 600; }\n.ma-root .headline .line strong:last-of-type { color: var(--accent); }\n.ma-root .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 22px; }\n.ma-root .stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px 14px; }\n.ma-root .stat .k { color: var(--faint); font-size: 11px; letter-spacing: 0.4px; }\n.ma-root .stat .v { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; margin-top: 3px; }\n.ma-root .stat .v small { font-size: 12px; color: var(--muted); font-weight: 500; margin-left: 3px; }\n.ma-root .page-title { font-size: 15px; font-weight: 500; }\n.ma-root .page-sub { color: var(--faint); font-size: 12px; margin: 2px 0 18px; }\n.ma-root .notice-list { display: flex; flex-direction: column; gap: 0; margin-bottom: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }\n.ma-root .notice { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--divider); padding: 11px 14px; font-size: 13px; }\n.ma-root .notice:last-child { border-bottom: none; }\n.ma-root .notice .name { font-weight: 500; }\n.ma-root .notice .name::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; background: var(--warn-strong); }\n.ma-root .notice.danger .name::before { background: var(--danger-strong); }\n.ma-root .notice.calm .name::before { background: var(--success); }\n.ma-root .notice .desc { color: var(--muted); }\n.ma-root .notice .grow { flex: 1; }\n.ma-root .notice-more { border: none; border-radius: 0; border-top: 1px solid var(--divider); background: none; width: 100%; text-align: left; padding: 10px 14px; color: var(--accent); font-size: 12px; }\n.ma-root .notice-more:hover { background: var(--hover); }\n.ma-root .alert-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }\n.ma-root .alert { display: flex; align-items: center; gap: 12px; background: var(--warn-soft); border: 1px solid var(--warn-border); border-radius: 10px; padding: 10px 14px; font-size: 13px; }\n.ma-root .alert.danger { background: var(--danger-soft); border-color: var(--danger-border); }\n.ma-root .alert .name { font-weight: 500; }\n.ma-root .alert .desc { color: var(--alert-desc); }\n.ma-root .alert .grow { flex: 1; }\n.ma-root .alert.calm { background: var(--success-soft); border-color: var(--border); }\n.ma-root .note-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; font-size: 12px; line-height: 1.7; color: var(--muted); margin-bottom: 14px; }\n.ma-root .note-card b { color: var(--text); font-weight: 600; }\n.ma-root .note-card code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 11px; }\n.ma-root .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; background: var(--quota-empty); }\n.ma-root .dot.green { background: var(--success); }\n.ma-root .dot.yellow { background: var(--warn-strong); }\n.ma-root .dot.red { background: var(--danger-strong); }\n.ma-root .score-wrap { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }\n.ma-root .score-bar { width: 54px; height: 4px; background: var(--quota-track); border-radius: 2px; overflow: hidden; flex-shrink: 0; }\n.ma-root .score-bar i { display: block; height: 100%; border-radius: 2px; }\n.ma-root .score-bar i.good { background: var(--success); }\n.ma-root .score-bar i.mid { background: var(--warn-strong); }\n.ma-root .score-bar i.bad { background: var(--danger-strong); }\n.ma-root .bars { display: flex; align-items: flex-end; gap: 3px; height: 132px; padding: 8px 4px 22px; border-bottom: 1px solid var(--border); position: relative; }\n.ma-root .bar-item { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; }\n.ma-root .bar { width: 100%; max-width: 26px; margin: 0 auto; background: var(--accent-mid); border-radius: 3px 3px 0 0; min-height: 2px; transition: background 0.15s; }\n.ma-root .bar-item:hover .bar { background: var(--accent); }\n.ma-root .bar-item.zero .bar { background: #ebeeed; }\n.ma-root .bar-label { position: absolute; bottom: -18px; left: 0; right: 0; text-align: center; font-size: 11px; color: var(--faint); white-space: nowrap; overflow: hidden; }\n.ma-root .seg { display: inline-flex; gap: 2px; background: var(--hover); padding: 2px; border-radius: 8px; }\n.ma-root .seg button { border: none; background: none; padding: 4px 12px; border-radius: 6px; font-size: 12px; color: var(--muted); }\n.ma-root .seg button:hover { background: var(--hover); }\n.ma-root .seg button.active { background: var(--surface); color: var(--text); font-weight: 500; box-shadow: var(--shadow); }\n.ma-root .field-inline { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; }\n.ma-root .field-inline select, .ma-root .field-inline input { width: auto; padding: 4px 8px; font-size: 12px; }\n.ma-root .group-input { width: 96px; padding: 3px 7px; font-size: 12px; }\n.ma-root button.tiny { padding: 2px 6px; font-size: 12px; line-height: 1.2; vertical-align: middle; }\n.ma-root button.sm { padding: 4px 9px; font-size: 12px; }\n.ma-root .prov-card { padding: 14px 16px; container-type: inline-size; }\n@container (max-width: 400px) {\n  .ma-root .prov-head .hint { display: none; }\n}\n@container (max-width: 460px) {\n  .ma-root .prov-head-right { gap: 3px; }\n  .ma-root .prov-head-right .icon-btn { width: 19px; height: 19px; border-radius: 5px; }\n  .ma-root .prov-head-right .icon-btn svg { width: 12px; height: 12px; }\n}\n.ma-root .prov-head .hint { white-space: nowrap; }\n.ma-root .prov-head { display: flex; align-items: center; gap: 10px; }\n.ma-root .prov-id { display: flex; align-items: center; gap: 8px; min-width: 0; }\n.ma-root .prov-tiles--3 { grid-template-columns: 1.25fr 0.85fr 0.9fr !important; }\n.ma-root .prov-tiles--3 > div { gap: 2px; }\n.ma-root .prov-tiles--3 b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .prov-tiles input.unit-price { width: 100%; padding: 2px 6px; font-size: 13px; font-weight: 600; }\n.ma-root .spend-muted { color: var(--faint); font-weight: 500; font-size: 15px; }\n.ma-root .spend-actual { color: var(--accent); font-weight: 600; font-size: 22px; line-height: 1.25; }\n.ma-root .spend-range { display: inline-flex; gap: 2px; }\n.ma-root .spend-range button { white-space: nowrap; }\n.ma-root .spend-range-row { display: block; margin-top: 6px; }\n.ma-root .spend-range button { border: none; background: none; cursor: pointer; padding: 1px 5px; font-size: 10px; color: var(--faint); border-radius: 4px; line-height: 1.4; }\n.ma-root .spend-range button:hover { color: var(--text); background: var(--hover); }\n.ma-root .spend-range button.is-on { color: var(--accent); background: var(--accent-soft); font-weight: 600; }\n.ma-root .prov-id .login-dot { width: 7px; height: 7px; margin-right: 0; flex: none; }\n@keyframes ma-login-dot-breathe { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.3); opacity: 1; } }\n.ma-root .prov-id .login-dot { animation: ma-login-dot-breathe 2.6s ease-in-out infinite; }\n@media (prefers-reduced-motion: reduce) {\n  .ma-root .prov-id .login-dot { animation: none; }\n}\n.ma-root .prov-id b { font-size: 15px; font-weight: 600; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .prov-head-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }\n.ma-root .prov-head-right .hint { margin: 0; font-size: 11px; }\n.ma-root .icon-btn { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--faint); cursor: pointer; }\n.ma-root .icon-btn:hover { background: var(--hover); color: var(--text); }\n.ma-root .icon-btn svg { width: 15px; height: 15px; }\n.ma-root a.icon-btn:hover { text-decoration: none; }\n.ma-root .prov-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }\n.ma-root .prov-tiles > div { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px 9px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; min-width: 0; }\n.ma-root .prov-tiles .k { font-size: 11px; color: var(--faint); display: flex; align-items: center; gap: 6px; }\n.ma-root .prov-tiles b { font-size: 15px; font-weight: 600; letter-spacing: -0.2px; display: flex; align-items: center; gap: 6px; }\n.ma-root .prov-tiles b .of { font-size: 12px; font-weight: 400; color: var(--faint); }\n.ma-root .prov-tiles .badge { font-size: 11px; }\n.ma-root .prov-tiles--2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin-top: 8px; }\n.ma-root .prov-tiles--2 > div { flex-direction: column; align-items: flex-start; gap: 3px; padding: 8px 10px 9px; position: relative; }\n.ma-root .prov-tiles--2 .k { flex: none; }\n.ma-root .prov-tiles--2 > div > .ghost, .ma-root .prov-tiles--2 > div > button.tiny { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); }\n.ma-root .prov-tiles--2 b { flex-wrap: wrap; row-gap: 4px; }\n.ma-root .prov-tiles--2 b > span { white-space: nowrap; }\n.ma-root .prov-groups { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin-top: 10px; }\n.ma-root .prov-groups .k { font-size: 12px; color: var(--faint); flex: none; }\n.ma-root .prov-group-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }\n.ma-root .prov-group-chips .group-chip { font-size: 11px; padding: 1.5px 7px; line-height: 1.5; background: var(--accent-soft); border: 1px solid transparent; border-radius: 6px; color: var(--accent); font-weight: 500; }\n.ma-root .prov-group-chips .group-chip:hover { border-color: var(--accent); }\n.ma-root { --vendor-free: #7c4de0; --vendor-free-soft: hsl(258 70% 95%); --vendor-free-border: hsl(258 55% 87%); }\n.ma-root[data-ma-theme='dark'] { --vendor-free: #b39df5; --vendor-free-soft: hsl(258 32% 19%); --vendor-free-border: hsl(258 30% 31%); }\n.ma-root .vchip-free { --g-bg: var(--vendor-free-soft); --g-fg: var(--vendor-free); --g-ring: var(--vendor-free-border); }\n.ma-root .vchip-cn { --g-bg: hsl(226 70% 93%); --g-fg: hsl(226 70% 40%); --g-ring: hsl(226 60% 84%); }\n.ma-root .vchip-openai { --g-bg: hsl(166 55% 92%); --g-fg: hsl(166 65% 26%); --g-ring: hsl(166 45% 82%); }\n.ma-root .vchip-anthropic { --g-bg: hsl(18 70% 94%); --g-fg: hsl(18 65% 33%); --g-ring: hsl(18 55% 86%); }\n.ma-root .vchip-google { --g-bg: hsl(43 85% 91%); --g-fg: hsl(43 80% 27%); --g-ring: hsl(43 75% 80%); }\n.ma-root[data-ma-theme='dark'] .vchip-cn { --g-bg: hsl(226 35% 18%); --g-fg: hsl(226 75% 76%); --g-ring: hsl(226 35% 30%); }\n.ma-root[data-ma-theme='dark'] .vchip-openai { --g-bg: hsl(166 30% 14%); --g-fg: hsl(166 55% 62%); --g-ring: hsl(166 30% 25%); }\n.ma-root[data-ma-theme='dark'] .vchip-anthropic { --g-bg: hsl(18 32% 16%); --g-fg: hsl(18 55% 72%); --g-ring: hsl(18 30% 27%); }\n.ma-root[data-ma-theme='dark'] .vchip-google { --g-bg: hsl(43 40% 14%); --g-fg: hsl(43 75% 70%); --g-ring: hsl(43 35% 25%); }\n.ma-root .series-1 { --series: hsl(226 55% 52%); }\n.ma-root .series-2 { --series: hsl(18 60% 52%); }\n.ma-root .series-3 { --series: hsl(166 45% 38%); }\n.ma-root .series-4 { --series: hsl(268 42% 56%); }\n.ma-root .series-5 { --series: hsl(340 48% 55%); }\n.ma-root .series-6 { --series: hsl(43 65% 45%); }\n.ma-root .series-7 { --series: hsl(200 50% 45%); }\n.ma-root .series-8 { --series: hsl(100 30% 42%); }\n.ma-root[data-ma-theme='dark'] .series-1 { --series: hsl(226 70% 68%); }\n.ma-root[data-ma-theme='dark'] .series-2 { --series: hsl(18 70% 66%); }\n.ma-root[data-ma-theme='dark'] .series-3 { --series: hsl(166 55% 58%); }\n.ma-root[data-ma-theme='dark'] .series-4 { --series: hsl(268 60% 72%); }\n.ma-root[data-ma-theme='dark'] .series-5 { --series: hsl(340 60% 68%); }\n.ma-root[data-ma-theme='dark'] .series-6 { --series: hsl(43 75% 62%); }\n.ma-root[data-ma-theme='dark'] .series-7 { --series: hsl(200 60% 62%); }\n.ma-root[data-ma-theme='dark'] .series-8 { --series: hsl(100 40% 58%); }\n.ma-root .monitor-chip.is-on { border-color: var(--text); background: var(--hover); font-weight: 600; }\n.ma-root .monitor-chip .dot { background: var(--series, var(--faint)); }\n.ma-root .group-chip[class*='vchip-'] { background: var(--g-bg); color: var(--g-fg); border-color: var(--g-ring); }\n.ma-root .badge[class*='vchip-'] { background: var(--g-bg); color: var(--g-fg); }\n.ma-root .badge.kindchip-vendor { background: var(--vendor-free-soft); color: var(--vendor-free); }\n.ma-root .badge.kindchip-relay { background: hsl(215 18% 93%); color: hsl(215 15% 38%); }\n.ma-root[data-ma-theme='dark'] .badge.kindchip-relay { background: hsl(215 15% 17%); color: hsl(215 20% 68%); }\n.ma-root .gtag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 6px; background: var(--divider); color: var(--muted); border: 1px solid transparent; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }\n.ma-root .gtag[class*='vchip-'] { background: var(--g-bg); color: var(--g-fg); border-color: var(--g-ring); }\n.ma-root button.group-more { cursor: pointer; background: transparent; color: var(--muted); border: 1px dashed var(--border-strong); }\n.ma-root button.group-more:hover { color: var(--text); border-color: var(--border-strong); background: var(--hover); }\n.ma-root button.group-more { cursor: pointer; background: transparent; color: var(--muted); border: 1px dashed var(--border-strong); }\n.ma-root button.group-more:hover { color: var(--text); border-color: var(--border-strong); background: var(--hover); }\n.ma-root .ratio-tone { font-weight: 600; }\n.ma-root .ratio-tone.warn { color: var(--warn); }\n.ma-root .ratio-tone.bad { color: var(--danger); }\n.ma-root .chip-note { font-size: 10px; opacity: 0.75; font-weight: 400; }\n.ma-root .sync-row { display: flex; align-items: flex-end; gap: 8px; }\n.ma-root .sync-row .field { margin: 0; }\n.ma-root .sync-row .field > span { font-size: 11px; }\n.ma-root .sync-row input[type='number'] { width: 92px; }\n.ma-root .sync-row button { flex: none; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }\n.ma-root .prov-order { display: inline-flex; gap: 2px; }\n.ma-root .prov-foot button svg, .ma-root .prov-order svg { width: 13px; height: 13px; }\n.ma-root .prov-del-icon { color: var(--danger, #c0392b); }\n.ma-root .prov-del-icon:hover { background: var(--danger-soft, #fdecec); color: var(--danger, #c0392b); }\n.ma-root .prov-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }\n.ma-root .prov-actions button, .ma-root .prov-actions a { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; font-size: 12px; width: 100%; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); cursor: pointer; text-decoration: none; }\n.ma-root .prov-actions button:hover, .ma-root .prov-actions a:hover { background: var(--hover); }\n.ma-root .prov-actions button svg, .ma-root .prov-actions a svg { width: 14px; height: 14px; flex: none; opacity: .7; }\n.ma-root .prov-foot { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--border); }\n.ma-root .prov-detail { margin-top: 10px; padding-top: 4px; }\n.ma-root .modal-body .prov-detail { margin-top: 0; padding-top: 0; }\n.ma-root .modal-body .prov-detail .keylist { margin-top: 0 !important; border-top: none !important; padding-top: 0 !important; }\n.ma-root .modal-body .prov-detail .prov-groups { margin-top: 0 !important; }\n.ma-root .modal-body .prov-detail [data-pane] > *:first-child { margin-top: 0 !important; padding-top: 0 !important; border-top: none !important; }\n.ma-root .sub { font-size: 11px; color: var(--faint); margin-top: 2px; font-weight: 400; white-space: nowrap; }\n.ma-root .table-wrap td:last-child { white-space: nowrap; }\n.ma-root .table-wrap td:last-child button { white-space: nowrap; }\n.ma-root .table-wrap td.mono { white-space: nowrap; }\n.ma-root .table-wrap td.mono .badge { margin-left: 6px; vertical-align: 1px; }\n.ma-root .detail-row td { background: var(--surface-2); }\n.ma-root .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding: 14px 18px; }\n.ma-root .detail-title { font-size: 11px; font-weight: 500; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.3px; }\n.ma-root .detail-line { font-size: 12px; line-height: 1.95; }\n.ma-root .detail-line .dim { color: var(--faint); }\n.ma-root .detail-line.danger { color: var(--danger); }\n.ma-root .detail-line.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; }\n@media (max-width: 820px) {\n  .ma-root .detail-grid { grid-template-columns: 1fr; gap: 14px; }\n}\n.ma-root .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }\n.ma-root .toolbar .search { width: 260px; padding: 6px 10px; font-size: 13px; border-radius: 8px; }\n.ma-root .toolbar .search::-webkit-search-cancel-button { cursor: pointer; }\n.ma-root .help-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 16px; overflow: hidden; }\n.ma-root .help-card > summary { padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--muted); list-style: none; user-select: none; }\n.ma-root .help-card > summary::-webkit-details-marker { display: none; }\n.ma-root .help-card > summary::before { content: '▸ '; color: var(--faint); }\n.ma-root .help-card[open] > summary::before { content: '▾ '; }\n.ma-root .help-card > summary:hover { background: var(--hover); color: var(--text); }\n.ma-root .help-card[open] > summary { border-bottom: 1px solid var(--border); }\n.ma-root .help-body { padding: 12px 18px 16px; }\n.ma-root .help-body p { font-size: 13px; line-height: 1.9; color: var(--muted); margin: 0 0 8px; }\n.ma-root .help-body p:last-child { margin-bottom: 0; }\n.ma-root .help-body b { color: var(--text); font-weight: 500; }\n.ma-root .help-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; color: var(--text); }\n.ma-root .help-card .form-card { border: none; box-shadow: none; margin: 0; padding: 4px 16px 16px; }\n.ma-root .mini-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n.ma-root .mini-table th { text-align: left; font-weight: 500; color: var(--faint); font-size: 10px; padding: 4px 6px; border-bottom: 1px solid var(--divider); white-space: nowrap; }\n.ma-root .mini-table td { padding: 4px 6px; border-bottom: 1px solid var(--divider); }\n.ma-root .mini-table tr:last-child td { border-bottom: none; }\n.ma-root .mini-table td.warn { color: var(--warn-strong); }\n.ma-root .mini-table td.danger { color: var(--danger-strong); font-weight: 600; }\n.ma-root .raw-box { max-height: 240px; overflow: auto; background: var(--hover); border: 1px solid var(--border); padding: 10px 12px; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.65; margin: 6px 0 0; white-space: pre-wrap; word-break: break-all; }\n.ma-root .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 14px; }\n.ma-root .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }\n.ma-root .card-head h3 { font-size: 15px; font-weight: 500; }\n.ma-root .card-head .meta { color: var(--faint); font-size: 12px; margin-top: 2px; word-break: break-all; }\n.ma-root .card-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }\n.ma-root .badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }\n.ma-root .badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--divider); color: var(--muted); white-space: nowrap; display: inline-block; line-height: 1.6; }\n.ma-root button > svg { width: 14px; height: 14px; flex: none; }\n.ma-root button.with-icon { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }\n.ma-root .refresh-btn svg { width: 14px; height: 14px; }\n.ma-root .autorefresh-btn { gap: 6px; }\n.ma-root .autorefresh-btn .dot { width: 6px; height: 6px; border-radius: 999px; }\n.ma-root .autorefresh-btn.is-off { color: var(--faint); }\n.ma-root .badge.ok { background: var(--accent-soft); color: var(--accent); }\n.ma-root .ig-list { display: flex; flex-direction: column; max-height: 46vh; overflow-y: auto; }\n.ma-root .ig-group { display: flex; flex-direction: column; }\n.ma-root .ig-row { display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-bottom: 1px solid var(--divider); cursor: pointer; font-size: 13px; }\n.ma-root .ig-row:last-child { border-bottom: none; }\n.ma-root .ig-row:hover { background: var(--hover); }\n.ma-root .ig-row input[type='checkbox'] { margin: 0; flex: none; width: 16px; height: 16px; padding: 0; border-radius: 4px; }\n.ma-root .ig-row .mono { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .ig-row .hint { flex: none; margin: 0; }\n.ma-root .ig-group-head { background: var(--hover); border-radius: 6px; margin-top: 6px; padding: 6px 6px; font-weight: 600; }\n.ma-root .ig-caret { display: inline-grid; place-items: center; flex: none; width: 18px; height: 18px; padding: 0; border: none; background: none; color: var(--muted); cursor: pointer; border-radius: 4px; }\n.ma-root .ig-caret:hover { background: var(--divider); color: var(--text); }\n.ma-root .ig-caret svg { width: 12px; height: 12px; transition: transform 0.15s; }\n.ma-root .ig-caret.is-collapsed svg { transform: rotate(-90deg); }\n.ma-root .ig-children[hidden] { display: none; }\n.ma-root .ig-group:first-child .ig-group-head { margin-top: 0; }\n.ma-root .ig-vendor { flex: 1 1 auto; min-width: 0; }\n.ma-root .ig-child { padding-left: 26px; }\n.ma-root .ig-child .mono { color: var(--muted); }\n.ma-root .badge.info { background: var(--info-soft); color: var(--info); }\n.ma-root .badge.prov-free { display: inline-flex; align-items: center; gap: 4px; background: var(--vendor-free-soft); color: var(--vendor-free); }\n.ma-root .badge.prov-free svg { width: 11px; height: 11px; }\n.ma-root .badge.warn { background: var(--warn-soft); color: var(--warn); }\n.ma-root .badge.danger { background: var(--danger-soft); color: var(--danger); }\n.ma-root .keylist { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 10px; }\n.ma-root .keyrow { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }\n.ma-root .keyrow .tail { font-family: ui-monospace, \"Cascadia Code\", Consolas, monospace; color: var(--muted); }\n.ma-root .keyrow .grow { flex: 1; }\n.ma-root .keyrow input { width: 96px; padding: 3px 8px; }\n.ma-root .inline-form { display: flex; gap: 8px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); flex-wrap: wrap; }\n.ma-root .inline-form input[name=\"label\"] { width: 110px; }\n.ma-root .inline-form input[name=\"secret\"] { flex: 1; min-width: 200px; font-family: ui-monospace, Consolas, monospace; }\n.ma-root .form-card h3 { margin-bottom: 12px; font-size: 15px; }\n.ma-root .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }\n.ma-root .grid label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }\n.ma-root .form-actions { display: flex; justify-content: flex-end; margin-top: 12px; }\n.ma-root .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; margin-bottom: 16px; }\n.ma-root table { width: 100%; border-collapse: collapse; font-size: 13px; }\n.ma-root thead th { text-align: left; font-weight: 500; color: var(--faint); font-size: 11px; letter-spacing: 0.4px; padding: 9px 14px; background: none; border-bottom: 1px solid var(--border); white-space: nowrap; }\n.ma-root tbody td { padding: 11px 14px; border-bottom: 1px solid var(--divider); vertical-align: middle; }\n.ma-root tbody tr:last-child td { border-bottom: none; }\n.ma-root tbody tr:hover { background: var(--surface-2); }\n.ma-root tbody tr.cheapest { background: var(--success-soft); }\n.ma-root tbody tr.cheapest:hover { background: var(--row-cheapest-hover); }\n.ma-root td.num, .ma-root th.num { text-align: right; font-variant-numeric: tabular-nums; }\n.ma-root td input { width: 74px; padding: 3px 7px; font-size: 12px; }\n.ma-root td input.ratio { width: 64px; }\n.ma-root .mono { font-family: ui-monospace, \"Cascadia Code\", Consolas, monospace; font-size: 12px; }\n.ma-root .group-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface-2); border-bottom: 1px solid var(--border); }\n.ma-root .group-head .model { font-weight: 500; }\n.ma-root .group-head .spread { font-size: 12px; color: var(--warn); background: var(--warn-soft); padding: 2px 8px; border-radius: 999px; }\n.ma-root .group-head .count { font-size: 12px; color: var(--faint); margin-left: auto; }\n.ma-root .price-cell { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }\n.ma-root .price-cell select { width: 62px; padding: 3px 4px; font-size: 11px; }\n.ma-root .empty { text-align: center; padding: 48px 20px; color: var(--faint); background: var(--surface); border: 1px dashed var(--border-strong); border-radius: var(--radius); }\n.ma-root .empty h3 { color: var(--muted); margin-bottom: 6px; font-size: 13px; }\n.ma-root .empty p { margin: 0 0 14px; font-size: 13px; }\n.ma-root .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--text); color: var(--surface); padding: 9px 18px; border-radius: 999px; font-size: 13px; z-index: 300; max-width: 80vw; box-shadow: 0 6px 20px rgba(15, 26, 23, 0.18); }\n.ma-root .toast.error { background: var(--danger); }\n.ma-root .hint { color: var(--faint); font-size: 12px; margin: 8px 0 0; }\n.ma-root .stat { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }\n.ma-root .stat-main { min-width: 0; }\n.ma-root .stat-icon { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; margin-top: 2px; }\n.ma-root .stat-icon svg { width: 17px; height: 17px; }\n.ma-root .tint-accent { background: var(--accent-soft); color: var(--accent); }\n.ma-root .tint-warn { background: var(--warn-soft); color: var(--warn-strong); }\n.ma-root .tint-muted { background: var(--hover); color: var(--muted); }\n.ma-root .section-title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; color: var(--text); margin: 24px 0 10px; display: flex; align-items: center; gap: 8px; }\n.ma-root .section-title .s-icon { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--hover); color: var(--muted); }\n.ma-root .section-title .s-icon svg { width: 13px; height: 13px; }\n.ma-root .section-title .link { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--accent); text-decoration: none; cursor: pointer; }\n.ma-root .section-title .link:hover { text-decoration: underline; }\n.ma-root .group-pick { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 2px; max-height: 44vh; overflow: auto; }\n.ma-root .group-pick label { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); cursor: pointer; transition: border-color 0.12s, background 0.12s; }\n.ma-root .group-pick label:hover { background: var(--hover); }\n.ma-root .group-pick label.on { border-color: var(--accent); background: var(--accent-soft); }\n.ma-root .group-pick input[type='radio'] { accent-color: var(--accent); margin: 0; flex: none; width: auto; height: auto; padding: 0; border: none; background: none; border-radius: 0; }\n.ma-root .group-pick .gname { flex: 1; font-size: 13px; color: var(--text); word-break: break-all; line-height: 1.5; }\n.ma-root .group-pick .grate { font-family: ui-monospace, \"Cascadia Code\", Consolas, monospace; font-size: 12px; color: var(--accent); flex: none; }\n.ma-root .group-pick .gcount { font-size: 11px; color: var(--faint); flex: none; min-width: 58px; text-align: right; }\n.ma-root .group-pick-foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--divider); }\n.ma-root .group-pick-foot .grow { flex: 1; }\n.ma-root button.group-chip { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }\n.ma-root button.group-chip:hover { color: var(--accent); }\n.ma-root .cur-switch { display: inline-flex; align-items: center; gap: 2px; height: 30px; padding: 2px; background: var(--hover); border: 1px solid var(--border); border-radius: 999px; }\n.ma-root .cur-switch button { height: 24px; padding: 0 10px; border: none; background: none; border-radius: 999px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; flex: none; transition: background 0.14s, color 0.14s, box-shadow 0.14s; }\n.ma-root .cur-switch button:hover { color: var(--text); }\n.ma-root .cur-switch button.is-on { background: var(--surface); color: var(--accent); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }\n.ma-root[data-ma-theme='dark'] .cur-switch button.is-on { box-shadow: 0 1px 2px rgba(0, 0, 0, .5); }\n.ma-root .pricing-table { min-width: 1000px; }\n.ma-root .pricing-table th, .ma-root .pricing-table td { padding-left: 8px; padding-right: 8px; }\n.ma-root .pricing-table td input[type='number'] { width: 64px; padding: 4px 6px; }\n.ma-root .pricing-table td input.group-input { width: 84px; }\n.ma-root .pricing-table .seg-mini button { padding: 0 6px; }\n.ma-root .pricing-table .sub { font-size: 11px; }\n.ma-root .pricing-table .unit-cell { display: inline-flex; flex-direction: column; gap: 4px; align-items: flex-start; }\n.ma-root .pricing-table .unit-badge { font-variant-numeric: tabular-nums; }\n.ma-root .pricing-table td.mono, .ma-root .pricing-table td.mono .badge, .ma-root .pricing-table td .group-chip-cell .badge { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .pricing-table td .group-chip-cell { max-width: 200px; display: inline-flex; align-items: center; gap: 4px; }\n.ma-root .pricing-table th:nth-last-child(-n+2), .ma-root .pricing-table td:nth-last-child(-n+2) { position: sticky; right: 0; z-index: 1; background: var(--surface); box-shadow: -6px 0 6px -6px rgba(0, 0, 0, .25); }\n.ma-root[data-ma-theme='dark'] .pricing-table th:nth-last-child(-n+2), .ma-root[data-ma-theme='dark'] .pricing-table td:nth-last-child(-n+2) { box-shadow: -6px 0 6px -6px rgba(0, 0, 0, .6); }\n.ma-root .pricing-table th:first-child, .ma-root .pricing-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--surface); box-shadow: 6px 0 6px -6px rgba(0, 0, 0, .25); }\n.ma-root[data-ma-theme='dark'] .pricing-table th:first-child, .ma-root[data-ma-theme='dark'] .pricing-table td:first-child { box-shadow: 6px 0 6px -6px rgba(0, 0, 0, .6); }\n.ma-root .pricing-table tbody tr.cheapest td:first-child, .ma-root .pricing-table tbody tr.cheapest td:nth-last-child(-n+2) { background-color: var(--surface); background-image: linear-gradient(var(--success-soft), var(--success-soft)); }\n.ma-root .pricing-table tbody tr:hover td:first-child, .ma-root .pricing-table tbody tr:hover td:nth-last-child(-n+2) { background: var(--surface-2); }\n.ma-root .seg-mini { display: inline-flex; padding: 2px; gap: 2px; background: var(--hover); border: 1px solid var(--border); border-radius: 7px; }\n.ma-root .seg-mini button { height: 22px; padding: 0 8px; border: none; background: none; border-radius: 5px; font-size: 11px; color: var(--muted); cursor: pointer; white-space: nowrap; flex: none; }\n.ma-root .seg-mini button:hover { color: var(--text); }\n.ma-root .seg-mini button.is-on { background: var(--surface); color: var(--accent); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.06); }\n.ma-root .sub-cell { color: var(--faint); font-size: 12px; }\n.ma-root .preset-grid { grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); }\n.ma-root .preset-card { display: flex; flex-direction: column; justify-content: space-between; gap: 12px; min-height: 118px; padding: 14px 16px; background: var(--surface); border: 1px dashed var(--border-strong); border-radius: var(--radius); }\n.ma-root .preset-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }\n.ma-root .preset-text { min-width: 0; }\n.ma-root .preset-text h3 { margin: 0 0 3px; font-size: 13px; font-weight: 600; }\n.ma-root .preset-text .meta { font-size: 12px; color: var(--muted); line-height: 1.55; }\n.ma-root .preset-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }\n@media (min-width: 1100px) {\n  .ma-root .preset-card { flex-direction: row; align-items: center; min-height: 0; padding: 12px 16px; }\n  .ma-root .preset-main { align-items: center; }\n  .ma-root .preset-actions { flex: none; }\n}\n.ma-root .top-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 9px; border: none; background: none; border-radius: 9px; color: var(--muted); font-size: 13px; cursor: pointer; transition: background 0.12s, color 0.12s; }\n.ma-root .top-btn:hover { background: var(--hover); color: var(--text); }\n.ma-root .top-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }\n.ma-root .lang-wrap { position: relative; }\n.ma-root .lang-btn { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 9px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 600; letter-spacing: 0.4px; transition: background 0.12s, color 0.12s, border-color 0.12s; }\n.ma-root .lang-btn:hover { background: var(--hover); color: var(--text); }\n.ma-root .lang-chev { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }\n.ma-root .lang-wrap.open .lang-chev { transform: rotate(180deg); }\n.ma-root .lang-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 152px; padding: 5px; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; box-shadow: 0 10px 28px rgba(15, 26, 23, 0.14); z-index: 60; }\n.ma-root .lang-menu[hidden] { display: none; }\n.ma-root .lang-item { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 8px; color: var(--text); font-size: 13px; text-align: left; cursor: pointer; transition: background 0.12s, color 0.12s; }\n.ma-root .lang-item:hover { background: var(--hover); }\n.ma-root .lang-item.active { color: var(--accent); }\n.ma-root .lang-code { width: 20px; flex: none; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; color: var(--faint); }\n.ma-root .lang-item.active .lang-code { color: var(--accent); }\n.ma-root .lang-name { flex: 1; }\n.ma-root .lang-check { width: 15px; height: 15px; flex: none; stroke: currentColor; fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; visibility: hidden; }\n.ma-root .lang-item.active .lang-check { visibility: visible; }\n.ma-root .doc[data-lang-block] { display: none; }\n.ma-root[data-lang='zh'] .doc[data-lang-block='zh'] { display: block; }\n.ma-root[data-lang='en'] .doc[data-lang-block='en'] { display: block; }\n.ma-root .switch-row { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); }\n.ma-root .switch { display: flex; align-items: flex-start; gap: 11px; cursor: pointer; }\n.ma-root .switch input { position: absolute; opacity: 0; width: 0; height: 0; }\n.ma-root .switch-track { position: relative; flex: none; width: 36px; height: 20px; margin-top: 1px; background: var(--border-strong); border-radius: 999px; transition: background 0.16s; }\n.ma-root .switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.16s; }\n.ma-root .switch input:checked + .switch-track { background: var(--accent); }\n.ma-root .switch input:checked + .switch-track .switch-knob { transform: translateX(16px); }\n.ma-root .switch input:focus-visible + .switch-track { outline: 2px solid var(--accent-mid); outline-offset: 2px; }\n.ma-root .switch-text { display: flex; flex-direction: column; gap: 3px; line-height: 1.55; }\n.ma-root .switch-text b { font-size: 13px; font-weight: 500; color: var(--text); }\n.ma-root .switch-text span { font-size: 12px; color: var(--muted); }\n.ma-root .seg-count { margin-left: 6px; font-family: ui-monospace, \"Cascadia Code\", Consolas, monospace; font-size: 11px; color: var(--faint); padding: 1px 5px; border-radius: 5px; background: var(--hover); }\n.ma-root .seg button.active .seg-count { color: var(--accent); }\n.ma-root .quota { display: flex; align-items: center; gap: 8px; }\n.ma-root .quota-track { flex: 1; min-width: 56px; height: 6px; background: var(--quota-track); border-radius: 999px; overflow: hidden; }\n.ma-root .quota-fill { height: 100%; border-radius: 999px; background: var(--quota-fill); transition: width 0.2s; }\n.ma-root .quota-fill.warn { background: var(--quota-warn); }\n.ma-root .quota-fill.empty { background: var(--quota-empty); }\n.ma-root .quota-text { font-size: 12px; color: var(--muted); white-space: nowrap; }\n.ma-root .monitor-kpi { margin-bottom: 16px; }\n.ma-root .monitor-kpi .stat { padding: 12px 14px; }\n.ma-root .monitor-kpi .stat .v { font-size: 22px; }\n.ma-root .monitor-kpi .stat .sub { margin-top: 4px; font-size: 11px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .monitor-kpi .stat .k .k-em { color: var(--accent); font-weight: 600; background: var(--accent-soft); border-radius: 4px; padding: 0 4px; margin: 0 -1px; }\n.ma-root .monitor-kpi .stat .k[data-hint] { cursor: help; text-decoration: underline dotted var(--faint); text-underline-offset: 3px; }\n.ma-root .hover-hint { position: fixed; display: none; z-index: 90; max-width: 300px; padding: 9px 11px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border-strong); box-shadow: 0 6px 18px rgba(0, 0, 0, .12); font-size: 12px; line-height: 1.65; color: var(--muted); pointer-events: none; }\n.ma-root .hover-hint.is-on { display: block; }\n.ma-root .hover-hint-line + .hover-hint-line { margin-top: 5px; }\n.ma-root[data-ma-theme='dark'] .hover-hint { box-shadow: 0 6px 18px rgba(0, 0, 0, .5); }\n.ma-root .monitor-kpi .stat .sub--wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.5; }\n.ma-root .monitor-cols { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; align-items: start; }\n.ma-root .monitor-cols--feed { grid-auto-rows: 420px; align-items: stretch; }\n.ma-root .monitor-cols--overview { align-items: stretch; }\n.ma-root .monitor-flow-card { align-self: stretch; display: flex; flex-direction: column; contain: size; overflow: hidden; }\n.ma-root .monitor-flow-card .card-head { flex: none; }\n.ma-root .monitor-flow-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; margin-right: -4px; }\n@media (max-width: 1080px) {\n  .ma-root .monitor-cols { grid-template-columns: minmax(0, 1fr); }\n  .ma-root .monitor-flow-card { contain: none; overflow: visible; }\n  .ma-root .monitor-flow-list { overflow-y: visible; }\n}\n.ma-root .monitor-chart-card .card-head { align-items: center; }\n.ma-root .chart-wrap { margin-top: 10px; position: relative; }\n.ma-root .chart-tip { position: absolute; top: 12px; left: 0; display: none; pointer-events: none; z-index: 5; min-width: 160px; max-width: 260px; padding: 8px 10px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border-strong); box-shadow: 0 6px 18px rgba(0, 0, 0, .12); font-size: 12px; line-height: 1.65; }\n.ma-root .chart-tip.is-on { display: block; }\n.ma-root .chart-tip-head { color: var(--muted); margin-bottom: 3px; }\n.ma-root .chart-tip-row { display: flex; justify-content: space-between; gap: 14px; }\n.ma-root .chart-tip-row b { font-weight: 600; font-variant-numeric: tabular-nums; }\n.ma-root .chart-tip-row span { font-variant-numeric: tabular-nums; }\n.ma-root .chart-tip-sep { height: 1px; background: var(--divider); margin: 5px 0; }\n.ma-root .chart-tip-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }\n.ma-root[data-ma-theme='dark'] .chart-tip { box-shadow: 0 6px 18px rgba(0, 0, 0, .5); }\n.ma-root .chart { width: 100%; height: auto; max-height: 320px; display: block; }\n.ma-root .chart .grid-line { stroke: var(--divider); stroke-width: 1; }\n.ma-root .chart .axis-label { fill: var(--faint); font-size: 11px; }\n.ma-root .chart .line { fill: none; stroke: var(--chart-accent, var(--accent)); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }\n.ma-root .chart .dots circle { fill: var(--surface); stroke: var(--chart-accent, var(--accent)); stroke-width: 1.6; }\n.ma-root .chart .spend-bar { fill: var(--warn-strong); opacity: 0.35; }\n.ma-root .chart-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; color: var(--muted); }\n.ma-root .chart-legend i { display: inline-block; vertical-align: 1px; margin-right: 6px; }\n.ma-root .legend-line { width: 16px; height: 2px; background: var(--accent); }\n.ma-root .legend-bar { width: 10px; height: 10px; border-radius: 2px; background: var(--warn-strong); opacity: 0.45; }\n.ma-root .monitor-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }\n.ma-root .monitor-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; font-size: 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; color: var(--text); cursor: pointer; }\n.ma-root .monitor-chip:hover { border-color: var(--border-strong); background: var(--hover); }\n.ma-root .monitor-chip .dot { margin-right: 0; }\n.ma-root .monitor-chip-value { color: var(--muted); }\n.ma-root .monitor-flow-row { padding: 9px 0; border-bottom: 1px dashed var(--divider); }\n.ma-root .monitor-flow-row:last-child { border-bottom: none; padding-bottom: 2px; }\n.ma-root .monitor-flow-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.ma-root .monitor-flow-key { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .monitor-flow-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 3px; font-size: 11px; color: var(--faint); }\n.ma-root .monitor-sites-head { align-items: flex-start; gap: 12px; flex-wrap: wrap; }\n.ma-root .monitor-sites-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; }\n.ma-root .monitor-sites-title .hint { margin: 0; }\n.ma-root .monitor-sync-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: 0 0 auto; margin-left: auto; }\n.ma-root .sync-panel { display: flex; align-items: center; gap: 8px; height: 30px; padding: 2px 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }\n.ma-root .sync-panel input[type='number'] { width: 100px; height: 24px; padding: 0 9px; border-radius: 7px; font-size: 12px; }\n.ma-root .sync-panel input[type='number']::placeholder { color: var(--faint); }\n.ma-root .sync-panel button.primary { height: 24px; padding: 0 12px; border-radius: 7px; }\n.ma-root .sync-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }\n.ma-root .sync-actions button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }\n.ma-root .sync-actions button svg { width: 14px; height: 14px; opacity: .8; }\n.ma-root .monitor-sync-controls .field { margin: 0; }\n.ma-root .monitor-sync-controls .field > span { font-size: 11px; }\n.ma-root .monitor-sync-controls input[type='number'] { width: 74px; }\n.ma-root .monitor-sync-controls button { display: inline-flex; align-items: center; gap: 6px; }\n.ma-root .monitor-sync-controls button svg { width: 14px; height: 14px; opacity: .75; }\n.ma-root .sites-head { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }\n.ma-root .sites-title-block { display: flex; align-items: baseline; gap: 10px; min-width: 0; }\n.ma-root .sites-title-block h3 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.1px; white-space: nowrap; }\n.ma-root .sites-title-block .hint { margin: 0; font-size: 12px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ma-root .sites-bar { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }\n.ma-root .sites-bar .grow { flex: 1 1 auto; min-width: 8px; }\n.ma-root .sites-bar > .sync-panel { flex: none; }\n.ma-root .sites-bar > input[type='search'] { flex: 0 1 220px; min-width: 108px; height: 30px; }\n.ma-root .sites-bar .site-pager { display: inline-flex; align-items: center; gap: 8px; flex: none; white-space: nowrap; }\n.ma-root .sites-actions { flex: none; display: flex; align-items: center; gap: 8px; white-space: nowrap; }\n.ma-root .sites-actions button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; height: 30px; }\n.ma-root .sites-actions button svg { width: 14px; height: 14px; opacity: .8; }\n@media (max-width: 1180px) {\n  .ma-root .sites-bar > input[type='search'] { flex-basis: 170px; }\n}\n@media (max-width: 1100px) {\n  .ma-root .sites-bar > .sync-panel input[type='number'] { width: 92px; }\n}\n@media (max-width: 1040px) {\n  .ma-root .sites-bar .site-pager .range { display: none; }\n  .ma-root .sites-title-block .hint { display: none; }\n  .ma-root .sites-bar { gap: 8px; }\n  .ma-root .sites-bar > .sync-panel { padding: 4px 6px; gap: 6px; }\n  .ma-root .sites-bar > .sync-panel input[type='number'] { width: 62px; }\n  .ma-root .sites-bar .site-pager { gap: 6px; }\n}\n.ma-root .drop-zone { display: none; position: absolute; left: 0; right: 0; z-index: 6; align-items: center; justify-content: center; height: 34px; border: 1px dashed var(--border-strong, var(--border)); border-radius: 10px; background: var(--surface); font-size: 12px; color: var(--muted); transition: background .12s ease, color .12s ease; pointer-events: auto; }\n.ma-root .sites-section { position: relative; }\n.ma-root.prov-dragging .drop-zone { display: flex; }\n.ma-root .drop-zone[data-drop='prev'] { top: 40px; }\n.ma-root .drop-zone[data-drop='next'] { bottom: 0; }\n.ma-root .drop-zone[hidden] { display: none !important; }\n.ma-root .drop-zone.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }\n.ma-root .prov-card.is-paused { opacity: .66; }\n.ma-root .prov-card.is-paused .prov-actions { opacity: .8; }\n.ma-root .prov-card.is-paused:hover { opacity: 1; }\n.ma-root .prov-open { width: 18px; height: 18px; margin-left: 2px; }\n.ma-root .prov-open svg { width: 12px; height: 12px; }\n.ma-root .prov-pause { color: var(--muted); }\n.ma-root .prov-card.is-paused .prov-pause { color: var(--warn-strong); }\n.ma-root .prov-pri { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 5px; border-radius: 6px; background: var(--hover); cursor: grab; }\n.ma-root .prov-pri:active { cursor: grabbing; }\n.ma-root .prov-pri-no { min-width: 12px; display: inline-grid; place-items: center; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted); }\n.ma-root .prov-pri-grip { display: inline-flex; color: var(--faint); }\n.ma-root .prov-pri-grip svg { width: 12px; height: 12px; }\n.ma-root .prov-card.dragging { opacity: .45; }\n.ma-root .prov-card.drop-before { box-shadow: 0 -2px 0 0 var(--accent); }\n.ma-root .prov-card.drop-after { box-shadow: 0 2px 0 0 var(--accent); }\n.ma-root .monitor-sites { display: block; margin-top: 0; }\n.ma-root .site-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; margin-top: 8px; }\n.ma-root .site-pager { display: inline-flex; align-items: center; gap: 8px; }\n.ma-root .site-pager .hint { margin: 0; }\n.ma-root .site-toolbar { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; padding-bottom: 0; }\n.ma-root .site-toolbar input[type='search'] { width: 220px; }\n.ma-root .site-toolbar .hint { margin: 0; }\n.ma-root .monitor-sites-head { padding: 0 2px 6px; }\n.ma-root .monitor-sites { margin-top: 4px; }\n.ma-root .monitor-site { border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px 14px; background: var(--surface); display: flex; flex-direction: column; }\n.ma-root .monitor-site .prov-head { margin-bottom: 0; }\n.ma-root .monitor-site .prov-tiles { margin-top: 11px; }\n.ma-root .monitor-site-groups { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 10px; }\n.ma-root .monitor-site-groups .group-chip { font-size: 11px; padding: 1px 6px; max-width: 100%; background: var(--surface); border-color: var(--border); }\n.ma-root .monitor-site .prov-actions { margin-top: auto; padding-top: 12px; }\n.ma-root .monitor-site .link-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 11px; font-size: 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); text-decoration: none; }\n.ma-root .monitor-site .link-btn:hover { background: var(--hover); color: var(--text); }\n.ma-root .monitor-site .link-btn svg { width: 14px; height: 14px; opacity: .75; }\n.ma-root .monitor-head-actions { display: flex; align-items: center; gap: 8px; }\n.ma-root .monitor-head-actions .hint { margin: 0; }\n.ma-root .monitor-feed-card { display: flex; flex-direction: column; min-height: 0; height: 100%; overflow: hidden; }\n.ma-root .monitor-feed-card .card-head { flex: none; }\n.ma-root .monitor-feed-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; margin-right: -4px; }\n.ma-root .monitor-feed-row { display: flex; gap: 8px; padding: 10px 0; border-bottom: 1px dashed var(--divider); }\n.ma-root .monitor-feed-row:last-child { border-bottom: none; }\n.ma-root .monitor-feed-row .dot { margin-top: 5px; flex: none; }\n.ma-root .monitor-feed-row.read { opacity: 0.6; }\n.ma-root .monitor-feed-body { min-width: 0; flex: 1; }\n.ma-root .monitor-feed-title { font-size: 13px; line-height: 1.5; }\n.ma-root .monitor-feed-detail { margin-top: 2px; font-size: 12px; color: var(--muted); line-height: 1.55; word-break: break-word; white-space: pre-line; }\n.ma-root .monitor-feed-meta { margin-top: 3px; font-size: 11px; color: var(--faint); }\n.ma-root .monitor-feed-group { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0 5px; font-size: 11px; font-weight: 600; color: var(--muted); background: var(--surface); border-bottom: 1px solid var(--divider); }\n.ma-root .monitor-feed-group .hint { margin: 0; }\n.ma-root .monitor-notice-tabs { flex: none; display: flex; gap: 6px; padding-bottom: 8px; overflow-x: auto; scrollbar-width: thin; }\n.ma-root .monitor-notice-tab { flex: none; padding: 3px 10px; font-size: 12px; line-height: 1.6; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 999px; cursor: pointer; white-space: nowrap; }\n.ma-root .monitor-notice-tab:hover { border-color: var(--border-strong); color: var(--text); }\n.ma-root .monitor-notice-tab[aria-pressed=\"true\"] { color: var(--accent); background: var(--accent-soft); border-color: transparent; font-weight: 600; }\n.ma-root .monitor-settings { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 12px; }\n.ma-root .monitor-settings .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }\n.ma-root .monitor-settings .field input { width: 150px; }\n.ma-root .monitor-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 10px 16px; margin: 0 0 14px auto; width: fit-content; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }\n.ma-root .monitor-toolbar .monitor-settings { margin-top: 0; flex-direction: row; align-items: flex-end; gap: 10px 14px; flex-wrap: wrap; }\n.ma-root .monitor-toolbar .monitor-settings .field { font-size: 11px; gap: 3px; }\n.ma-root .monitor-toolbar .monitor-settings .field input { width: 92px; }\n.ma-root .monitor-toolbar-hint { flex: 1 1 240px; min-width: 200px; font-size: 12px; line-height: 1.6; color: var(--faint); }\n.ma-root .empty.small { padding: 18px 0; }\n.ma-root .empty.small h3 { font-size: 13px; }\n"
    var THEME_STYLE_ID = 'dsh-manage-api-theme'
    // <<< theme:end

    // 本插件自己补的少量规则：把网页版的整页壳适配成「嵌在宿主里的一块面板」
    var EXTRA_CSS = [
      '.ma-root{font-size:var(--fs-3);line-height:1.55;color:var(--text);background:var(--bg)}',
      '.ma-root.ma-main{box-sizing:border-box;height:100%;overflow-y:auto;overflow-x:hidden;border-radius:0}',
      '.ma-root.ma-section{height:auto;overflow:visible}',
      '.ma-root .ma-page{width:100%;max-width:1120px;margin:0 auto;padding:0 0 8px}',
      '.ma-root.ma-main .ma-page{padding:0 0 20px}',
      '.ma-root.ma-section .ma-page{max-width:none}',
      '.ma-root .ma-head{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:1px solid var(--divider)}',
      '.ma-root.ma-section .ma-head{position:static;border-bottom:0}',
      '.ma-root .topbar{position:static;backdrop-filter:none;background:transparent;border-bottom:0;padding:14px 20px 10px}',
      '.ma-root.ma-section .topbar{padding:0 0 10px}',
      '.ma-root .ma-tabs{display:flex;gap:2px;padding:0 12px 8px;overflow-x:auto;border:0;scrollbar-width:none}',
      '.ma-root .ma-tabs::-webkit-scrollbar{display:none}',
      '.ma-root.ma-section .ma-tabs{padding:0 0 8px}',
      '.ma-root .ma-tabs button{display:flex;align-items:center;gap:8px;padding:7px 12px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;text-align:left;white-space:nowrap}',
      '.ma-root .ma-tabs button:hover{background:var(--hover);color:var(--text)}',
      '.ma-root .ma-tabs button.active{background:var(--accent-soft);color:var(--accent)}',
      '.ma-root .ma-tabs button.active .nav-desc{color:var(--accent);opacity:.72}',
      '.ma-root .ma-tabs svg{flex-shrink:0}',
      '.ma-root .ma-tabs .nav-text{display:flex;flex-direction:column;line-height:1.3;min-width:0}',
      '.ma-root .ma-tabs .nav-title{font-size:13px}',
      '.ma-root .ma-tabs .nav-desc{font-size:11px;color:var(--faint);margin-top:1px}',
      '.ma-root .ma-body{padding:16px 20px 8px;min-width:0}',
      '.ma-root.ma-section .ma-body{padding:14px 0 0}',
      '.ma-root .ma-scroll{overflow:visible;max-height:none}',
      '.ma-root .table-wrap{max-width:100%}',
      '.ma-root .ma-modal{position:fixed;inset:0;background:rgba(16,24,40,.34);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px}',
      '.ma-root .ma-modal-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 48px rgba(16,24,40,.2);width:min(560px,94vw);max-height:86vh;overflow-y:auto;padding:20px}',
      '.ma-root .ma-modal-card h3{font-size:var(--fs-4);font-weight:600;margin:0 0 4px}',
      '.ma-root .ma-modal-card .meta{color:var(--faint);font-size:var(--fs-2);margin-bottom:6px}',
      '.ma-root .ma-modal-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
      '.ma-root .field{margin-top:12px}',
      '.ma-root .field label{display:block;font-size:var(--fs-2);color:var(--muted);margin-bottom:4px}',
      '.ma-root .field input,.ma-root .field select{width:100%}',
      '.ma-root .ma-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ma-root .ma-spacer{flex:1}',
      '.ma-root .ma-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:var(--fs-2)}',
      '.ma-root .ma-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px 18px;margin-top:2px}',
      '.ma-root .ma-kv .k{color:var(--faint);font-size:var(--fs-1);letter-spacing:.4px}',
      '.ma-root .ma-kv .v{font-size:var(--fs-3)}',
      '.ma-root .headline{margin-bottom:16px}',
    ].join('\n')

    function injectStyle(doc, id, css) {
      if (!doc || typeof doc.createElement !== 'function' || !css) return function noop() {}
      try {
        if (doc.getElementById && doc.getElementById(id)) return function noop() {}
        var el = doc.createElement('style')
        el.id = id
        el.textContent = css
        var head = doc.head || doc.documentElement
        if (head && typeof head.appendChild === 'function') head.appendChild(el)
        return function dispose() {
          try {
            if (el.remove) el.remove()
          } catch (err) {
            /* 忽略：宿主可能已经重建 DOM */
          }
        }
      } catch (err) {
        return function noop() {}
      }
    }

    function injectTheme(doc) {
      var disposeTheme = injectStyle(doc, THEME_STYLE_ID, THEME_CSS)
      var disposeExtra = injectStyle(doc, 'dsh-manage-api-extra', EXTRA_CSS)
      return function dispose() {
        disposeTheme()
        disposeExtra()
      }
    }

    // ── 平台小工具 ────────────────────────────────────────────────
    function currentDoc() {
      try {
        return typeof document !== 'undefined' ? document : null
      } catch (err) {
        return null
      }
    }

    function apiUrl(path) {
      var base = ''
      try {
        base = (currentDoc() && currentDoc().baseURI) || ''
      } catch (err) {
        base = ''
      }
      if (!base) base = 'http://127.0.0.1/'
      return new URL('api/' + API_PREFIX + '/' + path, base).toString()
    }

    /** 统一取数：先把响应读成文本再尝试 JSON，避免「宿主路由返回了非 JSON 响应」这种哑谜。 */
    function fetchJson(path, init) {
      var url = apiUrl(path)
      var options = init || {}
      options.headers = Object.assign({ accept: 'application/json' }, options.headers || {})
      options.credentials = 'same-origin'
      return fetch(url, options).then(
        function (res) {
          return res.text().then(function (text) {
            var body = null
            try {
              body = text ? JSON.parse(text) : null
            } catch (err) {
              body = null
            }
            if (!res.ok || body === null) {
              var snippet = String(text || '').trim().slice(0, 120)
              return {
                ok: false,
                status: res.status,
                body: body,
                text: snippet,
                error: body && body.error ? body.error : '宿主路由返回了非 JSON 响应（HTTP ' + res.status + '）：' + snippet,
              }
            }
            return { ok: true, status: res.status, body: body, text: '' }
          })
        },
        function (err) {
          return {
            ok: false,
            status: 0,
            body: null,
            text: '',
            error: '请求宿主失败：' + (err && err.message ? err.message : String(err)),
          }
        },
      )
    }

    /** 写操作统一入口：客户端永远不直连 4319，只走宿主的白名单写通道。 */
    function writeOp(method, path, payload) {
      return fetchJson('write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: method, path: path, payload: payload || {} }),
      }).then(function (res) {
        if (!res.ok) return { ok: false, error: res.error, status: res.status }
        if (res.body && res.body.ok === false) return { ok: false, error: res.body.error || '写操作失败', status: res.status }
        return { ok: true, summary: (res.body && res.body.summary) || {}, body: res.body }
      })
    }

    // ── 数值格式（与网页版口径一致：¥、亿/万、正负号价差）────────────
    function fmtMoney(value, digits) {
      if (value === null || value === undefined || !isFinite(value)) return '—'
      var d = digits === undefined ? (Math.abs(value) >= 1 ? 2 : 3) : digits
      return '¥' + Number(value).toFixed(d)
    }

    function fmtCompact(value) {
      if (value === null || value === undefined || !isFinite(value)) return '—'
      var n = Number(value)
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿'
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万'
      return String(Math.round(n))
    }

    function fmtInt(value) {
      if (value === null || value === undefined || !isFinite(value)) return '—'
      return String(Math.round(Number(value)))
    }

    function fmtRate(value) {
      if (value === null || value === undefined || !isFinite(value)) return '—'
      return Math.round(Number(value) * 100) + '%'
    }

    function fmtPct(value) {
      if (value === null || value === undefined || !isFinite(value)) return ''
      var n = Number(value)
      return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
    }

    function fmtMs(value) {
      if (!value && value !== 0) return '—'
      var n = Number(value)
      if (!isFinite(n) || n <= 0) return '—'
      return n >= 1000 ? (n / 1000).toFixed(1) + 's' : Math.round(n) + 'ms'
    }

    function fmtTime(ts) {
      if (!ts) return '—'
      try {
        return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
      } catch (err) {
        return '—'
      }
    }

    // ── 明暗主题：跟随宿主（html[data-theme] / prefers-color-scheme）────
    function detectTheme() {
      try {
        var doc = currentDoc()
        var root = doc && doc.documentElement
        var attr = ''
        if (root && root.getAttribute) {
          attr = String(root.getAttribute('data-theme') || root.getAttribute('data-color-scheme') || '').toLowerCase()
        }
        if (!attr && doc && doc.body && doc.body.classList) {
          var cls = doc.body.classList
          if (cls.contains('dark') || cls.contains('theme-dark')) attr = 'dark'
          else if (cls.contains('light') || cls.contains('theme-light')) attr = 'light'
        }
        if (attr.indexOf('dark') >= 0) return 'dark'
        if (attr.indexOf('light') >= 0) return 'light'
        var win = typeof window !== 'undefined' ? window : null
        if (win && typeof win.matchMedia === 'function') {
          var mq = win.matchMedia('(prefers-color-scheme: dark)')
          if (mq && mq.matches) return 'dark'
        }
      } catch (err) {
        /* 忽略：主题探测失败就按浅色渲染 */
      }
      return 'light'
    }

    function useTheme() {
      var pair = React.useState(detectTheme())
      var theme = pair[0]
      var setTheme = pair[1]
      React.useEffect(function () {
        var win = typeof window !== 'undefined' ? window : null
        if (!win || typeof win.matchMedia !== 'function') return undefined
        var mq = win.matchMedia('(prefers-color-scheme: dark)')
        if (!mq || typeof mq.addEventListener !== 'function') return undefined
        function onChange() {
          setTheme(detectTheme())
        }
        mq.addEventListener('change', onChange)
        return function () {
          mq.removeEventListener('change', onChange)
        }
      }, [])
      return theme
    }

    // ── 图标（只抄网页版用到的那十几个形状，内联 SVG，不引依赖）──────
    var ICONS = {
      refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
      servers: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
      layers: '<path d="M12 3l9 5-9 5-9-5 9-5Z"/><path d="M3 13l9 5 9-5"/>',
      columns: '<rect x="3" y="5" width="5.5" height="14" rx="1.5"/><rect x="10" y="5" width="4" height="14" rx="1.5"/><rect x="16.5" y="5" width="4.5" height="14" rx="1.5"/>',
      trend: '<path d="M4 16l5-5 3 3 6-7"/><path d="M18 7h3v3"/>',
      table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
      alert: '<path d="M12 4l9 16H3L12 4Z"/><path d="M12 10v4M12 17h.01"/>',
      chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/>',
      wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
      receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
      swap: '<path d="M7 20V4M7 4L4 7M17 4v16M17 20l3-3"/>',
      key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
      external: '<path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
      play: '<path d="M8 5.5v13l11-6.5z"/>',
      gift: '<rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12h18M12 8v13"/>',
      dot: '<circle cx="12" cy="12" r="3"/>',
    }

    function Icon(iconName, props) {
      var p = props || {}
      var size = p.size || 15
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: p.className,
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: { __html: ICONS[iconName] || '' },
      })
    }

    // ── 数据层 ───────────────────────────────────────────────────
    var TABS = [
      { id: 'overview', title: '概览', desc: '状态与排名', icon: 'chart' },
      { id: 'sites', title: '站点', desc: '余额与凭据', icon: 'servers' },
      { id: 'prices', title: '比价', desc: '同一模型对比', icon: 'columns' },
      { id: 'decisions', title: '智能决策', desc: '选站过程', icon: 'swap' },
      { id: 'probes', title: '探针', desc: '检测是否偷工', icon: 'alert' },
      { id: 'usage', title: '用量', desc: '消耗统计', icon: 'receipt' },
    ]

    function pickState(props) {
      var env = props && props.state
      if (!env) return {}
      return env.state || {}
    }

    function useApi(pollMs) {
      var healthPair = React.useState(null)
      var health = healthPair[0]
      var setHealth = healthPair[1]
      var dataPair = React.useState(null)
      var data = dataPair[0]
      var setData = dataPair[1]
      var busyPair = React.useState(false)
      var busy = busyPair[0]
      var setBusy = busyPair[1]

      var reload = React.useCallback(function (opts) {
        var withState = !opts || opts.withState !== false
        setBusy(true)
        var jobs = [fetchJson('health')]
        if (withState) jobs.push(fetchJson('state'))
        return Promise.all(jobs)
          .then(function (results) {
            var healthRes = results[0]
            if (healthRes && healthRes.ok) setHealth(healthRes.body)
            else if (healthRes) setHealth({ ok: false, error: healthRes.error })
            if (withState) {
              var stateRes = results[1]
              if (stateRes && stateRes.ok) setData(stateRes.body)
              else if (stateRes) setData({ ok: false, error: stateRes.error })
            }
          })
          .then(function () {
            setBusy(false)
          })
      }, [])

      React.useEffect(function () {
        var alive = true
        reload()
        var period = pollMs === undefined ? 15000 : pollMs
        if (!period) {
          return function () {
            alive = false
          }
        }
        var timer = setInterval(function () {
          if (alive) reload()
        }, period)
        return function () {
          alive = false
          clearInterval(timer)
        }
      }, [pollMs])

      var restart = React.useCallback(function (action) {
        setBusy(true)
        return writeOp('POST', '/api/manage-api/daemon/' + action, {}).then(function () {
          setBusy(false)
          reload()
        })
      }, [])

      return { health: health, state: data, busy: busy, reload: reload, restart: restart }
    }

    // ── 通用外观件（与网页版同名 class）────────────────────────────
    function SectionTitle(props) {
      return h(
        'h3',
        { className: 'section-title' },
        props.icon ? h('span', { className: 's-icon' }, Icon(props.icon, { size: 14 })) : null,
        props.children,
        props.extra || null,
      )
    }

    function Badge(props) {
      var cls = 'badge' + (props.tone ? ' ' + props.tone : '')
      return h('span', { className: cls, title: props.title }, props.children)
    }

    function StatCard(props) {
      return h(
        'div',
        { className: 'stat' + (props.tone ? ' ' + props.tone : '') },
        h('div', { className: 'k' }, props.k),
        h('div', { className: 'v' }, props.v, props.unit ? h('small', null, props.unit) : null),
      )
    }

    function Empty(props) {
      return h(
        'div',
        { className: 'empty' },
        h('h3', null, props.title),
        props.desc ? h('p', null, props.desc) : null,
        props.action || null,
      )
    }

    function Table(props) {
      return h(
        'div',
        { className: 'table-wrap' + (props.scroll ? ' ma-scroll' : '') },
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              (props.heads || []).map(function (head, i) {
                var cell = typeof head === 'string' ? { label: head } : head
                return h('th', { key: 'h' + i, className: cell.num ? 'num' : undefined }, cell.label)
              }),
            ),
          ),
          h(
            'tbody',
            null,
            (props.rows || []).map(function (row, ri) {
              return h(
                'tr',
                { key: 'r' + ri },
                (row.cells || []).map(function (cell, ci) {
                  var isWrap = cell && typeof cell === 'object' && !React.isValidElement(cell)
                  return h(
                    'td',
                    {
                      key: 'c' + ci,
                      className: isWrap ? (cell.num ? 'num' : cell.cls) : undefined,
                    },
                    isWrap ? cell.node : cell,
                  )
                }),
              )
            }),
          ),
        ),
      )
    }

    function statusPill(health) {
      var mode = health && health.daemon ? health.daemon.mode : 'down'
      var map = {
        owned: ['ok', '托管中', 'green'],
        attached: ['info', '已连接', 'green'],
        starting: ['warn', '启动中', 'yellow'],
        down: ['', '未运行', 'red'],
        failed: ['danger', '启动失败', 'red'],
      }
      var item = map[mode] || ['', mode, 'gray']
      return h(Badge, { tone: item[0] }, h('span', { className: 'dot ' + item[2] }), item[1])
    }

    // ── 概览（对齐网页版 renderOverview：headline → stats → 需要关注 → 站点速览）──
    function OverviewTab(props) {
      var state = pickState(props)
      var health = props.health || {}
      var summary = state.summary || {}
      var providers = state.providers || []
      var offers = state.offers || []
      var scores = state.scores || {}
      var ranking = state.siteRanking || []
      var creds = state.credentials || []

      var issues = []
      providers.forEach(function (provider) {
        var mine = offers.filter(function (offer) {
          return offer.providerId === provider.id
        })
        var bad = mine.filter(function (offer) {
          var score = scores[offer.id]
          return score && (score.stale || (typeof score.availability === 'number' && score.availability < 0.8))
        })
        if (bad.length) issues.push({ name: provider.name, count: bad.length, severe: mine.length > 0 && bad.length > mine.length / 2 })
      })

      var rankingMap = {}
      ranking.forEach(function (row) {
        rankingMap[row.providerId] = row
      })

      var ordered = providers.slice().sort(function (a, b) {
        var ra = rankingMap[a.id] ? rankingMap[a.id].score : -1
        var rb = rankingMap[b.id] ? rankingMap[b.id].score : -1
        return rb - ra
      })

      var siteRows = ordered.map(function (provider) {
        var mine = offers.filter(function (offer) {
          return offer.providerId === provider.id
        })
        var healthy = mine.filter(function (offer) {
          return scores[offer.id] && scores[offer.id].routable
        }).length
        var rank = rankingMap[provider.id]
        var issue = issues.filter(function (it) {
          return it.name === provider.name
        })[0]
        var dotClass = issue ? (issue.severe ? 'red' : 'yellow') : rank ? 'green' : 'gray'
        var scoreCell = rank
          ? h(
              'div',
              null,
              h(
                'div',
                { className: 'score-wrap' },
                h('b', null, rank.score),
                h(
                  'div',
                  { className: 'score-bar' },
                  h('i', {
                    className: rank.score >= 80 ? 'good' : rank.score >= 60 ? 'mid' : 'bad',
                    style: { width: Math.min(rank.score, 100) + '%' },
                  }),
                ),
              ),
              h(
                'div',
                { className: 'sub' },
                '可用 ' +
                  Math.round((rank.uptime || 0) * 100) +
                  '%' +
                  (rank.avgTtft ? ' · ' + rank.avgTtft + 'ms' : '') +
                  (rank.probes ? ' · ' + rank.probes + ' 次' : ''),
              ),
            )
          : h('span', { style: { color: 'var(--faint)' } }, '未探测')
        return {
          cells: [
            h('span', null, h('span', { className: 'dot ' + dotClass }), provider.name),
            { num: true, node: scoreCell },
            { num: true, node: mine.length },
            { num: true, node: healthy ? h(Badge, { tone: 'ok' }, healthy) : h(Badge, null, 0) },
            {
              num: true,
              node:
                provider.quotaRemaining === null || provider.quotaRemaining === undefined
                  ? h('span', { style: { color: 'var(--faint)' } }, '未录入')
                  : fmtMoney(provider.quotaRemaining),
            },
            {
              num: true,
              node: creds.filter(function (cred) {
                return cred.providerId === provider.id
              }).length,
            },
          ],
        }
      })

      var headline = state.headline
        ? h(
            'div',
            { className: 'headline' },
            h(
              'div',
              { className: 'line' },
              '同样用 ',
              state.headline.modelKey,
              '，现在选「',
              h('strong', null, state.headline.providerName),
              '」最划算：',
              h('strong', null, fmtMoney(state.headline.price) + '/百万 token'),
              state.headline.spreadPct === null || state.headline.spreadPct === undefined
                ? null
                : '，比最贵的站省 ' + state.headline.spreadPct + '%',
            ),
          )
        : null

      var stats = h(
        'div',
        { className: 'stats' },
        StatCard({ k: '站点', v: summary.providerCount === undefined ? providers.length : summary.providerCount, tone: 'tint-muted' }),
        StatCard({ k: '模型供给', v: summary.offerCount === undefined ? offers.length : summary.offerCount, unit: '条', tone: 'tint-accent' }),
        StatCard({
          k: '可横向比较',
          v: summary.comparableCount === undefined ? '—' : summary.comparableCount,
          unit: '个模型',
          tone: 'tint-muted',
        }),
        StatCard({
          k: '最大价差',
          v: summary.maxSpreadPct === null || summary.maxSpreadPct === undefined ? '—' : summary.maxSpreadPct,
          unit: summary.maxSpreadPct === null || summary.maxSpreadPct === undefined ? '' : '%',
          tone: 'tint-warn',
        }),
      )

      var noticeList = h(
        'div',
        { className: 'notice-list' },
        issues.length === 0
          ? h(
              'div',
              { className: 'notice calm' },
              h('span', { className: 'name' }, '一切正常'),
              h('span', { className: 'grow' }),
              h('span', { className: 'desc' }, '所有探测过的供给都在正常范围'),
            )
          : issues.slice(0, 6).map(function (issue, i) {
              return h(
                'div',
                { key: 'is' + i, className: 'notice' + (issue.severe ? ' danger' : '') },
                h('span', { className: 'name' }, issue.name),
                h('span', { className: 'desc' }, issue.count + ' 个供给异常'),
                h('span', { className: 'grow' }),
                h('span', { className: 'desc' }, '可用率低 / 证据过期'),
              )
            }),
      )

      var daemon = health.daemon || {}
      var runCard = h(
        'div',
        { className: 'card' },
        h(
          'div',
          { className: 'card-head' },
          h(
            'div',
            null,
            h('h3', null, '运行状态'),
            h('div', { className: 'meta' }, '守护进程 ' + (daemon.port || 4319) + ' · 数据源 ' + ((props.state && props.state.source) || '—')),
          ),
          h(
            'div',
            { className: 'card-actions' },
            statusPill(health),
            h(
              'button',
              {
                type: 'button',
                className: 'ghost tiny',
                onClick: function () {
                  if (props.restart) props.restart(daemon.mode === 'owned' || daemon.mode === 'attached' ? 'restart' : 'start')
                },
              },
              Icon('refresh', { size: 13 }),
              daemon.mode === 'owned' || daemon.mode === 'attached' ? '重启' : '启动',
            ),
          ),
        ),
        h(
          'div',
          { className: 'badges' },
          h(Badge, { tone: daemon.pid ? 'info' : '' }, 'PID ' + (daemon.pid || '—')),
          health.probe && health.probe.ok ? h(Badge, { tone: 'ok' }, '健康检查通过') : h(Badge, { tone: 'warn' }, '健康检查异常'),
          health.tools && health.tools.names ? h(Badge, { tone: 'ok' }, '工具 ' + health.tools.names.length) : null,
          health.commands && health.commands.registered ? h(Badge, { tone: 'ok' }, '/manage 就绪') : null,
          health.ingest
            ? h(
                Badge,
                { tone: health.ingest.failed ? 'warn' : 'ok' },
                '回写 ' + health.ingest.pushed + '/' + (health.ingest.pushed + health.ingest.skipped + health.ingest.failed),
              )
            : null,
          health.budget && health.budget.over ? h(Badge, { tone: 'danger' }, '预算超限') : null,
        ),
        daemon.lastError ? h('div', { className: 'meta', style: { marginTop: '8px', color: 'var(--danger)' } }, daemon.lastError) : null,
      )

      var usage = state.usage || {}
      var totals = usage.totals || {}
      var usageCard = h(
        'div',
        { className: 'card' },
        h(
          'div',
          { className: 'card-head' },
          h('div', null, h('h3', null, '今日用量'), h('div', { className: 'meta' }, '全渠道（含经插件回写的外部渠道）')),
        ),
        h(
          'div',
          { className: 'ma-kv' },
          h('div', null, h('div', { className: 'k' }, '请求'), h('div', { className: 'v' }, fmtInt(totals.requests))),
          h('div', null, h('div', { className: 'k' }, '输入 token'), h('div', { className: 'v' }, fmtCompact(totals.input))),
          h('div', null, h('div', { className: 'k' }, '输出 token'), h('div', { className: 'v' }, fmtCompact(totals.output))),
          h('div', null, h('div', { className: 'k' }, '缓存命中'), h('div', { className: 'v' }, fmtCompact(totals.cached))),
          h('div', null, h('div', { className: 'k' }, '错误'), h('div', { className: 'v' }, fmtInt(totals.errors))),
          h('div', null, h('div', { className: 'k' }, '平均 TTFT'), h('div', { className: 'v' }, fmtMs(totals.avgTtftMs))),
        ),
      )

      if (!providers.length) {
        return h(
          'div',
          null,
          headline,
          h(Empty, {
            title: '从添加一个中转站开始',
            desc: '填上地址和一个 Key，同步模型列表，就能看到跨站比价。',
            action: h(
              'button',
              {
                type: 'button',
                className: 'primary',
                onClick: function () {
                  if (props.onGoSites) props.onGoSites()
                },
              },
              Icon('plus', { size: 14 }),
              '去站点页新增',
            ),
          }),
        )
      }

      return h(
        'div',
        null,
        headline,
        stats,
        h(SectionTitle, { icon: 'alert' }, issues.length ? '需要关注（' + issues.length + ' 个站点）' : '需要关注'),
        noticeList,
        runCard,
        h(SectionTitle, { icon: 'table' }, '站点速览'),
        h(Table, {
          heads: [
            { label: '站点' },
            { label: '长期评分', num: true },
            { label: '模型', num: true },
            { label: '健康供给', num: true },
            { label: '余额', num: true },
            { label: 'Key', num: true },
          ],
          rows: siteRows,
        }),
        usageCard,
      )
    }

    // ── 站点（含凭据管理、添加向导）────────────────────────────────
    var KIND_LABEL = { 'new-api': 'NewAPI', 'one-api': 'OneAPI', sub2api: 'Sub2API', vendor: '厂商直连', unknown: '' }

    function SitesTab(props) {
      var state = pickState(props)
      var providers = state.providers || []
      var credentials = state.credentials || []
      var offers = state.offers || []
      var reload = props.onReload || function () {}
      var wizardPair = React.useState(false)
      var wizardOpen = wizardPair[0]
      var setWizardOpen = wizardPair[1]
      var msgPair = React.useState('')
      var message = msgPair[0]
      var setMessage = msgPair[1]
      var busyPair = React.useState('')
      var busyId = busyPair[0]
      var setBusyId = busyPair[1]

      function runBusy(id, job) {
        setBusyId(id)
        setMessage('')
        return job().then(function (result) {
          setBusyId('')
          if (result && result.ok === false) setMessage('失败：' + result.error)
          reload()
          return result
        })
      }

      function syncProvider(provider) {
        return runBusy('sync:' + provider.id, function () {
          return writeOp('POST', '/api/providers/' + provider.id + '/sync', {}).then(function (res) {
            if (res.ok) {
              var sync = res.summary && res.summary.sync
              setMessage(
                sync
                  ? provider.name + '：拉到 ' + sync.fetched + ' 个模型（新增 ' + sync.added + '，移除 ' + (sync.removed ? sync.removed.length : 0) + '）'
                  : provider.name + '：同步完成',
              )
            }
            return res
          })
        })
      }

      function removeProvider(provider) {
        var win = typeof window !== 'undefined' ? window : null
        if (win && win.confirm && !win.confirm('删除站点「' + provider.name + '」？它的 Key 与模型供给会一起移除。')) return Promise.resolve()
        return runBusy('del:' + provider.id, function () {
          return writeOp('DELETE', '/api/providers/' + provider.id).then(function (res) {
            if (res.ok) setMessage('已删除站点「' + provider.name + '」')
            return res
          })
        })
      }

      function submitWizard(payload) {
        setBusyId('wizard')
        setMessage('')
        return writeOp('POST', '/api/providers', {
          name: payload.name,
          baseUrl: payload.baseUrl,
          siteUrl: payload.siteUrl || undefined,
          note: payload.note || undefined,
        })
          .then(function (created) {
            if (!created.ok) return created
            var provider = (created.summary && created.summary.provider) || {}
            if (!provider.id) return { ok: false, error: '建站成功但没拿到站点 id' }
            if (!payload.secret) {
              setMessage('已建站「' + provider.name + '」，还没填 Key')
              return { ok: true }
            }
            return writeOp('POST', '/api/credentials', {
              providerId: provider.id,
              label: payload.label || '主 Key',
              secret: payload.secret,
            }).then(function (added) {
              if (!added.ok) return added
              return writeOp('POST', '/api/providers/' + provider.id + '/sync', {}).then(function (synced) {
                if (!synced.ok) return synced
                var sync = (synced.summary && synced.summary.sync) || {}
                setMessage(
                  '已建站「' +
                    provider.name +
                    '」' +
                    (provider.kind ? '（识别为 ' + (KIND_LABEL[provider.kind] || provider.kind) + '）' : '') +
                    '，同步到 ' +
                    (sync.fetched || 0) +
                    ' 个模型',
                )
                return { ok: true }
              })
            })
          })
          .then(function (result) {
            setBusyId('')
            if (result && result.ok === false) setMessage('失败：' + result.error)
            else setWizardOpen(false)
            reload()
            return result
          })
      }

      if (!providers.length) {
        return h(
          'div',
          null,
          message ? h('div', { className: 'alert' }, message) : null,
          h(Empty, {
            title: '还没有任何站点',
            desc: '添加第一个中转站：填站点名、API 端点和一把 Key，就能开始比价与选站。',
            action: h(
              'button',
              {
                type: 'button',
                className: 'primary',
                onClick: function () {
                  setWizardOpen(true)
                },
              },
              Icon('plus', { size: 14 }),
              '新增站点',
            ),
          }),
          wizardOpen
            ? h(SiteWizard, {
                busy: busyId === 'wizard',
                onSubmit: submitWizard,
                onCancel: function () {
                  setWizardOpen(false)
                },
              })
            : null,
        )
      }

      var cards = providers.map(function (provider) {
        var mine = offers.filter(function (offer) {
          return offer.providerId === provider.id
        })
        var keys = credentials.filter(function (cred) {
          return cred.providerId === provider.id
        })
        var kind = KIND_LABEL[provider.kind] || ''
        return h(
          'div',
          { key: provider.id, className: 'card' },
          h(
            'div',
            { className: 'card-head' },
            h(
              'div',
              null,
              h('h3', null, provider.name),
              h('div', { className: 'meta' }, provider.baseUrl || provider.siteUrl || '未填端点'),
            ),
            h(
              'div',
              { className: 'card-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'ghost tiny',
                  onClick: function () {
                    syncProvider(provider)
                  },
                  disabled: busyId === 'sync:' + provider.id,
                },
                Icon('refresh', { size: 13 }),
                busyId === 'sync:' + provider.id ? '同步中…' : '同步模型',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ghost tiny danger',
                  onClick: function () {
                    removeProvider(provider)
                  },
                  disabled: busyId === 'del:' + provider.id,
                },
                Icon('trash', { size: 13 }),
                '删除',
              ),
            ),
          ),
          h(
            'div',
            { className: 'badges' },
            kind ? h(Badge, { tone: 'info' }, kind) : null,
            h(Badge, null, '模型 ' + mine.length),
            h(Badge, null, 'Key ' + keys.length),
            typeof provider.quotaRemaining === 'number' ? h(Badge, { tone: 'ok' }, '余额 ' + fmtMoney(provider.quotaRemaining)) : null,
            provider.hasAdminToken ? h(Badge, { tone: 'info' }, '有管理令牌') : null,
          ),
        )
      })

      return h(
        'div',
        null,
        message ? h('div', { className: 'alert' }, message) : null,
        h(
          'div',
          { className: 'toolbar ma-row', style: { marginBottom: '10px' } },
          h('div', { className: 'ma-spacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'primary',
              onClick: function () {
                setWizardOpen(true)
              },
            },
            Icon('plus', { size: 14 }),
            '新增站点',
          ),
        ),
        cards,
        h(SectionTitle, { icon: 'key' }, '凭据'),
        h(KeysTab, { state: props.state, onReload: reload, embedded: true }),
        wizardOpen
          ? h(SiteWizard, {
              busy: busyId === 'wizard',
              onSubmit: submitWizard,
              onCancel: function () {
                setWizardOpen(false)
              },
            })
          : null,
      )
    }

    function KeysTab(props) {
      var state = pickState(props)
      var credentials = state.credentials || []
      var providers = state.providers || []
      var reload = props.onReload || function () {}
      var nameMap = {}
      providers.forEach(function (provider) {
        nameMap[provider.id] = provider.name
      })
      var addPair = React.useState(false)
      var adding = addPair[0]
      var setAdding = addPair[1]
      var providerPair = React.useState(providers.length ? providers[0].id : '')
      var providerId = providerPair[0]
      var setProviderId = providerPair[1]
      var secretPair = React.useState('')
      var secret = secretPair[0]
      var setSecret = secretPair[1]
      var labelPair = React.useState('')
      var label = labelPair[0]
      var setLabel = labelPair[1]
      var msgPair = React.useState('')
      var message = msgPair[0]
      var setMessage = msgPair[1]
      var busyPair = React.useState(false)
      var busy = busyPair[0]
      var setBusy = busyPair[1]

      function submit() {
        if (!providerId) {
          setMessage('请先选择站点')
          return Promise.resolve()
        }
        if (!secret) {
          setMessage('请填写 Key')
          return Promise.resolve()
        }
        setBusy(true)
        return writeOp('POST', '/api/credentials', { providerId: providerId, label: label || '主 Key', secret: secret }).then(function (res) {
          setBusy(false)
          if (res.ok) {
            setMessage('已保存 Key')
            setSecret('')
            setLabel('')
            setAdding(false)
          } else {
            setMessage('失败：' + res.error)
          }
          reload()
        })
      }

      function remove(cred) {
        var win = typeof window !== 'undefined' ? window : null
        if (win && win.confirm && !win.confirm('删除这把 Key（尾号 ' + (cred.tail || '••••') + '）？')) return Promise.resolve()
        setBusy(true)
        return writeOp('DELETE', '/api/credentials/' + cred.id).then(function (res) {
          setBusy(false)
          if (res.ok) setMessage('已删除 Key')
          else setMessage('失败：' + res.error)
          reload()
        })
      }

      var rows = credentials.map(function (cred) {
        return {
          cells: [
            nameMap[cred.providerId] || cred.providerId,
            cred.label || '—',
            cred.group || '—',
            h('span', { className: 'ma-mono' }, '••••' + (cred.tail || '')),
            h(
              'button',
              {
                type: 'button',
                className: 'ghost tiny danger',
                onClick: function () {
                  remove(cred)
                },
                disabled: busy,
              },
              '删除',
            ),
          ],
        }
      })

      return h(
        'div',
        null,
        message ? h('div', { className: 'alert' }, message) : null,
        credentials.length
          ? h(Table, {
              heads: [{ label: '站点' }, { label: '标签' }, { label: '分组' }, { label: 'Key' }, { label: '' }],
              rows: rows,
            })
          : h(Empty, { title: '还没有 Key', desc: '每个站点至少一把 Key，才能同步模型、跑探针、走网关。' }),
        adding
          ? h(
              'div',
              { className: 'card' },
              h('div', { className: 'card-head' }, h('div', null, h('h3', null, '新增 Key'))),
              h(
                'div',
                { className: 'field' },
                h('label', null, '站点'),
                h(
                  'select',
                  {
                    value: providerId,
                    onChange: function (event) {
                      setProviderId(event.target.value)
                    },
                  },
                  providers.map(function (provider) {
                    return h('option', { key: provider.id, value: provider.id }, provider.name)
                  }),
                ),
              ),
              h(
                'div',
                { className: 'field' },
                h('label', null, '标签'),
                h('input', {
                  value: label,
                  placeholder: '主 Key',
                  onChange: function (event) {
                    setLabel(event.target.value)
                  },
                }),
              ),
              h(
                'div',
                { className: 'field' },
                h('label', null, 'Key（只存密文，列表只显示尾号四位）'),
                h('input', {
                  type: 'password',
                  value: secret,
                  placeholder: 'sk-…',
                  onChange: function (event) {
                    setSecret(event.target.value)
                  },
                }),
              ),
              h(
                'div',
                { className: 'ma-row', style: { marginTop: '12px' } },
                h('button', { type: 'button', className: 'primary', onClick: submit, disabled: busy }, busy ? '保存中…' : '保存'),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ghost',
                    onClick: function () {
                      setAdding(false)
                    },
                  },
                  '取消',
                ),
              ),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'ghost',
                onClick: function () {
                  setAdding(true)
                },
                style: { marginTop: '10px' },
              },
              Icon('plus', { size: 13 }),
              '新增 Key',
            ),
      )
    }

    function SiteWizard(props) {
      var namePair = React.useState('')
      var wizardName = namePair[0]
      var setWizardName = namePair[1]
      var basePair = React.useState('')
      var baseUrl = basePair[0]
      var setBaseUrl = basePair[1]
      var secretPair = React.useState('')
      var secret = secretPair[0]
      var setSecret = secretPair[1]
      var labelPair = React.useState('')
      var label = labelPair[0]
      var setLabel = labelPair[1]

      function submit() {
        if (props.onSubmit) {
          props.onSubmit({
            name: String(wizardName || '').trim(),
            baseUrl: String(baseUrl || '').trim(),
            siteUrl: String(baseUrl || '').trim(),
            secret: String(secret || '').trim(),
            label: String(label || '').trim(),
          })
        }
      }

      return h(
        'div',
        { className: 'ma-modal' },
        h(
          'div',
          { className: 'ma-modal-card' },
          h('h3', null, '新增站点'),
          h('div', { className: 'meta' }, '两步：先填站点身份，再填一把 Key；保存后会自动识别系别并同步模型。'),
          h(
            'div',
            { className: 'field' },
            h('label', null, '站点名称'),
            h('input', {
              value: wizardName,
              placeholder: '例如：秋、北辰、凌风',
              onChange: function (event) {
                setWizardName(event.target.value)
              },
            }),
          ),
          h(
            'div',
            { className: 'field' },
            h('label', null, 'API 端点'),
            h('input', {
              value: baseUrl,
              placeholder: 'https://api.example.com/v1',
              onChange: function (event) {
                setBaseUrl(event.target.value)
              },
            }),
          ),
          h(
            'div',
            { className: 'field' },
            h('label', null, 'Key（可稍后再填）'),
            h('input', {
              type: 'password',
              value: secret,
              placeholder: 'sk-…',
              onChange: function (event) {
                setSecret(event.target.value)
              },
            }),
          ),
          h(
            'div',
            { className: 'field' },
            h('label', null, '标签'),
            h('input', {
              value: label,
              placeholder: '主 Key',
              onChange: function (event) {
                setLabel(event.target.value)
              },
            }),
          ),
          h(
            'div',
            { className: 'ma-modal-foot' },
            h('button', { type: 'button', className: 'ghost', onClick: props.onCancel }, '取消'),
            h(
              'button',
              { type: 'button', className: 'primary', onClick: submit, disabled: props.busy || !String(wizardName || '').trim() || !String(baseUrl || '').trim() },
              props.busy ? '保存中…' : '保存并同步',
            ),
          ),
        ),
      )
    }

    // ── 比价 ─────────────────────────────────────────────────────
    function PricesTab(props) {
      var state = pickState(props)
      var ranked = state.ranked || []
      var providers = state.providers || []
      var nameMap = {}
      providers.forEach(function (provider) {
        nameMap[provider.id] = provider.name
      })
      if (!ranked.length) return h(Empty, { title: '还没有可比价的模型', desc: '至少两个站点提供同一个模型，才会出现跨站价差。' })

      return h(
        'div',
        null,
        ranked.map(function (group) {
          var rows = (group.rows || []).map(function (row) {
            return {
              cells: [
                h(
                  'span',
                  null,
                  row.isCheapest ? h('span', { className: 'dot green' }) : null,
                  nameMap[row.providerId] || row.providerId || '—',
                ),
                row.upstreamName || '—',
                { num: true, node: row.group || '—' },
                { num: true, node: fmtMoney(row.blendedCnyPerMtok) },
                { num: true, node: row.deltaPct === null || row.deltaPct === undefined ? '—' : fmtPct(row.deltaPct) },
                { num: true, node: fmtMs(row.ttftMs) },
                { num: true, node: fmtRate(row.cacheHitRate) },
                { num: true, node: row.isCheapest ? h(Badge, { tone: 'ok' }, '最便宜') : '—' },
              ],
            }
          })
          var meta =
            group.providerCount + ' 个站点' + (group.spreadPct === null || group.spreadPct === undefined ? '' : ' · 价差 ' + group.spreadPct + '%')
          return h(
            'div',
            { key: group.modelKey },
            h(
              SectionTitle,
              { icon: 'columns' },
              group.modelKey,
              h('span', { style: { marginLeft: '8px', color: 'var(--faint)', fontSize: 'var(--fs-2)', fontWeight: 400 } }, meta),
            ),
            h(Table, {
              heads: [
                { label: '站点' },
                { label: '上游模型' },
                { label: '分组', num: true },
                { label: '¥/百万', num: true },
                { label: '价差', num: true },
                { label: 'TTFT', num: true },
                { label: '缓存', num: true },
                { label: '' },
              ],
              rows: rows,
            }),
          )
        }),
      )
    }

    // ── 智能决策 ─────────────────────────────────────────────────
    function DecisionsTab(props) {
      var state = pickState(props)
      var rows = (state.routing || []).slice().reverse()
      if (!rows.length) return h(Empty, { title: '还没有路由记录', desc: '发起一次对话后，这里会按请求列出选站过程。' })

      var okCount = 0
      rows.forEach(function (row) {
        if (row.outcome === 'ok') okCount += 1
      })
      var failures = rows.length - okCount
      var tableRows = rows.slice(0, 30).map(function (row) {
        var failText = ''
        if (row.failures && row.failures.length) {
          var first = row.failures[0]
          failText = (first.providerName || '') + '：' + String(first.error || '').slice(0, 40)
        }
        return {
          cells: [
            { num: true, node: fmtTime(row.ts) },
            row.model || '—',
            row.chosenProviderName || '—',
            { num: true, node: row.attempts || 1 },
            { num: true, node: row.outcome === 'ok' ? h(Badge, { tone: 'ok' }, '成功') : h(Badge, { tone: 'danger' }, '失败') },
            { num: true, node: fmtMs(row.ttftMs) },
            { num: true, node: fmtMs(row.latencyMs) },
            failText ? h('span', { className: 'hint', title: failText }, failText) : '—',
          ],
        }
      })

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'badges', style: { marginBottom: '10px' } },
          h(Badge, { tone: 'ok' }, '成功 ' + okCount),
          h(Badge, { tone: failures ? 'danger' : '' }, '失败 ' + failures),
          h(Badge, null, '共 ' + rows.length + ' 条'),
          h(
            Badge,
            null,
            '换站次数 ' +
              rows.reduce(function (sum, row) {
                return sum + Math.max(0, (row.attempts || 1) - 1)
              }, 0),
          ),
        ),
        h(Table, {
          scroll: true,
          heads: [
            { label: '时间', num: true },
            { label: '模型' },
            { label: '选中站点' },
            { label: '尝试', num: true },
            { label: '结果', num: true },
            { label: 'TTFT', num: true },
            { label: '耗时', num: true },
            { label: '失败摘要' },
          ],
          rows: tableRows,
        }),
      )
    }

    // ── 探针 ─────────────────────────────────────────────────────
    function ProbesTab(props) {
      var state = pickState(props)
      var scores = state.scores || {}
      var offers = state.offers || []
      var providers = state.providers || []
      var nameMap = {}
      providers.forEach(function (provider) {
        nameMap[provider.id] = provider.name
      })
      var offerMap = {}
      offers.forEach(function (offer) {
        offerMap[offer.id] = offer
      })
      var ids = Object.keys(scores)
      if (!ids.length) return h(Empty, { title: '还没有探针数据', desc: '触发一次探针后，这里会有每个供给的证据表（可用率 / 质量 / 完整性 / 缓存命中）。' })

      ids.sort(function (a, b) {
        return (scores[b].quality || 0) - (scores[a].quality || 0)
      })
      var rows = ids.slice(0, 25).map(function (id) {
        var score = scores[id]
        var offer = offerMap[id] || {}
        return {
          cells: [
            h('span', null, h('span', { className: 'dot ' + (score.stale ? 'yellow' : 'green') }), nameMap[offer.providerId] || '—'),
            offer.upstreamName || '—',
            { num: true, node: fmtRate(score.availability) },
            { num: true, node: score.quality === null || score.quality === undefined ? '—' : String(score.quality) },
            { num: true, node: score.integrity === null || score.integrity === undefined ? '—' : String(score.integrity) },
            { num: true, node: fmtMs(score.ttftMs) },
            { num: true, node: fmtRate(score.cacheHitRate) },
            { num: true, node: String(score.samples || 0) },
            { num: true, node: score.confidence === null || score.confidence === undefined ? '—' : fmtRate(score.confidence) },
          ],
        }
      })

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'badges', style: { marginBottom: '10px' } },
          h(Badge, null, '共 ' + ids.length + ' 个供给'),
          h(Badge, null, '历史探针总数 ' + (state.probeTotal || 0)),
        ),
        h(Table, {
          scroll: true,
          heads: [
            { label: '站点' },
            { label: '上游模型' },
            { label: '可用率', num: true },
            { label: '质量', num: true },
            { label: '完整性', num: true },
            { label: 'TTFT', num: true },
            { label: '缓存', num: true },
            { label: '样本', num: true },
            { label: '置信', num: true },
          ],
          rows: rows,
        }),
      )
    }

    // ── 用量 ─────────────────────────────────────────────────────
    function UsageTab(props) {
      var state = pickState(props)
      var usage = state.usage || {}
      var totals = usage.totals || {}
      var byProvider = usage.byProvider || {}
      var byModel = usage.byModel || {}
      var providers = state.providers || []
      var nameMap = {}
      providers.forEach(function (provider) {
        nameMap[provider.id] = provider.name
      })

      function asList(value, idKey) {
        if (Array.isArray(value)) return value
        return Object.keys(value || {}).map(function (key) {
          var row = Object.assign({}, value[key])
          if (!row[idKey]) row[idKey] = key
          return row
        })
      }

      var providerRows = asList(byProvider, 'providerId')
        .slice()
        .sort(function (a, b) {
          return (b.input || 0) + (b.output || 0) - ((a.input || 0) + (a.output || 0))
        })
        .map(function (row) {
          return {
            cells: [
              nameMap[row.providerId] || row.providerId || '—',
              { num: true, node: fmtInt(row.requests) },
              { num: true, node: fmtCompact(row.input) },
              { num: true, node: fmtCompact(row.output) },
              { num: true, node: fmtCompact(row.cached) },
            ],
          }
        })

      var modelRows = asList(byModel, 'model')
        .slice()
        .sort(function (a, b) {
          return (b.input || 0) + (b.output || 0) - ((a.input || 0) + (a.output || 0))
        })
        .slice(0, 30)
        .map(function (row) {
          return {
            cells: [
              row.model || row.key || '—',
              { num: true, node: fmtInt(row.requests) },
              { num: true, node: fmtCompact(row.input) },
              { num: true, node: fmtCompact(row.output) },
              { num: true, node: fmtMs(row.avgTtftMs) },
            ],
          }
        })

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'stats' },
          StatCard({ k: '请求', v: fmtInt(totals.requests), tone: 'tint-muted' }),
          StatCard({ k: '输入 token', v: fmtCompact(totals.input), tone: 'tint-accent' }),
          StatCard({ k: '输出 token', v: fmtCompact(totals.output), tone: 'tint-muted' }),
          StatCard({ k: '错误', v: fmtInt(totals.errors), tone: 'tint-warn' }),
        ),
        h(SectionTitle, { icon: 'servers' }, '按站点'),
        h(Table, {
          heads: [{ label: '站点' }, { label: '请求', num: true }, { label: '输入', num: true }, { label: '输出', num: true }, { label: '缓存', num: true }],
          rows: providerRows,
        }),
        h(SectionTitle, { icon: 'layers' }, '按模型'),
        h(Table, {
          scroll: true,
          heads: [{ label: '模型' }, { label: '请求', num: true }, { label: '输入', num: true }, { label: '输出', num: true }, { label: 'TTFT', num: true }],
          rows: modelRows,
        }),
      )
    }

    // ── 会话成本 chip（挂在 assistant 消息下方）────────────────────
    var chipCache = { at: 0, key: '', data: null }
    var chipPending = null

    function fetchChip(sessionId) {
      var now = Date.now()
      if (chipCache.key === sessionId && now - chipCache.at < 15000) return Promise.resolve(chipCache.data)
      if (chipPending) return chipPending
      chipPending = fetchJson('stream-stats?session=' + encodeURIComponent(sessionId)).then(
        function (res) {
          var data = res.ok && res.body ? res.body : null
          chipCache = { at: Date.now(), key: sessionId, data: data }
          chipPending = null
          return data
        },
        function () {
          chipPending = null
          return null
        },
      )
      return chipPending
    }

    function CostChip(props) {
      var sessionId = props && props.sessionId
      var pair = React.useState(chipCache.data)
      var data = pair[0]
      var setData = pair[1]
      React.useEffect(
        function () {
          if (!sessionId) return undefined
          var alive = true
          fetchChip(sessionId).then(function (next) {
            if (alive) setData(next)
          })
          return function () {
            alive = false
          }
        },
        [sessionId],
      )
      if (!sessionId || !data) return null
      var stats = data.stats || data.totals || null
      if (!stats || !stats.calls) return null
      return h(
        'span',
        {
          className: 'chip',
          title:
            '本会话经 ManageAPI 路由累计 ' +
            fmtInt(stats.tokens) +
            ' token / ' +
            stats.calls +
            ' 次调用' +
            (stats.model ? '，最近模型 ' + stats.model : ''),
          style: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
        },
        Icon('swap', { size: 12 }),
        fmtCompact(stats.tokens) + ' tok / ' + stats.calls + ' 次',
      )
    }

    // ── 壳 ───────────────────────────────────────────────────────
    function ManageIcon(props) {
      var size = (props && props.size) || 18
      var active = !!(props && props.active)
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: {
          __html:
            '<rect x="3" y="4" width="18" height="16" rx="3"/>' +
            '<path d="M3 9h18"/>' +
            '<path d="M9 9v11"/>' +
            '<path d="M13 13h4"/><path d="M13 16.5h3"/>',
        },
      })
    }

    function ManageShell(props) {
      var theme = useTheme()
      var api = useApi(15000)
      var pair = React.useState((props && props.initialTab) || 'overview')
      var tab = pair[0]
      var setTab = pair[1]

      React.useEffect(function () {
        return injectTheme(currentDoc())
      }, [])

      var health = api.health || {}
      var daemon = health.daemon || {}
      var body
      if (tab === 'sites') body = h(SitesTab, { state: api.state, onReload: api.reload })
      else if (tab === 'prices') body = h(PricesTab, { state: api.state })
      else if (tab === 'decisions') body = h(DecisionsTab, { state: api.state })
      else if (tab === 'probes') body = h(ProbesTab, { state: api.state })
      else if (tab === 'usage') body = h(UsageTab, { state: api.state })
      else
        body = h(OverviewTab, {
          health: health,
          state: api.state,
          busy: api.busy,
          restart: api.restart,
          onReload: api.reload,
          onGoSites: function () {
            setTab('sites')
          },
        })

      var activeTab =
        TABS.filter(function (item) {
          return item.id === tab
        })[0] || TABS[0]

      var sub = activeTab.desc
      var snap = api.state && api.state.state
      if (snap && snap.summary && tab === 'overview') {
        sub = snap.summary.providerCount + ' 个站点 · ' + snap.summary.offerCount + ' 条模型供给 · ' + (snap.probeTotal || 0) + ' 次探测'
      } else if (snap && snap.providers && tab === 'sites') {
        sub = snap.providers.length + ' 个站点'
      }

      var errorLine =
        api.state && api.state.ok === false
          ? h(
              'div',
              { className: 'alert danger', style: { marginBottom: '12px' } },
              h('span', { className: 'name' }, '读不到数据'),
              h('span', { className: 'grow' }),
              h('span', { className: 'desc' }, api.state.error || '未知错误'),
            )
          : null

      return h(
        'div',
        {
          className: 'ma-root' + ((props && props.variant) === 'section' ? ' ma-section' : ' ma-main'),
          'data-ma-theme': theme,
        },
        h(
          'div',
          { className: 'ma-page' },
          h(
            'div',
            { className: 'ma-head' },
          h(
            'header',
            { className: 'topbar' },
            h('div', { className: 'topbar-left' }, h('h2', null, activeTab.title), h('span', { className: 'topbar-sub' }, sub)),
            h(
              'div',
              { className: 'topbar-right' },
              statusPill(health),
              h(
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
              h('span', { className: 'dot ' + (health.probe && health.probe.ok ? 'green' : 'yellow') }),
            ),
          ),
          h(
            'nav',
            { className: 'ma-tabs' },
            TABS.map(function (item) {
              return h(
                'button',
                {
                  key: item.id,
                  type: 'button',
                  className: tab === item.id ? 'active' : '',
                  onClick: function () {
                    setTab(item.id)
                  },
                },
                Icon(item.icon, { size: 15 }),
                h(
                  'span',
                  { className: 'nav-text' },
                  h('span', { className: 'nav-title' }, item.title),
                  h('span', { className: 'nav-desc' }, item.desc),
                ),
              )
            }),
          ),
          ),
          h('div', { className: 'ma-body' }, errorLine, body),
        ),
      )
    }

    function MainPanel() {
      return h(ManageShell, { initialTab: 'overview', variant: 'main' })
    }

    function PanelSection() {
      return h(ManageShell, { initialTab: 'overview', variant: 'section' })
    }

    // ── 注册 ─────────────────────────────────────────────────────
    function apply(ctx) {
      var disposers = []
      disposers.push(injectTheme(currentDoc()))

      var slots = ctx && typeof ctx.get === 'function' ? ctx.get('slots', false) : null
      if (!slots) {
        try {
          if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-manage-api: slots 服务不可用，客户端面板未注册')
        } catch (err) {
          /* 忽略 */
        }
        return function () {}
      }

      function register(slotName, definition, component) {
        if (typeof slots.inject === 'function') {
          var injected = slots.inject(slotName, function () {
            return slots.register(Object.assign({ name: slotName }, definition), component)
          })
          if (typeof injected === 'function') disposers.push(injected)
        } else if (typeof slots.register === 'function') {
          var dispose = slots.register(Object.assign({ name: slotName }, definition), component)
          if (typeof dispose === 'function') disposers.push(dispose)
        }
      }

      register('main', { key: 'manage-api' }, MainPanel)
      register(
        'sidebar.panellist',
        {
          id: 'manage-api',
          order: 40,
          label: function () {
            return 'ManageAPI'
          },
        },
        ManageIcon,
      )
      register(
        'settings.section',
        {
          id: 'manage-api',
          order: 60,
          label: function () {
            return 'ManageAPI'
          },
        },
        PanelSection,
      )
      register('conversation.chat.assistant-actions', { id: 'manage-api-cost', order: 30 }, CostChip)

      return function dispose() {
        while (disposers.length) {
          var fn = disposers.pop()
          try {
            fn()
          } catch (err) {
            /* 忽略：宿主可能已经卸载 */
          }
        }
      }
    }

    return {
      name: name,
      apply: apply,
      inject: inject,
      __internals: {
        OverviewTab: OverviewTab,
        SitesTab: SitesTab,
        KeysTab: KeysTab,
        PricesTab: PricesTab,
        DecisionsTab: DecisionsTab,
        ProbesTab: ProbesTab,
        UsageTab: UsageTab,
        SiteWizard: SiteWizard,
        ManageIcon: ManageIcon,
        MainPanel: MainPanel,
        PanelSection: PanelSection,
        CostChip: CostChip,
        writeOp: writeOp,
        fmtMoney: fmtMoney,
        fmtCompact: fmtCompact,
        fmtRate: fmtRate,
        THEME_CSS: THEME_CSS,
      },
    }
  },
})
