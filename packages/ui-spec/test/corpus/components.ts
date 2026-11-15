import type { JsonObject, JsonValue } from '../../src/index.js'

/** One row of expected trouble: where to write what, what code, and any other path. */
export type Trouble = [pointer: string, value: JsonValue, code?: string, path?: string]

/**
 * The oracle for one component or chart kind. Everything here is read off §5.4 and §6:
 * `base` is valid and `defaults` is what normalization adds to it.
 */
export interface ComponentTable {
  name: string
  base: JsonObject
  defaults?: JsonObject
  /** Patches that stay valid. Each is merged over `base`. */
  ok: JsonObject[]
  /** Deleting this pointer is `missing-field`, an `error` at its parent. */
  missing: string[]
  /** Writing this value is `bad-type`, or `code`, as an `error`. */
  errors: Trouble[]
  /** Writing this value is `bad-type`, or `code`, as a `warn`. */
  warnings: Trouble[]
}

const TONE_VALUES = ['ok', 'warn', 'err', 'info', 'muted', 'accent', 'default']
const STATUS_VALUES = ['ok', 'fail', 'warn', 'info', 'run', 'wait', 'skip', 'none']
const each = (field: string, values: JsonValue[]) => values.map((value) => ({ [field]: value }))

const series = { series: { s: [1] } }

const chartCommon: JsonObject[] = [
  { yFormat: 'ms' },
  { xFormat: 'date:short' },
  { stackTotal: true },
  ...each('height', ['sm', 'md', 'lg']),
  ...each('legend', ['auto', 'none']),
  { refLines: [{ y: 1, label: 'SLO', tone: 'err' }] },
]

const chartTrouble: Trouble[] = [
  ['/yFormat', 5],
  ['/yFormat', 'bogus', 'unknown-format'],
  ['/xFormat', 5],
  ['/stackTotal', false],
  ['/height', 'xl', 'bad-enum'],
  ['/legend', 'hide', 'bad-enum'],
  ['/refLines', 5],
  ['/refLines', [{ y: 1, label: 'SLO', tone: 'nope' }], 'bad-enum', '/refLines/0/tone'],
]

export const componentTables: ComponentTable[] = [
  {
    name: 'stack',
    base: { type: 'stack', children: [] },
    ok: [...each('gap', ['sm', 'md', 'lg'])],
    missing: ['/children'],
    errors: [['/children', 5]],
    warnings: [
      ['/gap', 'xl', 'bad-enum'],
      ['/gap', 1],
    ],
  },
  {
    name: 'grid',
    base: { type: 'grid', children: [] },
    ok: each('cols', [1, 2, 3, 4, 5, 6]),
    missing: ['/children'],
    errors: [['/children', true]],
    warnings: [
      ['/cols', 0, 'bad-range'],
      ['/cols', 7, 'bad-range'],
      ['/cols', 2.5, 'bad-range'],
      ['/cols', 'two'],
    ],
  },
  {
    name: 'section',
    base: { type: 'section', title: 'S', children: [] },
    ok: [{ fold: 'open' }, { title: '**bold** :ok:' }],
    missing: ['/title', '/children'],
    errors: [
      ['/title', 5],
      ['/children', null],
    ],
    warnings: [],
  },
  {
    name: 'card',
    base: { type: 'card', children: [] },
    ok: each('tone', TONE_VALUES),
    missing: ['/children'],
    errors: [['/children', 1.5]],
    warnings: [],
  },
  {
    name: 'tabs',
    base: { type: 'tabs', tabs: [{ label: 'A', children: [] }] },
    ok: [{ active: 0 }],
    missing: ['/tabs', '/tabs/0/label', '/tabs/0/children'],
    errors: [
      ['/tabs', 5],
      ['/tabs/0', 5],
      ['/tabs/0/label', 5],
      ['/tabs/0/children', 5],
    ],
    warnings: [
      ['/active', 1, 'bad-index'],
      ['/active', -1, 'bad-range'],
      ['/active', 'first'],
    ],
  },
  {
    name: 'divider',
    base: { type: 'divider' },
    ok: [{ label: 'or' }],
    missing: [],
    errors: [],
    warnings: [['/label', 5]],
  },
  {
    name: 'md',
    base: { type: 'md', text: 'hi' },
    ok: [{ text: '### h\n\n- a\n- b\n\n> q\n\n```\ncode\n```' }, { text: '' }],
    missing: ['/text'],
    errors: [['/text', 5]],
    warnings: [],
  },
  {
    name: 'callout',
    base: { type: 'callout', text: 'hi' },
    defaults: { tone: 'info' },
    ok: each('tone', TONE_VALUES),
    missing: ['/text'],
    errors: [['/text', null]],
    warnings: [
      ['/tone', 'wran', 'bad-enum'],
      ['/tone', 5],
    ],
  },
  {
    name: 'code',
    base: { type: 'code', text: 'x' },
    defaults: { maxLines: 30 },
    ok: [{ lang: 'ts' }, { lines: true }, { mark: [1, 2] }, { mark: [] }, { maxLines: 1 }],
    missing: ['/text'],
    errors: [['/text', []]],
    warnings: [
      ['/lang', 5],
      ['/lines', false],
      ['/mark', 1],
      ['/mark', ['a'], 'bad-type', '/mark/0'],
      ['/mark', [0], 'bad-range', '/mark/0'],
      ['/maxLines', 0, 'bad-range'],
      ['/maxLines', 'x'],
    ],
  },
  {
    name: 'table',
    base: {
      type: 'table',
      columns: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      rows: [[1, 'x']],
    },
    defaults: { pageSize: 25, sticky: false },
    ok: [
      { rows: [] },
      { rows: [[null, true]] },
      { rows: [[1, 2, { tone: 'warn', note: 'n' }]] },
      { rows: [[1, 2, {}]] },
      { sort: [1, 'asc'] },
      { sort: [0, 'desc'] },
      { pageSize: 5 },
      { totals: [1, null] },
      { group: 1 },
      { sticky: true },
      {
        columns: [
          { key: 'a', label: 'A', format: 'pct:0', align: 'left', cell: 'bar', width: 'auto' },
          { key: 'b', label: 'B', wrap: true, cell: 'badge', tones: { high: 'err', low: 'ok' } },
        ],
      },
      {
        columns: [
          { key: 'a', label: 'A', align: 'right', cell: 'code', width: 'narrow' },
          { key: 'b', label: 'B', align: 'center', cell: 'text', width: 'wide' },
        ],
      },
    ],
    missing: ['/rows', '/columns/0/key', '/columns/0/label'],
    errors: [
      ['/columns', 5],
      ['/columns/0', 5],
      ['/columns/0/key', 5],
      ['/columns/0/label', 5],
      ['/rows', 5],
      ['/rows/0', 5],
      ['/rows/0/0', [1]],
      ['/rows/0', [1], 'row-arity'],
      ['/rows/0', [1, 2, 3], 'row-arity'],
      ['/rows/0', [], 'row-arity'],
      ['/rows/0', [{ tone: 'ok' }, 2], 'bad-cell', '/rows/0/0'],
    ],
    warnings: [
      ['/rows/0', [1, 2, { tone: 'nope' }], 'bad-enum', '/rows/0/2/tone'],
      ['/rows/0', [1, 2, { note: 5 }], 'bad-type', '/rows/0/2/note'],
      ['/sort', [2, 'asc'], 'bad-index', '/sort/0'],
      ['/sort', [0, 'up'], 'bad-enum', '/sort/1'],
      ['/sort', ['a', 'asc'], 'bad-type', '/sort/0'],
      ['/sort', [0], 'bad-type', '/sort'],
      ['/sort', 5],
      ['/pageSize', 0, 'bad-range'],
      ['/pageSize', 'all'],
      ['/totals', [1], 'length-mismatch'],
      ['/totals', 5],
      ['/totals', [1, []], 'bad-type', '/totals/1'],
      ['/group', 2, 'bad-index'],
      ['/group', 0.5, 'bad-range'],
      ['/sticky', 'yes'],
      ['/columns/0/format', 'bogus', 'unknown-format'],
      ['/columns/0/format', 5],
      ['/columns/0/align', 'middle', 'bad-enum'],
      ['/columns/0/cell', 'chart', 'bad-enum'],
      ['/columns/0/width', 'huge', 'bad-enum'],
      ['/columns/0/wrap', 'yes'],
      ['/columns/0/tones', 5],
      ['/columns/0/tones', { high: 'red' }, 'bad-enum', '/columns/0/tones/high'],
    ],
  },
  {
    name: 'kv',
    base: { type: 'kv', pairs: [['k', 1, 'int']] },
    ok: [
      { pairs: [] },
      { pairs: {} },
      { pairs: { a: 1, b: 'x', c: null, d: true } },
      { pairs: [['k', null]] },
      ...each('cols', [1, 2, 3]),
    ],
    missing: ['/pairs'],
    errors: [
      ['/pairs', 5],
      ['/pairs/0', 5],
      ['/pairs/0', ['k']],
      ['/pairs/0', ['k', 1, 'int', 4]],
      ['/pairs/0/0', 5],
      ['/pairs/0/1', [1]],
      ['/pairs', { a: [] }, 'bad-type', '/pairs/a'],
    ],
    warnings: [
      ['/pairs/0/2', 5],
      ['/pairs/0/2', 'bogus', 'unknown-format'],
      ['/cols', 4, 'bad-range'],
      ['/cols', 'x'],
    ],
  },
  {
    name: 'stats',
    base: { type: 'stats', items: [{ label: 'L', value: 1 }] },
    ok: [
      { items: [] },
      { items: [{ label: 'L', value: null }] },
      { items: [{ label: 'L', value: '5/6', tone: 'warn' }] },
      { items: [{ label: 'L', value: 1, format: 'pct', delta: 0.1, deltaFormat: 'delta:pct' }] },
      { items: [{ label: 'L', value: 1, spark: [1, 2, 3] }] },
    ],
    missing: ['/items', '/items/0/label', '/items/0/value'],
    errors: [
      ['/items', 5],
      ['/items/0', 5],
      ['/items/0/label', 5],
      ['/items/0/value', {}],
    ],
    warnings: [
      ['/items/0/format', 5],
      ['/items/0/deltaFormat', 'pctt', 'unknown-format'],
      ['/items/0/delta', 'x'],
      ['/items/0/tone', 'nope', 'bad-enum'],
      ['/items/0/spark', 5],
      ['/items/0/spark', ['a'], 'bad-type', '/items/0/spark/0'],
    ],
  },
  {
    name: 'list',
    base: { type: 'list', items: ['a', { text: 'b' }] },
    ok: [
      { items: [] },
      { ordered: true },
      { ordered: false },
      ...STATUS_VALUES.map((status) => ({ items: [{ text: 'x', status, note: 'n' }] })),
    ],
    missing: ['/items', '/items/1/text'],
    errors: [
      ['/items', 5],
      ['/items/0', 5],
      ['/items/0', null],
      ['/items/1/text', 5],
    ],
    warnings: [
      ['/items/1/status', 'done', 'bad-enum'],
      ['/items/1/note', 5],
      ['/ordered', 'yes'],
    ],
  },
  {
    name: 'progress',
    base: { type: 'progress', value: 1, segments: [{ value: 1, tone: 'ok', label: 'L' }] },
    defaults: { max: 100 },
    ok: [{ max: 10 }, { label: 'Done' }, { segments: [] }, { value: 0 }, { value: 120.5 }],
    missing: ['/value', '/segments/0/value', '/segments/0/tone', '/segments/0/label'],
    errors: [
      ['/value', 'x'],
      ['/segments/0/value', 'x'],
      ['/segments/0/tone', 5],
      ['/segments/0/label', 5],
    ],
    warnings: [
      ['/max', 'x'],
      ['/label', 5],
      ['/segments', 5],
      ['/segments/0', 5],
      ['/segments/0/tone', 'nope', 'bad-enum'],
    ],
  },
  {
    name: 'compare',
    base: { type: 'compare', options: ['a', 'b'], criteria: [{ label: 'C', values: [1, 2] }] },
    ok: [
      { pick: 1 },
      { criteria: [] },
      { criteria: [{ label: 'C', values: [1, null], format: 'ms', better: 'low' }] },
      { criteria: [{ label: 'C', values: ['x', true], better: 'high' }] },
      {
        options: ['a', 'b', 'c'],
        criteria: [
          { label: 'p95', values: [80, 60, 60], format: 'ms', better: 'low' },
          { label: 'RPS', values: [1000, 1200, 900], format: 'int', better: 'high' },
        ],
      },
    ],
    missing: ['/options', '/criteria', '/criteria/0/label', '/criteria/0/values'],
    errors: [
      ['/options', 5],
      ['/options/0', 5],
      ['/criteria', 5],
      ['/criteria/0', 5],
      ['/criteria/0/label', 5],
      ['/criteria/0/values', 5],
      ['/criteria/0/values/0', {}],
    ],
    warnings: [
      ['/pick', 2, 'bad-index'],
      ['/pick', -1, 'bad-range'],
      ['/criteria/0/values', [1], 'length-mismatch'],
      ['/criteria/0/better', 'more', 'bad-enum'],
      ['/criteria/0/format', 'bogus', 'unknown-format'],
    ],
  },
  ...['bar', 'hbar', 'stacked'].map(
    (kind): ComponentTable => ({
      name: `chart ${kind}`,
      base: { type: 'chart', kind, x: ['a'], ...series },
      ok: [...chartCommon, { x: [], series: {} }, { series: { a: [1], b: [2] } }],
      missing: ['/x', '/series'],
      errors: [
        ['/x', 5],
        ['/x/0', 5],
        ['/series', 5],
        ['/series/s', 5],
        ['/series/s/0', 'x'],
        ['/refLines', [{ y: 'x', label: 'L', tone: 'ok' }], 'bad-type', '/refLines/0/y'],
      ],
      warnings: [...chartTrouble, ['/series/s', [1, 2], 'length-mismatch']],
    }),
  ),
  {
    name: 'chart donut',
    base: { type: 'chart', kind: 'donut', x: ['a', 'b'], series: { s: [1, 2] } },
    ok: [{ title: 'Share' }, { legend: 'none' }],
    missing: ['/x', '/series'],
    errors: [['/series/s/1', null]],
    warnings: [
      ['/series', { s: [1, 2], t: [3, 4] }, 'length-mismatch'],
      ['/series', {}, 'length-mismatch'],
    ],
  },
  ...['line', 'area'].map(
    (kind): ComponentTable => ({
      name: `chart ${kind}`,
      base: { type: 'chart', kind, x: ['a', 'b'], series: { s: [1, 2] } },
      ok: [
        ...chartCommon,
        { x: [1, 2] },
        { x: ['2026-11-04', '2026-11-05'] },
        { x: [], series: {} },
      ],
      missing: ['/x', '/series'],
      errors: [
        ['/x', 5],
        ['/x/0', true],
        ['/x/1', 1],
        ['/x', [1, 'a'], 'bad-type', '/x/1'],
        ['/series/s/0', null],
      ],
      warnings: [...chartTrouble, ['/x', [1], 'length-mismatch', '/series/s']],
    }),
  ),
  {
    name: 'chart spark',
    base: { type: 'chart', kind: 'spark', values: [1, 2] },
    ok: [...chartCommon, { values: [] }],
    missing: ['/values'],
    errors: [
      ['/values', 5],
      ['/values/0', 'x'],
    ],
    warnings: chartTrouble,
  },
  {
    name: 'chart scatter',
    base: {
      type: 'chart',
      kind: 'scatter',
      points: [
        [1, 2, 'p'],
        [3, 4],
      ],
    },
    ok: [
      ...chartCommon,
      { points: [] },
      {
        points: [[5, 5]],
        xFormat: 'ms',
        yFormat: 'pct:0',
        refLines: [{ y: 1, label: 'L', tone: 'ok' }],
      },
    ],
    missing: ['/points'],
    errors: [
      ['/points', 5],
      ['/points/0', 5],
      ['/points/1', [1]],
      ['/points/1', [1, 2, 'p', 4]],
      ['/points/0/0', 'x'],
      ['/points/0/1', 'x'],
    ],
    warnings: [...chartTrouble, ['/points/0/2', 5]],
  },
  {
    name: 'checks',
    base: { type: 'checks', items: [{ name: 'n', status: 'ok' }] },
    ok: [
      { items: [] },
      ...STATUS_VALUES.map((status) => ({ items: [{ name: 'n', status }] })),
      { items: [{ name: 'n', status: 'ok', cmd: 'pnpm t', ms: 10, output: 'done' }] },
    ],
    missing: ['/items', '/items/0/name', '/items/0/status'],
    errors: [
      ['/items', 5],
      ['/items/0', 5],
      ['/items/0/name', 5],
      ['/items/0/status', 5],
    ],
    warnings: [
      ['/items/0/status', 'passed', 'bad-enum'],
      ['/items/0/cmd', 5],
      ['/items/0/ms', 'x'],
      ['/items/0/output', 5],
    ],
  },
  {
    name: 'plan',
    base: {
      type: 'plan',
      items: [{ text: 't', status: 'ok', children: [{ text: 'c', status: 'run' }] }],
    },
    ok: [{ items: [] }, { items: [{ text: 't', status: 'wait', note: 'n' }] }],
    missing: ['/items', '/items/0/text', '/items/0/status', '/items/0/children/0/text'],
    errors: [
      ['/items', 5],
      ['/items/0', 5],
      ['/items/0/text', 5],
      ['/items/0/status', 5],
      ['/items/0/children/0/status', 5],
    ],
    warnings: [
      ['/items/0/status', 'done', 'bad-enum'],
      ['/items/0/note', 5],
      ['/items/0/children', 5],
      ['/items/0/children/0', 5],
    ],
  },
  {
    name: 'diff',
    base: { type: 'diff', files: [['a.ts', 1, 2, 'M']] },
    ok: [
      { files: [] },
      { files: [['a.ts', 0, 0]] },
      ...['A', 'M', 'D', 'R'].map((change) => ({ files: [['a.ts', 1, 2, change]] })),
      { hunks: { 'a.ts': '@@ -1 +1 @@' } },
    ],
    missing: ['/files'],
    errors: [
      ['/files', 5],
      ['/files/0', 5],
      ['/files/0', ['a.ts', 1]],
      ['/files/0', ['a.ts', 1, 2, 'M', 5]],
      ['/files/0/0', 5],
      ['/files/0/1', 'x'],
      ['/files/0/2', 'x'],
    ],
    warnings: [
      ['/files/0/1', -1, 'bad-range'],
      ['/files/0/3', 'X', 'bad-enum'],
      ['/files/0/3', 5],
      ['/hunks', 5],
      ['/hunks', { 'a.ts': 5 }, 'bad-type', '/hunks/a.ts'],
    ],
  },
  {
    name: 'tree',
    base: { type: 'tree', items: [{ name: 'a', children: [{ name: 'b' }] }] },
    ok: [
      { items: [] },
      { paths: ['src/a.ts', 'src/b.ts'] },
      { items: [{ name: 'a', status: 'ok', note: 'n' }] },
    ],
    missing: ['/items/0/name', '/items/0/children/0/name'],
    errors: [
      ['/items/0/name', 5],
      ['/items/0/children/0/name', null],
    ],
    warnings: [
      ['/items/0/status', 'nope', 'bad-enum'],
      ['/items/0/note', 5],
      ['/items/0/children', 5],
      ['/paths', 5],
      ['/paths', [5], 'bad-type', '/paths/0'],
    ],
  },
  {
    name: 'timeline',
    base: { type: 'timeline', items: [{ at: '2026-11-04', text: 't' }] },
    ok: [{ items: [] }, { items: [{ at: 'Monday', text: 't', status: 'ok' }] }],
    missing: ['/items', '/items/0/at', '/items/0/text'],
    errors: [
      ['/items', 5],
      ['/items/0', 5],
      ['/items/0/at', 5],
      ['/items/0/text', 5],
    ],
    warnings: [['/items/0/status', 'nope', 'bad-enum']],
  },
  {
    name: 'decision',
    base: { type: 'decision', question: 'q', options: [{ label: 'a' }] },
    ok: [
      { pick: 0 },
      { context: 'c' },
      { options: [] },
      ...['XS', 'S', 'M', 'L', 'XL'].map((effort) => ({ options: [{ label: 'a', effort }] })),
      ...['low', 'med', 'high'].map((risk) => ({ options: [{ label: 'a', risk }] })),
      { options: [{ label: 'a', pros: ['p'], cons: ['c'], reversible: false, verify: 'v' }] },
    ],
    missing: ['/question', '/options', '/options/0/label'],
    errors: [
      ['/question', 5],
      ['/options', 5],
      ['/options/0', 5],
      ['/options/0/label', 5],
    ],
    warnings: [
      ['/context', 5],
      ['/pick', 1, 'bad-index'],
      ['/pick', 'a'],
      ['/options/0/pros', 5],
      ['/options/0/cons', [5], 'bad-type', '/options/0/cons/0'],
      ['/options/0/effort', 'XXL', 'bad-enum'],
      ['/options/0/reversible', 'yes'],
      ['/options/0/risk', 'mid', 'bad-enum'],
      ['/options/0/verify', 5],
    ],
  },
  {
    name: 'log',
    base: { type: 'log', text: 'INFO up' },
    defaults: { maxLines: 40 },
    ok: [{ maxLines: 5 }, { text: 'ERROR a\nWARN b\nDEBUG c' }],
    missing: ['/text'],
    errors: [['/text', 5]],
    warnings: [
      ['/maxLines', 0, 'bad-range'],
      ['/maxLines', 'x'],
    ],
  },
  {
    name: 'flow',
    base: { type: 'flow', nodes: ['a', 'b', { id: 'c', label: 'C' }], edges: [['a', 'b', 'l']] },
    ok: [
      { edges: [] },
      { nodes: [], edges: [] },
      { nodes: ['a', { id: 'b', label: 'B', status: 'ok' }], edges: [['a', 'b']] },
      {
        nodes: ['a', 'b', 'c'],
        edges: [
          ['a', 'b'],
          ['b', 'c', 'next'],
          ['c', 'a', 'retry'],
          ['c', 'c'],
        ],
      },
    ],
    missing: ['/edges', '/nodes/2/id', '/nodes/2/label'],
    errors: [
      ['/nodes/2', 5],
      ['/nodes/2/id', 5],
      ['/nodes/2/label', 5],
      ['/edges', 5],
      ['/edges/0', 5],
      ['/edges/0', ['a']],
      ['/edges/0', ['a', 'b', 'l', 'x']],
      ['/edges/0/0', 5],
      ['/edges/0/1', 5],
    ],
    warnings: [
      ['/edges/0/0', 'z', 'bad-ref'],
      ['/edges/0/1', 'z', 'bad-ref'],
      ['/edges/0/2', 5],
      ['/nodes/2/status', 'nope', 'bad-enum'],
    ],
  },
]
