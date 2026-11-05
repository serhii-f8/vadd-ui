import { describe, expect, it } from 'vitest'
import { stylesheet } from '../src/css/index.js'
import { fillOf, fillShares } from '../src/fill.js'

describe('fillOf', () => {
  it.each([
    [50, 100, 50],
    [1, 3, 33],
    [0, 100, 0],
    [100, 100, 100],
    [150, 100, 100],
  ])('%d of %d is %d', (value, scale, fill) => {
    expect(fillOf(value, scale)).toBe(fill)
  })

  it('never rounds a positive value away', () => {
    expect(fillOf(0.1, 100)).toBe(1)
  })

  it('never rounds an unfinished value up to full', () => {
    expect(fillOf(99.9, 100)).toBe(99)
  })

  it.each([
    [-1, 100],
    [Number.NaN, 100],
    [5, 0],
    [5, -1],
    [5, Number.POSITIVE_INFINITY],
    [Number.POSITIVE_INFINITY, 100],
  ])('%d of %d is empty', (value, scale) => {
    expect(fillOf(value, scale)).toBe(0)
  })
})

describe('fillShares', () => {
  const sum = (list: number[]) => list.reduce((total, share) => total + share, 0)

  it('splits exactly', () => {
    expect(fillShares([50, 25], 100)).toEqual([50, 25])
  })

  it('sums to the rounded whole by largest remainder', () => {
    const shares = fillShares([1, 1, 1], 3)
    expect(sum(shares)).toBe(100)
    expect(shares).toEqual([34, 33, 33])
  })

  it('scales to the sum when segments pass the scale', () => {
    expect(fillShares([150, 50], 100)).toEqual([75, 25])
  })

  it('treats a bad segment as empty', () => {
    expect(fillShares([-5, 50, Number.NaN], 100)).toEqual([0, 50, 0])
  })

  it('is empty with no usable scale', () => {
    expect(fillShares([1, 2], 0)).toEqual([0, 0])
  })

  it('stays empty with nothing to fill', () => {
    expect(fillShares([], 100)).toEqual([])
    expect(fillShares([0, 0], 100)).toEqual([0, 0])
  })

  it('keeps a tiny positive segment visible', () => {
    const shares = fillShares([0.1, 99.9], 100)
    expect(shares[0]).toBeGreaterThanOrEqual(1)
    expect(sum(shares)).toBe(100)
  })

  it('never hands one share more than the whole', () => {
    expect(fillShares([0.1, 0.1, 99.8], 100).every((share) => share >= 1)).toBe(true)
  })
})

describe('the fill scale', () => {
  it.each([0, 1, 37, 100])('has a constant rule for %d', (fill) => {
    expect(stylesheet).toContain(`[data-vui-fill="${fill}"]{--vui-fill:${fill}%}`)
  })

  it('stops at 100', () => {
    expect(stylesheet).not.toContain('[data-vui-fill="101"]')
  })
})
