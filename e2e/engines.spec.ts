import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { formatValue } from '../packages/ui-spec/src/index.js'
import { SCENES } from './harness/scenes.js'

// §17.4 smoke for every engine: the real CLI's standalone file (§4.3), opened by `file://`.
// `pnpm gate` runs it in Chromium; CI's `engines` job adds Firefox and WebKit (VD-176).

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'vui-engines-'))

const MONEY = 1234.5
const money = {
  title: 'Engine smoke',
  locale: 'pl-PL',
  body: [
    { type: 'kv', pairs: [['Koszt', MONEY, 'money:PLN']] },
    { type: 'md', title: 'Folded', fold: 'closed', text: 'Revealed text.' },
  ],
}

/** Writes the CLI's inline file for `document` and opens it. */
async function open(page: Page, name: string, document: unknown): Promise<string[]> {
  const out = join(dir, `${name}.html`)
  const { status, stderr } = spawnSync(
    process.execPath,
    [BIN, 'render', '--format', 'html', '--out', out],
    { input: JSON.stringify(document), encoding: 'utf8' },
  )
  expect(status, stderr).toBe(0)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(pathToFileURL(out).href)
  await expect(page.locator('.vui-node').first()).toBeVisible()
  return errors
}

const examples = SCENES.filter(({ name }) => /^example-19-[123]$/.test(name))

test('the three §19 examples are scenes', () => {
  expect(examples.map(({ name }) => name)).toEqual(['example-19-1', 'example-19-2', 'example-19-3'])
})

for (const { name, input } of examples) {
  test(`${name} renders with no error`, async ({ page }) => {
    const errors = await open(page, name, input)
    expect(await page.locator('.vui-card-error').count()).toBe(0)
    expect(errors).toEqual([])
  })
}

test('§17.4 required features are present', async ({ page }) => {
  await open(page, 'features', money)
  const features = await page.evaluate(() => ({
    colorMix: CSS.supports('color', 'color-mix(in srgb, red 50%, blue)'),
    customProperties: CSS.supports('--x', '0'),
    resizeObserver: typeof ResizeObserver === 'function',
    relativeTime: typeof Intl.RelativeTimeFormat === 'function',
  }))
  expect(features).toEqual({
    colorMix: true,
    customProperties: true,
    resizeObserver: true,
    relativeTime: true,
  })
})

test('pl-PL money reads as the CLI formats it (VD-043)', async ({ page }) => {
  await open(page, 'money', money)
  const expected = formatValue(MONEY, 'money:PLN', { locale: 'pl-PL' }).text
  expect(expected).toBe('1 234,50 zł')
  await expect(page.getByText(expected)).toBeVisible()
})

test('a fold opens', async ({ page }) => {
  await open(page, 'fold', money)
  const toggle = page.locator('.vui-fold-toggle').first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Revealed text.')).toBeVisible()
})

test('the dark scheme follows prefers-color-scheme', async ({ page }) => {
  // The standalone page paints its canvas from the OS scheme (task 11; `bundle.spec.ts`).
  const canvas = () =>
    page.evaluate(() =>
      [document.documentElement, document.body]
        .map((node) => getComputedStyle(node).backgroundColor)
        .find((color) => color !== 'rgba(0, 0, 0, 0)'),
    )
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, 'scheme', money)
  expect(await canvas()).toBe('rgb(255, 255, 255)')
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await canvas()).toBe('rgb(10, 10, 10)')
})
