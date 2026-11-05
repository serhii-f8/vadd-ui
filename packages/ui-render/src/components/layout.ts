import type { Component } from '../context.js'
import { el } from '../el.js'
import { nodeList, text, whole } from './fields.js'

const GAPS: ReadonlySet<string> = new Set(['sm', 'md', 'lg'])
const MAX_COLS = 6
const SPAN = 'data-vui-span'

/** Enough columns to fill rows evenly, up to four (VD-069). */
function autoColumns(count: number): number {
  if (count <= 3) return Math.max(count, 1)
  if (count === 4) return 2
  return count <= 6 ? 3 : 4
}

export const stack: Component = {
  render(node, context) {
    const wanted = text(node, 'gap')
    const gap = GAPS.has(wanted) ? wanted : 'md'
    const children = context.children(nodeList(node, 'children'), `${context.pointer}/children`)
    return el('div', { class: `vui-stack vui-gap-${gap}` }, children)
  },
}

export const grid: Component = {
  render(node, context) {
    const nodes = nodeList(node, 'children')
    const wanted = whole(node, 'cols')
    const valid = wanted !== undefined && wanted >= 1 && wanted <= MAX_COLS
    const cols = valid ? wanted : autoColumns(nodes.length)
    const children = context.children(nodes, `${context.pointer}/children`)
    for (const child of children) {
      // A span past the last column would add implicit tracks, and the frame set it blind.
      if (Number(child.getAttribute(SPAN)) > cols) child.setAttribute(SPAN, String(cols))
    }
    const body = el('div', { class: 'vui-grid', 'data-vui-cols': cols }, children)
    return el('div', { class: 'vui-grid-box' }, body)
  },
}

const plainChildren: Component = {
  render: (node, context) =>
    context.children(nodeList(node, 'children'), `${context.pointer}/children`),
}

export const section = plainChildren

/** The frame is the surface, so title and note sit inside it (see `css/components.ts`). */
export const card = plainChildren

export const divider: Component = {
  render(node) {
    const label = text(node, 'label')
    if (label === '') return el('hr', { class: 'vui-divider' })
    const attributes = { class: 'vui-divider-label', role: 'separator', 'aria-label': label }
    return el('div', attributes, el('span', {}, label))
  },
}
