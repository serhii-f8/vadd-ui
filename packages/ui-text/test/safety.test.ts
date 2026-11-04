import { type JsonValue, type VuiDocument, validate } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { renderMarkdown, renderPlain } from '../src/index.js'

function documentOf(input: JsonValue): VuiDocument {
  return validate(input).document as VuiDocument
}

const md = (input: JsonValue) => renderMarkdown(documentOf(input))
const plain = (input: JsonValue) => renderPlain(documentOf(input))
const cast = (value: unknown) => value as VuiDocument

describe('document text stays text in markdown (§5.5, §15.1)', () => {
  it.each([
    ['<script>alert(1)</script>', '\\<script>alert(1)\\</script>'],
    ['<img src=x onerror=alert(1)>', '\\<img src=x onerror=alert(1)>'],
    ['<!-- c -->', '\\<!-- c -->'],
    ['<?php ?>', '\\<?php ?>'],
    ['<http://a.dev>', '\\<http://a.dev>'],
    ['&lt;b&gt;', '\\&lt;b\\&gt;'],
    ['&#60;', '\\&#60;'],
    ['a < b && c > d', 'a < b && c > d'],
    ['[x](javascript:alert(1))', '\\[x\\](javascript:alert(1))'],
    ['[x](data:text/html,a)', '\\[x\\](data:text/html,a)'],
    ['![x](http:evil)', '!\\[x\\](http:evil)'],
    ['_em_', '\\_em\\_'],
    ['snake_case_name', 'snake_case_name'],
    ['* not a list', '\\* not a list'],
    ['1 * 2 * 3', '1 \\* 2 \\* 3'],
    ['~tilde~', '\\~tilde\\~'],
    ['back\\slash', 'back\\\\slash'],
    ['`open', '\\`open'],
  ])('%s', (source, expected) => {
    expect(md({ type: 'callout', text: source, tone: 'muted' })).toBe(`> ${expected}\n`)
    expect(plain({ type: 'callout', text: source, tone: 'muted' })).not.toContain('\\\\\\')
  })

  it.each([
    ['# h', '\\# h'],
    ['###### h', '\\###### h'],
    ['- item', '\\- item'],
    ['+ item', '\\+ item'],
    ['> q', '\\> q'],
    ['1. one', '1\\. one'],
    ['2) two', '2\\) two'],
    ['---', '\\---'],
  ])('%s cannot start a block', (source, expected) => {
    expect(md({ type: 'list', title: 'T', note: 'n', items: [source] })).toContain(
      `- ${expected}\n`,
    )
  })

  it('escapes a closing heading sequence', () => {
    expect(md({ title: 'A #', body: [] })).toBe('### A \\#\n')
  })

  it('keeps a value on one line', () => {
    const value = 'a\n# b\r\n- c\u2028d'
    expect(md({ type: 'list', items: [value] })).toBe('- a # b - c d\n')
    expect(plain({ type: 'list', items: [value] })).toBe('- a # b - c d\n')
    expect(md({ title: value, body: [] })).toBe('### a # b - c d\n')
  })

  it('keeps a table row in one piece', () => {
    const output = md({
      type: 'table',
      columns: ['A|B', 'C:code'],
      rows: [
        ['x|y\nz', 'p|q'],
        ['`a|b`', 'r'],
      ],
    })
    expect(output.split('\n')).toEqual([
      '| A\\|B | C |',
      '| --- | --- |',
      '| x\\|y z | `p\\|q` |',
      '| `a\\|b` | `r` |',
      '',
    ])
  })

  it('encodes a link target so it cannot end early or break a row', () => {
    const output = md({
      type: 'table',
      columns: ['L:link'],
      rows: [['[x](https://a.dev/p(1)|q)'], ['https://a.dev/a\\b)']],
    })
    expect(output).toContain('[x](https://a.dev/p%281%29%7Cq)')
    expect(output).toContain('(https://a.dev/a%5Cb%29)')
  })

  it('keeps a code span and a fence closed around backticks', () => {
    expect(md({ type: 'kv', pairs: [['a', 'x`y', 'code']] })).toBe('- **a:** ``x`y``\n')
    expect(md({ type: 'kv', pairs: [['a', '`y', 'code']] })).toBe('- **a:** `` `y ``\n')
    expect(md({ type: 'kv', pairs: [['a', '', 'code']] })).toBe('- **a:**\n')
    expect(md({ type: 'code', text: '```\n````\n' })).toBe('`````\n```\n````\n\n`````\n')
    expect(md({ type: 'code', text: 'x', lang: 'ts`` "><b>' })).toBe('```tsb\nx\n```\n')
  })
})

describe('terminal safety (§15.1)', () => {
  const hostile = '\u001b]0;pwned\u0007\u001b[2J\u001b[31mred\u009b0m\u0008\u0000\u007f\u0085'

  it.each([
    ['title', { title: hostile, body: [] }],
    ['inline', { type: 'list', items: [hostile] }],
    ['code', { type: 'code', text: hostile }],
    ['log', { type: 'log', text: hostile }],
    ['table', { type: 'table', columns: ['A'], rows: [[hostile]] }],
    ['hunk', { type: 'diff', files: [['a', 1, 1]], hunks: { a: hostile } }],
  ] as [string, JsonValue][])('%s has no control characters in either format', (_, input) => {
    for (const output of [md(input), plain(input)]) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting their absence.
      expect(output).not.toMatch(/[\0-\x09\x0b-\x1f\x7f-\x9f]/)
      expect(output).toContain('red')
    }
  })

  it('removes a whole sequence from plain text', () => {
    expect(plain({ type: 'code', text: '\u001b[1;31mred\u001b[0m\r\nx' })).toBe('    red\n    x\n')
  })

  it('keeps tabs', () => {
    expect(md({ type: 'code', text: 'a\tb' })).toContain('a\tb')
  })
})

describe('lenient rendering (§9.3, §17.1)', () => {
  it('shows an unknown component as one line and goes on', () => {
    const output = md({ body: [{ type: 'hologram', x: 1 }, 'after'] })
    expect(output).toBe('_Unsupported component: hologram_\n\nafter\n')
    expect(plain({ body: [{ type: '__proto__' }] })).toBe('Unsupported component: __proto__\n')
  })

  it('shows a broken node as one line and goes on', () => {
    const broken = {
      vui: 1,
      density: 'compact',
      locale: 'en-US',
      body: [
        { type: 'list', items: 5 },
        { type: 'md', text: 'after' },
      ],
    }
    expect(renderMarkdown(cast(broken))).toBe('_Could not render list_\n\nafter\n')
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['no body', {}],
    ['body not a list', { body: 5 }],
    ['a null node', { body: [null] }],
    ['a node with no type', { body: [{}] }],
    ['a bad title', { title: 5, body: [] }],
    [
      'a bad locale',
      {
        locale: 'not a locale!',
        body: [
          {
            type: 'table',
            columns: [{ key: 'a', label: 'a' }],
            rows: [['b'], ['a']],
            sort: [0, 'asc'],
          },
        ],
      },
    ],
  ])('never throws on %s', (_, input) => {
    expect(typeof renderMarkdown(cast(input))).toBe('string')
    expect(typeof renderPlain(cast(input))).toBe('string')
  })

  it('renders object rows left by the cell cap as empty rows', () => {
    const table = {
      type: 'table',
      columns: [{ key: 'a', label: 'A' }],
      rows: [{ a: 1 }],
      pageSize: 25,
      sticky: false,
    }
    expect(renderMarkdown(cast({ locale: 'en-US', body: [table] }))).toBe('| A |\n| --- |\n| — |\n')
  })

  it('survives a cyclic value from a host', () => {
    const node: Record<string, unknown> = { type: 'stack' }
    node.children = [node]
    expect(typeof renderMarkdown(cast({ locale: 'en-US', body: [node] }))).toBe('string')
    expect(typeof renderPlain(cast({ locale: 'en-US', body: [node] }))).toBe('string')
  })

  it('reads a key named __proto__ as data', () => {
    const hunks = JSON.parse('{"__proto__": "+x"}')
    const document = cast({
      locale: 'en-US',
      body: [{ type: 'diff', files: [['__proto__', 1, 0]], hunks }],
    })
    expect(renderMarkdown(document)).toContain('+x')
    const flow = cast({
      locale: 'en-US',
      body: [{ type: 'flow', nodes: ['__proto__'], edges: [] }],
    })
    expect(renderPlain(flow)).toBe('- __proto__\n')
  })
})

describe('hostile size stays fast', () => {
  const size = 20_000
  const cases: [string, unknown][] = [
    ['quotes', { type: 'md', text: '>'.repeat(size) }],
    ['spaces in a heading', { type: 'md', text: `### a${' '.repeat(size)}b` }],
    ['hashes in a heading', { type: 'md', text: `### a ${'#'.repeat(size)}x` }],
    [
      'indented items',
      { type: 'md', text: Array.from({ length: 190 }, (_, i) => `${' '.repeat(i)}- a`).join('\n') },
    ],
    ['backticks', { type: 'code', text: '`a'.repeat(size) }],
    ['ampersands', { type: 'md', text: '&a'.repeat(size / 2) }],
    ['spaces', { type: 'md', text: ' '.repeat(size) }],
    ['newlines', { type: 'md', text: '\n'.repeat(size) }],
  ]

  it.each(cases)('%s', (_, node) => {
    const document = cast({ locale: 'en-US', body: [node] })
    const started = performance.now()
    expect(renderMarkdown(document)).not.toMatch(/Could not render/)
    expect(renderPlain(document)).not.toMatch(/Could not render/)
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('handles more items than a spread can take', () => {
    const count = 200_000
    const code = { type: 'code', text: '`a'.repeat(count) }
    const table = {
      type: 'table',
      columns: [{ key: 'a', label: 'A' }],
      rows: Array.from({ length: count }, () => ['x']),
    }
    const document = cast({ locale: 'en-US', body: [code, table] })
    expect(renderMarkdown(document)).not.toMatch(/Could not render/)
    expect(renderPlain(document)).not.toMatch(/Could not render/)
  })
})
