import { ext } from '@vadd/ui-render'
import { start } from './boot.js'
import { type Render, render, version } from './index.js'

declare global {
  interface Window {
    /** §9.2: for manual use. */
    VUI: { render: Render; version: string }
  }
}

// With both bundles on one page, the `ext` one wins whichever loads first (VD-219): it always
// takes `VUI`, the core one only an empty slot, and only the owner of `VUI` boots.
const own = { render, version }
// Anything without `render` in that slot is not a bundle's, so it gives way (§9.2).
if (ext || typeof window.VUI?.render !== 'function') window.VUI = own
start(document, () => window.VUI === own)
