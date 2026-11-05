import { COMPONENTS } from './components/index.js'
import { createRenderer, type Render } from './renderer.js'

export { stylesheet } from './css/index.js'
export { pageCss } from './css/tokens.js'
export type { DiagnosticsMode } from './diagnostics.js'
export type { Render, RenderHandle, RenderOptions } from './renderer.js'

export const packageName = '@vadd/ui-render' as const

/** §9.1. Mounts `input` into `target`. Never throws to the host. */
export const render: Render = createRenderer(COMPONENTS)
