import { expect, type Page, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'

const open = async (page: Page, input: unknown, width = 720) => {
  const opened = await openVisual(page, { input, diagnostics: 'hidden' }, 'light', width)
  await settled(opened)
  return opened
}

const wide = (rows: number, columns = 8) => ({
  type: 'table',
  title: 'Wide',
  columns: Array.from({ length: columns }, (_, index) => ({
    key: `c${index}`,
    label: `Column number ${index}`,
    wrap: false,
  })),
  rows: Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, index) => `row ${row} cell ${index} with some text`),
  ),
})

test.describe('wide tables', () => {
  test('scroll in their own box and leave the page alone', async ({ page }) => {
    const { frame } = await open(page, [wide(3)], 360)
    const sizes = await frame.evaluate(() => {
      const box = document.querySelector('.vui-table-box') as HTMLElement
      return {
        inner: box.scrollWidth > box.clientWidth,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(sizes.inner).toBe(true)
    expect(sizes.page).toBeLessThanOrEqual(0)
  })

  test('keep the first column in place over 4 columns', async ({ page }) => {
    const { frame } = await open(page, [wide(3)], 360)
    const moved = await frame.evaluate(() => {
      const box = document.querySelector('.vui-table-box') as HTMLElement
      const pinned = document.querySelector('tbody th') as HTMLElement
      const other = document.querySelector('tbody td') as HTMLElement
      const before = [pinned.getBoundingClientRect().left, other.getBoundingClientRect().left]
      box.scrollLeft = 200
      const after = [pinned.getBoundingClientRect().left, other.getBoundingClientRect().left]
      return [
        (after[0] as number) - (before[0] as number),
        (after[1] as number) - (before[1] as number),
      ]
    })
    expect(moved[0]).toBe(0)
    expect(moved[1]).toBeLessThan(-100)
  })

  test('let the first column go at 4 columns', async ({ page }) => {
    const { frame } = await open(page, [wide(3, 4)], 360)
    const moved = await frame.evaluate(() => {
      const box = document.querySelector('.vui-table-box') as HTMLElement
      const first = document.querySelector('tbody th') as HTMLElement
      const before = first.getBoundingClientRect().left
      box.scrollLeft = 100
      return first.getBoundingClientRect().left - before
    })
    expect(moved).toBeLessThan(0)
  })

  test('do not crush columns to fit', async ({ page }) => {
    const input = [
      {
        type: 'table',
        columns: ['A', 'B'],
        rows: [['word', 'x'.repeat(200)]],
      },
    ]
    const { frame } = await open(page, input, 360)
    const height = await frame.evaluate(
      () => (document.querySelector('tbody td') as HTMLElement).getBoundingClientRect().height,
    )
    expect(height).toBeLessThan(40)
  })
})

test.describe('sticky tables', () => {
  test('cap at 600 px and keep the header in view', async ({ page }) => {
    const { frame } = await open(page, [{ ...wide(40), pageSize: 40 }], 720)
    const result = await frame.evaluate(() => {
      const box = document.querySelector('.vui-table-box') as HTMLElement
      const head = document.querySelector('thead th') as HTMLElement
      const top = box.getBoundingClientRect().top
      box.scrollTop = 300
      return {
        height: box.getBoundingClientRect().height,
        offset: head.getBoundingClientRect().top - top,
      }
    })
    expect(result.height).toBeLessThanOrEqual(602)
    expect(Math.abs(result.offset)).toBeLessThanOrEqual(2)
  })
})

test.describe('table controls', () => {
  const rows = Array.from({ length: 6 }, (_, index) => [index])

  test('sort by keyboard, in tab order', async ({ page }) => {
    const { frame } = await open(page, [{ type: 'table', columns: ['N'], rows }])
    await frame.locator('thead th button').first().focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(frame.locator('thead th').first()).toHaveAttribute('aria-sort', 'descending')
    await expect(frame.locator('tbody tr').first()).toContainText('5')
    await expect(frame.locator('thead th button').first()).toBeFocused()
  })

  test('hand focus to the first new row when the last page lands', async ({ page }) => {
    const { frame } = await open(page, [{ type: 'table', columns: ['N'], rows, pageSize: 4 }])
    await frame.getByRole('button', { name: 'Show 2 more' }).focus()
    await page.keyboard.press('Enter')
    await expect(frame.locator('tbody tr').nth(4)).toBeFocused()
  })

  test('report the new height to the shell', async ({ page }) => {
    const { frame, iframe } = await open(page, [
      { type: 'table', columns: ['N'], rows, pageSize: 2 },
    ])
    const before = (await iframe.boundingBox())?.height ?? 0
    await frame.getByRole('button', { name: /Show/ }).click()
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).toBeGreaterThan(before)
  })
})

test.describe('fills', () => {
  test('a bar is as wide as its share', async ({ page }) => {
    const input = [{ type: 'progress', value: 25 }]
    const { frame } = await open(page, input)
    const share = await frame.evaluate(() => {
      const fill = document.querySelector('.vui-fill') as HTMLElement
      const track = document.querySelector('.vui-track') as HTMLElement
      return fill.getBoundingClientRect().width / track.getBoundingClientRect().width
    })
    expect(share).toBeCloseTo(0.25, 2)
  })

  test('a spark column is as high as its share', async ({ page }) => {
    const input = [{ type: 'stats', items: [{ label: 'L', value: 1, spark: [0, 25, 100] }] }]
    const { frame } = await open(page, input)
    const heights = await frame.evaluate(() =>
      [...document.querySelectorAll('.vui-spark-col')].map(
        (col) => col.getBoundingClientRect().height,
      ),
    )
    expect((heights[1] as number) / (heights[2] as number)).toBeCloseTo(0.25, 1)
    expect(heights[0]).toBeGreaterThan(0)
  })

  test('no element in a data document has a style attribute', async ({ page }) => {
    const input = [
      { type: 'table', columns: [{ key: 'a', label: 'A', cell: 'bar' }], rows: [[1], [2]] },
      { type: 'progress', value: 1 },
    ]
    const { frame } = await open(page, input)
    expect(await frame.evaluate(() => document.querySelectorAll('.vui-root [style]').length)).toBe(
      0,
    )
  })
})

test.describe('§9.5 budgets', () => {
  const document = {
    vui: 1,
    body: [
      {
        type: 'table',
        columns: ['Name', 'Calls:int', 'p95:ms', 'Hit:pct', 'Status:status', 'Size:bytes'],
        rows: Array.from({ length: 1000 }, (_, index) => [
          `row-${index}`,
          index * 3,
          index % 400,
          (index % 100) / 100,
          index % 2 === 0 ? 'ok' : 'fail',
          index * 1024,
        ]),
        sort: [2, 'desc'],
      },
    ],
  }

  test('a 1,000-row, 6-column table renders its first page in 30 ms', async ({ page }) => {
    const { frame } = await open(page, ['start'])
    const median = await frame.evaluate((input) => {
      const { __vuiHandle: handle } = window as unknown as {
        __vuiHandle: { update(document: unknown): void }
      }
      const times = Array.from({ length: 7 }, () => {
        const start = performance.now()
        handle.update(input)
        return performance.now() - start
      })
      return times.sort((a, b) => a - b)[3] as number
    }, document)
    await expect(frame.locator('tbody tr')).toHaveCount(25)
    await expect(frame.locator('tbody tr').first()).toContainText('399')
    expect(median).toBeLessThanOrEqual(30)
    console.log(`1,000 × 6 first page: ${median.toFixed(1)} ms (median of 7)`)
  })
})

test.describe('kv', () => {
  test('collapses to one column under 480 px', async ({ page }) => {
    const input = [{ type: 'kv', cols: 3, pairs: { a: 1, b: 2, c: 3 } }]
    const tracks = (frame: Awaited<ReturnType<typeof open>>['frame']) =>
      frame.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('.vui-kv') as HTMLElement,
          ).gridTemplateColumns.split(' ').length,
      )
    expect(await tracks((await open(page, input, 479)).frame)).toBe(1)
    expect(await tracks((await open(page, input, 480)).frame)).toBe(3)
  })
})

test("a code cell copies through Orca's sandbox chain", async ({ page }) => {
  const input = [
    { type: 'table', columns: [{ key: 'a', label: 'A', cell: 'code' }], rows: [['abc']] },
  ]
  const { frame } = await open(page, input)
  const button = frame.locator('.vui-cell-copy')
  await button.click()
  await expect(button).toHaveAttribute('aria-label', /Copied|Select text to copy/)
})
