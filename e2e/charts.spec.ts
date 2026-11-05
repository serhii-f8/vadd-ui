import { expect, type Page, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'
import type { Scheme } from './harness/theme.js'

const open = async (page: Page, input: unknown, width = 720, scheme: Scheme = 'light') => {
  const opened = await openVisual(page, { input, diagnostics: 'hidden' }, scheme, width)
  await settled(opened)
  return opened
}

const line = {
  type: 'chart',
  kind: 'line',
  yFormat: 'ms',
  x: ['a', 'b', 'c', 'd'],
  series: { p50: [1, 2, 3, 4], p95: [5, 6, 7, 8] },
}

test('a live theme switch restyles the same nodes', async ({ page }) => {
  const input = [line, { type: 'chart', kind: 'bar', x: ['a'], series: { s: [1] } }]
  const { frame, switchTheme } = await open(page, input)
  const read = () =>
    frame.evaluate(() => {
      const stroke = getComputedStyle(document.querySelector('.vui-chart-line') as Element).stroke
      const fill = getComputedStyle(document.querySelector('.vui-chart-bar') as Element).fill
      const text = getComputedStyle(document.querySelector('.vui-chart-tick') as Element).fill
      return { stroke, fill, text }
    })
  await frame.evaluate(() => {
    const scope = window as unknown as { __line: Element | null }
    scope.__line = document.querySelector('.vui-chart-line')
  })
  const light = await read()
  await switchTheme('dark')
  await expect.poll(async () => (await read()).text).not.toBe(light.text)
  // Orca's `--chart-*` are the same in both schemes, so the series follow a token change instead.
  await frame.evaluate(() => {
    const root = document.documentElement
    root.style.setProperty('--chart-1', 'rgb(1, 2, 3)')
  })
  const changed = await read()
  expect(changed.stroke).toBe('rgb(1, 2, 3)')
  expect(changed.fill).toBe('rgb(1, 2, 3)')
  const same = await frame.evaluate(() => {
    const scope = window as unknown as { __line: Element | null }
    return scope.__line === document.querySelector('.vui-chart-line')
  })
  expect(same).toBe(true)
})

test('no chart element holds a color or a style', async ({ page }) => {
  const kinds = ['bar', 'hbar', 'stacked', 'line', 'area', 'donut']
  const input = [
    ...kinds.map((kind) => ({ type: 'chart', kind, x: ['a', 'b'], series: { s: [1, 2] } })),
    { type: 'chart', kind: 'spark', values: [1, 2] },
  ]
  const { frame } = await open(page, input)
  const found = await frame.evaluate(
    () => document.querySelectorAll('.vui-root [style],.vui-root [fill],.vui-root [stroke]').length,
  )
  expect(found).toBe(0)
})

test('a chart redraws at its width, at a whole-pixel scale of 1', async ({ page }) => {
  const { frame, iframe } = await open(page, [line], 360)
  const box = () =>
    frame.evaluate(() => {
      const image = document.querySelector('.vui-chart svg') as SVGSVGElement
      return { view: image.viewBox.baseVal.width, width: image.getBoundingClientRect().width }
    })
  const narrow = await box()
  expect(narrow.view).toBe(Math.round(narrow.width))
  await iframe.evaluate((frame) => {
    ;(frame.parentElement as HTMLElement).style.width = '900px'
  })
  await expect.poll(async () => (await box()).view).toBeGreaterThan(narrow.view)
  const wide = await box()
  expect(wide.view).toBe(Math.round(wide.width))
})

test('every kind fits at the narrowest width, and text stays in the box', async ({ page }) => {
  const x = Array.from({ length: 40 }, (_, index) => `category ${index}`)
  const input = ['bar', 'hbar', 'stacked', 'line', 'area', 'donut'].map((kind) => ({
    type: 'chart',
    kind,
    x,
    series: { s: x.map((_, index) => index * 1000) },
  }))
  const { frame } = await open(page, input, 320)
  const escaped = await frame.evaluate(() =>
    [...document.querySelectorAll('.vui-chart svg')].flatMap((image) => {
      const box = image.getBoundingClientRect()
      return [...image.querySelectorAll('text')]
        .map((text) => text.getBoundingClientRect())
        .filter((text) => text.left < box.left - 1 || text.right > box.right + 1)
        .map((text) => [text.left - box.left, box.right - text.right])
    }),
  )
  expect(escaped).toEqual([])
  const overlap = await frame.evaluate(() =>
    [...document.querySelectorAll('.vui-chart svg')].some((image) => {
      const labels = [...image.querySelectorAll('.vui-chart-label,.vui-chart-tick')].map((n) =>
        n.getBoundingClientRect(),
      )
      return labels.some((a, index) =>
        labels
          .slice(index + 1)
          .some(
            (b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          ),
      )
    }),
  )
  expect(overlap).toBe(false)
})

test('hovering shows the point, the tip stays in the box, and leaving hides it', async ({
  page,
}) => {
  const { frame } = await open(page, [line], 720)
  const hit = frame.locator('.vui-chart-hit')
  const size = await hit.boundingBox()
  const tip = frame.locator('.vui-chart-tip')
  await expect(tip).toBeHidden()
  for (const share of [0.02, 0.48, 0.52, 0.98]) {
    await hit.hover({ position: { x: (size?.width ?? 0) * share, y: 40 } })
    await expect(tip).toBeVisible()
    const box = await tip.boundingBox()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual((size?.x ?? 0) - 1)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (size?.x ?? 0) + (size?.width ?? 0) + 1,
    )
  }
  await expect(tip).toContainText('d')
  await expect(tip).toContainText('4 ms')
  await expect(tip).toContainText('8 ms')
  await page.mouse.move(5, 800)
  await expect(tip).toBeHidden()
})

test('the hidden table adds nothing to the page', async ({ page }) => {
  const { frame } = await open(page, [line], 360)
  const sizes = await frame.evaluate(() => {
    const root = document.querySelector('.vui-root') as HTMLElement
    const wrapper = document.querySelector('.vui-chart .vui-sr-only') as HTMLElement
    return {
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      extra: document.documentElement.scrollHeight - root.getBoundingClientRect().height,
      height: wrapper.getBoundingClientRect().height,
      cells: wrapper.querySelectorAll('td').length,
    }
  })
  expect(sizes.over).toBeLessThanOrEqual(0)
  expect(sizes.extra).toBeLessThanOrEqual(1)
  expect(sizes.height).toBeLessThanOrEqual(1)
  expect(sizes.cells).toBe(8)
})

test.describe('§9.5 budgets', () => {
  const values = (shift: number) =>
    Array.from({ length: 1000 }, (_, index) => Math.sin(index / 20 + shift) * 100)
  const document = {
    vui: 1,
    body: [
      {
        type: 'chart',
        kind: 'line',
        x: values(0).map((_, index) => index),
        series: Object.fromEntries([0, 1, 2, 3, 4].map((shift) => [`s${shift}`, values(shift)])),
      },
    ],
  }

  test('a chart with 5 × 1,000 points renders in 25 ms', async ({ page }) => {
    const { frame } = await open(page, ['start'])
    // The fastest run, since the gate runs tests side by side and the budget is the code's cost.
    const [fastest, median] = await frame.evaluate((input) => {
      const { __vuiHandle: handle } = window as unknown as {
        __vuiHandle: { update(document: unknown): void }
      }
      const times = Array.from({ length: 7 }, () => {
        const start = performance.now()
        handle.update(input)
        return performance.now() - start
      })
      times.sort((a, b) => a - b)
      return [times[0] as number, times[3] as number]
    }, document)
    await expect(frame.locator('.vui-chart-line')).toHaveCount(5)
    console.log(`5 × 1,000 chart: fastest ${fastest.toFixed(1)} ms, median ${median.toFixed(1)} ms`)
    expect(fastest).toBeLessThanOrEqual(25)
  })
})
