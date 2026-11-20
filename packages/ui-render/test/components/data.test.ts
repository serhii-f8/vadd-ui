import { describe, expect, it } from 'vitest'
import { stats } from '../../src/components/data.js'
import { show } from '../helpers.js'

const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: HTMLElement, selector: string) =>
  all(box, selector).map((item) => item.textContent)
const fills = (box: HTMLElement, selector = '[data-vui-fill]') =>
  all(box, selector).map((item) => item.getAttribute('data-vui-fill'))

describe('kv', () => {
  it('draws tuples as a description list, through their formats', () => {
    const { box } = show([
      {
        type: 'kv',
        pairs: [
          ['Size', 2048, 'bytes'],
          ['Who', '**me**'],
        ],
      },
    ])
    expect(texts(box, 'dl dt')).toEqual(['Size', 'Who'])
    expect(texts(box, 'dl dd')).toEqual(['2.0 KiB', 'me'])
    expect(box.querySelector('dd strong')?.textContent).toBe('me')
  })

  it('takes an object', () => {
    const { box } = show([{ type: 'kv', pairs: { a: 1, b: null } }])
    expect(texts(box, 'dt')).toEqual(['a', 'b'])
    expect(texts(box, 'dd')).toEqual(['1', '—'])
  })

  it('defaults to one column', () => {
    const { box } = show([{ type: 'kv', pairs: {} }])
    expect(box.querySelector('.vui-kv')?.getAttribute('data-vui-cols')).toBe('1')
  })

  it('takes cols', () => {
    const { box } = show([{ type: 'kv', pairs: {}, cols: 3 }])
    expect(box.querySelector('.vui-kv')?.getAttribute('data-vui-cols')).toBe('3')
  })

  it('falls back when cols is out of range', () => {
    const { box } = show([{ type: 'kv', pairs: {}, cols: 9 }])
    expect(box.querySelector('.vui-kv')?.getAttribute('data-vui-cols')).toBe('1')
  })

  it('reports a bad value at its own pointer', () => {
    const { handle } = show([{ type: 'kv', pairs: [['a', 'x', 'num']] }])
    expect(handle.diagnostics.map(({ path }) => path)).toContain('/body/0/pairs/0/1')
  })

  it('escapes an object key in the pointer it reports', () => {
    const { handle } = show([{ type: 'kv', pairs: { 'a/b': { x: 1 } } }])
    expect(handle.diagnostics.map(({ path }) => path)).toContain('/body/0/pairs/a~1b')
  })
})

describe('stats', () => {
  const tiles = (item: object) =>
    show([{ type: 'stats', items: [{ label: 'L', value: 1, ...item }] }]).box

  it('draws a label and a formatted value', () => {
    const box = tiles({ label: 'Hit rate', value: 0.93, format: 'pct' })
    expect(texts(box, 'dt')).toEqual(['Hit rate'])
    expect(box.querySelector('.vui-stat-value')?.textContent).toBe('93.0%')
  })

  it('draws a delta in the default delta format, with its sign', () => {
    const box = tiles({ delta: 4 })
    expect(box.querySelector('.vui-stat-delta')?.textContent).toBe('+4')
    expect(box.querySelector('.vui-stat-delta .vui-tone-ok')).not.toBeNull()
  })

  it('takes a deltaFormat', () => {
    const box = tiles({ delta: -0.01, deltaFormat: 'delta:pct' })
    expect(box.querySelector('.vui-stat-delta')?.textContent).toBe('−1.0%')
  })

  it('flips the tone of a falling delta for better low (VD-220)', () => {
    const low = tiles({ delta: -14, deltaFormat: 'delta:ms', better: 'low' })
    expect(low.querySelector('.vui-stat-delta')?.textContent).toBe('−14 ms')
    expect(low.querySelector('.vui-stat-delta .vui-tone-ok')).not.toBeNull()
    expect(tiles({ delta: -14 }).querySelector('.vui-stat-delta .vui-tone-err')).not.toBeNull()
    expect(tiles({ delta: -14, better: 'high' }).querySelector('.vui-tone-err')).not.toBeNull()
  })

  it('gives a non-delta deltaFormat no tone, whatever better says', () => {
    const box = tiles({ delta: -0.1, deltaFormat: 'pct', better: 'low' })
    expect(box.querySelector('.vui-stat-delta')?.textContent).toBe('-10.0%')
    expect(box.querySelector('.vui-stat-delta [class*="vui-tone-"]')).toBeNull()
  })

  it('draws no delta when there is none', () => {
    expect(tiles({}).querySelector('.vui-stat-delta')).toBeNull()
  })

  it('draws a delta of 0', () => {
    expect(tiles({ delta: 0 }).querySelector('.vui-stat-delta')).not.toBeNull()
  })

  it('marks a tone without relying on color', () => {
    const box = tiles({ tone: 'err' })
    const tile = box.querySelector('.vui-stat') as HTMLElement
    expect(tile.classList.contains('vui-tone-err')).toBe(true)
    expect(tile.querySelector('dt .vui-sr-only')?.textContent).toBe('error')
    expect(tile.querySelector(':scope > span')).toBeNull()
  })

  it('draws no mark for a tone with no meaning', () => {
    const box = tiles({ tone: 'muted' })
    expect(box.querySelector('.vui-stat.vui-tone-muted')).not.toBeNull()
    expect(box.querySelector('.vui-stat .vui-sr-only')).toBeNull()
  })

  it('draws a spark as one line, the same path a spark chart draws', () => {
    const box = tiles({ spark: [10, 15, 20] })
    const { box: chart } = show([{ type: 'chart', kind: 'spark', values: [10, 15, 20] }])
    const path = box.querySelector('.vui-spark path')?.getAttribute('d')
    expect(path).toBe('M0 23L50 12L100 1')
    expect(chart.querySelector('path[data-vui-series]')?.getAttribute('d')).toBe(path)
  })

  it('describes a spark in words', () => {
    const box = tiles({ spark: [1200, 15, 20] })
    const label = box.querySelector('.vui-spark')?.getAttribute('aria-label')
    expect(box.querySelector('.vui-spark')?.getAttribute('role')).toBe('img')
    expect(label).toBe('Trend, 3 points, from 1,200 to 20')
  })

  it('counts one point in the singular', () => {
    const label = tiles({ spark: [5] })
      .querySelector('.vui-spark')
      ?.getAttribute('aria-label')
    expect(label).toBe('Trend, 1 point, from 5 to 5')
  })

  it('sets a flat spark at mid height', () => {
    const path = tiles({ spark: [5, 5] })
      .querySelector('.vui-spark path')
      ?.getAttribute('d')
    expect(path).toBe('M0 12L100 12')
  })

  it('keeps a long spark to what a line can show', () => {
    const box = tiles({ spark: Array.from({ length: 5000 }, (_, index) => index) })
    const path = box.querySelector('.vui-spark path')?.getAttribute('d')
    expect(path?.match(/L/g)).toHaveLength(999)
    expect(box.querySelector('.vui-spark')?.getAttribute('aria-label')).toContain('5,000 points')
  })

  it('skips an empty spark', () => {
    expect(tiles({ spark: [] }).querySelector('.vui-spark')).toBeNull()
  })

  it('skips an item that is not an object', () => {
    // Only VD-066's cap lets this through, so the component is called directly.
    const context = { pointer: '', value: () => [], format: () => ({ text: '' }) } as never
    const tiles = stats.render({ items: [7, { label: 'L', value: 1 }] }, context) as HTMLElement
    expect(all(tiles, '.vui-stat')).toHaveLength(1)
  })
})

describe('list', () => {
  it('is a ul by default, with inline text', () => {
    const { box } = show([{ type: 'list', items: ['**a**', 'b'] }])
    expect(box.querySelector('ul.vui-list strong')?.textContent).toBe('a')
    expect(texts(box, 'li')).toEqual(['a', 'b'])
  })

  it('is an ol when ordered', () => {
    const { box } = show([{ type: 'list', ordered: true, items: ['a'] }])
    expect(box.querySelector('ol.vui-list li')).not.toBeNull()
  })

  it('leads an item with an icon and a label for its status', () => {
    const { box } = show([{ type: 'list', items: [{ text: 'Build', status: 'ok' }] }])
    expect(box.querySelector('li .vui-status-icon')?.textContent).toBe('✓')
    expect(box.querySelector('li .vui-status-label')?.textContent).toBe('ok')
  })

  it('takes a note', () => {
    const { box } = show([{ type: 'list', items: [{ text: 'a', note: '*why*' }] }])
    expect(box.querySelector('li .vui-note em')?.textContent).toBe('why')
  })

  it('draws no badge for an item without a status', () => {
    const { box } = show([{ type: 'list', items: [{ text: 'a' }] }])
    expect(box.querySelector('.vui-list .vui-status')).toBeNull()
  })

  it('draws no badge for a dropped status', () => {
    const { box } = show([{ type: 'list', items: [{ text: 'a', status: 'nope' }] }])
    expect(box.querySelector('.vui-list .vui-status')).toBeNull()
    expect(texts(box, '.vui-list li')).toEqual(['a'])
  })
})

describe('progress', () => {
  const progress = (fields: object) => show([{ type: 'progress', ...fields }]).box
  const bar = (box: HTMLElement) => box.querySelector('[role="progressbar"]') as HTMLElement

  it('says the value in the words the text renderer uses', () => {
    expect(progress({ value: 42 }).querySelector('.vui-progress-value')?.textContent).toBe(
      '42 of 100 (42%)',
    )
  })

  it('fills to the sum of segments when there is no max (VD-223)', () => {
    const box = progress({
      value: 6,
      segments: [
        { value: 6, tone: 'ok', label: 'Pass' },
        { value: 3, tone: 'err', label: 'Fail' },
        { value: 1, tone: 'muted', label: 'Skip' },
      ],
    })
    expect(bar(box).getAttribute('aria-valuemax')).toBe('10')
    const fills = [...box.querySelectorAll('.vui-track .vui-fill')]
    expect(fills.map((fill) => fill.getAttribute('data-vui-fill'))).toEqual(['60', '30', '10'])
  })

  it('is a progressbar with its range', () => {
    const element = bar(progress({ value: 3, max: 4, label: 'Done' }))
    expect(element.getAttribute('aria-valuenow')).toBe('3')
    expect(element.getAttribute('aria-valuemin')).toBe('0')
    expect(element.getAttribute('aria-valuemax')).toBe('4')
    expect(element.getAttribute('aria-label')).toBe('Done')
  })

  it('names a progressbar with no label', () => {
    expect(bar(progress({ value: 3 })).getAttribute('aria-label')).toBe('Progress')
  })

  it('shows the label', () => {
    expect(
      progress({ value: 3, label: 'Done' }).querySelector('.vui-progress-label')?.textContent,
    ).toBe('Done')
  })

  it('scales the fill to max', () => {
    expect(fills(progress({ value: 3, max: 4 }))).toEqual(['75'])
  })

  it('clamps what it tells assistive tech', () => {
    expect(bar(progress({ value: 150 })).getAttribute('aria-valuenow')).toBe('100')
    expect(bar(progress({ value: -5 })).getAttribute('aria-valuenow')).toBe('0')
  })

  it('leaves the percent and range out when max is not positive', () => {
    const box = progress({ value: 3, max: 0 })
    expect(box.querySelector('.vui-progress-value')?.textContent).toBe('3 of 0')
    expect(bar(box).hasAttribute('aria-valuenow')).toBe(false)
    expect(fills(box)).toEqual(['0'])
  })

  const segments = [
    { value: 60, tone: 'ok', label: 'Passed' },
    { value: 10, tone: 'err', label: 'Failed' },
  ]

  it('draws one fill per segment, on its tone', () => {
    const box = progress({ value: 70, max: 100, segments })
    expect(fills(box)).toEqual(['60', '10'])
    expect(all(bar(box), '.vui-fill.vui-tone-err')).toHaveLength(1)
  })

  it('lists segments with a mark, a label and a value', () => {
    const box = progress({ value: 70, segments })
    expect(texts(box, '.vui-legend-label')).toEqual(['Passed', 'Failed'])
    expect(texts(box, '.vui-legend-value')).toEqual(['60', '10'])
    expect(texts(box, '.vui-legend .vui-sr-only')).toEqual(['ok', 'error'])
  })

  it('scales segments that pass max to their sum', () => {
    const over = [
      { value: 150, tone: 'ok', label: 'a' },
      { value: 50, tone: 'err', label: 'b' },
    ]
    expect(fills(progress({ value: 200, segments: over }))).toEqual(['75', '25'])
  })

  it('skips a segment that is not an object', () => {
    expect(fills(progress({ value: 1, max: 100, segments: [1, segments[0]] }))).toEqual(['60'])
  })
})

it('never sets a style attribute', () => {
  const { box } = show([
    { type: 'stats', items: [{ label: 'L', value: 1, spark: [1, 2] }] },
    { type: 'progress', value: 3, segments: [{ value: 1, tone: 'ok', label: 'a' }] },
  ])
  expect(box.querySelector('[style]')).toBeNull()
})
