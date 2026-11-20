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
    ['<script>alert(1)</script>', '&lt;script>alert(1)&lt;/script>'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)>'],
    ['<!-- c -->', '&lt;!-- c -->'],
    ['<?php ?>', '&lt;?php ?>'],
    ['<http://a.dev>', '&lt;http\\://a.dev>'],
    ['&lt;b&gt;', '&amp;lt;b&amp;gt;'],
    ['&#60;', '&amp;#60;'],
    ['a < b && c > d', 'a < b && c > d'],
    ['[x](javascript:alert(1))', '\\[x\\](javascript:alert(1))'],
    ['[x](data:text/html,a)', '\\[x\\](data:text/html,a)'],
    ['![x](http:evil)', '!\\[x\\](http:evil)'],
    ['_ em_', '\\_ em\\_'],
    ['_em_', '*em*'],
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
    ['-- -', '\\-- -'],
  ])('%s cannot start a block', (source, expected) => {
    expect(md({ type: 'list', title: 'T', note: 'n', items: [source] })).toContain(
      `- ${expected}\n`,
    )
  })

  it('never turns a `!` before a link into an image, which would load a remote asset', () => {
    const source = '![x](https://evil.dev/p.png)'
    const expected = '\\![x](https://evil.dev/p.png)'
    expect(md({ type: 'list', items: [source] })).toBe(`- ${expected}\n`)
    expect(md({ type: 'md', text: `a ${source}` })).toBe(`a ${expected}\n`)
    expect(md({ type: 'list', items: ['**a**![x](https://a.dev)'] })).toBe(
      '- **a**\\![x](https://a.dev)\n',
    )
  })

  it('leaves a `!` elsewhere alone', () => {
    expect(md({ type: 'list', items: ['Done! [x](https://a.dev)!'] })).toBe(
      '- Done! [x](https://a.dev)!\n',
    )
  })

  it('gives a bare URL no autolink, which would run over what follows it', () => {
    expect(md({ type: 'list', items: ['see http://a.dev`<b>`'] })).toBe(
      '- see http\\://a.dev`<b>`\n',
    )
    expect(md({ type: 'list', items: ['HTTPS://a.dev www.a.dev WWW.a.dev awww.a.dev'] })).toBe(
      '- HTTPS\\://a.dev www\\.a.dev WWW\\.a.dev awww.a.dev\n',
    )
    expect(plain({ type: 'list', items: ['see http://a.dev'] })).toBe('- see http://a.dev\n')
  })

  it('keeps a written link live', () => {
    expect(md({ type: 'list', items: ['[a](http://a.dev)'] })).toBe('- [a](http://a.dev)\n')
    expect(md({ type: 'kv', pairs: [['a', 'http://a.dev', 'link']] })).toBe(
      '- **a:** [http\\://a.dev](http://a.dev)\n',
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
    expect(md({ type: 'code', text: '```\n````\n' })).toBe('`````\n```\n````\n`````\n')
    expect(md({ type: 'code', text: 'x', lang: 'ts`` "><b>' })).toBe('```tsb\nx\n```\n')
  })
})

describe('a control character cannot build markup (§15.1)', () => {
  const control = '\u0000'

  it.each([
    ['a tag', `<${control}script>`, '- &lt;script>\n'],
    ['an image', `!${control}[x](https://evil.dev/p.png)`, '- \\![x](https://evil.dev/p.png)\n'],
    ['a heading', `${control}# h`, '- \\# h\n'],
    ['an autolink', `http:${control}//evil.dev`, '- http\\://evil.dev\n'],
  ])('%s', (_, source, expected) => {
    expect(md({ type: 'list', items: [source] })).toBe(expected)
  })

  it('a bell does the same as a null', () => {
    expect(md({ type: 'callout', text: '<\u0007img src=x>', tone: 'muted' })).toBe(
      '> &lt;img src=x>\n',
    )
  })

  it('a fence stays longer than the run a control character was hiding', () => {
    expect(md({ type: 'code', text: `\`\`${control}\`\n<img>` })).toBe('````\n```\n<img>\n````\n')
  })

  it('a carriage return cannot leave a nested block', () => {
    const input = { type: 'diff', files: [['a', 1, 1]], hunks: { a: '+x\r<script>' } }
    expect(md(input)).toBe('- `a` +1 −1\n  ```diff\n  +x\n  <script>\n  ```\n')
  })

  it('reaches object keys', () => {
    expect(md({ type: 'kv', pairs: { [`<${control}b>`]: 1 } })).toBe('- **&lt;b>:** 1\n')
    const series = { [`<${control}b>`]: [1] }
    expect(md({ type: 'chart', kind: 'line', x: ['a'], series })).toContain('&lt;b>')
  })

  it('leaves no residue of an escape sequence in markdown', () => {
    expect(md({ type: 'list', items: ['\u001b[31mred\u001b[0m'] })).toBe('- red\n')
  })

  it('does not count an escape sequence in a plain column', () => {
    expect(
      plain({ type: 'table', columns: ['A', 'B'], rows: [['\u001b[31mred\u001b[0m', 'x']] }),
    ).toBe('A    B\n---  -\nred  x\n')
  })

  it('numbers every line after a carriage return', () => {
    expect(md({ type: 'code', text: 'a\rb', lines: true })).toBe('```\n1  a\n2  b\n```\n')
  })

  it('does not change the input', () => {
    const document = cast({ locale: 'en-US', title: `a${control}`, body: [] })
    renderMarkdown(document)
    expect(document.title).toBe(`a${control}`)
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

  it('ends an unterminated OSC at the line, so it cannot hide what follows', () => {
    const body: JsonValue[] = [
      { type: 'log', text: 'tail \u001b]0;x\nnext' },
      { type: 'checks', items: [{ name: 'e2e', status: 'fail' }] },
    ]
    expect(md({ body })).toBe('```log\ntail \nnext\n```\n\n- ✗ e2e\n')
    expect(plain({ body })).toBe('    tail \n    next\n\n- ✗ e2e\n')
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

  // Fuzzer, seed 20261110, index 1382: `String(type)` threw on an array holding an object with
  // no prototype, and `["md"]` was read as `"md"`.
  it('names no component from a type that is not a string', () => {
    const bare = Object.assign(Object.create(null), { a: 1 })
    for (const type of [['md'], { a: 1 }, [bare], 5, null]) {
      const after = { type: 'md', text: 'after' }
      const document = cast({ vui: 1, body: [{ type, text: 'x' }, after] })
      expect(renderPlain(document)).toBe('Unsupported component: unknown\n\nafter\n')
    }
  })

  it('writes a known rule for a column whose align is wrong (a warn only)', () => {
    const bare = Object.create(null)
    const columns = [
      { key: 'a', label: 'A', align: 'up' },
      { key: 'b', label: 'B', align: [bare] },
    ]
    const document = documentOf({ type: 'table', columns, rows: [['x', 'y']] })
    expect(renderMarkdown(document)).toBe('| A | B |\n| --- | --- |\n| x | y |\n')
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

  it.each([
    ['divider label', { type: 'divider', label: 5 }],
    ['code lang', { type: 'code', text: 'x', lang: 5 }],
    ['code text', { type: 'code', text: 5 }],
    ['check cmd', { type: 'checks', items: [{ name: 'a', status: 'ok', cmd: 5 }] }],
    ['hunk', { type: 'diff', files: [['a', 1, 1]], hunks: { a: 5 } }],
    ['log text', { type: 'log', text: 5 }],
  ] as [string, JsonValue][])('a bad %s costs at most its own node', (_, node) => {
    const output = md({ body: [node, 'after'] })
    expect(output).toContain('after')
    expect(output).not.toContain('this document')
  })

  it('drops a bad title or subtitle and keeps the document', () => {
    expect(renderMarkdown(cast({ locale: 'en-US', title: 5, subtitle: 5, body: [] }))).toBe('')
    const body = [{ type: 'md', text: 'x' }]
    expect(renderMarkdown(cast({ locale: 'en-US', title: 5, subtitle: {}, body }))).toBe('x\n')
  })

  it('survives nesting deeper than the stack, in any kind of value', () => {
    let deep: unknown = 'x'
    for (let depth = 0; depth < 200_000; depth++) deep = [deep]
    const document = cast({ locale: 'en-US', meta: deep, body: [{ type: 'md', text: 'after' }] })
    expect(renderMarkdown(document)).toBe('after\n')
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

  it('caps tree depth, which path splitting would hide from §13.4', () => {
    const path = 'a/'.repeat(990)
    const output = md({
      type: 'tree',
      paths: Array.from({ length: 125 }, (_, i) => `${i}/${path}`),
    })
    expect(output).not.toMatch(/Could not render/)
    expect(output.length).toBeLessThan(500_000)
    const lines = plain({ type: 'tree', paths: ['1/2/3/4/5/6/7/8/9/10/11/12/13/14/15'] }).split(
      '\n',
    )
    expect(lines).toHaveLength(13)
    expect(lines[11]).toBe(`${' '.repeat(22)}- 12/13/14/15`)
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
