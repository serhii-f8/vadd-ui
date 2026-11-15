import { renderScatter } from '../chart/scatter.js'
import type { Component, Registry } from '../context.js'
import { chart } from './chart.js'
import { compare } from './compare.js'
import { flow } from './flow.js'
import { COMPONENTS } from './index.js'

/** The core chart, with `scatter` drawn instead of left as a placeholder (VD-184). */
const extChart: Component = {
  ...chart,
  render: (node, context) =>
    node.kind === 'scatter' ? renderScatter(node, context) : chart.render(node, context),
}

/** The whole catalog of §6: the core components and the `ext` tier (VD-182). */
export const EXT_COMPONENTS: Registry = new Map([
  ...COMPONENTS,
  ['chart', extChart],
  ['compare', compare],
  ['flow', flow],
])
