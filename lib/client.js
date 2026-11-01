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
      // 开关行：文字列不能被压成「每行一个字」。.switch-text 是 flex 项，
      // 中文的 min-content 只有 1 个字符宽，一旦祖先给了很小的宽度就会竖向堆字，
      // 所以给它一个下限宽度兜底（容器更窄时宁可溢出，也不要竖排）。
      '.ma-root .switch{width:100%;align-items:flex-start}',
      '.ma-root .switch-text{flex:1 1 auto;min-width:12em;overflow-wrap:break-word}',
      '.ma-root .switch-text b,.ma-root .switch-text>span{display:block;white-space:normal;word-break:normal}',
      '.ma-root.ma-section .ma-page{max-width:none}',
      '.ma-root .ma-head{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:1px solid var(--divider)}',
      '.ma-root.ma-section .ma-head{position:static;border-bottom:0}',
      '.ma-root .topbar{position:static;backdrop-filter:none;background:transparent;border-bottom:0;padding:14px 20px 10px}',
      '.ma-root.ma-section .topbar{padding:0 0 10px}',
      '.ma-root .ma-tabs{display:flex;gap:2px;padding:0 20px 8px;overflow-x:auto;border:0;scrollbar-width:none}',
      '.ma-root .ma-tabs::-webkit-scrollbar{display:none}',
      '.ma-root.ma-section .ma-tabs{padding:0 0 8px}',
      '.ma-root .ma-tabs button{display:flex;flex:1 1 0;align-items:center;justify-content:flex-start;gap:8px;padding:7px 12px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;text-align:left;white-space:nowrap}',
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
      '.ma-root .ma-skeleton{display:flex;flex-direction:column;gap:12px;padding:4px 0}',
      '.ma-root .ma-skeleton .sk-card{border:1px solid var(--border);border-radius:var(--radius);padding:16px;background:var(--surface)}',
      '.ma-root .ma-skeleton .sk-row{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--hover) 25%,var(--border) 37%,var(--hover) 63%);background-size:400% 100%;animation:ma-sk 1.4s ease infinite}',
      '.ma-root .ma-skeleton .sk-row.w40{width:40%}',
      '.ma-root .ma-skeleton .sk-row.w60{width:60%}',
      '.ma-root .ma-skeleton .sk-row.w80{width:80%}',
      '.ma-root .ma-skeleton .sk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}',
      '@keyframes ma-sk{0%{background-position:100% 50%}100%{background-position:0 50%}}',
      '@media (prefers-reduced-motion:reduce){.ma-root .ma-skeleton .sk-row{animation:none}}',
      '.ma-root .ma-modal-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
      '.ma-root .field{margin-top:12px}',
      '.ma-root .field label{display:block;font-size:var(--fs-2);color:var(--muted);margin-bottom:4px}',
      '.ma-root .field input,.ma-root .field select{width:100%}',
      '.ma-root .ma-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ma-root .ma-spacer{flex:1}',
      /* 模型接入（原名「自动 DSH」）：一行一个开关。规则要点：
         ① 行自己就是 flex（theme 的 .switch-row 只是「上间距 + 虚线」，不再复用）；
         ② 模型名曾用 flex:1 1 240px —— 那是给旧的横向 .ig-row 写的，搬到 .switch-text
            （纵向 flex）后 flex-basis 变成了「高 240px」，每行撑到 280px，卡片下面一大片空白。
            这里改成 flex:none + 允许换行断词，长模型名照样完整显示。 */
      '.ma-root .auto-dsh-row{display:flex;align-items:flex-start;gap:8px 10px;flex-wrap:wrap;padding:9px 6px;margin-top:0;border-top:0;border-radius:8px}',
      '.ma-root .auto-dsh-row + .auto-dsh-row{border-top:1px solid var(--divider)}',
      '.ma-root .auto-dsh-list{max-height:none;overflow:visible}',
      '.ma-root .auto-dsh-row.is-current{background:var(--accent-soft)}',
      '.ma-root .auto-dsh-row .switch{flex:1 1 auto;min-width:0}',
      '.ma-root .auto-dsh-name{flex:none;display:block;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;white-space:normal;word-break:break-word;overflow-wrap:anywhere;color:var(--text)}',
      '.ma-root .auto-dsh-row .hint{flex:none;margin:0;font-size:11px;line-height:1.55}',
      '.ma-root .auto-dsh-card .msg-line{margin:12px 0 0;font-size:12px;line-height:1.6;padding:8px 10px;border-radius:8px;border:1px solid transparent;word-break:break-word}',
      '.ma-root .auto-dsh-card .msg-line.is-err{background:var(--danger-soft,#fdecec);border-color:var(--danger-border,#f3c9c9);color:var(--danger-strong,#c0392b)}',
      '.ma-root .auto-dsh-card .msg-line.is-ok{background:var(--success-soft,#e8f6ef);border-color:var(--border);color:var(--success,#1a7f5a)}',
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

    /**
     * 统一取数：先把响应读成文本再尝试 JSON，避免「宿主路由返回了非 JSON 响应」这种哑谜。
     *
     * 额外能力（前端评审 L2/P0-2 的最小修复）：
     * - `init.timeoutMs`：单次请求超时（默认 20s），超时主动 abort，不再永久挂起；
     * - `init.signal`：可被上层取消（竞态作废在途请求）；
     * - 失败一律折成 `{ok:false, status, error}`，绝不抛异常（调用方不需要 try/catch）。
     */
    function fetchJson(path, init) {
      var url = apiUrl(path)
      var options = Object.assign({}, init || {})
      var timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 20000
      var outer = options.signal
      delete options.timeoutMs
      options.headers = Object.assign({ accept: 'application/json' }, options.headers || {})
      options.credentials = 'same-origin'

      var controller = null
      var timer = null
      var timedOut = false
      if (typeof AbortController === 'function') {
        controller = new AbortController()
        options.signal = controller.signal
        if (outer && typeof outer.addEventListener === 'function') {
          if (outer.aborted) {
            try {
              controller.abort()
            } catch (err) {}
          } else {
            outer.addEventListener(
              'abort',
              function () {
                try {
                  controller.abort()
                } catch (err) {}
              },
              { once: true },
            )
          }
        }
        if (timeoutMs > 0 && typeof setTimeout === 'function') {
          timer = setTimeout(function () {
            timedOut = true
            try {
              controller.abort()
            } catch (err) {}
          }, timeoutMs)
        }
      }

      var clear = function () {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }

      return fetch(url, options)
        .then(
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
            var message = err && err.message ? err.message : String(err)
            var aborted = (err && err.name === 'AbortError') || /abort/i.test(message)
            return {
              ok: false,
              status: 0,
              body: null,
              text: '',
              error: timedOut ? '请求超时（' + Math.round(timeoutMs / 1000) + 's 未响应）' : aborted ? '请求已取消' : '请求宿主失败：' + message,
              aborted: aborted && !timedOut,
            }
          },
        )
        .then(function (result) {
          clear()
          return result
        })
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
      eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
      'eye-off': '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><path d="M4 4l16 16"/>',
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
      { id: 'overview', title: '概览', desc: '状态与排名' },
      { id: 'gateway', title: '接入', desc: '模型接入 · 请求观测', selfRoot: true },
      { id: 'monitor', title: '站点', desc: '余额与分组', selfRoot: true },
      { id: 'free', title: '免费', desc: '额度与积分', selfRoot: true },
      { id: 'pricing', title: '比价', desc: '同一模型对比', wide: true, selfRoot: true },
      { id: 'decision', title: '智能决策', desc: '选站与手动调整', wide: true, selfRoot: true },
      { id: 'probes', title: '探针', desc: '检测是否偷工', wide: true, selfRoot: true },
      { id: 'usage', title: '用量', desc: '消耗统计', selfRoot: true },
      { id: 'benchmark', title: '基准价', desc: '官方价参照', wide: true, selfRoot: true },
    ]

    function pickState(props) {
      var env = props && props.state
      if (!env) return {}
      return env.state || {}
    }

    /**
     * 数据层（前端评审 L2 / P0-2）：
     * - `epoch` 序号作废在途响应：快速切 tab / 轮询重叠时，旧响应不会覆盖新数据；
     * - 失败不抛异常、不清旧数据：保留上一次成功快照，页面顶部显示错误条 + 重试；
     * - `loading` 只在「首次还没有任何答复」时为 true，骨架屏据此判断，避免把加载中当空态。
     */
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
      var errorPair = React.useState(null)
      var error = errorPair[0]
      var setError = errorPair[1]
      var epochRef = React.useRef(0)
      var answeredRef = React.useRef(false)
      var lastGoodRef = React.useRef({ health: null, state: null })

      var reload = React.useCallback(function (opts) {
        var withState = !opts || opts.withState !== false
        var epoch = epochRef.current + 1
        epochRef.current = epoch
        setBusy(true)
        var jobs = [fetchJson('health', { timeoutMs: 15000 })]
        if (withState) jobs.push(fetchJson('state', { timeoutMs: 30000 }))
        return Promise.all(jobs)
          .then(function (results) {
            if (epoch !== epochRef.current) return
            var failure = null
            var healthRes = results[0]
            if (healthRes && healthRes.ok) {
              setHealth(healthRes.body)
              lastGoodRef.current.health = healthRes.body
            } else if (healthRes) {
              failure = healthRes.error || '读取 /health 失败'
              setHealth({ ok: false, error: failure })
            }
            if (withState) {
              var stateRes = results[1]
              if (stateRes && stateRes.ok) {
                setData(stateRes.body)
                lastGoodRef.current.state = stateRes.body
              } else if (stateRes) {
                failure = failure || stateRes.error || '读取 /state 失败'
                var keep = lastGoodRef.current.state
                setData({ ok: false, error: failure, state: keep && keep.state ? keep.state : null })
              }
            }
            answeredRef.current = true
            setError(failure)
          })
          .catch(function (err) {
            if (epoch !== epochRef.current) return
            setError('刷新失败：' + (err && err.message ? err.message : String(err)))
          })
          .then(function () {
            if (epoch === epochRef.current) setBusy(false)
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
          epochRef.current = epochRef.current + 1
        }
      }, [pollMs])

      var restart = React.useCallback(function (action) {
        setBusy(true)
        return writeOp('POST', '/api/manage-api/daemon/' + action, {})
          .catch(function (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) }
          })
          .then(function (result) {
            setBusy(false)
            if (result && result.ok === false) {
              setError('重启 daemon 失败：' + (result.error || '未知错误'))
              return result
            }
            return reload().then(function () {
              return result
            })
          })
      }, [])

      var loading = !answeredRef.current && data === null
      return { health: health, state: data, busy: busy, error: error, loading: loading, reload: reload, restart: restart }
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

    /** 首屏骨架：只在「还没有任何答复」时出现，避免把加载中渲染成空态（前端评审 D3/L2）。 */
    function Skeleton(props) {
      var cards = (props && props.cards) || 1
      var rows = (props && props.rows) || 3
      var block = function (key) {
        var lines = []
        for (var i = 0; i < rows; i += 1) {
          lines.push(
            h('div', {
              key: 'r' + i,
              className: 'sk-row ' + (i === 0 ? 'w60' : i === 1 ? 'w80' : 'w40'),
            }),
          )
        }
        return h('div', { key: 'c' + key, className: 'sk-card' }, lines)
      }
      var list = []
      for (var i = 0; i < cards; i += 1) list.push(block(i))
      return h(
        'div',
        { className: 'ma-skeleton', 'aria-busy': 'true', 'aria-live': 'polite' },
        h('div', { className: 'sk-stats' }, block('s0'), block('s1'), block('s2'), block('s3')),
        list,
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

    // 视图片段尚未就绪时的占位（正常情况下不会出现）
    function MissingView(props) {
      return h('div', { className: 'empty' }, h('h3', null, '这个页面还没装好'), h('p', null, '缺少视图片段：' + props.id))
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
    // >>> parts:begin
    // ── part: 05-overview.js ──
// ── 概览（1:1 移植网页版 renderOverview：headline → stats → 需要关注 → 站点速览）──
// 说明：网页版还有「运行状态 / 今日用量」两块只在当前插件里出现过，为了和网页版一致已移除；
// 守护进程状态改由顶栏状态 pill 承载，用量详见「用量」页。

function overviewIssueScore(score, entry) {
  entry.count += 1
  if (score.status === 'unstable') entry.severe = true
  if (score.stale) entry.reasons['评分过期'] = 1
  if (typeof score.availability === 'number' && score.availability < 0.8) entry.reasons['可用率低'] = 1
  if (typeof score.fingerprintRate === 'number' && score.fingerprintRate < 1) entry.reasons['指纹不符'] = 1
  if (typeof score.truncationRate === 'number' && score.truncationRate < 1) entry.reasons['输出截断'] = 1
  if (typeof score.billingRate === 'number' && score.billingRate < 1) entry.reasons['用量虚报'] = 1
  return entry
}

function OverviewHeadline(props) {
  var line = props.headline
  if (!line) return null
  return h(
    'div',
    { className: 'headline' },
    h(
      'div',
      { className: 'line' },
      '同样用 ',
      line.modelKey,
      '，现在选「',
      h('strong', null, line.providerName),
      '」最划算：',
      h('strong', null, fmtMoney(line.price) + '/百万 token'),
      '，比最贵的站省 ',
      h('strong', null, line.spreadPct),
      '%',
    ),
  )
}

function OverviewStats(props) {
  var s = props.summary || {}
  var items = [
    { k: '站点', v: s.providerCount === undefined ? props.providerCount : s.providerCount, unit: '', icon: 'servers', tone: 'tint-muted' },
    { k: '模型供给', v: s.offerCount === undefined ? props.offerCount : s.offerCount, unit: '条', icon: 'layers', tone: 'tint-accent' },
    { k: '可横向比较', v: s.comparableCount === undefined ? '—' : s.comparableCount, unit: '个模型', icon: 'columns', tone: 'tint-muted' },
    { k: '最大价差', v: s.maxSpreadPct === null || s.maxSpreadPct === undefined ? '—' : s.maxSpreadPct, unit: s.maxSpreadPct === null || s.maxSpreadPct === undefined ? '' : '%', icon: 'trend', tone: 'tint-warn' },
  ]
  return h(
    'div',
    { className: 'stats' },
    items.map(function (item, i) {
      return h(
        'div',
        { key: 'st' + i, className: 'stat' },
        h(
          'div',
          { className: 'stat-main' },
          h('div', { className: 'k' }, item.k),
          h('div', { className: 'v' }, item.v, item.unit ? h('small', null, item.unit) : null),
        ),
        h('div', { className: 'stat-icon ' + item.tone }, Icon(item.icon, { size: 18 })),
      )
    }),
  )
}

function OverviewIssues(props) {
  var issues = props.issues || []
  var openPair = React.useState(false)
  var open = openPair[0]
  var setOpen = openPair[1]
  var PREVIEW = 4
  var hidden = open ? 0 : Math.max(0, issues.length - PREVIEW)
  var list = open ? issues : issues.slice(0, PREVIEW)

  var head =
    issues.length === 0
      ? h('h3', { className: 'section-title' }, h('span', { className: 's-icon' }, Icon('alert', { size: 14 })), '需要关注')
      : h(
          'h3',
          { className: 'section-title' },
          h('span', { className: 's-icon' }, Icon('alert', { size: 14 })),
          '需要关注（' + issues.length + ' 个站点）',
        )

  var rows =
    issues.length === 0
      ? [
          h(
            'div',
            { key: 'calm', className: 'notice calm' },
            h('span', { className: 'name' }, '一切正常'),
            h('span', { className: 'grow' }),
            h('span', { className: 'desc' }, '所有探测过的供给都在正常范围'),
          ),
        ]
      : list.map(function (issue, i) {
          return h(
            'div',
            { key: 'iss' + i, className: 'notice' + (issue.severe ? ' danger' : '') },
            h('span', { className: 'name' }, issue.name),
            h('span', { className: 'desc' }, issue.count + ' 个模型'),
            h('span', { className: 'grow' }),
            h('span', { className: 'desc' }, issue.reasonText),
          )
        })

  if (hidden > 0 || (open && issues.length > PREVIEW)) {
    rows.push(
      h(
        'button',
        {
          key: 'more',
          type: 'button',
          className: 'notice-more',
          onClick: function () {
            setOpen(!open)
          },
        },
        hidden > 0 ? '还有 ' + hidden + ' 个站点，展开全部' : '收起',
      ),
    )
  }

  return h('div', null, head, h('div', { className: 'notice-list' }, rows))
}

function OverviewView(props) {
  var state = pickState(props)
  var providers = state.providers || []
  var offers = state.offers || []
  var scores = state.scores || {}
  var creds = state.credentials || []
  var ranking = state.siteRanking || []

  // 探针判定有问题的供给——按站点聚合，避免同一个站刷屏
  var issueMap = {}
  Object.keys(scores).forEach(function (offerId) {
    var score = scores[offerId] || {}
    if (['degraded', 'unstable', 'stale'].indexOf(score.status) < 0) return
    var offer = null
    for (var i = 0; i < offers.length; i += 1) {
      if (offers[i].id === offerId) {
        offer = offers[i]
        break
      }
    }
    if (!offer) return
    var provider = null
    for (var j = 0; j < providers.length; j += 1) {
      if (providers[j].id === offer.providerId) {
        provider = providers[j]
        break
      }
    }
    if (!provider) return
    var entry = issueMap[provider.id] || { name: provider.name, count: 0, reasons: {}, severe: false }
    overviewIssueScore(score, entry)
    issueMap[provider.id] = entry
  })
  var issues = []
  Object.keys(issueMap).forEach(function (id) {
    var entry = issueMap[id]
    entry.reasonText = Object.keys(entry.reasons).join(' · ')
    issues.push(entry)
  })

  // 加载中 ≠ 没有站点：首答之前只给骨架，避免「从添加一个中转站开始」误导用户。
  var loading = (props && props.loading) || (props && props.api && props.api.loading)
  if (loading && providers.length === 0) {
    return h('div', null, h(Skeleton, { cards: 2, rows: 4 }))
  }

  if (providers.length === 0) {
    return h(
      'div',
      null,
      h(OverviewHeadline, { headline: state.headline }),
      h(Empty, {
        title: '从添加一个中转站开始',
        desc: '填上地址和一个 Key，同步模型列表，就能看到跨站比价。',
        action: h(
          'button',
          {
            type: 'button',
            className: 'primary',
            onClick: function () {
              if (props.onGoTab) props.onGoTab('monitor')
            },
          },
          Icon('plus', { size: 14 }),
          '新增站点',
        ),
      }),
    )
  }

  var rankingMap = {}
  ranking.forEach(function (row) {
    rankingMap[row.providerId] = row
  })

  var ordered = providers.slice().sort(function (a, b) {
    var ra = rankingMap[a.id] ? rankingMap[a.id].score : -1
    var rb = rankingMap[b.id] ? rankingMap[b.id].score : -1
    return (rb === null || rb === undefined ? -1 : rb) - (ra === null || ra === undefined ? -1 : ra)
  })

  var siteRows = ordered.map(function (provider) {
    var mine = offers.filter(function (offer) {
      return offer.providerId === provider.id
    })
    var healthy = mine.filter(function (offer) {
      return scores[offer.id] && scores[offer.id].routable
    }).length
    var hasQuota = typeof provider.quotaRemaining === 'number'
    var rank = rankingMap[provider.id]
    var issue = issueMap[provider.id]
    var dotClass = issue ? (issue.severe ? 'red' : 'yellow') : rank ? 'green' : 'gray'
    var sym = (provider.currency || 'CNY') === 'USD' ? '$' : '¥'

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
              (rank.avgQuality === null || rank.avgQuality === undefined ? '' : ' · 质量 ' + Number(rank.avgQuality).toFixed(2)) +
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
          node: hasQuota
            ? h('span', null, sym + fmtMoney(provider.quotaRemaining))
            : h('span', { style: { color: 'var(--faint)' } }, '未录入'),
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

  var summary = state.summary || {}

  return h(
    'div',
    null,
    h(OverviewHeadline, { headline: state.headline }),
    h(OverviewStats, { summary: summary, providerCount: providers.length, offerCount: offers.length }),
    h(OverviewIssues, { issues: issues }),
    h(
      'h3',
      { className: 'section-title' },
      h('span', { className: 's-icon' }, Icon('table', { size: 14 })),
      '站点速览',
      h(
        'a',
        {
          className: 'link',
          onClick: function () {
            if (props.onGoTab) props.onGoTab('monitor')
          },
        },
        '全部站点 →',
      ),
    ),
    h(Table, {
      heads: ['站点', { label: '长期评分', num: true }, { label: '模型', num: true }, { label: '健康供给', num: true }, { label: '余额', num: true }, { label: 'Key', num: true }],
      rows: siteRows,
    }),
  )
}

// 兼容旧名字（scripts/check.mjs 里仍按 OverviewTab 冒烟）

function OverviewTab(props) {
  return OverviewView(props)
}

    // ── part: 10-monitor.js ──
// ── 站点（移植网页版 renderMonitor：KPI → 余额概览 → 实时流量 → 站点卡网格 → 告警/排名 → 路由明细）──
// 数据源是宿主新通道 GET /api/manage-api/monitor?days=N（转 daemon 的 /api/monitor 产物：余额曲线 /
// 站点账单花费 / 告警 / 公告 / 同步记录）。站点卡网格仍读 /api/state 快照（那是每张卡自己的用量口径，
// 网页版也是分开的）。class 名与文案尽量和网页版 1:1。

var MONITOR_PAGE_SIZE = 9
var MONITOR_CHART_WINDOWS = [7, 14, 30]
var MONITOR_FX_FALLBACK = 7.2

// 网页版 SPEND_RANGES：真实花费卡的三个时间段（今天 / 本周 / 本月）
var MONITOR_SPEND_RANGES = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// 网页版 SERIES_COLORS：站点胶囊与堆叠柱的取色顺序（和 theme.js 里的 .series-N 一一对应）
var MONITOR_SERIES_COLORS = [
  'hsl(226 55% 52%)', 'hsl(18 60% 52%)', 'hsl(166 45% 38%)', 'hsl(268 42% 56%)',
  'hsl(340 48% 55%)', 'hsl(43 65% 45%)', 'hsl(200 50% 45%)', 'hsl(100 30% 42%)',
]

// ── 数值 / 时间 ───────────────────────────────────────────────

/** null / '' / 非数字一律当「没有数据」，不能变成 0。 */
function monitorNum(value) {
  if (value === null || value === undefined || value === '') return null
  var n = typeof value === 'number' ? value : Number(value)
  return isFinite(n) ? n : null
}

function monitorTs(ts) {
  if (typeof ts === 'number') return isFinite(ts) ? ts : 0
  var t = Date.parse(String(ts || ''))
  return isFinite(t) ? t : 0
}

function monitorAgo(ts) {
  var t = monitorTs(ts)
  if (!t) return ''
  var m = Math.max(0, Math.floor((Date.now() - t) / 60000))
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  var hr = Math.floor(m / 60)
  if (hr < 24) return hr + ' 小时前'
  var d = Math.floor(hr / 24)
  return d < 30 ? d + ' 天前' : Math.floor(d / 30) + ' 个月前'
}

function monitorStamp(ts) {
  var t = monitorTs(ts)
  if (!t) return '—'
  var d = new Date(t)
  var p = function (v) { return v < 10 ? '0' + v : String(v) }
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function monitorMs(value) {
  var n = monitorNum(value)
  if (n === null || n <= 0) return '—'
  if (n < 1000) return Math.round(n) + 'ms'
  var s = n / 1000
  return (s < 10 ? s.toFixed(1) : String(Math.round(s))) + 's'
}

/** 0..1 → 百分比 */
function monitorPct(value) {
  var n = monitorNum(value)
  return n === null ? '—' : (n * 100).toFixed(1) + '%'
}

function monitorMoney(value) {
  var n = monitorNum(value)
  return n === null ? '—' : fmtMoney(n)
}

function monitorTokens(value) {
  var n = monitorNum(value)
  return n === null ? '—' : n >= 10000 ? fmtCompact(n) : fmtInt(n)
}

/** 美元 → 人民币：settings.fxUsdCny，其次 settings.fx.USD，最后 7.2 */
function monitorFx(settings) {
  var s = settings || {}
  var direct = monitorNum(s.fxUsdCny)
  if (direct && direct > 0) return direct
  if (s.fx && typeof s.fx === 'object') return monitorNum(s.fx.USD) || monitorNum(s.fx.usd) || MONITOR_FX_FALLBACK
  return MONITOR_FX_FALLBACK
}

/** 站点余额折成人民币；没有余额数据返回 null（不能拿 0 冒充）。 */
function monitorCnyOf(provider, fx) {
  var p = provider || {}
  var q = monitorNum(p.quotaRemaining)
  if (q === null) return null
  var cur = String(p.currency || 'USD').toUpperCase()
  return cur === 'CNY' || cur === 'RMB' ? q : q * (fx || MONITOR_FX_FALLBACK)
}

/** 网页版 money()：不带符号——>=100 取整、>=1 两位、其余三位，没有数据给「—」。 */
function monitorMoneyShort(value) {
  var n = monitorNum(value)
  if (n === null) return '—'
  var abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

/** 网页版 priceSym() + money()：插件统一按人民币显示（不做 displayCurrency 切换）。 */
function monitorPriceText(cny) {
  return '¥' + monitorMoneyShort(cny)
}

function monitorTimeOnly(ts) {
  var t = monitorTs(ts)
  if (!t) return ''
  var d = new Date(t)
  var p = function (v) { return v < 10 ? '0' + v : String(v) }
  return p(d.getHours()) + ':' + p(d.getMinutes())
}

/** 网页版 siteUnitPriceForTotal()：站点账单金额按「1 单位值多少人民币」换算，默认 1。 */
function monitorUnitPrice(settings) {
  var n = monitorNum((settings || {}).defaultUnitPrice)
  return n !== null && n > 0 ? n : 1
}

/** 网页版 latestSiteFetchedAt()：所有站点里最晚一次读到账单的时间（字符串比较即可）。 */
function monitorLatestSiteFetchedAt(data) {
  var by = (data && data.siteSpend && data.siteSpend.byProvider) || {}
  var latest = ''
  Object.keys(by).forEach(function (pid) {
    var at = String((by[pid] && by[pid].todayFetchedAt) || '')
    if (at > latest) latest = at
  })
  return latest
}

/** SVG 要当字符串塞进 DOM，站点名里的 & / < 得先转义。 */
function monitorEsc(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 数据整形 ──────────────────────────────────────────────────

function monitorDayKeys(usage) {
  var keys = Object.keys((usage && usage.byDay) || {})
  if (keys.length === 0 && usage && Array.isArray(usage.days)) keys = usage.days.slice()
  return keys.sort()
}

/** 取最后 N 天的逐日序列；整段没数据时返回空数组，由调用方兜底。 */
function monitorDaySeries(usage, days) {
  var byDay = (usage && usage.byDay) || {}
  var keys = monitorDayKeys(usage)
  if (keys.length === 0) return []
  return keys.slice(Math.max(0, keys.length - days)).map(function (day) {
    var s = byDay[day] || {}
    return {
      day: String(day), requests: monitorNum(s.requests) || 0, ttft: monitorNum(s.avgTtftMs) || 0,
      input: monitorNum(s.input) || 0, output: monitorNum(s.output) || 0, cached: monitorNum(s.cached) || 0,
    }
  })
}

/** 每个站点一份视图：Key、供给、已定价数、分组倍率、折人民币余额。 */
function monitorBuildViews(state) {
  var fx = monitorFx(state.settings)
  var credBy = {}
  var offerBy = {}
  ;(Array.isArray(state.credentials) ? state.credentials : []).forEach(function (c) {
    if (c && c.providerId) (credBy[c.providerId] = credBy[c.providerId] || []).push(c)
  })
  ;(Array.isArray(state.offers) ? state.offers : []).forEach(function (o) {
    if (o && o.providerId) (offerBy[o.providerId] = offerBy[o.providerId] || []).push(o)
  })
  var providers = Array.isArray(state.providers) ? state.providers : []
  return providers.map(function (p) {
    var offs = offerBy[p.id] || []
    var priced = 0
    var groups = []
    var seen = {}
    offs.forEach(function (o) {
      if (monitorNum(o.inPrice) !== null || monitorNum(o.outPrice) !== null) priced += 1
      var label = String(o.group || '').trim() || '默认分组'
      if (seen[label]) return
      seen[label] = true
      var ratio = monitorNum(o.ratio)
      groups.push({ key: label, label: label, ratio: ratio === null ? monitorNum(o.siteRatio) : ratio })
    })
    groups.sort(function (a, b) { return (a.ratio || 0) - (b.ratio || 0) })
    return { provider: p, credentials: credBy[p.id] || [], priced: priced, total: offs.length, groups: groups, cny: monitorCnyOf(p, fx) }
  })
}

/** 告警由快照派生：令牌失效 / 余额低于阈值 / 已暂停 / 最近路由失败。 */
function monitorBuildAlerts(state, views) {
  var settings = state.settings || {}
  var fx = monitorFx(settings)
  var warnCny = monitorNum(settings.balanceWarnCny)
  var warnUsd = monitorNum(settings.balanceWarnUsd)
  var limit = warnCny !== null ? warnCny : warnUsd !== null ? warnUsd * fx : null
  var items = []
  views.forEach(function (view) {
    var p = view.provider
    var name = p.name || p.id
    if (p.tokenStatus === 'invalid') {
      items.push({
        key: 'tok:' + p.id, level: 'red', title: name + ' 的令牌已失效',
        detail: p.tokenStatusMessage || '站点返回鉴权失败，重新填一次后台令牌就会恢复采集。',
        meta: name + ' · ' + (monitorAgo(p.tokenStatusAt || p.updatedAt) || '刚刚'),
        at: monitorTs(p.tokenStatusAt || p.updatedAt),
      })
    }
    if (limit !== null && view.cny !== null && view.cny < limit) {
      items.push({
        key: 'bal:' + p.id, level: 'yellow', title: name + ' 余额低于阈值',
        detail: '剩余 ' + monitorMoney(view.cny) + '，阈值 ' + monitorMoney(limit) + '。',
        meta: name + ' · ' + (monitorAgo(p.quotaUpdatedAt) || '还没同步过'), at: monitorTs(p.quotaUpdatedAt),
      })
    }
    if (p.paused) {
      items.push({
        key: 'pause:' + p.id, level: 'yellow', title: name + ' 已暂停',
        detail: '暂停后不接新请求、不跑探针，也不进比价和决策。',
        meta: name + ' · 手动暂停', at: monitorTs(p.updatedAt),
      })
    }
  })
  ;(Array.isArray(state.routing) ? state.routing : []).slice(0, 12).forEach(function (r, i) {
    if (!r || r.outcome === 'ok') return
    var fails = Array.isArray(r.failures) ? r.failures : []
    items.push({
      key: 'route:' + (r.id || i), level: 'red', title: '路由失败：' + (r.model || '未知模型'),
      detail: fails.length ? String(fails[0].error || fails[0].reason || '') || '所有候选站点都没打通。' : '所有候选站点都没打通，看一眼探针和令牌。',
      meta: (r.chosenProviderName || '未选中站点') + ' · ' + (monitorAgo(r.ts) || '刚刚'), at: monitorTs(r.ts),
    })
  })
  return items.sort(function (a, b) { return b.at - a.at })
}

/** 同步设置面板的初始值（settings 变化后也用它回填）。 */
function monitorSyncForm(settings) {
  var s = settings || {}
  var fill = function (v, fallback) { var n = monitorNum(v); return n === null ? fallback : String(n) }
  return {
    interval: fill(s.monitorIntervalMinutes, '30'),
    warn: fill(s.balanceWarnUsd, '1.5'),
    price: fill(s.defaultUnitPrice, ''),
  }
}

// ── 网页版独有图标（ICONS 表里没有的，就地内联）─────────────────

function monitorSvg(size, paths) {
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  }, paths.map(function (d, i) { return h('path', { key: 'p' + i, d: d }) }))
}

function monitorPauseIcon(size) {
  return h('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', stroke: 'none', 'aria-hidden': 'true',
  }, h('rect', { x: 7, y: 5, width: 3.5, height: 14, rx: 1 }), h('rect', { x: 13.5, y: 5, width: 3.5, height: 14, rx: 1 }))
}

function monitorLoginIcon(size) { return monitorSvg(size, ['M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', 'M15 8l4 4-4 4', 'M19 12H9']) }
function monitorDownloadIcon(size) { return monitorSvg(size, ['M12 4v10', 'M8 10l4 4 4-4', 'M5 19h14']) }

// ── KPI ──────────────────────────────────────────────────────

/**
 * 一张 KPI 卡。item 里的 k / v 是 React 节点（真实花费卡要塞时间段按钮），
 * hint 走 title，wrap 对应网页版的 sub--wrap。
 */
function monitorKpiCard(key, item) {
  var it = item || {}
  return h('div', { key: key, className: 'stat' },
    h('div', { className: 'stat-main' },
      h('div', { className: 'k', title: it.hint || '' }, it.k || ''),
      h('div', { className: 'v' }, it.v === undefined || it.v === null ? '—' : it.v),
      h('div', { className: 'sub' + (it.wrap ? ' sub--wrap' : '') }, it.sub || '')),
    h('div', { className: 'stat-icon ' + (it.tint || 'tint-muted') }, Icon(it.ic || 'info', { size: 18 })))
}

/**
 * 网页版 spendStat(range)：真实花费只认站点自己的账单（siteSpend），不是估算口径。
 * 时间段按钮只改上层状态，不重新拉数据。
 */
function monitorSpendKpi(data, settings, range, onRange) {
  var siteSpend = (data && data.siteSpend) || {}
  var site = siteSpend[range] || null
  var siteCount = site ? monitorNum(site.providers) : null
  var hasSite = siteCount !== null && siteCount > 0
  var actualCny = hasSite ? (monitorNum(site.actual) || 0) * monitorUnitPrice(settings) : null

  var label = '今天'
  MONITOR_SPEND_RANGES.forEach(function (item) { if (item.key === range) label = item.label })

  var seg = h('span', { className: 'spend-range' }, MONITOR_SPEND_RANGES.map(function (item) {
    return h('button', {
      key: 'spend-' + item.key, type: 'button', className: item.key === range ? 'is-on' : '',
      onClick: function () { if (typeof onRange === 'function') onRange(item.key) },
    }, item.label)
  }))

  var asOf = ''
  if (range === 'today') {
    var timeText = monitorTimeOnly(monitorLatestSiteFetchedAt(data))
    if (timeText) asOf = '截至 ' + timeText
  }
  var truncated = range === 'today' && !!siteSpend.anyTruncated
  var sub = [
    hasSite ? siteCount + ' 个站点账单' : '站点未提供账单接口或令牌无效',
    asOf,
    truncated ? '有明细未拉全' : '',
  ].filter(function (part) { return !!part }).join(' · ')

  return {
    k: [h('span', { key: 'k-em', className: 'k-em' }, '真实花费'), ' · ' + label],
    v: [
      hasSite
        ? h('b', { key: 'amount', className: 'spend-actual' }, monitorPriceText(actualCny))
        : h('b', { key: 'amount', className: 'spend-actual spend-muted' }, '读不到账单'),
      h('span', { key: 'range-row', className: 'spend-range-row' }, seg),
    ],
    sub: sub,
    wrap: true,
    ic: 'receipt',
    tint: 'tint-warn',
    hint: '站点账单接口读到的真实扣费 | 按「默认充值汇率」换算成人民币 | 只有「今天」会标未拉全的明细 | 读不到账单时先检查站点令牌',
  }
}

// ── 余额概览（网页版 monitorChartSvg + chartCard 的移植）─────────

/** 图表几何：和网页版 760×240 / 54 边距保持一致。 */
var MONITOR_CHART_W = 760
var MONITOR_CHART_H = 240
var MONITOR_CHART_PAD_L = 54
var MONITOR_CHART_PAD_R = 54
var MONITOR_CHART_PAD_T = 14
var MONITOR_CHART_PAD_B = 26

/** 第 i 天的横坐标；只有一天时居中。 */
function monitorChartX(i, n) {
  var innerW = MONITOR_CHART_W - MONITOR_CHART_PAD_L - MONITOR_CHART_PAD_R
  return MONITOR_CHART_PAD_L + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
}

/** 折线的一段（至少两个点才画得出来）。 */
function monitorChartPath(points) {
  if (!points || points.length < 2) return ''
  return '<path class="line" d="' + points.map(function (p, idx) {
    return (idx === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)
  }).join(' ') + '"/>'
}

/**
 * 余额折线 + 各站花费堆叠柱。网页版 monitorChartSvg() 的 1:1 移植，只是返回字符串
 * （挂到 dangerouslySetInnerHTML 上）——170 行 SVG 用 h() 重写一遍可读性反而更差。
 *
 * options: { selected, providerIds, colorOf, seriesClassOf, fx }
 */
function monitorChartSvg(balanceSeries, spendSeries, options) {
  var bal = Array.isArray(balanceSeries) ? balanceSeries : []
  var spend = Array.isArray(spendSeries) ? spendSeries : []
  var opt = options || {}
  var selected = opt.selected || 'ALL'
  var providerIds = Array.isArray(opt.providerIds) ? opt.providerIds : []
  var fx = monitorNum(opt.fx) || MONITOR_FX_FALLBACK
  var colorOf = typeof opt.colorOf === 'function'
    ? opt.colorOf
    : function () { return MONITOR_SERIES_COLORS[0] }
  var isAll = selected === 'ALL'
  var accent = isAll ? 'var(--accent)' : colorOf(selected)
  var W = MONITOR_CHART_W
  var H = MONITOR_CHART_H
  var padL = MONITOR_CHART_PAD_L
  var padR = MONITOR_CHART_PAD_R
  var padT = MONITOR_CHART_PAD_T
  var padB = MONITOR_CHART_PAD_B
  var innerW = W - padL - padR
  var innerH = H - padT - padB
  var n = Math.max(bal.length, spend.length)
  if (n === 0) return ''
  var i

  // 余额序列：全部站点用 total（已折人民币），单站用 perProvider × 汇率
  var balVals = []
  for (i = 0; i < n; i += 1) {
    var brow = bal[i] || {}
    if (isAll) {
      balVals.push(typeof brow.total === 'number' ? brow.total : null)
    } else {
      var per = (brow.perProvider || {})[selected]
      balVals.push(typeof per === 'number' ? per * fx : null)
    }
  }
  var known = balVals.filter(function (v) { return v !== null })

  var hasSpend = false
  for (i = 0; i < n && !hasSpend; i += 1) {
    var srow = spend[i] || {}
    var by = srow.byProvider || {}
    if (isAll) {
      for (var k = 0; k < providerIds.length; k += 1) {
        if ((monitorNum(by[providerIds[k]]) || 0) > 0) { hasSpend = true; break }
      }
    } else if ((monitorNum(by[selected]) || 0) > 0) {
      hasSpend = true
    }
  }
  // 余额和花费全空时不画图，交给调用方出 .empty
  if (known.length === 0 && !hasSpend) return ''

  var min = known.length ? Math.min.apply(null, known) : 0
  var max = known.length ? Math.max.apply(null, known) : 1
  if (min === max) { min = Math.max(0, min - 1); max += 1 }
  max += (max - min) * 0.15

  var spendVals = []
  for (i = 0; i < n; i += 1) {
    var spRow = spend[i] || {}
    if (isAll) {
      var sum = 0
      providerIds.forEach(function (pid) { sum += monitorNum((spRow.byProvider || {})[pid]) || 0 })
      spendVals.push(sum)
    } else {
      spendVals.push(monitorNum((spRow.byProvider || {})[selected]) || 0)
    }
  }
  var spendMax = Math.max.apply(null, [0.01].concat(spendVals)) * 1.15

  var x = function (idx) { return monitorChartX(idx, n) }
  var yBal = function (v) { return padT + innerH * (1 - (v - min) / (max - min || 1)) }
  var slot = innerW / Math.max(n, 1)
  var barW = Math.max(3, Math.min(24, slot * 0.5))
  var parts = []

  // 网格 + 左右两侧刻度（左余额、右花费，都是人民币）
  ;[0, 1, 2, 3].forEach(function (step) {
    var ratio = step / 3
    var y = padT + innerH * ratio
    parts.push('<line class="grid-line" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>')
    parts.push('<text class="axis-label" x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' +
      '¥' + monitorEsc(monitorMoneyShort(max - (max - min) * ratio)) + '</text>')
    parts.push('<text class="axis-label" x="' + (W - padR + 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="start">' +
      '¥' + monitorEsc(monitorMoneyShort(spendMax * (1 - ratio))) + '</text>')
  })

  // 柱：全部站点时按站堆叠，选中单站时只有一根淡色柱
  for (i = 0; i < n; i += 1) {
    var left = (x(i) - barW / 2).toFixed(1)
    if (isAll) {
      var stackRow = spend[i] || {}
      var cum = 0
      providerIds.forEach(function (pid) {
        var v = monitorNum((stackRow.byProvider || {})[pid]) || 0
        if (v <= 0) return
        var hgt = Math.max(0.8, (v / spendMax) * innerH)
        var top = padT + innerH - ((cum + v) / spendMax) * innerH
        parts.push('<rect x="' + left + '" y="' + top.toFixed(1) + '" width="' + barW.toFixed(1) +
          '" height="' + hgt.toFixed(1) + '" fill="' + monitorEsc(colorOf(pid)) + '" opacity="0.85"/>')
        cum += v
      })
    } else if (spendVals[i] > 0) {
      var h2 = Math.max(1, (spendVals[i] / spendMax) * innerH)
      parts.push('<rect x="' + left + '" y="' + (padT + innerH - h2).toFixed(1) + '" width="' + barW.toFixed(1) +
        '" height="' + h2.toFixed(1) + '" fill="' + monitorEsc(accent) + '" opacity="0.3"/>')
    }
  }

  // 折线：中间断档（那天没采到余额）要断开，不能连成一条假线
  var seg = []
  balVals.forEach(function (v, idx) {
    if (v === null) {
      if (seg.length) { parts.push(monitorChartPath(seg)); seg = [] }
      return
    }
    seg.push([x(idx), yBal(v)])
  })
  if (seg.length) parts.push(monitorChartPath(seg))

  var dots = []
  balVals.forEach(function (v, idx) {
    if (v === null) return
    dots.push('<circle cx="' + x(idx).toFixed(1) + '" cy="' + yBal(v).toFixed(1) + '" r="2.6"/>')
  })
  if (dots.length) parts.push('<g class="dots">' + dots.join('') + '</g>')

  // 日标签：太密就抽稀，最后一天永远显示
  var labelStep = Math.max(1, Math.ceil(n / 7))
  for (i = 0; i < n; i += 1) {
    var keep = (i > 0 && i % labelStep === 0) || (i === n - 1 && n > 1)
    if (!keep) continue
    var dayRow = bal[i] || spend[i] || {}
    var day = String(dayRow.day || '')
    if (!day) continue
    parts.push('<text class="axis-label" x="' + x(i).toFixed(1) + '" y="' + (H - 8) +
      '" text-anchor="' + (i === n - 1 ? 'end' : 'middle') + '">' + monitorEsc(day.slice(5)) + '</text>')
  }

  // 每列一块透明命中区，hover 靠 data-chart-day 定位
  for (i = 0; i < n; i += 1) {
    parts.push('<rect x="' + (x(i) - slot / 2).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) +
      '" height="' + innerH + '" fill="transparent" pointer-events="all" data-chart-day="' + i + '"/>')
  }

  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="余额与花费趋势"' +
    ' style="--chart-accent:' + monitorEsc(accent) + '">' + parts.join('') + '</svg>'
}

/** 「余额概览」卡片：7/14/30 天、站点胶囊、hover 明细。 */
function MonitorChartCard(props) {
  var data = props.data || {}
  var days = props.days || 7
  var balanceSeries = Array.isArray(data.balanceSeries) ? data.balanceSeries : []
  var spendSeries = Array.isArray(data.spendSeries) ? data.spendSeries : []
  var rows = Array.isArray(data.balanceByProvider) ? data.balanceByProvider : []
  var fx = monitorFx(props.settings)
  var hoverPair = React.useState(-1)
  var hover = hoverPair[0]
  var setHover = hoverPair[1]

  // 有余额或有花费的站点才进图例与胶囊（否则一排 0 线只会误导）
  var chartProviders = []
  var nameOf = {}
  rows.forEach(function (row) {
    if (!row || row.providerId === undefined || row.providerId === null) return
    nameOf[row.providerId] = row.name || String(row.providerId)
    if (row.balance !== null && row.balance !== undefined) { chartProviders.push(row.providerId); return }
    var spent = spendSeries.some(function (d) {
      return (monitorNum(((d && d.byProvider) || {})[row.providerId]) || 0) > 0
    })
    if (spent) chartProviders.push(row.providerId)
  })

  var colorOf = function (pid) {
    var idx = Math.max(0, chartProviders.indexOf(pid))
    return MONITOR_SERIES_COLORS[idx % MONITOR_SERIES_COLORS.length]
  }
  var seriesClassOf = function (pid) {
    var idx = Math.max(0, chartProviders.indexOf(pid))
    return 'series-' + (idx % MONITOR_SERIES_COLORS.length + 1)
  }

  var selected = props.selected || 'ALL'
  if (selected !== 'ALL' && chartProviders.indexOf(selected) < 0) selected = 'ALL'

  var n = Math.max(balanceSeries.length, spendSeries.length)
  var svg = monitorChartSvg(balanceSeries, spendSeries, {
    selected: selected, providerIds: chartProviders, colorOf: colorOf, seriesClassOf: seriesClassOf, fx: fx,
  })

  var balAt = function (idx) {
    var row = balanceSeries[idx] || {}
    if (selected === 'ALL') return typeof row.total === 'number' ? row.total : null
    var v = (row.perProvider || {})[selected]
    return typeof v === 'number' ? v * fx : null
  }
  var spendAt = function (idx, pid) {
    return monitorNum((((spendSeries[idx] || {}).byProvider) || {})[pid]) || 0
  }
  var spendSum = function (idx) {
    if (selected !== 'ALL') return spendAt(idx, selected)
    var sum = 0
    chartProviders.forEach(function (pid) { sum += spendAt(idx, pid) })
    return sum
  }
  var dayAt = function (idx) {
    var row = balanceSeries[idx] || spendSeries[idx] || {}
    return String(row.day || '')
  }

  var tipRows = null
  if (hover >= 0 && hover < n) {
    var balValue = balAt(hover)
    tipRows = [
      h('div', { key: 'head', className: 'chart-tip-head' },
        dayAt(hover) + (selected === 'ALL' ? '' : ' · ' + (nameOf[selected] || selected))),
      h('div', { key: 'bal', className: 'chart-tip-row' },
        h('span', null, selected === 'ALL' ? '余额合计' : '余额'),
        h('b', null, balValue === null ? '—' : monitorPriceText(balValue))),
    ]
    if (selected === 'ALL') {
      var ranked = chartProviders.map(function (pid) {
        return { id: pid, value: spendAt(hover, pid) }
      }).filter(function (row) { return row.value > 0 }).sort(function (a, b) { return b.value - a.value })
      if (ranked.length) {
        tipRows.push(h('div', { key: 'sep1', className: 'chart-tip-sep' }))
        ranked.forEach(function (row) {
          tipRows.push(h('div', { key: 'site-' + row.id, className: 'chart-tip-row' },
            h('span', null, h('i', { className: 'chart-tip-dot', style: { background: colorOf(row.id) } }),
              nameOf[row.id] || String(row.id)),
            h('b', null, monitorPriceText(row.value))))
        })
        tipRows.push(h('div', { key: 'sep2', className: 'chart-tip-sep' }))
        tipRows.push(h('div', { key: 'sum', className: 'chart-tip-row' },
          h('span', null, '花费合计'), h('b', null, monitorPriceText(spendSum(hover)))))
      }
    } else {
      tipRows.push(h('div', { key: 'spend', className: 'chart-tip-row' },
        h('span', null, '花费'), h('b', null, monitorPriceText(spendSum(hover)))))
    }
  }

  var tip = h('div', {
    className: 'chart-tip' + (tipRows ? ' is-on' : ''),
    role: 'tooltip',
    style: tipRows ? { left: (monitorChartX(hover, n) / MONITOR_CHART_W) * 100 + '%' } : undefined,
  }, tipRows)

  var seg = h('span', { className: 'seg' }, MONITOR_CHART_WINDOWS.map(function (w) {
    return h('button', {
      key: 'days-' + w, type: 'button', className: days === w ? 'active' : '',
      onClick: function () { setHover(-1); if (typeof props.onDays === 'function') props.onDays(w) },
    }, w + ' 天')
  }))

  var chips = h('div', { className: 'monitor-chips' },
    h('button', {
      key: 'chip-all', type: 'button', className: 'monitor-chip' + (selected === 'ALL' ? ' is-on' : ''),
      onClick: function () { setHover(-1); if (typeof props.onSelect === 'function') props.onSelect('ALL') },
    }, h('span', { className: 'dot' }), '全部站点'),
    chartProviders.map(function (pid) {
      return h('button', {
        key: 'chip-' + pid, type: 'button',
        className: 'monitor-chip ' + seriesClassOf(pid) + (selected === pid ? ' is-on' : ''),
        onClick: function () { setHover(-1); if (typeof props.onSelect === 'function') props.onSelect(pid) },
      }, h('span', { className: 'dot' }), nameOf[pid] || String(pid))
    }))

  var body = svg
    ? h('div', {
        className: 'chart-wrap',
        onMouseMove: function (e) {
          var target = e && e.target
          var raw = target && target.getAttribute ? target.getAttribute('data-chart-day') : null
          if (raw === null || raw === undefined || raw === '') return
          var idx = Number(raw)
          if (isFinite(idx) && idx >= 0 && idx < n && idx !== hover) setHover(idx)
        },
        onMouseLeave: function () { setHover(-1) },
      },
      h('div', { dangerouslySetInnerHTML: { __html: svg } }),
      tip)
    : h('div', { className: 'empty small' }, h('p', null, '还没有同步到余额。点右上角「立即同步」跑一轮。'))

  return h('div', { className: 'card monitor-chart-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '余额概览'), h('div', { className: 'meta' }, '余额合计与各站花费，按天')),
      seg),
    body,
    h('div', { className: 'chart-legend' },
      h('span', null, h('i', { className: 'legend-line' }),
        selected === 'ALL' ? '余额合计（¥，其他币种按汇率折算）' : '该站余额（¥）'),
      h('span', null, h('i', { className: 'legend-bar' }),
        selected === 'ALL' ? '各站花费（堆叠）' : '该站每日花费')),
    chips)
}

// ── 实时流量（最近路由决策）────────────────────────────────────

function MonitorFlowCard(props) {
  var list = (props.routing || []).slice(0, 14)
  var body = list.length === 0
    ? h('div', { className: 'empty small' }, h('p', null, '还没有路由记录。经 ManageAPI 网关转发的请求会实时出现在这里。'))
    : h('div', { className: 'monitor-flow-list' }, list.map(function (r, i) {
        var ok = r.outcome === 'ok'
        return h('div', { key: r.id || 'route' + i, className: 'monitor-flow-row' },
          h('div', { className: 'monitor-flow-top' },
            h('span', { className: 'monitor-flow-key', title: r.model || '' }, r.model || '未知模型'),
            h('span', { className: 'badge ' + (ok ? 'ok' : 'danger') }, ok ? '成功' : '失败')),
          h('div', { className: 'monitor-flow-meta' },
            h('span', null, r.chosenProviderName || '未选中站点'),
            h('span', null, monitorMs(monitorNum(r.ttftMs) !== null ? r.ttftMs : r.latencyMs)),
            monitorNum(r.attempts) > 1 ? h('span', null, r.attempts + ' 次尝试') : null,
            h('span', null, monitorAgo(r.ts) || '刚刚')))
      }))

  return h('div', { className: 'card monitor-flow-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '实时流量'), h('div', { className: 'meta' }, '最近 ' + list.length + ' 条路由决策')),
      h('span', { className: 'hint', style: { margin: 0 } }, '模型 → 实际选中的站点')),
    body)
}

// ── 告警动态 / 站点排名 ───────────────────────────────────────

function MonitorAlertsCard(props) {
  // 优先用 daemon 的告警流水（有已读状态）；拿不到时退回由快照派生的本地提醒
  var fromDaemon = Array.isArray(props.monitorAlerts)
  var rows = fromDaemon && props.monitorAlerts.length ? props.monitorAlerts : (props.alerts || []).slice(0, 40)
  var unread = monitorNum(props.unread)
  var body = rows.length === 0
    ? h('div', { className: 'empty small' },
      h('p', null, fromDaemon
        ? '还没有告警。余额低于阈值、倍率变化、同步失败都会记在这里。'
        : '没有需要处理的告警，余额、令牌和路由都正常。'))
    : h('div', { className: 'monitor-feed-scroll' }, rows.slice(0, 40).map(function (a) {
        var level = a.level === 'danger' ? 'red' : 'yellow'
        var meta = [a.providerName, monitorAgo(a.at) || '刚刚'].filter(function (part) { return !!part }).join(' · ')
        return h('div', { key: a.id || a.key, className: 'monitor-feed-row' + (a.readAt ? ' read' : '') },
          h('span', { className: 'dot ' + level }),
          h('div', { className: 'monitor-feed-body' },
            h('div', { className: 'monitor-feed-title' }, a.title),
            a.detail ? h('div', { className: 'monitor-feed-detail' }, a.detail) : null,
            h('div', { className: 'monitor-feed-meta' }, meta)))
      }))

  var readDisabled = props.busy === 'alerts' || (unread !== null && unread <= 0)
  return h('div', { className: 'card monitor-feed-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '告警动态'),
        h('div', { className: 'meta' }, unread === null
          ? '由当前快照派生：令牌 / 余额 / 暂停 / 路由失败'
          : '余额低于阈值、倍率变化、同步失败都会记在这里')),
      h('div', { className: 'monitor-head-actions' },
        h('span', { className: 'hint', style: { margin: 0 } },
          unread === null ? rows.length + ' 条' : unread + ' 条未读'),
        h('button', {
          type: 'button', className: 'ghost tiny', disabled: readDisabled,
          title: readDisabled ? '没有未读告警' : '把 daemon 里所有未读告警标成已读',
          onClick: function () { if (!readDisabled && typeof props.onRead === 'function') props.onRead() },
        }, '全部已读'))),
    body)
}

function MonitorRankingCard(props) {
  var rows = (props.ranking || []).slice(0, 20)
  var body = rows.length === 0
    ? h('div', { className: 'empty small' }, h('p', null, '还没有站点排名，跑一轮探针后按得分排序。'))
    : h('div', { className: 'monitor-feed-scroll' }, rows.map(function (r, i) {
        var score = monitorNum(r.score)
        var tone = score === null ? 'info' : score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'danger'
        return h('div', { key: r.providerId || 'rank' + i, className: 'monitor-flow-row' },
          h('div', { className: 'monitor-flow-top' },
            h('span', { className: 'monitor-flow-key', title: r.providerName || '' }, (i + 1) + '. ' + (r.providerName || r.providerId || '未知站点')),
            h('span', { className: 'badge ' + tone }, score === null ? '未评分' : score.toFixed(1))),
          h('div', { className: 'monitor-flow-meta' },
            h('span', null, '在线率 ' + monitorPct(r.uptime)),
            h('span', null, '平均首字 ' + monitorMs(r.avgTtft)),
            h('span', null, (monitorNum(r.modelCount) || 0) + ' 个模型'),
            h('span', null, (monitorNum(r.probes) || 0) + ' 次探针'),
            h('span', null, monitorAgo(r.lastAt) || '还没探过')))
      }))

  return h('div', { className: 'card monitor-feed-card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '站点排名'), h('div', { className: 'meta' }, '得分 / 在线率 / 首字，来自探针与流量样本')),
      h('span', { className: 'hint', style: { margin: 0 } }, (monitorNum(props.probeTotal) || 0) + ' 次探针')),
    body)
}

// ── 路由明细表 ────────────────────────────────────────────────

function MonitorRoutingTable(props) {
  var all = props.routing || []
  if (all.length === 0) {
    return h('div', { className: 'card' },
      h('div', { className: 'card-head' }, h('h3', null, '最近路由明细')),
      h('div', { className: 'empty small' }, h('p', null, '还没有路由记录。')))
  }
  return h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('h3', null, '最近路由明细'),
      h('span', { className: 'hint', style: { margin: 0 } }, '共 ' + all.length + ' 条')),
    h('div', { className: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, '时间'), h('th', null, '模型'), h('th', null, '选中站点'), h('th', null, '结果'),
        h('th', { className: 'num' }, '耗时'), h('th', { className: 'num' }, '首字'))),
      h('tbody', null, all.slice(0, 12).map(function (r, i) {
        var ok = r.outcome === 'ok'
        return h('tr', { key: r.id || 'row' + i },
          h('td', { className: 'mono' }, monitorStamp(r.ts)),
          h('td', null, r.model || '—'),
          h('td', null, r.chosenProviderName || '—'),
          h('td', null, h('span', { className: 'badge ' + (ok ? 'ok' : 'danger') }, ok ? '成功' : '失败')),
          h('td', { className: 'num' }, monitorMs(r.latencyMs)),
          h('td', { className: 'num' }, monitorMs(r.ttftMs)))
      })))),
    h('p', { className: 'hint' }, '同步只读站点公开 / 后台数据，不会改站点设置。'))
}

// ── 新增站点（POST /api/providers，再 POST /api/credentials）─────

function MonitorAddProvider(props) {
  var formPair = React.useState({ name: '', baseUrl: '', siteUrl: '', secret: '', kind: 'unknown' })
  var form = formPair[0]
  var setForm = formPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errPair = React.useState('')
  var err = errPair[0]
  var setErr = errPair[1]
  var inputStyle = { minWidth: '150px', flex: '1 1 180px' }

  /** 每个输入框共用一份样板 onChange，省掉五份重复的 setState。 */
  function input(key, placeholder, extra) {
    var p = {
      key: key, style: inputStyle, placeholder: placeholder, value: form[key],
      onChange: function (e) { var next = Object.assign({}, form); next[key] = e.target.value; setForm(next) },
    }
    Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k] })
    return h('input', p)
  }

  function submit() {
    if (busy) return
    if (!String(form.name).trim()) { setErr('站点名称不能为空'); return }
    if (!String(form.baseUrl).trim() && !String(form.siteUrl).trim()) { setErr('网站地址和 API 端点至少要填一个'); return }
    setErr('')
    setBusy(true)
    writeOp('POST', '/api/providers', {
      name: String(form.name).trim(), baseUrl: String(form.baseUrl).trim(),
      siteUrl: String(form.siteUrl).trim(), kind: form.kind || 'unknown',
    }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'HTTP ' + res.status)
      var created = res.summary && res.summary.provider
      var secret = String(form.secret).trim()
      if (!created || !created.id || !secret) return null
      return writeOp('POST', '/api/credentials', { providerId: created.id, label: '默认', secret: secret })
        .then(function (rk) {
          if (!rk.ok) throw new Error('站点建好了，但 Key 没存上：' + (rk.error || 'HTTP ' + rk.status))
          return null
        })
    }).then(function () {
      setBusy(false)
      setForm({ name: '', baseUrl: '', siteUrl: '', secret: '', kind: 'unknown' })
      if (props.onDone) props.onDone()
    }).catch(function (error) {
      setBusy(false)
      setErr((error && error.message) || String(error))
    })
  }

  return h('div', { className: 'card' },
    h('div', { className: 'card-head' },
      h('div', null, h('h3', null, '新增站点'), h('div', { className: 'meta' }, '填地址和一个 Key，保存后自动探测系别并拉模型列表')),
      h('button', { type: 'button', className: 'ghost tiny', onClick: props.onCancel }, '关闭')),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' } },
      input('name', '站点名称，例如「凌风」'),
      input('baseUrl', 'API 端点，例如 https://api.example.com/v1'),
      input('siteUrl', '网站地址（可选，卡片上的「打开站点」）'),
      h('select', {
        key: 'kind', style: { minWidth: '120px', flex: '0 0 auto' }, value: form.kind,
        title: '站点系别，留空由 daemon 自动探测',
        onChange: function (e) { var next = Object.assign({}, form); next.kind = e.target.value; setForm(next) },
      },
        h('option', { value: 'unknown' }, '自动识别'),
        h('option', { value: 'new-api' }, 'NewAPI'),
        h('option', { value: 'one-api' }, 'OneAPI'),
        h('option', { value: 'sub2api' }, 'Sub2API'),
        h('option', { value: 'vendor' }, '厂商直连')),
      input('secret', 'API Key（可选，填了立刻能同步）', { type: 'password' }),
      h('button', { key: 'save', type: 'button', className: 'primary', disabled: busy, onClick: submit }, busy ? '保存中…' : '保存站点')),
    err ? h('p', { className: 'hint', style: { color: 'var(--danger)' } }, err) : null,
    h('p', { className: 'hint' }, '只有站点名是必填；Key 可以之后再补，但没 Key 就同步不了模型。'))
}

// ── 站点卡（1:1 照 providersHtml）───────────────────────────────

function monitorSiteCard(view, ctx) {
  var p = view.provider
  var id = p.id
  var name = p.name || p.id
  var pane = ctx.panes[id] || ''
  var expanded = !!ctx.groupOpen[id]
  var groups = view.groups || []
  var moreGroups = Math.max(0, groups.length - 6)
  var hasToken = !!p.hasAdminToken
  var tokenBroken = p.tokenStatus === 'invalid'
  var openUrl = p.siteUrl || p.baseUrl || ''
  var kindLabel = KIND_LABEL[p.kind] || (p.kind === 'relay' ? '中转' : '')
  var freeCount = Array.isArray(p.freeModels) ? p.freeModels.length : 0
  var busyHere = String(ctx.busy || '').indexOf(id) >= 0
  var limit = ctx.limit

  function iconBtn(key, cls, title, icon, handler) {
    return h('button', { key: key, type: 'button', className: 'icon-btn ' + cls, title: title, disabled: busyHere, onClick: handler }, icon)
  }

  function act(key, icon, label, tip, handler, on) {
    return h('button', {
      key: key, type: 'button', className: on ? 'primary' : '', title: tip || label,
      disabled: busyHere && !on, onClick: handler,
    }, icon, label)
  }

  function actPost(key, icon, label, tip, path, okText) {
    return act(key, icon, label, tip, function () {
      ctx.run(key + ':' + id, okText, function () {
        return writeOp('POST', '/api/providers/' + encodeURIComponent(id) + path, {})
      })
    })
  }

  function confirmThen(text, okText, fn) {
    var ask = typeof window !== 'undefined' && window.confirm ? window.confirm : null
    if (ask && !ask(text)) return
    ctx.run('del:' + id, okText, fn)
  }

  var balanceTitle = monitorNum(p.quotaRemaining) === null
    ? '还没有余额数据：需要站点后台令牌'
    : '原始币种 ' + String(p.currency || 'USD') + ' ' + Number(p.quotaRemaining).toFixed(3) + '，按汇率折算成人民币'

  var statusNode
  if (limit === null) statusNode = h('span', { className: 'hint', style: { margin: 0 } }, '未设阈值')
  else if (view.cny === null) statusNode = h('span', { className: 'badge' }, '无余额数据')
  else if (view.cny < limit) statusNode = h('span', { className: 'badge warn' }, '低于阈值')
  else statusNode = h('span', { className: 'badge ok' }, '正常')

  var tokenNode = tokenBroken
    ? h('span', { className: 'badge danger', title: p.tokenStatusMessage || '' }, '已失效')
    : hasToken
      ? h('span', { className: 'badge ok', title: '尾号 ' + String(p.adminTokenTail || '----') }, '已填')
      : h('span', { className: 'badge' }, '未填')

  var keyPane = pane === 'keys' ? h('div', { className: 'prov-detail', 'data-pane': 'keys' },
    h('div', { className: 'keylist' }, view.credentials.length === 0
      ? h('div', { className: 'detail-line dim' }, '这个站还没有 Key。')
      : view.credentials.map(function (c) {
          return h('div', { key: c.id, className: 'detail-line', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('b', null, c.label || '默认'),
            h('span', { className: 'dim' }, '尾号 ' + (c.tail || '----')),
            c.group ? h('span', { className: 'dim', title: c.group }, '· ' + c.group) : null,
            h('button', {
              type: 'button', className: 'ghost tiny', style: { marginLeft: 'auto' }, title: '删除这把 Key',
              onClick: function () {
                confirmThen('删除 Key「' + (c.label || '默认') + '」？对应的模型供给会一起消失。', 'Key 已删除', function () {
                  return writeOp('DELETE', '/api/credentials/' + encodeURIComponent(c.id))
                })
              },
            }, '删除'))
        }))) : null

  var ratePane = pane === 'rates' ? h('div', { className: 'prov-detail', 'data-pane': 'rates' },
    h('div', { className: 'prov-groups' },
      h('div', { className: 'k' }, '站点公布的分组与倍率'),
      groups.length === 0
        ? h('span', { className: 'hint', style: { margin: 0 } }, '还没同步模型，读不到分组倍率。')
        : h('div', { className: 'prov-group-chips' }, groups.map(function (g) {
            return h('span', { key: 'full' + g.key, className: 'group-chip', title: g.label },
              monitorNum(g.ratio) === null ? '÷' : '×' + Number(g.ratio).toFixed(2),
              monitorNum(g.ratio) === null ? null : h('span', { className: 'chip-note' }, ' ' + g.label))
          })))) : null

  var loginPane = pane === 'login' ? h(MonitorLoginForm, { providerId: id, name: name, ctx: ctx }) : null

  return h('div', {
    key: id, className: 'card prov-card' + (p.paused ? ' is-paused' : ''),
    'data-provider': id, 'data-has-token': hasToken ? '1' : '0',
  },
    h('div', { className: 'prov-head' },
      h('div', { className: 'prov-id' },
        h('span', {
          className: 'dot ' + (tokenBroken ? 'red' : hasToken ? 'green' : ''),
          title: tokenBroken ? '令牌已失效' : hasToken ? '令牌可用' : '还没填后台令牌',
        }),
        h('b', { title: name }, name),
        openUrl ? h('a', {
          className: 'icon-btn prov-open', href: openUrl, target: '_blank', rel: 'noopener noreferrer', title: '打开站点',
          onClick: function (e) { e.stopPropagation() },
        }, Icon('external', { size: 13 })) : null,
        kindLabel ? h('span', { className: 'badge ' + (p.kind === 'vendor' ? 'kindchip-vendor' : 'kindchip-relay') }, kindLabel) : null,
        freeCount > 0 ? h('span', { className: 'badge prov-free', title: '免费模型' }, Icon('gift', { size: 11 }), '免费 ' + freeCount) : null,
        p.paused ? h('span', { className: 'badge warn' }, '已暂停') : null),
      h('div', { className: 'prov-head-right' },
        h('span', { className: 'hint', title: p.quotaUpdatedAt || '还没同步过' }, monitorAgo(p.quotaUpdatedAt) || '还没同步过'),
        iconBtn('pause', 'prov-pause', p.paused ? '恢复：重新接请求、跑探针、进比价' : '暂停：不接新请求、不探针、不进比价', monitorPauseIcon(13), function () {
          ctx.run((p.paused ? 'resume:' : 'pause:') + id, p.paused ? '已恢复' : '已暂停', function () {
            return writeOp('PATCH', '/api/providers/' + encodeURIComponent(id), { paused: !p.paused })
          })
        }),
        iconBtn('del', 'prov-del-icon', '删除站点', Icon('trash', { size: 13 }), function () {
          confirmThen('删除站点「' + name + '」？它的 Key 和模型列表会一起删掉，这个操作不能撤销。', '站点已删除', function () {
            return writeOp('DELETE', '/api/providers/' + encodeURIComponent(id))
          })
        }))),
    h('div', { className: 'prov-tiles' },
      h('div', null, h('div', { className: 'k' }, '余额'), h('b', { title: balanceTitle }, view.cny === null ? '—' : monitorMoney(view.cny))),
      h('div', null, h('div', { className: 'k' }, '已定价'), h('b', null, view.priced, h('span', { className: 'of' }, '/ ' + view.total))),
      h('div', null, h('div', { className: 'k' }, 'Key'), h('b', null, view.credentials.length, h('span', { className: 'of' }, '把')))),
    h('div', { className: 'prov-tiles prov-tiles--3' },
      h('div', null, h('div', { className: 'k' }, '阈值 · 状态'), h('b', null, statusNode)),
      h('div', null, h('div', { className: 'k' }, '充值汇率'), h('input', {
        className: 'unit-price', type: 'number', step: '0.01', min: '0',
        defaultValue: monitorNum(p.unitPrice) === null ? '' : String(p.unitPrice),
        title: '1 个站点货币单位值多少人民币，回车或失焦保存',
        onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur() },
        onBlur: function (event) {
          var raw = String(event.target.value || '').trim()
          var next = raw === '' ? null : monitorNum(raw)
          if (raw !== '' && (next === null || next <= 0)) {
            ctx.notify('充值汇率要是正数')
            event.target.value = monitorNum(p.unitPrice) === null ? '' : String(p.unitPrice)
            return
          }
          if (next === monitorNum(p.unitPrice)) return
          ctx.run('unit:' + id, '充值汇率已保存', function () {
            return writeOp('PATCH', '/api/providers/' + encodeURIComponent(id), { unitPrice: next })
          })
        },
      })),
      h('div', null, h('div', { className: 'k' }, '令牌'), h('b', null, tokenNode))),
    groups.length ? h('div', { className: 'prov-groups' },
      h('div', { className: 'k' }, '分组'),
      h('div', { className: 'prov-group-chips' },
        (expanded ? groups : groups.slice(0, 6)).map(function (g) {
          return h('span', { key: 'grp' + g.key, className: 'group-chip', title: g.label },
            monitorNum(g.ratio) === null ? g.label : '×' + Number(g.ratio).toFixed(2),
            monitorNum(g.ratio) === null ? null : h('span', { className: 'chip-note' }, ' ' + g.label))
        }),
        moreGroups > 0 ? h('button', {
          type: 'button', className: 'group-chip group-more', onClick: function () { ctx.toggleGroups(id) },
        }, expanded ? '收起' : '还有 ' + moreGroups + ' 个') : null)) : null,
    h('div', { className: 'prov-actions' },
      act('login', monitorLoginIcon(14), '账号登录', '用站点后台账号密码登录，自动获取令牌并识别系别', function () { ctx.togglePane(id, 'login') }, pane === 'login'),
      actPost('sync', Icon('refresh', { size: 14 }), '一键同步', '重新拉这个站的模型列表', '/sync', '已同步「' + name + '」'),
      act('keys', Icon('key', { size: 14 }), '密钥', '查看这个站的 Key', function () { ctx.togglePane(id, 'keys') }, pane === 'keys'),
      act('rates', Icon('columns', { size: 14 }), '分组倍率', '站点公布的分组与倍率', function () { ctx.togglePane(id, 'rates') }, pane === 'rates'),
      actPost('balance', Icon('wallet', { size: 14 }), '查余额', '重新读一次站点余额', '/balance', '已刷新「' + name + '」的余额'),
      actPost('usage', Icon('receipt', { size: 14 }), '用量核对', '核对站点侧用量与实际消耗', '/usage-check', '已核对「' + name + '」的用量'),
      h('button', {
        key: 'export', type: 'button', disabled: true,
        title: '宿主白名单没开放导出接口，先备份 daemon 的 data 目录',
      }, monitorDownloadIcon(14), '导出配置')),
    keyPane,
    ratePane,
    loginPane)
}

/**
 * 站点卡登录窗格：双协议登录（Sub2API / OneAPI·NewAPI），daemon 会顺带识别系别。
 * 409 needConfirm = 系别识别不出、登录会向站点发一次错误协议的失败登录——
 * 先向用户确认再带 confirmUnknown: true 重试（与网页版 #form-login 同流程）。
 */
function MonitorLoginForm(props) {
  var providerId = props.providerId
  var ctx = props.ctx
  var userPair = React.useState('')
  var user = userPair[0]
  var setUser = userPair[1]
  var passPair = React.useState('')
  var pass = passPair[0]
  var setPass = passPair[1]
  var busyPair = React.useState(false)
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var errPair = React.useState('')
  var err = errPair[0]
  var setErr = errPair[1]

  function errText(err) {
    return err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
  }

  function submit() {
    if (busy) return
    if (!user.trim() || !pass) {
      setErr('账号和密码都要填')
      return
    }
    setBusy(true)
    setErr('')
    function attempt(confirmUnknown) {
      return writeOp('POST', '/api/providers/' + encodeURIComponent(providerId) + '/login', {
        user: user.trim(),
        password: pass,
        ...(confirmUnknown ? { confirmUnknown: true } : {}),
      })
    }
    function finish(res) {
      setBusy(false)
      if (res && res.ok) {
        var lr = (res.summary && res.summary.loginResult) || {}
        var label = lr.via === 'sub2api' ? 'Sub2API' : lr.via === 'oneapi' ? 'OneAPI/NewAPI' : String(lr.via || lr.kind || '未知系别')
        ctx.notify('登录成功 · 识别为 ' + label + '，令牌已自动获取并开始续期')
        setPass('')
        ctx.togglePane(providerId, 'login')
        if (typeof ctx.reload === 'function') ctx.reload()
      } else {
        setErr('登录失败：' + errText(res && res.error))
      }
    }
    attempt(false).then(function (res) {
      var errObj = res && res.error && typeof res.error === 'object' ? res.error : null
      if (res && !res.ok && res.status === 409 && errObj && errObj.needConfirm) {
        if (window.confirm(String(errObj.message || '识别不出站点系别。继续会向站点发送一次试探登录，继续吗？'))) {
          attempt(true).then(finish)
        } else {
          setBusy(false)
          setErr('已取消：没有向站点发送登录试探。')
        }
        return
      }
      finish(res)
    })
  }

  return h('div', { className: 'prov-detail', 'data-pane': 'login' },
    h('div', { className: 'inline-form' },
      h('input', {
        type: 'text',
        placeholder: '站点后台账号（用户名或邮箱）',
        value: user,
        disabled: busy,
        onChange: function (event) { setUser(event.target.value) },
        onKeyDown: function (event) { if (event.key === 'Enter') submit() },
      }),
      h('input', {
        type: 'password',
        placeholder: '站点后台密码',
        value: pass,
        disabled: busy,
        onChange: function (event) { setPass(event.target.value) },
        onKeyDown: function (event) { if (event.key === 'Enter') submit() },
      }),
      h('button', { type: 'button', className: 'primary', disabled: busy, onClick: submit }, busy ? '登录中…' : '登录')),
    err ? h('p', { className: 'hint', style: { color: 'var(--danger)' } }, err) : null,
    h('p', { className: 'hint', style: { margin: '8px 0 0' } },
      '用站点后台的登录凭据（不是 API Key）。登录成功后令牌自动获取并续期；系别识别不出时会先征求你的同意再试探。'))
}

// ── 主视图 ────────────────────────────────────────────────────

function MonitorView(props) {
  var api = (props && props.api) || {}
  var env = (props && props.state) || null
  var state = pickState(props || {}) || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var routing = Array.isArray(state.routing) ? state.routing : []
  var ranking = Array.isArray(state.siteRanking) ? state.siteRanking : []
  var settings = state.settings || {}
  var fx = monitorFx(settings)

  var queryPair = React.useState('')
  var query = queryPair[0]
  var setQuery = queryPair[1]
  var pagePair = React.useState(1)
  var page = pagePair[0]
  var setPage = pagePair[1]
  var addPair = React.useState(false)
  var showAdd = addPair[0]
  var setShowAdd = addPair[1]
  var panePair = React.useState({})
  var panes = panePair[0]
  var setPanes = panePair[1]
  var groupPair = React.useState({})
  var groupOpen = groupPair[0]
  var setGroupOpen = groupPair[1]
  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var noticePair = React.useState(null)
  var notice = noticePair[0]
  var setNotice = noticePair[1]
  var formPair = React.useState(function () { return monitorSyncForm(settings) })
  var syncForm = formPair[0]
  var setSyncForm = formPair[1]

  // 监控数据（宿主 GET /api/manage-api/monitor → daemon /api/monitor）
  var daysPair = React.useState(7)
  var days = daysPair[0]
  var setDays = daysPair[1]
  var dataPair = React.useState(null)
  var monitorData = dataPair[0]
  var setMonitorData = dataPair[1]
  var loadingPair = React.useState(true)
  var loading = loadingPair[0]
  var setLoading = loadingPair[1]
  var errorPair = React.useState('')
  var loadError = errorPair[0]
  var setLoadError = errorPair[1]
  var tickPair = React.useState(0)
  var reloadTick = tickPair[0]
  var setReloadTick = tickPair[1]
  var spendPair = React.useState('today')
  var spendRange = spendPair[0]
  var setSpendRange = spendPair[1]
  var chartSitePair = React.useState('ALL')
  var chartSite = chartSitePair[0]
  var setChartSite = chartSitePair[1]

  React.useEffect(function () {
    setSyncForm(monitorSyncForm(settings))
  }, [settings.monitorIntervalMinutes, settings.balanceWarnUsd, settings.defaultUnitPrice])

  // 拉监控数据：切天数或点完「立即同步 / 全部已读」都会重跑（alive 防止旧请求盖掉新结果）
  React.useEffect(function () {
    var alive = true
    setLoading(true)
    setLoadError('')
    fetchJson('monitor?days=' + days).then(function (res) {
      if (!alive) return
      var body = res && res.body
      if (!res || !res.ok || !body || body.ok === false || !body.data) {
        setLoading(false)
        setLoadError((body && body.error) || (res && res.error) || ('HTTP ' + ((res && res.status) || '?')))
        return
      }
      setMonitorData(body.data)
      setLoading(false)
    }).catch(function (error) {
      if (!alive) return
      setLoading(false)
      setLoadError((error && error.message) || String(error))
    })
    return function () { alive = false }
  }, [days, reloadTick])

  var views = React.useMemo(function () { return monitorBuildViews(state) }, [state])
  var alerts = React.useMemo(function () { return monitorBuildAlerts(state, views) }, [state, views])
  var warnCny = monitorNum(settings.balanceWarnCny)
  var warnUsd = monitorNum(settings.balanceWarnUsd)
  var limit = warnCny !== null ? warnCny : warnUsd !== null ? warnUsd * fx : null

  function reload() {
    try {
      if (api && typeof api.reload === 'function') api.reload()
    } catch (e) {
      /* 刷新失败不影响已经提示的结果 */
    }
  }

  function notify(text) {
    setNotice({ tone: 'warn', text: text })
  }

  /** 统一的写操作包装：跑之前置忙、跑完给结果并刷新快照。 */
  function run(key, okText, fn) {
    if (busy) return
    setBusy(key)
    setNotice(null)
    Promise.resolve().then(fn).then(function (res) {
      setBusy('')
      if (res && res.ok === false) setNotice({ tone: 'warn', text: '失败：' + (res.error || 'HTTP ' + res.status) })
      else setNotice({ tone: 'ok', text: okText || '完成' })
      reload()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '失败：' + ((error && error.message) || String(error)) })
    })
  }

  function togglePane(id, name) {
    var next = Object.assign({}, panes)
    next[id] = panes[id] === name ? '' : name
    setPanes(next)
  }

  function toggleGroups(id) {
    var next = Object.assign({}, groupOpen)
    next[id] = !groupOpen[id]
    setGroupOpen(next)
  }

  function saveSettings() {
    var payload = {}
    var iv = monitorNum(syncForm.interval)
    var wn = monitorNum(syncForm.warn)
    var pr = monitorNum(syncForm.price)
    if (iv !== null && iv > 0) payload.monitorIntervalMinutes = iv
    if (wn !== null && wn >= 0) payload.balanceWarnUsd = wn
    if (pr !== null && pr > 0) payload.defaultUnitPrice = pr
    if (Object.keys(payload).length === 0) {
      notify('同步设置三项都空着，没东西可保存')
      return
    }
    run('settings', '同步设置已保存', function () { return writeOp('PATCH', '/api/settings', payload) })
  }

  // KPI：站点 / 总余额 / 真实花费 / 24 小时变动 / 未读告警（全部来自 monitor 数据）
  var mkpi = (monitorData && monitorData.kpi) || {}
  var balanceSeries = (monitorData && Array.isArray(monitorData.balanceSeries)) ? monitorData.balanceSeries : []
  var latestBalance = null
  for (var bi = balanceSeries.length - 1; bi >= 0; bi -= 1) {
    if (balanceSeries[bi] && typeof balanceSeries[bi].total === 'number') { latestBalance = balanceSeries[bi]; break }
  }
  var totalCny = latestBalance ? latestBalance.total : null
  var lowestBalance = mkpi.lowest || null
  var withBalance = monitorNum(mkpi.withBalance)
  var providerCount = monitorNum(mkpi.providerCount)
  var rateChanges = monitorNum(mkpi.rateChanges24h)
  var unreadAlerts = monitorNum(mkpi.unreadAlerts)

  var balanceSub
  if (totalCny === null) {
    balanceSub = lowestBalance
      ? '最低：' + lowestBalance.name + ' ' + String(lowestBalance.currency || '') + ' ' + monitorMoneyShort(lowestBalance.balance)
      : '还没有余额数据'
  } else {
    balanceSub = '≈ $' + monitorMoneyShort(totalCny / fx) + '（按汇率折算）'
  }

  var kpi = h('div', { className: 'stats monitor-kpi' },
    monitorKpiCard('kpi-sites', {
      k: '站点',
      v: (withBalance === null ? 0 : withBalance) + '/' + (providerCount === null ? providers.length : providerCount),
      sub: '有余额数据',
      ic: 'servers', tint: 'tint-muted',
      hint: '已读到余额的站点数 / 站点总数（来自 daemon 的余额快照）',
    }),
    monitorKpiCard('kpi-balance', {
      k: '总余额',
      v: totalCny === null ? '—' : monitorPriceText(totalCny),
      sub: balanceSub,
      ic: 'wallet', tint: 'tint-accent',
      hint: '所有站点余额折成人民币后求和（外币站按当前汇率）',
    }),
    monitorKpiCard('kpi-spend', monitorSpendKpi(monitorData, settings, spendRange, setSpendRange)),
    monitorKpiCard('kpi-change', {
      k: '24 小时变动',
      v: rateChanges === null ? 0 : rateChanges,
      sub: '倍率 / 价格',
      ic: 'swap', tint: 'tint-muted',
      hint: '最近 24 小时里检测到的分组倍率或模型价格变动条数',
    }),
    monitorKpiCard('kpi-alert', {
      k: '未读告警',
      v: unreadAlerts === null ? 0 : unreadAlerts,
      sub: '上次同步 ' + (monitorAgo(mkpi.lastRunAt) || '还没同步过'),
      ic: 'alert', tint: (unreadAlerts || 0) > 0 ? 'tint-warn' : 'tint-muted',
      hint: '余额低于阈值、倍率变动、同步失败等未读告警数',
    }))

  /** 「立即同步」：让 daemon 现采一轮（会真的去站点拉余额与账单），成功后重拉监控数据。 */
  function collectNow() {
    if (busy) return
    setBusy('collect')
    setNotice(null)
    writeOp('POST', '/api/monitor/collect', { days: days }).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '同步失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      setNotice({ tone: 'ok', text: '已同步一轮站点余额与账单' })
      setReloadTick(function (n) { return n + 1 })
      reload()
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '同步失败：' + ((error && error.message) || String(error)) })
    })
  }

  /** 全部已读：daemon 侧 POST /api/monitor/alerts/read。 */
  function readAlerts() {
    if (busy) return
    setBusy('alerts')
    setNotice(null)
    writeOp('POST', '/api/monitor/alerts/read', {}).then(function (res) {
      setBusy('')
      if (!res || res.ok === false) {
        setNotice({ tone: 'warn', text: '标记已读失败：' + ((res && (res.error || ('HTTP ' + res.status))) || '未知错误') })
        return
      }
      setNotice({ tone: 'ok', text: '告警已全部标记为已读' })
      setReloadTick(function (n) { return n + 1 })
    }).catch(function (error) {
      setBusy('')
      setNotice({ tone: 'warn', text: '标记已读失败：' + ((error && error.message) || String(error)) })
    })
  }

  /** 监控数据读取失败后的重试（不动 /api/state 快照）。 */
  function retryMonitor() {
    setLoadError('')
    setReloadTick(function (n) { return n + 1 })
  }

  // 站点区：搜索 + 分页（每页 9 张，和网页版一致）
  var matched = React.useMemo(function () {
    var q = String(query || '').trim().toLowerCase()
    if (!q) return views
    return views.filter(function (v) {
      var p = v.provider || {}
      return String(p.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(p.baseUrl || '').toLowerCase().indexOf(q) >= 0 ||
        String(p.siteUrl || '').toLowerCase().indexOf(q) >= 0
    })
  }, [views, query])

  var pageCount = Math.max(1, Math.ceil(matched.length / MONITOR_PAGE_SIZE))
  var safePage = Math.min(Math.max(1, page), pageCount)
  var from = matched.length ? (safePage - 1) * MONITOR_PAGE_SIZE + 1 : 0
  var to = Math.min(safePage * MONITOR_PAGE_SIZE, matched.length)
  var pageRows = matched.slice((safePage - 1) * MONITOR_PAGE_SIZE, safePage * MONITOR_PAGE_SIZE)

  var ctx = {
    busy: busy, panes: panes, groupOpen: groupOpen, limit: limit,
    run: run, notify: notify, togglePane: togglePane, toggleGroups: toggleGroups,
    reload: reload,
  }

  var syncNumber = function (key, placeholder, title) {
    return h('input', {
      key: key, type: 'number', placeholder: placeholder, title: title, value: syncForm[key],
      onChange: function (e) {
        var next = Object.assign({}, syncForm)
        next[key] = e.target.value
        setSyncForm(next)
      },
    })
  }

  var syncPanel = h('div', { className: 'sync-panel' },
    syncNumber('interval', '间隔', '同步间隔（分钟）'),
    syncNumber('warn', '阈值', '告警阈值（美元）'),
    syncNumber('price', '汇率', '默认充值汇率：1 个站点货币单位值多少人民币'),
    h('button', { type: 'button', className: 'primary tiny', disabled: busy === 'settings', onClick: saveSettings }, '保存'))

  var sitesHead = providers.length ? h('div', { className: 'sites-head' },
    h('div', { className: 'sites-title-block' },
      h('h3', null, '站点余额与分组'),
      h('span', { className: 'hint' }, '分组倍率来自站点公布的可用渠道')),
    h('div', { className: 'sites-bar' },
      h('input', {
        id: 'site-search', type: 'search', placeholder: '搜索站点名或地址', value: query,
        onChange: function (e) { setQuery(e.target.value); setPage(1) },
      }),
      h('span', { className: 'site-pager' },
        h('span', { className: 'hint range' }, '显示 ' + from + '-' + to + '，共 ' + matched.length + ' 个'),
        h('button', { type: 'button', className: 'ghost tiny', disabled: safePage <= 1, onClick: function () { setPage(safePage - 1) } }, '上一页'),
        h('span', { className: 'hint' }, safePage + ' / ' + pageCount),
        h('button', { type: 'button', className: 'ghost tiny', disabled: safePage >= pageCount, onClick: function () { setPage(safePage + 1) } }, '下一页')),
      h('span', { className: 'grow' }),
      syncPanel,
      h('div', { className: 'sites-actions' },
        h('button', {
          type: 'button', disabled: busy === 'collect',
          title: '让 daemon 现采一轮余额与站点账单（要几秒到几十秒）',
          onClick: collectNow,
        }, Icon('refresh', { size: 14 }), '立即同步'),
        h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
          Icon('plus', { size: 14 }), '新增站点')))) : null

  var siteCards = h('div', { className: 'site-cards' }, pageRows.length
    ? pageRows.map(function (v) { return monitorSiteCard(v, ctx) })
    : h('div', { className: 'empty small' }, h('p', null, '没有匹配的站点。')))

  var addSiteBtn = h('button', { type: 'button', className: 'primary', onClick: function () { setShowAdd(true) } },
    Icon('plus', { size: 14 }), '新增站点')

  var sitesSection = providers.length
    ? h('div', { className: 'sites-section' }, h('div', { className: 'monitor-sites' }, sitesHead, siteCards))
    : h('div', { className: 'sites-section' }, h(Empty, {
        title: '还没有站点',
        desc: '先添加一个中转站，填上它的地址和一个 Key，就能拉取模型列表开始比价。',
        action: addSiteBtn,
      }))

  var noticeBar = notice ? h('div', { className: 'notice' + (notice.tone === 'warn' ? ' danger' : '') },
    h('span', { className: 'name' }, notice.tone === 'warn' ? '操作失败' : '操作完成'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, notice.text)) : null

  var offlineBar = env && env.ok === false ? h('div', { className: 'notice danger' },
    h('span', { className: 'name' }, '读不到 daemon 状态'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, '宿主路由没有返回快照，先确认 ManageAPI daemon 起起来了。')) : null

  // 首次加载 / 拉失败：整页只给 loading 或重试入口（和网页版一致），站点卡等数据就绪后再出
  if (!monitorData) {
    if (loading) {
      return h('section', { className: 'view wide' },
        h('div', { className: 'empty' },
          h('h3', null, '正在读取监控数据…'),
          h('p', null, '第一次打开会现采一轮，稍等一下。')))
    }
    return h('section', { className: 'view wide' },
      h('div', { className: 'empty' },
        h('h3', null, '监控数据读取失败'),
        h('p', null, loadError || '宿主没有返回监控数据，先确认 ManageAPI daemon 起起来了。'),
        h('button', { type: 'button', className: 'primary', onClick: retryMonitor }, '重试')))
  }

  // 已经有数据、但后台重拉失败：只在顶部提示，不清空页面
  var staleBar = loadError ? h('div', { className: 'notice danger' },
    h('span', { className: 'name' }, '监控数据没有刷新'),
    h('span', { className: 'grow' }),
    h('span', { className: 'desc' }, loadError),
    h('button', { type: 'button', className: 'ghost tiny', onClick: retryMonitor }, '重试')) : null

  return h('section', { className: 'view wide' },
    offlineBar,
    staleBar,
    noticeBar,
    kpi,
    h('div', { className: 'monitor-cols monitor-cols--overview' },
      h(MonitorChartCard, {
        data: monitorData,
        days: days,
        onDays: function (next) { setDays(next) },
        selected: chartSite,
        onSelect: function (next) { setChartSite(next) },
        settings: settings,
      }),
      h(MonitorFlowCard, { routing: routing })),
    sitesSection,
    showAdd ? h(MonitorAddProvider, {
      onDone: function () {
        setShowAdd(false)
        setNotice({ tone: 'ok', text: '站点已添加' })
        reload()
      },
      onCancel: function () { setShowAdd(false) },
    }) : null,
    h('div', { className: 'monitor-cols monitor-cols--feed' },
      h(MonitorAlertsCard, {
        monitorAlerts: Array.isArray(monitorData.alerts) ? monitorData.alerts : null,
        alerts: alerts,
        unread: unreadAlerts,
        busy: busy,
        onRead: readAlerts,
      }),
      h(MonitorRankingCard, { ranking: ranking, probeTotal: state.probeTotal })),
    h(MonitorRoutingTable, { routing: routing }))
}

    // ── part: 20-free.js ──
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

    // ── part: 30-gateway.js ──
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
     * 为什么没有网关开关：POST /api/gateway 不在插件写代理白名单里（v3 的安全边界），
     * 旧版渲染的按钮是永远禁用的死按钮，已删除；网关未启用时由「模型接入」卡直接告警。
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
     *   - 可选模型 = `state.modelIndex` 去掉 `state.settings.ignoredModels`（与比价页同一口径）
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
      var ignored = Array.isArray(settings.ignoredModels) ? settings.ignoredModels : []
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
            )
          : null,
        gateway && gateway.enabled === false
          ? h(
              'div',
              { className: 'alert danger', style: { marginBottom: '10px' } },
              h('span', { className: 'name' }, '网关未启用'),
              h('span', { className: 'grow' }),
              h('span', { className: 'desc' }, 'DSH 的模型调用会失败；到 ManageAPI 网页版（4319）打开网关。'),
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

    // ── part: 40-benchmark.js ──
    /**
     * 基准价视图。移植自网页版 renderBenchmark()（web/app.js:2778-2917）与它
     * 依赖的汇率小件（fxState / fxNoteHtml / rateCny）。
     *
     * 这是宽页：默认只展开「与本地供给相关」和「手动改过」的基准价，其余收进
     * 折叠行；搜索时强制看全部（搜索意图就是找，别再分层）。
     *
     * 写操作受限：基准价的增删改、三种导入都不在白名单里（PUT/DELETE
     * /api/benchmarks*、POST /api/benchmarks/{import,seed,import-plaza} 都会 403），
     * 所以价格输入、币种选择、删除、导入按钮一律禁用；只有「显示币种」和
     * 「汇率」走 PATCH /api/settings（在白名单里），是真能用的。
     */

    var BENCH_LOCKED = '当前插件版本未开放（基准价编辑与导入不在插件的写白名单里）'

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

      // ── 导入卡 ──────────────────────────────────────────────────
      var providerOptions = providers.map(function (p) { return h('option', { key: p.id, value: p.id }, p.name) })
      var importCard = h('div', { className: 'card' },
        h('div', { className: 'inline-form', style: { borderTop: 'none', marginTop: 0, paddingTop: 0 } },
          h('select', { id: 'import-provider', style: { maxWidth: '210px' }, defaultValue: providers[0] ? providers[0].id : '' },
            providerOptions.length ? providerOptions : h('option', { value: '' }, '还没有站点')),
          h('button', { type: 'button', disabled: true, title: BENCH_LOCKED }, '从站点导入官方价'),
          h('button', { type: 'button', disabled: true, title: BENCH_LOCKED }, '以此站已填价为准'),
          h('span', { style: { color: 'var(--faint)', fontSize: '12px', margin: '0 2px' } }, '或'),
          h('button', { type: 'button', disabled: true, title: BENCH_LOCKED }, '载入内置参考价')),
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
            h('input', { type: 'number', step: '0.001', placeholder: '—', defaultValue: entry.in === null || entry.in === undefined ? '' : String(entry.in), readOnly: true, disabled: true, title: BENCH_LOCKED })),
          h('td', { className: 'num' },
            h('input', { type: 'number', step: '0.001', placeholder: '—', defaultValue: entry.out === null || entry.out === undefined ? '' : String(entry.out), readOnly: true, disabled: true, title: BENCH_LOCKED })),
          h('td', { className: 'num', style: { whiteSpace: 'nowrap' } },
            h('input', { type: 'number', step: '0.001', placeholder: '入', defaultValue: entry.offPeakIn === null || entry.offPeakIn === undefined ? '' : String(entry.offPeakIn), readOnly: true, disabled: true, style: { width: '62px' }, title: BENCH_LOCKED }),
            h('input', { type: 'number', step: '0.001', placeholder: '出', defaultValue: entry.offPeakOut === null || entry.offPeakOut === undefined ? '' : String(entry.offPeakOut), readOnly: true, disabled: true, style: { width: '62px' }, title: BENCH_LOCKED })),
          h('td', null,
            h('select', { style: { width: '70px' }, defaultValue: entry.currency === 'CNY' ? 'CNY' : 'USD', disabled: true, title: BENCH_LOCKED },
              h('option', { value: 'USD' }, 'USD'),
              h('option', { value: 'CNY' }, 'CNY'))),
          h('td', { className: 'num' },
            h('button', { type: 'button', className: 'ghost danger', disabled: true, title: BENCH_LOCKED }, '删除')))
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

    // ── part: 50-pricing.js ──
// ── 比价页：移植 web/app.js renderPricing()（1749-1914）───────────────
// 12 列宽表：站点（左吸附）｜上游模型名｜缓存｜分组｜模式｜输入价｜输出价｜
// 币种/单位｜倍率｜首字｜综合成本（右吸附）｜价差（右吸附）。
// 价格写入走 PATCH /api/offers/:id（P3.2 起在写代理白名单里）：改价失焦即存，
// 切「倍率/价格」模式即时生效（daemon 侧切手填价时会自动种入当前算出的价格），
// 「标为免费」按 web 版同款五字段写入（manual + 0 价 + CNY）。

/** 供给价格写的统一入口：成功后拉一次新快照，失败把原因放进页首消息行。 */
function pricingSaveOffer(ctx, offerId, body, okText) {
  if (ctx.busy) return
  ctx.setBusy(offerId)
  ctx.setMsg(null)
  writeOp('PATCH', '/api/offers/' + encodeURIComponent(offerId), body).then(function (res) {
    ctx.setBusy('')
    if (res && res.ok) {
      ctx.setMsg({ kind: 'ok', text: okText || '已保存' })
      if (typeof ctx.reload === 'function') ctx.reload()
    } else {
      var err = res && res.error
      var text = err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
      ctx.setMsg({ kind: 'err', text: '保存失败：' + text })
    }
  })
}

/** 数字输入框的失焦提交：空串=清空（null），非法数字回滚原值。 */
function pricingCommitNumber(ctx, offerId, field, okText) {
  return function (event) {
    var raw = String(event.target.value == null ? '' : event.target.value).trim()
    var next = raw === '' ? null : Number(raw)
    if (next !== null && !isFinite(next)) return // number 输入框本身拦住大部分；兜底不提交
    var label = field === 'ratio' ? '倍率' : field === 'inPrice' ? '输入价' : '输出价'
    pricingSaveOffer(ctx, offerId, { [field]: next }, okText || (next === null ? label + '已清空' : label + '已保存'))
  }
}

function pricingFx(settings) {
  var s = settings || {}
  var fromFx = Number(s.fx && s.fx.rates ? s.fx.rates.CNY : null)
  if (isFinite(fromFx) && fromFx > 0) return fromFx
  var legacy = Number(s.fxUsdCny)
  return isFinite(legacy) && legacy > 0 ? legacy : 7.2
}

function pricingShowUsd(settings) {
  return Boolean(settings && settings.displayCurrency === 'USD')
}

function pricingSym(settings) {
  return pricingShowUsd(settings) ? '$' : '¥'
}

/** 与网页版 money() 同口径：≥100 取整、≥1 两位、其余三位。 */
function pricingMoney(value) {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  var n = Number(value)
  if (n >= 100) return n.toFixed(0)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

function pricingPriceText(cny, settings) {
  if (cny === null || cny === undefined || !isFinite(cny)) return '—'
  var v = pricingShowUsd(settings) ? Number(cny) / pricingFx(settings) : Number(cny)
  return pricingSym(settings) + pricingMoney(v)
}

/** 「站点 × 分组」→ 胶囊色。网页版还叠了厂商色，插件没有 vendorChipClass，
 *  只保留能自证的「整组免费」判定，其余走中性 badge。 */
function pricingGroupFreeMap(offers) {
  var map = {}
  ;(offers || []).forEach(function (offer) {
    var key = String(offer.providerId) + '\u0000' + String(offer.group || '')
    var free =
      offer.pricingMode === 'manual'
        ? Number(offer.inPrice) === 0 && Number(offer.outPrice) === 0
        : Number(offer.ratio) === 0
    if (map[key] === undefined) map[key] = free
    else map[key] = map[key] && free
  })
  return map
}

function pricingGroupChipClass(freeMap, providerId, group) {
  var key = String(providerId) + '\u0000' + String(group || '')
  return freeMap[key] ? 'vchip-free' : ''
}

function pricingNumberValue(value) {
  return value === null || value === undefined ? '' : value
}

function pricingUnitBadge(row) {
  var label = row.perCall ? '/次' : row.priceUnit === 'per_1k' ? '/1k' : '/M'
  return h(
    'span',
    {
      className: 'badge unit-badge',
      title: '计费单位：由站点声明的计费形式识别而来；手动修改请到「站点」页的模型行',
    },
    label,
  )
}

/** 综合成本列：按次行显示 /次，按 token 行显示 /百万 token，并带空闲价副行。 */
function pricingCostCell(row, settings) {
  if (row.perCall) {
    var perCall = row.callPriceCny === null || row.callPriceCny === undefined ? '—' : pricingSym(settings) + pricingMoney(row.callPriceCny)
    return h('div', null, perCall, h('span', { className: 'sub' }, '/次'))
  }
  var head = pricingPriceText(row.blendedCnyPerMtok, settings)
  var offPeak =
    row.hasOffPeak && row.offPeakBlendedCnyPerMtok !== null && row.offPeakBlendedCnyPerMtok !== undefined
      ? h('div', { className: 'sub' }, '空闲 ', pricingPriceText(row.offPeakBlendedCnyPerMtok, settings))
      : null
  return h('div', null, head, offPeak)
}

function pricingBadges(row, score, settings) {
  var out = []
  var maxTtft = Number(settings && settings.maxTtftMs) || 0
  var tooSlow = maxTtft > 0 && score && typeof score.ttftMs === 'number' && score.ttftMs > maxTtft
  if (tooSlow) out.push(h(Badge, { key: 'slow', tone: 'warn' }, '超时'))
  else if (score && score.probeTrusted === false) out.push(h(Badge, { key: 'trust', tone: 'warn' }, '可疑'))
  if (row.perCall) out.push(h(Badge, { key: 'call' }, '按次'))
  return out
}

function pricingRowElement(row, ctx) {
  var settings = ctx.settings
  var score = ctx.scores[row.offerId]
  var mode = row.pricingMode === 'ratio' ? 'ratio' : 'manual'
  var busy = ctx.busy
  var lock = busy !== '' && busy !== row.offerId // 别的行在保存：整表只读，避免并发写错乱
  var cacheCell =
    row.cacheHitRate === null || row.cacheHitRate === undefined ? '—' : Math.round(row.cacheHitRate * 100) + '%'
  var groupCell = row.group
    ? h(
        'span',
        { className: 'badge ' + pricingGroupChipClass(ctx.freeMap, row.providerId, row.group), title: row.group },
        row.group,
      )
    : h('span', { style: { color: 'var(--faint)' }, title: '该行的 Key 没有分组' }, '默认')

  return h(
    'tr',
    { key: row.offerId, className: row.isCheapest ? 'cheapest' : undefined },
    h('td', null, ctx.nameMap[row.providerId] || '未知站'),
    h('td', { className: 'mono' }, row.upstreamName, pricingBadges(row, score, settings)),
    h('td', { className: 'num sub-cell' }, cacheCell),
    h(
      'td',
      null,
      h(
        'span',
        { className: 'group-chip-cell' },
        groupCell,
        h(
          'button',
          {
            type: 'button',
            className: 'ghost tiny',
            disabled: true,
            title: '复制供给（新建分组副本）随后续版本开放',
          },
          '＋',
        ),
      ),
    ),
    h(
      'td',
      null,
      h(
        'div',
        { className: 'seg-mini' },
        h(
          'button',
          {
            type: 'button',
            className: mode === 'ratio' ? 'is-on' : '',
            disabled: lock,
            title: '按倍率计价：实际价 = 基准价 × 倍率',
            onClick: mode === 'ratio' ? undefined : function () { pricingSaveOffer(ctx, row.offerId, { pricingMode: 'ratio' }, '已切成「按倍率」：价格 = 基准价 × 倍率') },
          },
          '倍率',
        ),
        h(
          'button',
          {
            type: 'button',
            className: mode === 'manual' ? 'is-on' : '',
            disabled: lock,
            title: '按价格计价：直接填输入/输出单价',
            onClick: mode === 'manual' ? undefined : function () { pricingSaveOffer(ctx, row.offerId, { pricingMode: 'manual' }, '已切成「按价格」：直接填输入/输出单价') },
          },
          '价格',
        ),
      ),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        key: row.offerId + ':in:' + mode + ':' + (row.inPrice == null ? '' : row.inPrice),
        type: 'number',
        step: '0.001',
        placeholder: '—',
        defaultValue: pricingNumberValue(row.inPrice),
        disabled: lock || mode === 'ratio',
        title: mode === 'ratio' ? '当前按倍率算，切到「价格」才能填' : '输入单价，失焦保存',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'inPrice'),
      }),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        key: row.offerId + ':out:' + mode + ':' + (row.outPrice == null ? '' : row.outPrice),
        type: 'number',
        step: '0.001',
        placeholder: '—',
        defaultValue: row.perCall ? '' : pricingNumberValue(row.outPrice),
        disabled: lock || row.perCall || mode === 'ratio',
        title: row.perCall ? '按次计费不区分输入/输出' : mode === 'ratio' ? '当前按倍率算，切到「价格」才能填' : '输出单价，失焦保存',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'outPrice'),
      }),
    ),
    h(
      'td',
      null,
      h(
        'div',
        { className: 'unit-cell' },
        h(
          'select',
          { value: row.currency === 'CNY' ? 'CNY' : 'USD', disabled: lock, title: '单价币种', style: { width: '70px' }, onChange: function (event) { pricingSaveOffer(ctx, row.offerId, { currency: event.target.value }, '币种已切换') } },
          h('option', { value: 'USD' }, 'USD'),
          h('option', { value: 'CNY' }, 'CNY'),
        ),
        pricingUnitBadge(row),
      ),
    ),
    h(
      'td',
      { className: 'num' },
      h('input', {
        key: row.offerId + ':ratio:' + mode + ':' + (row.ratio == null ? '' : row.ratio),
        type: 'number',
        step: '0.01',
        placeholder: '倍率',
        className: 'ratio',
        defaultValue: pricingNumberValue(row.ratio),
        disabled: lock,
        title: mode === 'manual' ? '当前按手填单价算；这里填的倍率要切回「倍率」模式才生效' : '实际价 = 基准价 × 倍率',
        onBlur: pricingCommitNumber(ctx, row.offerId, 'ratio'),
      }),
    ),
    h('td', { className: 'num' }, row.ttftMs ? String(row.ttftMs) + 'ms' : '—'),
    h('td', { className: 'num' }, pricingCostCell(row, settings)),
    h(
      'td',
      { className: 'num' },
      row.isCheapest
        ? h(Badge, { tone: 'ok' }, '最便宜')
        : row.deltaPct === null || row.deltaPct === undefined
          ? '—'
          : '+' + row.deltaPct + '%',
    ),
  )
}

function pricingGroupPanel(group, ctx) {
  var panelKey = 'pricing:' + group.modelKey
  var isCollapsed = Boolean(ctx.collapse[panelKey])
  var rows = (group.rows || []).map(function (row) {
    return pricingRowElement(row, ctx)
  })
  return h(
    'div',
    { className: 'table-wrap', key: group.modelKey },
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
            ctx.toggle(panelKey)
          },
        },
        isCollapsed ? '▸' : '▾',
      ),
      h('span', { className: 'model mono' }, group.modelKey),
      group.spreadPct === null || group.spreadPct === undefined
        ? null
        : h('span', { className: 'spread' }, '价差 ' + group.spreadPct + '%'),
      h(
        'span',
        { className: 'count' },
        (group.providerCount || 0) + ' 个站 · ' + (group.rows || []).length + ' 条供给',
      ),
    ),
    isCollapsed
      ? null
      : h(
          'table',
          { className: 'pricing-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, '站点'),
              h('th', null, '上游模型名'),
              h('th', { className: 'num' }, '缓存'),
              h('th', null, '分组'),
              h('th', null, '模式'),
              h('th', { className: 'num' }, '输入价'),
              h('th', { className: 'num' }, '输出价'),
              h('th', null, '币种 / 单位'),
              h('th', { className: 'num' }, '倍率'),
              h('th', { className: 'num' }, '首字'),
              h(
                'th',
                { className: 'num' },
                '综合成本',
                h('div', { className: 'sub' }, pricingSym(ctx.settings) + '/M · 按次行 /次'),
              ),
              h('th', { className: 'num' }, '价差'),
            ),
          ),
          h('tbody', null, rows),
        ),
  )
}

/** 还没定价的供给：新用户进来不能是空白，否则没有入口填价。 */
function pricingUnpricedBlock(unpriced, ctx) {
  if (!unpriced.length) return null
  return h(
    'div',
    { key: 'unpriced' },
    h('h3', { className: 'section-title' }, '还没定价的供给（' + unpriced.length + '）'),
    h(
      'p',
      { className: 'hint' },
      '填「倍率」最省事：实际价 = 基准价 × 倍率。不知道倍率就直接填输入/输出单价。站上真的白送就点「标为免费」。',
    ),
    h(
      'div',
      { className: 'table-wrap' },
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, '站点'),
            h('th', null, '上游模型名'),
            h('th', { className: 'num' }, '基准价'),
            h('th', { className: 'num' }, '输入价'),
            h('th', { className: 'num' }, '输出价'),
            h('th', { className: 'num' }, '倍率'),
            h('th', null, '单位 / 币种'),
            h('th', null, ''),
          ),
        ),
        h(
          'tbody',
          null,
          unpriced.map(function (offer) {
            var bench = ctx.benchmarks[offer.modelKey] || ctx.benchmarks[offer.upstreamName]
            var hasBench = bench && (bench.in !== null || bench.out !== null)
            var benchText = hasBench
              ? (bench.currency === 'CNY' ? '¥' : '$') +
                (bench.in === null || bench.in === undefined ? '—' : bench.in) +
                '/' +
                (bench.out === null || bench.out === undefined ? '—' : bench.out)
              : h('span', { style: { color: 'var(--faint)' } }, '无基准')
            var lock = ctx.busy !== '' && ctx.busy !== offer.id
            return h(
              'tr',
              { key: offer.id },
              h('td', null, ctx.nameMap[offer.providerId] || '未知站'),
              h(
                'td',
                { className: 'mono' },
                offer.upstreamName,
                offer.group
                  ? h(
                      'span',
                      { className: 'badge ' + pricingGroupChipClass(ctx.freeMap, offer.providerId, offer.group) },
                      offer.group,
                    )
                  : null,
              ),
              h('td', { className: 'num', style: { color: 'var(--faint)' } }, benchText),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  key: offer.id + ':in:' + offer.priceUnit + ':' + (offer.inPrice == null ? '' : offer.inPrice),
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  defaultValue: pricingNumberValue(offer.inPrice),
                  disabled: lock,
                  title: offer.priceUnit === 'per_call' ? '按次计费：这里填每次请求的价格' : '输入单价，失焦保存',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'inPrice'),
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  key: offer.id + ':out:' + offer.priceUnit + ':' + (offer.outPrice == null ? '' : offer.outPrice),
                  type: 'number',
                  step: '0.001',
                  placeholder: '—',
                  defaultValue: offer.priceUnit === 'per_call' ? '' : pricingNumberValue(offer.outPrice),
                  disabled: lock || offer.priceUnit === 'per_call',
                  title: offer.priceUnit === 'per_call' ? '按次计费不区分输入/输出' : '输出单价，失焦保存',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'outPrice'),
                }),
              ),
              h(
                'td',
                { className: 'num' },
                h('input', {
                  key: offer.id + ':ratio:' + (offer.ratio == null ? '' : offer.ratio),
                  type: 'number',
                  step: '0.01',
                  placeholder: '倍率',
                  className: 'ratio',
                  defaultValue: pricingNumberValue(offer.ratio),
                  disabled: lock,
                  title: '实际价 = 基准价 × 倍率（填了倍率还要切「倍率」模式才生效）',
                  onBlur: pricingCommitNumber(ctx, offer.id, 'ratio'),
                }),
              ),
              h(
                'td',
                null,
                h(
                  'div',
                  { className: 'unit-cell' },
                  h(
                    'select',
                    {
                      value: offer.priceUnit === 'per_1k' ? 'per_1k' : offer.priceUnit === 'per_call' ? 'per_call' : 'per_mtok',
                      disabled: lock,
                      title: '计价单位：按次 = 输入价填每次请求的价格',
                      style: { width: '64px' },
                      onChange: function (event) {
                        pricingSaveOffer(ctx, offer.id, { priceUnit: event.target.value }, '计价单位已切换')
                      },
                    },
                    h('option', { value: 'per_mtok' }, '/M'),
                    h('option', { value: 'per_1k' }, '/1k'),
                    h('option', { value: 'per_call' }, '/次'),
                  ),
                  h(
                    'select',
                    { value: offer.currency === 'CNY' ? 'CNY' : 'USD', disabled: lock, title: '单价币种', style: { width: '64px' }, onChange: function (event) { pricingSaveOffer(ctx, offer.id, { currency: event.target.value }, '币种已切换') } },
                    h('option', { value: 'USD' }, 'USD'),
                    h('option', { value: 'CNY' }, 'CNY'),
                  ),
                ),
              ),
              h(
                'td',
                null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ghost tiny',
                    disabled: lock,
                    title: '写成 0 价（manual + 输入/输出 0 + CNY），免费池判定按实际价算',
                    onClick: function () {
                      pricingSaveOffer(
                        ctx,
                        offer.id,
                        { pricingMode: 'manual', ratio: null, inPrice: 0, outPrice: 0, currency: 'CNY' },
                        '已标为免费，去「免费」页看看',
                      )
                    },
                  },
                  '标为免费',
                ),
              ),
            )
          }),
        ),
      ),
    ),
  )
}

// ── 忽略模型：厂牌分组与已知模型（对齐网页版 knownModels/groupModels） ─────
var PRICING_VENDOR_LABEL = {
  gpt: 'OpenAI', o1: 'OpenAI', o3: 'OpenAI', o4: 'OpenAI', codex: 'OpenAI',
  claude: 'Anthropic', gemini: 'Gemini', grok: 'Grok', llama: 'Llama', mistral: 'Mistral',
  deepseek: 'DeepSeek', glm: '智谱 GLM', chatglm: '智谱 GLM', qwen: '通义千问',
  kimi: 'Moonshot', moonshot: 'Moonshot', doubao: '豆包', hunyuan: '腾讯混元',
  ernie: '文心一言', minimax: 'MiniMax', abab: 'MiniMax', spark: '讯飞星火', yi: '零一万物',
}

function pricingVendorOf(name) {
  var prefix = String(name || '').toLowerCase().split(/[-_./:]/)[0]
  return prefix || '其它'
}

function pricingVendorLabel(prefix) {
  return PRICING_VENDOR_LABEL[prefix] || prefix
}

/** 出现过的模型名 + 覆盖站点数（含已被忽略的） */
function pricingKnownModels(state) {
  var counts = new Map()
  var index = Array.isArray(state.modelIndex) ? state.modelIndex : []
  index.forEach(function (row) {
    if (row && row.name) counts.set(String(row.name), Number(row.sites) || 0)
  })
  var unpriced = Array.isArray(state.unpriced) ? state.unpriced : []
  unpriced.forEach(function (offer) {
    var key = String((offer && (offer.modelKey || offer.upstreamName)) || '').trim()
    if (key && !counts.has(key)) counts.set(key, 1)
  })
  var ignored = (state.settings && state.settings.ignoredModels) || []
  ignored.forEach(function (key) {
    var name = String(key || '').trim()
    if (name && !counts.has(name)) counts.set(name, 0)
  })
  return Array.from(counts.entries()).sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]))
  })
}

/** 按厂牌分组；组内按名字，组间按模型数降序 */
function pricingGroupModels(rows, ignoredNames) {
  var ignored = new Set(ignoredNames || [])
  var groups = new Map()
  rows.forEach(function (pair) {
    var key = pricingVendorOf(pair[0])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pair)
  })
  return Array.from(groups.entries())
    .map(function (entry) {
      var items = entry[1]
      return {
        key: entry[0],
        label: pricingVendorLabel(entry[0]),
        items: items,
        ignoredCount: items.filter(function (pair) {
          return ignored.has(pair[0])
        }).length,
      }
    })
    .sort(function (a, b) {
      return b.items.length - a.items.length || String(a.label).localeCompare(String(b.label))
    })
}

function PricesView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var settings = state.settings || {}
  var ranked = Array.isArray(state.ranked) ? state.ranked : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var providers = Array.isArray(state.providers) ? state.providers : []
  var scores = state.scores || {}
  var benchmarks = state.benchmarks || {}
  var unpriced = Array.isArray(state.unpriced) ? state.unpriced : []

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var ignoredOpenPair = React.useState(false)
  var ignoredOpen = ignoredOpenPair[0]
  var setIgnoredOpen = ignoredOpenPair[1]
  var collapsePair = React.useState({})
  var collapse = collapsePair[0]
  var setCollapse = collapsePair[1]

  var nameMap = React.useMemo(
    function () {
      var map = {}
      providers.forEach(function (provider) {
        map[provider.id] = provider.name || provider.id
      })
      return map
    },
    [providers],
  )

  var freeMap = React.useMemo(
    function () {
      return pricingGroupFreeMap(offers)
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

  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var msgPair = React.useState(null)
  var msg = msgPair[0]
  var setMsg = msgPair[1]

  var visibleGroups = React.useMemo(
    function () {
      var text = String(search || '').trim().toLowerCase()
      if (!text) return ranked
      return ranked.filter(function (group) {
        return String(group.modelKey || '').toLowerCase().indexOf(text) >= 0
      })
    },
    [ranked, search],
  )

  var ctx = React.useMemo(
    function () {
      return { settings: settings, scores: scores, nameMap: nameMap, freeMap: freeMap, collapse: collapse, toggle: toggle, benchmarks: benchmarks, busy: busy, setBusy: setBusy, setMsg: setMsg, reload: props.onReload }
    },
    [settings, scores, nameMap, freeMap, collapse, toggle, benchmarks, busy],
  )

  var panels = React.useMemo(
    function () {
      return visibleGroups.map(function (group) {
        return pricingGroupPanel(group, ctx)
      })
    },
    [visibleGroups, ctx],
  )

  var unpricedBlock = React.useMemo(
    function () {
      return pricingUnpricedBlock(unpriced, ctx)
    },
    [unpriced, ctx],
  )

  var ignoredCount = Array.isArray(settings.ignoredModels) ? settings.ignoredModels.length : 0

  var toolbar = h(
    'div',
    { className: 'toolbar' },
    h('input', {
      className: 'search',
      type: 'search',
      placeholder: '搜索模型名…',
      value: search,
      onChange: function (event) {
        setSearch(event.target.value)
      },
    }),
    h('span', { className: 'hint', style: { margin: 0 } }, visibleGroups.length + ' / ' + ranked.length + ' 个模型'),
    h('span', { className: 'grow' }),
    // 说明紧跟按钮（原来只有 hover 才看得到，忽略过模型之后才在下方提示区出现一截，
    // 用户反馈「文字说明和按钮分开了」）——可见文案常驻，提示区的条件段随之删除。
    h('span', { className: 'hint', style: { margin: 0 } }, '忽略后不再参与比价、智能决策、探针和网关'),
    h(
      'button',
      {
        type: 'button',
        className: 'with-icon',
        title: '忽略后不再参与比价、智能决策、探针和网关',
        onClick: function () {
          setIgnoredOpen(true)
        },
      },
      Icon('eye-off', { size: 14 }),
      '忽略模型' + (ignoredCount ? ' ' + ignoredCount : ''),
    ),
  )

  var hints = h(
    'div',
    null,
    h(
      'p',
      { className: 'hint' },
      '价格直接改，失焦即保存。「' +
        pricingSym(settings) +
        '/百万 token」是综合成本：输入按 25%、输出按 75% 加权。人民币标价的站按「基准价」页里的汇率折算成美元比较。',
    ),
    h(
      'p',
      { className: 'hint' },
      '改价直接填，失焦即保存；切「倍率 / 价格」模式即时生效（切到「价格」时 daemon 会把当前算出的价格种进输入框）。「标为免费」写成 0 价，免费池判定按实际价算。',
    ),
  )

  if (!ranked.length) {
    return h(
      'section',
      { className: 'view wide' },
      h(
        'div',
        { className: 'empty', style: { marginBottom: '18px' } },
        h('h3', null, unpriced.length ? '模型已同步，但还没定价' : '还没有模型'),
        h(
          'p',
          null,
          unpriced.length
            ? '在下面的表格里给每个模型填一个倍率（或直接填单价），就能开始比价。'
            : '先去「站点」同步模型列表。',
        ),
        unpriced.length
          ? h(
              'button',
              { className: 'primary', type: 'button', onClick: function () { if (props.onGoTab) props.onGoTab('benchmark') } },
              '先去载入基准价',
            )
          : h(
              'button',
              { className: 'primary', type: 'button', onClick: function () { if (props.onGoTab) props.onGoTab('monitor') } },
              '去站点页',
            ),
      ),
      unpricedBlock,
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    toolbar,
    msg
      ? h(
          'p',
          { className: 'msg-line ' + (msg.kind === 'err' ? 'is-err' : 'is-ok'), role: msg.kind === 'err' ? 'alert' : 'status' },
          msg.text,
        )
      : null,
    hints,
    panels,
    unpricedBlock,
    ignoredOpen
      ? h(IgnoredModelsModal, {
          state: state,
          api: api,
          onClose: function () {
            setIgnoredOpen(false)
          },
        })
      : null,
  )
}

// ── 忽略模型弹窗（对齐网页版 openIgnoredModels） ──────────────────────
function IgnoredModelsModal(props) {
  var raw = props.state || {}
  var state = raw && raw.state && typeof raw.state === 'object' ? raw.state : raw
  var api = props.api || {}
  var settings = state.settings || {}
  var ignored = Array.isArray(settings.ignoredModels)
    ? settings.ignoredModels.filter(Boolean).map(String)
    : []

  var known = React.useMemo(
    function () {
      return pricingKnownModels(state)
    },
    [state],
  )

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var foldedPair = React.useState({})
  var folded = foldedPair[0]
  var setFolded = foldedPair[1]
  var initialChecked = {}
  ignored.forEach(function (name) {
    initialChecked[name] = true
  })
  var checkedPair = React.useState(initialChecked)
  var checked = checkedPair[0]
  var setChecked = checkedPair[1]
  var savingPair = React.useState(false)
  var saving = savingPair[0]
  var setSaving = savingPair[1]
  var errorPair = React.useState('')
  var error = errorPair[0]
  var setError = errorPair[1]

  var groups = React.useMemo(
    function () {
      var query = String(search || '').trim().toLowerCase()
      var rows = query
        ? known.filter(function (pair) {
            return String(pair[0]).toLowerCase().indexOf(query) >= 0
          })
        : known
      return pricingGroupModels(rows, ignored)
    },
    [known, search, ignored.join('\u0000')],
  )

  var totalShown = groups.reduce(function (sum, group) {
    return sum + group.items.length
  }, 0)
  var checkedNames = Object.keys(checked).filter(function (name) {
    return !!checked[name]
  })

  function toggleOne(name) {
    var next = Object.assign({}, checked)
    next[name] = !checked[name]
    setChecked(next)
  }

  function toggleGroup(group) {
    var all = group.items.every(function (pair) {
      return !!checked[pair[0]]
    })
    var next = Object.assign({}, checked)
    group.items.forEach(function (pair) {
      next[pair[0]] = !all
    })
    setChecked(next)
  }

  function toggleFold(key) {
    var next = Object.assign({}, folded)
    if (next[key]) delete next[key]
    else next[key] = true
    setFolded(next)
  }

  function save() {
    setSaving(true)
    setError('')
    writeOp('PATCH', '/api/settings', { ignoredModels: checkedNames.slice() }).then(function (res) {
      setSaving(false)
      if (!res || !res.ok) {
        setError((res && res.error) || '保存失败')
        return
      }
      if (typeof api.reload === 'function') api.reload()
      if (typeof props.onClose === 'function') props.onClose()
    })
  }

  var groupNodes = groups.map(function (group) {
    var allChecked = group.items.every(function (pair) {
      return !!checked[pair[0]]
    })
    var isFolded = !!folded[group.key]
    return h(
      'div',
      { className: 'ig-group', key: group.key },
      h(
        'div',
        { className: 'ig-row ig-group-head' },
        h(
          'button',
          {
            type: 'button',
            className: 'ig-caret' + (isFolded ? ' is-collapsed' : ''),
            title: isFolded ? '展开' : '折叠',
            onClick: function () {
              toggleFold(group.key)
            },
          },
          isFolded ? '▸' : '▾',
        ),
        h('input', {
          type: 'checkbox',
          checked: allChecked,
          title: '整组勾选',
          onChange: function () {
            toggleGroup(group)
          },
        }),
        h('span', { className: 'ig-vendor' }, group.label),
        h(
          'span',
          { className: 'hint' },
          group.items.length + ' 个模型 · 已忽略 ' + group.ignoredCount,
        ),
      ),
      isFolded
        ? null
        : h(
            'div',
            { className: 'ig-children' },
            group.items.map(function (pair) {
              return h(
                'label',
                { className: 'ig-row ig-child', key: pair[0] },
                h('input', {
                  type: 'checkbox',
                  checked: !!checked[pair[0]],
                  onChange: function () {
                    toggleOne(pair[0])
                  },
                }),
                h('span', { className: 'mono' }, pair[0]),
                h(
                  'span',
                  { className: 'hint' },
                  pair[1] > 0 ? pair[1] + ' 个站' : '已不在榜单里',
                ),
              )
            }),
          ),
    )
  })

  return h(
    'div',
    { className: 'modal' },
    h('div', {
      className: 'modal-backdrop',
      onClick: function () {
        if (typeof props.onClose === 'function') props.onClose()
      },
    }),
    h(
      'div',
      { className: 'modal-panel', style: { width: 'min(760px, calc(100vw - 40px))' } },
      h(
        'div',
        { className: 'modal-head' },
        h('h3', null, '忽略模型'),
        h(
          'button',
          {
            type: 'button',
            className: 'ghost',
            onClick: function () {
              if (typeof props.onClose === 'function') props.onClose()
            },
          },
          '关闭',
        ),
      ),
      h(
        'div',
        { className: 'modal-body' },
        h(
          'p',
          { className: 'hint' },
          '勾上的模型不再参与比价、智能决策、探针和网关；点厂牌可整组勾选，随时取消。',
        ),
        h(
          'div',
          { className: 'toolbar' },
          h('input', {
            className: 'search',
            type: 'search',
            placeholder: '搜索模型名…',
            value: search,
            onChange: function (event) {
              setSearch(event.target.value)
            },
          }),
          h(
            'span',
            { className: 'hint', style: { margin: 0 } },
            totalShown + ' / ' + known.length + ' 个模型',
          ),
          h('span', { className: 'grow' }),
          h('span', { className: 'hint', style: { margin: 0 } }, '已忽略 ' + checkedNames.length + ' 个'),
        ),
        groups.length
          ? h('div', { className: 'ig-list' }, groupNodes)
          : h('p', { className: 'hint' }, '没有匹配的模型。'),
        error ? h('p', { className: 'alert danger' }, error) : null,
        h(
          'div',
          { className: 'toolbar', style: { marginTop: '12px' } },
          h('span', { className: 'grow' }),
          h(
            'button',
            {
              type: 'button',
              className: 'ghost',
              onClick: function () {
                if (typeof props.onClose === 'function') props.onClose()
              },
            },
            '取消',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'primary',
              disabled: !!saving,
              title: '保存忽略名单（PATCH /api/settings）',
              onClick: save,
            },
            saving ? '保存中…' : '保存',
          ),
        ),
      ),
    ),
  )
}

    // ── part: 60-decision.js ──
// ── 智能决策页：移植 web/app.js renderDecision()（2171-2281）──────────
// 与网页版一致：↑↓ 手动排序 / 「恢复自动」走 PUT /api/decisions/:model/order
// （P3.2 起在写代理白名单里），只在「可路由」的候选之间调换，保存后重拉全量快照。
// decisions 只在全量 state 里（GET state?full=1），轻量快照没有，所以要自己取。

function decisionBlockedLabel(blocked) {
  var labels = {
    quota: '额度不足',
    budget: '单次预算超限',
    'rate-limit': '限流中',
    'model-missing': '模型不可用',
  }
  var label = (blocked && labels[blocked.kind]) || '暂时不可用'
  return label + ' · 冷却中'
}

/** 与网页版 decisionState() 同序同文案：tooSlow → 放行标记 → blocked → 状态机。 */
function decisionStatus(candidate) {
  if (!candidate) return { label: '未探测', cls: '' }
  if (candidate.tooSlow) return { label: '太慢', cls: 'warn' }
  var passed = candidate.routable && candidate.probeOk === false
  function tag(label, cls) {
    return { label: passed ? label + ' · 已放行' : label, cls: passed ? 'warn' : cls }
  }
  if (candidate.blocked) return tag(decisionBlockedLabel(candidate.blocked), 'warn')
  if (candidate.status === 'stale') return tag('评分过期', 'warn')
  if (candidate.status === 'degraded') return tag('结果可疑', 'warn')
  if (candidate.status === 'unstable') return tag('不稳定', 'danger')
  if (candidate.status === 'inconclusive') return tag('证据不足', '')
  if (candidate.status === 'unknown') return tag('未探测', '')
  return { label: '可用', cls: 'ok' }
}

function decisionPriceText(cny, settings) {
  if (typeof pricingPriceText === 'function') return pricingPriceText(cny, settings)
  return fmtMoney(cny)
}

function decisionRow(candidate, index, decision, ctx) {
  var badge = decisionStatus(candidate)
  var isChosen = candidate.offerId === decision.chosenOfferId
  var busy = ctx.busy !== '' && ctx.busy !== decision.modelKey
  var arrows = candidate.routable
    ? [
        h(
          'button',
          {
            key: 'up',
            type: 'button',
            className: 'ghost tiny',
            disabled: busy,
            title: '上移（只在可路由的候选之间调换，手动顺序优先于自动排序）',
            onClick: function () {
              ctx.move(decision, candidate.offerId, 'up')
            },
          },
          '↑',
        ),
        h(
          'button',
          {
            key: 'down',
            type: 'button',
            className: 'ghost tiny',
            disabled: busy,
            title: '下移（只在可路由的候选之间调换，手动顺序优先于自动排序）',
            onClick: function () {
              ctx.move(decision, candidate.offerId, 'down')
            },
          },
          '↓',
        ),
      ]
    : null
  var showUpstream = candidate.upstreamName && candidate.upstreamName !== decision.modelKey
  var qualitySub =
    candidate.confidence && candidate.confidence !== 'high'
      ? h('div', { className: 'sub' }, fmtInt(candidate.samples) + ' 样本')
      : null

  return h(
    'tr',
    { key: candidate.offerId || 'c' + index, className: isChosen ? 'cheapest' : undefined },
    h('td', { style: { whiteSpace: 'nowrap' } }, arrows),
    h('td', { className: 'num', style: { color: 'var(--faint)' } }, index + 1),
    h(
      'td',
      null,
      candidate.providerName || '—',
      isChosen ? h('span', { key: 'chosen', className: 'badge ok' }, '当前') : null,
      showUpstream ? h('div', { className: 'sub mono' }, candidate.upstreamName) : null,
    ),
    h(
      'td',
      null,
      candidate.group
        ? h(
            'span',
            {
              className: 'badge ' + (typeof pricingGroupChipClass === 'function' ? pricingGroupChipClass(ctx.freeMap, candidate.providerId, candidate.group) : ''),
            },
            candidate.group,
          )
        : h('span', { style: { color: 'var(--faint)' } }, '默认'),
    ),
    h('td', { className: 'num' }, candidate.price === null || candidate.price === undefined ? '—' : decisionPriceText(candidate.price, ctx.settings)),
    h(
      'td',
      { className: 'num' },
      candidate.quality === null || candidate.quality === undefined ? '—' : Number(candidate.quality).toFixed(2),
      qualitySub,
    ),
    h(
      'td',
      { className: 'num' },
      candidate.effective === null || candidate.effective === undefined ? '—' : decisionPriceText(candidate.effective, ctx.settings),
    ),
    h('td', { className: 'num' }, candidate.ttftMs === null || candidate.ttftMs === undefined ? '—' : candidate.ttftMs + 'ms'),
    h(
      'td',
      null,
      h('span', { className: 'badge ' + badge.cls }, badge.label),
      candidate.statusReason ? h('div', { className: 'sub' }, candidate.statusReason) : null,
    ),
  )
}

function decisionPanel(decision, ctx) {
  var panelKey = 'decision:' + decision.modelKey
  var isCollapsed = Boolean(ctx.collapse[panelKey])
  var candidates = Array.isArray(decision.candidates) ? decision.candidates : []
  var rows = candidates.map(function (candidate, index) {
    return decisionRow(candidate, index, decision, ctx)
  })
  return h(
    'div',
    { className: 'table-wrap', key: decision.modelKey },
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
            ctx.toggle(panelKey)
          },
        },
        isCollapsed ? '▸' : '▾',
      ),
      h('span', { className: 'model mono' }, decision.modelKey),
      h('span', { className: 'spread' }, decision.chosenProviderName ? '当前选 ' + decision.chosenProviderName : '没有可用供给'),
      decision.manual
        ? h(
            'button',
            {
              type: 'button',
              className: 'ghost tiny',
              disabled: ctx.busy !== '',
              title: '清掉手动顺序，恢复「有效成本 = 价格 ÷ 质量」自动排序',
              onClick: function () {
                ctx.reset(decision, [], '已恢复自动排序')
              },
            },
            '恢复自动',
          )
        : null,
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
              h('th', { style: { width: '66px' } }),
              h('th', { className: 'num' }, '#'),
              h('th', null, '站点'),
              h('th', null, '分组'),
              h('th', { className: 'num' }, '价格'),
              h('th', { className: 'num' }, '质量'),
              h('th', { className: 'num' }, '有效成本'),
              h('th', { className: 'num' }, '首字'),
              h('th', null, '状态'),
            ),
          ),
          h('tbody', null, rows),
        ),
  )
}

function DecisionUntrustedSwitch(props) {
  var settings = props.settings
  var saving = props.saving
  var checked = props.checked
  return h(
    'div',
    { className: 'switch-row', style: { marginBottom: '12px' } },
    h(
      'label',
      { className: 'switch', title: saving ? '正在保存…' : '写入 PATCH /api/settings 的 allowUntrusted' },
      h('input', {
        type: 'checkbox',
        checked: checked,
        disabled: saving,
        onChange: function (event) {
          props.onChange(event.target.checked)
        },
      }),
      h('span', { className: 'switch-track' }, h('span', { className: 'switch-knob' })),
      h(
        'span',
        { className: 'switch-text' },
        h('b', null, '放行可疑供给'),
        h('span', null, '探针判定可疑（指纹不符 / 输出截断 / 用量虚报 / 评分过期）的站，也按有效成本正常参与选站'),
      ),
    ),
    checked
      ? h(
          'div',
          { className: 'alert', style: { marginTop: '10px', background: 'var(--warn-soft)', borderColor: 'var(--warn-border)' } },
          h(
            'div',
            null,
            h('div', { className: 'name' }, '已放行：可疑的站会正常参与选站'),
            h(
              'div',
              { className: 'desc' },
              '它们仍然按「价格 ÷ 质量」排序——质量差一半，成本就翻倍，只有便宜到足够多才会被选中。首字上限仍然独立生效。如果你更在意输出是否可信，把这个开关关掉。',
            ),
          ),
        )
      : null,
  )
}

function DecisionView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var settings = state.settings || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var offers = Array.isArray(state.offers) ? state.offers : []
  var embedded = Array.isArray(state.decisions) ? state.decisions : null
  var at = api.state && api.state.at

  var searchPair = React.useState('')
  var search = searchPair[0]
  var setSearch = searchPair[1]
  var collapsePair = React.useState({})
  var collapse = collapsePair[0]
  var setCollapse = collapsePair[1]
  var fetchedPair = React.useState(null)
  var fetched = fetchedPair[0]
  var setFetched = fetchedPair[1]
  var loadingPair = React.useState(false)
  var loading = loadingPair[0]
  var setLoading = loadingPair[1]
  var loadErrorPair = React.useState('')
  var loadError = loadErrorPair[0]
  var setLoadError = loadErrorPair[1]
  var savingPair = React.useState(false)
  var saving = savingPair[0]
  var setSaving = savingPair[1]
  var saveErrorPair = React.useState('')
  var saveError = saveErrorPair[0]
  var setSaveError = saveErrorPair[1]
  var pendingPair = React.useState(null)
  var pending = pendingPair[0]
  var setPending = pendingPair[1]

  var mountedRef = React.useRef(true)
  var lastFetchRef = React.useRef(0)
  var stampRef = React.useRef('')
  var stamp = String(at === undefined || at === null ? '' : at)

  React.useEffect(function () {
    mountedRef.current = true
    return function () {
      mountedRef.current = false
    }
  }, [])

  var loadDecisions = React.useCallback(
    function (force) {
      if (embedded) return
      var now = Date.now()
      if (!force) {
        if (stamp && stampRef.current === stamp && lastFetchRef.current) return
        if (lastFetchRef.current && now - lastFetchRef.current < 60000) return
      }
      setLoading(true)
      setLoadError('')
      fetchJson('state?full=1').then(function (res) {
        if (!mountedRef.current) return
        setLoading(false)
        if (!res || !res.ok) {
          setLoadError((res && res.error) || '读取全量快照失败')
          return
        }
        var body = res.body || {}
        var inner = body.state || body
        var list = inner && Array.isArray(inner.decisions) ? inner.decisions : []
        lastFetchRef.current = Date.now()
        stampRef.current = stamp
        setFetched(list)
      })
    },
    [embedded, stamp],
  )

  React.useEffect(
    function () {
      if (embedded) return
      if (!providers.length) return
      loadDecisions(false)
    },
    [embedded, providers.length, loadDecisions],
  )

  var decisions = embedded || fetched || []
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

  var visible = React.useMemo(
    function () {
      var text = String(search || '').trim().toLowerCase()
      if (!text) return decisions
      return decisions.filter(function (decision) {
        return String(decision.modelKey || '').toLowerCase().indexOf(text) >= 0
      })
    },
    [decisions, search],
  )

  var busyPair = React.useState('')
  var busy = busyPair[0]
  var setBusy = busyPair[1]
  var msgPair = React.useState(null)
  var msg = msgPair[0]
  var setMsg = msgPair[1]

  function saveOrder(decision, order, okText) {
    if (busy) return
    setBusy(decision.modelKey)
    setMsg(null)
    writeOp('PUT', '/api/decisions/' + encodeURIComponent(decision.modelKey) + '/order', { order: order }).then(
      function (res) {
        setBusy('')
        if (res && res.ok) {
          setMsg({ kind: 'ok', text: okText || '排序已保存' })
          loadDecisions(true)
        } else {
          var err = res && res.error
          var text = err && typeof err === 'object' && err.message ? err.message : String(err || '未知错误')
          setMsg({ kind: 'err', text: '排序保存失败：' + text })
        }
      },
    )
  }

  /** 与网页版 move-up/move-down 同逻辑：只在「可路由」的候选之间调换。 */
  function moveCandidate(decision, offerId, direction) {
    var ids = (decision.candidates || [])
      .filter(function (c) {
        return c.routable
      })
      .map(function (c) {
        return c.offerId
      })
    var index = ids.indexOf(offerId)
    var target = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || target < 0 || target >= ids.length) return
    var tmp = ids[index]
    ids[index] = ids[target]
    ids[target] = tmp
    saveOrder(decision, ids)
  }

  var ctx = React.useMemo(
    function () {
      return { settings: settings, collapse: collapse, toggle: toggle, freeMap: freeMap, busy: busy, move: moveCandidate, reset: saveOrder }
    },
    [settings, collapse, toggle, freeMap, busy],
  )

  var panels = React.useMemo(
    function () {
      return visible.map(function (decision) {
        return decisionPanel(decision, ctx)
      })
    },
    [visible, ctx],
  )

  var allowUntrusted = pending === null ? Boolean(settings.allowUntrusted) : Boolean(pending)

  function saveAllowUntrusted(next) {
    setPending(next)
    setSaving(true)
    setSaveError('')
    writeOp('PATCH', '/api/settings', { allowUntrusted: next }).then(function (res) {
      setSaving(false)
      if (!res || !res.ok) {
        setPending(null)
        setSaveError((res && (res.error || res.message)) || '保存失败')
        return
      }
      if (api.reload) {
        Promise.resolve(api.reload()).then(
          function () {
            setPending(null)
          },
          function () {
            setPending(null)
          },
        )
      } else {
        setPending(null)
      }
    })
  }

  if (!providers.length) {
    return h(
      'section',
      { className: 'view wide' },
      h(
        'div',
        { className: 'empty' },
        h('h3', null, '还没有站点'),
        h('p', null, '先添加站点并同步模型，这里会显示路由怎么选。'),
        h(
          'button',
          {
            className: 'primary',
            type: 'button',
            onClick: function () {
              if (props.onGoTab) props.onGoTab('monitor')
            },
          },
          Icon('plus', { size: 14 }),
          '新增站点',
        ),
      ),
    )
  }

  if (!decisions.length) {
    return h(
      'section',
      { className: 'view wide' },
      loading
        ? h('p', { className: 'hint' }, '正在读取全量快照（决策需要 GET state?full=1）…')
        : loadError
          ? h(
              'div',
              { className: 'alert' },
              h(
                'div',
                { className: 'grow' },
                h('div', { className: 'name' }, '读不到决策数据'),
                h('div', { className: 'desc' }, loadError),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ghost tiny',
                  onClick: function () {
                    loadDecisions(true)
                  },
                },
                Icon('refresh', { size: 14 }),
                '重试',
              ),
            )
          : h(
              'div',
              { className: 'empty' },
              h('h3', null, '还没有可决策的模型'),
              h('p', null, '先在比价页给模型填上价格。'),
            ),
    )
  }

  return h(
    'section',
    { className: 'view wide' },
    h(
      'div',
      { className: 'toolbar' },
      h('input', {
        id: 'decision-search',
        className: 'search',
        type: 'search',
        placeholder: '搜索模型名…',
        value: search,
        onChange: function (event) {
          setSearch(event.target.value)
        },
      }),
      h('span', { className: 'hint', style: { margin: 0 } }, visible.length + ' / ' + decisions.length + ' 个模型'),
      h('span', { className: 'grow' }),
      h(
        'button',
        {
          type: 'button',
          className: 'with-icon',
          disabled: loading,
          title: '决策数据来自全量快照（GET state?full=1），大概 400KB，点了才重新取',
          onClick: function () {
            loadDecisions(true)
          },
        },
        Icon('refresh', { size: 14 }),
        loading ? '读取中…' : '刷新决策',
      ),
    ),
    loadError
      ? h(
          'div',
          { className: 'alert' },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, '决策没刷新成功'), h('div', { className: 'desc' }, loadError)),
        )
      : null,
    msg
      ? h(
          'p',
          { className: 'msg-line ' + (msg.kind === 'err' ? 'is-err' : 'is-ok'), role: msg.kind === 'err' ? 'alert' : 'status' },
          msg.text,
        )
      : null,
    h(DecisionUntrustedSwitch, {
      settings: settings,
      loading: loading,
      saving: saving,
      checked: allowUntrusted,
      onChange: saveAllowUntrusted,
    }),
    saveError
      ? h(
          'div',
          { className: 'alert danger' },
          h('div', { className: 'grow' }, h('div', { className: 'name' }, '保存失败'), h('div', { className: 'desc' }, saveError)),
        )
      : null,
    h('p', { className: 'hint' }, '默认按「有效成本 = 价格 ÷ 质量」排序，用 ↑↓ 手动调整「可用」那几条的先后——不可信的站不会因为你拖它而排到前面。'),
    h(
      'p',
      { className: 'hint' },
      '注意：',
      h('b', null, '同一个模型在不同站的状态是各自独立的'),
      '（A 站健康、B 站掉包很正常），所以这里按「站 × 模型」逐条评估，状态下方会写明具体原因。',
    ),
    panels,
  )
}

    // ── part: 70-probes.js ──
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

    // ── part: 80-usage.js ──
// ── 用量页：移植 web/app.js renderUsage()（2628-2749）─────────────────
// 数据只有快照里的 30 天（state.usage）。网页版 7/90 天走 GET /api/usage?days=N，
// 宿主没有这条代理路由 → 那两个按钮禁用并在 title 里说明。

var USAGE_RANGE_TITLE = '宿主只代理了 GET state（含最近 30 天），没有 /api/usage 路由：7 / 90 天切换不可用'

function usageFormatTokens(value) {
  var n = Number(value) || 0
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

function usageTokenTotal(row) {
  if (!row) return 0
  return (Number(row.input) || 0) + (Number(row.output) || 0)
}

/** byKey / byModel / byProvider 都是 map → 按 token 总量降序的条目数组。 */
function usageSortedEntries(map) {
  var entries = []
  Object.keys(map || {}).forEach(function (key) {
    entries.push([key, map[key] || {}])
  })
  entries.sort(function (a, b) {
    return usageTokenTotal(b[1]) - usageTokenTotal(a[1])
  })
  return entries
}

function usageEmptyRow(cols) {
  return h(
    'tr',
    null,
    h('td', { colSpan: cols, style: { textAlign: 'center', color: 'var(--faint)', padding: '20px' } }, '无数据'),
  )
}

function usageTable(heads, rows, emptyCols) {
  return h(
    'div',
    { className: 'table-wrap' },
    h(
      'table',
      null,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          heads.map(function (head, index) {
            return h('th', { key: 'h' + index, className: head.num ? 'num' : undefined, title: head.title }, head.label)
          }),
        ),
      ),
      h('tbody', null, rows.length ? rows : usageEmptyRow(emptyCols || heads.length)),
    ),
  )
}

function UsageBars(props) {
  var entries = props.entries || []
  var maxTokens = props.maxTokens
  var showLabels = props.showLabels
  return h(
    'div',
    { className: 'card', style: { padding: '14px 16px 10px' } },
    h(
      'div',
      { className: 'bars' },
      entries.map(function (entry, index) {
        var day = entry[0]
        var row = entry[1]
        var total = usageTokenTotal(row)
        var height = total ? Math.max(Math.round((total / maxTokens) * 100), 3) : 1
        var label = showLabels || index % 5 === 0 || index === entries.length - 1 ? String(day).slice(5) : ''
        return h(
          'div',
          {
            key: day,
            className: 'bar-item' + (total ? '' : ' zero'),
            title: day + ' · ' + total + ' token · ' + (row.requests || 0) + ' 次请求',
          },
          h('div', { className: 'bar', style: { height: height + '%' } }),
          h('span', { className: 'bar-label' }, label),
        )
      }),
    ),
    h('div', { className: 'hint', style: { marginTop: '8px' } }, '柱高按 token 总量，悬停看当天明细。'),
  )
}

function UsageView(props) {
  var api = props.api || {}
  var state = pickState({ state: api.state }) || {}
  var usage = state.usage || {}
  var totals = usage.totals || {}
  var providers = Array.isArray(state.providers) ? state.providers : []
  var gatewayKeys = state.gateway && Array.isArray(state.gateway.keys) ? state.gateway.keys : []

  var rangePair = React.useState(30)
  var range = rangePair[0]
  var setRange = rangePair[1]

  var dayEntries = React.useMemo(
    function () {
      return Object.keys(usage.byDay || {})
        .sort(function (a, b) {
          return String(a).localeCompare(String(b))
        })
        .map(function (day) {
          return [day, usage.byDay[day] || {}]
        })
    },
    [usage],
  )

  var maxTokens = React.useMemo(
    function () {
      var max = 1
      dayEntries.forEach(function (entry) {
        var total = usageTokenTotal(entry[1])
        if (total > max) max = total
      })
      return max
    },
    [dayEntries],
  )

  var providerNames = React.useMemo(
    function () {
      var map = {}
      providers.forEach(function (provider) {
        map[provider.id] = provider.name || provider.id
      })
      return map
    },
    [providers],
  )

  var keyNames = React.useMemo(
    function () {
      var map = {}
      gatewayKeys.forEach(function (key) {
        map[key.id] = key.name || key.id
      })
      return map
    },
    [gatewayKeys],
  )

  var keyRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byKey).map(function (entry) {
        var keyId = entry[0]
        var row = entry[1]
        var name = keyNames[keyId] || (keyId === '-' ? '（未认证）' : keyId)
        return h(
          'tr',
          { key: 'k' + keyId },
          h('td', null, name),
          h('td', { className: 'num' }, row.requests || 0),
          h('td', { className: 'num' }, usageFormatTokens(row.input)),
          h('td', { className: 'num' }, usageFormatTokens(row.output)),
          h('td', { className: 'num' }, row.avgTtftMs ? row.avgTtftMs + 'ms' : '—'),
        )
      })
    },
    [usage, keyNames],
  )

  var modelRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byModel)
        .slice(0, 15)
        .map(function (entry) {
          var model = entry[0]
          var row = entry[1]
          return h(
            'tr',
            { key: 'm' + model },
            h('td', { className: 'mono' }, model),
            h('td', { className: 'num' }, row.requests || 0),
            h('td', { className: 'num' }, usageFormatTokens(row.input)),
            h('td', { className: 'num' }, usageFormatTokens(row.output)),
            h('td', { className: 'num' }, row.avgTtftMs ? row.avgTtftMs + 'ms' : '—'),
          )
        })
    },
    [usage],
  )

  var providerRows = React.useMemo(
    function () {
      return usageSortedEntries(usage.byProvider).map(function (entry) {
        var providerId = entry[0]
        var row = entry[1]
        var name = providerNames[providerId] || (providerId === '-' ? '（未成功）' : providerId)
        return h(
          'tr',
          { key: 'p' + providerId },
          h('td', null, name),
          h('td', { className: 'num' }, row.requests || 0),
          h('td', { className: 'num' }, usageFormatTokens(row.input)),
          h('td', { className: 'num' }, usageFormatTokens(row.output)),
          h('td', { className: 'num' }, row.avgLatencyMs ? row.avgLatencyMs + 'ms' : '—'),
        )
      })
    },
    [usage, providerNames],
  )

  if (!totals.requests) {
    return h(
      'section',
      { className: 'view' },
      h(
        'div',
        { className: 'empty' },
        h('h3', null, '暂无用量数据'),
        h('p', null, '在客户端里把 Base URL 指向网关、填上 Key 之后，这里会开始记录。'),
        h(
          'button',
          {
            className: 'primary',
            type: 'button',
            onClick: function () {
              if (props.onGoTab) props.onGoTab('gateway')
            },
          },
          '去配置网关',
        ),
      ),
    )
  }

  var days = range === 7 || range === 90 ? range : 30
  var seg = h(
    'div',
    { className: 'seg' },
    [7, 30, 90].map(function (value) {
      var unavailable = value !== 30
      return h(
        'button',
        {
          key: 'r' + value,
          type: 'button',
          className: value === days ? 'active' : '',
          disabled: unavailable,
          title: unavailable ? USAGE_RANGE_TITLE : '快照自带的统计窗口就是 30 天',
          onClick: function () {
            setRange(value)
          },
        },
        value + ' 天',
      )
    }),
  )

  return h(
    'section',
    { className: 'view' },
    seg,
    h(
      'p',
      { className: 'hint', style: { marginTop: '10px' } },
      '最近 ' + days + ' 天 · ' + (totals.requests || 0) + ' 次请求 · ' + usageFormatTokens(usageTokenTotal(totals)) + ' token',
    ),
    h(
      'div',
      { className: 'stats', style: { marginTop: '16px' } },
      h('div', { className: 'stat' }, h('div', { className: 'k' }, '请求数'), h('div', { className: 'v' }, totals.requests)),
      h(
        'div',
        { className: 'stat' },
        h('div', { className: 'k' }, '输入 token'),
        h('div', { className: 'v' }, usageFormatTokens(totals.input)),
      ),
      h(
        'div',
        { className: 'stat' },
        h('div', { className: 'k' }, '输出 token'),
        h('div', { className: 'v' }, usageFormatTokens(totals.output)),
      ),
      h('div', { className: 'stat' }, h('div', { className: 'k' }, '错误'), h('div', { className: 'v' }, totals.errors || 0)),
    ),
    h('h3', { className: 'section-title' }, '按天'),
    h(UsageBars, { entries: dayEntries, maxTokens: maxTokens, showLabels: dayEntries.length <= 10 }),
    h('h3', { className: 'section-title' }, '按 Key'),
    usageTable(
      [
        { label: 'Key' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均首字', num: true },
      ],
      keyRows,
      5,
    ),
    h('h3', { className: 'section-title' }, '按模型'),
    usageTable(
      [
        { label: '模型' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均首字', num: true },
      ],
      modelRows,
      5,
    ),
    h('h3', { className: 'section-title' }, '按站点'),
    usageTable(
      [
        { label: '站点' },
        { label: '请求', num: true },
        { label: '输入', num: true },
        { label: '输出', num: true },
        { label: '平均耗时', num: true },
      ],
      providerRows,
      5,
    ),
  )
}
    // <<< parts:end

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
      var autoPair = React.useState(true)
      var auto = autoPair[0]
      var setAuto = autoPair[1]
      var api = useApi(auto ? 15000 : 0)
      var pair = React.useState((props && props.initialTab) || 'overview')
      var tab = pair[0]
      var setTab = pair[1]

      React.useEffect(function () {
        return injectTheme(currentDoc())
      }, [])

      var health = api.health || {}
      var daemon = health.daemon || {}
      var activeTab =
        TABS.filter(function (item) {
          return item.id === tab
        })[0] || TABS[0]

      var viewProps = {
        api: api,
        health: health,
        state: api.state,
        busy: api.busy,
        loading: api.loading,
        error: api.error,
        restart: api.restart,
        onReload: api.reload,
        onGoTab: setTab,
      }

      // 片段缺失时降级到概览，避免整个面板白屏（视图片段在 src/parts/ 下）
      var viewMap = {
        monitor: typeof MonitorView === 'function' ? MonitorView : null,
        free: typeof FreeView === 'function' ? FreeView : null,
        pricing: typeof PricesView === 'function' ? PricesView : null,
        decision: typeof DecisionView === 'function' ? DecisionView : null,
        probes: typeof ProbesView === 'function' ? ProbesView : null,
        gateway: typeof GatewayView === 'function' ? GatewayView : null,
        usage: typeof UsageView === 'function' ? UsageView : null,
        benchmark: typeof BenchmarkView === 'function' ? BenchmarkView : null,
        overview: typeof OverviewView === 'function' ? OverviewView : null,
      }
      var body
      if (viewMap[tab] && activeTab.selfRoot) body = h(viewMap[tab], viewProps)
      else if (viewMap[tab]) body = h(viewMap[tab], viewProps)
      else body = h(MissingView, { id: tab })

      if (!activeTab.selfRoot) {
        body = h('section', { className: 'view' + (activeTab.wide ? ' wide' : '') }, body)
      }

      var sub = activeTab.desc
      var snap = api.state && api.state.state
      if (snap && snap.summary && tab === 'overview') {
        sub = snap.summary.providerCount + ' 个站点 · ' + snap.summary.offerCount + ' 条模型供给 · ' + (snap.probeTotal || 0) + ' 次探测'
      } else if (snap && snap.providers && tab === 'monitor') {
        sub = snap.providers.length + ' 个站点'
      }

      var errorLine =
        api.state && api.state.ok === false
          ? h(
              'div',
              { className: 'alert danger', style: { marginBottom: '12px' } },
              h('span', { className: 'name' }, '读不到数据'),
              h('span', { className: 'grow' }),
              h('span', { className: 'desc' }, api.state.error || api.error || '未知错误'),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ghost',
                  onClick: function () {
                    if (typeof api.reload === 'function') api.reload()
                  },
                },
                '重试',
              ),
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
          h('div', { className: 'content' }, errorLine, body),
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

      // 记住客户端 ctx：模型选择器刷新（nudgeModelCatalog）要在面板里拿 ctx.modelDirectories。
      MANAGE_CLIENT_CTX = ctx

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
        OverviewView: typeof OverviewView === 'function' ? OverviewView : null,
        AutoDshCard: typeof AutoDshCard === 'function' ? AutoDshCard : null,
        autoDshModelRows: typeof autoDshModelRows === 'function' ? autoDshModelRows : null,
        MonitorView: typeof MonitorView === 'function' ? MonitorView : null,
        FreeView: typeof FreeView === 'function' ? FreeView : null,
        PricesView: typeof PricesView === 'function' ? PricesView : null,
        IgnoredModelsModal: typeof IgnoredModelsModal === 'function' ? IgnoredModelsModal : null,
        DecisionView: typeof DecisionView === 'function' ? DecisionView : null,
        ProbesView: typeof ProbesView === 'function' ? ProbesView : null,
        GatewayView: typeof GatewayView === 'function' ? GatewayView : null,
        UsageView: typeof UsageView === 'function' ? UsageView : null,
        BenchmarkView: typeof BenchmarkView === 'function' ? BenchmarkView : null,
        TABS: TABS,
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
