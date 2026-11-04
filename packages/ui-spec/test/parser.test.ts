import { describe, expect, it } from 'vitest'
import { hasOwn, type JsonObject } from '../src/json.js'
import { MAX_NESTING, type ParseError, parse } from '../src/parser.js'

function value(text: string) {
  const result = parse(text)
  if (!result.ok) throw new Error(`${result.error.message} in ${text}`)
  return result.value
}

function failure(text: string): ParseError {
  const result = parse(text)
  if (result.ok) throw new Error(`expected a failure for ${text}`)
  return result.error
}

describe('strict JSON', () => {
  it.each([
    ['null', null],
    ['true', true],
    ['false', false],
    ['0', 0],
    ['-0.5', -0.5],
    ['1e3', 1000],
    ['1E+2', 100],
    ['2e-1', 0.2],
    ['"a"', 'a'],
    ['""', ''],
    ['[]', []],
    ['{}', {}],
    [' [ 1 , 2 ] ', [1, 2]],
    ['{"a":{"b":[null]}}', { a: { b: [null] } }],
    ['"\\"\\\\\\/\\b\\f\\n\\r\\t"', '"\\/\b\f\n\r\t'],
    ['"\\u00e9\\uD83D\\uDE00"', 'é😀'],
    ['"  é 😀"', '  é 😀'],
  ])('parses %s', (text, expected) => {
    expect(value(text)).toEqual(expected)
  })

  it('keeps the last value of a duplicate key, as JSON.parse does', () => {
    expect(value('{"a":1,"a":2}')).toEqual({ a: 2 })
  })

  it('makes __proto__ an own key without touching a prototype', () => {
    const parsed = value('{"__proto__": {"polluted": true}}') as JsonObject
    expect(hasOwn(parsed, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(({} as JsonObject).polluted).toBeUndefined()
  })
})

describe('relaxations of §5.1', () => {
  it.each([
    ['{a: 1}', { a: 1 }],
    ['{_a1: 1}', { _a1: 1 }],
    ['{true: 1, null: 2, NaN: 3, Infinity: 4}', { true: 1, null: 2, NaN: 3, Infinity: 4 }],
    ["{'a b': 1}", { 'a b': 1 }],
    ["'x'", 'x'],
    ["'it\\'s'", "it's"],
    ['"it\\\'s"', "it's"],
    ['\'say "hi"\'', 'say "hi"'],
    ["'\\u0041\\n'", 'A\n'],
    ['[1, 2,]', [1, 2]],
    ['{a: 1,}', { a: 1 }],
    ['[1 /* one */, // two\n 2]', [1, 2]],
    ['// lead\n{a /* k */ : /* v */ 1} // tail', { a: 1 }],
    ['/* a\nb */ 1', 1],
    ['/**/1/***/', 1],
    ['[1, // trailing\n]', [1]],
  ])('parses %s', (text, expected) => {
    expect(value(text)).toEqual(expected)
  })

  it('parses a §19 example as written', () => {
    expect(
      value(`[
        {type: 'grid', children: [
          {type: 'plan', title: 'Plan', items: [
            {text: 'Add rotation table', status: 'ok'},
          ]},
        ]},
      ]`),
    ).toEqual([
      {
        type: 'grid',
        children: [
          { type: 'plan', title: 'Plan', items: [{ text: 'Add rotation table', status: 'ok' }] },
        ],
      },
    ])
  })
})

describe('refusals', () => {
  it.each([
    ['0x10', /hex/i],
    ['0XFF', /hex/i],
    ['-0x10', /hex/i],
    ['Infinity', /Infinity/],
    ['-Infinity', /Infinity/],
    ['+Infinity', /Infinity/],
    ['NaN', /NaN/],
    ['-NaN', /NaN/],
    ['[NaN]', /NaN/],
    ['"a\\\nb"', /continuation/],
    ['"a\\\r\nb"', /continuation/],
    ["'a\\\nb'", /continuation/],
    ['"a\\\rb"', /continuation/],
    ['"a\\ b"', /continuation/],
    ['"a\\ b"', /continuation/],
  ])('refuses %j by name', (text, message) => {
    expect(failure(text).message).toMatch(message)
  })

  it.each([
    '',
    '   ',
    '// only a comment',
    '+1',
    '.5',
    '5.',
    '01',
    '-',
    '-a',
    '1e',
    '1e+',
    '1.e3',
    '1_000',
    '1e999',
    '-1e999',
    '"a\nb"',
    '"a\rb"',
    '"a\tb"',
    '"\u0000"',
    '"\\x41"',
    '"\\v"',
    '"\\0"',
    '"\\a"',
    '"\\u12"',
    '"\\u12G4"',
    '"unterminated',
    "'unterminated",
    '"ends in escape\\',
    '[1',
    '[1 2]',
    '[,]',
    '[1,,]',
    '[,1]',
    '{',
    '{,}',
    '{a}',
    '{a:}',
    '{a:1,,}',
    '{a:1 b:2}',
    '{$a: 1}',
    '{1a: 1}',
    '{-a: 1}',
    '{é: 1}',
    '{a-b: 1}',
    '{1: 1}',
    '{[1]: 1}',
    '/* unterminated',
    '/',
    '/x',
    '1 2',
    '{} {}',
    'undefined',
    'True',
    'nul',
    'foo',
    '﻿{}',
    ' 1',
    '}',
  ])('refuses %j', (text) => {
    const error = failure(text)
    expect(error.code).toBe('syntax')
    expect(error.message.length).toBeLessThanOrEqual(120)
    expect(error.line).toBeGreaterThanOrEqual(1)
    expect(error.column).toBeGreaterThanOrEqual(1)
  })
})

describe('error positions', () => {
  it.each([
    ['x', 1, 1],
    ['[1,\n x]', 2, 2],
    ['[1,\r\n x]', 2, 2],
    ['[1,\r x]', 2, 2],
    ['[\n\n\n  0x10]', 4, 3],
    ['{\n  a: "b\n"}', 2, 8],
    ['[1, /* multi\nline */ x]', 2, 9],
    ['/* open', 1, 1],
    ['\n "open', 2, 2],
    ['[\n"a\\\nb"]', 2, 3],
    ['[1', 1, 3],
    ['[\n', 2, 1],
    ['"é😀" x', 1, 7],
  ])('locates the failure in %j', (text, line, column) => {
    expect(failure(text)).toMatchObject({ line, column })
  })

  it('gives the offset of the failure', () => {
    expect(failure('[1,\n x]').offset).toBe(5)
  })
})

describe('nesting', () => {
  const nested = (depth: number) => '['.repeat(depth) + ']'.repeat(depth)

  it('accepts the cap', () => {
    expect(parse(nested(MAX_NESTING)).ok).toBe(true)
  })

  it('refuses one level past the cap, with a position', () => {
    expect(failure(nested(MAX_NESTING + 1))).toMatchObject({
      code: 'too-deep',
      line: 1,
      column: MAX_NESTING + 1,
    })
  })

  it('counts objects and arrays alike', () => {
    expect(failure('{a:['.repeat(MAX_NESTING)).code).toBe('too-deep')
  })

  it('survives a 256 KiB run of brackets', () => {
    expect(failure('['.repeat(256 * 1024)).code).toBe('too-deep')
  })
})

describe('agreement with JSON.parse', () => {
  const corpus = [
    '{"title":"Test run — auth","body":[{"type":"md","text":"a\\nb"}],"n":[0,-1,1.5e2,-0]}',
    '[[],{},[{}],{"":""},{"a b":[true,false,null]}]',
    '"\\ud83d"',
    '"\\u0000\\u001f"',
    '  \n\t\r 12.25E-1  ',
    '{"__proto__":1,"constructor":2,"toString":3}',
  ]

  it.each(corpus)('agrees on %s', (text) => {
    expect(JSON.stringify(value(text))).toBe(JSON.stringify(JSON.parse(text)))
  })

  it('never throws, and agrees whenever JSON.parse accepts a mutation', () => {
    // A small seeded LCG, so a failure reproduces.
    let seed = 20261104
    const next = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed % limit
    }
    const alphabet = '{}[]:,"\'\\/*\n\r 0123eE+-.xuaNIf_tn'
    for (let i = 0; i < 20000; i++) {
      const base = corpus[next(corpus.length)] as string
      const at = next(base.length + 1)
      const insert = alphabet[next(alphabet.length)] as string
      const text = base.slice(0, at) + insert + base.slice(at + next(2))
      const result = parse(text)
      let expected: unknown
      try {
        expected = JSON.parse(text)
      } catch {
        continue
      }
      expect(result.ok, text).toBe(true)
      if (result.ok) expect(JSON.stringify(result.value), text).toBe(JSON.stringify(expected))
    }
  })
})
