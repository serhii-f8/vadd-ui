export type { Render, RenderHandle, RenderOptions } from '@vadd/ui-render'
export { render, stylesheet } from '@vadd/ui-render'

/** Set by the bundle build and by Vitest, from this package's manifest. */
declare const __VUI_VERSION__: string

export const packageName = '@vadd/ui' as const

export const version: string = __VUI_VERSION__
