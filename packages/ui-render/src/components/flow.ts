import { clip, hasOwn, inlineToPlain, parseInline, STATUS_TONES, type Status } from '@vadd/ui-spec'
import type { Component } from '../context.js'
import { el, svg } from '../el.js'
import { type FlowBox, type FlowLink, layoutFlow } from '../flow/layout.js'
import { STATUS_ICONS, toneClass } from '../inline.js'
import { nodeList, text } from './fields.js'

// §6.5 `flow`, drawn left to right from `layoutFlow` (VD-185). Text width is estimated from
// its length, as charts do, so nothing is measured (§9.3). The SVG keeps its natural size and
// its box scrolls, so a wide graph never widens the page; rows close up so 40 fit under 2,000 px.

const BOX_W = 140
const BOX_H = 32
const COL = 188
const ROW = 52
/** Under Orca's 2,000 px frame (§9.3), with room for the title around it. */
const MAX_HEIGHT = 1960
// Room for a back edge's curl beside the first and last columns: half a column gap, and a hair.
const PAD = 26
const TOP = 28
const MAX_LABEL = 20
const MAX_EDGE_LABEL = 24
const CHAR = 6.4
const ARROW = 6
const LANE = 16
/** Back edges past this share the last lane, so many cycles cannot grow the height. */
const MAX_LANES = 6

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
function placeBoxes(boxes: FlowBox[], rows: number, pitch: number, column: number): Point[] {
  const sizes = new Map<number, number>()
  for (const { layer } of boxes) sizes.set(layer, (sizes.get(layer) ?? 0) + 1)
  return boxes.map(({ layer, row }) => ({
    x: PAD + layer * column,
    y: TOP + (row + (rows - (sizes.get(layer) as number)) / 2) * pitch,
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
    svg('title', {}, status === undefined ? box.label : `${box.label} (${status})`),
    svg('path', { class: 'vui-flow-node', d: BOX }),
    svg(
      'text',
      { class: 'vui-flow-label', x: BOX_W / 2, y: BOX_H / 2 + 4, 'text-anchor': 'middle' },
      glyph + label,
    ),
  ])
}

/** The curve of one edge, its arrowhead, and the middle of the curve for a label. */
function edgePath(link: FlowLink, from: Point, to: Point, lane: number) {
  if (link.from === link.to) {
    // A self-loop arcs over its box and comes back down into it.
    const sx = from.x + BOX_W * 0.7
    const tx = from.x + BOX_W * 0.3
    const by = from.y - TOP + 4
    const d = `M${sx} ${round(from.y)}C${sx} ${round(by)} ${tx} ${round(by)} ${tx} ${round(from.y)}`
    const head = `M${tx} ${round(from.y)}l${-ARROW / 2 - 1} ${-ARROW}h${ARROW + 2}z`
    return { d, head, mid: { x: (sx + tx) / 2, y: (from.y + 3 * by) / 4 } }
  }
  if (link.back) {
    // Out of the source's right side, down its column gap, under every box along `lane`, up
    // the target's column gap and into its left side, so it never crosses a box.
    const gap = (COL - BOX_W) / 2
    const sx = from.x + BOX_W
    const sy = round(from.y + BOX_H / 2)
    const tx = to.x - 1
    const ty = round(to.y + BOX_H / 2)
    const d =
      `M${sx} ${sy}C${sx + gap} ${sy} ${sx + gap} ${lane} ${sx} ${lane}` +
      `L${tx} ${lane}C${tx - gap} ${lane} ${tx - gap} ${ty} ${tx} ${ty}`
    const head = `M${tx} ${ty}l${-ARROW} ${-ARROW / 2 - 1}v${ARROW + 2}z`
    return { d, head, mid: { x: (sx + tx) / 2, y: lane } }
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

const labelWidth = (label: string) => round([...clip(label, MAX_EDGE_LABEL)].length * CHAR + 12)

function edgeLabel(label: string, mid: Point): SVGElement {
  const shown = clip(label, MAX_EDGE_LABEL)
  const width = labelWidth(label)
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
    // Rows close up past about 36, so 40 rows and every back-edge lane still fit the cap.
    const room = MAX_HEIGHT - TOP - BOX_H - LANE * (MAX_LANES + 1)
    const pitch = Math.min(ROW, Math.floor(room / Math.max(rows - 1, 1)))
    // B13: a gap that fits the widest edge label with the arrowhead clear on both sides.
    const widest = links.reduce((most, { label }) => Math.max(most, label && labelWidth(label)), 0)
    const column = BOX_W + Math.max(COL - BOX_W, round(widest + 4 * ARROW))
    const places = placeBoxes(boxes, rows, pitch, column)
    const width = PAD * 2 + (layers - 1) * column + BOX_W
    // Back edges run below the boxes, one lane each.
    const floor = TOP + (rows - 1) * pitch + BOX_H + LANE
    const backs = links.filter((link) => link.back && link.from !== link.to).length
    const lanes = Math.min(backs, MAX_LANES)
    const height = floor + Math.max(lanes - 1, 0) * LANE + LANE
    let back = 0
    const marks: (SVGElement | null)[] = []
    const labels: SVGElement[] = []
    let heads = ''
    for (const link of links) {
      context.checkpoint()
      const { d, head, mid } = edgePath(
        link,
        places[link.from] as Point,
        places[link.to] as Point,
        floor + Math.min(back, MAX_LANES - 1) * LANE,
      )
      if (link.back && link.from !== link.to) back += 1
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
