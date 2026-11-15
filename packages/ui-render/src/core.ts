import { COMPONENTS } from './components/index.js'
import { createRenderer, type Render } from './renderer.js'

// `@vadd/ui-render/core`: the §6 `core` tier alone, which `vui.min.js` is built from (VD-182).
// The package root draws the `ext` tier too.

export { stylesheet } from './css/index.js'
export { pageCss } from './css/tokens.js'
export type { Render, RenderHandle, RenderOptions } from './renderer.js'

/** §9.1 over the core components; an ext node is a §9.3 placeholder. */
export const render: Render = createRenderer(COMPONENTS)
