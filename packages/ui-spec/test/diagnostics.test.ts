import { describe, expect, it } from 'vitest'
import {
  type DiagnosticCode,
  DiagnosticLog,
  isLimitCode,
  LIMIT_CODES,
  MAX_DIAGNOSTICS,
  MAX_MESSAGE,
  makeDiagnostic,
  quote,
  SCHEMA_CODES,
  type Severity,
} from '../src/diagnostics.js'
import { LIMITS } from '../src/limits.js'

describe('makeDiagnostic', () => {
  it('builds the §13.2 shape and leaves out an absent hint', () => {
    const plain = makeDiagnostic('error', '/body/0', 'unknown-type', 'unknown type "x"')
    expect(plain).toEqual({
      severity: 'error',
      path: '/body/0',
      code: 'unknown-type',
      message: 'unknown type "x"',
    })
    expect(Object.keys(plain)).not.toContain('hint')
    const hinted = makeDiagnostic('warn', '', 'bad-enum', 'm', 'did you mean "a"?')
    expect(hinted.hint).toBe('did you mean "a"?')
  })

  it('clips a long message to the limit', () => {
    const { message } = makeDiagnostic('info', '', 'unknown-field', 'x'.repeat(500))
    expect(message).toHaveLength(MAX_MESSAGE)
    expect(MAX_MESSAGE).toBe(120)
    expect(message.endsWith('…')).toBe(true)
  })
})

describe('quote', () => {
  it('quotes short text and clips long text', () => {
    expect(quote('tabel')).toBe('"tabel"')
    expect(quote('x'.repeat(100))).toBe(`"${'x'.repeat(29)}…"`)
  })
})

describe('codes', () => {
  it('has a stable code per §13.4 limit', () => {
    expect([...LIMIT_CODES].sort()).toEqual([
      'limit-canonical-size',
      'limit-chart-points',
      'limit-chart-series',
      'limit-depth',
      'limit-flow-nodes',
      'limit-input-size',
      'limit-nodes',
      'limit-string',
      'limit-table-columns',
      'limit-table-rows',
    ])
    for (const code of LIMIT_CODES) expect(isLimitCode(code)).toBe(true)
  })

  it('does not call other codes limits', () => {
    const others: DiagnosticCode[] = ['parse-error', 'row-arity', 'unknown-field']
    for (const code of others) expect(isLimitCode(code)).toBe(false)
    expect(isLimitCode('constructor')).toBe(false)
  })

  it('keeps limits and schema codes apart', () => {
    for (const code of SCHEMA_CODES) expect(isLimitCode(code)).toBe(false)
  })
})

describe('LIMITS', () => {
  it('holds the §13.4 values', () => {
    expect(LIMITS).toEqual({
      inputBytes: 262_144,
      depth: 12,
      nodes: 400,
      tableRows: 5_000,
      tableColumns: 30,
      chartPoints: 10_000,
      chartSeries: 12,
      longString: 20_000,
      string: 2_000,
      flowNodes: 40,
    })
  })
})

describe('DiagnosticLog past its cap', () => {
  const fill = (log: DiagnosticLog, severity: Severity, count: number) => {
    for (let i = 0; i < count; i++) {
      if (log.wants(severity, 'bad-enum')) {
        log.add(makeDiagnostic(severity, `/${i}`, 'bad-enum', 'x'))
      }
    }
  }

  it('still takes an error once warnings filled it', () => {
    const log = new DiagnosticLog()
    fill(log, 'warn', MAX_DIAGNOSTICS + 5)
    fill(log, 'error', 1)
    expect(log.finish().filter(({ severity }) => severity === 'error')).toHaveLength(1)
  })

  it('still bounds errors', () => {
    const log = new DiagnosticLog()
    fill(log, 'error', MAX_DIAGNOSTICS * 3)
    expect(log.finish().length).toBeLessThanOrEqual(MAX_DIAGNOSTICS * 2 + 1)
  })
})
