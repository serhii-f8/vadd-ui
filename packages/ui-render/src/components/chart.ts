import { CHART_LABELS, hasOwn, inlineToPlain, type JsonObject, parseInline } from '@vadd/ui-spec'
import { EXT_BUNDLE, placeholderCard } from '../cards.js'
import { type Drawing, draw, SPARK_HEIGHT, SPARK_WIDTH } from '../chart/draw.js'
import { type Model, readModel } from '../chart/model.js'
import { watchWidth } from '../chart/resize.js'
import type { Component, NodeContext } from '../context.js'
import { el, svg } from '../el.js'
import { fillOf } from '../fill.js'
import { text } from './fields.js'

type ChartKind = keyof typeof CHART_LABELS

const WIDTH = 640
const MAX_TABLE_ROWS = 200

const swatch = () => el('span', { class: 'vui-legend-swatch', 'aria-hidden': 'true' })

/** §15.2's wording. A unit both ends share prints once: `120–480 ms`. */
function describe(model: Model, label: string, context: NodeContext): string {
  const { count, series, range } = model
  const number = context.format(count, 'int', context.pointer).text
  const points = `${number} point${count === 1 ? '' : 's'}`
  const summary = `${label}, ${series.length} series, ${points}`
  if (range === undefined) return summary
  const low = model.value(range[0])
  const high = model.value(range[1])
  if (low === high) return `${summary}, range ${low}`
  const tail = (/\D*$/.exec(low) as RegExpExecArray)[0]
  const head = low.slice(0, low.length - tail.length)
  const shared = /\D*$/.exec(high)?.[0] === tail && !/\p{L}/u.test(head)
  return `${summary}, range ${shared ? head : low}–${high}`
}

function dataTable(model: Model, caption: string, context: NodeContext): HTMLElement {
  const { size, series, totals } = model
  const stride = Math.ceil(size / MAX_TABLE_ROWS)
  const rows: HTMLElement[] = []
  for (let index = 0; index < size; index += stride) {
    rows.push(
      el('tr', {}, [
        el('th', { scope: 'row' }, model.label(index)),
        ...series.map(({ values }) => el('td', {}, model.value(values[index]))),
        totals === undefined ? null : el('td', {}, model.value(totals[index])),
      ]),
    )
    context.checkpoint()
  }
  // A wrapper, because a table's box grows to its content whatever its size says.
  const table = el('table', {}, [
    el('caption', {}, stride > 1 ? `${caption}, 1 row in ${stride}` : caption),
    el(
      'thead',
      {},
      el('tr', {}, [
        el('th', { scope: 'col' }, 'Point'),
        ...series.map(({ name }) => el('th', { scope: 'col' }, name)),
        totals === undefined ? null : el('th', { scope: 'col' }, 'Total'),
      ]),
    ),
    el('tbody', {}, rows),
  ])
  return el('div', { class: 'vui-sr-only' }, table)
}

function legendOf(model: Model): HTMLElement | null {
  const names =
    model.kind === 'donut'
      ? Array.from({ length: model.size }, (_, index) => model.label(index))
      : model.series.map(({ name }) => name)
  if (names.length < 2) return null
  const entries = names.map((name, index) =>
    el('li', { 'data-vui-series': (index % 12) + 1 }, [
      swatch(),
      el('span', { class: 'vui-legend-label' }, name),
    ]),
  )
  return el('ul', { class: 'vui-legend' }, entries)
}

function tipRow(name: string, value: string, series?: number): HTMLElement {
  return el('div', { class: 'vui-chart-tip-row', 'data-vui-series': series }, [
    series === undefined ? null : swatch(),
    el('span', {}, name),
    el('b', {}, value),
  ])
}

function fillTip(tip: HTMLElement, model: Model, index: number): void {
  const { series, totals } = model
  tip.replaceChildren(
    el('div', { class: 'vui-chart-tip-head' }, model.label(index)),
    ...series.map(({ name, values }, order) =>
      tipRow(name, model.value(values[index]), (model.kind === 'donut' ? index % 12 : order) + 1),
    ),
    ...(totals === undefined ? [] : [tipRow('Total', model.value(totals[index]))]),
  )
}

export const chart: Component = {
  render(node: JsonObject, context) {
    const kind = text(node, 'kind') as ChartKind
    // The core bundle: the ext one registers its own chart (VD-184, VD-211).
    if (kind === 'scatter') {
      return placeholderCard(`scatter charts need ${EXT_BUNDLE}`, node, false, () => {})
    }
    const model = readModel(node, context)
    // An own key only: past VD-066's cap `kind` can be `__proto__` (VD-187).
    const label = hasOwn(CHART_LABELS, kind) ? CHART_LABELS[kind] : 'Chart'
    const name = inlineToPlain(parseInline(text(node, 'title'))) || label
    const spark = kind === 'spark'
    const height = spark ? SPARK_HEIGHT : model.height

    let width = spark ? SPARK_WIDTH : WIDTH
    let drawing: Drawing
    const marks = svg('g')
    const image = svg(
      'svg',
      { role: 'img', width: '100%', height, preserveAspectRatio: spark ? 'none' : undefined },
      [svg('title', {}, name), svg('desc', {}, describe(model, label, context)), marks],
    )
    const paint = (next: number) => {
      drawing = draw(model, next)
      width = next
      marks.replaceChildren(...drawing.nodes)
      image.setAttribute('viewBox', `0 0 ${next} ${height}`)
    }
    paint(width)

    const tip = el('div', { class: 'vui-chart-tip', hidden: true, 'aria-hidden': 'true' })
    const hit = el('div', {
      class: 'vui-chart-hit',
      on: {
        pointermove(event) {
          const box = hit.getBoundingClientRect()
          const share = (event.clientX - box.left) / box.width
          const index = drawing.at(share * width, ((event.clientY - box.top) / box.height) * height)
          tip.hidden = !(index >= 0)
          if (tip.hidden) return
          fillTip(tip, model, index)
          tip.setAttribute('data-vui-fill', String(fillOf(share, 1)))
          tip.toggleAttribute('data-vui-end', share > 0.5)
        },
        pointerleave() {
          tip.hidden = true
        },
      },
    })
    const plot = el('div', { class: 'vui-chart-plot' }, [
      image,
      hit,
      tip,
      dataTable(model, name, context),
    ])
    if (!spark) {
      const resized = (measured: number) => {
        const next = Math.round(measured)
        if (next > 0 && next !== width) paint(next)
      }
      context.onDestroy(watchWidth(plot, resized))
    }
    return el('div', { class: 'vui-chart', 'data-vui-kind': kind }, [
      plot,
      spark || node.legend === 'none' ? null : legendOf(model),
    ])
  },
}
