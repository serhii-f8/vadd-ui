import { COMPONENTS } from './components/index.js'
import { createRenderer, type Render } from './renderer.js'

// `@vadd/ui-render/core`: the §6 `core` tier alone, which `vui.min.js` is built from (VD-182).
// The package root draws the `ext` tier too.

export { stylesheet } from './css/index.js'
export { pageCss } from './css/tokens.js'

/** The §6 tier this entry draws: a page with both bundles lets the `ext` one win (§9.2). */
export const ext = false
export type { Render, RenderHandle, RenderOptions } from './renderer.js'

/** §9.1 over the core components; an ext node is a §9.3 placeholder. */
export const render: Render = createRenderer(COMPONENTS)
