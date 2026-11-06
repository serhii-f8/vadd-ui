import { describe, expect, it } from 'vitest'
import {
  directiveLine,
  directiveTitle,
  isVisualFileName,
  ORCA_DIRECTIVE_MARKER,
  ORCA_DIRECTIVE_MAX_LINE,
  ORCA_TITLE_MAX,
  parseDirectiveLine,
} from '../src/host/orca.js'

describe('isVisualFileName', () => {
  it.each([
    'a.html',
    'test-run-7c1e.html',
    'A_b.c-1.html',
    `${'a'.repeat(123)}.html`,
    'con-a1b2.html',
    'console.html',
  ])('takes %s', (name) => {
    expect(isVisualFileName(name)).toBe(true)
  })

  it.each([
    '',
    '.html',
    '-a.html',
    '.a.html',
    'a.htm',
    'a.HTML',
    'a b.html',
    'a/b.html',
    'a\\b.html',
    'a..b.html',
    'a.html\n',
    'ü.html',
    `${'a'.repeat(124)}.html`,
    'con.html',
    'CON.html',
    'nul.x.html',
    'com1.html',
    'lpt\u00b9.html',
    'conin$.html',
  ])('refuses %j', (name) => {
    expect(isVisualFileName(name)).toBe(false)
  })
})

describe('directiveTitle', () => {
  it('leaves a plain title alone', () => {
    expect(directiveTitle('Test run — auth module')).toBe('Test run — auth module')
  })

  it.each([
    ['say "hi"', 'say hi'],
    ['C:\\temp', 'C: temp'],
    ['a{b}c', 'a b c'],
    ['a\nb\r\nc\td', 'a b c d'],
    ['  padded  ', 'padded'],
    ['a\u2028b\u2029c', 'a b c'],
    ['a\u0085b', 'ab'],
    ['\u001b[31mred\u001b[0m', 'red'],
    ['a\u202eb', 'ab'],
    ['ok\ud800', 'ok'],
    ['"""', ''],
    ['\\', ''],
    ['', ''],
  ])('sanitizes %j', (input, output) => {
    expect(directiveTitle(input)).toBe(output)
  })

  it('cannot spell a second directive', () => {
    const hostile = 'x"}\n::orca-visual{file="evil.html" title="y'
    const title = directiveTitle(hostile)
    expect(title).not.toContain(ORCA_DIRECTIVE_MARKER)
    expect(title).not.toMatch(/["{}\n]/)
  })

  it('cuts at the limit and splits no pair', () => {
    const title = directiveTitle('😀'.repeat(200))
    expect(title.length).toBeLessThanOrEqual(ORCA_TITLE_MAX)
    expect(title).toBe('😀'.repeat(60))
    const odd = directiveTitle(`a${'😀'.repeat(200)}`)
    expect(odd.length).toBe(119)
    expect(odd).not.toMatch(/\p{Cs}/u)
  })

  it('leaves no space at a cut', () => {
    const title = directiveTitle(`${'a'.repeat(119)} b`)
    expect(title).toBe('a'.repeat(119))
  })
})

describe('directiveLine', () => {
  it('writes §11.2', () => {
    expect(directiveLine({ file: 'test-run-7c1e.html', title: 'Test run' })).toBe(
      '::orca-visual{file="test-run-7c1e.html" title="Test run"}',
    )
  })

  it('omits a title with nothing left in it', () => {
    expect(directiveLine({ file: 'a.html', title: '"' })).toBe('::orca-visual{file="a.html"}')
    expect(directiveLine({ file: 'a.html' })).toBe('::orca-visual{file="a.html"}')
  })

  it('refuses a file name Orca would refuse', () => {
    expect(() => directiveLine({ file: '../a.html' })).toThrow(RangeError)
  })

  it('round-trips through the parser, whatever the title', () => {
    const line = directiveLine({ file: 'a.html', title: 'x"}\n::orca-visual{file="b.html"}' })
    expect(line.split('\n')).toHaveLength(1)
    expect(parseDirectiveLine(line)?.file).toBe('a.html')
    expect(line.length).toBeLessThanOrEqual(ORCA_DIRECTIVE_MAX_LINE)
  })
})

describe('parseDirectiveLine', () => {
  it.each([
    ['::orca-visual{file="a.html"}', { file: 'a.html', title: null }],
    ['::orca-visual{file="a.html" title="T"}', { file: 'a.html', title: 'T' }],
    ['::orca-visual{title="T" file="a.html"}', { file: 'a.html', title: 'T' }],
    ['   ::orca-visual{file="a.html"}  \t\r\n', { file: 'a.html', title: null }],
    ['::orca-visual{file="a.html" future="x"}', { file: 'a.html', title: null }],
    ['::orca-visual{file="a.html" title="  "}', { file: 'a.html', title: null }],
    ['::orca-visual{file="a.html" title="a}b"}', { file: 'a.html', title: 'a}b' }],
  ])('reads %j', (line, expected) => {
    expect(parseDirectiveLine(line)).toEqual(expected)
  })

  it.each([
    'text',
    '    ::orca-visual{file="a.html"}',
    '::orca-visual{}',
    '::Orca-visual{file="a.html"}',
    '::orca-visual{file="a.html"} x',
    '::orca-visual{file="a.html"title="T"}',
    '::orca-visual{file="a.html" file="b.html"}',
    '::orca-visual{file="../a.html"}',
    '::orca-visual{file=a.html}',
    '::orca-visual{file="a.html" title="a\\b"}',
    '::orca-visual{file="a.html" title="a\u0001b"}',
    `::orca-visual{file="a.html" title="${'t'.repeat(121)}"}`,
    `::orca-visual{file="a.html" future="${'t'.repeat(512)}"}`,
    '::orca-visual{file="a.html"}\nx',
    '::orca-visual{file="a.html"',
  ])('refuses %j', (line) => {
    expect(parseDirectiveLine(line)).toBeNull()
  })
})
