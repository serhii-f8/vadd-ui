import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// VD-195: `build-bundle.mjs` drops the CSS newlines at build time. The bundled stylesheet must
// be the very string the CSS modules make at runtime, and carry no newline.
const ESM = fileURLToPath(new URL('../../packages/ui/dist/index.js', import.meta.url))
const CORE = fileURLToPath(new URL('../../packages/ui/dist/vui.min.js', import.meta.url))
const CSS = fileURLToPath(new URL('../../packages/ui-render/dist/index.js', import.meta.url))

describe.runIf(existsSync(ESM) && existsSync(CSS))('flat-css build step', () => {
  it('bundles the same stylesheet the modules make at runtime', async () => {
    const bundled = (await import(ESM)) as { stylesheet: string }
    const runtime = (await import(CSS)) as { stylesheet: string }
    expect(bundled.stylesheet).toBe(runtime.stylesheet)
    // Only the ext tier's rules, which have no runtime strip, keep theirs.
    expect(bundled.stylesheet.split('.vui-compare')[0]?.trimEnd()).not.toContain('\n')
  })

  it('leaves no runtime newline strip in the core bundle', () => {
    expect(readFileSync(CORE, 'utf8')).not.toContain('.replace(/\\n/g,"")')
  })
})
