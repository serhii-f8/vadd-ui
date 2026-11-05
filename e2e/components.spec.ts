import { expect, type Frame, type Page, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'

const open = async (page: Page, input: unknown, width = 720) => {
  const opened = await openVisual(page, { input, diagnostics: 'hidden' }, 'light', width)
  await settled(opened)
  return opened
}

const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ type: 'card', title: `C${index}`, children: [] }))

/** The resolved column tracks of a `.vui-grid`, from the outside in. */
const tracks = (frame: Frame, index = 0) =>
  frame.evaluate((at) => {
    const grid = document.querySelectorAll('.vui-grid')[at] as HTMLElement
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length
  }, index)

test.describe('grid', () => {
  test('has one column at 479 px of width and all of them at 480', async ({ page }) => {
    const input = [{ type: 'grid', cols: 3, children: cards(3) }]
    const narrow = await open(page, input, 479)
    expect(await tracks(narrow.frame)).toBe(1)
    const wide = await open(page, input, 480)
    expect(await tracks(wide.frame)).toBe(3)
  })

  test('takes auto columns from the child count', async ({ page }) => {
    const { frame } = await open(page, [{ type: 'grid', children: cards(4) }], 720)
    expect(await tracks(frame)).toBe(2)
  })

  test('collapses a nested grid by its own width', async ({ page }) => {
    const inner = { type: 'grid', cols: 2, children: cards(2) }
    const input = [{ type: 'grid', cols: 2, children: [inner, ...cards(1)] }]
    const { frame } = await open(page, input, 720)
    expect(await tracks(frame, 0)).toBe(2)
    expect(await tracks(frame, 1)).toBe(1)
  })

  test('adds no track for a span past the end', async ({ page }) => {
    const input = [
      { type: 'grid', cols: 2, children: [{ type: 'card', span: 12, children: [] }, ...cards(1)] },
    ]
    const { frame } = await open(page, input, 720)
    expect(await tracks(frame)).toBe(2)
  })

  test('drops spans in one column', async ({ page }) => {
    const input = [
      { type: 'grid', cols: 3, children: [{ type: 'card', span: 3, children: [] }, ...cards(1)] },
    ]
    const { frame } = await open(page, input, 360)
    const widths = await frame.evaluate(() =>
      [...document.querySelectorAll('.vui-grid > *')].map(
        (child) => child.getBoundingClientRect().width,
      ),
    )
    expect(widths[0]).toBe(widths[1])
  })
})

const CONTROLS = [
  {
    type: 'tabs',
    tabs: [
      { label: 'One', children: [{ type: 'md', text: 'first' }] },
      { label: 'Two', children: [{ type: 'md', text: 'second '.repeat(400) }] },
    ],
  },
  { type: 'section', title: 'Fold', fold: 'closed', children: [{ type: 'md', text: 'x' }] },
  { type: 'code', text: 'a\nb\nc', maxLines: 1 },
]

const focused = (frame: Frame) =>
  frame.evaluate(() => {
    const element = document.activeElement as HTMLElement
    return element.getAttribute('role') === 'tab' || element.tagName === 'BUTTON'
      ? element.textContent
      : element.tagName
  })

test.describe('keyboard', () => {
  test('Tab visits every control in DOM order', async ({ page }) => {
    const { frame } = await open(page, CONTROLS)
    const expected = await frame.evaluate(() =>
      [...document.querySelectorAll('button')].map((button) => button.textContent),
    )
    expect(expected).toHaveLength(5)
    await frame.getByRole('tab', { name: 'One' }).focus()
    const seen = [await focused(frame)]
    for (const _ of expected.slice(1)) {
      await page.keyboard.press('Tab')
      seen.push(await focused(frame))
    }
    expect(seen).toEqual(expected)
  })

  test('Enter opens a tab, Space opens a fold, and arrows move between tabs', async ({ page }) => {
    const { frame } = await open(page, CONTROLS)
    const tab = frame.getByRole('tab', { name: 'Two' })
    await tab.focus()
    await page.keyboard.press('Enter')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(frame.getByRole('tab', { name: 'One' })).toBeFocused()
    await expect(frame.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
    const fold = frame.getByRole('button', { name: 'Fold' })
    await fold.focus()
    await page.keyboard.press('Space')
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
  })

  test('the frame height follows a tab switch', async ({ page }) => {
    const opened = await open(page, CONTROLS)
    const before = await opened.lastReport()
    await opened.frame.getByRole('tab', { name: 'Two' }).click()
    await expect.poll(opened.lastReport).toBeGreaterThan(before as number)
    await settled(opened)
    const height = await opened.frame.evaluate(() => document.documentElement.scrollHeight)
    expect(Math.abs(height - ((await opened.lastReport()) as number))).toBeLessThanOrEqual(1)
  })
})

test.describe('copy in the sandboxed frame', () => {
  const lines = Array.from({ length: 4 }, (_, index) => `line ${index + 1}`).join('\n')

  test('ends in Copied or asks, with all the text selected', async ({ page }) => {
    const input = [{ type: 'code', lines: true, maxLines: 2, text: lines }]
    const { frame } = await open(page, input)
    const button = frame.locator('.vui-code-copy')
    await button.click()
    await expect(button).not.toHaveText('Copy')
    const label = await button.textContent()
    expect(['Copied', 'Select text to copy']).toContain(label)
    const selected = await frame.evaluate(() => document.getSelection()?.toString() ?? '')
    expect(selected.replace(/\s+/g, ' ').trim()).toBe('line 1 line 2 line 3 line 4')
  })
})

test('nothing overflows sideways at 360 px', async ({ page }) => {
  const token = 'unbroken-'.repeat(40)
  const input = [
    { type: 'code', lines: true, mark: [1], text: token },
    { type: 'grid', cols: 6, children: cards(6) },
    { type: 'tabs', tabs: [{ label: token, children: [] }] },
    { type: 'divider', label: token },
    { type: 'callout', tone: 'err', text: token },
    { type: 'md', text: `- ${token}\n\n> ${token}` },
  ]
  const { frame } = await open(page, input, 360)
  const overflow = await frame.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
