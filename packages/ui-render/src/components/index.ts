import type { Registry } from '../context.js'
import { code } from './code.js'
import { card, divider, grid, section, stack } from './layout.js'
import { tabs } from './tabs.js'

/** The catalog of §6. Tasks 08 to 10 fill the rest; until then a node is a placeholder (§9.3). */
export const COMPONENTS: Registry = new Map([
  ['stack', stack],
  ['grid', grid],
  ['section', section],
  ['card', card],
  ['tabs', tabs],
  ['divider', divider],
  ['code', code],
])
