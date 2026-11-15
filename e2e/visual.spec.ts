import { expect, type Page, test } from '@playwright/test'
import { COMPONENT_TYPES } from '../packages/ui-spec/src/index.js'
import { axeSerious } from './harness/axe.js'
import { openVisual, settled } from './harness/host.js'
import { SCENES, WIDTHS } from './harness/scenes.js'
import type { Scheme } from './harness/theme.js'

const SCHEMES: Scheme[] = ['light', 'dark']

// The baselines are rendered on one Linux host (VD-064). A runner with other fonts (the Windows
// and macOS CI jobs) sets `VUI_PIXELS=skip`: every other assertion here still runs (VD-175).
const PIXELS = process.env.VUI_PIXELS !== 'skip'
const NO_PIXELS = 'VUI_PIXELS=skip: the baselines come from another host'

async function open(page: Page, name: string, scheme: Scheme, width: number) {
  const scene = SCENES.find((item) => item.name === name)
  if (!scene) throw new Error(name)
  const { name: _, open: unfold, ...visual } = scene
  const opened = await openVisual(page, visual, scheme, width)
  await settled(opened)
  if (unfold) {
    await opened.frame.evaluate(() => {
      const closed = '.vui-fold-toggle[aria-expanded="false"]'
      for (let next = document.querySelector<HTMLElement>(closed); next !== null; ) {
        next.click()
        next = document.querySelector<HTMLElement>(closed)
      }
    })
    await settled(opened)
  }
  return opened
}

for (const { name } of SCENES) {
  for (const width of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`${name} at ${width} px, ${scheme}`, async ({ page }) => {
        const { iframe, frame } = await open(page, name, scheme, width)
        if (PIXELS) await expect(iframe).toHaveScreenshot(`${name}-${width}-${scheme}.png`)
        const overflow = await frame.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        expect(await axeSerious(frame)).toEqual([])
      })
    }
  }
}

test('axe sees a serious violation in a visual frame', async ({ page }) => {
  // An unlabeled button and #bbb text on white (1.9:1), in the same sandboxed, CSP-bound frame.
  const html = `<body><div class="vui-doc"><button></button>
<p style="color:#bbb;background:#fff">Faint text</p></div></body>`
  const { frame } = await openVisual(page, { input: null, html }, 'light', 720)
  const found = await axeSerious(frame)
  expect(found.map((line) => line.split(':')[0])).toEqual(
    expect.arrayContaining(['button-name', 'color-contrast']),
  )
})

const CORE_TYPES = COMPONENT_TYPES.filter((type) => type !== 'compare' && type !== 'flow')
const CORE_KINDS = ['bar', 'hbar', 'stacked', 'line', 'area', 'donut', 'spark']

/** Every `type` and chart `kind` in a scene input, however deep the nodes nest. */
function collect(value: unknown, types: Set<string>, kinds: Set<string>) {
  if (Array.isArray(value)) for (const item of value) collect(item, types, kinds)
  else if (typeof value === 'object' && value !== null) {
    const node = value as Record<string, unknown>
    if (typeof node.type === 'string') types.add(node.type)
    if (node.type === 'chart' && typeof node.kind === 'string') kinds.add(node.kind)
    for (const child of Object.values(node)) collect(child, types, kinds)
  }
}

test('every core component and kind has a scene', () => {
  const types = new Set<string>()
  const kinds = new Set<string>()
  for (const scene of SCENES) collect(scene.input, types, kinds)
  expect(CORE_TYPES.filter((type) => !types.has(type))).toEqual([])
  expect(CORE_KINDS.filter((kind) => !kinds.has(kind))).toEqual([])
  const names = SCENES.map((scene) => scene.name)
  for (const name of ['example-19-1', 'example-19-2', 'example-19-3']) expect(names).toContain(name)
})

// A control compares against a baseline, so an update run must never let one write it.
const updating = (mode: string) => mode === 'all' || mode === 'changed'

test('a live theme switch lands on the other scheme, pixel for pixel', async ({ page }, info) => {
  test.skip(updating(info.config.updateSnapshots))
  test.skip(!PIXELS, NO_PIXELS)
  const opened = await open(page, 'tones', 'light', 720)
  await opened.switchTheme('dark')
  await expect(opened.iframe).toHaveScreenshot('tones-720-dark.png')
})

test.describe('the pixel gate can fail', () => {
  test.skip(!PIXELS, NO_PIXELS)
  /** Paints `share` of the frame over the content, in a color no baseline has. */
  async function paint(page: Page, share: number) {
    const opened = await open(page, 'tones', 'light', 720)
    const box = await opened.iframe.boundingBox()
    const side = Math.round(Math.sqrt((box?.width ?? 0) * (box?.height ?? 0) * share))
    await page.evaluate(
      ([size]) => {
        const patch = document.createElement('div')
        patch.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;background:#f0f`
        document.body.append(patch)
      },
      [side],
    )
    return opened
  }

  test('a 1% change fails', async ({ page }, info) => {
    test.skip(updating(info.config.updateSnapshots))
    const { iframe } = await paint(page, 0.01)
    const passed = await expect(iframe)
      .toHaveScreenshot('tones-720-light.png', { timeout: 500 })
      .then(
        () => true,
        () => false,
      )
    expect(passed).toBe(false)
  })

  test('a 0.05% change passes', async ({ page }, info) => {
    test.skip(updating(info.config.updateSnapshots))
    const { iframe } = await paint(page, 0.0005)
    await expect(iframe).toHaveScreenshot('tones-720-light.png')
  })
})
