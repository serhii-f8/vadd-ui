import { isJsonObject, type JsonObject, type JsonValue, type Tone } from '@vadd/ui-spec'
import { field, finite, nodeList, text } from '../components/fields.js'
import type { NodeContext } from '../context.js'
import { toneOf } from '../inline.js'
import { lttb, niceTicks } from './scale.js'

// One reading of a chart node for every kind, so `draw` has one input.

const MAX_DRAWN = 1000
export const MAX_SLICES = 12
const HEIGHTS: Readonly<Record<string, number>> = { sm: 120, md: 200, lg: 300 }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

export type Value = number | undefined

export interface Series {
  name: string
  /** One per category, `undefined` where there is none. */
  values: Value[]
  /** The indices drawn (§9.4), in order. */
  keep: number[]
}

export interface RefLine {
  y: number
  label: string
  tone: Tone
}

export interface Model {
  kind: string
  /** Categories drawn: a folded donut has fewer than the document. */
  size: number
  /** Points in the document. */
  count: number
  /** Where each category sits along its axis, from 0 to 1. */
  positions: number[]
  series: Series[]
  /** Sums per category, for a `stacked` chart that asked for them. */
  totals: number[] | undefined
  /** The top of each stack. */
  tops: number[]
  ticks: number[]
  height: number
  refLines: RefLine[]
  /** The smallest and largest value, when there is one. */
  range: [number, number] | undefined
  label(index: number): string
  /** `yFormat`, or a plain number that keeps small values apart. */
  value(value: Value): string
  /** `value`, with room for the decimals of the ticks. */
  tick(value: number): string
}

const clean = (values: JsonValue | undefined): Value[] =>
  Array.isArray(values)
    ? values.map((value) => (Number.isFinite(value) ? (value as number) : undefined))
    : []

function readSeries(node: JsonObject): { name: string; values: Value[] }[] {
  if (node.kind === 'spark') {
    const values = clean(field(node, 'values')).filter((value) => value !== undefined)
    return [{ name: 'Value', values }]
  }
  const source = field(node, 'series')
  return isJsonObject(source)
    ? Object.entries(source).map(([name, values]) => ({ name, values: clean(values) }))
    : []
}

function positionsOf(bars: boolean, x: JsonValue[], size: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index)
  if (bars) return order.map((index) => (index + 0.5) / size)
  const stamps = x.map((value) =>
    typeof value === 'string' && ISO_DATE.test(value) ? Date.parse(value) : value,
  ) as number[]
  const first = stamps[0] as number
  const span = (stamps[size - 1] as number) - first
  return size > 1 &&
    x.length === size &&
    span < Number.POSITIVE_INFINITY &&
    stamps.every((stamp, index) =>
      index > 0 ? stamp > (stamps[index - 1] as number) : stamp < span + first,
    )
    ? stamps.map((stamp) => (stamp - first) / span)
    : order.map((index) => (size > 1 ? index / (size - 1) : 0.5))
}

export function readModel(node: JsonObject, context: NodeContext): Model {
  const kind = node.kind as string
  const stacked = kind === 'stacked'
  const bars = stacked || kind === 'bar' || kind === 'hbar' || kind === 'donut'
  let series = readSeries(node)
  let x = nodeList(node, 'x')
  const count = series.reduce((most, { values }) => Math.max(most, values.length), 0)
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  const see = (value: number) => {
    low = Math.min(low, value)
    high = Math.max(high, value)
  }
  for (const { values } of series) {
    for (const value of values) if (value !== undefined) see(value)
    context.checkpoint()
  }
  const range: Model['range'] = low <= high ? [low, high] : undefined
  const first = series[0]
  if (kind === 'donut' && first !== undefined && count > MAX_SLICES) {
    // A ring cannot show more, and the sum keeps the shares honest.
    const head = first.values.slice(0, MAX_SLICES - 1)
    const rest = first.values
      .slice(MAX_SLICES - 1)
      .reduce<number>((sum, value = 0) => Math.min(sum + Math.max(value, 0), Number.MAX_VALUE), 0)
    x = [...head.map((_, index) => x[index] ?? index + 1), 'Other']
    series = [{ name: first.name, values: [...head, rest] }]
  }
  const size = Math.min(count, kind === 'donut' ? MAX_SLICES : count)
  const positions = positionsOf(bars, x, size)
  const refLines =
    kind === 'donut' || kind === 'spark'
      ? []
      : nodeList(node, 'refLines').flatMap((line) => {
          const y = isJsonObject(line) ? finite(line, 'y') : undefined
          if (y === undefined || !isJsonObject(line)) return []
          return [{ y, label: text(line, 'label'), tone: toneOf(field(line, 'tone')) ?? 'default' }]
        })

  const up = new Array<number>(size).fill(0)
  const down = new Array<number>(size).fill(0)
  for (const { values } of series) {
    values.forEach((value = 0, index) => {
      const pile = value < 0 ? down : up
      pile[index] = (pile[index] as number) + value
    })
  }
  for (const { y } of refLines) see(y)
  if (bars || kind === 'area') see(0)
  if (stacked) for (const sum of [...up, ...down]) see(sum)
  const ticks = low <= high ? niceTicks(low, high) : [0, 1]

  const shared = bars
    ? lttb(
        positions,
        up.map((sum, index) => sum - (down[index] as number)),
        MAX_DRAWN,
      )
    : []
  const yFormat = field(node, 'yFormat')
  const xFormat = field(node, 'xFormat')
  const step = (ticks[1] as number) - (ticks[0] as number)
  // `num` takes 0 to 20 decimals (§7); a subnormal step would ask for 324 and blame `yFormat`.
  const decimals = Math.min(Math.max(-Math.floor(Math.log10(step)), 0), 20)
  const places = `num:${decimals}`
  const yAt = `${context.pointer}/yFormat`
  const format = (value: Value, name: JsonValue | undefined, fallback: string) =>
    context.format(value ?? null, typeof name === 'string' ? name : fallback, yAt).text
  return {
    kind,
    size,
    count,
    positions,
    series: series.map(({ name, values }) => ({
      name,
      values,
      keep: bars ? shared : lttb(positions, values, MAX_DRAWN),
    })),
    totals:
      stacked && node.stackTotal === true
        ? up.map((sum, index) => sum + (down[index] as number))
        : undefined,
    tops: up,
    ticks,
    height: HEIGHTS[String(node.height)] ?? 200,
    refLines,
    range,
    label(index) {
      const label = x[index] ?? index + 1
      const name = typeof xFormat === 'string' ? xFormat : undefined
      return context.format(label, name, `${context.pointer}/x/${index}`).text
    },
    value: (value) => format(value, yFormat, decimals > 2 ? places : 'num'),
    tick: (value) => format(value, yFormat, places),
  }
}
