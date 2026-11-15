import type { Registry } from '../context.js'
import { compare } from './compare.js'
import { flow } from './flow.js'
import { COMPONENTS } from './index.js'

/** The whole catalog of §6: the core components and the `ext` tier (VD-182). */
export const EXT_COMPONENTS: Registry = new Map([
  ...COMPONENTS,
  ['compare', compare],
  ['flow', flow],
])
