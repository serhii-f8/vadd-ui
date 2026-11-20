import { EXT_COMPONENTS } from './components/ext.js'
import { extCss } from './css/ext.js'
import { stylesheet as coreCss } from './css/index.js'
import { createRenderer, type Render } from './renderer.js'

// Types only: `ui-react` reaches ui-spec through this package, its one §3 edge.
export type { Diagnostic, VuiDocument } from '@vadd/ui-spec'
export { pageCss } from './css/tokens.js'
export type { DiagnosticsMode } from './diagnostics.js'
export type { Render, RenderHandle, RenderOptions } from './renderer.js'

export const packageName = '@vadd/ui-render' as const

/** The §6 tier this entry draws: a page with both bundles lets the `ext` one win (§9.2). */
export const ext = true

/** The whole stylesheet, `ext` rules included. Each host injects it once (§9.2). */
export const stylesheet: string = coreCss + extCss

/** §9.1. Mounts `input` into `target`, every §6 component included. Never throws to the host. */
export const render: Render = createRenderer(EXT_COMPONENTS)
