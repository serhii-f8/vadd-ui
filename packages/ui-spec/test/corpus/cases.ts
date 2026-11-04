import { type JsonObject, type JsonValue, LIMITS } from '../../src/index.js'
import { componentTables, type Trouble } from './components.js'
import { exampleCases } from './examples.js'
import { type DiagnosedCase, type Expected, envelope, repeat, type ValidCase } from './types.js'

export type { DiagnosedCase, Expected, ValidCase } from './types.js'

const clone = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value))

function step(owner: JsonValue, segment: string): JsonValue {
  return (
    Array.isArray(owner) ? owner[Number(segment)] : (owner as JsonObject)[segment]
  ) as JsonValue
}

/** The container of a pointer in a copy of `node`, and the last segment. */
function locate(
  node: JsonObject,
  pointer: string,
): { owner: JsonValue; key: string; copy: JsonObject } {
  const copy = clone(node)
  const segments = pointer.split('/').slice(1)
  const key = segments.pop() as string
  return { owner: segments.reduce(step, copy as JsonValue), key, copy }
}

function write(node: JsonObject, pointer: string, value: JsonValue): JsonObject {
  const { owner, key, copy } = locate(node, pointer)
  if (Array.isArray(owner)) owner[Number(key)] = value
  else (owner as JsonObject)[key] = value
  return copy
}

function remove(node: JsonObject, pointer: string): JsonObject {
  const { owner, key, copy } = locate(node, pointer)
  delete (owner as JsonObject)[key]
  return copy
}

const parent = (pointer: string) => pointer.slice(0, pointer.lastIndexOf('/'))
const label = (value: JsonValue) => JSON.stringify(value).slice(0, 40)

const COMMON_OK: JsonObject = {
  id: 'n1',
  note: 'caption with **bold**',
  tone: 'accent',
  span: 6,
  fold: 'closed',
}

const COMMON_NOTICES: Trouble[] = [
  ['/id', 5],
  ['/note', 5],
  ['/tone', 'red', 'bad-enum'],
  ['/span', 0, 'bad-range'],
  ['/span', 13, 'bad-range'],
  ['/span', 1.5, 'bad-range'],
  ['/fold', 'shut', 'bad-enum'],
]

const CONTAINERS: [string, JsonObject, string][] = [
  ['stack', { type: 'stack' }, '/children'],
  ['grid', { type: 'grid' }, '/children'],
  ['section', { type: 'section', title: 'S' }, '/children'],
  ['card', { type: 'card' }, '/children'],
  ['tab', { type: 'tabs', tabs: [{ label: 'A' }] }, '/tabs/0/children'],
]

const at = (pointer: string): string => `/body/0${pointer}`

function tableValidCases(): ValidCase[] {
  return componentTables.flatMap(({ name, base, defaults, ok }) =>
    [
      {},
      { ...COMMON_OK, tone: name === 'callout' ? 'warn' : 'accent' },
      { title: 'Node title' },
      ...ok,
    ].map(
      (patch, index): ValidCase => ({
        name: `${name} valid ${index}: ${label(patch)}`,
        input: { body: [{ ...base, ...patch }] },
        canonical: envelope([{ ...defaults, ...base, ...patch }]),
      }),
    ),
  )
}

function tableInvalidCases(): DiagnosedCase[] {
  return componentTables.flatMap(({ name, base, missing, errors }) => [
    ...missing.map(
      (pointer): DiagnosedCase => ({
        name: `${name} without ${pointer}`,
        input: { body: [remove(base, pointer)] },
        diagnostics: [{ severity: 'error', code: 'missing-field', path: at(parent(pointer)) }],
      }),
    ),
    ...errors.map(
      ([pointer, value, code = 'bad-type', path = pointer]): DiagnosedCase => ({
        name: `${name} ${pointer} = ${label(value)}`,
        input: { body: [write(base, pointer, value)] },
        diagnostics: [{ severity: 'error', code, path: at(path) }],
      }),
    ),
  ])
}

function tableNoticeCases(): DiagnosedCase[] {
  return componentTables.flatMap(({ name, base, warnings }) =>
    [...warnings, ...COMMON_NOTICES].map(
      ([pointer, value, code = 'bad-type', path = pointer]): DiagnosedCase => ({
        name: `${name} ${pointer} = ${label(value)}`,
        input: { body: [write(base, pointer, value)] },
        diagnostics: [{ severity: 'warn', code, path: at(path) }],
      }),
    ),
  )
}

const nest = (depth: number, leaf: JsonValue = 'leaf'): JsonValue => {
  let current = leaf
  for (let level = 1; level < depth; level++) current = { type: 'stack', children: [current] }
  return current
}

function stacked(depth: number): JsonValue {
  let canonical: JsonValue = { type: 'md', text: 'leaf' }
  for (let level = 1; level < depth; level++) {
    canonical = { type: 'stack', children: [canonical] }
  }
  return canonical
}

const col = (key: string, format?: string) => ({
  key,
  label: key,
  ...(format ? { format } : {}),
})

const TABLE_DEFAULTS = { pageSize: 25, sticky: false }

const shorthandCases: ValidCase[] = [
  {
    name: 'shorthand 1: top-level array',
    input: ['one', 'two'],
    canonical: envelope([
      { type: 'md', text: 'one' },
      { type: 'md', text: 'two' },
    ]),
  },
  { name: 'shorthand 1: empty array', input: [], canonical: envelope([]) },
  {
    name: 'shorthand 2: top-level node',
    input: { type: 'md', text: 'x', title: 'T' },
    canonical: envelope([{ type: 'md', text: 'x', title: 'T' }]),
  },
  {
    name: 'shorthand 3: string in body and children',
    input: { body: ['a', { type: 'card', children: ['b'] }] },
    canonical: envelope([
      { type: 'md', text: 'a' },
      { type: 'card', children: [{ type: 'md', text: 'b' }] },
    ]),
  },
  {
    name: 'shorthand 3: string in a tab',
    input: { body: [{ type: 'tabs', tabs: [{ label: 'A', children: ['x'] }] }] },
    canonical: envelope([
      { type: 'tabs', tabs: [{ label: 'A', children: [{ type: 'md', text: 'x' }] }] },
    ]),
  },
  {
    name: 'shorthand 4: single child node',
    input: { body: [{ type: 'stack', children: { type: 'divider' } }] },
    canonical: envelope([{ type: 'stack', children: [{ type: 'divider' }] }]),
  },
  {
    name: 'shorthand 4: single child string',
    input: { body: [{ type: 'grid', children: 'x' }] },
    canonical: envelope([{ type: 'grid', children: [{ type: 'md', text: 'x' }] }]),
  },
  {
    name: 'shorthand 4: single list item string',
    input: { body: [{ type: 'list', items: 'x' }] },
    canonical: envelope([{ type: 'list', items: ['x'] }]),
  },
  {
    name: 'shorthand 4: single check item',
    input: { body: [{ type: 'checks', items: { name: 'n', status: 'ok' } }] },
    canonical: envelope([{ type: 'checks', items: [{ name: 'n', status: 'ok' }] }]),
  },
  {
    name: 'shorthand 4: single plan child',
    input: {
      body: [
        {
          type: 'plan',
          items: { text: 't', status: 'ok', children: { text: 'c', status: 'ok' } },
        },
      ],
    },
    canonical: envelope([
      {
        type: 'plan',
        items: [{ text: 't', status: 'ok', children: [{ text: 'c', status: 'ok' }] }],
      },
    ]),
  },
  {
    name: 'shorthand 4: single tree item',
    input: { body: [{ type: 'tree', items: { name: 'a' } }] },
    canonical: envelope([{ type: 'tree', items: [{ name: 'a' }] }]),
  },
  {
    name: 'shorthand 4: single timeline item and stat',
    input: {
      body: [
        { type: 'timeline', items: { at: 't', text: 'x' } },
        { type: 'stats', items: { label: 'L', value: 1 } },
      ],
    },
    canonical: envelope([
      { type: 'timeline', items: [{ at: 't', text: 'x' }] },
      { type: 'stats', items: [{ label: 'L', value: 1 }] },
    ]),
  },
  {
    name: 'shorthand 5: object rows with columns',
    input: { body: [{ type: 'table', columns: ['a', 'b'], rows: [{ b: 2, a: 1 }, { a: 3 }] }] },
    canonical: envelope([
      {
        type: 'table',
        columns: [col('a'), col('b')],
        rows: [
          [1, 2],
          [3, null],
        ],
        ...TABLE_DEFAULTS,
      },
    ]),
  },
  {
    name: 'shorthand 5: columns from the first object',
    input: { body: [{ type: 'table', rows: [{ Name: 'x', 'Time:ms': 1 }] }] },
    canonical: envelope([
      {
        type: 'table',
        columns: [col('Name'), col('Time', 'ms')],
        rows: [['x', 1]],
        ...TABLE_DEFAULTS,
      },
    ]),
  },
  {
    name: 'shorthand 5: no rows and no columns',
    input: { body: [{ type: 'table', rows: [] }] },
    canonical: envelope([{ type: 'table', columns: [], rows: [], ...TABLE_DEFAULTS }]),
  },
  {
    name: 'shorthand 6: string columns and suffixes',
    input: { body: [{ type: 'table', columns: ['A', 'B:ms', 'C:status', 'D:pct:0'], rows: [] }] },
    canonical: envelope([
      {
        type: 'table',
        columns: [col('A'), col('B', 'ms'), col('C', 'status'), col('D', 'pct:0')],
        rows: [],
        ...TABLE_DEFAULTS,
      },
    ]),
  },
  {
    name: 'shorthand 6: a label with a colon stays whole',
    input: { body: [{ type: 'table', columns: ['Note: see docs', '10:05'], rows: [] }] },
    canonical: envelope([
      {
        type: 'table',
        columns: [col('Note: see docs'), col('10:05')],
        rows: [],
        ...TABLE_DEFAULTS,
      },
    ]),
  },
  {
    name: 'relaxed text: every §5.1 extension',
    text: `// comment
      { /* block */ title: 'It\\'s', "body": ['x',], }`,
    canonical: envelope([{ type: 'md', text: 'x' }], { title: "It's" }),
  },
  {
    name: 'envelope: every field',
    input: {
      vui: 1,
      title: 'T',
      subtitle: 'S',
      density: 'comfortable',
      locale: 'pl-PL',
      generatedAt: '2026-11-04T10:15:00Z',
      body: [],
      meta: { generator: 'vui', version: '1.0.0' },
    },
    canonical: {
      vui: 1,
      title: 'T',
      subtitle: 'S',
      density: 'comfortable',
      locale: 'pl-PL',
      generatedAt: '2026-11-04T10:15:00Z',
      body: [],
      meta: { generator: 'vui', version: '1.0.0' },
    },
  },
  { name: 'envelope: body alone', input: { body: [] }, canonical: envelope([]) },
  {
    name: 'table: sticky defaults on past 15 rows',
    input: { body: [{ type: 'table', columns: ['a'], rows: repeat(16, () => [1]) }] },
    canonical: envelope([
      {
        type: 'table',
        columns: [col('a')],
        rows: repeat(16, () => [1]),
        pageSize: 25,
        sticky: true,
      },
    ]),
  },
  {
    name: 'nesting at exactly 12',
    input: { body: [nest(12)] },
    canonical: envelope([stacked(12)]),
  },
  {
    name: 'nodes at exactly 400',
    input: { body: repeat(400, () => 'x') },
    canonical: envelope(repeat(400, () => ({ type: 'md', text: 'x' }))),
  },
  {
    name: 'prototype-like names as data',
    text: `[{type:'chart',kind:'line',x:[1],series:{"__proto__":[1],constructor:[2]}}]`,
    canonical: JSON.parse(
      `{"vui":1,"density":"compact","locale":"en-US","body":[{"type":"chart","kind":"line","x":[1],"series":{"__proto__":[1],"constructor":[2]}}]}`,
    ),
  },
]

const error = (code: string, path: string): Expected => ({ severity: 'error', code, path })

const PARSE_FAILURES: [string, string][] = [
  ['empty text', ''],
  ['hex number', '{body: [0x10]}'],
  ['Infinity', '[Infinity]'],
  ['NaN', '[NaN]'],
  ['unterminated string', "['abc"],
  ['unterminated array', '[1,'],
  ['trailing text', '[] []'],
  ['leading plus', '[+1]'],
  ['bare decimal', '[.5]'],
  ['string continuation', "['a\\\nb']"],
  ['double comma', '[1,,2]'],
  ['bare word', '[hello]'],
  ['unterminated comment', '[] /* x'],
  ['number overflow', '[1e999]'],
]

const nodeShapeCases: DiagnosedCase[] = [
  ...CONTAINERS.flatMap(([name, shell, pointer]): DiagnosedCase[] => {
    const inside = (child: JsonValue) => ({ body: [write(shell, pointer, [child])] })
    const path = at(`${pointer}/0`)
    return [
      { name: `${name}: number child`, input: inside(5), diagnostics: [error('bad-type', path)] },
      { name: `${name}: null child`, input: inside(null), diagnostics: [error('bad-type', path)] },
      { name: `${name}: array child`, input: inside([]), diagnostics: [error('bad-type', path)] },
      {
        name: `${name}: child with no type`,
        input: inside({ text: 'x' }),
        diagnostics: [error('missing-field', path)],
      },
      {
        name: `${name}: child of unknown type`,
        input: inside({ type: 'hologram' }),
        diagnostics: [error('unknown-type', path)],
      },
    ]
  }),
  {
    name: 'non-string type',
    input: { body: [{ type: 5 }] },
    diagnostics: [error('bad-type', '/body/0/type')],
  },
  {
    name: 'a body that is no list',
    input: { body: 'x' },
    diagnostics: [error('bad-type', '/body')],
  },
  { name: 'empty object', input: {}, diagnostics: [error('missing-field', '')] },
  { name: 'a bare number', input: 5, diagnostics: [error('missing-field', '')] },
  { name: 'a bare string', input: 'x', diagnostics: [error('missing-field', '')] },
  { name: 'null', input: null, diagnostics: [error('missing-field', '')] },
  ...['tabel', 'Table', 'grd', 'chrt', 'constructor', '__proto__', '', 'html', 'script'].map(
    (type): DiagnosedCase => ({
      name: `unknown type ${JSON.stringify(type)}`,
      input: { body: [{ type }] },
      diagnostics: [error('unknown-type', '/body/0')],
    }),
  ),
  {
    name: 'unknown type at the root',
    input: { type: 'tabel' },
    diagnostics: [error('unknown-type', '')],
  },
  ...[2, 0, -1, 1.5, '1', null].map(
    (vui): DiagnosedCase => ({
      name: `vui ${JSON.stringify(vui)}`,
      input: { vui, body: [] },
      diagnostics: [error('bad-version', '/vui')],
    }),
  ),
  ...['pie', 'Bar', ''].map(
    (kind): DiagnosedCase => ({
      name: `chart kind ${JSON.stringify(kind)}`,
      input: { body: [{ type: 'chart', kind, x: [], series: {} }] },
      diagnostics: [error('bad-enum', '/body/0/kind')],
    }),
  ),
  {
    name: 'chart with no kind',
    input: { body: [{ type: 'chart', x: [], series: {} }] },
    diagnostics: [error('missing-field', '/body/0')],
  },
  {
    name: 'chart kind not a string',
    input: { body: [{ type: 'chart', kind: 5 }] },
    diagnostics: [error('bad-type', '/body/0/kind')],
  },
  {
    name: 'array rows with no columns',
    input: { body: [{ type: 'table', rows: [[1]] }] },
    diagnostics: [error('missing-field', '/body/0')],
  },
  {
    name: 'tree with neither source',
    input: { body: [{ type: 'tree' }] },
    diagnostics: [error('tree-source', '/body/0')],
  },
  {
    name: 'flow with no nodes',
    input: { body: [{ type: 'flow', edges: [] }] },
    diagnostics: [error('missing-field', '/body/0')],
  },
  {
    name: 'a tree inside a card lacks a source',
    input: { body: [{ type: 'card', children: { type: 'tree' } }] },
    diagnostics: [error('tree-source', '/body/0/children')],
  },
  {
    name: 'an error found through shorthands',
    input: [{ type: 'table', columns: ['A', 'B'], rows: [[1]] }],
    diagnostics: [error('row-arity', '/0/rows/0')],
  },
  {
    name: 'an object cell from an object row reads as row options',
    input: { type: 'table', columns: ['A'], rows: [{ A: { x: 1 } }] },
    diagnostics: [
      error('row-arity', '/rows/0'),
      { severity: 'info', code: 'unknown-field', path: '/rows/0/A/x' },
    ],
  },
]

const big = (length: number) => 'x'.repeat(length)

const limitCases: DiagnosedCase[] = [
  {
    name: 'limit: input bytes',
    text: JSON.stringify([big(LIMITS.inputBytes)]),
    diagnostics: [error('limit-input-size', '')],
  },
  {
    name: 'limit: canonical bytes',
    text: JSON.stringify({
      body: repeat(2, () => ({
        type: 'table',
        columns: repeat(30, (i) => `c${i}`),
        rows: repeat(5000, () => ({})),
      })),
    }),
    diagnostics: [error('limit-canonical-size', '')],
  },
  {
    name: 'limit: depth by document',
    input: { body: [nest(13)] },
    diagnostics: [error('limit-depth', `/body/0${'/children/0'.repeat(12)}`)],
  },
  {
    name: 'limit: depth by the parser',
    text: '['.repeat(200),
    diagnostics: [error('limit-depth', '')],
  },
  {
    name: 'limit: depth by plan items',
    input: {
      body: [
        {
          type: 'plan',
          items: repeat(1, () =>
            repeat(11, () => 0).reduce<JsonValue>(
              (child) => ({ text: 't', status: 'ok', children: [child] }),
              { text: 't', status: 'ok' },
            ),
          ),
        },
      ],
    },
    diagnostics: [error('limit-depth', `/body/0/items/0${'/children/0'.repeat(11)}`)],
  },
  {
    name: 'limit: nodes',
    input: { body: repeat(401, () => 'x') },
    diagnostics: [error('limit-nodes', '')],
  },
  {
    name: 'limit: table rows',
    input: { body: [{ type: 'table', columns: ['a'], rows: repeat(5001, () => [1]) }] },
    diagnostics: [error('limit-table-rows', '/body/0/rows')],
  },
  {
    name: 'limit: table columns',
    input: {
      body: [{ type: 'table', columns: repeat(31, (i) => `c${i}`), rows: [] }],
    },
    diagnostics: [error('limit-table-columns', '/body/0/columns')],
  },
  {
    name: 'limit: chart series',
    input: {
      body: [
        {
          type: 'chart',
          kind: 'bar',
          x: [],
          series: Object.fromEntries(repeat(13, (i) => [`s${i}`, []])),
        },
      ],
    },
    diagnostics: [error('limit-chart-series', '/body/0/series')],
  },
  {
    name: 'limit: chart points',
    input: {
      body: [
        {
          type: 'chart',
          kind: 'line',
          x: repeat(10_001, (i) => i),
          series: { s: repeat(10_001, () => 1) },
        },
      ],
    },
    diagnostics: [error('limit-chart-points', '/body/0/series/s')],
  },
  {
    name: 'limit: spark points',
    input: { body: [{ type: 'chart', kind: 'spark', values: repeat(10_001, () => 1) }] },
    diagnostics: [error('limit-chart-points', '/body/0/values')],
  },
  {
    name: 'limit: scatter points',
    input: { body: [{ type: 'chart', kind: 'scatter', points: repeat(10_001, () => [1, 2]) }] },
    diagnostics: [error('limit-chart-points', '/body/0/points')],
  },
  ...['md', 'code', 'log'].map(
    (type): DiagnosedCase => ({
      name: `limit: long string in ${type}`,
      input: { body: [{ type, text: big(20_001) }] },
      diagnostics: [error('limit-string', '/body/0/text')],
    }),
  ),
  {
    name: 'limit: string in a title',
    input: { title: big(2_001), body: [] },
    diagnostics: [error('limit-string', '/title')],
  },
  {
    name: 'limit: string in a table cell',
    input: { body: [{ type: 'table', columns: ['a'], rows: [[big(2_001)]] }] },
    diagnostics: [error('limit-string', '/body/0/rows/0/0')],
  },
  {
    name: 'limit: string in check output',
    input: { body: [{ type: 'checks', items: [{ name: 'n', status: 'ok', output: big(2_001) }] }] },
    diagnostics: [error('limit-string', '/body/0/items/0/output')],
  },
  {
    name: 'limit: flow nodes',
    input: { body: [{ type: 'flow', nodes: repeat(41, (i) => `n${i}`), edges: [] }] },
    diagnostics: [error('limit-flow-nodes', '/body/0/nodes')],
  },
]

const noticeExtras: DiagnosedCase[] = [
  {
    name: 'bad density',
    input: { density: 'cosy', body: [] },
    diagnostics: [{ severity: 'warn', code: 'bad-enum', path: '/density' }],
  },
  ...[
    ['title', 5],
    ['subtitle', 5],
    ['locale', 5],
    ['generatedAt', 5],
    ['meta', 5],
  ].map(
    ([field, value]): DiagnosedCase => ({
      name: `envelope ${field} of the wrong type`,
      input: { [field as string]: value as number, body: [] },
      diagnostics: [{ severity: 'warn', code: 'bad-type', path: `/${field}` }],
    }),
  ),
  {
    name: 'dropped object-row key',
    input: { body: [{ type: 'table', columns: ['A'], rows: [{ A: 1, B: 2 }] }] },
    diagnostics: [{ severity: 'warn', code: 'dropped-cell', path: '/body/0/rows/0/B' }],
  },
  {
    name: 'key only in a later row',
    input: { body: [{ type: 'table', rows: [{ A: 1 }, { A: 2, B: 3 }] }] },
    diagnostics: [{ severity: 'warn', code: 'dropped-cell', path: '/body/0/rows/1/B' }],
  },
  {
    name: 'unknown format in a column suffix',
    input: { body: [{ type: 'table', columns: ['Foo:bogus'], rows: [] }] },
    diagnostics: [{ severity: 'warn', code: 'unknown-format', path: '/body/0/columns/0' }],
  },
  ...componentTables.map(
    ({ name, base }): DiagnosedCase => ({
      name: `${name} with an unknown field`,
      input: { body: [{ ...base, added: true }] },
      diagnostics: [{ severity: 'info', code: 'unknown-field', path: '/body/0/added' }],
    }),
  ),
  {
    name: 'unknown envelope field',
    input: { body: [], added: 1 },
    diagnostics: [{ severity: 'info', code: 'unknown-field', path: '/added' }],
  },
  {
    name: 'unknown field in an item',
    input: { body: [{ type: 'plan', items: [{ text: 't', status: 'ok', added: 1 }] }] },
    diagnostics: [{ severity: 'info', code: 'unknown-field', path: '/body/0/items/0/added' }],
  },
  {
    name: 'unknown field in a column',
    input: { body: [{ type: 'table', columns: [{ key: 'a', label: 'A', added: 1 }], rows: [] }] },
    diagnostics: [{ severity: 'info', code: 'unknown-field', path: '/body/0/columns/0/added' }],
  },
]

export const validCases: ValidCase[] = [...exampleCases, ...shorthandCases, ...tableValidCases()]

export const invalidCases: DiagnosedCase[] = [
  ...tableInvalidCases(),
  ...nodeShapeCases,
  ...limitCases,
  ...PARSE_FAILURES.map(
    ([name, text]): DiagnosedCase => ({
      name: `parse: ${name}`,
      text,
      diagnostics: [error('parse-error', '')],
    }),
  ),
]

/** Deliverable documents that still draw a `warn` or `info`. */
export const noticeCases: DiagnosedCase[] = [...tableNoticeCases(), ...noticeExtras]
