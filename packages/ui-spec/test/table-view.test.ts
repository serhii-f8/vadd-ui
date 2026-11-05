import { describe, expect, it } from 'vitest'
import { formatValue } from '../src/format.js'
import { alignOf, badgeOf, groupKey, parseRow, sortRows } from '../src/table-view.js'
import type { Column } from '../src/types.js'

const column = (fields: Partial<Column> = {}): Column => ({ key: 'k', label: 'K', ...fields })
const columns = [column({ key: 'a' }), column({ key: 'b' })]
const rows = (...values: unknown[][]) =>
  values.map((row, index) => parseRow(row as never, index, columns))
const firsts = (list: ReturnType<typeof rows>) => list.map(({ cells }) => cells[0])

describe('parseRow', () => {
  it('reads cells and keeps the source index', () => {
    expect(parseRow([1, 2], 7, columns)).toEqual({ cells: [1, 2], options: {}, index: 7 })
  })

  it('takes a trailing object as row options', () => {
    const row = parseRow([1, 2, { tone: 'warn' }], 0, columns)
    expect(row.cells).toEqual([1, 2])
    expect(row.options).toEqual({ tone: 'warn' })
  })

  it.each([[5], [{ a: 1 }], [null]])('reads %j as an empty row', (row) => {
    expect(parseRow(row, 0, columns)).toEqual({ cells: [], options: {}, index: 0 })
  })

  it('cuts cells past the last column', () => {
    expect(parseRow([1, 2, 3, 4], 0, columns).cells).toEqual([1, 2])
  })

  it('finds options past surplus cells', () => {
    expect(parseRow([1, 2, 3, { note: 'n' }], 0, columns).options).toEqual({ note: 'n' })
  })
})

describe('sortRows (VD-055)', () => {
  const sort = (list: unknown[][], direction: 'asc' | 'desc', cols = columns) =>
    firsts(sortRows(rows(...list), cols, [0, direction], 'en-US'))

  it('compares numbers numerically', () => {
    expect(sort([[10], [9], [100]], 'asc')).toEqual([9, 10, 100])
  })

  it('reverses for desc', () => {
    expect(sort([[10], [9], [100]], 'desc')).toEqual([100, 10, 9])
  })

  it('puts numbers before strings, reversed by desc', () => {
    expect(sort([['b'], [1]], 'asc')).toEqual([1, 'b'])
    expect(sort([['b'], [1]], 'desc')).toEqual(['b', 1])
  })

  it('keeps empty cells last in both directions', () => {
    expect(sort([[null], [1], [2]], 'asc')).toEqual([1, 2, null])
    expect(sort([[null], [1], [2]], 'desc')).toEqual([2, 1, null])
  })

  it('compares inline-free text in the default format', () => {
    expect(sort([['**b**'], ['a'], ['c']], 'asc')).toEqual(['a', '**b**', 'c'])
  })

  it('compares raw strings under another format', () => {
    const coded = [column({ key: 'a', format: 'code' })]
    expect(sort([['a'], ['**b**']], 'asc', coded)).toEqual(['**b**', 'a'])
  })

  it('is stable', () => {
    const list = sortRows(rows([1, 'x'], [1, 'y'], [0, 'z']), columns, [0, 'asc'], 'en-US')
    expect(list.map(({ cells }) => cells[1])).toEqual(['z', 'x', 'y'])
  })

  it('leaves rows alone for a sort past the last column', () => {
    expect(firsts(sortRows(rows([2], [1]), columns, [5, 'asc'], 'en-US'))).toEqual([2, 1])
  })

  it('leaves rows alone for no sort', () => {
    expect(firsts(sortRows(rows([2], [1]), columns, undefined, 'en-US'))).toEqual([2, 1])
  })

  it('leaves rows alone for a malformed sort', () => {
    expect(firsts(sortRows(rows([2], [1]), columns, 'x' as never, 'en-US'))).toEqual([2, 1])
  })

  it('survives an invalid locale', () => {
    expect(firsts(sortRows(rows(['b'], ['a']), columns, [0, 'asc'], 'x!'))).toEqual(['a', 'b'])
  })
})

describe('alignOf (VD-055)', () => {
  it('honors an explicit align', () => {
    const list = [parseRow([1], 0, columns)]
    expect(alignOf(column({ align: 'center', format: 'num' }), 0, list)).toBe('center')
  })

  it('right-aligns a numeric format', () => {
    expect(alignOf(column({ format: 'ms' }), 0, [])).toBe('right')
  })

  it('left-aligns another format, even over numbers', () => {
    expect(alignOf(column({ format: 'code' }), 0, rows([1]))).toBe('left')
  })

  it('right-aligns an unformatted column of numbers, past empty cells', () => {
    expect(alignOf(column(), 0, rows([1], [null], [2]))).toBe('right')
  })

  it('left-aligns a column with any string or none at all', () => {
    expect(alignOf(column(), 0, rows([1], ['a']))).toBe('left')
    expect(alignOf(column(), 0, rows([null]))).toBe('left')
  })
})

describe('groupKey', () => {
  it('tells values apart, and takes a missing cell for null', () => {
    expect(groupKey(1)).not.toBe(groupKey('1'))
    expect(groupKey(undefined)).toBe(groupKey(null))
  })
})

describe('badgeOf', () => {
  const badge = (value: string, fields: Partial<Column>) =>
    badgeOf(column({ cell: 'badge', ...fields }), formatValue(value, fields.format))

  it('takes a tone from the map', () => {
    expect(badge('high', { tones: { high: 'err' } })).toEqual({ tone: 'err' })
  })

  it('takes a status from the format', () => {
    expect(badge('ok', { format: 'status' })).toEqual({ status: 'ok' })
  })

  it('takes a status from the raw word', () => {
    expect(badge('fail', {})).toEqual({ status: 'fail' })
  })

  it('lets the map beat a status word', () => {
    expect(badge('ok', { tones: { ok: 'warn' } })).toEqual({ tone: 'warn' })
  })

  it('gives neither for an unknown word', () => {
    expect(badge('other', {})).toEqual({})
  })

  it('reads no inherited key from the map', () => {
    expect(badge('constructor', { tones: {} })).toEqual({})
  })

  it('gives nothing outside a badge cell', () => {
    expect(badgeOf(column(), formatValue('ok', undefined))).toEqual({})
  })
})
