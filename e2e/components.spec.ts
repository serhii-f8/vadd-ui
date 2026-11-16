import { expect, type Frame, type Page, test } from '@playwright/test'
import { stylesheet } from '../packages/ui-render/src/css/index.js'
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
  const text = 'line 1\n\n  line 3\n\n\nline 6\n'

  /** Clicks copy, and reports what the frame's `copy` event left on the clipboard. */
  async function copied(page: Page, input: unknown) {
    const { frame } = await open(page, input)
    await frame.evaluate(() => {
      window.addEventListener('copy', (event) => {
        const { clipboardData } = event as ClipboardEvent
        ;(window as unknown as { copied: string }).copied =
          clipboardData?.getData('text/plain') ?? ''
      })
    })
    const button = frame.locator('.vui-code-copy')
    await button.click()
    await expect(button).toHaveText('Copied')
    return frame.evaluate(() => (window as unknown as { copied: string }).copied)
  }

  test('copies the exact text from a lined block, blank lines and all', async ({ page }) => {
    expect(await copied(page, [{ type: 'code', lines: true, text }])).toBe(text)
  })

  test('copies the exact text across a closed fold', async ({ page }) => {
    expect(await copied(page, [{ type: 'code', maxLines: 2, text }])).toBe(text)
  })

  test('leaves every line selected, with the toggle out of it', async ({ page }) => {
    const input = [{ type: 'code', lines: true, maxLines: 2, text: 'a\nb\nc\nd' }]
    const { frame } = await open(page, input)
    const button = frame.locator('.vui-code-copy')
    await button.click()
    await expect(button).toHaveText('Copied')
    const selected = await frame.evaluate(() => document.getSelection()?.toString() ?? '')
    expect(selected.replace(/\s+/g, ' ').trim()).toBe('a b c d')
  })

  test('a reader selecting a lined block keeps its blank lines', async ({ page }) => {
    const { frame } = await open(page, [{ type: 'code', lines: true, text: 'a\n\nb' }])
    const selected = await frame.evaluate(() => {
      const selection = document.getSelection() as Selection
      selection.selectAllChildren(document.querySelector('.vui-code-body') as HTMLElement)
      return selection.toString()
    })
    expect(selected.trim().split('\n').length).toBeGreaterThanOrEqual(3)
  })
})

test.describe('a target that sizes to its content', () => {
  const GRID =
    '<div class="vui-grid-box"><div class="vui-grid" data-vui-cols="2"><div>a</div><div>b</div></div></div>'

  const contexts: [string, string, string][] = [
    ['inline-block', '', 'display:inline-block'],
    ['float', '', 'float:left'],
    ['flex item', 'display:flex;align-items:flex-start', ''],
    ['absolute', 'position:relative;height:200px', 'position:absolute'],
  ]

  async function gridWidth(page: Page, outer: string, target: string) {
    await page.setContent(
      `<!doctype html><html><head><style>${stylesheet}</style></head><body style="margin:0"><div style="width:800px;${outer}"><div class="vui-root" style="${target}">${GRID}</div></div></body></html>`,
    )
    return page.evaluate(
      () => (document.querySelector('.vui-grid') as HTMLElement).getBoundingClientRect().width,
    )
  }

  for (const [name, outer, target] of contexts) {
    test(`keeps the width it has: ${name}`, async ({ page }) => {
      expect(await gridWidth(page, outer, target)).toBe(800)
    })
  }

  test('a margin on the target still fits', async ({ page }) => {
    expect(await gridWidth(page, '', 'margin:0 20px')).toBe(760)
  })

  test('padding on the target still fits', async ({ page }) => {
    expect(await gridWidth(page, '', 'padding:0 20px')).toBe(760)
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

test.describe('design polish (VD-190)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`every status renders one pill shape, run and wait included (${scheme})`, async ({
      page,
    }) => {
      const input = [':ok: a :fail: b :warn: c :info: d :run: e :wait: f :skip: g :none: h']
      const { frame } = await openVisual(page, { input, diagnostics: 'hidden' }, scheme, 720)
      const pills = await frame.evaluate(() => {
        const surface = getComputedStyle(document.querySelector('.vui-root') as Element)
          .getPropertyValue('--vui-surface')
          .trim()
        const probe = document.createElement('i')
        probe.style.color = surface
        document.body.append(probe)
        const plain = getComputedStyle(probe).color
        return [...document.querySelectorAll('.vui-status')].map((pill) => {
          const style = getComputedStyle(pill)
          return {
            name: pill.textContent,
            radius: style.borderTopLeftRadius,
            tinted: style.backgroundColor !== plain && style.backgroundColor !== 'rgba(0, 0, 0, 0)',
          }
        })
      })
      expect(pills).toHaveLength(8)
      for (const pill of pills) expect(pill, pill.name ?? '').toMatchObject({ tinted: true })
      expect(new Set(pills.map((pill) => pill.radius)).size).toBe(1)
    })
  }

  test('a card or stats tile inside a card drops its own frame, and a tone shows once', async ({
    page,
  }) => {
    const input = [
      {
        type: 'card',
        title: 'Outer',
        tone: 'ok',
        children: [
          { type: 'card', title: 'Inner', children: ['x'] },
          { type: 'card', title: 'Toned', tone: 'warn', children: ['y'] },
          {
            type: 'stats',
            items: [
              ['Plain', 1],
              ['Toned', 2, 'num', null, null, 'err'],
            ],
          },
        ],
      },
      { type: 'stats', items: [['Alone', 3]] },
    ]
    const { frame } = await openVisual(page, { input, diagnostics: 'hidden' }, 'light', 720)
    const frames = await frame.evaluate(() =>
      [
        '[data-vui-type=card] [data-vui-type=card]:not(.vui-toned)',
        '[data-vui-type=card] [data-vui-type=card].vui-toned',
        '[data-vui-type=card] .vui-stat:not(.vui-toned)',
        '[data-vui-type=card] .vui-stat.vui-toned',
        '.vui-stat',
      ].map((selector) => {
        // The last match: for `.vui-stat`, the tile that sits in no card.
        const style = getComputedStyle([...document.querySelectorAll(selector)].pop() as Element)
        return [style.borderTopWidth, style.borderLeftWidth, style.backgroundColor]
      }),
    )
    const clear = 'rgba(0, 0, 0, 0)'
    expect(frames[0]).toEqual(['0px', '0px', clear])
    expect(frames[1]).toEqual(['0px', '3px', clear])
    expect(frames[2]).toEqual(['0px', '0px', clear])
    expect(frames[3]).toEqual(['0px', '3px', clear])
    expect(frames[4]?.[0]).toBe('1px')
    expect(frames[4]?.[2]).not.toBe(clear)
  })

  test('a decision option with nothing in it is no taller than it needs', async ({ page }) => {
    const input = [
      {
        type: 'decision',
        question: 'Which?',
        options: [
          { label: 'Full', pros: ['a', 'b', 'c'], cons: ['d'], effort: 'S' },
          { label: 'Bare' },
        ],
      },
    ]
    const { frame } = await openVisual(page, { input, diagnostics: 'hidden' }, 'light', 1100)
    const [full, bare] = await frame.evaluate(() =>
      [...document.querySelectorAll('.vui-options > li')].map(
        (item) => item.getBoundingClientRect().height,
      ),
    )
    expect(bare).toBeLessThan((full as number) / 2)
  })
})
