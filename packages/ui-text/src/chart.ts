import { type ChartNode, hasOwn, type RefLine } from '@vadd/ui-spec'
import { type Block, muted, text } from './blocks.js'
import { type Context, format } from './value.js'

// A chart becomes the one-line caption of §19.5. Its §15.2 `<desc>` plays the same role.

const LABELS: Readonly<Record<ChartNode['kind'], string>> = {
  line: 'Line chart',
  area: 'Area chart',
  bar: 'Bar chart',
  hbar: 'Horizontal bar chart',
  stacked: 'Stacked bar chart',
  donut: 'Donut chart',
  spark: 'Sparkline',
  scatter: 'Scatter chart',
}

const BARS = '▁▂▃▄▅▆▇█'
const MAX_BARS = 40

/** At most `MAX_BARS` characters, sampled at an even stride. */
export function sparkline(values: readonly number[]): string {
  const finite = values.filter(Number.isFinite)
  const stride = Math.ceil(finite.length / MAX_BARS)
  const sample = finite.filter((_, index) => index % stride === 0)
  const low = Math.min(...sample)
  const range = Math.max(...sample) - low
  return sample
    .map((value) => BARS[range === 0 ? 3 : Math.round(((value - low) / range) * 7)])
    .join('')
}

function subject(node: ChartNode, context: Context): string {
  switch (node.kind) {
    case 'spark':
      return `: ${sparkline(node.values)}`
    case 'scatter':
      return `: ${node.points.length} points`
    default: {
      const names = Object.keys(node.series)
      const first = node.x[0]
      const last = node.x[node.x.length - 1]
      const label = (value: string | number) => format(value, node.xFormat, context).text
      const range =
        first === undefined || last === undefined
          ? ''
          : node.x.length === 1
            ? label(first)
            : `${label(first)}–${label(last)}`
      return `${names.length > 0 ? `: ${names.join(', ')}` : ''}${range === '' ? '' : ` over ${range}`}`
    }
  }
}

function references(lines: RefLine[], yFormat: string | undefined, context: Context): string {
  if (lines.length === 0) return ''
  const parts = lines.map(({ y, label }) => `${label} ${format(y, yFormat, context).text}`)
  return `; ${parts.join(', ')}`
}

export function chartBlocks(node: ChartNode, context: Context): Block[] {
  const label = hasOwn(LABELS, node.kind) ? LABELS[node.kind] : 'Chart'
  const refs = references(node.refLines ?? [], node.yFormat, context)
  return [muted([text(`${label}${subject(node, context)}${refs}.`)])]
}
