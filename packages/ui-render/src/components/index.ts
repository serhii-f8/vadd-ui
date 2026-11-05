import type { Registry } from '../context.js'
import { code } from './code.js'
import { kv, list, progress, stats } from './data.js'
import { card, divider, grid, section, stack } from './layout.js'
import { callout, md } from './md.js'
import { table } from './table.js'
import { tabs } from './tabs.js'

/** The catalog of §6. Tasks 08 to 10 fill the rest; until then a node is a placeholder (§9.3). */
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
  ['table', table],
  ['kv', kv],
  ['stats', stats],
  ['list', list],
  ['progress', progress],
])
