import { describe, expect, it } from 'vitest'
import {
  type InlineToken,
  inlineToPlain,
  parseInline,
  STATUS_TONES,
  safeHref,
} from '../src/index.js'
import { STATUSES } from '../src/types.js'

const text = (value: string) => ({ type: 'text', text: value })

describe('parseInline', () => {
  it.each([
    ['plain', [text('plain')]],
    ['', []],
    ['**b**', [{ type: 'bold', children: [text('b')] }]],
    ['*i*', [{ type: 'italic', children: [text('i')] }]],
    ['~~s~~', [{ type: 'strike', children: [text('s')] }]],
    ['`c`', [{ type: 'code', text: 'c' }]],
    [':ok:', [{ type: 'status', status: 'ok' }]],
    ['[l](https://a.b)', [{ type: 'link', href: 'https://a.b', children: [text('l')] }]],
    ['a **b** c', [text('a '), { type: 'bold', children: [text('b')] }, text(' c')]],
  ])('parses %j', (input, expected) => {
    expect(parseInline(input)).toEqual(expected)
  })

  it('accepts every status as a token, and maps each to a tone', () => {
    for (const status of STATUSES) {
      expect(parseInline(`:${status}:`)).toEqual([{ type: 'status', status }])
      expect(STATUS_TONES[status]).toBeTypeOf('string')
    }
  })

  it('nests', () => {
    expect(parseInline('**a *b* :ok:**')).toEqual([
      {
        type: 'bold',
        children: [
          text('a '),
          { type: 'italic', children: [text('b')] },
          text(' '),
          { type: 'status', status: 'ok' },
        ],
      },
    ])
    expect(parseInline('***x***')).toEqual([
      { type: 'bold', children: [{ type: 'italic', children: [text('x')] }] },
    ])
    expect(parseInline('[**b**](http://a)')).toEqual([
      {
        type: 'link',
        href: 'http://a',
        children: [{ type: 'bold', children: [text('b')] }],
      },
    ])
  })

  it('treats code as literal, and blinds delimiters inside it', () => {
    expect(parseInline('`**x**`')).toEqual([{ type: 'code', text: '**x**' }])
    expect(parseInline('`:ok:`')).toEqual([{ type: 'code', text: ':ok:' }])
    expect(parseInline('**a `**` b**')).toEqual([
      {
        type: 'bold',
        children: [text('a '), { type: 'code', text: '**' }, text(' b')],
      },
    ])
  })

  it.each([
    '2 * 3 * 4',
    '** spaced **',
    '* a*',
    '*a *',
    '**',
    '****',
    '*',
    '**open',
    '*open',
    '~~open',
    '~~ a~~',
    '`open',
    '``',
    'a:ok:b',
    ':ok:b',
    'a:ok:',
    ':nope:',
    ':ok',
    '10:05',
    '[l]',
    '[l](',
    '[l](http://a',
    '[l] (http://a)',
    '[](http://a)',
    '[open',
  ])('keeps %j as text', (input) => {
    expect(parseInline(input)).toEqual([text(input)])
  })

  it('has no backslash escapes', () => {
    expect(parseInline('\\*a\\*')).toEqual([
      text('\\'),
      { type: 'italic', children: [text('a\\')] },
    ])
  })

  it('accepts a status token next to punctuation', () => {
    expect(parseInline('(:ok:)')).toEqual([text('('), { type: 'status', status: 'ok' }, text(')')])
  })

  it('does not nest links', () => {
    expect(parseInline('[a [b](http://x)](http://y)')).toEqual([
      {
        type: 'link',
        href: 'http://x',
        children: [text('a [b')],
      },
      text('](http://y)'),
    ])
    const [link] = parseInline('[[x](#a)](http://y)')
    expect(link).toMatchObject({ type: 'link', href: '#a' })
  })

  it('allows one level of balanced parens in a URL', () => {
    expect(parseInline('[a](http://x/b_(c)) d')).toEqual([
      { type: 'link', href: 'http://x/b_(c)', children: [text('a')] },
      text(' d'),
    ])
  })

  it('never holds a delimiter inside itself, so depth stays bounded', () => {
    const depth = (tokens: InlineToken[]): number =>
      Math.max(0, ...tokens.map((token) => ('children' in token ? 1 + depth(token.children) : 0)))
    const nested = '*~~**[a'.repeat(2_000) + '](#x)**~~*'.repeat(2_000)
    expect(depth(parseInline(nested))).toBeLessThanOrEqual(4)
  })

  it('keeps raw HTML as text', () => {
    for (const html of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<b>bold</b>',
      '&lt;b&gt;',
      '<a href="javascript:alert(1)">x</a>',
    ]) {
      expect(parseInline(html)).toEqual([text(html)])
    }
  })

  it.each([
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](vbscript:msgbox(1))',
    '[x](file:///etc/passwd)',
    '[x](ftp://a.b)',
    '[x](//evil.example)',
    '[x](./relative)',
    '[x](/absolute)',
    '[x](http://a b)',
    '[x]( http://a)',
    '[x](java\tscript:alert(1))',
    '[x](http://a\nb)',
  ])('keeps %j as verbatim text', (input) => {
    expect(parseInline(input)).toEqual([text(input)])
  })

  it('stays fast on hostile input', () => {
    const size = 20_000
    const inputs = [
      '*'.repeat(size),
      '*a '.repeat(size / 3),
      '**a '.repeat(size / 4),
      '~~a '.repeat(size / 4),
      '`'.repeat(size),
      '['.repeat(size),
      `${'[a'.repeat(size / 2)}]`,
      '[a]('.repeat(size / 4),
      '[a](b'.repeat(size / 5),
      ':'.repeat(size),
      '*a'.repeat(size / 2),
      '** *'.repeat(size / 4),
      '*~'.repeat(size / 2),
    ]
    const start = performance.now()
    for (const input of inputs) parseInline(input)
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe('inlineToPlain', () => {
  it('flattens every token', () => {
    const tokens = parseInline('a **b** *c* ~~d~~ `e` [f](#g) :fail:')
    expect(inlineToPlain(tokens)).toBe('a b c d e f fail')
  })
})

describe('safeHref', () => {
  it.each([
    ['http://a.b'],
    ['https://a.b/c?d=e#f'],
    ['HTTPS://A.B'],
    ['mailto:a@b.c'],
    ['#section-1'],
  ])('allows %s', (url) => {
    expect(safeHref(url)).toBe(url)
  })

  it.each([
    [''],
    ['#'],
    ['# x'],
    ['http://'],
    ['http:foo'],
    ['https:/a'],
    ['mailto:'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    [' http://a'],
    ['http://a\u0000b'],
    ['http://a\u007fb'],
    ['\u0001javascript:alert(1)'],
    ['a/b'],
  ])('refuses %j', (url) => {
    expect(safeHref(url)).toBeUndefined()
  })
})
