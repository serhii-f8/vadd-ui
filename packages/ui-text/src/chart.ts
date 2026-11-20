import { CHART_LABELS, type ChartNode, hasOwn, type RefLine } from '@vadd/ui-spec'
import { type Block, bold, list, muted, text } from './blocks.js'
import { type Context, format } from './value.js'

// A chart becomes the one-line caption of §19.5, then its data in short (VD-217): §19.5 is
// abridged, and a caption alone told a reader of text nothing of the numbers.

const BARS = '▁▂▃▄▅▆▇█'
const MAX_BARS = 40
/** Up to this many points a series lists them all; past it, its last, min and max. */
const MAX_LISTED = 8
const CATEGORY_KINDS: ReadonlySet<string> = new Set(['bar', 'hbar', 'stacked', 'donut'])

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
      return node.values.length > 0 ? `: ${sparkline(node.values)}` : ''
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

/** One series in short: each value, by its category where it has one, or last, min, max. */
function seriesLine(node: ChartNode, all: number[], context: Context): string {
  const y = (value: number) => format(value, node.yFormat, context).text
  const values = all.filter(Number.isFinite)
  if (all.length > MAX_LISTED) {
    const last = values[values.length - 1] as number
    const low = values.reduce((least, value) => Math.min(least, value))
    const high = values.reduce((most, value) => Math.max(most, value))
    return `last ${y(last)}, min ${y(low)}, max ${y(high)}`
  }
  const x = 'x' in node && CATEGORY_KINDS.has(node.kind) ? node.x : undefined
  // By the document's index, so a gap never moves a value to the next category.
  return all
    .flatMap((value, index) => {
      if (!Number.isFinite(value)) return []
      const category = x?.[index]
      return [
        category === undefined
          ? y(value)
          : `${format(category, node.xFormat, context).text} ${y(value)}`,
      ]
    })
    .join(', ')
}

function data(node: ChartNode, context: Context): Block[] {
  if (!('series' in node)) return []
  const entries = Object.entries(node.series)
    .filter(([, values]) => values.some(Number.isFinite))
    .map(([name, values]) => ({
      text: [bold(text(`${name}:`)), text(` ${seriesLine(node, values, context)}`)],
    }))
  return entries.length === 0 ? [] : [list(entries)]
}

export function chartBlocks(node: ChartNode, context: Context): Block[] {
  const label = hasOwn(CHART_LABELS, node.kind) ? CHART_LABELS[node.kind] : 'Chart'
  const refs = references(node.refLines ?? [], node.yFormat, context)
  return [muted([text(`${label}${subject(node, context)}${refs}.`)]), ...data(node, context)]
}
