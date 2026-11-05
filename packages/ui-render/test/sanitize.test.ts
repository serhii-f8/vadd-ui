import { describe, expect, it } from 'vitest'
import { MAX_VALUES, sanitize } from '../src/sanitize.js'

const value = (input: unknown) => sanitize(input).value

describe('sanitize', () => {
  it('copies JSON through', () => {
    const input = { a: [1, 'x', null, true, { b: 2 }] }
    expect(value(input)).toEqual(input)
    expect(value(input)).not.toBe(input)
    expect(sanitize(input).diagnostics).toEqual([])
  })

  it('breaks a cycle where it closes', () => {
    const input: Record<string, unknown> = { a: 1 }
    input.self = input
    const { value: copy, diagnostics } = sanitize(input)
    expect(copy).toEqual({ a: 1, self: null })
    expect(diagnostics).toEqual([expect.objectContaining({ severity: 'warn', path: '/self' })])
  })

  it('keeps a shared reference that is no cycle', () => {
    const shared = { x: 1 }
    expect(value({ a: shared, b: shared })).toEqual({ a: { x: 1 }, b: { x: 1 } })
  })

  it('drops functions, symbols and undefined from objects, like JSON', () => {
    expect(value({ a: () => 1, b: Symbol('s'), c: undefined, d: 1 })).toEqual({ d: 1 })
  })

  it('nulls them in arrays, like JSON', () => {
    expect(value([() => 1, undefined, Symbol('s')])).toEqual([null, null, null])
  })

  it.each([
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [10n, null],
  ])('replaces %s and warns', (input, expected) => {
    const { value: copy, diagnostics } = sanitize({ a: input })
    expect(copy).toEqual({ a: expected })
    expect(diagnostics[0]?.path).toBe('/a')
  })

  it('writes a Date as ISO text', () => {
    expect(value({ at: new Date(0) })).toEqual({ at: '1970-01-01T00:00:00.000Z' })
    expect(value({ at: new Date(Number.NaN) })).toEqual({ at: null })
  })

  it('survives a throwing getter', () => {
    const input = {
      get bad(): number {
        throw new Error('no')
      },
      good: 1,
    }
    const { value: copy, diagnostics } = sanitize(input)
    expect(copy).toEqual({ good: 1 })
    expect(diagnostics[0]?.path).toBe('/bad')
  })

  it('survives a hostile proxy', () => {
    const input = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no')
        },
      },
    )
    expect(value({ a: input })).toEqual({ a: null })
  })

  it('keeps __proto__ as data', () => {
    const copy = value(JSON.parse('{"__proto__":{"polluted":true}}')) as object
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype)
    expect(Object.keys(copy)).toEqual(['__proto__'])
  })

  it('stops at the nesting cap', () => {
    let input: unknown = 1
    for (let index = 0; index < 100_000; index += 1) input = [input]
    const { diagnostics } = sanitize(input)
    expect(diagnostics[0]?.code).toBe('limit-depth')
  })

  it('stops a shared-subtree explosion', () => {
    let input: unknown = [1]
    for (let index = 0; index < 100; index += 1) input = [input, input]
    const started = performance.now()
    const { diagnostics } = sanitize(input)
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'limit-input-size')).toBe(true)
  })

  it('stops a huge sparse array', () => {
    const copy = value(new Array(4_000_000_000)) as unknown[]
    expect(copy.length).toBeLessThanOrEqual(MAX_VALUES)
  })

  it('caps its warnings', () => {
    const { diagnostics } = sanitize(Array.from({ length: 1_000 }, () => Number.NaN))
    expect(diagnostics.length).toBeLessThanOrEqual(21)
  })

  it('returns null for a non-JSON root', () => {
    expect(value(undefined)).toBeNull()
  })
})

describe('sanitize: binary views', () => {
  it('replaces a typed array without listing its keys', () => {
    const { value: copy, diagnostics } = sanitize({ a: new Uint8Array(3e7) })
    expect(copy).toEqual({ a: null })
    expect(diagnostics[0]?.path).toBe('/a')
  })
})
