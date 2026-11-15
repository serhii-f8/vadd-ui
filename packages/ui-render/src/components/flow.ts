import { clip, hasOwn, inlineToPlain, parseInline, STATUS_TONES, type Status } from '@vadd/ui-spec'
import type { Component } from '../context.js'
import { el, svg } from '../el.js'
import { type FlowBox, type FlowLink, layoutFlow } from '../flow/layout.js'
import { STATUS_ICONS, toneClass } from '../inline.js'
import { nodeList, text } from './fields.js'

// §6.5 `flow`, drawn left to right from `layoutFlow` (VD-185). Text width is estimated from
// its length, as charts do, so nothing is measured (§9.3). The SVG keeps its natural size and
// its box scrolls, so a wide graph never widens the page; 40 rows stay under 2,000 px.

const BOX_W = 140
const BOX_H = 32
const COL = 188
const ROW = 52
const PAD = 12
const TOP = 28
const MAX_LABEL = 20
const MAX_EDGE_LABEL = 24
const CHAR = 6.4
const ARROW = 6

const round = (value: number) => Math.round(value * 10) / 10

/** A rounded box from its top left, as a path: `el`'s SVG has no `rect` (its §15.1 list). */
const rounded = (width: number, height: number, r: number) =>
  `M${r} 0h${round(width - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${round(2 * r - width)}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - height}a${r} ${r} 0 0 1 ${r} ${-r}z`

const BOX = rounded(BOX_W, BOX_H, 6)
const at = (x: number, y: number) => `translate(${round(x)} ${round(y)})`

interface Point {
  x: number
  y: number
}

/** Where each box sits: its layer's column, its row centered on the tallest layer. */
function placeBoxes(boxes: FlowBox[], rows: number): Point[] {
  const sizes = new Map<number, number>()
  for (const { layer } of boxes) sizes.set(layer, (sizes.get(layer) ?? 0) + 1)
  return boxes.map(({ layer, row }) => ({
    x: PAD + layer * COL,
    y: TOP + (row + (rows - (sizes.get(layer) as number)) / 2) * ROW,
  }))
}

const statusOf = (box: FlowBox): Status | undefined =>
  box.status !== undefined && hasOwn(STATUS_TONES, box.status) ? (box.status as Status) : undefined

function boxMark(box: FlowBox, place: Point): SVGElement {
  const status = statusOf(box)
  const glyph = status === undefined ? '' : `${STATUS_ICONS[status]} `
  const label = clip(box.label, MAX_LABEL)
  const classes = ['vui-flow-box', status === undefined ? '' : toneClass(STATUS_TONES[status])]
  if (box.implicit) classes.push('vui-flow-implicit')
  return svg('g', { class: classes.filter(Boolean).join(' '), transform: at(place.x, place.y) }, [
    svg('title', {}, box.label),
    svg('path', { class: 'vui-flow-node', d: BOX }),
    svg(
      'text',
      { class: 'vui-flow-label', x: BOX_W / 2, y: BOX_H / 2 + 4, 'text-anchor': 'middle' },
      glyph + label,
    ),
  ])
}

/** The curve of one edge, its arrowhead, and the middle of the curve for a label. */
function edgePath(link: FlowLink, from: Point, to: Point) {
  if (link.back) {
    // Under both boxes, back to the bottom of the target, pointing up; a self-loop goes over.
    const self = link.from === link.to
    const sx = from.x + BOX_W * (self ? 0.7 : 0.5)
    const tx = to.x + BOX_W * (self ? 0.3 : 0.5)
    const sy = self ? from.y : from.y + BOX_H
    const ty = self ? to.y : to.y + BOX_H
    const by = self ? from.y - TOP + 4 : Math.max(sy, ty) + ROW / 2 + 4
    const d = `M${sx} ${round(sy)}C${sx} ${round(by)} ${tx} ${round(by)} ${tx} ${round(ty)}`
    const head = self
      ? `M${tx} ${round(ty)}l${-ARROW / 2 - 1} ${-ARROW}h${ARROW + 2}z`
      : `M${tx} ${round(ty)}l${-ARROW / 2 - 1} ${ARROW}h${ARROW + 2}z`
    return { d, head, mid: { x: (sx + tx) / 2, y: (sy + 3 * by + 3 * by + ty) / 8 } }
  }
  const sx = from.x + BOX_W
  const sy = from.y + BOX_H / 2
  const tx = to.x - 1
  const ty = to.y + BOX_H / 2
  const bend = (tx - sx) / 2
  const d = `M${sx} ${round(sy)}C${round(sx + bend)} ${round(sy)} ${round(tx - bend)} ${round(ty)} ${tx} ${round(ty)}`
  const head = `M${tx} ${round(ty)}l${-ARROW} ${-ARROW / 2 - 1}v${ARROW + 2}z`
  return { d, head, mid: { x: (sx + tx) / 2, y: (sy + ty) / 2 } }
}

function edgeLabel(label: string, mid: Point): SVGElement {
  const shown = clip(label, MAX_EDGE_LABEL)
  const width = round([...shown].length * CHAR + 12)
  return svg('g', { class: 'vui-flow-edge-label', transform: at(mid.x - width / 2, mid.y - 8) }, [
    shown === label ? null : svg('title', {}, label),
    svg('path', { d: rounded(width, 16, 8) }),
    svg('text', { x: round(width / 2), y: 12, 'text-anchor': 'middle' }, shown),
  ])
}

/** The text renderer's list, for a screen reader: each node and where its edges go. */
function outline(boxes: FlowBox[], links: FlowLink[]): HTMLElement {
  const name = (box: FlowBox) => {
    const status = statusOf(box)
    return status === undefined ? box.label : `${box.label} (${status})`
  }
  const items = boxes.map((box, index) => {
    const targets = links
      .filter(({ from }) => from === index)
      .map(({ to, label }) => {
        const target = (boxes[to] as FlowBox).label
        return label === '' ? target : `${target} (${label})`
      })
    return el('li', {}, targets.length === 0 ? name(box) : `${name(box)} → ${targets.join(', ')}`)
  })
  return el('div', { class: 'vui-sr-only' }, el('ul', {}, items))
}

export const flow: Component = {
  render(node, context) {
    const layout = layoutFlow(nodeList(node, 'nodes'), nodeList(node, 'edges'))
    const { nodes: boxes, edges: links, layers, rows } = layout
    if (boxes.length === 0) return el('p', { class: 'vui-empty' }, 'No nodes')
    const places = placeBoxes(boxes, rows)
    const width = PAD * 2 + (layers - 1) * COL + BOX_W
    const height = TOP + rows * ROW + ROW / 2
    const marks: (SVGElement | null)[] = []
    const labels: SVGElement[] = []
    let heads = ''
    for (const link of links) {
      context.checkpoint()
      const { d, head, mid } = edgePath(link, places[link.from] as Point, places[link.to] as Point)
      heads += head
      marks.push(svg('path', { class: `vui-flow-edge${link.back ? ' vui-flow-back' : ''}`, d }))
      if (link.label !== '') labels.push(edgeLabel(link.label, mid))
    }
    const title = inlineToPlain(parseInline(text(node, 'title'))) || 'Flow'
    const count = (size: number, word: string) => `${size} ${word}${size === 1 ? '' : 's'}`
    const image = svg('svg', { role: 'img', width, height, viewBox: `0 0 ${width} ${height}` }, [
      svg('title', {}, title),
      svg('desc', {}, `Flow, ${count(boxes.length, 'node')}, ${count(links.length, 'edge')}`),
      ...marks,
      svg('path', { class: 'vui-flow-arrows', d: heads }),
      ...boxes.map((box, index) => boxMark(box, places[index] as Point)),
      ...labels,
    ])
    // A wide graph scrolls in its box, so a keyboard must be able to reach it (WCAG 2.1.1).
    const box = { class: 'vui-flow', tabindex: 0, role: 'group', 'aria-label': title }
    return el('div', box, [image, outline(boxes, links)])
  },
}
