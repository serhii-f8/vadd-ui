// §6.1 and §6.2. Base rules stay in `base.ts`; this file only has what a component adds.

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

const gridColumns = range(1, 6)
  .map(
    (cols) =>
      `.vui-grid[data-vui-cols="${cols}"]{grid-template-columns:repeat(${cols},minmax(0,1fr))}`,
  )
  .join('')

// `layout.ts` clamps a span to the columns, and six is the most there can be.
const gridSpans = range(2, 6)
  .map((span) => `.vui-grid>[data-vui-span="${span}"]{grid-column:span ${span}}`)
  .join('')

const GAPS = { sm: 2, md: 3, lg: 4 }
const stackGaps = Object.entries(GAPS)
  .map(([name, step]) => `.vui-gap-${name}{gap:var(--vui-space-${step})}`)
  .join('')

export const componentCss = `
.vui-toned{position:relative;padding-inline-start:var(--vui-space-2);border-inline-start:3px solid var(--vui-tone-line)}
.vui-marked{padding-inline-start:calc(1.2em + var(--vui-space-2))}
.vui-node-mark{position:absolute;inset-block-start:0;inset-inline-start:var(--vui-space-1);color:var(--vui-tone-text)}
.vui-stack{display:flex;flex-direction:column;min-width:0}
${stackGaps}
.vui-grid-box{min-width:0;container-type:inline-size}
.vui-grid{display:grid;gap:var(--vui-space-3)}
${gridColumns}
${gridSpans}
@container (max-width:479.98px){.vui-grid[data-vui-cols]{grid-template-columns:minmax(0,1fr)}.vui-grid>[data-vui-span]{grid-column:auto}}
.vui-node[data-vui-type="section"]{gap:var(--vui-space-3)}
.vui-node[data-vui-type="card"]{padding:var(--vui-space-3);border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.vui-node[data-vui-type="card"].vui-toned{border-color:var(--vui-tone-line);border-inline-start-width:3px}
.vui-node[data-vui-type="card"].vui-marked{padding-inline-start:calc(1.2em + var(--vui-space-3))}
.vui-node[data-vui-type="card"]>.vui-node-mark{inset-block-start:var(--vui-space-3);inset-inline-start:var(--vui-space-2)}
.vui-tabs,.vui-tab-panel{display:flex;flex-direction:column;gap:var(--vui-space-2);min-width:0}
.vui-tablist{display:flex;flex-wrap:wrap;gap:0 var(--vui-space-1);border-bottom:1px solid var(--vui-border)}
.vui-tab{appearance:none;margin-bottom:-1px;padding:var(--vui-space-1) var(--vui-space-2);border:0;border-bottom:2px solid transparent;background:none;color:var(--vui-muted-fg);font:inherit;cursor:pointer}
.vui-tab:hover{color:var(--vui-fg)}
.vui-tab[aria-selected="true"]{border-bottom-color:var(--vui-primary);color:var(--vui-fg);font-weight:600}
.vui-tab-panel[hidden]{display:none}
.vui-divider{width:100%;margin:0;border:0;border-top:1px solid var(--vui-border)}
.vui-divider-label{display:flex;align-items:center;gap:var(--vui-space-2);color:var(--vui-muted-fg);font-size:.86em}
.vui-divider-label::before,.vui-divider-label::after{content:"";flex:1;border-top:1px solid var(--vui-border)}
.vui-md{display:flex;flex-direction:column;gap:var(--vui-space-2);min-width:0}
.vui-md p,.vui-md ul,.vui-md ol,.vui-md blockquote,.vui-callout-text{margin:0}
.vui-md ul,.vui-md ol{padding-inline-start:1.5em}
.vui-md blockquote{display:flex;flex-direction:column;gap:var(--vui-space-1);padding-inline-start:var(--vui-space-3);border-inline-start:3px solid var(--vui-border);color:var(--vui-muted-fg)}
.vui-node[data-vui-type="callout"]{padding:var(--vui-space-2) var(--vui-space-3);border-radius:var(--vui-radius);background:color-mix(in srgb,var(--vui-tone-line) 12%,var(--vui-surface));color:var(--vui-surface-fg)}
.vui-node[data-vui-type="callout"].vui-marked{padding-inline-start:calc(1.2em + var(--vui-space-3))}
.vui-node[data-vui-type="callout"]>.vui-node-mark{inset-block-start:var(--vui-space-2);inset-inline-start:var(--vui-space-2)}
.vui-node[data-vui-type="callout"] .vui-note{color:var(--vui-surface-fg)}
.vui-codeblock{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.vui-code-bar{display:flex;align-items:center;gap:var(--vui-space-2);padding:var(--vui-space-1) var(--vui-space-2);border-bottom:1px solid var(--vui-border);background:var(--vui-muted);font-size:.86em}
.vui-code-lang{font-family:var(--vui-mono),monospace}
.vui-code-copy{margin-inline-start:auto;padding:0 var(--vui-space-2)}
.vui-code-pre{margin:0;padding:var(--vui-space-2);font-family:var(--vui-mono),monospace;font-size:.86em;white-space:pre-wrap}
.vui-code-body{display:block;font:inherit}
.vui-code-line{display:flex;min-height:1.5em;background:none;color:inherit}
.vui-code-marked{background:color-mix(in srgb,var(--vui-info) 14%,var(--vui-surface));box-shadow:inset 3px 0 0 var(--vui-info)}
.vui-code-no{flex:none;min-width:4ch;padding-inline-end:1ch;color:var(--vui-muted-fg);font-variant-numeric:tabular-nums;text-align:right;-webkit-user-select:none;user-select:none}
.vui-code-marked .vui-code-no{color:inherit}
.vui-code-text{flex:1;min-width:0;white-space:pre-wrap}
.vui-codeblock .vui-fold-toggle{padding:var(--vui-space-1) var(--vui-space-2);border-block:1px solid var(--vui-border);background:var(--vui-muted);font-size:.86em;-webkit-user-select:none;user-select:none}
.vui-codeblock .vui-fold-icon{color:inherit}
`
  .trim()
  .replace(/\n/g, '')
