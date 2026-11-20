import { LIMITS } from '@vadd/ui-spec'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lttb } from '../../src/chart/scale.js'
import { show } from '../helpers.js'

const chart = (fields: Record<string, unknown>) => show([{ type: 'chart', ...fields }])
const line = (fields: Record<string, unknown> = {}) =>
  chart({
    kind: 'line',
    yFormat: 'ms',
    x: ['10:00', '10:05', '10:10'],
    series: { p50: [42, 40, 45], p95: [120, 180, 95] },
    ...fields,
  })
const q = (box: Element, selector: string) => box.querySelector(selector)
const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) => all(box, selector).map((n) => n.textContent)
const d = (box: Element, selector: string) => q(box, selector)?.getAttribute('d') ?? ''

function hover(box: Element, clientX: number, clientY = 50) {
  const hit = q(box, '.vui-chart-hit') as HTMLElement
  hit.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 200, right: 640, bottom: 200 }) as DOMRect
  hit.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chart accessibility', () => {
  it('is an image with a title and a generated description', () => {
    const { box } = line({ title: 'Latency **now**' })
    const image = q(box, 'svg') as SVGElement
    expect(image.getAttribute('role')).toBe('img')
    expect(image.firstElementChild?.tagName).toBe('title')
    expect(texts(box, 'svg > title')).toEqual(['Latency now'])
    expect(texts(box, 'svg > desc')).toEqual(['Line chart, 2 series, 3 points, range 40–180 ms'])
  })

  it('names itself after the kind with no title', () => {
    expect(texts(line().box, 'svg > title')).toEqual(['Line chart'])
  })

  it('counts one point and one series in words that fit', () => {
    const { box } = chart({ kind: 'bar', x: ['a'], series: { s: [5] } })
    expect(texts(box, 'desc')).toEqual(['Bar chart, 1 series, 1 point, range 5'])
  })

  it('keeps both units when they differ', () => {
    const { box } = chart({ kind: 'bar', yFormat: 'ms', x: ['a', 'b'], series: { s: [5, 90000] } })
    expect(texts(box, 'desc')[0]).toContain('range 5 ms–1m 30s')
  })

  it('keeps both ends whole when a shared tail is not a unit', () => {
    const { box } = chart({ kind: 'bar', yFormat: 'dur', x: ['a', 'b'], series: { s: [65, 125] } })
    expect(texts(box, 'desc')[0]).toContain('range 1m 05s–2m 05s')
  })

  it('does not round small values away with no yFormat', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [0.001, 0.002] } })
    expect(texts(box, 'desc')[0]).toContain('range 0.0010–0.0020')
    expect(texts(box, 'tbody td')).toEqual(['0.0010', '0.0020'])
  })

  it('keeps auto decimals for ordinary values', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [1.25, 2.5] } })
    expect(texts(box, 'tbody td')).toEqual(['1.25', '2.5'])
  })

  it('leaves the range out with no data', () => {
    const { box } = chart({ kind: 'bar', x: [], series: {} })
    expect(texts(box, 'desc')).toEqual(['Bar chart, 0 series, 0 points'])
  })

  it('holds the data in a hidden table beside the image', () => {
    const { box } = line()
    const table = q(box, '.vui-sr-only table') as HTMLElement
    expect(q(box, 'svg table')).toBeNull()
    expect(texts(table, 'thead th')).toEqual(['Point', 'p50', 'p95'])
    expect(texts(table, 'tbody th')).toEqual(['10:00', '10:05', '10:10'])
    expect(texts(table, 'tbody tr:first-child td')).toEqual(['42 ms', '120 ms'])
    expect(q(table, 'caption')?.textContent).toBe('Line chart')
    expect(all(table, 'tbody th').every((th) => th.getAttribute('scope') === 'row')).toBe(true)
  })

  it('bounds the table and says so', () => {
    const values = Array.from({ length: 5000 }, (_, index) => index)
    const { box } = chart({ kind: 'line', x: values, series: { s: values } })
    expect(all(box, 'tbody tr').length).toBeLessThanOrEqual(200)
    expect(q(box, 'caption')?.textContent).toContain('1 row in 25')
  })

  it('shows a missing value as an em dash', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [1, 2], t: [2] } })
    expect(texts(box, 'tbody tr:last-child td')).toEqual(['2', '—'])
  })
})

describe('chart fields', () => {
  it.each([
    ['sm', '120'],
    ['md', '200'],
    ['lg', '300'],
  ])('height %s is %s px', (height, pixels) => {
    const { box } = line({ height })
    expect(q(box, 'svg')?.getAttribute('height')).toBe(pixels)
    expect(q(box, 'svg')?.getAttribute('viewBox')).toBe(`0 0 640 ${pixels}`)
    expect(q(box, 'svg')?.getAttribute('width')).toBe('100%')
  })

  it('defaults to md', () => {
    expect(q(line().box, 'svg')?.getAttribute('height')).toBe('200')
  })

  it('shows a legend for two series', () => {
    expect(texts(line().box, '.vui-legend-label')).toEqual(['p50', 'p95'])
  })

  it('shows none for one series', () => {
    const { box } = chart({ kind: 'bar', x: ['a'], series: { s: [1] } })
    expect(q(box, '.vui-legend')).toBeNull()
  })

  it('draws a toned series in its tone, marks, legend and tooltip alike (VD-213)', () => {
    const { box, handle } = chart({
      kind: 'stacked',
      x: ['Q1', 'Q2'],
      series: { ok: [10, 12], fail: [2, 1] },
      tones: { fail: 'err' },
    })
    expect(handle.diagnostics).toEqual([])
    const bars = all(box, 'path.vui-chart-bar')
    expect(bars[0]?.getAttribute('data-vui-series')).toBe('1')
    expect(bars[0]?.getAttribute('class')).toBe('vui-chart-bar')
    expect(bars[1]?.getAttribute('class')).toBe('vui-chart-bar vui-tone-err')
    expect(bars[1]?.hasAttribute('data-vui-series')).toBe(false)
    const items = all(box, '.vui-legend li')
    expect(items[1]?.getAttribute('class')).toBe('vui-tone-err')
    expect(items[0]?.getAttribute('data-vui-series')).toBe('1')
    hover(box, 100)
    const rows = all(box, '.vui-chart-tip-row')
    expect(rows[1]?.getAttribute('class')).toBe('vui-chart-tip-row vui-tone-err')
    expect(rows[0]?.getAttribute('data-vui-series')).toBe('1')
  })

  it('tones lines and areas, and leaves a donut to its palette', () => {
    const area = line({ kind: 'area', tones: { p95: 'warn', nope: 'ok' } }).box
    expect(all(area, '.vui-chart .vui-tone-warn').map((n) => n.getAttribute('class'))).toEqual([
      'vui-chart-area vui-tone-warn',
      'vui-chart-line vui-tone-warn',
      'vui-tone-warn',
    ])
    const donut = chart({
      kind: 'donut',
      x: ['a', 'b'],
      series: { n: [1, 2] },
      tones: { n: 'err' },
    })
    expect(q(donut.box, '.vui-tone-err')).toBeNull()
  })

  it('honors legend none', () => {
    expect(q(line({ legend: 'none' }).box, '.vui-legend')).toBeNull()
  })

  it('names slices in a donut legend', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b'], series: { s: [1, 2] } })
    expect(texts(box, '.vui-legend-label')).toEqual(['a', 'b'])
  })

  it('numbers series past the palette, so CSS can repeat it', () => {
    const series = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`s${index}`, [index]]),
    )
    const { box } = chart({ kind: 'bar', x: ['a'], series })
    const seen = all(box, 'path[data-vui-series]').map((p) => p.getAttribute('data-vui-series'))
    expect(seen).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1)))
  })

  it('draws a refLine with a label in its tone, and takes it into the domain', () => {
    const { box } = line({ refLines: [{ y: 500, label: 'SLO', tone: 'err' }] })
    expect(q(box, 'path.vui-chart-ref')?.getAttribute('class')).toContain('vui-tone-err')
    expect(texts(box, 'text.vui-chart-ref-label')).toEqual(['SLO'])
    expect(texts(box, '.vui-chart-tick')).toContain('500 ms')
  })

  it('keeps a clipped refLine label whole in its title, which an unclipped one does not need', () => {
    const label = 'Service level objective for p95 latency, set in Q3'
    const { box } = line({
      refLines: [
        { y: 500, label, tone: 'err' },
        { y: 100, label: 'SLO', tone: 'ok' },
      ],
    })
    const [long, short] = all(box, 'text.vui-chart-ref-label')
    expect(long?.firstChild?.textContent).toMatch(/^Service level objective.*…$/)
    expect(long?.querySelector('title')?.textContent).toBe(label)
    expect(short?.textContent).toBe('SLO')
    expect(short?.querySelector('title')).toBeNull()
  })

  it('skips a refLine with no number', () => {
    const { box } = line({ refLines: [{ label: 'x', tone: 'err' }, 'junk'] })
    expect(q(box, 'path.vui-chart-ref')).toBeNull()
  })

  it('has no refLine on a donut', () => {
    const { box } = chart({
      kind: 'donut',
      x: ['a'],
      series: { s: [1] },
      refLines: [{ y: 1, label: 'x', tone: 'ok' }],
    })
    expect(q(box, '.vui-chart-ref')).toBeNull()
  })

  it('prints stack totals only when asked', () => {
    const fields = { kind: 'stacked', x: ['a', 'b'], series: { s: [1, 2], t: [3, 4] } }
    expect(q(chart(fields).box, '.vui-chart-total')).toBeNull()
    const { box } = chart({ ...fields, stackTotal: true })
    expect(texts(box, '.vui-chart-total')).toEqual(['4', '6'])
    expect(texts(box, 'thead th')).toContain('Total')
    expect(texts(box, 'tbody tr:first-child td')).toEqual(['1', '3', '4'])
  })

  it('takes stackTotal on stacked only', () => {
    const { box } = chart({ kind: 'bar', x: ['a'], series: { s: [1] }, stackTotal: true })
    // The one text is the bar's own value label (VD-192), not a total.
    expect(texts(box, '.vui-chart-total')).toEqual(['1'])
    expect(texts(box, 'thead th')).not.toContain('Total')
  })

  it('leaves scatter to the ext build (VD-182)', () => {
    const { box } = chart({ kind: 'scatter', points: [[1, 2]] })
    expect(q(box, '.vui-card-placeholder')).not.toBeNull()
    expect(q(box, 'svg')).toBeNull()
  })

  it('formats x labels with xFormat', () => {
    const { box } = chart({
      kind: 'line',
      xFormat: 'int',
      x: [1000, 2000],
      series: { s: [1, 2] },
    })
    expect(texts(box, 'tbody th')).toEqual(['1,000', '2,000'])
  })
})

describe('chart drawing', () => {
  const marks = (box: Element) => all(box, '[data-vui-series]')

  it('draws no color into an attribute', () => {
    for (const kind of ['bar', 'hbar', 'stacked', 'line', 'area', 'donut']) {
      const { box } = chart({ kind, x: ['a', 'b'], series: { s: [1, 2] } })
      expect(all(box, '[fill],[stroke],[style]')).toEqual([])
    }
  })

  it('draws one path per series, whatever the points', () => {
    const values = Array.from({ length: 900 }, (_, index) => index)
    const { box } = chart({ kind: 'bar', x: values.map(String), series: { a: values, b: values } })
    expect(all(box, 'path.vui-chart-bar')).toHaveLength(2)
  })

  it('splits a bar band between series, and overlays nothing', () => {
    const { box } = chart({ kind: 'bar', x: ['a'], series: { s: [2], t: [2] } })
    const [first, second] = all(box, 'path.vui-chart-bar').map((p) => p.getAttribute('d') ?? '')
    expect(first).not.toBe(second)
  })

  it('stacks up from where the last series ended', () => {
    const { box } = chart({ kind: 'stacked', x: ['a'], series: { s: [2], t: [2] } })
    const tops = all(box, 'path.vui-chart-bar').map((p) => p.getAttribute('d') ?? '')
    const y = (path: string, point: number) => Number(path.split(/[ML]/)[point]?.split(' ')[1])
    expect(y(tops[0] as string, 2)).toBeCloseTo(y(tops[1] as string, 1), 5)
  })

  it('stacks a negative value down from zero, whatever sits above', () => {
    const { box } = chart({ kind: 'stacked', x: ['a'], series: { s: [2], t: [-1] } })
    expect(texts(box, '.vui-chart-tick')).toContain('-1')
    const y = (path: string | null | undefined, point: number) =>
      Number(path?.split(/[ML]/)[point]?.split(' ')[1])
    const [upper, lower] = all(box, 'path.vui-chart-bar').map((p) => p.getAttribute('d'))
    expect(y(lower, 1)).toBeCloseTo(y(upper, 1), 5)
    expect(y(lower, 2)).toBeGreaterThan(y(upper, 1))
  })

  it('lays hbar out across, with labels at the start', () => {
    const { box } = chart({ kind: 'hbar', x: ['aa', 'bb'], series: { s: [1, 2] } })
    const labels = all(box, '.vui-chart-label')
    expect(labels.map((n) => n.textContent)).toEqual(['aa', 'bb'])
    expect(labels[0]?.getAttribute('text-anchor')).toBe('end')
    expect(Number(labels[1]?.getAttribute('y'))).toBeGreaterThan(
      Number(labels[0]?.getAttribute('y')),
    )
  })

  it('still draws a lone point', () => {
    const { box } = chart({ kind: 'line', x: ['a'], series: { s: [1] } })
    expect(d(box, '.vui-chart-line')).toContain('h0')
  })

  it('closes an area to the baseline, and draws its line', () => {
    const { box } = chart({ kind: 'area', x: ['a', 'b'], series: { s: [1, 2] } })
    expect(d(box, '.vui-chart-area')).toMatch(/Z$/)
    expect(q(box, '.vui-chart-line')).not.toBeNull()
    expect(Number(texts(box, '.vui-chart-tick')[0])).toBe(0)
  })

  it('does not force zero into a line', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [100, 110] } })
    expect(texts(box, '.vui-chart-tick')).not.toContain('0')
  })

  it('places numbers on x to scale', () => {
    const { box } = chart({ kind: 'line', x: [0, 1, 100], series: { s: [1, 2, 3] } })
    const xs = d(box, '.vui-chart-line')
      .split(/[ML]/)
      .slice(1)
      .map((point) => Number(point.split(' ')[0]))
    const [a, b, c] = xs as [number, number, number]
    expect((b - a) / (c - a)).toBeCloseTo(0.01, 2)
  })

  it('places ISO dates on x to scale', () => {
    const x = ['2026-01-01', '2026-01-02', '2026-01-11']
    const { box } = chart({ kind: 'line', x, series: { s: [1, 2, 3] } })
    const xs = d(box, '.vui-chart-line')
      .split(/[ML]/)
      .slice(1)
      .map((point) => Number(point.split(' ')[0]))
    const [a, b, c] = xs as [number, number, number]
    expect((b - a) / (c - a)).toBeCloseTo(0.1, 2)
  })

  it('falls back to even spacing for x that does not increase', () => {
    const { box } = chart({ kind: 'line', x: [5, 1, 9], series: { s: [1, 2, 3] } })
    const xs = d(box, '.vui-chart-line')
      .split(/[ML]/)
      .slice(1)
      .map((point) => Number(point.split(' ')[0]))
    const [a, b, c] = xs as [number, number, number]
    expect((b - a) / (c - a)).toBeCloseTo(0.5, 2)
  })

  it('thins x labels to what fits', () => {
    const x = Array.from({ length: 200 }, (_, index) => `label-${index}`)
    const { box } = chart({ kind: 'bar', x, series: { s: x.map(() => 1) } })
    const labels = all(box, '.vui-chart-label')
    expect(labels.length).toBeLessThan(20)
    expect(labels.length).toBeGreaterThan(3)
    const xs = labels.map((n) => Number(n.getAttribute('x')))
    const gap = Math.min(...xs.slice(1).map((value, index) => value - (xs[index] as number)))
    expect(gap).toBeGreaterThanOrEqual('label-100'.length * 6)
  })

  it('clips a long label, and keeps it whole in the table', () => {
    const x = ['a'.repeat(100)]
    const { box } = chart({ kind: 'bar', x, series: { s: [1] } })
    expect(q(box, '.vui-chart-label')?.textContent?.length).toBeLessThan(30)
    expect(q(box, 'tbody th')?.textContent).toBe(x[0])
  })

  it('never takes more than 6 y-ticks', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [3, 9973] } })
    expect(all(box, '.vui-chart-tick').length).toBeLessThanOrEqual(6)
  })

  it('tells small ticks apart with no yFormat', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [0.001, 0.004] } })
    const ticks = texts(box, '.vui-chart-tick')
    expect(new Set(ticks).size).toBe(ticks.length)
  })

  it('draws a slice per category as a dash of one ring', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b'], series: { s: [1, 3] } })
    const slices = all(box, 'circle.vui-chart-slice')
    expect(slices).toHaveLength(2)
    expect(slices[0]?.getAttribute('pathLength')).toBe('100')
    expect(slices[0]?.getAttribute('stroke-dasharray')?.split(' ')[0]).toBe('24.5')
    expect(slices[1]?.getAttribute('stroke-dashoffset')).toBe('-25')
  })

  it('leaves a whole ring whole', () => {
    const { box } = chart({ kind: 'donut', x: ['a'], series: { s: [1] } })
    expect(q(box, 'circle')?.getAttribute('stroke-dasharray')?.split(' ')[0]).toBe('100')
  })

  it('draws no slice for a value that is not positive', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b', 'c'], series: { s: [1, 0, -2] } })
    expect(all(box, 'circle')).toHaveLength(1)
  })

  it('folds a donut to 12 slices, summing the rest', () => {
    const x = Array.from({ length: 20 }, (_, index) => `c${index}`)
    const { box } = chart({ kind: 'donut', x, series: { s: x.map((_, index) => index + 1) } })
    expect(all(box, 'circle')).toHaveLength(12)
    const legend = texts(box, '.vui-legend-label')
    expect(legend).toHaveLength(12)
    expect(legend[0]).toBe('c0')
    expect(legend[11]).toBe('Other')
    expect(texts(box, 'tbody tr:last-child td')).toEqual(['144'])
    expect(texts(box, 'desc')[0]).toContain('20 points')
  })

  it('draws finite shares when the sum overflows (VD-088)', () => {
    const big = Array.from({ length: 5000 }, (_, index) => (index % 2 === 0 ? 1e308 : -1e308))
    const x = big.map((_, index) => `c${index}`)
    const { box } = chart({ kind: 'donut', x, series: { s: big } })
    for (const node of all(box, 'svg *')) {
      for (const { value } of [...node.attributes])
        expect(value).not.toMatch(/NaN|Infinity|undefined/)
    }
    expect(all(box, 'circle').length).toBeGreaterThan(0)
  })

  it('splits [1e308, 1e308, 1] into two halves', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b', 'c'], series: { s: [1e308, 1e308, 1] } })
    const dashes = all(box, 'circle').map((c) =>
      Number(c.getAttribute('stroke-dasharray')?.split(' ')[0]),
    )
    expect(dashes).toHaveLength(3)
    expect(dashes[0]).toBeCloseTo(49.5, 1)
    expect(dashes[1]).toBeCloseTo(49.5, 1)
    expect(dashes[2]).toBe(0.2)
  })

  it.each(['bar', 'hbar', 'stacked', 'line', 'area'])('keeps %s finite near 1e308', (kind) => {
    const { box } = chart({
      kind,
      stackTotal: true,
      x: ['a', 'b', 'c'],
      series: { s: [1e308, 1e308, -1e308], t: [1e308, 1e308, -1e308] },
    })
    for (const node of all(box, 'svg *')) {
      for (const { value } of [...node.attributes])
        expect(value).not.toMatch(/NaN|Infinity|undefined/)
    }
  })

  // Fuzzer, seed 12, index 30047: a flat domain of ±5e-324 recursed until the stack ran out.
  // No diagnostic at all: the tick format the chart derives once asked `num` for 324 decimals
  // and reported a `bad-format-arg` warn on a `yFormat` the document never wrote.
  it.each([
    { kind: 'spark', values: [5e-324] },
    { kind: 'spark', values: [-5e-324, -5e-324] },
    { kind: 'bar', x: ['a'], series: { s: [5e-324] } },
    { kind: 'line', x: ['a', 'b'], series: { s: [-5e-324, -5e-324] } },
  ])('draws a flat domain of the smallest subnormal: %j', (fields) => {
    const { box, handle } = chart(fields)
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(handle.diagnostics).toEqual([])
    expect(box.querySelector('svg')).not.toBeNull()
  })

  // Fuzzer, seed 1, index 5211: half of each end underflowed to ±0, so the span was 0 and
  // every share NaN, although the ends differ.
  it.each([[[-5e-324, 5e-324]], [[5e-324, 1e-323, 0]]])(
    'keeps a spark of subnormals finite: %j',
    (values) => {
      for (const { box } of [
        chart({ kind: 'spark', values }),
        show([{ type: 'stats', items: [{ label: 'a', value: 1, spark: values }] }]),
      ]) {
        expect(box.querySelector('path')).not.toBeNull()
        for (const node of all(box, 'svg *')) {
          for (const { value } of [...node.attributes]) expect(value).not.toMatch(/NaN|Infinity/)
        }
      }
    },
  )

  it('keeps a sliver a sliver', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b'], series: { s: [1000, 1] } })
    for (const slice of all(box, 'circle')) {
      const dash = Number(slice.getAttribute('stroke-dasharray')?.split(' ')[0])
      expect(dash).toBeGreaterThan(0)
    }
  })

  it('names the fold Other when x is short, and sums only what it can draw', () => {
    const values = Array.from({ length: 14 }, (_, index) => (index === 13 ? -5 : index + 1))
    const { box } = chart({ kind: 'donut', x: ['a', 'b', 'c'], series: { s: values } })
    const labels = texts(box, 'tbody th')
    expect(labels[0]).toBe('a')
    expect(labels[11]).toBe('Other')
    expect(texts(box, 'tbody tr:last-child td')).toEqual(['25'])
  })

  it('takes the range of a fold from the document', () => {
    const x = Array.from({ length: 20 }, (_, index) => `c${index}`)
    const { box } = chart({ kind: 'donut', x, series: { s: x.map((_, index) => index + 1) } })
    expect(texts(box, 'desc')[0]).toContain('range 1–20')
  })

  it('puts stack totals on their stacks past 1,000 points', () => {
    const values = Array.from({ length: 3000 }, (_, index) => 100 + (index % 7))
    const { box } = chart({
      kind: 'stacked',
      stackTotal: true,
      x: values.map(String),
      series: { s: values },
    })
    const ys = all(box, '.vui-chart-total').map((n) => Number(n.getAttribute('y')))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(100)
  })

  it('keeps an hbar refLine label in the box near the start', () => {
    const { box } = chart({
      kind: 'hbar',
      x: ['a'],
      series: { s: [100] },
      refLines: [{ y: 1, label: 'Budget', tone: 'ok' }],
    })
    expect(q(box, '.vui-chart-ref-label')?.getAttribute('text-anchor')).toBe('start')
  })

  it('clips an unbounded tick so the plot keeps its room', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [1e40, 3e40] } })
    expect(
      Math.max(...texts(box, '.vui-chart-tick').map((tick) => tick?.length ?? 0)),
    ).toBeLessThan(15)
  })

  it('shows a word for an empty chart', () => {
    const { box } = chart({ kind: 'line', x: [], series: {} })
    expect(texts(box, 'svg text')).toEqual(['No data'])
  })

  it('draws a spark at its own size, with no axes', () => {
    const { box } = chart({ kind: 'spark', values: [1, 3, 2], yFormat: 'int', height: 'lg' })
    expect(q(box, 'svg')?.getAttribute('viewBox')).toBe('0 0 100 24')
    expect(q(box, 'svg')?.getAttribute('preserveAspectRatio')).toBe('none')
    expect(q(box, '.vui-chart')?.getAttribute('data-vui-kind')).toBe('spark')
    expect(q(box, '.vui-chart-tick')).toBeNull()
    expect(q(box, '.vui-legend')).toBeNull()
    expect(marks(box)).toHaveLength(1)
    expect(texts(box, 'desc')).toEqual(['Sparkline, 1 series, 3 points, range 1–3'])
  })

  it('has no spark line for no values', () => {
    const { box } = chart({ kind: 'spark', values: [] })
    expect(q(box, '.vui-chart-line')).toBeNull()
  })

  it('downsamples what it draws, and leaves the data whole', () => {
    const values = Array.from({ length: 5000 }, (_, index) => Math.sin(index))
    const { box } = chart({ kind: 'line', x: values.map((_, i) => i), series: { s: values } })
    expect(d(box, '.vui-chart-line').match(/L/g)).toHaveLength(999)
    expect(texts(box, 'desc')[0]).toContain('5,000 points')
  })

  it('shares one index list between bars past 1,000', () => {
    const spike = (at: number) =>
      Array.from({ length: 3000 }, (_, index) => (index === at ? 500 : (index * 31) % 7))
    const x = spike(0).map((_, index) => String(index))
    const { box } = chart({ kind: 'bar', x, series: { s: spike(100), t: spike(2000) } })
    const starts = all(box, 'path.vui-chart-bar').map((p) =>
      [...(p.getAttribute('d') ?? '').matchAll(/M([\d.]+) /g)].map((match) => Number(match[1])),
    )
    const [first = [], second = []] = starts
    expect(first.length).toBeLessThanOrEqual(1000)
    expect(second).toHaveLength(first.length)
    const gap = (second[0] as number) - (first[0] as number)
    expect(
      second.every((start, index) => Math.abs(start - (first[index] as number) - gap) < 0.2),
    ).toBe(true)
  })
})

describe('chart tooltip', () => {
  const tip = (box: Element) => q(box, '.vui-chart-tip') as HTMLElement

  it('starts hidden and out of the accessibility tree', () => {
    const { box } = line()
    expect(tip(box).hidden).toBe(true)
    expect(tip(box).getAttribute('aria-hidden')).toBe('true')
  })

  it('shows the x label and every series value through yFormat', () => {
    const { box } = line()
    hover(box, 639)
    expect(tip(box).hidden).toBe(false)
    expect(q(tip(box), '.vui-chart-tip-head')?.textContent).toBe('10:10')
    expect(texts(tip(box), '.vui-chart-tip-row')).toEqual(['p5045 ms', 'p9595 ms'])
  })

  it('finds the nearest original point of a downsampled series', () => {
    const count = 10_000
    const values = Array.from({ length: count }, (_, index) => (index * 7919) % 1000)
    const indices = values.map((_, index) => index)
    const { box } = chart({ kind: 'line', x: indices, series: { s: values } })
    const drawn = new Set(lttb(indices, values, 1000))
    const shown = [97, 211, 353, 467, 523].map((x) => {
      hover(box, x)
      const index = Number(q(tip(box), '.vui-chart-tip-head')?.textContent)
      expect(texts(tip(box), '.vui-chart-tip-row')[0]).toBe(
        `s${values[index]?.toLocaleString('en-US')}`,
      )
      return index
    })
    expect(shown.some((index) => !drawn.has(index))).toBe(true)
  })

  it('shows an em dash for a series with no value there', () => {
    const { box } = chart({ kind: 'line', x: ['a', 'b'], series: { s: [1, 2], t: [3] } })
    hover(box, 639)
    expect(texts(tip(box), '.vui-chart-tip-row')[1]).toContain('—')
  })

  it('adds the total under stackTotal', () => {
    const { box } = chart({
      kind: 'stacked',
      stackTotal: true,
      x: ['a'],
      series: { s: [1], t: [2] },
    })
    hover(box, 300)
    expect(texts(tip(box), '.vui-chart-tip-row')).toEqual(['s1', 't2', 'Total3'])
  })

  it('moves by whole percents and flips past the middle', () => {
    const { box } = line()
    hover(box, 64)
    expect(tip(box).getAttribute('data-vui-fill')).toBe('10')
    expect(tip(box).hasAttribute('data-vui-end')).toBe(false)
    hover(box, 500)
    expect(tip(box).hasAttribute('data-vui-end')).toBe(true)
  })

  it('hides on leave', () => {
    const { box } = line()
    hover(box, 300)
    q(box, '.vui-chart-hit')?.dispatchEvent(new MouseEvent('pointerleave'))
    expect(tip(box).hidden).toBe(true)
  })

  it('reads a bar from its band, and hbar along its height', () => {
    const { box } = chart({ kind: 'hbar', x: ['a', 'b'], series: { s: [1, 2] } })
    hover(box, 300, 190)
    expect(q(tip(box), '.vui-chart-tip-head')?.textContent).toBe('b')
  })

  it('reads a donut slice from the pointer angle', () => {
    const { box } = chart({ kind: 'donut', x: ['a', 'b'], series: { s: [1, 3] } })
    // Clockwise from the top, a quarter is `a`: right of center and above it.
    hover(box, 320 + 40, 100 - 60)
    expect(q(tip(box), '.vui-chart-tip-head')?.textContent).toBe('a')
    hover(box, 320 - 60, 100)
    expect(q(tip(box), '.vui-chart-tip-head')?.textContent).toBe('b')
  })

  it('ignores a box with no size', () => {
    const { box } = line()
    const hit = q(box, '.vui-chart-hit') as HTMLElement
    hit.dispatchEvent(new MouseEvent('pointermove', { clientX: 5 }))
    expect(tip(box).hidden).toBe(true)
  })
})

describe('chart resize', () => {
  class FakeObserver {
    static made: FakeObserver[] = []
    observed: Element[] = []
    constructor(readonly callback: ResizeObserverCallback) {
      FakeObserver.made.push(this)
    }
    observe(element: Element) {
      this.observed.push(element)
    }
    unobserve(element: Element) {
      this.observed = this.observed.filter((item) => item !== element)
    }
    disconnect() {}
    fire(element: Element, width: number) {
      this.callback(
        [{ target: element, contentRect: { width } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
  }

  it('redraws at the new width, sharing one observer, and stops on destroy', async () => {
    vi.resetModules()
    FakeObserver.made = []
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const { show: fresh } = await import('../helpers.js')
    const doc = { type: 'chart', kind: 'bar', x: ['a'], series: { s: [1] } }
    const one = fresh([doc, doc, doc])
    expect(FakeObserver.made).toHaveLength(1)
    const observer = FakeObserver.made[0] as FakeObserver
    expect(observer.observed).toHaveLength(3)
    const plot = observer.observed[0] as Element
    observer.fire(plot, 320.4)
    expect(q(plot, 'svg')?.getAttribute('viewBox')).toBe('0 0 320 200')
    observer.fire(plot, 0)
    expect(q(plot, 'svg')?.getAttribute('viewBox')).toBe('0 0 320 200')
    const spark = fresh([{ type: 'chart', kind: 'spark', values: [1, 2] }])
    expect(observer.observed).toHaveLength(3)
    spark.handle.destroy()
    one.handle.destroy()
    expect(observer.observed).toHaveLength(0)
  })

  it('keeps the last drawing when a redraw fails', async () => {
    vi.resetModules()
    FakeObserver.made = []
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const { show: fresh } = await import('../helpers.js')
    fresh([{ type: 'chart', kind: 'bar', x: ['a'], series: { s: [1] } }])
    const observer = FakeObserver.made[0] as FakeObserver
    const plot = observer.observed[0] as Element
    expect(() => observer.fire(plot, Number.NaN)).not.toThrow()
    expect(q(plot, 'svg')?.getAttribute('viewBox')).toBe('0 0 640 200')
  })
})

describe('chart robustness', () => {
  it.each([
    [{ kind: 'line', x: ['a'], series: { s: 'bad' } }],
    [{ kind: 'bar', x: ['a'], series: { s: [1e308, 1e308, -1e308] } }],
    [{ kind: 'stacked', x: ['a', 'b'], series: { s: [1e308, 1], t: [1e308, 1] } }],
    [{ kind: 'line', x: 'nope', series: { s: [1] } }],
    [{ kind: 'donut', x: [], series: { s: [] } }],
    [{ kind: 'line', x: ['a', 'b', 'c'], series: { s: [1] } }],
    [{ kind: 'line', x: ['a'], series: { s: [1, 2, 3] } }],
    [{ kind: 'spark', values: 'bad' }],
    [{ kind: 'bar', x: ['a'], series: { s: [1] }, refLines: 'bad', height: 'xl', legend: 7 }],
    [{ kind: 'bar', x: [{ a: 1 }, null], series: { s: [1, 2] } }],
    [{ kind: 'line', x: ['a'], series: { s: [1] }, yFormat: 7, xFormat: 'bogus:1' }],
    // `pnpm fuzz`, seed 3746479352: `spark` takes no `x`, so an unknown one reaches the model
    // unchecked, and an entry whose `toString` is data cannot become a number.
    [{ kind: 'spark', x: ['a', 'b', { toString: {} }], values: [1, 2, 3] }],
    [{ kind: 'spark', x: [{ valueOf: [] }, 'b'], values: [1, 2] }],
  ])('renders %j', (fields) => {
    const { handle } = chart(fields)
    expect(handle.diagnostics.some(({ code }) => code === 'render-failed')).toBe(false)
  })

  it('writes no NaN into a path', () => {
    const flat = 1700000000001
    for (const series of [
      { s: [1e308, 1e308] },
      { s: [5e-324, 1e-323] },
      { s: [0, 0] },
      { s: [flat, flat + 3] },
    ]) {
      for (const kind of ['bar', 'stacked', 'line', 'area', 'hbar']) {
        const { box } = chart({ kind, x: ['a', 'b'], series })
        for (const path of all(box, 'path[d]')) {
          expect(path.getAttribute('d')).not.toMatch(/NaN|Infinity/)
        }
      }
    }
  })

  it('keeps a spark finite at the edge of a double', () => {
    const { box } = chart({ kind: 'spark', values: [-1.7e308, 1.7e308] })
    expect(d(box, '.vui-chart-line')).toBe('M0 23L100 1')
  })

  it('takes a chart at the point cap', () => {
    const values = Array.from({ length: LIMITS.chartPoints }, (_, index) => index)
    const { box, handle } = chart({ kind: 'line', x: values, series: { a: values, b: values } })
    expect(q(box, '.vui-chart-line')).not.toBeNull()
    expect(handle.diagnostics).toEqual([])
  })

  it('keeps document text out of markup', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { box } = chart({
      kind: 'bar',
      title: evil,
      x: [evil],
      series: { [evil]: [1], b: [2] },
      refLines: [{ y: 1, label: evil, tone: 'ok' }],
    })
    expect(q(box, 'img')).toBeNull()
  })
})

describe('chart polish (VD-190)', () => {
  const rects = (path: string) =>
    path
      .split('Z')
      .filter(Boolean)
      .map((rect) =>
        rect
          .slice(1)
          .split('L')
          .map((point) => point.split(' ').map(Number)),
      )
  const labels = (box: Element) => texts(box, 'text.vui-chart-total')

  it('caps bar width, so no bar fills its band', () => {
    for (const kind of ['bar', 'hbar', 'stacked']) {
      const { box } = chart({ kind, x: ['a', 'b'], series: { s: [1, 2] } })
      const swapped = kind === 'hbar' ? 1 : 0
      for (const rect of rects(d(box, 'path.vui-chart-bar'))) {
        const side = Math.abs((rect[2]?.[swapped] as number) - (rect[0]?.[swapped] as number))
        expect(side).toBeGreaterThan(0)
        // The drawn bar is 90% of its 48 px slot.
        expect(side).toBeLessThanOrEqual(43.3)
      }
    }
  })

  it('keeps a capped group of bars centred on its label', () => {
    const { box } = chart({ kind: 'bar', x: ['a'], series: { s: [1], t: [1] } })
    const [first, second] = all(box, 'path.vui-chart-bar').map((p) =>
      rects(p.getAttribute('d') ?? ''),
    )
    const left = first?.[0]?.[0]?.[0] as number
    const right = second?.[0]?.[2]?.[0] as number
    const label = Number(q(box, '.vui-chart-label')?.getAttribute('x'))
    expect((left + right) / 2).toBeCloseTo(label, 0)
  })

  it('labels each bar of one series in yFormat', () => {
    const { box } = chart({
      kind: 'bar',
      yFormat: 'money:USD',
      x: ['EU', 'US'],
      series: { r: [1200, 3400] },
    })
    expect(labels(box)).toEqual(['$1,200.00', '$3,400.00'])
  })

  it('labels no bars for two series, more than 12 bars, hbar or stacked', () => {
    const thirteen = Array.from({ length: 13 }, (_, index) => index + 1)
    for (const fields of [
      { kind: 'bar', x: ['a'], series: { s: [1], t: [2] } },
      { kind: 'bar', x: thirteen.map(String), series: { s: thirteen } },
      { kind: 'hbar', x: ['a'], series: { s: [1] } },
      { kind: 'stacked', x: ['a'], series: { s: [1] } },
    ]) {
      expect(labels(chart(fields).box)).toEqual([])
    }
  })

  it('puts a negative value on the zero line', () => {
    const { box } = chart({ kind: 'bar', x: ['a', 'b'], series: { v: [-5, 3] } })
    expect(labels(box)).toEqual(['-5', '3'])
    const [negative, positive] = all(box, 'text.vui-chart-total').map((n) =>
      Number(n.getAttribute('y')),
    )
    const [bar] = rects(d(box, 'path.vui-chart-bar'))
    const zero = bar?.[0]?.[1] as number
    expect(negative).toBeCloseTo(zero - 4, 0)
    expect(positive).toBeLessThan(zero)
  })

  it('drops a label that cannot fit its slot', () => {
    const values = Array.from({ length: 12 }, () => 123456789)
    const { box } = chart({
      kind: 'bar',
      yFormat: 'money:USD',
      x: values.map((_, index) => `x${index}`),
      series: { v: values },
    })
    expect(labels(box)).toEqual([])
  })

  it('draws no point markers: they did not fit the §9.5 budget (VD-192)', () => {
    expect(all(line().box, '.vui-chart-pt, .vui-chart-dot')).toEqual([])
  })

  it('draws the same marks twice', () => {
    const doc = { kind: 'bar', yFormat: 'pct', x: ['a', 'b'], series: { s: [0.2, 0.5] } }
    expect(q(chart(doc).box, 'svg')?.outerHTML).toBe(q(chart(doc).box, 'svg')?.outerHTML)
  })
})
