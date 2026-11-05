// §6.3, §6.6. Nothing here reads a document value: `data-vui-fill` picks one of these constants.
const fillScale = Array.from(
  { length: 101 },
  (_, fill) => `.vui-root [data-vui-fill="${fill}"]{--vui-fill:${fill}%}`,
).join('')

const kvColumns = [1, 2, 3]
  .map(
    (cols) =>
      `.vui-kv[data-vui-cols="${cols}"]{grid-template-columns:repeat(${cols},minmax(0,1fr))}`,
  )
  .join('')

export const dataCss = `
${fillScale}
.vui-track{display:flex;gap:1px;height:.5em;overflow:hidden;border-radius:999px;background:var(--vui-muted)}
.vui-fill{display:block;width:var(--vui-fill);background:var(--vui-tone-line,var(--vui-primary))}
.vui-table-box{min-width:0;overflow-x:auto;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.vui-table-sticky{max-height:600px;overflow-y:auto}
.vui-table{width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;overflow-wrap:normal}
.vui-caption{padding:var(--vui-space-2);font-size:1.05em;font-weight:600;line-height:1.35;text-align:start}
.vui-table th,.vui-table td{padding:var(--vui-space-1) var(--vui-space-2);border-bottom:1px solid var(--vui-border);background:var(--vui-surface);font-weight:400;text-align:start;vertical-align:top}
.vui-table tr>:first-child{border-inline-start:3px solid transparent}
.vui-table>:last-child tr:last-child>*{border-bottom:0}
.vui-table thead th{background:var(--vui-muted);font-size:.86em;font-weight:600;white-space:nowrap}
.vui-table-sticky thead th{position:sticky;top:0;z-index:1}
.vui-table-pinned tr>:first-child{position:sticky;inset-inline-start:0;z-index:1;border-inline-end:1px solid var(--vui-border)}
.vui-table-pinned thead th:first-child{z-index:2}
.vui-table-pinned .vui-group>:first-child{position:static;border-inline-end:0}
.vui-table .vui-group th{font-weight:600}
.vui-group-label{position:sticky;inset-inline-start:var(--vui-space-2);display:inline-block}
.vui-table tfoot th,.vui-table tfoot td{border-top:2px solid var(--vui-border);font-weight:600}
.vui-table .vui-align-right{text-align:right;white-space:nowrap}
.vui-table .vui-align-center{text-align:center}
.vui-width-narrow{width:1%;white-space:nowrap}
.vui-width-wide{min-width:24ch}
.vui-table .vui-code{white-space:nowrap}
.vui-table .vui-wrap,.vui-table .vui-wrap .vui-code{overflow-wrap:anywhere;white-space:normal}
.vui-table .vui-nowrap{white-space:nowrap}
.vui-table .vui-row-toned>:first-child{border-inline-start-color:var(--vui-tone-line)}
.vui-mark{margin-inline-end:.3em}
.vui-row-note{display:block;color:var(--vui-muted-fg);font-size:.86em}
.vui-sort{appearance:none;display:inline-flex;align-items:baseline;gap:.3em;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.vui-align-right .vui-sort{flex-direction:row-reverse}
.vui-sort-icon{font-size:.8em}
[aria-sort="none"] .vui-sort-icon{opacity:0}
.vui-sort:hover .vui-sort-icon,.vui-sort:focus-visible .vui-sort-icon{opacity:1}
.vui-show-more{align-self:flex-start}
.vui-bar{display:flex;align-items:center;gap:var(--vui-space-2);min-width:12ch}
.vui-bar-value{flex:none;min-width:6ch;text-align:end}
.vui-bar .vui-track{flex:1;min-width:3em}
.vui-cell-copy{appearance:none;display:block;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:inherit;cursor:copy}
.vui-cell-copy .vui-code{display:inline-block;padding:.1em .4em}
.vui-copied::after{content:" ✓";color:var(--vui-ok-text)}
.vui-grid-box>.vui-kv{min-width:0}
.vui-kv{display:grid;gap:var(--vui-space-1) var(--vui-space-4);margin:0}
${kvColumns}
.vui-kv-item{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:var(--vui-space-2)}
.vui-kv dt{color:var(--vui-muted-fg)}
.vui-kv dd{margin:0;font-variant-numeric:tabular-nums}
@container (max-width:479.98px){.vui-kv[data-vui-cols]{grid-template-columns:minmax(0,1fr)}}
.vui-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9em,1fr));gap:var(--vui-space-2);margin:0}
.vui-stat{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0;padding:var(--vui-space-2) var(--vui-space-3);border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
.vui-stat.vui-toned{padding-inline-start:var(--vui-space-3);border-inline-start:3px solid var(--vui-tone-line)}
.vui-stat.vui-marked{padding-inline-start:calc(1.2em + var(--vui-space-2))}
.vui-stat>.vui-node-mark{inset-block-start:var(--vui-space-2);inset-inline-start:var(--vui-space-1)}
.vui-stat dd{margin:0}
.vui-stat-label{color:var(--vui-muted-fg);font-size:.86em}
.vui-stat-value{font-size:1.5em;font-variant-numeric:tabular-nums;font-weight:600;line-height:1.2}
.vui-stat-delta{font-size:.86em;font-variant-numeric:tabular-nums}
.vui-stat-spark{margin-block-start:var(--vui-space-1)}
.vui-spark{display:flex;align-items:flex-end;gap:1px;height:1.5em}
.vui-spark-col{flex:1;min-width:1px;max-width:8px;min-height:2px;height:var(--vui-fill);background:var(--vui-tone-line,var(--vui-chart-1))}
.vui-list{display:flex;flex-direction:column;gap:var(--vui-space-1);margin:0;padding-inline-start:1.5em}
ul>.vui-list-status{margin-inline-start:-1.5em;list-style:none}
.vui-progress{display:flex;flex-direction:column;gap:var(--vui-space-1);min-width:0}
.vui-progress-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 var(--vui-space-2);font-size:.86em}
.vui-progress-label{font-weight:600}
.vui-progress-value,.vui-legend-value{color:var(--vui-muted-fg);font-variant-numeric:tabular-nums}
.vui-progress-value{margin-inline-start:auto}
.vui-legend{display:flex;flex-wrap:wrap;gap:var(--vui-space-1) var(--vui-space-3);margin:0;padding:0;font-size:.86em;list-style:none}
.vui-legend li{display:inline-flex;align-items:baseline;gap:.3em}
.vui-legend-swatch{width:.7em;height:.7em;border-radius:2px;background:var(--vui-tone-line)}
`
  .trim()
  .replace(/\n/g, '')
