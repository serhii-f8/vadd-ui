import type { Registry } from '../context.js'
import { chart } from './chart.js'
import { code } from './code.js'
import { kv, list, progress, stats } from './data.js'
import { checks, diff, plan, timeline, tree } from './dev.js'
import { card, divider, grid, section, stack } from './layout.js'
import { callout, md } from './md.js'
import { table } from './table.js'
import { tabs } from './tabs.js'

/** The catalog of §6. `compare` and `flow` wait for task 22; until then a node is a placeholder (§9.3). */
export const COMPONENTS: Registry = new Map([
  ['stack', stack],
  ['grid', grid],
  ['section', section],
  ['card', card],
  ['tabs', tabs],
  ['divider', divider],
  ['md', md],
  ['callout', callout],
  ['code', code],
  ['chart', chart],
  ['table', table],
  ['kv', kv],
  ['stats', stats],
  ['list', list],
  ['progress', progress],
  ['checks', checks],
  ['plan', plan],
  ['diff', diff],
  ['tree', tree],
  ['timeline', timeline],
])
