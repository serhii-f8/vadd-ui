import {
  hasOwn,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  joinPointer,
  rawText,
  STATUS_TONES,
  type Status,
  statDeltaFormat,
} from '@vadd/ui-spec'
import { SPARK_HEIGHT, SPARK_WIDTH, sparkPath } from '../chart/draw.js'
import type { Component, NodeContext } from '../context.js'
import { type Child, el, svg } from '../el.js'
import { fillOf, fillShares } from '../fill.js'
import { statusBadge, toneClass, tonedClass, toneMark, toneOf } from '../inline.js'
import { field, finite, nodeList, objects, text, whole } from './fields.js'

const MAX_KV_COLS = 3

interface Pair {
  key: string
  value: JsonValue | undefined
  format: string | undefined
  at: string
}

function pairsOf(node: JsonObject, pointer: string): Pair[] {
  const pairs = field(node, 'pairs')
  if (isJsonObject(pairs)) {
    return Object.entries(pairs).map(([key, value]) => ({
      key,
      value,
      format: undefined,
      at: joinPointer(pointer, key),
    }))
  }
  return nodeList(node, 'pairs').flatMap((pair, index) => {
    if (!Array.isArray(pair)) return []
    const [key, value, format] = pair
    return {
      key: rawText(key ?? ''),
      value,
      format: typeof format === 'string' ? format : undefined,
      at: `${pointer}/${index}/1`,
    }
  })
}

export const kv: Component = {
  render(node, context) {
    const wanted = whole(node, 'cols')
    const cols = wanted !== undefined && wanted >= 1 && wanted <= MAX_KV_COLS ? wanted : 1
    const entries = pairsOf(node, `${context.pointer}/pairs`).map(({ key, value, format, at }) =>
      el('div', { class: 'vui-kv-item' }, [
        el('dt', {}, key),
        el('dd', {}, context.value(value, format, at)),
      ]),
    )
    const list = el('dl', { class: 'vui-kv', 'data-vui-cols': cols }, entries)
    return el('div', { class: 'vui-grid-box' }, list)
  },
}

function spark(values: JsonValue[], context: NodeContext): HTMLElement | null {
  const points = values.filter((value): value is number => Number.isFinite(value))
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return null
  const number = (value: number) => context.format(value, 'num', context.pointer).text
  const count = `${number(points.length)} point${points.length === 1 ? '' : 's'}`
  const label = `Trend, ${count}, from ${number(first)} to ${number(last)}`
  const line = svg('path', { class: 'vui-chart-line', d: sparkPath(points) })
  return el(
    'span',
    { class: 'vui-spark', role: 'img', 'aria-label': label },
    svg(
      'svg',
      {
        viewBox: `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`,
        preserveAspectRatio: 'none',
        width: '100%',
        height: '100%',
      },
      line,
    ),
  )
}

function statTile(item: JsonObject, at: string, context: NodeContext): HTMLElement {
  const format = field(item, 'format')
  const delta = finite(item, 'delta')
  const tone = toneOf(field(item, 'tone'))
  const line = spark(nodeList(item, 'spark'), context)
  const parts: Child[] = [
    el('dt', { class: 'vui-stat-label' }, [
      tone === undefined ? null : toneMark(tone),
      text(item, 'label'),
    ]),
    el(
      'dd',
      { class: 'vui-stat-value' },
      context.value(field(item, 'value'), format as string | undefined, `${at}/value`),
    ),
    delta === undefined
      ? null
      : el(
          'dd',
          { class: 'vui-stat-delta' },
          context.value(delta, statDeltaFormat(item), `${at}/delta`),
        ),
    line === null ? null : el('dd', { class: 'vui-stat-spark' }, line),
  ]
  const toned = tone === undefined ? '' : ` ${tonedClass(tone)}`
  return el('div', { class: `vui-stat${toned}` }, parts)
}

export const stats: Component = {
  render(node, context) {
    const pointer = `${context.pointer}/items`
    const tiles = objects(nodeList(node, 'items')).map(({ item, index }) =>
      statTile(item, `${pointer}/${index}`, context),
    )
    return el('dl', { class: 'vui-stats' }, tiles)
  },
}

/** The badge of an item's `status`, if it has a real one. */
export function badgeOf(item: JsonObject): HTMLElement | null {
  const status = field(item, 'status')
  return typeof status === 'string' && hasOwn(STATUS_TONES, status)
    ? statusBadge(status as Status)
    : null
}

function listItem(item: JsonValue, context: NodeContext): HTMLElement {
  if (typeof item === 'string') return el('li', {}, context.inline(item))
  if (!isJsonObject(item)) return el('li')
  const badge = badgeOf(item)
  const note = field(item, 'note')
  return el('li', { class: badge === null ? undefined : 'vui-list-status' }, [
    badge,
    badge === null ? null : ' ',
    ...context.inline(text(item, 'text')),
    typeof note === 'string' ? el('p', { class: 'vui-note' }, context.inline(note)) : null,
  ])
}

export const list: Component = {
  render(node, context) {
    const items = nodeList(node, 'items').map((item) => listItem(item, context))
    return el(node.ordered === true ? 'ol' : 'ul', { class: 'vui-list' }, items)
  },
}

function segmentBar(segments: JsonObject[], scale: number): HTMLElement[] {
  const shares = fillShares(
    segments.map((segment) => finite(segment, 'value') ?? 0),
    scale,
  )
  return segments.map((segment, index) => {
    const tone = toneOf(field(segment, 'tone'))
    const toned = tone === undefined ? '' : ` ${toneClass(tone)}`
    return el('span', { class: `vui-fill${toned}`, 'data-vui-fill': shares[index] })
  })
}

function legend(segments: { item: JsonObject; index: number }[], context: NodeContext) {
  const pointer = `${context.pointer}/segments`
  const entries = segments.map(({ item, index }) => {
    const tone = toneOf(field(item, 'tone'))
    return el('li', {}, [
      el('span', {
        class: `vui-legend-swatch${tone === undefined ? '' : ` ${toneClass(tone)}`}`,
        'aria-hidden': 'true',
      }),
      tone === undefined ? null : toneMark(tone, `vui-mark ${toneClass(tone)}`),
      el('span', { class: 'vui-legend-label' }, text(item, 'label')),
      el(
        'span',
        { class: 'vui-legend-value' },
        context.format(field(item, 'value'), 'num', `${pointer}/${index}/value`).text,
      ),
    ])
  })
  return el('ul', { class: 'vui-legend' }, entries)
}

export const progress: Component = {
  render(node, context) {
    const { pointer } = context
    const value = finite(node, 'value') ?? 0
    const max = finite(node, 'max') ?? 100
    const usable = max > 0
    const number = (amount: number, name: string) =>
      context.format(amount, 'num', `${pointer}/${name}`).text
    const percent = usable
      ? ` (${context.format(value / max, 'pct:0', `${pointer}/value`).text})`
      : ''
    const label = text(node, 'label')
    const parts = objects(nodeList(node, 'segments'))
    const segments = parts.map(({ item }) => item)
    const fills =
      parts.length > 0
        ? segmentBar(segments, max)
        : [el('span', { class: 'vui-fill', 'data-vui-fill': fillOf(value, max) })]
    const track = el(
      'div',
      {
        class: 'vui-track',
        role: 'progressbar',
        'aria-label': label === '' ? 'Progress' : label,
        'aria-valuemin': usable ? 0 : undefined,
        'aria-valuemax': usable ? max : undefined,
        'aria-valuenow': usable ? Math.min(Math.max(value, 0), max) : undefined,
      },
      fills,
    )
    return el('div', { class: 'vui-progress' }, [
      el('div', { class: 'vui-progress-head' }, [
        label === '' ? null : el('span', { class: 'vui-progress-label' }, label),
        el(
          'span',
          { class: 'vui-progress-value' },
          `${number(value, 'value')} of ${number(max, 'max')}${percent}`,
        ),
      ]),
      track,
      parts.length > 0 ? legend(parts, context) : null,
    ])
  },
}
