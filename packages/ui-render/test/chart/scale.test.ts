import { describe, expect, it } from 'vitest'
import { lttb, nearest, niceTicks } from '../../src/chart/scale.js'

const stepOf = (ticks: number[]) => (ticks[1] as number) - (ticks[0] as number)
const leading = (step: number) => Number(step.toExponential().split('e')[0])

describe('niceTicks', () => {
  it('uses round steps that cover the domain', () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(84, 180)).toEqual([80, 100, 120, 140, 160, 180])
  })

  it.each([
    [0, 1],
    [0, 7],
    [3, 97],
    [-13, 42],
    [0.001, 0.0173],
    [1234, 98765],
    [-5e9, 7e9],
    [0, 3.3],
    [99, 101],
  ])('stays on 1-2-5 with at most 6 ticks over %d to %d', (low, high) => {
    const ticks = niceTicks(low, high)
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect([1, 2, 5]).toContain(leading(Number(stepOf(ticks).toPrecision(6))))
    expect(ticks[0]).toBeLessThanOrEqual(low)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(high)
  })

  it('leaves no float noise in a tick', () => {
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3])
  })

  it.each([
    [1700000000001, 1700000000004],
    [1700000000001, 1700000000001.0002],
    [0.1 + 0.2, 0.3000000000000001],
    [-1e15, -1e15 + 2],
  ])('keeps ticks distinct and covering over %d to %d', (low, high) => {
    const ticks = niceTicks(low, high)
    expect(new Set(ticks).size).toBe(ticks.length)
    expect(ticks[0]).toBeLessThanOrEqual(low)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(high)
  })

  it('holds for a sweep of ranges', () => {
    let seed = 12345
    const next = () => {
      seed = (seed * 48271) % 2147483647
      return seed / 2147483647
    }
    for (let round = 0; round < 20_000; round += 1) {
      const center = (next() - 0.5) * 10 ** Math.floor(next() * 30 - 15)
      const low = center
      const high = center + next() * 10 ** Math.floor(next() * 30 - 15)
      const ticks = niceTicks(low, high)
      if (low === high) continue
      expect(ticks.length).toBeLessThanOrEqual(6)
      expect(new Set(ticks).size).toBe(ticks.length)
      expect(ticks[0]).toBeLessThanOrEqual(low)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(high)
    }
  })

  it('widens a flat domain', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1])
    const ticks = niceTicks(5, 5)
    expect(ticks[0]).toBeLessThan(5)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(5)
  })

  // Fuzzer, seed 12, index 30047: half of 5e-324 is 0, so the widening never widened.
  it.each([5e-324, -5e-324, 1e-323, -1e-323])('widens a flat domain at %d', (value) => {
    const ticks = niceTicks(value, value)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.every(Number.isFinite)).toBe(true)
    expect(ticks[0]).toBeLessThanOrEqual(value)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(value)
  })

  it.each([
    [-1.7e308, 1.7e308],
    [5e-324, 1e-323],
    [1e300, 1e300],
    [0, 1e308],
  ])('stays finite over %d to %d', (low, high) => {
    const ticks = niceTicks(low, high)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks.every(Number.isFinite)).toBe(true)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(ticks[0] as number)
  })
})

describe('lttb', () => {
  const xs = (count: number) => Array.from({ length: count }, (_, index) => index)

  it('keeps every finite point at or under the limit', () => {
    expect(lttb([0, 1, 2], [5, undefined, 7], 1000)).toEqual([0, 2])
  })

  it('returns exactly the limit past it, in order, with both ends', () => {
    const ys = xs(10_000).map((index) => Math.sin(index / 50))
    const kept = lttb(xs(10_000), ys, 1000)
    expect(kept).toHaveLength(1000)
    expect(kept[0]).toBe(0)
    expect(kept[999]).toBe(9999)
    expect(kept.every((value, index) => index === 0 || value > (kept[index - 1] as number))).toBe(
      true,
    )
  })

  it('keeps a lone peak that a stride would miss', () => {
    const ys = xs(5000).map((index) => (index === 2503 ? 1000 : 0))
    expect(lttb(xs(5000), ys, 100)).toContain(2503)
  })

  it('skips gaps and still keeps the limit', () => {
    const ys = xs(3000).map((index) => (index % 3 === 0 ? undefined : index))
    const kept = lttb(xs(3000), ys, 1000)
    expect(kept).toHaveLength(1000)
    expect(kept.every((index) => index % 3 !== 0)).toBe(true)
  })

  it('takes a limit too small to bucket', () => {
    expect(lttb(xs(5), xs(5), 2)).toEqual([0, 4])
  })
})

describe('nearest', () => {
  it('finds the closest position', () => {
    expect(nearest([0, 0.5, 1], 0.2)).toBe(0)
    expect(nearest([0, 0.5, 1], 0.3)).toBe(1)
    expect(nearest([0, 0.1, 1], 9)).toBe(2)
  })

  it('has no answer for nothing', () => {
    expect(nearest([], 0.5)).toBe(-1)
  })
})
