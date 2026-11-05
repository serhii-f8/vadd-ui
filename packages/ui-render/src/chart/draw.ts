import { clip } from '@vadd/ui-spec'
import { svg } from '../el.js'
import { toneClass } from '../inline.js'
import { MAX_SLICES, type Model } from './model.js'
import { lttb, nearest } from './scale.js'

// The marks of a chart at one width. Text is 11 px in a constant rule, and its width is
// estimated from its length, so a drawing needs nothing measured (§9.3).

const CHAR = 6.2
const LINE = 14
const TOP = 16
const BOTTOM = 26
const END = 10
const GUTTER = 8
const AXIS = 6
const MAX_LABEL = 16
const MAX_TICK = 14
const MAX_DRAWN = 1000
const FULL = 100

export const SPARK_WIDTH = 100
export const SPARK_HEIGHT = 24

const round = (value: number) => Math.round(value * 10) / 10

export interface Drawing {
  nodes: SVGElement[]
  /** The category at a point of the drawing, or -1. */
  at(x: number, y: number): number
}

const textMark = (x: number, y: number, anchor: string, name: string, content: string) =>
  svg('text', { x: round(x), y: round(y), 'text-anchor': anchor, class: name }, content)

const seriesMark = (name: string, d: string, index: number) =>
  svg('path', { class: name, d, 'data-vui-series': index + 1 })

const linePath = (points: string[]) =>
  points.length === 0 ? '' : `M${points.join('L')}${points.length === 1 ? 'h0' : ''}`

/** A spark's path in a `SPARK_WIDTH` by `SPARK_HEIGHT` box. */
export function sparkPath(values: readonly number[]): string {
  const low = values.reduce((least, value) => Math.min(least, value))
  const high = values.reduce((most, value) => Math.max(most, value))
  const last = values.length - 1
  const points = lttb(
    values.map((_, index) => index),
    values,
    MAX_DRAWN,
  ).map((index) => {
    const share =
      low === high ? 0.5 : ((values[index] as number) / 2 - low / 2) / (high / 2 - low / 2)
    const x = last === 0 ? 0.5 : index / last
    return `${round(x * SPARK_WIDTH)} ${round(SPARK_HEIGHT - 1 - share * (SPARK_HEIGHT - 2))}`
  })
  return linePath(points)
}

function donut(model: Model, width: number): Drawing {
  const values = (model.series[0]?.values ?? []).map((value) => Math.max(value ?? 0, 0))
  const whole = values.reduce((sum, value) => sum + value, 0)
  const cx = width / 2
  const cy = model.height / 2
  const thickness = round(cy * 0.36)
  const r = round(cy - 4 - thickness / 2)
  const many = values.filter((value) => value > 0).length > 1
  const ends: number[] = []
  const nodes: SVGElement[] = []
  let start = 0
  values.forEach((value, index) => {
    const share = (value / whole) * FULL
    if (value > 0) {
      nodes.push(
        svg('circle', {
          class: 'vui-chart-slice',
          cx,
          cy,
          r,
          pathLength: FULL,
          transform: `rotate(-90 ${cx} ${cy})`,
          'stroke-width': thickness,
          'stroke-dasharray': `${Math.max(round(share - (many ? 0.5 : 0)), 0.2)} ${FULL}`,
          'stroke-dashoffset': round(-start),
          'data-vui-series': (index % MAX_SLICES) + 1,
        }),
      )
      start += share
    }
    ends.push(start)
  })
  return {
    nodes,
    at(x, y) {
      const turn = Math.atan2(x - cx, cy - y) / (2 * Math.PI)
      return ends.findIndex((end) => ((turn + 1) % 1) * FULL < end)
    },
  }
}

function cartesian(model: Model, width: number): Drawing {
  const { kind, size, positions, series, ticks, height, refLines, totals } = model
  const swapped = kind === 'hbar'
  const stacked = kind === 'stacked'
  const bars = swapped || stacked || kind === 'bar'
  const tickTexts = ticks.map((tick) => clip(model.tick(tick), MAX_TICK))
  const widest = (list: string[]) =>
    list.reduce((most, item) => Math.max(most, item.length), 0) * CHAR

  // A label costs a format, so only those that could fit are read.
  const stride = Math.ceil((size * (swapped ? LINE : 3 * CHAR)) / (swapped ? height : width))
  const shown: number[] = []
  for (let index = 0; index < size; index += stride) shown.push(index)
  const room = swapped ? Math.floor((width * 0.35) / CHAR) : MAX_LABEL
  const labels = shown.map((index) => clip(model.label(index), room))
  const start = widest(swapped ? labels : tickTexts) + GUTTER + 2
  const [a0, a1] = swapped ? [TOP, height - BOTTOM] : [start, width - END]
  const [b0, b1] = swapped ? [start, width - END] : [height - BOTTOM, TOP]
  const low = ticks[0] as number
  const high = ticks[ticks.length - 1] as number
  const along = (index: number) => a0 + (positions[index] as number) * (a1 - a0)
  const across = (value: number) =>
    b0 + ((Math.max(Math.min(value, high), low) - low) / (high - low)) * (b1 - b0)
  const pt = (a: number, b: number) =>
    swapped ? `${round(b)} ${round(a)}` : `${round(a)} ${round(b)}`
  const rule = (b: number) => `M${pt(a0, b)}L${pt(a1, b)}`

  const nodes: SVGElement[] = [
    svg('path', { class: 'vui-chart-grid', d: ticks.map((tick) => rule(across(tick))).join('') }),
  ]
  /** Places labels along an axis, greedily, because positions can clump. Returns which fit. */
  const axis = (items: string[], at: (order: number) => number, atStart: boolean, name: string) => {
    let last = Number.NEGATIVE_INFINITY
    let room = 0
    return items.map((item, order) => {
      const half = atStart ? LINE / 2 : (item.length * CHAR) / 2 + 2
      const center = atStart ? at(order) : Math.min(Math.max(at(order), half), width - half)
      if (Math.abs(center - last) < half + room) return false
      last = center
      room = half
      nodes.push(
        atStart
          ? textMark(start - GUTTER, center + 4, 'end', name, item)
          : textMark(center, height - AXIS, 'middle', name, item),
      )
      return true
    })
  }
  axis(tickTexts, (order) => across(ticks[order] as number), !swapped, 'vui-chart-tick')

  const band = (0.8 / Math.min(size, MAX_DRAWN)) * (a1 - a0)
  const barWidth = stacked ? band : band / series.length
  const inner = barWidth * 0.9
  const up = new Array<number>(size).fill(0)
  const down = new Array<number>(size).fill(0)
  const zero = across(0)
  series.forEach(({ values, keep }, order) => {
    if (bars) {
      let d = ''
      for (const index of keep) {
        const value = values[index]
        if (value === undefined) continue
        const pile = value < 0 ? down : up
        const base = stacked ? (pile[index] as number) : 0
        pile[index] = base + value
        const a = along(index) - band / 2 + (stacked ? 0 : order * barWidth)
        const from = across(base)
        const to = across(base + value)
        d += `M${pt(a, from)}L${pt(a, to)}L${pt(a + inner, to)}L${pt(a + inner, from)}Z`
      }
      nodes.push(seriesMark('vui-chart-bar', d, order))
      return
    }
    const run = keep.map((index) => pt(along(index), across(values[index] as number)))
    if (kind === 'area' && keep.length > 0) {
      const head = pt(along(keep[0] as number), zero)
      const tail = pt(along(keep[keep.length - 1] as number), zero)
      nodes.push(seriesMark('vui-chart-area', `M${[head, ...run, tail].join('L')}Z`, order))
    }
    nodes.push(seriesMark('vui-chart-line', linePath(run), order))
  })

  for (const { y, label, tone } of refLines) {
    const b = across(y)
    nodes.push(
      svg('path', { class: `vui-chart-ref ${toneClass(tone)}`, d: rule(b) }),
      textMark(
        swapped ? b : a1,
        swapped ? a0 - 4 : b - 4,
        swapped && b < (b0 + b1) / 2 ? 'start' : 'end',
        `vui-chart-ref-label ${toneClass(tone)}`,
        clip(label, 2 * MAX_LABEL),
      ),
    )
  }

  const placed = axis(labels, (order) => along(shown[order] as number), swapped, 'vui-chart-label')
  if (totals !== undefined) {
    shown.forEach((index, order) => {
      if (!placed[order]) return
      const y = across(model.tops[index] as number) - 4
      nodes.push(textMark(along(index), y, 'middle', 'vui-chart-total', model.value(totals[index])))
    })
  }
  return {
    nodes,
    at: (x, y) => nearest(positions, ((swapped ? y : x) - a0) / (a1 - a0)),
  }
}

/** The marks of `model` at `width`. */
export function draw(model: Model, width: number): Drawing {
  if (model.kind === 'spark') {
    const values = model.series[0]?.values as number[]
    return {
      nodes: values.length > 0 ? [seriesMark('vui-chart-line', sparkPath(values), 0)] : [],
      at: (x) => nearest(model.positions, x / SPARK_WIDTH),
    }
  }
  if (model.range === undefined) {
    return {
      nodes: [textMark(width / 2, model.height / 2, 'middle', 'vui-chart-tick', 'No data')],
      at: () => -1,
    }
  }
  return model.kind === 'donut' ? donut(model, width) : cartesian(model, width)
}
