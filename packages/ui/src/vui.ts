import { type Render, render, version } from './index.js'

declare global {
  interface Window {
    /** §9.2: for manual use. */
    VUI: { render: Render; version: string }
  }
}

window.VUI = { render, version }
