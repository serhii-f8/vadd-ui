import { describe, expect, it } from 'vitest'
import { inspect, validate } from '../src/index.js'

describe('inspect', () => {
  const input = [{ type: 'table', columns: ['a'], rows: [[1, 2, 3]] }, 'text']

  it('gives what validate gives', () => {
    const { ok, diagnostics, document } = inspect(input)
    expect({ ok, diagnostics, document }).toEqual(validate(input))
  })

  it('locates issues by canonical pointer, and diagnostics by input pointer', () => {
    const { issues, diagnostics } = inspect({ type: 'nope' })
    expect(issues).toEqual([
      expect.objectContaining({ pointer: '/body/0', code: 'unknown-type', severity: 'error' }),
    ])
    expect(diagnostics[0]?.path).toBe('')
  })

  it('keeps the path map', () => {
    expect(inspect('x' as never).paths.toInput('/vui')).toBe('')
    expect(inspect(['x']).paths.toInput('/body/0/text')).toBe('/0')
  })

  it('keeps every issue past the diagnostic cap', () => {
    const rows = Array.from({ length: 1_500 }, () => [1, 2, 3])
    const { issues, diagnostics } = inspect({ type: 'table', columns: ['a'], rows })
    expect(issues.filter((issue) => issue.code === 'row-arity')).toHaveLength(1_500)
    expect(diagnostics.length).toBeLessThanOrEqual(1_001)
  })
})
