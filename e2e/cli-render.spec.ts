import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import type { Scheme } from './harness/theme.js'

// What `vui render --format html` writes, from the real `bin`, opened as a user would open it.

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const ATTACK = '</script><script>window.pwned=1</script><!--<script>'
const TRAPS = ['$& $1 $`', 'a b c', '<\\/script>', '\\u2028', ATTACK]

const DOCUMENT = {
  title: `Report ${ATTACK} & "quoted"`,
  subtitle: 'on `main`',
  body: [
    { type: 'callout', tone: 'ok', text: 'All green' },
    { type: 'list', items: TRAPS },
    { type: 'stats', items: [{ label: 'Passed', value: 412, tone: 'ok' }] },
    { type: 'chart', kind: 'bar', x: ['a', 'b'], series: { n: [3, 1] } },
  ],
}

function render(flags: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'vui-e2e-'))
  const out = join(dir, 'visual.html')
  const input = join(dir, 'doc.vui.json')
  writeFileSync(input, JSON.stringify(DOCUMENT))
  execFileSync(process.execPath, [BIN, 'render', input, '--format', 'html', '--out', out, ...flags])
  return out
}

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

for (const colorScheme of ['light', 'dark'] as Scheme[]) {
  test(`a rendered file shows its document in ${colorScheme}, and runs nothing it holds`, async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.emulateMedia({ colorScheme })
    await page.goto(pathToFileURL(render()).href)

    const root = page.locator('.vui-root')
    await expect(root).toHaveCount(1)
    await expect(root.getByText('All green')).toBeVisible()
    await expect(root.locator('svg').first()).toBeVisible()
    await expect(root).toContainText('</script><script>window.pwned=1</script>')
    await expect(root).toContainText('$& $1 $`')

    expect(await page.title()).toBe(DOCUMENT.title)
    expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
    expect(await page.locator('script').count()).toBe(2)
    expect(errors).toEqual([])
  })
}

test('the embedded text a browser sees parses to the same strings', async ({ page }) => {
  await page.goto(pathToFileURL(render()).href)
  const text = await page.locator('script[type="application/vui+json"]').textContent()
  const parsed = JSON.parse(text ?? '') as typeof DOCUMENT
  expect(parsed.title).toBe(DOCUMENT.title)
  const list = parsed.body[1] as { items: unknown[] }
  expect(list.items).toEqual(TRAPS)
})

test('the file records what rendered it', async ({ page }) => {
  await page.goto(pathToFileURL(render()).href)
  const generator = page.locator('meta[name="generator"]')
  await expect(generator).toHaveAttribute('content', /^vadd-ui \d/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
