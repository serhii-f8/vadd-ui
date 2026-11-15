// The `ext` tier's rules (VD-182), appended to the core stylesheet by the full build only.
// Like the rest, nothing here reads a document value.

const compareCss = `
.vui-compare th[scope=row]{font-weight:500}
.vui-compare-dir{color:var(--vui-muted-fg);white-space:nowrap}
.vui-compare thead th{vertical-align:bottom}
.vui-compare thead .vui-pick{margin-inline-start:.4em}
.vui-root .vui-table .vui-compare-win{background:color-mix(in srgb,var(--vui-primary) 8%,var(--vui-surface))}
.vui-root .vui-table thead .vui-compare-win{background:color-mix(in srgb,var(--vui-primary) 16%,var(--vui-muted))}
.vui-compare-best{font-weight:600}
.vui-compare-best::after{content:"";display:inline-block;width:.45em;height:.45em;margin-inline-start:.35em;border-radius:50%;background:var(--vui-ok);vertical-align:.12em}
`

const flowCss = `
.vui-flow{min-width:0;overflow-x:auto}
.vui-flow svg{display:block;max-width:none}
.vui-flow text{fill:var(--vui-surface-fg);font-size:12px}
.vui-flow-node{fill:var(--vui-surface);stroke:var(--vui-tone-line,var(--vui-border));stroke-width:1.5}
.vui-flow-box[class*="vui-tone-"] .vui-flow-node{fill:color-mix(in srgb,var(--vui-tone-line) 10%,var(--vui-surface))}
.vui-flow-implicit .vui-flow-node{stroke-dasharray:4 3}
.vui-flow-edge{fill:none;stroke:var(--vui-muted-fg);stroke-width:1.25}
.vui-flow-back{stroke-dasharray:5 4}
.vui-flow-arrows{fill:var(--vui-muted-fg)}
.vui-flow-edge-label path{fill:var(--vui-muted)}
.vui-flow .vui-flow-edge-label text{font-size:11px}
`

export const extCss = compareCss + flowCss
