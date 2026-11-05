import type { ChartNode } from './types.js'

/** A chart's name in words: the text caption and the DOM `<desc>` say the same (§15.2, §19.5). */
export const CHART_LABELS: Readonly<Record<ChartNode['kind'], string>> = {
  line: 'Line chart',
  area: 'Area chart',
  bar: 'Bar chart',
  hbar: 'Horizontal bar chart',
  stacked: 'Stacked bar chart',
  donut: 'Donut chart',
  spark: 'Sparkline',
  scatter: 'Scatter chart',
}
