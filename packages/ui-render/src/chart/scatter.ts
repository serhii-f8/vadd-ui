import {
  CHART_LABELS,
  clip,
  inlineToPlain,
  isJsonObject,
  type JsonObject,
  parseInline,
} from '@vadd/ui-spec'
import { field, finite, nodeList, text } from '../components/fields.js'
import type { NodeContext } from '../context.js'
import { el, svg } from '../el.js'
import { fillOf } from '../fill.js'
import { toneClass, toneOf } from '../inline.js'
import { heightOf } from './model.js'
import { watchWidth } from './resize.js'
import { lttb, niceTicks } from './scale.js'

// §6.4 `scatter` on the §9.4 engine pieces (VD-184): 1-2-5 ticks on both axes, label thinning,
// LTTB past 1,000 points, a tooltip, the shared observer, and §15.2's title, desc and table.
// The points are one path of zero-length segments with round caps, so the DOM stays small.

const WIDTH = 640
const CHAR = 6.2
const LINE = 14
const TOP = 16
const BOTTOM = 26
const GUTTER = 8
const AXIS = 6
const MAX_TICK = 14
const MAX_LABEL = 32
const MAX_DRAWN = 1000
const MAX_TABLE_ROWS = 200
/** B5: a share of the range each side, so no point sits on an edge of the plot. */
const PAD = 0.05
/** Past this many labelled points, labels stay in the tooltip and the table (B5). */
const MAX_POINT_LABELS = 24

const round = (value: number) => Math.round(value * 10) / 10

interface Point {
  x: number
  y: number
  label: string
  /** The document gave the label; the others are `Point n`. */
  named: boolean
}

interface RefLine {
  y: number
  label: string
  className: string
}

function readPoints(node: JsonObject): Point[] {
  return nodeList(node, 'points').flatMap((entry, index) => {
    if (!Array.isArray(entry)) return []
    const [x, y, label] = entry
    if (!Number.isFinite(x) || !Number.isFinite(y)) return []
    const name = typeof label === 'string' ? label : `Point ${index + 1}`
    return [{ x: x as number, y: y as number, label: name, named: typeof label === 'string' }]
  })
}

/** Ticks over the padded range, and the `num` places that keep them apart (§7: 0 to 20). */
function axis(values: number[]) {
  const least = values.reduce((low, value) => Math.min(low, value))
  const most = values.reduce((high, value) => Math.max(high, value))
  // Half the range past the ends of the number line would overflow, so the pad stops there.
  const pad = (most - least) * PAD || Math.abs(least) * PAD || 1
  // The pad stops at zero for data on one side of it, so sizes and counts never go negative.
  const low = least > 0 ? Math.max(least - pad, 0) : Math.max(least - pad, -Number.MAX_VALUE)
  const high = most < 0 ? Math.min(most + pad, 0) : Math.min(most + pad, Number.MAX_VALUE)
  const ticks = niceTicks(low, high)
  const step = (ticks[1] as number) - (ticks[0] as number)
  const decimals = Math.min(Math.max(-Math.floor(Math.log10(step)), 0), 20)
  return { ticks, low: ticks[0] as number, high: ticks[ticks.length - 1] as number, decimals }
}

export function renderScatter(node: JsonObject, context: NodeContext): HTMLElement {
  const label = CHART_LABELS.scatter
  const name = inlineToPlain(parseInline(text(node, 'title'))) || label
  const height = heightOf(node)
  const points = readPoints(node)
  const refLines: RefLine[] = nodeList(node, 'refLines').flatMap((line) => {
    const y = isJsonObject(line) ? finite(line, 'y') : undefined
    if (y === undefined || !isJsonObject(line)) return []
    const tone = toneOf(field(line, 'tone')) ?? 'default'
    return [{ y, label: text(line, 'label'), className: toneClass(tone) }]
  })
  const formatOf = (name: string, fallback: string) => {
    const format = field(node, name)
    const pointer = `${context.pointer}/${name}`
    return (value: number, places?: number) =>
      context.format(
        value,
        typeof format === 'string' ? format : places === undefined ? fallback : `num:${places}`,
        pointer,
      ).text
  }
  const xText = formatOf('xFormat', 'num')
  const yText = formatOf('yFormat', 'num')

  const image = svg('svg', { role: 'img', width: '100%', height }, [svg('title', {}, name)])
  const plot = el('div', { class: 'vui-chart-plot' }, image)
  const wrapper = el('div', { class: 'vui-chart', 'data-vui-kind': 'scatter' }, plot)
  if (points.length === 0) {
    image.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`)
    image.append(
      svg('desc', {}, `${label}, 0 points`),
      svg(
        'text',
        { x: WIDTH / 2, y: height / 2, 'text-anchor': 'middle', class: 'vui-chart-tick' },
        'No data',
      ),
    )
    return wrapper
  }

  const xs = axis(points.map(({ x }) => x))
  const ys = axis([...points.map(({ y }) => y), ...refLines.map(({ y }) => y)])
  const xMin = points.reduce((least, { x }) => Math.min(least, x), Number.POSITIVE_INFINITY)
  const xMax = points.reduce((most, { x }) => Math.max(most, x), Number.NEGATIVE_INFINITY)
  const yMin = points.reduce((least, { y }) => Math.min(least, y), Number.POSITIVE_INFINITY)
  const yMax = points.reduce((most, { y }) => Math.max(most, y), Number.NEGATIVE_INFINITY)
  const range = (low: number, high: number, show: (value: number) => string) =>
    low === high ? show(low) : `${show(low)}–${show(high)}`
  const count = `${points.length} point${points.length === 1 ? '' : 's'}`
  const summary = `${label}, ${count}, x range ${range(xMin, xMax, xText)}, y range ${range(yMin, yMax, yText)}`
  image.append(svg('desc', {}, summary))

  // Drawn: every point, or LTTB's 1,000 over the points in x order.
  const byX = points
    .map((_, index) => index)
    .sort((a, b) => (points[a] as Point).x - (points[b] as Point).x)
  const drawn =
    points.length <= MAX_DRAWN
      ? byX
      : lttb(
          byX.map((index) => (points[index] as Point).x),
          byX.map((index) => (points[index] as Point).y),
          MAX_DRAWN,
        ).map((at) => byX[at] as number)
  context.checkpoint()

  const yTicks = ys.ticks.map((tick) => clip(yText(tick, ys.decimals), MAX_TICK))
  const xTicks = xs.ticks.map((tick) => clip(xText(tick, xs.decimals), MAX_TICK))
  const start = yTicks.reduce((most, tick) => Math.max(most, tick.length), 0) * CHAR + GUTTER + 2
  const marks = svg('g')
  image.append(marks)
  let place = (_x: number, _y: number) => [0, 0] as [number, number]
  let width = WIDTH

  const paint = (next: number) => {
    width = next
    const end = Math.max(10, ((xTicks[xTicks.length - 1] ?? '').length * CHAR) / 2 + 2)
    const left = start
    const right = width - end
    const bottom = height - BOTTOM
    // Clamped like the core chart's values: §9.4's ticks stop at ±1e300.
    const px = (x: number) =>
      left +
      ((Math.max(Math.min(x, xs.high), xs.low) - xs.low) / (xs.high - xs.low)) * (right - left)
    const py = (y: number) =>
      bottom +
      ((Math.max(Math.min(y, ys.high), ys.low) - ys.low) / (ys.high - ys.low)) * (TOP - bottom)
    place = (x, y) => [px(x), py(y)]
    const grid =
      ys.ticks.map((tick) => `M${round(left)} ${round(py(tick))}H${round(right)}`).join('') +
      xs.ticks.map((tick) => `M${round(px(tick))} ${round(TOP)}V${round(bottom)}`).join('')
    const nodes: SVGElement[] = [svg('path', { class: 'vui-chart-grid', d: grid })]
    let last = Number.NEGATIVE_INFINITY
    ys.ticks.forEach((tick, order) => {
      const center = py(tick)
      if (Math.abs(center - last) < LINE) return
      last = center
      nodes.push(
        svg(
          'text',
          {
            x: round(start - GUTTER),
            y: round(center + 4),
            'text-anchor': 'end',
            class: 'vui-chart-tick',
          },
          yTicks[order],
        ),
      )
    })
    let reach = Number.NEGATIVE_INFINITY
    xs.ticks.forEach((tick, order) => {
      const item = xTicks[order] as string
      const half = (item.length * CHAR) / 2 + 2
      const center = Math.min(Math.max(px(tick), half), width - half)
      if (center - half < reach) return
      reach = center + half
      nodes.push(
        svg(
          'text',
          { x: round(center), y: height - AXIS, 'text-anchor': 'middle', class: 'vui-chart-label' },
          item,
        ),
      )
    })
    for (const line of refLines) {
      const y = round(py(line.y))
      const clipped = clip(line.label, MAX_LABEL)
      const mark = svg(
        'text',
        {
          x: round(right),
          y: round(y - 4),
          'text-anchor': 'end',
          class: `vui-chart-ref-label ${line.className}`,
        },
        clipped,
      )
      if (clipped !== line.label) mark.append(svg('title', {}, line.label))
      nodes.push(
        svg('path', {
          class: `vui-chart-ref ${line.className}`,
          d: `M${round(left)} ${y}H${round(right)}`,
        }),
        mark,
      )
    }
    const dots = drawn
      .map((index) => {
        const { x, y } = points[index] as Point
        return `M${round(px(x))} ${round(py(y))}h0`
      })
      .join('')
    nodes.push(svg('path', { class: 'vui-chart-dot', d: dots, 'data-vui-series': 1 }))
    const named = drawn.filter((index) => (points[index] as Point).named)
    if (named.length <= MAX_POINT_LABELS) {
      for (const index of named) {
        const { x, y, label: text } = points[index] as Point
        const [at, by] = [px(x), py(y)]
        // Left of a point in the right half, so a label never runs off the plot.
        const end = at > (left + right) / 2
        nodes.push(
          svg(
            'text',
            {
              x: round(end ? at - 6 : at + 6),
              y: round(by - 5),
              'text-anchor': end ? 'end' : 'start',
              class: 'vui-chart-point-label',
            },
            clip(text, MAX_LABEL),
          ),
        )
      }
    }
    marks.replaceChildren(...nodes)
    image.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  paint(WIDTH)

  const tip = el('div', { class: 'vui-chart-tip', hidden: true, 'aria-hidden': 'true' })
  const row = (axisName: string, value: string) =>
    el('div', { class: 'vui-chart-tip-row' }, [el('span', {}, axisName), el('b', {}, value)])
  const hit = el('div', {
    class: 'vui-chart-hit',
    on: {
      pointermove(event) {
        const box = hit.getBoundingClientRect()
        const share = (event.clientX - box.left) / box.width
        const x = share * width
        const y = ((event.clientY - box.top) / box.height) * height
        let best = -1
        let distance = Number.POSITIVE_INFINITY
        points.forEach((point, index) => {
          const [at, by] = place(point.x, point.y)
          const gap = (at - x) ** 2 + (by - y) ** 2
          if (gap < distance) {
            distance = gap
            best = index
          }
        })
        const point = points[best]
        tip.hidden = point === undefined
        if (point === undefined) return
        tip.replaceChildren(
          el('div', { class: 'vui-chart-tip-head' }, point.label),
          row('x', xText(point.x)),
          row('y', yText(point.y)),
        )
        tip.setAttribute('data-vui-fill', String(fillOf(share, 1)))
        tip.toggleAttribute('data-vui-end', share > 0.5)
      },
      pointerleave() {
        tip.hidden = true
      },
    },
  })

  const stride = Math.ceil(points.length / MAX_TABLE_ROWS)
  const rows: HTMLElement[] = []
  for (let index = 0; index < points.length; index += stride) {
    const point = points[index] as Point
    rows.push(
      el('tr', {}, [
        el('th', { scope: 'row' }, point.label),
        el('td', {}, xText(point.x)),
        el('td', {}, yText(point.y)),
      ]),
    )
  }
  const table = el('table', {}, [
    el('caption', {}, stride > 1 ? `${name}, 1 row in ${stride}` : name),
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ['Point', 'x', 'y'].map((cell) => el('th', { scope: 'col' }, cell)),
      ),
    ),
    el('tbody', {}, rows),
  ])
  plot.append(hit, tip, el('div', { class: 'vui-sr-only' }, table))
  context.onDestroy(
    watchWidth(plot, (measured) => {
      const next = Math.round(measured)
      if (next > 0 && next !== width) paint(next)
    }),
  )
  return wrapper
}
