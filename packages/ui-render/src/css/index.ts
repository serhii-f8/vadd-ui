import { baseCss } from './base.js'
import { componentCss } from './components.js'
import { tokenCss } from './tokens.js'

/** The whole stylesheet. Each host injects it once (§9.2); `render` never does. */
export const stylesheet = tokenCss + baseCss + componentCss
