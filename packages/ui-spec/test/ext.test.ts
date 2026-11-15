import { describe, expect, it } from 'vitest'
import { compareBest, compareWinner, usesExt } from '../src/index.js'

describe('usesExt', () => {
  it('finds an ext node however deep it nests', () => {
    const doc = {
      body: [
        { type: 'tabs', tabs: [{ label: 'a', children: [{ type: 'compare', options: [] }] }] },
      ],
    }
    expect(usesExt(doc)).toBe(true)
    expect(usesExt({ body: [{ type: 'flow', nodes: [], edges: [] }] })).toBe(true)
    expect(usesExt({ body: [{ type: 'chart', kind: 'scatter', points: [] }] })).toBe(true)
  })

  it('is false for core documents and non-objects', () => {
    expect(usesExt({ body: [{ type: 'chart', kind: 'bar', x: [], series: {} }] })).toBe(false)
    expect(usesExt({ body: [{ type: 'md', text: 'flow' }] })).toBe(false)
    expect(usesExt(null)).toBe(false)
    expect(usesExt('compare')).toBe(false)
  })

  it('walks very deep values without recursion', () => {
    let deep: unknown = { type: 'flow' }
    for (let index = 0; index < 20_000; index += 1) deep = [deep]
    expect(usesExt(deep)).toBe(true)
  })
})

describe('compareBest', () => {
  it('marks every option that ties for the best', () => {
    expect([...compareBest([80, 120, 80], 'low', 3)]).toEqual([0, 2])
    expect([...compareBest([80, 120, 80], 'high', 3)]).toEqual([1])
  })

  it('ignores values that are not finite numbers, and values past the options', () => {
    expect([...compareBest(['x', 3, null, true, 9], 'high', 4)]).toEqual([1])
    expect([...compareBest(['x'], 'high', 1)]).toEqual([])
  })

  it('marks nothing without a direction', () => {
    expect(compareBest([1, 2], undefined, 2).size).toBe(0)
    expect(compareBest([1, 2], 'up', 2).size).toBe(0)
    expect(compareBest('nope', 'high', 2).size).toBe(0)
  })
})

describe('compareWinner', () => {
  const criteria = [
    { label: 'a', values: [1, 2], better: 'low' },
    { label: 'b', values: [5, 3], better: 'high' },
    { label: 'c', values: [9, 1] },
  ]

  it('takes a valid pick', () => {
    expect(compareWinner({ options: ['x', 'y'], criteria, pick: 1 })).toBe(1)
  })

  it('computes the winner from the best cells when pick is absent or out of range', () => {
    expect(compareWinner({ options: ['x', 'y'], criteria })).toBe(0)
    expect(compareWinner({ options: ['x', 'y'], criteria, pick: 9 })).toBe(0)
    expect(compareWinner({ options: ['x', 'y'], criteria, pick: 0.5 })).toBe(0)
  })

  it('counts wins over more options than an argument list may hold', () => {
    const options = Array.from({ length: 300_000 }, () => '')
    const values = options.map((_, index) => (index === 7 ? 0 : 1))
    expect(compareWinner({ options, criteria: [{ values, better: 'low' }] })).toBe(7)
  })

  it('has no winner on a tie or without directions', () => {
    const tie = [
      { label: 'a', values: [1, 2], better: 'low' },
      { label: 'b', values: [1, 2], better: 'high' },
    ]
    expect(compareWinner({ options: ['x', 'y'], criteria: tie })).toBeUndefined()
    expect(compareWinner({ options: ['x', 'y'], criteria: [{ values: [1, 2] }] })).toBeUndefined()
    expect(compareWinner({ options: 'x', criteria: 'y' })).toBeUndefined()
  })
})

describe('usesExt on wide values', () => {
  it('scans a list longer than an argument list may be', () => {
    const points = Array.from({ length: 300_000 }, (_, index) => index)
    expect(usesExt({ body: [{ type: 'chart', kind: 'line', x: points }, { type: 'flow' }] })).toBe(
      true,
    )
  })
})
