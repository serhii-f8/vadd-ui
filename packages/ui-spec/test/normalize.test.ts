import { describe, expect, it } from 'vitest'
import { hasOwn, type JsonObject, type JsonValue } from '../src/json.js'
import { normalize } from '../src/normalize.js'
import { parse } from '../src/parser.js'
import { MAX_TABLE_CELLS, parseColumn } from '../src/table.js'
import { validate } from '../src/validate.js'

const ENVELOPE = { vui: 1, density: 'compact', locale: 'en-US' }

function canonical(input: JsonValue): JsonObject {
  return normalize(input).document as unknown as JsonObject
}

/** The one node of a document whose body has a single node. */
function node(input: JsonValue): JsonObject {
  const [first] = canonical({ body: [input] }).body as JsonValue[]
  return first as JsonObject
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

function relaxed(text: string): JsonValue {
  const result = parse(text)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('shorthand 1: a top-level array', () => {
  it('is the body', () => {
    expect(canonical([{ type: 'divider' }])).toEqual({ ...ENVELOPE, body: [{ type: 'divider' }] })
  })

  it('keeps an empty array as an empty body', () => {
    expect(canonical([])).toEqual({ ...ENVELOPE, body: [] })
  })
})

describe('shorthand 2: a top-level object with a type', () => {
  it('is a one-node body', () => {
    expect(canonical({ type: 'md', text: 'a', title: 'T' })).toEqual({
      ...ENVELOPE,
      body: [{ type: 'md', text: 'a', title: 'T' }],
    })
  })

  it('applies to an unknown or malformed type too', () => {
    expect(canonical({ type: 5 })).toEqual({ ...ENVELOPE, body: [{ type: 5 }] })
  })
})

describe('shorthand 3: a string where a node is expected', () => {
  it('becomes md in body', () => {
    expect(canonical({ body: ['hi'] }).body).toEqual([{ type: 'md', text: 'hi' }])
  })

  it('becomes md in a top-level array', () => {
    expect(canonical(['hi']).body).toEqual([{ type: 'md', text: 'hi' }])
  })

  it.each(['stack', 'grid', 'section', 'card'])('becomes md in %s children', (type) => {
    expect(node({ type, children: ['hi'] }).children).toEqual([{ type: 'md', text: 'hi' }])
  })

  it('becomes md in tabs children', () => {
    const { tabs } = node({ type: 'tabs', tabs: [{ label: 'A', children: ['hi'] }] })
    expect(tabs).toEqual([{ label: 'A', children: [{ type: 'md', text: 'hi' }] }])
  })

  it('applies at every depth', () => {
    const inner = { type: 'card', children: ['deep'] }
    expect(node({ type: 'stack', children: [inner] }).children).toEqual([
      { type: 'card', children: [{ type: 'md', text: 'deep' }] },
    ])
  })

  it('leaves strings alone where items are not nodes', () => {
    expect(node({ type: 'list', items: ['a'] }).items).toEqual(['a'])
    expect(node({ type: 'plan', items: [{ text: 'a', children: ['b'] }] }).items).toEqual([
      { text: 'a', children: ['b'] },
    ])
  })

  it('does not treat a top-level string as a node', () => {
    expect(canonical('hi')).toEqual(ENVELOPE)
  })
})

describe('shorthand 4: a single node for children or items', () => {
  it.each(['stack', 'grid', 'section', 'card'])('wraps a node in %s children', (type) => {
    expect(node({ type, children: { type: 'divider' } }).children).toEqual([{ type: 'divider' }])
  })

  it('wraps a string child and expands it', () => {
    expect(node({ type: 'stack', children: 'hi' }).children).toEqual([{ type: 'md', text: 'hi' }])
  })

  it('wraps a single tab child', () => {
    const { tabs } = node({ type: 'tabs', tabs: [{ label: 'A', children: { type: 'divider' } }] })
    expect(tabs).toEqual([{ label: 'A', children: [{ type: 'divider' }] }])
  })

  it.each(['stats', 'list', 'checks', 'plan', 'tree', 'timeline'])('wraps %s items', (type) => {
    const item = { name: 'n', text: 't' }
    expect(node({ type, items: item }).items).toEqual([item])
  })

  it('wraps a string list item', () => {
    expect(node({ type: 'list', items: 'a' }).items).toEqual(['a'])
  })

  it.each(['plan', 'tree'])('wraps nested %s children', (type) => {
    const { items } = node({
      type,
      items: [{ name: 'a', children: { name: 'b', children: { name: 'c' } } }],
    })
    expect(items).toEqual([{ name: 'a', children: [{ name: 'b', children: [{ name: 'c' }] }] }])
  })

  it('does not extend to body', () => {
    expect(canonical({ body: { type: 'md', text: 'a' } }).body).toEqual({ type: 'md', text: 'a' })
  })

  it('leaves an existing array as an array', () => {
    expect(node({ type: 'stack', children: [{ type: 'divider' }] }).children).toEqual([
      { type: 'divider' },
    ])
  })
})

describe('shorthand 5: object rows', () => {
  it('converts rows using columns', () => {
    const table = node({
      type: 'table',
      columns: [{ key: 'a', label: 'A' }, 'b'],
      rows: [
        { b: 2, a: 1 },
        { a: 3, b: 4 },
      ],
    })
    expect(table.rows).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('takes columns from the keys of the first object', () => {
    const table = node({ type: 'table', rows: [{ a: 1, b: 2 }, { b: 3 }] })
    expect(table.columns).toEqual([
      { key: 'a', label: 'a' },
      { key: 'b', label: 'b' },
    ])
    expect(table.rows).toEqual([
      [1, 2],
      [null, 3],
    ])
  })

  it('skips array rows when finding the first object', () => {
    const table = node({ type: 'table', rows: [[1], { a: 2 }] })
    expect(table.columns).toEqual([{ key: 'a', label: 'a' }])
    expect(table.rows).toEqual([[1], [2]])
  })

  it('applies suffix syntax to derived columns', () => {
    const table = node({ type: 'table', rows: [{ 'Time:ms': 5 }, { Time: 6 }] })
    expect(table.columns).toEqual([{ key: 'Time', label: 'Time', format: 'ms' }])
    expect(table.rows).toEqual([[5], [6]])
  })

  it('finds a cell by a column spelling as well as its key', () => {
    const table = node({
      type: 'table',
      columns: ['Time:ms'],
      rows: [{ 'Time:ms': 5 }, { Time: 6 }],
    })
    expect(table.rows).toEqual([[5], [6]])
  })

  it('fills a missing cell with null', () => {
    const table = node({ type: 'table', columns: ['a', 'b'], rows: [{ a: 1 }] })
    expect(table.rows).toEqual([[1, null]])
  })

  it('keeps array rows, including row options', () => {
    const rows = [[1, { tone: 'warn' }]]
    expect(node({ type: 'table', columns: ['a'], rows }).rows).toEqual(rows)
  })

  it('reports keys that match no column', () => {
    const { dropped } = normalize({
      body: [{ type: 'table', columns: ['a'], rows: [{ a: 1, 'b/c': 2 }] }],
    })
    expect(dropped).toEqual(['/body/0/rows/0/b~1c'])
  })

  it('reports later keys missing from derived columns', () => {
    const { dropped } = normalize([{ type: 'table', rows: [{ a: 1 }, { a: 2, b: 3 }] }])
    expect(dropped).toEqual(['/0/rows/1/b'])
  })

  it('never reads inherited values', () => {
    const table = node({ type: 'table', columns: ['constructor', 'toString'], rows: [{}] })
    expect(table.rows).toEqual([[null, null]])
  })

  it('treats __proto__ as data in a row', () => {
    const row = relaxed('{"__proto__": 1, "a": 2}')
    const table = node({ type: 'table', rows: [row] })
    expect(table.columns).toEqual([
      { key: '__proto__', label: '__proto__' },
      { key: 'a', label: 'a' },
    ])
    expect(table.rows).toEqual([[1, 2]])
  })
})

describe('shorthand 6: string columns', () => {
  it('is key and label', () => {
    expect(parseColumn('Test')).toEqual({ key: 'Test', label: 'Test' })
  })

  it.each([
    ['Duration:ms', 'Duration', 'ms'],
    ['Status:status', 'Status', 'status'],
    ['Hit rate:pct', 'Hit rate', 'pct'],
    ['Cov:pct:0', 'Cov', 'pct:0'],
    ['Cost:money:PLN', 'Cost', 'money:PLN'],
    ['Change:delta:pct', 'Change', 'delta:pct'],
    ['Foo:bogus', 'Foo', 'bogus'],
    ['12:30:ms', '12:30', 'ms'],
  ])('splits %s', (text, label, format) => {
    expect(parseColumn(text)).toEqual({ key: label, label, format })
  })

  it.each(['10:05', 'Note: see docs', ':ms', 'a:', 'http://x.dev', 'A:B', 'a:b c', 'trail:ms '])(
    'keeps %j as a whole label',
    (text) => {
      expect(parseColumn(text)).toEqual({ key: text, label: text })
    },
  )

  it.each([
    ['a whitespace tail', `${'a:'.repeat(100000)} x`],
    ['no whitespace', `${'a:'.repeat(100000)}!`],
    ['a long name', `x:${'a'.repeat(200000)}!`],
    ['a long argument', `x:a:${'b'.repeat(200000)}`],
  ])('stays linear on a hostile label with %s', (_name, label) => {
    const started = performance.now()
    parseColumn(label)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('expands in a table, and leaves object columns alone', () => {
    const column = { key: 'cov', label: 'Coverage', format: 'pct:0', cell: 'bar' }
    const table = node({ type: 'table', columns: ['Test', 'Time:ms', column], rows: [] })
    expect(table.columns).toEqual([
      { key: 'Test', label: 'Test' },
      { key: 'Time', label: 'Time', format: 'ms' },
      column,
    ])
  })
})

describe('positional stats items', () => {
  const items = (list: JsonValue[]) => node({ type: 'stats', items: list }).items

  it("expands an array in the object form's field order", () => {
    expect(items([['Orders', 18420, 'int', 0.064, 'delta:pct']])).toEqual([
      { label: 'Orders', value: 18420, format: 'int', delta: 0.064, deltaFormat: 'delta:pct' },
    ])
  })

  it('omits null positions', () => {
    expect(items([['p95', 840, 'ms', null, null, 'warn']])).toEqual([
      { label: 'p95', value: 840, format: 'ms', tone: 'warn' },
    ])
  })

  it('leaves an object item and an unfit array as written', () => {
    const object = { label: 'L', value: 1, tone: 'ok' }
    const raw: JsonValue[] = [[null, 1], ['a'], ['a', 1, 2, 3, 4, 5, 6], [1, 2], object]
    expect(items(raw)).toEqual(raw)
  })

  it('reports an unfit array as an error at its item, without throwing', () => {
    for (const raw of [[null, 1], ['a'], ['a', 1, 2, 3, 4, 5, 6], [1, 2]]) {
      const result = validate({ body: [{ type: 'stats', items: [raw] }] })
      expect(result.diagnostics, JSON.stringify(raw)).toContainEqual(
        expect.objectContaining({ severity: 'error', path: '/body/0/items/0' }),
      )
    }
  })

  it('points a diagnostic on an expanded field at its input position', () => {
    const { paths } = normalize({ body: [{ type: 'stats', items: [['a', 1, null, 'x']] }] })
    expect(paths.toInput('/body/0/items/0/label')).toBe('/body/0/items/0/0')
    expect(paths.toInput('/body/0/items/0/delta')).toBe('/body/0/items/0/3')
    const result = validate({ body: [{ type: 'stats', items: [['a', 1, null, 'x']] }] })
    expect(result.diagnostics.map((d) => d.path)).toEqual(['/body/0/items/0/3'])
  })
})

describe('envelope defaults (§5.2)', () => {
  it('fills every default, in a fixed order', () => {
    const document = canonical({ meta: { a: 1 }, body: [], title: 'T' })
    expect(document).toEqual({ ...ENVELOPE, title: 'T', body: [], meta: { a: 1 } })
    expect(Object.keys(document)).toEqual(['vui', 'title', 'density', 'locale', 'body', 'meta'])
  })

  it('keeps every value given', () => {
    const envelope = {
      vui: 2,
      title: 'T',
      subtitle: 'S',
      density: 'comfortable',
      locale: 'pl-PL',
      generatedAt: '2026-11-04T10:15:00Z',
      body: [],
      meta: { generator: 'vui' },
    }
    expect(canonical(envelope)).toEqual(envelope)
  })

  it('keeps invalid values for the validator', () => {
    expect(canonical({ vui: 'x', density: 'tiny', locale: null, body: [] })).toEqual({
      vui: 'x',
      density: 'tiny',
      locale: null,
      body: [],
    })
  })

  it('leaves optional fields absent, not null', () => {
    const document = canonical({ body: [] })
    for (const key of ['title', 'subtitle', 'generatedAt', 'meta']) {
      expect(hasOwn(document, key)).toBe(false)
    }
  })

  it('keeps unknown fields after the known ones', () => {
    const document = canonical({ extra: 1, body: [] })
    expect(Object.keys(document)).toEqual(['vui', 'density', 'locale', 'body', 'extra'])
  })

  it('leaves a missing body missing', () => {
    expect(canonical({ title: 'T' })).toEqual({ ...ENVELOPE, title: 'T' })
  })

  it.each([[5], [true], [null]])('gives scalar %j an envelope with no body', (input) => {
    expect(canonical(input)).toEqual(ENVELOPE)
  })
})

describe('generatedAt', () => {
  const stamp = '2026-11-04T10:15:00Z'

  it('is stamped by the caller', () => {
    expect(normalize({ body: [] }, { generatedAt: stamp }).document.generatedAt).toBe(stamp)
  })

  it('never overrides the document', () => {
    const { document } = normalize({ generatedAt: 'x', body: [] }, { generatedAt: stamp })
    expect(document.generatedAt).toBe('x')
  })

  it('applies to shorthand documents', () => {
    expect(normalize([], { generatedAt: stamp }).document.generatedAt).toBe(stamp)
  })
})

describe('component defaults (§6)', () => {
  it.each([
    [{ type: 'callout', text: 'a' }, 'tone', 'info'],
    [{ type: 'code', text: 'a' }, 'maxLines', 30],
    [{ type: 'log', text: 'a' }, 'maxLines', 40],
    [{ type: 'progress', value: 1 }, 'max', 100],
    [{ type: 'table', columns: [], rows: [] }, 'pageSize', 25],
    [{ type: 'table', columns: [], rows: [] }, 'sticky', false],
  ])('fills %j', (input, key, expected) => {
    expect(node(input)[key]).toBe(expected)
  })

  it.each([
    [{ type: 'callout', text: 'a', tone: 'warn' }, 'tone', 'warn'],
    [{ type: 'code', text: 'a', maxLines: 5 }, 'maxLines', 5],
    [{ type: 'log', text: 'a', maxLines: 5 }, 'maxLines', 5],
    [{ type: 'progress', value: 1, max: 5 }, 'max', 5],
    [{ type: 'table', rows: [], pageSize: 5 }, 'pageSize', 5],
    [{ type: 'table', rows: [], sticky: true }, 'sticky', true],
  ])('keeps %j', (input, key, expected) => {
    expect(node(input)[key]).toBe(expected)
  })

  it.each([
    [15, false],
    [16, true],
  ])('sets sticky for %i rows to %s', (count, sticky) => {
    const rows = Array.from({ length: count }, () => [1])
    expect(node({ type: 'table', columns: ['a'], rows }).sticky).toBe(sticky)
  })

  it('counts object rows for sticky', () => {
    const rows = Array.from({ length: 16 }, () => ({ a: 1 }))
    expect(node({ type: 'table', rows }).sticky).toBe(true)
  })

  it('leaves components with no stated default as they are', () => {
    const grid = { type: 'grid', children: [] }
    expect(node(grid)).toEqual(grid)
  })

  it('fills defaults inside nested nodes', () => {
    expect(node({ type: 'card', children: 'x' })).toEqual({
      type: 'card',
      children: [{ type: 'md', text: 'x' }],
    })
    expect(node({ type: 'card', children: [{ type: 'log', text: 'x' }] }).children).toEqual([
      { type: 'log', text: 'x', maxLines: 40 },
    ])
  })
})

describe('tolerance', () => {
  it('passes unknown components through untouched', () => {
    const future = { type: 'hologram', children: 'x', items: 'y' }
    expect(node(future)).toEqual(future)
  })

  it('keeps unknown fields on known components', () => {
    expect(node({ type: 'md', text: 'a', extra: 1 })).toEqual({ type: 'md', text: 'a', extra: 1 })
  })

  it.each([[null], [5], [true], [[1]], [{}], [{ type: 5 }], [{ type: null, children: 'x' }]])(
    'passes %j through in a node position',
    (input) => {
      expect(node(input)).toEqual(input)
    },
  )

  it.each([
    [{ type: 'stack', children: null }],
    [{ type: 'stack', children: 5 }],
    [{ type: 'stats', items: null }],
    [{ type: 'list', items: 5 }],
    [{ type: 'tabs', tabs: 'x' }],
    [{ type: 'tabs', tabs: [1, null] }],
    [{ type: 'tabs', tabs: [{ label: 'a' }] }],
    [{ type: 'plan', items: [1, null, 'x'] }],
    [{ type: 'tree', items: [{ children: 5 }] }],
  ])('leaves malformed fields of %j in place', (input) => {
    expect(node(input)).toEqual(input)
  })

  it.each([
    [{ type: 'table', rows: 5 }],
    [{ type: 'table', rows: { a: 1 } }],
    [{ type: 'table', columns: 'a', rows: [{ a: 1 }] }],
  ])('leaves a malformed table %j in place, with defaults', (input) => {
    expect(node(input)).toMatchObject(input)
    expect(node(input).pageSize).toBe(25)
  })

  it('does not carry sticky over from an earlier table', () => {
    const { document } = normalize([
      { type: 'table', columns: [], rows: [] },
      { type: 'table', rows: 5 },
    ])
    expect(hasOwn(document.body[1] as unknown as JsonObject, 'sticky')).toBe(false)
  })

  it('gives an empty table empty columns', () => {
    expect(node({ type: 'table', rows: [] }).columns).toEqual([])
  })

  it('leaves rows without an object and without columns as they are', () => {
    const table = node({ type: 'table', rows: [[1], 'x', null] })
    expect(hasOwn(table, 'columns')).toBe(false)
    expect(table.rows).toEqual([[1], 'x', null])
  })

  it('leaves odd column entries alone', () => {
    const table = node({ type: 'table', columns: [5, null, { label: 'x' }], rows: [{ a: 1 }] })
    expect(table.columns).toEqual([5, null, { label: 'x' }])
    expect(table.rows).toEqual([[null, null, null]])
  })

  it('survives children nested beyond any limit', () => {
    let deep: JsonValue = 'leaf'
    for (let i = 0; i < 20000; i++) deep = { type: 'stack', children: [deep] }
    expect(() => normalize([deep])).not.toThrow()
  })

  it('survives plan items nested beyond any limit', () => {
    let deep: JsonValue = { text: 'leaf' }
    for (let i = 0; i < 20000; i++) deep = { text: 'x', children: [deep] }
    expect(() => normalize([{ type: 'plan', items: [deep] }])).not.toThrow()
  })
})

describe('table expansion cap', () => {
  const emptyRows = (count: number) => Array.from({ length: count }, () => ({}))
  const names = (count: number) => Array.from({ length: count }, (_, index) => `c${index}`)

  it('covers every table inside the §13.4 limits', () => {
    expect(MAX_TABLE_CELLS).toBeGreaterThanOrEqual(30 * 5000)
  })

  it('counts cells across the document, and only from object rows (VD-038)', () => {
    const columns = Array.from({ length: 500 }, (_, index) => `c${index}`)
    const objects = { type: 'table', columns, rows: Array.from({ length: 500 }, () => ({})) }
    const arrays = { type: 'table', columns: ['a'], rows: Array.from({ length: 9 }, () => [1]) }
    const { body } = normalize([arrays, objects, objects]).document
    const rows = (index: number) => (body[index] as unknown as { rows: unknown[] }).rows[0]
    expect(rows(1)).toHaveLength(500)
    expect(rows(2)).toEqual({})
    const table = node({ type: 'table', columns: names(30), rows: emptyRows(5000) })
    expect((table.rows as JsonValue[][])[4999]).toHaveLength(30)
  })

  it('leaves rows unconverted past the cap, with columns still expanded', () => {
    const table = node({ type: 'table', columns: names(600), rows: emptyRows(600) })
    expect(table.rows).toEqual(emptyRows(600))
    expect((table.columns as JsonValue[])[0]).toEqual({ key: 'c0', label: 'c0' })
  })

  it('applies to derived columns', () => {
    const first = Object.fromEntries(names(600).map((name) => [name, 1]))
    const table = node({ type: 'table', rows: [first, ...emptyRows(600)] })
    expect((table.rows as JsonValue[])[0]).toEqual(first)
  })

  it('stays cheap on a 54 KB table of 25 million cells', () => {
    const started = performance.now()
    expect(() =>
      normalize([{ type: 'table', columns: names(5000), rows: emptyRows(5000) }]),
    ).not.toThrow()
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('guarantees', () => {
  const documents: [string, JsonValue][] = [
    [
      '§19.1',
      relaxed(`{
        title: 'Objective #14 — refresh-token rotation',
        subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
        body: [
          {type: 'stats', items: [
            {label: 'Checks', value: '5/6', tone: 'warn'},
            {label: 'Tests', value: 142, delta: -3, deltaFormat: 'delta'},
          ]},
          {type: 'checks', items: [
            {name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100},
          ]},
          {type: 'callout', tone: 'warn', text: 'E2E fails on expired-token replay.'},
        ],
      }`),
    ],
    [
      '§19.2',
      relaxed(`[
        {type: 'grid', children: [
          {type: 'plan', title: 'Plan', items: [{text: 'Add rotation table', status: 'ok'}]},
          {type: 'diff', title: 'Changes', files: [['src/auth/refresh.ts', 64, 12, 'M']]},
        ]},
      ]`),
    ],
    [
      '§19.3',
      relaxed(`{
        title: 'Catalog query latency',
        body: [
          {type: 'chart', kind: 'line', yFormat: 'ms', x: ['10:00', '10:05'],
           series: {p50: [42, 40]}, refLines: [{y: 100, label: 'SLO', tone: 'err'}]},
          {type: 'table', columns: ['Query', 'Calls:int', 'p95:ms', 'Hit rate:pct'],
           rows: [['listProducts', 18420, 84, 0.93], ['searchSku', 2204, 212, 0.41, {tone: 'warn'}]],
           sort: [2, 'desc']},
        ],
      }`),
    ],
    ['shorthands', ['a', { type: 'stack', children: 'b' }, { type: 'table', rows: [{ a: 1 }] }]],
    ['single node', { type: 'tabs', tabs: [{ label: 'x', children: 'y' }] }],
  ]

  it.each(documents)('%s is strict JSON', (_name, input) => {
    const { document } = normalize(input)
    expect(JSON.parse(JSON.stringify(document))).toEqual(document)
  })

  it.each(documents)('%s does not mutate its input', (_name, input) => {
    const before = JSON.stringify(input)
    normalize(deepFreeze(structuredClone(input)))
    expect(JSON.stringify(input)).toBe(before)
  })

  it.each(documents)('%s is a fixed point once canonical', (_name, input) => {
    const once = normalize(input).document as unknown as JsonValue
    expect(normalize(once).document).toEqual(once)
  })

  it('expands the §19.3 table as written', () => {
    const { body } = canonical(documents[2]?.[1] as JsonValue) as { body: JsonObject[] }
    expect(body[1]?.columns).toEqual([
      { key: 'Query', label: 'Query' },
      { key: 'Calls', label: 'Calls', format: 'int' },
      { key: 'p95', label: 'p95', format: 'ms' },
      { key: 'Hit rate', label: 'Hit rate', format: 'pct' },
    ])
    expect(body[1]).toMatchObject({ pageSize: 25, sticky: false, sort: [2, 'desc'] })
  })

  it('does not pollute any prototype', () => {
    const input = relaxed(
      '{"__proto__": {"polluted": 1}, "body": [{"type": "md", "__proto__": 2}]}',
    )
    const document = canonical(input)
    expect(({} as JsonObject).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(document)).toBe(Object.prototype)
    expect(hasOwn(document, '__proto__')).toBe(true)
    expect(hasOwn((document.body as JsonObject[])[0] as JsonObject, '__proto__')).toBe(true)
  })
})
