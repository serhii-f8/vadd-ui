import type { Diagnostic } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { formatDiagnostics, safe, safeJson } from '../src/print.js'

const error = (path: string, message: string, hint?: string): Diagnostic => ({
  severity: 'error',
  path,
  code: 'bad-type',
  message,
  ...(hint === undefined ? {} : { hint }),
})
const warn = (path: string, message: string): Diagnostic => ({
  severity: 'warn',
  path,
  code: 'bad-enum',
  message,
})
const info = (path: string, message: string): Diagnostic => ({
  severity: 'info',
  path,
  code: 'unknown-field',
  message,
})

describe('safe', () => {
  it('leaves plain text alone', () => {
    expect(safe('/body/2: expected 3 cells — got 2 ✓')).toBe('/body/2: expected 3 cells — got 2 ✓')
  })

  it.each([
    ['ESC', '\x1b[2J', '\\u001b[2J'],
    ['newline', 'a\nb', 'a\\u000ab'],
    ['carriage return', 'a\rb', 'a\\u000db'],
    ['C1 CSI', '\x9b2J', '\\u009b2J'],
    ['DEL', '\x7f', '\\u007f'],
    ['line separator', ' ', '\\u2028'],
    ['paragraph separator', ' ', '\\u2029'],
    ['bidi override', '‮', '\\u202e'],
  ])('escapes %s', (_, input, expected) => {
    expect(safe(input)).toBe(expected)
  })
})

describe('safeJson', () => {
  it('matches JSON.stringify on plain values', () => {
    const value = { a: ['</', '\n', ' ', 'é'], b: 1 }
    expect(safeJson(value)).toBe(JSON.stringify(value))
  })

  it('writes C1 controls so no terminal sees them, as the same value', () => {
    const value = { a: '\x9b2J\x7f\x85' }
    const text = safeJson(value)
    expect(text).toBe('{"a":"\\u009b2J\\u007f\\u0085"}')
    expect(JSON.parse(text)).toEqual(value)
  })
})

describe('formatDiagnostics', () => {
  it('prints the §11.3 lines', () => {
    expect(
      formatDiagnostics([
        error('/body/2/rows/4', 'expected 3 cells, got 2'),
        error('/body/0', 'unknown type "tabel"', 'did you mean "table"?'),
        warn('/body/1/items/0/status', '"passed" is not a status; use ok|fail'),
      ]),
    ).toBe(
      'error /body/2/rows/4: expected 3 cells, got 2\n' +
        'error /body/0: unknown type "tabel" (did you mean "table"?)\n' +
        'warn  /body/1/items/0/status: "passed" is not a status; use ok|fail\n',
    )
  })

  it('prints nothing for no diagnostics', () => {
    expect(formatDiagnostics([])).toBe('')
  })

  it('leaves out the path of the document root', () => {
    expect(formatDiagnostics([error('', 'line 1, column 1: bad')])).toBe(
      'error: line 1, column 1: bad\n',
    )
    expect(formatDiagnostics([warn('', 'bad')])).toBe('warn: bad\n')
  })

  it('stays silent on info unless asked', () => {
    const list = [info('/a', 'unknown field')]
    expect(formatDiagnostics(list)).toBe('')
    expect(formatDiagnostics(list, { info: true })).toBe('info  /a: unknown field\n')
  })

  it('prints exactly 20 lines with no count', () => {
    const list = Array.from({ length: 20 }, (_, i) => error(`/${i}`, 'x'))
    expect(formatDiagnostics(list).trimEnd().split('\n')).toHaveLength(20)
  })

  it('prints 20 lines and a count of the rest', () => {
    const list = Array.from({ length: 21 }, (_, i) => error(`/${i}`, 'x'))
    const lines = formatDiagnostics(list).trimEnd().split('\n')
    expect(lines).toHaveLength(21)
    expect(lines[19]).toBe('error /19: x')
    expect(lines[20]).toBe('and 1 more')
  })

  it('puts errors first, so warnings cannot hide one', () => {
    const list = [...Array.from({ length: 30 }, (_, i) => warn(`/${i}`, 'w')), error('/e', 'bad')]
    const lines = formatDiagnostics(list).trimEnd().split('\n')
    expect(lines[0]).toBe('error /e: bad')
    expect(lines[1]).toBe('warn  /0: w')
    expect(lines[20]).toBe('and 11 more')
  })

  it('adds what ui-spec left out to the count', () => {
    const list: Diagnostic[] = [
      ...Array.from({ length: 22 }, (_, i) => error(`/${i}`, 'x')),
      { ...error('', '5000 more diagnostics were left out'), code: 'too-many-diagnostics' },
    ]
    const lines = formatDiagnostics(list).trimEnd().split('\n')
    expect(lines).toHaveLength(21)
    expect(lines[20]).toBe('and 5002 more')
  })

  it('counts a left-out note with no other overflow', () => {
    const list: Diagnostic[] = [
      error('/0', 'x'),
      { ...error('', '7 more diagnostics were left out'), code: 'too-many-diagnostics' },
    ]
    expect(formatDiagnostics(list)).toBe('error /0: x\nand 7 more\n')
  })

  it('escapes a raw path, message and hint', () => {
    const line = formatDiagnostics([error('/a\nb\x1b[2J', 'm\x1b', 'h\x9b')])
    expect(line).toBe('error /a\\u000ab\\u001b[2J: m\\u001b (h\\u009b)\n')
  })
})
