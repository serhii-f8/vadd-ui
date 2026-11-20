import { COMPONENT_TYPES, type JsonValue, type VuiDocument, validate } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { renderMarkdown, renderPlain } from '../src/index.js'

function documentOf(input: JsonValue): VuiDocument {
  const { document } = validate(input)
  if (document === undefined) throw new Error('unreadable fixture')
  return document
}

const md = (input: JsonValue) => renderMarkdown(documentOf(input))
const plain = (input: JsonValue) => renderPlain(documentOf(input))

function both(input: JsonValue, markdown: string, text: string = markdown): void {
  expect(md(input)).toBe(`${markdown}\n`)
  expect(plain(input)).toBe(`${text}\n`)
}

const child = { type: 'callout', text: 'x', tone: 'muted' }
const inner = { type: 'list', items: ['x'] }

describe('envelope and common fields', () => {
  it('writes title and subtitle', () => {
    both(
      { title: 'T', subtitle: 'on **main**', body: [] },
      '### T\n\n_on **main**_',
      'T\n\non main',
    )
  })

  it('gives an empty document no output', () => {
    expect(renderMarkdown(documentOf({ body: [] }))).toBe('')
    expect(renderPlain(documentOf({ body: [] }))).toBe('')
  })

  it('adds a heading for title and a muted line for note', () => {
    both(
      { type: 'list', title: 'L', note: 'n', items: ['x'] },
      '#### L\n\n- x\n\n_n_',
      'L\n\n- x\n\nn',
    )
  })

  it('nests headings and stops at level 6', () => {
    const nest = (body: JsonValue, depth: number): JsonValue =>
      depth === 0
        ? body
        : { type: 'section', title: `s${depth}`, children: [nest(body, depth - 1)] }
    expect(md(nest(inner, 4))).toBe('#### s4\n\n##### s3\n\n###### s2\n\n###### s1\n\n- x\n')
  })

  it('nests under any titled container', () => {
    expect(
      md({ type: 'card', title: 'C', children: [{ type: 'list', title: 'L', items: [] }] }),
    ).toBe('#### C\n\n##### L\n')
  })

  it('formats with the document locale and generatedAt', () => {
    const input = {
      locale: 'pl-PL',
      generatedAt: '2026-11-04T10:15:00Z',
      body: [
        {
          type: 'kv',
          pairs: [
            ['a', 1234.5, 'num'],
            ['b', '2026-11-04T10:12:00Z', 'rel'],
          ],
        },
      ],
    }
    expect(md(input)).toBe('- **a:** 1 234,5\n- **b:** 3 min temu\n')
  })
})

describe('links', () => {
  it('prints the target in plain text unless it says nothing new', () => {
    both(
      {
        type: 'list',
        items: ['[a](https://a.dev)', '[b](#top)', '[https://c.dev](https://c.dev)'],
      },
      '- [a](https://a.dev)\n- [b](#top)\n- [https\\://c.dev](https://c.dev)',
      '- a (https://a.dev)\n- b\n- https://c.dev',
    )
  })
})

describe('adjacent lists', () => {
  const list = (ordered: boolean, item: string) => ({ type: 'list', ordered, items: [item] })

  it('change marker, or GFM merges them into one list', () => {
    both(
      { body: [list(false, 'a'), list(false, 'b'), list(false, 'c'), 'd', list(false, 'e')] },
      '- a\n\n* b\n\n- c\n\nd\n\n- e',
      '- a\n\n- b\n\n- c\n\nd\n\n- e',
    )
    both({ body: [list(true, 'a'), list(true, 'b')] }, '1. a\n\n1) b', '1. a\n\n1. b')
  })

  it('keep the marker when the kind differs, or a list between them is empty', () => {
    expect(md({ body: [list(false, 'a'), list(true, 'b')] })).toBe('- a\n\n1. b\n')
    expect(md({ body: [list(false, 'a'), { type: 'list', items: [] }, list(true, 'b')] })).toBe(
      '- a\n\n1. b\n',
    )
    expect(md({ body: [{ type: 'list', items: [] }, list(false, 'a')] })).toBe('- a\n')
  })
})

describe('layout', () => {
  it('stack, grid and card print children in order', () => {
    for (const type of ['stack', 'grid', 'card']) {
      both({ type, children: ['one', 'two'] }, 'one\n\ntwo')
    }
  })

  it('section is a heading plus children', () => {
    both(
      { type: 'section', title: '**S**', children: ['a'], fold: 'closed' },
      '#### **S**\n\na',
      'S\n\na',
    )
  })

  it('tabs print every panel', () => {
    both(
      {
        type: 'tabs',
        active: 1,
        tabs: [
          { label: 'One', children: ['a'] },
          { label: 'Two', children: [] },
        ],
      },
      '#### One\n\na\n\n#### Two',
      'One\n\na\n\nTwo',
    )
  })

  it('divider is a rule with an optional label', () => {
    both({ type: 'divider' }, '---')
    both({ type: 'divider', label: 'Later' }, '---\n\n_Later_', '---\n\nLater')
  })
})

describe('text', () => {
  it('callout quotes its text with a tone mark', () => {
    both(
      { type: 'callout', text: 'Careful', tone: 'warn', title: 'Note' },
      '> **Note**\n>\n> ⚠ Careful',
      '> Note\n>\n> ⚠ Careful',
    )
    both({ type: 'callout', text: 'Hello' }, '> ℹ Hello')
  })

  it('callout leaves the mark to a leading status token (B8)', () => {
    both(
      { type: 'callout', tone: 'err', text: ':fail: `a.ts:88` fails' },
      '> ✗ fail `a.ts:88` fails',
      '> ✗ fail a.ts:88 fails',
    )
    both({ type: 'callout', tone: 'err', text: 'still :fail:' }, '> ✗ still ✗ fail')
    both({ type: 'callout', tone: 'ok', text: ' :ok: done' }, '> ✓ ok done')
  })

  it('stats flip nothing in text but read better through the same format (VD-212)', () => {
    both(
      {
        type: 'stats',
        items: [
          {
            label: 'p95',
            value: 182,
            format: 'ms',
            delta: -14,
            deltaFormat: 'delta:ms',
            better: 'low',
          },
        ],
      },
      '- **p95:** 182 ms (−14 ms)',
      '- p95: 182 ms (−14 ms)',
    )
  })

  it('code is fenced with its label', () => {
    both({ type: 'code', text: 'a\nb', lang: 'ts' }, '```ts\na\nb\n```', '    a\n    b')
    both({ type: 'code', text: 'a' }, '```\na\n```', '    a')
  })

  it('code and log print no blank line for a final newline', () => {
    both({ type: 'code', text: 'a\n' }, '```\na\n```', '    a')
    both({ type: 'log', text: 'a\n' }, '```log\na\n```', '    a')
    both({ type: 'code', text: 'a\n', lines: true }, '```\n1  a\n```', '    1  a')
  })

  it('code keeps every line past maxLines', () => {
    const text = Array.from({ length: 5 }, (_, i) => `l${i}`).join('\n')
    expect(md({ type: 'code', text, maxLines: 2 })).toContain('l4')
  })

  it('code numbers and marks lines', () => {
    both(
      { type: 'code', text: 'a\nb', lines: true, mark: [2] },
      '```\n  1  a\n> 2  b\n```',
      '      1  a\n    > 2  b',
    )
    both({ type: 'code', text: 'a', lines: true }, '```\n1  a\n```', '    1  a')
    both({ type: 'code', text: 'a\nb', mark: [1] }, '```\n> a\n  b\n```', '    > a\n      b')
  })
})

describe('table', () => {
  const columns = ['Name', 'N:int']

  it('aligns numeric formats right and honours align', () => {
    expect(
      md({
        type: 'table',
        columns: [
          { key: 'a', label: 'A', align: 'center' },
          { key: 'b', label: 'B', format: 'pct' },
          { key: 'c', label: 'C', format: 'num', align: 'left' },
          { key: 'd', label: 'D', format: 'date' },
          { key: 'e', label: 'E' },
        ],
        rows: [['x', 0.5, 1, null, 4]],
      }),
    ).toBe(
      '| A | B | C | D | E |\n| :---: | ---: | --- | --- | ---: |\n| x | 50.0% | 1 | — | 4 |\n',
    )
  })

  it('leaves an all-empty column left aligned', () => {
    expect(md({ type: 'table', columns: ['A'], rows: [[null]] })).toContain('| --- |')
  })

  it('sorts numbers, keeps empty cells last and stays stable', () => {
    const rows = [
      ['a', 2],
      ['b', null],
      ['c', 3],
      ['d', 2],
    ]
    const order = (dir: string) =>
      md({ type: 'table', columns, rows, sort: [1, dir] })
        .split('\n')
        .slice(2, -1)
        .map((line) => line.slice(2, 3))
        .join('')
    expect(order('asc')).toBe('adcb')
    expect(order('desc')).toBe('cadb')
  })

  it('sorts strings by locale and puts numbers before strings', () => {
    const output = md({
      type: 'table',
      columns: ['A'],
      rows: [['b'], ['Á'], [3], ['**a**'], [1]],
      sort: [0, 'asc'],
    })
    expect(output.split('\n').slice(2, -1)).toEqual([
      '| 1 |',
      '| 3 |',
      '| **a** |',
      '| Á |',
      '| b |',
    ])
    const reversed = md({ type: 'table', columns: ['A'], rows: [['b'], [1]], sort: [0, 'desc'] })
    expect(reversed.split('\n').slice(2, -1)).toEqual(['| b |', '| 1 |'])
  })

  it('compares a formatted column by its raw value', () => {
    const output = md({
      type: 'table',
      columns: ['A:date'],
      rows: [['2026-02-01'], ['2026-01-01']],
      sort: [0, 'asc'],
    })
    expect(output.indexOf('Jan')).toBeLessThan(output.indexOf('Feb'))
  })

  it('ignores a sort past the last column', () => {
    const output = md({
      type: 'table',
      columns,
      rows: [
        ['b', 1],
        ['a', 2],
      ],
      sort: [9, 'asc'],
    })
    expect(output.indexOf('| b')).toBeLessThan(output.indexOf('| a'))
  })

  it('marks row tone and prints row note in the first cell', () => {
    both(
      {
        type: 'table',
        columns,
        rows: [
          ['a', 1, { tone: 'err', note: 'slow *path*' }],
          ['b', 2, { tone: 'muted' }],
        ],
      },
      '| Name | N |\n| --- | ---: |\n| a ✗ — slow *path* | 1 |\n| b | 2 |',
      'Name             N\n---------------  -\na ✗ — slow path  1\nb                2',
    )
  })

  it('adds totals in bold, formatted like the columns', () => {
    both(
      { type: 'table', columns, rows: [['a', 1000]], totals: ['Sum', 1000] },
      '| Name | N |\n| --- | ---: |\n| a | 1,000 |\n| **Sum** | **1,000** |',
      'Name      N\n----  -----\na     1,000\nSum   1,000',
    )
    expect(md({ type: 'table', columns, rows: [], totals: ['Sum'] })).toContain('| **—** |')
  })

  it('adds a sub-header when the group value changes', () => {
    both(
      {
        type: 'table',
        columns: ['Team', 'N:int'],
        rows: [
          ['a', 1],
          ['a', 2],
          ['b', 3],
        ],
        group: 0,
      },
      '| Team | N |\n| --- | ---: |\n| **a** |  |\n| a | 1 |\n| a | 2 |\n| **b** |  |\n| b | 3 |',
      'Team  N\n----  -\na\na     1\na     2\nb\nb     3',
    )
  })

  it('groups after sorting', () => {
    const output = md({
      type: 'table',
      columns: ['T', 'N:int'],
      rows: [
        ['a', 1],
        ['b', 2],
        ['a', 3],
      ],
      group: 0,
      sort: [1, 'desc'],
    })
    expect(output.match(/\*\*a\*\*/g)).toHaveLength(2)
  })

  it('shows a missing code cell the same as a null one', () => {
    const columns = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B', cell: 'code' },
    ]
    const document = documentOf({ body: [] })
    document.body = [
      { type: 'table', columns, rows: [['x'], ['y', null]], pageSize: 25, sticky: false },
    ] as never
    expect(renderMarkdown(document)).toBe('| A | B |\n| --- | --- |\n| x | — |\n| y | — |\n')
  })

  it('writes no empty emphasis', () => {
    const output = md({ type: 'table', columns: ['A'], rows: [['']], totals: [''], group: 0 })
    expect(output).not.toContain('****')
  })

  it('keeps edge spaces outside emphasis, where GFM needs them', () => {
    expect(md({ type: 'kv', pairs: [[' k', 1]] })).toBe('- **k:** 1\n')
    expect(md({ type: 'list', items: ['*a* [ b](https://a.dev)'] })).toContain('*a*')
    expect(
      md({ body: [{ type: 'table', columns: ['A', 'B'], rows: [], totals: [' a ', null] }] }),
    ).toContain('| **a** |')
  })

  it('sorts an explicit text column like a default one', () => {
    const output = md({
      type: 'table',
      columns: [{ key: 'a', label: 'A', format: 'text' }],
      rows: [['**z**'], ['b']],
      sort: [0, 'asc'],
    })
    expect(output.indexOf('| b |')).toBeLessThan(output.indexOf('| **z** |'))
  })

  it('prints all rows past pageSize', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [`r${i}`])
    expect(md({ type: 'table', columns: ['A'], rows, pageSize: 2 })).toContain('r29')
  })

  it('draws status, code, link, path and badge cells', () => {
    both(
      {
        type: 'table',
        columns: [
          'S:status',
          'P:path',
          'L:link',
          { key: 'c', label: 'C', cell: 'code' },
          { key: 'b', label: 'B', cell: 'badge', tones: { high: 'err' } },
          { key: 'r', label: 'R', cell: 'bar', format: 'pct:0' },
        ],
        rows: [['ok', 'src/a.ts', '[x](https://x.dev)', 'v', 'high', 0.5]],
      },
      '| S | P | L | C | B | R |\n| --- | --- | --- | --- | --- | ---: |\n| ✓ ok | `src/a.ts` | [x](https://x.dev) | `v` | high ✗ | 50% |',
      'S     P         L                  C  B         R\n----  --------  -----------------  -  ------  ---\n✓ ok  src/a.ts  x (https://x.dev)  v  high ✗  50%',
    )
  })

  it('lets a tone beat a status format in a badge cell, as the DOM does', () => {
    const columns = [
      { key: 'b', label: 'B', format: 'status', cell: 'badge', tones: { warn: 'err' } },
    ]
    expect(md({ type: 'table', columns, rows: [['warn']] })).toContain('| warn ✗ |')
  })

  it('leaves out a row note that is not text', () => {
    const output = md({ type: 'table', columns: ['A'], rows: [['x', { note: 5 }]] })
    expect(output).toContain('| x |')
  })

  it('marks a status word in a badge cell', () => {
    const columns = [{ key: 'b', label: 'B', cell: 'badge' }]
    const output = md({ type: 'table', columns, rows: [['ok']] })
    expect(output).toContain('| ✓ ok |')
  })

  it('renders nothing for a table with no columns', () => {
    const document = documentOf({ body: [] })
    document.body = [{ type: 'table', columns: [], rows: [], pageSize: 25, sticky: false }]
    expect(renderMarkdown(document)).toBe('')
  })
})

describe('plain table width (§15.1)', () => {
  const PAD_CAP = 40
  const long = (column: number) => `${column}`.padEnd(2_000, 'x')

  // §13.4's table at its limits, inside 256 KiB: 5,000 rows, a 2,000-char cell (the string
  // limit) heading each of 12 columns. Padding every cell to the widest built 110 MB.
  it('pads no column past the cap, so output grows with the cells and not their product', () => {
    const cols = 12
    const rows = Array.from({ length: 5_000 }, (_, row) =>
      Array.from({ length: cols }, (_, column) => (row === 0 ? long(column) : row % 10)),
    )
    const input = {
      type: 'table',
      columns: Array.from({ length: cols }, (_, column) => `c${column}`),
      rows,
      pageSize: 5_000,
    }
    const text = JSON.stringify({ body: [input] })
    expect(text.length).toBeLessThan(262_144)
    expect(validate(JSON.parse(text)).ok).toBe(true)
    const markdown = md(input)
    const output = plain(input)
    // Each cell is its own text plus at most PAD_CAP + 2 spaces: linear in the cells.
    const cells = (rows.length + 2) * cols
    expect(output.length).toBeLessThanOrEqual(markdown.length + cells * (PAD_CAP + 2))
    // Content is never cut: every long cell is whole.
    for (let column = 0; column < cols; column++) expect(output).toContain(long(column))
  })

  it('lets a cell longer than the cap overflow its column, and pads short columns as before', () => {
    const wide = 'w'.repeat(PAD_CAP + 5)
    expect(
      plain({
        type: 'table',
        columns: ['A', 'B'],
        rows: [
          [wide, 'b'],
          ['a', 'bb'],
        ],
      }),
    ).toBe(
      `${'A'.padEnd(PAD_CAP)}  B\n${'-'.repeat(PAD_CAP)}  --\n${wide}  b\n${'a'.padEnd(PAD_CAP)}  bb\n`,
    )
  })
})

describe('data', () => {
  it('kv takes tuples or an object', () => {
    both(
      {
        type: 'kv',
        pairs: [
          ['Size', 2048, 'bytes'],
          ['Who', 'me'],
        ],
      },
      '- **Size:** 2.0 KiB\n- **Who:** me',
      '- Size: 2.0 KiB\n- Who: me',
    )
    both({ type: 'kv', pairs: { a: 1 } }, '- **a:** 1', '- a: 1')
  })

  it('stats prints value, tone, delta and spark', () => {
    both(
      {
        type: 'stats',
        items: [
          {
            label: 'Hit',
            value: 0.93,
            format: 'pct',
            delta: 0.04,
            deltaFormat: 'delta:pct',
            tone: 'ok',
            spark: [1, 2, 3],
          },
          { label: 'N', value: 5, delta: 2, spark: [] },
        ],
      },
      '- **Hit:** 93.0% ✓ (+4.0%) ▁▅█\n- **N:** 5 (+2)',
      '- Hit: 93.0% ✓ (+4.0%) ▁▅█\n- N: 5 (+2)',
    )
  })

  it('list prints marks, notes and numbers', () => {
    both(
      {
        type: 'list',
        ordered: true,
        items: ['*one*', { text: 'two', status: 'fail', note: 'why' }, { text: 'three' }],
      },
      '1. *one*\n2. ✗ two — why\n3. three',
      '1. one\n2. ✗ two — why\n3. three',
    )
  })

  it('progress prints value of max and segments', () => {
    both(
      { type: 'progress', value: 45, label: 'Done' },
      '**Done:** 45 of 100 (45%)',
      'Done: 45 of 100 (45%)',
    )
    both(
      {
        type: 'progress',
        value: 3,
        max: 4,
        segments: [
          { value: 3, tone: 'ok', label: 'Pass' },
          { value: 1, tone: 'muted', label: 'Skip' },
        ],
      },
      '3 of 4 (75%)\n\n- ✓ Pass: 3\n- Skip: 1',
    )
    both({ type: 'progress', value: 1, max: 0 }, '1 of 0')
  })

  it('compare ignores an unknown better value', () => {
    const input = {
      type: 'compare',
      options: ['A'],
      criteria: [{ label: 'c', values: [1], better: 'constructor' }],
    }
    expect(md(input)).toContain('| c | 1 |')
  })

  it('compare marks the computed winner when there is no pick (VD-183)', () => {
    const input = {
      type: 'compare',
      options: ['A', 'B', 'C'],
      criteria: [
        { label: 'p95', values: [80, 60, 60], format: 'ms', better: 'low' },
        { label: 'RPS', values: [1, 3, 2], better: 'high' },
        { label: 'Cost', values: [3, 1, 2], better: 'low' },
      ],
    }
    expect(md(input as JsonValue)).toBe(
      '|  | A | B ✓ | C |\n| --- | --- | --- | --- |\n' +
        '| p95 ↓ | 80 ms | **60 ms** | **60 ms** |\n| RPS ↑ | 1 | **3** | 2 |\n' +
        '| Cost ↓ | 3 | **1** | 2 |\n',
    )
    const tie: JsonValue = {
      type: 'compare',
      options: input.options,
      criteria: [
        { label: 'p95', values: [80, 60, 70], better: 'low' },
        { label: 'RPS', values: [1, 2, 3], better: 'high' },
      ],
    }
    expect(md(tie).split('\n')[0]).toBe('|  | A | B | C |')
  })

  it('compare is a matrix with the pick marked', () => {
    both(
      {
        type: 'compare',
        options: ['A', 'B'],
        pick: 1,
        criteria: [
          { label: 'p95', values: [80, 120], format: 'ms', better: 'low' },
          { label: 'RPS', values: [1000, 900], format: 'int', better: 'high' },
          { label: 'Note', values: ['x', null] },
        ],
      },
      '|  | A | B ✓ |\n| --- | --- | --- |\n| p95 ↓ | **80 ms** | 120 ms |\n| RPS ↑ | **1,000** | 900 |\n| Note | x | — |',
      '       A      B ✓\n-----  -----  ------\np95 ↓  80 ms  120 ms\nRPS ↑  1,000  900\nNote   x      —',
    )
  })
})

describe('chart', () => {
  const series = { a: [1, 2], b: [3, 4] }

  it.each([
    ['bar', 'Bar chart'],
    ['hbar', 'Horizontal bar chart'],
    ['stacked', 'Stacked bar chart'],
    ['line', 'Line chart'],
    ['area', 'Area chart'],
    ['donut', 'Donut chart'],
  ])('%s has a caption, then its data (VD-217)', (kind, label) => {
    const byCategory = kind !== 'line' && kind !== 'area'
    const a = byCategory ? 'Q1 1, Q2 2' : '1, 2'
    const b = byCategory ? 'Q1 3, Q2 4' : '3, 4'
    both(
      { type: 'chart', kind, x: ['Q1', 'Q2'], series },
      `_${label}: a, b over Q1–Q2._\n\n- **a:** ${a}\n- **b:** ${b}`,
      `${label}: a, b over Q1–Q2.\n\n- a: ${a}\n- b: ${b}`,
    )
  })

  it('keeps each value against its own category across a gap', () => {
    const document = {
      vui: 1,
      locale: 'en-US',
      density: 'compact',
      body: [{ type: 'chart', kind: 'bar', x: ['a', 'b', 'c'], series: { s: [1, null, 3] } }],
    } as unknown as VuiDocument
    expect(renderPlain(document)).toBe('Bar chart: s over a–c.\n\n- s: a 1, c 3\n')
  })

  it('keeps last, min and max of a series past 8 points, in yFormat', () => {
    const values = [5, 1, 9, 3, 4, 6, 2, 8, 7]
    expect(
      plain({
        type: 'chart',
        kind: 'line',
        yFormat: 'ms',
        x: values.map(String),
        series: { p95: values },
      }),
    ).toBe('Line chart: p95 over 5–7.\n\n- p95: last 7 ms, min 1 ms, max 9 ms\n')
  })

  it('formats x with xFormat and reference lines with yFormat', () => {
    expect(
      plain({
        type: 'chart',
        kind: 'line',
        x: ['2026-01-01', '2026-02-01'],
        xFormat: 'date',
        yFormat: 'pct',
        series: { a: [1, 2] },
        refLines: [
          { y: 0.5, label: 'Half', tone: 'warn' },
          { y: 0.9, label: 'Goal', tone: 'ok' },
        ],
      }),
    ).toBe(
      'Line chart: a over Jan 1, 2026–Feb 1, 2026; Half 50.0%, Goal 90.0%.\n\n- a: 100.0%, 200.0%\n',
    )
  })

  it('leaves out parts with no data', () => {
    expect(plain({ type: 'chart', kind: 'bar', x: ['Q1'], series: { a: [1] } })).toBe(
      'Bar chart: a over Q1.\n\n- a: Q1 1\n',
    )
    expect(plain({ type: 'chart', kind: 'bar', x: ['Q1'], series: { a: [] } })).toBe(
      'Bar chart: a over Q1.\n',
    )
    expect(plain({ type: 'chart', kind: 'bar', x: [], series: {} })).toBe('Bar chart.\n')
  })

  it('spark draws bars and scatter counts points', () => {
    both(
      { type: 'chart', kind: 'spark', values: [1, 5, 9] },
      '_Sparkline: ▁▅█._',
      'Sparkline: ▁▅█.',
    )
    both({ type: 'chart', kind: 'spark', values: [2, 2] }, '_Sparkline: ▄▄._', 'Sparkline: ▄▄.')
    both(
      {
        type: 'chart',
        kind: 'scatter',
        points: [
          [1, 2],
          [3, 4, 'x'],
        ],
        refLines: [{ y: 1, label: 'R', tone: 'ok' }],
      },
      '_Scatter chart: 2 points; R 1._',
      'Scatter chart: 2 points; R 1.',
    )
  })

  it('leaves an empty spark with no subject', () => {
    both({ type: 'chart', kind: 'spark', values: [] }, '_Sparkline._', 'Sparkline.')
  })

  it('samples a long spark to 40 bars', () => {
    const values = Array.from({ length: 10_000 }, (_, i) => i)
    const line = plain({ type: 'chart', kind: 'spark', values })
    expect(Array.from(line.slice('Sparkline: '.length, -2))).toHaveLength(40)
  })

  it('keeps document order except across a table that follows', () => {
    const chart = { type: 'chart', kind: 'spark', values: [1] }
    const table = { type: 'table', columns: ['A'], rows: [['x']] }
    const kinds = (body: JsonValue[]) =>
      plain({ body })
        .split('\n\n')
        .map((part) => (part.startsWith('Spark') ? 'c' : part.startsWith('A') ? 't' : 'm'))
        .join('')
    expect(kinds([chart, table])).toBe('tc')
    expect(kinds([chart, chart, table])).toBe('tcc')
    expect(kinds([chart, table, table])).toBe('tct')
    expect(kinds([table, chart])).toBe('tc')
    expect(kinds([chart, 'text', table])).toBe('cmt')
  })
})

describe('dev workflow', () => {
  it('checks prints name, command and duration', () => {
    both(
      {
        type: 'checks',
        items: [
          { name: 'lint', status: 'ok', cmd: 'pnpm lint', ms: 1240 },
          { name: 'test', status: 'none' },
        ],
      },
      '- ✓ lint `pnpm lint` — 1.24 s\n- test',
      '- ✓ lint pnpm lint — 1.24 s\n- test',
    )
  })

  it('checks output is fenced, ANSI free and limited to the last 20 lines', () => {
    const output = Array.from({ length: 25 }, (_, i) => `\u001b[31mline ${i + 1}\u001b[0m`).join(
      '\n',
    )
    const rendered = md({ type: 'checks', items: [{ name: 'a', status: 'fail', output }] })
    expect(rendered.split('\n').slice(0, 3)).toEqual(['- ✗ a', '  ```', '  … 5 earlier lines'])
    expect(rendered).toContain('  line 6\n')
    expect(rendered).not.toContain('line 5\n')
    expect(rendered).not.toContain('[31m')
    expect(rendered.endsWith('  line 25\n  ```\n')).toBe(true)
  })

  it('checks output counts a trailing newline as no line', () => {
    const lines = (count: number) => Array.from({ length: count }, (_, i) => `l${i + 1}`).join('\n')
    const render = (output: string) =>
      md({ type: 'checks', items: [{ name: 'a', status: 'ok', output }] })
    const twenty = render(`${lines(20)}\n`)
    expect(twenty).not.toContain('earlier')
    expect(twenty).toContain('  l1\n')
    expect(twenty.endsWith('  l20\n  ```\n')).toBe(true)
    expect(render(`${lines(21)}\n`)).toContain('… 1 earlier line\n')
  })

  it('plan counts every level and nests', () => {
    both(
      {
        type: 'plan',
        items: [
          { text: 'One', status: 'ok', note: 'n', children: [{ text: 'Two', status: 'ok' }] },
          { text: 'Three', status: 'run', children: [] },
        ],
      },
      '2/3 done\n\n- ✓ One — n\n  - ✓ Two\n- ▶ Three',
    )
  })

  it('diff lists files and nests hunks', () => {
    both(
      {
        type: 'diff',
        files: [
          ['a.ts', 3, 1, 'M'],
          ['b.ts', 1, 0],
        ],
        hunks: { 'a.ts': '-x\n+y', 'c.ts': '+z' },
      },
      '- M `a.ts` +3 −1\n  ```diff\n  -x\n  +y\n  ```\n- `b.ts` +1 −0\n- `c.ts`\n  ```diff\n  +z\n  ```',
      '- M a.ts +3 −1\n      -x\n      +y\n- b.ts +1 −0\n- c.ts\n      +z',
    )
  })

  it('tree nests items', () => {
    both(
      {
        type: 'tree',
        items: [
          { name: 'src', children: [{ name: 'a.ts', status: 'ok', note: 'new' }] },
          { name: 'b', children: [] },
        ],
      },
      '- src\n  - ✓ a.ts — new\n- b',
    )
  })

  it('tree builds paths into the same shape', () => {
    both(
      { type: 'tree', paths: ['src/a.ts', 'src/b/c.ts', 'd.md', '/src//e'] },
      '- src\n  - a.ts\n  - b\n    - c.ts\n  - e\n- d.md',
    )
  })

  it('tree falls back to paths when items is empty, as the DOM does', () => {
    expect(md({ type: 'tree', items: [], paths: ['a/b'] })).toContain('b')
  })

  it('timeline keeps a date with no time as written, as the DOM does', () => {
    const output = md({ type: 'timeline', items: [{ at: '2026-11-05', text: 'x' }] })
    expect(output).toContain('**2026-11-05**')
  })

  it('timeline formats ISO times and keeps labels', () => {
    both(
      {
        type: 'timeline',
        items: [
          { at: '2026-11-04T10:15:00Z', text: 'Built', status: 'ok' },
          { at: 'Step 2', text: 'Next' },
        ],
      },
      '- **Nov 4, 2026, 10:15 AM UTC** ✓ Built\n- **Step 2** Next',
      '- Nov 4, 2026, 10:15 AM UTC ✓ Built\n- Step 2 Next',
    )
  })

  it('diff takes null hunks as none', () => {
    const body = [{ type: 'diff', files: [['a', 1, 2]], hunks: null }]
    expect(renderMarkdown({ body } as never)).toBe('- `a` +1 −2\n')
  })

  it('decision marks the pick and lists details', () => {
    both(
      {
        type: 'decision',
        question: 'Cache?',
        context: 'See *notes*',
        pick: 1,
        options: [
          { label: 'LRU' },
          {
            label: 'Redis',
            pros: ['Shared', 'Fast'],
            cons: ['New'],
            effort: 'M',
            reversible: false,
            risk: 'low',
            verify: 'p95 < 80',
          },
        ],
      },
      '**Cache?**\n\nSee *notes*\n\n- **LRU**\n- **Redis** ✓ recommended\n  - Pros: Shared; Fast\n  - Cons: New\n  - Effort: M\n  - Reversible: no\n  - Risk: low\n  - Verify: p95 < 80',
      'Cache?\n\nSee notes\n\n- LRU\n- Redis ✓ recommended\n  - Pros: Shared; Fast\n  - Cons: New\n  - Effort: M\n  - Reversible: no\n  - Risk: low\n  - Verify: p95 < 80',
    )
    expect(
      plain({
        type: 'decision',
        question: 'Q',
        options: [{ label: 'A', reversible: true }],
      }),
    ).toContain('Reversible: yes')
  })

  it('log is fenced and keeps every line', () => {
    both(
      { type: 'log', text: 'ERROR x\nINFO y', maxLines: 1 },
      '```log\nERROR x\nINFO y\n```',
      '    ERROR x\n    INFO y',
    )
  })

  it('flow lists a cycle and a self-loop once per node, and terminates', () => {
    expect(
      md({
        type: 'flow',
        nodes: ['a', 'b'],
        edges: [
          ['a', 'b'],
          ['b', 'a', 'retry'],
          ['b', 'b'],
        ],
      }),
    ).toBe('- a\n  - → b\n- b\n  - → a (retry)\n  - → b\n')
  })

  it('flow nests edges under their source', () => {
    both(
      {
        type: 'flow',
        nodes: ['a', { id: 'b', label: 'Build', status: 'ok' }, 'c'],
        edges: [
          ['a', 'b', 'then'],
          ['a', 'c'],
          ['z', 'nowhere'],
        ],
      },
      '- a\n  - → Build (then)\n  - → c\n- ✓ Build\n- c\n- z\n  - → nowhere',
    )
  })
})

describe('coverage of the catalog', () => {
  const samples: Record<string, JsonValue> = {
    stack: { type: 'stack', children: [child] },
    grid: { type: 'grid', children: [child] },
    section: { type: 'section', title: 'S', children: [child] },
    card: { type: 'card', children: [child] },
    tabs: { type: 'tabs', tabs: [{ label: 'L', children: [child] }] },
    divider: { type: 'divider' },
    md: { type: 'md', text: 'x' },
    callout: child,
    code: { type: 'code', text: 'x' },
    table: { type: 'table', columns: ['A'], rows: [['x']] },
    kv: { type: 'kv', pairs: { a: 1 } },
    stats: { type: 'stats', items: [{ label: 'a', value: 1 }] },
    list: inner,
    progress: { type: 'progress', value: 1 },
    compare: { type: 'compare', options: ['a'], criteria: [{ label: 'c', values: [1] }] },
    chart: { type: 'chart', kind: 'spark', values: [1] },
    checks: { type: 'checks', items: [{ name: 'a', status: 'ok' }] },
    plan: { type: 'plan', items: [{ text: 'a', status: 'ok' }] },
    diff: { type: 'diff', files: [['a', 1, 1]] },
    tree: { type: 'tree', paths: ['a'] },
    timeline: { type: 'timeline', items: [{ at: 'x', text: 'a' }] },
    decision: { type: 'decision', question: 'q', options: [{ label: 'a' }] },
    log: { type: 'log', text: 'x' },
    flow: { type: 'flow', nodes: ['a'], edges: [] },
  }

  it.each([...COMPONENT_TYPES])('%s renders in both formats', (type) => {
    const sample = samples[type]
    expect(sample).toBeDefined()
    const input = sample as JsonValue
    for (const output of [md(input), plain(input)]) {
      expect(output.length).toBeGreaterThan(0)
      expect(output).not.toMatch(/Unsupported component|Could not render/)
    }
  })
})
