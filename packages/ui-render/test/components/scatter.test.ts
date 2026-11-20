import { describe, expect, it } from 'vitest'
import { renderScatter } from '../../src/chart/scatter.js'
import { showExt } from '../helpers.js'

const scatter = (fields: Record<string, unknown> = {}) =>
  showExt([
    {
      type: 'chart',
      kind: 'scatter',
      points: [
        [1, 2, 'alpha'],
        [5, 8, 'beta'],
        [9, 4],
      ],
      ...fields,
    },
  ])
const q = (box: Element, selector: string) => box.querySelector(selector)
const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) => all(box, selector).map((n) => n.textContent)
const d = (box: Element) => q(box, 'path.vui-chart-dot')?.getAttribute('d') ?? ''

function hover(box: Element, clientX: number, clientY: number) {
  const hit = q(box, '.vui-chart-hit') as HTMLElement
  hit.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 200, right: 640, bottom: 200 }) as DOMRect
  hit.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }))
}

describe('scatter (§6.4, §9.4)', () => {
  it('is a chart of its own kind, an image with a title and a description', () => {
    const { box, handle } = scatter({ title: 'Size vs time' })
    expect(handle.diagnostics).toEqual([])
    expect(q(box, '.vui-card-placeholder')).toBeNull()
    expect(q(box, '.vui-chart')?.getAttribute('data-vui-kind')).toBe('scatter')
    expect(q(box, 'svg')?.getAttribute('role')).toBe('img')
    expect(texts(box, 'svg > title')).toEqual(['Size vs time'])
    expect(texts(box, 'svg > desc')).toEqual(['Scatter chart, 3 points, x range 1–9, y range 2–8'])
  })

  it('draws every point as one path, one dot each', () => {
    const { box } = scatter()
    expect(all(box, 'path.vui-chart-dot')).toHaveLength(1)
    expect(d(box).match(/h0/g)).toHaveLength(3)
    expect(d(box)).not.toMatch(/NaN|Infinity/)
  })

  it('has 1-2-5 ticks on both axes, at most 6', () => {
    const { box } = scatter()
    const y = texts(box, '.vui-chart-tick')
    const x = texts(box, '.vui-chart-label')
    expect(y).toEqual(['0', '2', '4', '6', '8', '10'])
    expect(x).toEqual(['0', '2', '4', '6', '8', '10'])
  })

  it('pads both domains, so no point sits on an edge of the plot (B5)', () => {
    for (const points of [
      [
        [0, 0],
        [10, 10],
      ],
      [[3, 3]],
      [
        [-5, 100],
        [5, 200],
      ],
    ]) {
      const { box } = scatter({ points })
      const y = texts(box, '.vui-chart-tick').map(Number)
      const x = texts(box, '.vui-chart-label').map(Number)
      for (const [px, py] of points as [number, number][]) {
        expect(px).toBeGreaterThan(Math.min(...x))
        expect(px).toBeLessThan(Math.max(...x))
        expect(py).toBeGreaterThan(Math.min(...y))
        expect(py).toBeLessThan(Math.max(...y))
      }
    }
  })

  it('never pads positive data below zero', () => {
    const { box } = scatter({
      points: [
        [2, 4],
        [60, 30],
      ],
    })
    expect(texts(box, '.vui-chart-label')[0]).toBe('0')
    expect(texts(box, '.vui-chart-tick')[0]).toBe('0')
  })

  it('writes each label beside its point (B5)', () => {
    const { box } = scatter()
    expect(texts(box, 'text.vui-chart-point-label')).toEqual(['alpha', 'beta'])
    const many = Array.from({ length: 30 }, (_, index) => [index, index, `p${index}`])
    expect(all(scatter({ points: many }).box, '.vui-chart-point-label')).toHaveLength(0)
  })

  it('formats the axes and the hidden table with xFormat and yFormat', () => {
    const { box } = scatter({
      xFormat: 'ms',
      yFormat: 'pct:0',
      points: [
        [100, 0.25, 'a'],
        [300, 0.5],
      ],
    })
    expect(texts(box, '.vui-chart-label')).toContain('300 ms')
    expect(texts(box, '.vui-chart-tick')).toContain('50%')
    const rows = all(box, '.vui-sr-only tbody tr').map((row) =>
      [...row.children].map((cell) => cell.textContent),
    )
    expect(rows).toEqual([
      ['a', '100 ms', '25%'],
      ['Point 2', '300 ms', '50%'],
    ])
    expect(texts(box, '.vui-sr-only thead th')).toEqual(['Point', 'x', 'y'])
  })

  it('downsamples past 1,000 points for drawing (LTTB) and keeps the table bounded', () => {
    const points = Array.from({ length: 5000 }, (_, index) => [index, (index * 7919) % 101])
    const { box } = scatter({ points })
    expect(d(box).match(/h0/g)).toHaveLength(1000)
    expect(all(box, '.vui-sr-only tbody tr').length).toBeLessThanOrEqual(200)
    expect(q(box, '.vui-sr-only caption')?.textContent).toContain('1 row in 25')
  })

  it('shows the nearest point on hover', () => {
    const { box } = scatter()
    hover(box, 639, 0)
    const tip = q(box, '.vui-chart-tip') as HTMLElement
    expect(tip.hidden).toBe(false)
    expect(q(tip, '.vui-chart-tip-head')?.textContent).toBe('Point 3')
    hover(box, 0, 199)
    expect(q(tip, '.vui-chart-tip-head')?.textContent).toBe('alpha')
    expect(texts(tip, '.vui-chart-tip-row')).toEqual(['x1', 'y2'])
    q(box, '.vui-chart-hit')?.dispatchEvent(new MouseEvent('pointerleave'))
    expect(tip.hidden).toBe(true)
  })

  it('draws reference lines', () => {
    const { box } = scatter({ refLines: [{ y: 6, label: 'SLO', tone: 'warn' }] })
    expect(all(box, 'path.vui-chart-ref')).toHaveLength(1)
    expect(texts(box, '.vui-chart-ref-label')).toEqual(['SLO'])
  })

  it('skips points that are not pairs of finite numbers, past validation too', () => {
    // A validated document makes such a point an error card; the component must not need that.
    const context = {
      pointer: '/body/0',
      format: (value: unknown) => ({ text: String(value) }),
      checkpoint() {},
      onDestroy() {},
    }
    const points = [[1, 2], [Number.NaN, 3], ['a', 1], [4], null, [3, 4, 5], { 0: 1, 1: 2 }]
    const box = renderScatter({ type: 'chart', kind: 'scatter', points } as never, context as never)
    expect(d(box).match(/h0/g)).toHaveLength(2)
    expect(texts(box, 'svg > desc')[0]).toContain('2 points')
    expect(d(box)).not.toMatch(/NaN|Infinity/)
  })

  it('says No data with no usable point, and keeps one point finite', () => {
    expect(texts(scatter({ points: [] }).box, 'svg text')).toEqual(['No data'])
    const one = scatter({ points: [[5, 5]] })
    expect(d(one.box)).toMatch(/^M[\d.]+ [\d.]+h0$/)
  })

  it('ignores a height that is an object or a prototype key, past validation (VD-180)', () => {
    const context = {
      pointer: '/body/0',
      format: (value: unknown) => ({ text: String(value) }),
      checkpoint() {},
      onDestroy() {},
    }
    for (const height of [{ toString: 1 }, 'constructor', 'toString']) {
      const node = { type: 'chart', kind: 'scatter', points: [[1, 2]], height }
      const box = renderScatter(node as never, context as never)
      expect(q(box, 'svg')?.getAttribute('height')).toBe('200')
      expect(d(box)).not.toMatch(/NaN/)
    }
  })

  it('keeps coordinates finite at the ends of the number range', () => {
    const { box } = scatter({
      points: [
        [-1e308, -1e308],
        [1e308, 1e308],
        [0, 5e-324],
      ],
    })
    expect(d(box).match(/h0/g)).toHaveLength(3)
    expect(d(box)).not.toMatch(/NaN|Infinity/)
  })

  it('leaves every other kind to the core chart', () => {
    const { box } = showExt([{ type: 'chart', kind: 'bar', x: ['a'], series: { s: [1] } }])
    expect(q(box, '.vui-chart')?.getAttribute('data-vui-kind')).toBe('bar')
    expect(q(box, 'path.vui-chart-bar')).not.toBeNull()
  })
})
