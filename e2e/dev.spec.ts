import { expect, type Frame, type Page, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'

const open = async (page: Page, input: unknown, width = 720) => {
  const opened = await openVisual(page, { input, diagnostics: 'hidden' }, 'light', width)
  await settled(opened)
  return opened
}

const options = [
  { label: 'One', pros: ['a'] },
  { label: 'Two', pros: ['b'] },
]
const decision = { type: 'decision', question: 'Which?', pick: 1, options }

/** Top edges of the option cards. Equal means side by side. */
const tops = (frame: Frame) =>
  frame.evaluate(() =>
    [...document.querySelectorAll('.vui-options > li')].map((card) =>
      Math.round(card.getBoundingClientRect().top),
    ),
  )

test.describe('decision', () => {
  test('stacks at 599 px of its own width and sits side by side at 600', async ({ page }) => {
    const [first = 0, second = 0] = await tops((await open(page, [decision], 599)).frame)
    expect(second).toBeGreaterThan(first)
    const wide = await tops((await open(page, [decision], 600)).frame)
    expect(wide[0]).toBe(wide[1])
  })

  test('follows its box, not the page, inside a grid cell', async ({ page }) => {
    const cell = { type: 'grid', children: [decision, { type: 'md', text: 'x' }] }
    const [first = 0, second = 0] = await tops((await open(page, [cell], 900)).frame)
    expect(second).toBeGreaterThan(first)
  })

  test('offers nothing to focus (D8)', async ({ page }) => {
    const { frame } = await open(page, [decision])
    const focusable = await frame.evaluate(
      () => document.querySelectorAll('a,button,input,select,textarea,[tabindex]').length,
    )
    expect(focusable).toBe(0)
  })
})

test.describe('folds', () => {
  test('open by keyboard, in DOM order', async ({ page }) => {
    const output = Array.from({ length: 22 }, (_, index) => `line ${index}`).join('\n')
    const { frame } = await open(page, [
      { type: 'checks', items: [{ name: 'a', status: 'ok', output }] },
    ])
    const toggle = frame.locator('button', { hasText: 'Output' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(frame.locator('button', { hasText: '2 earlier lines' })).toBeVisible()
    await expect(frame.locator('pre').last()).toContainText('line 21')
  })

  test('a hunk paints its lines only when opened', async ({ page }) => {
    const { frame } = await open(page, [
      { type: 'diff', files: [['a.ts', 1, 1, 'M']], hunks: { 'a.ts': '@@ x\n-old\n+new' } },
    ])
    await expect(frame.locator('pre')).toHaveCount(0)
    await frame.locator('button').click()
    await expect(frame.locator('pre')).toBeVisible()
  })
})

test('a status stays its own size when nothing follows it', async ({ page }) => {
  const { frame } = await open(page, [{ type: 'checks', items: [{ name: 'a', status: 'skip' }] }])
  const box = await frame.locator('.vui-status').boundingBox()
  expect(box?.width).toBeLessThan(100)
})

test('a log at the string cap stays cheap', async ({ page }) => {
  const text = 'INFO x\nplain\n'.repeat(1_500)
  const { frame } = await open(page, [{ type: 'log', text }])
  const count = await frame.evaluate(() => document.querySelectorAll('.vui-root *').length)
  // Two thousand-odd spans at most for 3,000 lines.
  expect(count).toBeLessThan(2_000)
})

/** WCAG contrast of each toned line in `selector`, painted over its real background. */
const contrasts = (frame: Frame, selector: string) =>
  frame.evaluate((chosen) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const paint = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    const pixel = (colors: string[]) => {
      for (const color of colors) {
        paint.fillStyle = color
        paint.fillRect(0, 0, 1, 1)
      }
      return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (channels: number[]) => {
      const [r = 0, g = 0, b = 0] = channels.map((channel) => {
        const value = channel / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const surface = getComputedStyle(document.querySelector('.vui-codeblock') as Element)
    return [...document.querySelectorAll(chosen)].map((line) => {
      const style = getComputedStyle(line)
      const back = pixel(['#000', surface.backgroundColor, style.backgroundColor])
      const fore = pixel(['#000', surface.backgroundColor, style.backgroundColor, style.color])
      const [high, low] = [luminance(back), luminance(fore)].sort((a, b) => b - a)
      return ((high as number) + 0.05) / ((low as number) + 0.05)
    })
  }, selector)

for (const scheme of ['light', 'dark'] as const) {
  test(`tinted lines meet 4.5:1 in ${scheme}`, async ({ page }) => {
    const input = [
      { type: 'log', text: 'ERROR a\nWARN b\nINFO c\nDEBUG d' },
      { type: 'diff', files: [['a', 1, 1]], hunks: { a: '@@ x\n-old\n+new' } },
    ]
    const opened = await openVisual(page, { input, diagnostics: 'hidden' }, scheme, 720)
    await settled(opened)
    await opened.frame.locator('.vui-diff button').click()
    const values = await contrasts(opened.frame, 'pre [class*="vui-tone-"]')
    expect(values).toHaveLength(7)
    for (const value of values) expect(value).toBeGreaterThanOrEqual(4.5)
  })
}

test.describe('§9.5 budgets', () => {
  const times = (frame: Frame, input: unknown) =>
    frame.evaluate((document) => {
      const { __vuiHandle: handle } = window as unknown as {
        __vuiHandle: { update(value: unknown): void }
      }
      const runs = Array.from({ length: 7 }, () => {
        const start = performance.now()
        handle.update(document)
        return performance.now() - start
      })
      runs.sort((a, b) => a - b)
      return [runs[0] as number, runs[3] as number]
    }, input)

  const items = Array.from({ length: 8 }, (_, index) => ({ name: `Check ${index}`, status: 'ok' }))
  const steps = Array.from({ length: 8 }, (_, index) => ({ text: `Step ${index}`, status: 'ok' }))
  const logText = Array.from({ length: 60 }, (_, index) => `INFO line ${index}`).join('\n')
  const seven = [
    { type: 'checks', items: items.map((item) => ({ ...item, output: 'a\nb\nc' })) },
    { type: 'plan', items: steps },
    { type: 'diff', files: items.map(({ name }) => [`src/${name}.ts`, 3, 4, 'M']) },
    { type: 'tree', paths: items.map(({ name }) => `src/a/${name}.ts`) },
    { type: 'timeline', items: steps.map(({ text }) => ({ at: 'Soon', text })) },
    decision,
    { type: 'log', text: logText },
  ]

  test('20 dev nodes render in 15 ms', async ({ page }) => {
    const { frame } = await open(page, ['start'])
    const body = Array.from({ length: 20 }, (_, index) => seven[index % 7])
    const [fastest = 0, median = 0] = await times(frame, { vui: 1, body })
    await expect(frame.locator('[data-vui-type]')).toHaveCount(20)
    console.log(`20 dev nodes: fastest ${fastest.toFixed(1)} ms, median ${median.toFixed(1)} ms`)
    expect(fastest).toBeLessThanOrEqual(15)
  })

  test('a document at the input cap neither fails nor stalls', async ({ page }) => {
    const { frame } = await open(page, ['start'])
    const paths = Array.from({ length: 6_000 }, (_, index) => `a/b/c/file-${index}.ts`)
    const hunk = '+\n-\n'.repeat(500)
    const hunks = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${index}`, hunk]))
    const body = [
      { type: 'tree', paths: paths.slice(0, 3_000) },
      { type: 'plan', items: paths.slice(0, 1_500).map((text) => ({ text, status: 'ok' })) },
      { type: 'diff', files: [], hunks },
      { type: 'log', text: 'x\n'.repeat(10_000) },
    ]
    const [fastest = 0] = await times(frame, { vui: 1, body })
    console.log(`at the cap: fastest ${fastest.toFixed(1)} ms`)
    await expect(frame.locator('.vui-card-error')).toHaveCount(0)
    await expect(frame.locator('.vui-tree li')).toHaveCount(3_003)
    await expect(frame.locator('[data-vui-type="plan"] li')).toHaveCount(1_500)
    expect(fastest).toBeLessThanOrEqual(1_000)
  })
})
