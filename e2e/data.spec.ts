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

  test('hold in their own box what a hidden word would push out', async ({ page }) => {
    const table = {
      type: 'table',
      columns: Array.from({ length: 7 }, (_, index) => ({
        key: `c${index}`,
        label: `Col ${index}`,
        wrap: false,
      })).concat({
        key: 'risk',
        label: 'Risk',
        cell: 'badge',
        tones: { high: 'err' },
      } as never),
      rows: Array.from({ length: 25 }, (_, _row) => [
        ...Array.from({ length: 7 }, () => 'some cell text in a row'),
        'high',
        { tone: 'err' },
      ]),
      pageSize: 25,
    }
    const { frame } = await open(page, [table], 360)
    const overflow = await frame.evaluate(() => [
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.documentElement.scrollHeight -
        (document.querySelector('.vui-root') as HTMLElement).getBoundingClientRect().height,
    ])
    expect(overflow[0]).toBeLessThanOrEqual(0)
    expect(overflow[1]).toBeLessThanOrEqual(40)
  })

  for (const column of [{ cell: 'code' }, { format: 'path' }, {}]) {
    test(`leave room beside a long pinned ${JSON.stringify(column)} column`, async ({ page }) => {
      const long = `packages/ui-render/src/components/${'nested/'.repeat(4)}file.ts`
      const table = {
        type: 'table',
        columns: [
          { key: 'a', label: 'A long pinned heading over a long pinned column', ...column },
          'B',
          'C',
          'D',
          'E',
        ],
        rows: [[long, 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee']],
      }
      const { frame } = await open(page, [table], 320)
      const sizes = await frame.evaluate(() => {
        const box = document.querySelector('.vui-table-box') as HTMLElement
        box.scrollLeft = 10_000
        const pinned = (document.querySelector('tbody th') as HTMLElement).getBoundingClientRect()
        const cells = document.querySelectorAll('tbody td')
        const last = (cells[cells.length - 1] as HTMLElement).getBoundingClientRect()
        return { pinned: pinned.width, beside: last.right - Math.max(last.left, pinned.right) }
      })
      expect(sizes.pinned).toBeLessThanOrEqual(160)
      expect(sizes.pinned).toBeGreaterThanOrEqual(70)
      expect(sizes.beside).toBeGreaterThanOrEqual(50)
    })
  }

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

  test('a spark line fills its tile and its height', async ({ page }) => {
    const input = [{ type: 'stats', items: [{ label: 'L', value: 1, spark: [0, 25, 100] }] }]
    const { frame } = await open(page, input)
    const sizes = await frame.evaluate(() => {
      const line = document.querySelector('.vui-spark path') as SVGGraphicsElement
      const box = line.getBoundingClientRect()
      return { line: box.width, height: box.height, room: line.closest('dd')?.clientWidth ?? 0 }
    })
    expect(sizes.line).toBeCloseTo(sizes.room, -1)
    expect(sizes.height).toBeGreaterThan(10)
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

test.describe('narrow frames (B6)', () => {
  /** Lines per cell, and text pieces between break points that a line split anyway. */
  const measure = (frame: Awaited<ReturnType<typeof open>>['frame']) =>
    frame.evaluate(() => {
      const lineCount = (node: Node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        // Inline code sits a pixel or two off the text, so a new line is a jump of a line.
        const tops = [...range.getClientRects()].map((rect) => rect.top).sort((a, b) => a - b)
        return tops.filter((top, index) => index === 0 || top - (tops[index - 1] as number) > 8)
          .length
      }
      return [...document.querySelectorAll('tbody tr > *')].map((cell) => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
        let split = 0
        while (walker.nextNode()) {
          const node = walker.currentNode as Text
          if (node.data !== '' && !/\s/.test(node.data) && lineCount(node) > 1) split += 1
        }
        return { lines: lineCount(cell), split }
      })
    })

  test('keep short values and paths on one line; the table scrolls', async ({ page }) => {
    const { frame } = await open(
      page,
      [
        {
          type: 'table',
          columns: ['Name', 'File:path', 'Cmd:code', 'Updated:date', 'Hits:int'],
          rows: [
            ['a', 'packages/ui-render/src/table_view.ts', 'pnpm vitest run', '2026-11-20', 18420],
          ],
        },
      ],
      400,
    )
    const cells = await measure(frame)
    expect(cells.map(({ lines }) => lines)).toEqual([1, 1, 1, 1, 1])
  })

  test('break a pinned first column only after / . _ -, never inside a word', async ({ page }) => {
    const { frame } = await open(
      page,
      [
        {
          type: 'table',
          columns: ['Route', 'Method', 'Hits:int', 'p95:ms', 'Errors:pct', 'Updated:date'],
          rows: [
            ['/admin/studio/{c}/create', 'POST', 2204, 410, 0.031, '2026-11-18T09:00:00Z'],
            ['packages/ui-render/src/components/table_view.ts', 'GET', 1, 2, 0, '2026-11-18'],
          ],
        },
        {
          type: 'table',
          columns: [{ key: 'p', label: 'Path', format: 'path', wrap: true }, 'Note'],
          rows: [['packages/ui-render/src/components/table_view.ts', 'x']],
        },
      ],
      400,
    )
    const cells = await measure(frame)
    expect(cells[6]?.lines).toBeGreaterThan(1)
    for (const cell of cells) expect(cell.split).toBe(0)
    // Dates and numbers keep one line beside the pinned column.
    expect(cells.slice(2, 6).map(({ lines }) => lines)).toEqual([1, 1, 1, 1])
  })
})
