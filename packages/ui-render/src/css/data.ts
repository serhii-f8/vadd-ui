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

// §6.4, §8.2: the palette, then the same hues fainter. Marks and swatches read one variable.
const seriesColors = Array.from({ length: 12 }, (_, index) => {
  const token = `var(--vui-chart-${(index % 5) + 1})`
  const share = [100, 60, 35][Math.floor(index / 5)]
  const color = share === 100 ? token : `color-mix(in srgb,${token} ${share}%,transparent)`
  return `.vui-root [data-vui-series="${index + 1}"]{--vui-tone-line:${color}}`
}).join('')

export const dataCss = `
${fillScale}
${seriesColors}
.vui-track{display:flex;gap:1px;height:.5em;overflow:hidden;border-radius:999px;background:var(--vui-muted)}
.vui-fill{display:block;width:var(--vui-fill);background:var(--vui-tone-line,var(--vui-primary))}
.vui-table-box{position:relative;min-width:0;overflow-x:auto;container-type:inline-size;border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg)}
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
@container (max-width:479.98px){.vui-table-pinned tr:not(.vui-group)>:first-child{max-width:45cqi;overflow-wrap:break-word;white-space:normal}.vui-table-pinned tr:not(.vui-group)>:first-child .vui-code{white-space:normal}}
.vui-table .vui-group th{font-weight:600}
.vui-group-label{position:sticky;inset-inline-start:var(--vui-space-2);display:inline-block}
.vui-table tfoot th,.vui-table tfoot td{border-top:2px solid var(--vui-border);font-weight:600}
.vui-table .vui-align-right{text-align:right}
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
[data-vui-type=card] [data-vui-type=card],[data-vui-type=card] .vui-stat{border-width:0;border-radius:0;background:none}
.vui-stat.vui-toned{border-inline-start:3px solid var(--vui-tone-line)}
.vui-stat.vui-marked{padding-inline-start:calc(1.2em + var(--vui-space-2))}
.vui-stat .vui-node-mark{inset-block-start:var(--vui-space-2);inset-inline-start:var(--vui-space-1)}
.vui-stat dd{margin:0}
.vui-stat-label{color:var(--vui-muted-fg);font-size:.86em}
.vui-stat-value{font-size:1.5em;font-variant-numeric:tabular-nums;font-weight:600;line-height:1.2}
.vui-stat-delta{font-size:.86em;font-variant-numeric:tabular-nums}
.vui-stat-spark{margin-block-start:var(--vui-space-1)}
.vui-spark{display:block;height:1.5em}
.vui-spark svg{display:block;overflow:visible}
.vui-chart,.vui-progress,.vui-rows li{display:flex;flex-direction:column;gap:var(--vui-space-1);min-width:0}
.vui-chart-plot{position:relative}
.vui-chart-plot svg{display:block}
.vui-chart-hit{position:absolute;inset:0}
.vui-chart-plot .vui-sr-only{top:0}
.vui-chart text{fill:var(--vui-muted-fg);font-size:11px}
.vui-chart .vui-chart-total{fill:var(--vui-surface-fg)}
.vui-chart .vui-chart-ref-label{fill:var(--vui-tone-text)}
.vui-chart path,.vui-chart circle,.vui-spark path{fill:none}
.vui-chart .vui-chart-bar,.vui-chart .vui-chart-area{fill:var(--vui-tone-line)}
.vui-chart .vui-chart-area{fill-opacity:.2}
.vui-chart-line,.vui-chart-dot{stroke:var(--vui-tone-line,var(--vui-chart-1));stroke-width:2;stroke-linecap:round;vector-effect:non-scaling-stroke}.vui-chart-dot{stroke-width:6}
.vui-chart-slice,.vui-chart-ref{stroke:var(--vui-tone-line)}
.vui-chart-grid{stroke:var(--vui-border)}
.vui-chart-ref{stroke-dasharray:4 3}
.vui-chart-tip{position:absolute;top:0;left:var(--vui-fill);z-index:2;width:max-content;max-width:max(50%,10em);padding:var(--vui-space-1) var(--vui-space-2);border:1px solid var(--vui-border);border-radius:var(--vui-radius);background:var(--vui-surface);color:var(--vui-surface-fg);font-size:.86em;pointer-events:none}
.vui-chart-tip[data-vui-end]{transform:translateX(-100%)}
.vui-chart-tip-row{display:flex;align-items:baseline;gap:.3em;font-variant-numeric:tabular-nums}
.vui-chart-tip-row b{margin-inline-start:auto}
.vui-chart[data-vui-kind="spark"]{width:8em}
.vui-list{display:flex;flex-direction:column;gap:var(--vui-space-1);margin:0;padding-inline-start:1.5em}
ul>.vui-list-status{margin-inline-start:-1.5em;list-style:none}
.vui-progress-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 var(--vui-space-2);font-size:.86em}
.vui-progress-label{font-weight:600}
.vui-progress-value,.vui-legend-value{color:var(--vui-muted-fg);font-variant-numeric:tabular-nums}
.vui-progress-value{margin-inline-start:auto}
.vui-legend{display:flex;flex-wrap:wrap;gap:var(--vui-space-1) var(--vui-space-3);margin:0;padding:0;font-size:.86em;list-style:none}
.vui-legend li{display:inline-flex;align-items:baseline;gap:.3em}
.vui-legend-swatch{width:.7em;height:.7em;border-radius:2px;background:var(--vui-tone-line)}
.vui-rows{display:flex;flex-direction:column;gap:var(--vui-space-1);min-width:0;margin:0;padding:0;list-style:none}
.vui-rows .vui-rows{padding-inline-start:var(--vui-space-4)}
.vui-row{display:flex;align-items:baseline;gap:0 var(--vui-space-2);min-width:0}
.vui-row>span:last-child:not(.vui-row-end,.vui-status){flex:1;min-width:0}
.vui-row>.vui-status,.vui-row-end{flex:none}
.vui-check-head{flex-wrap:wrap}
.vui-row-end{margin-inline-start:auto;color:var(--vui-muted-fg);font-size:.86em;font-variant-numeric:tabular-nums}
.vui-row-end .vui-tone-ok,.vui-row-end .vui-tone-err{font-weight:600}
.vui-diff:has(button)>li>.vui-row{padding-inline-start:calc(.6em + var(--vui-space-1))}
.vui-diff-mark{font-family:var(--vui-mono),monospace}
.vui-rows .vui-fold-toggle>:last-child{flex:1;min-width:0}
.vui-code-pre.vui-codeblock{display:block}
.vui-code-pre [class*="vui-tone-"]{display:block;background:color-mix(in srgb,var(--vui-tone) 12%,transparent)}
.vui-code-pre .vui-tone-muted{background:none}
.vui-decision-context{margin:0}
.vui-options{display:grid;align-items:start;grid-template-columns:repeat(auto-fit,minmax(12em,1fr));gap:var(--vui-space-2);margin:0;padding:0;list-style:none}
@container (max-width:599.98px){.vui-options{grid-template-columns:minmax(0,1fr)}}
.vui-option-pick{border-color:var(--vui-primary);box-shadow:inset 0 0 0 1px var(--vui-primary)}
.vui-pick{align-self:flex-start}
.vui-options .vui-kv-item{grid-template-columns:minmax(min-content,1fr) minmax(0,2fr)}
.vui-options dt{overflow-wrap:normal}
.vui-tree{font-family:var(--vui-mono),monospace;font-size:.86em}
.vui-tree .vui-rows{border-inline-start:1px solid var(--vui-border);margin-inline-start:.4em}
.vui-timeline{gap:var(--vui-space-2);padding-inline-start:var(--vui-space-3);border-inline-start:2px solid var(--vui-border)}
.vui-time{color:var(--vui-muted-fg);font-size:.86em;font-variant-numeric:tabular-nums}
`
  .trim()
  .replace(/\n/g, '')
