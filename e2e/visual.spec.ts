import { expect, type Page, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'
import { SCENES, WIDTHS } from './harness/scenes.js'
import type { Scheme } from './harness/theme.js'

const SCHEMES: Scheme[] = ['light', 'dark']

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
        await expect(iframe).toHaveScreenshot(`${name}-${width}-${scheme}.png`)
        const overflow = await frame.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }
  }
}

// A control compares against a baseline, so an update run must never let one write it.
const updating = (mode: string) => mode === 'all' || mode === 'changed'

test('a live theme switch lands on the other scheme, pixel for pixel', async ({ page }, info) => {
  test.skip(updating(info.config.updateSnapshots))
  const opened = await open(page, 'tones', 'light', 720)
  await opened.switchTheme('dark')
  await expect(opened.iframe).toHaveScreenshot('tones-720-dark.png')
})

test.describe('the pixel gate can fail', () => {
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
