import { EXT_COMPONENTS } from '../../packages/ui-render/src/components/ext.js'
import { stylesheet } from '../../packages/ui-render/src/index.js'
import { createRenderer, type RenderHandle } from '../../packages/ui-render/src/renderer.js'
import { FIXTURES } from './fixtures.js'

// Runs inside the visual. It stands in for `vui.min.js`, which cannot hold the fixture
// components, and it boots the same way, with every §6 tier (VD-182): the stylesheet goes in by script, as §9.2 step 3 says.
// `bundle.spec.ts` runs the real bundle.

interface HarnessWindow {
  __vuiViolations: string[]
  __vuiHandle: RenderHandle
}

const harness = window as unknown as HarnessWindow
harness.__vuiViolations = []
document.addEventListener('securitypolicyviolation', (event) => {
  harness.__vuiViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
})

const style = document.createElement('style')
style.id = 'vui-style'
style.textContent = stylesheet
document.head.append(style)

const source = document.getElementById('vui-input') as HTMLElement
const { input, now, diagnostics = 'hidden' } = JSON.parse(source.textContent as string)
harness.__vuiHandle = createRenderer(new Map([...FIXTURES, ...EXT_COMPONENTS]))(
  input,
  document.getElementById('vui') as HTMLElement,
  now === undefined ? { diagnostics } : { diagnostics, now: new Date(now) },
)
