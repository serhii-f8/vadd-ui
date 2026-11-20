import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkFormat,
  checkValue,
  FORMAT_NAMES,
  type Formatted,
  formatValue,
  type JsonValue,
  parseFormat,
  parseInline,
  statDeltaFormat,
} from '../src/index.js'

const NB = '\u00a0'
const NOW = '2026-11-04T10:15:00Z'
const LOCALES = ['en-US', 'pl-PL', 'uk-UA'] as const

type Row = [value: JsonValue, format: string, enUS: string, plPL: string, ukUA: string]

function expectRows(rows: Row[]): void {
  for (const [value, format, ...expected] of rows) {
    LOCALES.forEach((locale, index) => {
      const result = formatValue(value, format, { locale, now: NOW })
      expect(result.issues, `${format} ${value} ${locale}`).toBeUndefined()
      expect(result.text, `${format} ${value} ${locale}`).toBe(expected[index])
    })
  }
}

function issueCodes(result: Formatted): string[] {
  return (result.issues ?? []).map((issue) => issue.code)
}

describe('§7 examples, verbatim', () => {
  it.each([
    [1234.5, 'num', '1,234.5'],
    [1234.5, 'int', '1,235'],
    [12300, 'compact', '12.3K'],
    [4100000, 'compact', '4.1M'],
    [0.92, 'pct', '92.0%'],
    [92, 'pct100', '92.0%'],
    [0.042, 'delta:pct', '+4.2%'],
    [-0.01, 'delta:pct', '−1.0%'],
    [340, 'ms', '340 ms'],
    [1240, 'ms', '1.24 s'],
    [125000, 'ms', '2m 05s'],
    [45, 'dur', '45 s'],
    [200, 'dur', '3m 20s'],
    [3720, 'dur', '1h 02m'],
    [1468006, 'bytes', '1.4 MiB'],
    ['2026-11-04T10:15:00Z', 'date', 'Nov 4, 2026'],
    ['2026-11-04T10:12:00Z', 'rel', '3 min ago'],
    ['4f2c1a9e8d', 'sha', '4f2c1a9'],
  ] as const)('%j as %s gives %s', (value, format, expected) => {
    expect(formatValue(value, format, { locale: 'en-US', now: NOW }).text).toBe(expected)
  })

  it('prints money:PLN in pl-PL with a group separator', () => {
    expect(formatValue(1234.5, 'money:PLN', { locale: 'pl-PL' }).text).toBe(`1${NB}234,50${NB}zł`)
  })
})

describe('numbers across locales', () => {
  it('num', () => {
    expectRows([
      [1234.5, 'num', '1,234.5', `1${NB}234,5`, `1${NB}234,5`],
      [1234.567, 'num', '1,234.57', `1${NB}234,57`, `1${NB}234,57`],
      [1234.5, 'num:3', '1,234.500', `1${NB}234,500`, `1${NB}234,500`],
      [1234.5, 'num:0', '1,235', `1${NB}235`, `1${NB}235`],
      [-5, 'num', '-5', '-5', '-5'],
    ])
  })

  it('int', () => {
    expectRows([[1234.5, 'int', '1,235', `1${NB}235`, `1${NB}235`]])
  })

  it('compact', () => {
    expectRows([
      [12345, 'compact', '12.3K', `12,3${NB}tys.`, `12,3${NB}тис.`],
      [4100000, 'compact', '4.1M', `4,1${NB}mln`, `4,1${NB}млн`],
      [999, 'compact', '999', '999', '999'],
    ])
  })

  it('pct and pct100', () => {
    expectRows([
      [0.92, 'pct', '92.0%', '92,0%', '92,0%'],
      [0.9234, 'pct:2', '92.34%', '92,34%', '92,34%'],
      [0.5, 'pct:0', '50%', '50%', '50%'],
      [92, 'pct100', '92.0%', '92,0%', '92,0%'],
      [92.345, 'pct100:2', '92.35%', '92,35%', '92,35%'],
    ])
  })

  it('money', () => {
    expectRows([
      [1234.5, 'money:PLN', `PLN${NB}1,234.50`, `1${NB}234,50${NB}zł`, `1${NB}234,50${NB}PLN`],
      [1234.5, 'money:usd', '$1,234.50', `1${NB}234,50${NB}USD`, `1${NB}234,50${NB}USD`],
      [1234.5, 'money:UAH', `UAH${NB}1,234.50`, `1${NB}234,50${NB}UAH`, `1${NB}234,50${NB}₴`],
    ])
  })
})

describe('durations across locales', () => {
  it('ms', () => {
    expectRows([
      [340, 'ms', '340 ms', '340 ms', '340 мс'],
      [1240, 'ms', '1.24 s', '1,24 s', '1,24 с'],
      [125000, 'ms', '2m 05s', '2 min 05 s', '2х 05с'],
      [3720000, 'ms', '1h 02m', '1 h 02 min', '1г 02х'],
    ])
  })

  it('dur', () => {
    expectRows([
      [45, 'dur', '45 s', '45 s', '45 с'],
      [200, 'dur', '3m 20s', '3 min 20 s', '3х 20с'],
      [3720, 'dur', '1h 02m', '1 h 02 min', '1г 02х'],
      [360000, 'dur', '100h 00m', '100 h 00 min', '100г 00х'],
    ])
  })

  it.each([
    [0, 'ms', '0 ms'],
    [-0.4, 'ms', '0 ms'],
    [999.4, 'ms', '999 ms'],
    [999.6, 'ms', '1.00 s'],
    [59994, 'ms', '59.99 s'],
    [59999, 'ms', '1m 00s'],
    [3599499, 'ms', '59m 59s'],
    [3599999, 'ms', '1h 00m'],
    [-340, 'ms', '-340 ms'],
    [-125000, 'ms', '-2m 05s'],
    [59.4, 'dur', '59 s'],
    [59.6, 'dur', '1m 00s'],
    [3599.6, 'dur', '1h 00m'],
    [-3720, 'dur', '-1h 02m'],
  ])('rolls %d %s to %s', (value, format, expected) => {
    expect(formatValue(value, format).text).toBe(expected)
  })
})

describe('bytes', () => {
  it('iec and si across locales', () => {
    expectRows([
      [512, 'bytes', '512 B', '512 B', '512 B'],
      [1468006, 'bytes', '1.4 MiB', '1,4 MiB', '1,4 MiB'],
      [1468006, 'bytes:iec', '1.4 MiB', '1,4 MiB', '1,4 MiB'],
      [1500000, 'bytes:si', '1.5 MB', '1,5 MB', '1,5 МБ'],
      [512, 'bytes:si', '512 B', '512 B', '512 Б'],
    ])
  })

  it.each([
    [0, 'bytes', '0 B'],
    [1023, 'bytes', '1,023 B'],
    [1024, 'bytes', '1.0 KiB'],
    [1048524, 'bytes', '1,023.9 KiB'],
    [1048575, 'bytes', '1.0 MiB'],
    [999999, 'bytes:si', '1.0 MB'],
    [2 ** 60, 'bytes', '1,024.0 PiB'],
    [-2048, 'bytes', '-2.0 KiB'],
  ])('scales %d %s to %s', (value, format, expected) => {
    expect(formatValue(value, format).text).toBe(expected)
  })
})

describe('negative zero', () => {
  it.each([
    [-0.4, 'int', '0'],
    [-0.004, 'num', '0'],
    [-0, 'num', '0'],
    [-0.04, 'compact', '0'],
    [-0.0001, 'pct', '0.0%'],
    [-0.001, 'pct:0', '0%'],
    [-0.001, 'pct100:0', '0%'],
    [-0.001, 'money:USD', '$0.00'],
    [-0.4, 'bytes', '0 B'],
    [-0.4, 'bytes:si', '0 B'],
    [-0.4, 'dur', '0 s'],
  ])('%d as %s prints %s', (value, format, expected) => {
    expect(formatValue(value, format, { locale: 'en-US' }).text).toBe(expected)
  })

  it('keeps a real negative', () => {
    expect(formatValue(-0.5, 'num').text).toBe('-0.5')
    expect(formatValue(-1, 'money:USD').text).toBe('-$1.00')
  })
})

describe('delta', () => {
  it('formats through its base in each locale', () => {
    expectRows([
      [0.042, 'delta:pct', '+4.2%', '+4,2%', '+4,2%'],
      [-0.01, 'delta:pct', '−1.0%', '−1,0%', '−1,0%'],
      [-3, 'delta', '−3', '−3', '−3'],
      [1200, 'delta:ms', '+1.20 s', '+1,20 s', '+1,20 с'],
      [
        -1234.5,
        'delta:money:PLN',
        `−PLN${NB}1,234.50`,
        `−1${NB}234,50${NB}zł`,
        `−1${NB}234,50${NB}PLN`,
      ],
    ])
  })

  it.each([
    ['delta', 1, 'ok'],
    ['delta', -1, 'err'],
    ['delta:better:low', 1, 'err'],
    ['delta:better:low', -1, 'ok'],
    ['delta:better:high', 1, 'ok'],
    ['delta:pct:better:low', 0.5, 'err'],
    ['delta:pct:2:better:low', -0.5, 'ok'],
    ['delta:money:PLN:better:low', 5, 'err'],
    ['delta', 0, 'muted'],
    ['delta:better:low', 0, 'muted'],
    ['delta:pct', 0.00001, 'muted'],
  ])('%s of %d has tone %s', (format, value, tone) => {
    expect(formatValue(value, format).tone).toBe(tone)
  })

  it('keeps base decimals and prints no sign at zero', () => {
    expect(formatValue(-0.12345, 'delta:pct:2:better:low').text).toBe('−12.35%')
    expect(formatValue(0, 'delta:pct').text).toBe('0.0%')
    expect(formatValue(0.00001, 'delta:pct').text).toBe('0.0%')
  })
})

describe('date', () => {
  const stamp = '2026-11-04T10:15:00Z'

  it('all args across locales', () => {
    expectRows([
      [stamp, 'date', 'Nov 4, 2026', `4 lis 2026`, `4 лист. 2026 р.`],
      [stamp, 'date:short', 'Nov 4, 2026', `4 lis 2026`, `4 лист. 2026 р.`],
      [stamp, 'date:long', 'November 4, 2026', '4 listopada 2026', `4 листопада 2026 р.`],
      [stamp, 'date:time', '10:15 AM UTC', '10:15 UTC', '10:15 UTC'],
      [
        stamp,
        'date:datetime',
        'Nov 4, 2026, 10:15 AM UTC',
        '4 lis 2026, 10:15 UTC',
        `4 лист. 2026 р., 10:15 UTC`,
      ],
      [Date.UTC(2026, 10, 4), 'date', 'Nov 4, 2026', '4 lis 2026', `4 лист. 2026 р.`],
    ])
  })

  it.each([
    ['2026-11-04', 'Nov 4, 2026, 12:00 AM UTC'],
    ['2026-11-04T23:30', 'Nov 4, 2026, 11:30 PM UTC'],
    ['2026-11-04T23:30:15', 'Nov 4, 2026, 11:30 PM UTC'],
    ['2026-11-04T23:30:15.5Z', 'Nov 4, 2026, 11:30 PM UTC'],
    ['2026-11-04T23:30:00+02:00', 'Nov 4, 2026, 9:30 PM UTC'],
    ['2026-11-04T23:30:00-0200', 'Nov 5, 2026, 1:30 AM UTC'],
    ['2024-02-29', 'Feb 29, 2024, 12:00 AM UTC'],
    ['2026-11-04T23:30:00+02', 'Nov 4, 2026, 9:30 PM UTC'],
    ['0050-01-01', 'Jan 1, 50, 12:00 AM UTC'],
  ])('reads %s as UTC', (value, expected) => {
    expect(formatValue(value, 'date:datetime', { locale: 'en-US' }).text).toBe(expected)
  })

  it.each([
    '2026-02-31',
    '2025-02-29',
    '2026-13-01',
    '2026-11-04T24:00:00Z',
    '2026-11-04T10:61',
    'Nov 4 2026',
    '11/04/2026',
    '20261104',
    '',
    '2026-11-04T10:00:00+99:99',
    '2026-11-04T10:00:00+14:01',
    '2026-11-04T10:00:00+01:60',
  ])('renders %j raw with a warn', (value) => {
    const result = formatValue(value, 'date')
    expect(result.text).toBe(value)
    expect(issueCodes(result)).toEqual(['bad-value'])
  })

  it('renders an out-of-range epoch raw', () => {
    const result = formatValue(9e15, 'date')
    expect(result.text).toBe('9000000000000000')
    expect(issueCodes(result)).toEqual(['bad-value'])
  })
})

describe('rel', () => {
  it('counts from now, in each locale', () => {
    expectRows([
      ['2026-11-04T10:12:00Z', 'rel', '3 min ago', '3 min temu', '3 хв тому'],
      ['2026-11-04T10:14:30Z', 'rel', '30 sec ago', `30 sek. temu`, '30 с тому'],
      ['2026-11-04T07:15:00Z', 'rel', '3 hr ago', '3 godz. temu', '3 год тому'],
      ['2026-11-01T10:15:00Z', 'rel', '3 days ago', '3 dni temu', '3 дн. тому'],
      ['2026-08-01T10:15:00Z', 'rel', '3 mo ago', '3 mies. temu', '3 міс. тому'],
      ['2023-10-04T10:15:00Z', 'rel', '3 yr ago', '3 lata temu', '3 р. тому'],
      ['2026-11-04T10:18:00Z', 'rel', 'in 3 min', 'za 3 min', 'через 3 хв'],
      [NOW, 'rel', 'now', 'teraz', 'зараз'],
    ])
  })

  it('accepts epoch ms for the value and for now', () => {
    const now = Date.parse(NOW)
    expect(formatValue(now - 180_000, 'rel', { locale: 'en-US', now }).text).toBe('3 min ago')
  })

  it('truncates, so it never reads 60 min', () => {
    const value = Date.parse(NOW) - 3_599_000
    expect(formatValue(value, 'rel', { locale: 'en-US', now: NOW }).text).toBe('59 min ago')
  })

  it('is deterministic: the clock is never read', () => {
    const spy = vi.spyOn(Date, 'now')
    formatValue('2026-11-04T10:12:00Z', 'rel', { now: NOW })
    formatValue('2026-11-04T10:12:00Z', 'rel')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it.each([undefined, 'not a date', Number.NaN])('prints the datetime with now=%j', (now) => {
    const result = formatValue(NOW, 'rel', { locale: 'en-US', now })
    expect(result.text).toBe('Nov 4, 2026, 10:15 AM UTC')
    expect(issueCodes(result)).toEqual(['bad-value'])
    expect(result.issues?.[0]?.hint).toContain('generatedAt')
  })
})

describe('text-like formats', () => {
  it('text applies inline markup and defaults when no format is given', () => {
    const result = formatValue('a **b**', undefined)
    expect(result.text).toBe('a b')
    expect(result.inline).toEqual(parseInline('a **b**'))
    expect(formatValue('x', 'text').inline).toEqual(parseInline('x'))
  })

  it.each([
    [1234.5, '1234.5'],
    [true, 'true'],
    [false, 'false'],
    [0, '0'],
    ['', ''],
  ])('text prints %j as a string', (value, expected) => {
    expect(formatValue(value, 'text').text).toBe(expected)
  })

  it('status', () => {
    for (const locale of LOCALES) {
      expect(formatValue('ok', 'status', { locale })).toEqual({
        text: 'ok',
        status: 'ok',
        tone: 'ok',
      })
      expect(formatValue('fail', 'status', { locale }).tone).toBe('err')
    }
  })

  it('code truncates over 60 chars and keeps the full value', () => {
    const exact = 'x'.repeat(60)
    expect(formatValue(exact, 'code')).toEqual({ text: exact, mono: true })
    const long = 'x'.repeat(61)
    expect(formatValue(long, 'code')).toEqual({
      text: `${'x'.repeat(59)}…`,
      mono: true,
      title: long,
    })
  })

  it('code does not split a surrogate pair', () => {
    const text = formatValue(`${'x'.repeat(58)}😀${'y'.repeat(10)}`, 'code').text
    expect(text).toBe(`${'x'.repeat(58)}…`)
  })

  it.each([
    ['packages/ui-spec/src/format.ts', 'format.ts'],
    ['format.ts', 'format.ts'],
    ['C:\\repo\\format.ts', 'format.ts'],
    ['src/', 'src/'],
    ['/', '/'],
    ['', ''],
  ])('path %j emphasizes %j', (value, base) => {
    expect(formatValue(value, 'path')).toEqual({ text: value, mono: true, base })
  })

  it('path stays fast on a long segment', () => {
    const start = performance.now()
    for (let round = 0; round < 125; round++) formatValue(`${'a'.repeat(20_000)}/x`, 'path')
    expect(performance.now() - start).toBeLessThan(200)
  })

  it('path keeps the basename when it middle-truncates', () => {
    const value = `${'a/'.repeat(50)}format.ts`
    const result = formatValue(value, 'path')
    expect(result.base).toBe('format.ts')
    expect(result.title).toBe(value)
    expect(result.text).toHaveLength(60)
    expect(result.text.endsWith('…/format.ts')).toBe(true)
    expect(result.text.startsWith('a/a/')).toBe(true)
  })

  it('path middle-truncates a basename too long to keep', () => {
    const name = 'n'.repeat(100)
    const result = formatValue(`dir/${name}`, 'path')
    expect(Array.from(result.text)).toHaveLength(60)
    expect(result.text).toContain('…')
    expect(result.base).toBe('n'.repeat(30))
    expect(result.text.endsWith(result.base as string)).toBe(true)
  })

  it.each([
    ['https://a.b/c', 'https://a.b/c', 'https://a.b/c'],
    ['mailto:a@b.c', 'mailto:a@b.c', 'mailto:a@b.c'],
    ['[Docs](https://a.b)', 'Docs', 'https://a.b'],
    ['[**Docs**](#x)', 'Docs', '#x'],
    ['#x', '#x', '#x'],
  ])('link %s', (value, text, href) => {
    expect(formatValue(value, 'link')).toEqual({ text, href })
  })

  it.each([
    'javascript:alert(1)',
    '[x](javascript:alert(1))',
    'data:text/html,x',
    'ftp://a.b',
    'not a url',
    '[a](https://b) and more',
  ])('link %j stays text with a warn', (value) => {
    const result = formatValue(value, 'link')
    expect(result.text).toBe(value)
    expect(result.href).toBeUndefined()
    expect(issueCodes(result)).toEqual(['bad-value'])
  })

  it('sha', () => {
    expect(formatValue('4f2c1a9e8d', 'sha')).toEqual({ text: '4f2c1a9', mono: true })
    expect(formatValue('4f2c1a9e8d', 'sha:4').text).toBe('4f2c')
    expect(formatValue('4f2', 'sha').text).toBe('4f2')
  })
})

describe('null and invalid values', () => {
  it.each(FORMAT_NAMES)('%s renders null and missing as a muted em dash', (name) => {
    expect(formatValue(null, name)).toEqual({ text: '—', tone: 'muted' })
    expect(formatValue(undefined, name)).toEqual({ text: '—', tone: 'muted' })
  })

  it('still dashes null under a bad format', () => {
    expect(formatValue(null, 'bogus')).toEqual({ text: '—', tone: 'muted' })
    expect(formatValue(null, 'money')).toEqual({ text: '—', tone: 'muted' })
  })

  it.each([
    ['abc', 'num', 'abc'],
    ['12', 'int', '12'],
    [true, 'compact', 'true'],
    ['x', 'pct', 'x'],
    ['x', 'pct100', 'x'],
    ['x', 'delta:pct', 'x'],
    ['x', 'ms', 'x'],
    ['x', 'dur', 'x'],
    ['x', 'bytes', 'x'],
    ['x', 'money:PLN', 'x'],
    ['x', 'date', 'x'],
    [true, 'date', 'true'],
    ['x', 'rel', 'x'],
    ['great', 'status', 'great'],
    [1, 'status', '1'],
    [12, 'code', '12'],
    [12, 'path', '12'],
    [12, 'link', '12'],
    [12, 'sha', '12'],
    [{ a: 1 }, 'num', '{"a":1}'],
    [[1, 2], 'text', '[1,2]'],
    [Number.NaN, 'num', 'NaN'],
    [Number.POSITIVE_INFINITY, 'pct', 'Infinity'],
  ] as const)('renders %j as %s raw with a warn', (value, format, text) => {
    const result = formatValue(value as JsonValue, format)
    expect(result.text).toBe(text)
    expect(issueCodes(result)).toEqual(['bad-value'])
    expect(result.tone).toBeUndefined()
    const [issue] = result.issues ?? []
    expect(issue?.message).toContain(format.split(':')[0])
  })

  it('survives values JSON cannot print', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const value of [cyclic, { big: 1n }, 1n]) {
      expect(formatValue(value as unknown as JsonValue, 'num').issues).toHaveLength(1)
    }
  })

  it('reports an unknown format and renders raw, without markup', () => {
    const result = formatValue('**x**', 'bogus:1')
    expect(result.text).toBe('**x**')
    expect(result.inline).toBeUndefined()
    expect(issueCodes(result)).toEqual(['unknown-format'])
  })

  it.each([
    ['num:x', 1.5, '1.5'],
    ['num:21', 1.5, '1.5'],
    ['int:2', 1.5, '2'],
    ['compact:1', 1500, '1.5K'],
    ['pct:abc', 0.5, '50.0%'],
    ['pct100:-1', 50, '50.0%'],
    ['ms:1', 340, '340 ms'],
    ['dur:1', 45, '45 s'],
    ['bytes:foo', 512, '512 B'],
    ['money', 1234.5, '1,234.5'],
    ['money:12', 1234.5, '1,234.5'],
    ['money:toolong', 1234.5, '1,234.5'],
    ['date:foo', '2026-11-04', 'Nov 4, 2026'],
    ['rel:x', '2026-11-04T10:12:00Z', '3 min ago'],
    ['sha:0', 'abcdefghij', 'abcdefg'],
    ['sha:x', 'abcdefghij', 'abcdefg'],
    ['sha:999', 'abcdefghij', 'abcdefg'],
    ['status:x', 'ok', 'ok'],
    ['code:x', 'c', 'c'],
    ['path:x', 'p', 'p'],
    ['link:x', 'https://a', 'https://a'],
    ['text:x', 't', 't'],
    ['delta:nope', 5, '+5'],
    ['delta:status', 5, '+5'],
    ['delta:delta', 5, '+5'],
    ['delta:better:sideways', 5, '+5'],
    ['delta:pct:x', 0.5, '+50.0%'],
    ['delta:money', 5, '+5'],
  ] as const)('%s falls back and warns', (format, value, text) => {
    const result = formatValue(value, format, { locale: 'en-US', now: NOW })
    expect(result.text).toBe(text)
    expect(issueCodes(result)).toEqual(['bad-format-arg'])
  })

  it('keeps better:low when the base is bad', () => {
    expect(formatValue(5, 'delta:nope:better:low').tone).toBe('err')
  })

  it('reports both a bad arg and a bad value', () => {
    const result = formatValue('x', 'pct:abc')
    expect(issueCodes(result)).toEqual(['bad-format-arg', 'bad-value'])
  })

  it('falls back to en-US on a malformed locale, and warns', () => {
    const result = formatValue(1234.5, 'num', { locale: 'not a locale!' })
    expect(result.text).toBe('1,234.5')
    expect(issueCodes(result)).toEqual(['bad-format-arg'])
    expect(issueCodes(formatValue(null, 'num', { locale: 'not a locale!' }))).toEqual([])
  })

  it('uses en-US for a well-formed locale without data, not the machine default', () => {
    expect(formatValue(1234.5, 'num', { locale: 'xx-XX' })).toEqual({ text: '1,234.5' })
    expect(formatValue(1234.5, 'num')).toEqual({ text: '1,234.5' })
  })

  describe('when Intl fails', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders raw and warns instead of throwing', () => {
      vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => {
        throw new RangeError('boom')
      })
      const result = formatValue(9.87654321, 'num:7', { locale: 'en-US' })
      expect(result.text).toBe('9.87654321')
      expect(issueCodes(result)).toEqual(['bad-format-arg'])
    })
  })

  it('never throws, over every format and hostile value', () => {
    const values: JsonValue[] = [
      null,
      true,
      false,
      0,
      -0,
      1,
      -1,
      0.5,
      1e21,
      -1e21,
      1e308,
      -1e308,
      5e-324,
      Number.MAX_SAFE_INTEGER,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '',
      ' ',
      'x',
      '😀',
      '\ud83d',
      '\u0000',
      '<script>',
      '[x](y)',
      '*',
      ':ok:',
      '/',
      '\\',
      'x'.repeat(5000),
      '/'.repeat(5000),
      '2026-11-04',
      [],
      {},
      [1],
      { a: 1 },
    ]
    const args = [
      '',
      'x',
      '0',
      '1',
      '2',
      '20',
      '21',
      '99',
      '-1',
      '1.5',
      'PLN',
      'si',
      'iec',
      'short',
      'long',
      'time',
      'datetime',
      'better:low',
      'pct',
      'delta',
      '💥',
      ':',
      '::',
    ]
    const formats = FORMAT_NAMES.flatMap((name) => [name, ...args.map((arg) => `${name}:${arg}`)])
    formats.push('', ':', 'constructor', '__proto__', 'toString', 'delta:constructor')
    for (const format of formats) {
      for (const value of values) {
        for (const context of [
          { locale: 'en-US', now: NOW },
          { locale: 'uk-UA', now: 8.64e15 },
          { locale: 'bad locale', now: 'nope' },
          {},
        ]) {
          const result = formatValue(value, format, context)
          expect(typeof result.text).toBe('string')
        }
      }
    }
  })
})

describe('parseFormat', () => {
  it.each([
    [undefined, { name: 'text' }],
    ['num', { name: 'num' }],
    ['num:2', { name: 'num', arg: '2' }],
    ['money:PLN', { name: 'money', arg: 'PLN' }],
    ['delta', { name: 'delta', base: { name: 'num' } }],
    ['delta:pct', { name: 'delta', base: { name: 'pct' } }],
    ['delta:pct:2', { name: 'delta', base: { name: 'pct', arg: '2' } }],
    ['delta:better:low', { name: 'delta', base: { name: 'num' }, better: 'low' }],
    ['delta:better:high', { name: 'delta', base: { name: 'num' }, better: 'high' }],
    ['delta:pct:better:low', { name: 'delta', base: { name: 'pct' }, better: 'low' }],
    [
      'delta:money:PLN:better:low',
      { name: 'delta', base: { name: 'money', arg: 'PLN' }, better: 'low' },
    ],
  ])('parses %s', (format, expected) => {
    expect(parseFormat(format)).toEqual(expected)
  })
})

describe('a long delta chain', () => {
  it('does not recurse', () => {
    const format = 'delta:'.repeat(50_000)
    expect(parseFormat(format).base?.name).toBe('delta')
    expect(formatValue(1, format).text).toBe('+1')
  })
})

describe('checkFormat and checkValue', () => {
  it('accepts every plain format name', () => {
    for (const name of FORMAT_NAMES) {
      if (name === 'money') continue
      expect(checkFormat(parseFormat(name)), name).toBeUndefined()
    }
  })

  it('leaves unknown names to the caller', () => {
    expect(checkValue(parseFormat('bogus'), 'x')).toBeUndefined()
  })

  it('does not flag null', () => {
    expect(checkValue(parseFormat('num'), null)).toBeUndefined()
    expect(checkValue(parseFormat('num'), undefined)).toBeUndefined()
  })

  it('keeps the message short and escaped', () => {
    const issue = checkValue(parseFormat('num'), `${'x'.repeat(500)}\n`)
    expect(issue?.message.length).toBeLessThanOrEqual(120)
    expect(issue?.message).not.toContain('\n')
  })
})

describe('statDeltaFormat (VD-212)', () => {
  it.each([
    [{}, 'delta'],
    [{ better: 'high' }, 'delta'],
    [{ better: 'low' }, 'delta:better:low'],
    [{ deltaFormat: 'delta:pct', better: 'low' }, 'delta:pct:better:low'],
    [{ deltaFormat: 'delta:better:high', better: 'low' }, 'delta:better:high'],
    [{ deltaFormat: 'pct', better: 'low' }, 'pct'],
    [{ deltaFormat: 3, better: 'low' }, 'delta:better:low'],
  ])('%j gives %s', (item, expected) => {
    expect(statDeltaFormat(item)).toBe(expected)
  })

  it('flips the tone of a falling value', () => {
    expect(formatValue(-14, statDeltaFormat({ better: 'low' })).tone).toBe('ok')
    expect(formatValue(-14, statDeltaFormat({})).tone).toBe('err')
  })
})
