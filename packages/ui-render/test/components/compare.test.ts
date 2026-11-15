import { describe, expect, it } from 'vitest'
import { show, showExt } from '../helpers.js'

const compare = (fields: Record<string, unknown> = {}) =>
  showExt([
    {
      type: 'compare',
      options: ['Redis', 'LRU', 'None'],
      criteria: [
        { label: 'p95', values: [12, 8, 40], format: 'ms', better: 'low' },
        { label: 'Hit rate', values: [0.81, 0.92, 0], format: 'pct:0', better: 'high' },
        { label: 'Notes', values: ['ops', 'in-process', '—'] },
      ],
      ...fields,
    },
  ])
const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) =>
  all(box, selector).map((node) => node.textContent?.trim())

describe('compare (§6.3)', () => {
  it('is a table: options are columns, criteria are rows', () => {
    const { box, handle } = compare()
    expect(handle.diagnostics).toEqual([])
    expect(box.querySelector('.vui-card-placeholder')).toBeNull()
    expect(all(box, 'thead tr > *')).toHaveLength(4)
    const head = all(box, 'thead th')
    expect(head.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col'])
    expect(all(box, 'tbody tr')).toHaveLength(3)
    expect(all(box, 'tbody th[scope="row"]')).toHaveLength(3)
    expect(texts(box, 'tbody tr:first-child td')).toEqual(['12 ms', '8 ms best', '40 ms'])
  })

  it('marks the best value of each criterion with a direction, ties included', () => {
    const { box } = compare({
      criteria: [{ label: 'p95', values: [8, 12, 8], format: 'ms', better: 'low' }],
    })
    const cells = all(box, 'tbody td')
    expect(cells.map((td) => td.classList.contains('vui-compare-best'))).toEqual([
      true,
      false,
      true,
    ])
    expect(texts(box, '.vui-compare-best .vui-sr-only')).toEqual(['best', 'best'])
  })

  it('names the direction in the row header, in words for a screen reader', () => {
    const { box } = compare()
    const rows = texts(box, 'tbody th')
    expect(rows[0]).toBe('p95 ↓lower is better')
    expect(rows[1]).toBe('Hit rate ↑higher is better')
    expect(rows[2]).toBe('Notes')
  })

  it('crowns the computed winner when there is no pick', () => {
    const { box } = compare()
    const win = all(box, '.vui-compare-win')
    // The header and one cell per criterion, all in the LRU column.
    expect(win).toHaveLength(4)
    expect(win[0]?.textContent).toContain('LRU')
    expect(win[0]?.querySelector('.vui-pick')?.textContent).toBe('✓Pick')
    expect(all(box, 'tbody td.vui-compare-win').map((td) => td.cellIndex)).toEqual([2, 2, 2])
  })

  it('lets pick name the winner over the computed one', () => {
    const { box } = compare({ pick: 0 })
    expect(all(box, 'thead .vui-compare-win')[0]?.textContent).toContain('Redis')
  })

  it('crowns nobody on a tie or without directions', () => {
    const tie = compare({
      criteria: [
        { label: 'a', values: [1, 2, 3], better: 'low' },
        { label: 'b', values: [1, 2, 3], better: 'high' },
      ],
    })
    expect(all(tie.box, '.vui-compare-win')).toEqual([])
    const flat = compare({ criteria: [{ label: 'a', values: [1, 2, 3] }] })
    expect(all(flat.box, '.vui-compare-win, .vui-compare-best')).toEqual([])
  })

  it('shows a missing value as null and ignores extra values', () => {
    const { box, handle } = compare({
      criteria: [
        { label: 'p95', values: [5, 'n/a'], better: 'low' },
        { label: 'x', values: [1, 2, 3, 4, 5] },
      ],
    })
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(handle.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const first = all(box, 'tbody tr:first-child td')
    expect(first).toHaveLength(3)
    expect(first[0]?.classList.contains('vui-compare-best')).toBe(true)
    expect(first[1]?.textContent).toBe('n/a')
    expect(first[2]?.textContent).toBe('—')
    expect(all(box, 'tbody tr:nth-child(2) td')).toHaveLength(3)
  })

  it('draws its title as the caption, with inline markup', () => {
    const { box } = compare({ title: 'Cache **options**' })
    expect(box.querySelector('caption strong')?.textContent).toBe('options')
  })

  it('is a placeholder in the core build', () => {
    const { box } = show([{ type: 'compare', options: ['a'], criteria: [] }])
    expect(box.querySelector('.vui-card-placeholder')).not.toBeNull()
  })
})
