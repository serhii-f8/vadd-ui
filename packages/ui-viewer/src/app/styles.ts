/**
 * VD-194: an entry's title and actions share a row and wrap; meta takes the next line by
 * `order`, so the DOM order stays title, meta, actions.
 *
 * The feed's own chrome. `<body>` is a `.vui-root`, so every color here is a §8.1 token. */
export const feedCss = `
html{scroll-padding-top:calc(var(--feed-bar,60px) + 8px)}
html.dark{color-scheme:dark}
html.light{color-scheme:light}
body.feed{margin:0;background:var(--vui-bg);font-size:14px}
.feed-bar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:8px 12px;border-bottom:1px solid var(--vui-border);background:var(--vui-bg)}
.feed-name{margin:0;font-size:1em;font-weight:600}
.feed-status{flex:1 1 0;margin:0;min-width:8em;color:var(--vui-muted-fg);font-size:.86em}
.feed-status[data-state="gone"]{color:var(--vui-err-text);font-weight:500}
.feed-list{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;max-width:1100px;margin:0 auto;padding:12px}
.feed-empty{margin:0;color:var(--vui-muted-fg)}
.feed-entry{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.feed-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.feed-title{flex:1 1 12em;min-width:0;margin:0;font-size:1.1em;font-weight:600;line-height:1.3}
.feed-meta{order:1;display:flex;flex-basis:100%;gap:6px;min-width:0;color:var(--vui-muted-fg);font-size:.8em;white-space:nowrap}
.feed-meta>*{min-width:0;overflow:hidden;text-overflow:ellipsis}
.feed-meta time{flex:none}
.feed-meta>*+*::before{content:"·"/"";margin-inline-end:6px}
.feed-branch,.feed-cwd{font-family:var(--vui-mono),monospace}
.feed-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;margin-inline-start:auto}
.feed-button{display:inline-flex;align-items:center;min-height:24px;padding:0 6px;border:1px solid var(--vui-border);border-radius:calc(var(--vui-radius) * .5);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:.8em;text-decoration:none}
.feed-button:hover{background:var(--vui-accent);color:var(--vui-accent-fg)}
.feed-button:focus-visible{outline:2px solid var(--vui-info);outline-offset:1px}
.feed-body{isolation:isolate}
.feed-note{margin:0;color:var(--vui-err-text)}
`
