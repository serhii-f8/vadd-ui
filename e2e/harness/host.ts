import type { Page } from '@playwright/test'
import { cleanText } from '../../packages/ui-spec/src/dev-view.js'
import { harnessBundle } from './bundle.js'
import {
  buildNativeChatVisualDocument,
  clampNativeChatVisualHeight,
  NATIVE_CHAT_VISUAL_FRAME_NAME_PREFIX,
  NATIVE_CHAT_VISUAL_SIZE_TYPE,
  nativeChatVisualThemeMessage,
} from './orca/src/shared/native-chat/visuals/native-chat-visual-shell.js'
import { type Scheme, THEMES } from './theme.js'

const CHANNEL = 'vui-harness'
const HOST_URL = 'http://orca-host.test/'
const RESERVED_HEIGHT = 240

export interface Visual {
  input: unknown
  now?: string
  diagnostics?: 'hidden' | 'badge' | 'panel'
  /** A whole visual body, for a test of the real bundle. */
  html?: string
}

function scriptSafe(json: string): string {
  return json.replace(/</g, '\\u003c')
}

/** The `<title>` text the CLI writes (§10.1): the cleaned title, else (blank too) `vadd-ui`. */
function titleOf(input: unknown): string {
  const title =
    typeof input === 'object' && input !== null && 'title' in input ? input.title : undefined
  const clean = typeof title === 'string' ? cleanText(title) : ''
  const text = clean.trim() === '' ? 'vadd-ui' : clean
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/**
 * A visual file: what the CLI will write, with the harness bundle in place of ours. Its
 * `<html lang>` and `<title>` land in the shell's document as the real file's do (VD-167).
 */
function visualHtml(visual: Visual): string {
  return `<html lang="en"><head><title>${titleOf(visual.input)}</title></head>
<body>
<div id="vui" class="vui-root"></div>
<script type="application/json" id="vui-input">${scriptSafe(JSON.stringify(visual))}</script>
<script>${harnessBundle()}</script>
</body>`
}

/**
 * The transcript side of `NativeChatVisualFrame.tsx`: same iframe attributes, same message
 * check, same clamp. The frame's document comes from Orca's own builder.
 */
export function hostPage(visual: Visual, scheme: Scheme, width: number): string {
  const theme = THEMES[scheme]
  const srcdoc = buildNativeChatVisualDocument({
    html: visual.html ?? visualHtml(visual),
    channel: CHANNEL,
    theme,
  })
  const config = {
    srcdoc,
    channel: CHANNEL,
    size: NATIVE_CHAT_VISUAL_SIZE_TYPE,
    min: clampNativeChatVisualHeight(0),
    max: clampNativeChatVisualHeight(Number.MAX_SAFE_INTEGER),
    reserved: RESERVED_HEIGHT,
    name: `${NATIVE_CHAT_VISUAL_FRAME_NAME_PREFIX}${CHANNEL}`,
    scheme,
  }
  return `<!doctype html>
<html class="${scheme}"><head><meta charset="utf-8"><title>Orca shell harness</title></head>
<body style="margin:0;background:${theme.tokens['--background']}">
<div id="box" style="width:${width}px"></div>
<script>
const C = ${scriptSafe(JSON.stringify(config))}
const box = document.getElementById('box')
box.style.height = C.reserved + 'px'
const frame = document.createElement('iframe')
frame.name = C.name
frame.title = 'visual'
frame.setAttribute('sandbox', 'allow-scripts')
frame.setAttribute('referrerpolicy', 'no-referrer')
frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent;color-scheme:' + C.scheme
frame.srcdoc = C.srcdoc
window.__reports = []
window.addEventListener('message', (event) => {
  const data = event.data
  if (event.source !== frame.contentWindow || !data || data.channel !== C.channel) return
  if (data.type !== C.size) return
  window.__reports.push(data.height)
  box.style.height = Math.min(C.max, Math.max(C.min, Math.round(data.height))) + 'px'
})
window.__post = (message) => frame.contentWindow.postMessage(message, '*')
box.append(frame)
</script></body></html>`
}

export interface Opened {
  /** The visual's frame. */
  frame: import('@playwright/test').Frame
  iframe: import('@playwright/test').Locator
  /** Every URL the page asked for. */
  requests: string[]
  /** Console lines, for CSP errors the listener cannot see. */
  console: string[]
  lastReport(): Promise<number | undefined>
  /** Sends what Orca sends on a theme change. */
  switchTheme(scheme: Scheme): Promise<void>
}

export async function openVisual(
  page: Page,
  visual: Visual,
  scheme: Scheme,
  width: number,
): Promise<Opened> {
  const requests: string[] = []
  const console: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('console', (message) => console.push(message.text()))
  await page.route(HOST_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: hostPage(visual, scheme, width) }),
  )
  await page.setViewportSize({ width, height: 900 })
  await page.goto(HOST_URL)
  const iframe = page.locator('iframe')
  const handle = await iframe.elementHandle()
  const frame = await handle?.contentFrame()
  if (!frame) throw new Error('no visual frame')
  const lastReport = () =>
    page.evaluate(() => {
      const { __reports: reports } = window as unknown as { __reports: number[] }
      return reports[reports.length - 1]
    })
  await frame.waitForSelector('.vui-doc', { state: 'attached' })
  return {
    frame,
    iframe,
    requests,
    console,
    lastReport,
    switchTheme: async (next) => {
      const message = nativeChatVisualThemeMessage(THEMES[next], CHANNEL)
      await page.evaluate((payload) => {
        ;(window as unknown as { __post(value: unknown): void }).__post(payload)
      }, message)
    },
  }
}

/** Waits for the frame to fit its last report, as a stable screenshot needs. */
export async function settled(opened: Opened): Promise<void> {
  const { frame, iframe, lastReport } = opened
  await iframe
    .page()
    .waitForFunction(() => (window as never as { __reports: number[] }).__reports.length > 0)
  for (let round = 0; round < 50; round += 1) {
    const report = await lastReport()
    const content = await frame.evaluate(
      () => document.documentElement.getBoundingClientRect().height,
    )
    const box = await iframe.boundingBox()
    if (
      report === Math.ceil(content) &&
      Math.abs((box?.height ?? 0) - clampNativeChatVisualHeight(report)) < 1
    )
      return
    await iframe.page().waitForTimeout(20)
  }
  throw new Error('frame never settled')
}
