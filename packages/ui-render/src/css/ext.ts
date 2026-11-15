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

export const extCss = compareCss
