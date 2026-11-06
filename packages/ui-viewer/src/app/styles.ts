/** The feed's own chrome. `<body>` is a `.vui-root`, so every color here is a §8.1 token. */
export const feedCss = `
html.dark{color-scheme:dark}
html.light{color-scheme:light}
body.feed{margin:0;background:var(--vui-bg);font-size:14px}
.feed-bar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:8px 12px;border-bottom:1px solid var(--vui-border);background:var(--vui-bg)}
.feed-name{margin:0;font-size:1em;font-weight:600}
.feed-status{flex:1 1 0;min-width:8em;color:var(--vui-muted-fg);font-size:.86em}
.feed-status[data-state="gone"]{color:var(--vui-err-text);font-weight:500}
.feed-list{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;max-width:1100px;margin:0 auto;padding:12px}
.feed-empty{margin:0;color:var(--vui-muted-fg)}
.feed-entry{display:flex;flex-direction:column;gap:12px;min-width:0;padding:12px;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.feed-head{display:flex;flex-direction:column;gap:4px;min-width:0}
.feed-title{margin:0;font-size:1.25em;font-weight:600;line-height:1.3}
.feed-meta{display:flex;flex-wrap:wrap;gap:0 12px;color:var(--vui-muted-fg);font-size:.86em}
.feed-branch,.feed-cwd{font-family:var(--vui-mono),monospace}
.feed-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.feed-button{padding:2px 8px;border:1px solid var(--vui-border);border-radius:calc(var(--vui-radius) * .5);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:.86em;text-decoration:none}
.feed-button:hover{background:var(--vui-accent);color:var(--vui-accent-fg)}
.feed-button:focus-visible{outline:2px solid var(--vui-info);outline-offset:1px}
.feed-note{margin:0;color:var(--vui-err-text)}
`
