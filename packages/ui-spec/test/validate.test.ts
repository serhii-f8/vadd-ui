import { describe, expect, it } from 'vitest'
import {
  isLimitCode,
  type JsonValue,
  LIMITS,
  MAX_NESTING,
  validate,
  validateText,
} from '../src/index.js'

const codes = (input: JsonValue) => validate(input).diagnostics.map((d) => d.code)
const node = (fields: Record<string, JsonValue>) => validate({ body: [fields] }).diagnostics
const repeat = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index))

function nest(depth: number): JsonValue {
  let current: JsonValue = 'leaf'
  for (let level = 1; level < depth; level++) current = { type: 'stack', children: [current] }
  return current
}

describe('validate', () => {
  it('passes a minimal document and returns its canonical form', () => {
    const result = validate({ body: ['hi'] })
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.document?.body).toEqual([{ type: 'md', text: 'hi' }])
  })

  it('stays ok on warnings and info', () => {
    const result = validate({ body: [{ type: 'card', children: [], tone: 'nope', x: 1 }] })
    expect(result.ok).toBe(true)
    expect(result.diagnostics.map((d) => d.severity)).toEqual(['warn', 'info'])
  })

  it('passes options through to the normalizer', () => {
    const result = validate({ body: [] }, { generatedAt: '2026-11-04T10:15:00Z' })
    expect(result.document?.generatedAt).toBe('2026-11-04T10:15:00Z')
  })

  it('fails a value that is no document at all', () => {
    const result = validate(5)
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toMatchObject([
      { code: 'missing-field', path: '', severity: 'error' },
    ])
  })
})

describe('paths refer to the input', () => {
  it('reports a bare node at the root', () => {
    expect(validate({ type: 'tabel' }).diagnostics[0]?.path).toBe('')
    expect(validate({ type: 'card', children: [], gap: 1 }).diagnostics[0]?.path).toBe('/gap')
  })

  it('reports through a top-level array and a single child', () => {
    const input = [{ type: 'card', children: { type: 'nope' } }]
    expect(validate(input).diagnostics[0]?.path).toBe('/0/children')
  })

  it('reports through object rows and string columns', () => {
    const input = {
      type: 'table',
      columns: ['A', 'B'],
      rows: [{ A: 1, B: [2] }],
    }
    expect(validate(input).diagnostics[0]).toMatchObject({ code: 'bad-type', path: '/rows/0/B' })
  })

  it('reports dropped row keys as warnings', () => {
    const input = { type: 'table', columns: ['A'], rows: [{ A: 1, Z: 2 }] }
    expect(validate(input).diagnostics).toMatchObject([
      { severity: 'warn', code: 'dropped-cell', path: '/rows/0/Z' },
    ])
  })

  it('reports a missing field at its owner', () => {
    expect(node({ type: 'section', children: [] })).toMatchObject([
      { code: 'missing-field', path: '/body/0', severity: 'error' },
    ])
  })
})

describe('severity', () => {
  it('fails a wrong type in a required field and warns on an optional one', () => {
    expect(node({ type: 'md', text: 5 })[0]?.severity).toBe('error')
    expect(node({ type: 'md', text: 'x', title: 5 })[0]?.severity).toBe('warn')
  })

  it('treats a field with a default as optional', () => {
    expect(node({ type: 'code', text: 'x', maxLines: 'many' })[0]).toMatchObject({
      severity: 'warn',
      code: 'bad-type',
    })
  })

  it('inherits requiredness into arrays', () => {
    expect(node({ type: 'list', items: [5] })[0]?.severity).toBe('error')
    expect(
      node({ type: 'decision', question: 'q', options: [{ label: 'a', pros: [5] }] })[0]?.severity,
    ).toBe('warn')
  })

  it('still fails a required field inside an optional one', () => {
    const chart = { type: 'chart', kind: 'bar', x: [], series: {}, refLines: [{ y: 1 }] }
    expect(node(chart).map((d) => d.code)).toEqual(['missing-field', 'missing-field'])
    expect(node(chart)[0]?.severity).toBe('error')
  })

  it('warns on a bad status, as §11.3 shows', () => {
    expect(node({ type: 'checks', items: [{ name: 'n', status: 'passed' }] })).toEqual([
      {
        severity: 'warn',
        path: '/body/0/items/0/status',
        code: 'bad-enum',
        message: '"passed" is not a status; use ok|fail|warn|info|run|wait|skip|none',
      },
    ])
  })

  it('fails a bad chart kind, which has no safe default', () => {
    expect(node({ type: 'chart', kind: 'pie', x: [], series: {} })[0]).toMatchObject({
      severity: 'error',
      code: 'bad-enum',
    })
    expect(node({ type: 'chart', x: [] })[0]?.code).toBe('missing-field')
    expect(node({ type: 'chart', kind: 1 })[0]).toMatchObject({
      severity: 'error',
      code: 'bad-type',
    })
  })

  it('warns on a value out of range or not whole', () => {
    expect(node({ type: 'card', children: [], span: 13 })[0]).toMatchObject({
      severity: 'warn',
      code: 'bad-range',
    })
    expect(node({ type: 'grid', children: [], cols: 1.5 })[0]?.code).toBe('bad-range')
    expect(node({ type: 'kv', pairs: {}, cols: 4 })[0]?.code).toBe('bad-range')
    expect(node({ type: 'card', children: [], span: 12 })).toEqual([])
  })
})

describe('§5.3-level rows', () => {
  const table = (rows: JsonValue[]) => ({ type: 'table', columns: ['A', 'B'], rows })

  it('reports row arity as §11.3 shows', () => {
    expect(node(table([[1]]))).toMatchObject([
      {
        severity: 'error',
        code: 'row-arity',
        message: 'expected 2 cells, got 1',
        path: '/body/0/rows/0',
      },
    ])
  })

  it('reads a trailing object as options, always', () => {
    expect(node(table([[1, 2, { tone: 'ok' }]]))).toEqual([])
    expect(node(table([[1, { tone: 'ok' }]]))[0]?.code).toBe('row-arity')
  })

  it('refuses an object that is not last', () => {
    expect(node(table([[{ tone: 'ok' }, 2]]))[0]).toMatchObject({
      code: 'bad-cell',
      severity: 'error',
      path: '/body/0/rows/0/0',
    })
  })

  it('checks row options', () => {
    expect(node(table([[1, 2, { tone: 'nope', x: 1 }]])).map((d) => d.code)).toEqual([
      'bad-enum',
      'unknown-field',
    ])
  })
})

describe('cross-field rules', () => {
  it('warns on an index past its list', () => {
    const base = { type: 'table', columns: ['A'], rows: [] }
    expect(node({ ...base, sort: [1, 'asc'] })[0]).toMatchObject({
      code: 'bad-index',
      severity: 'warn',
      path: '/body/0/sort/0',
    })
    expect(node({ ...base, group: 1 })[0]?.code).toBe('bad-index')
    expect(node({ ...base, group: 0, sort: [0, 'desc'] })).toEqual([])
    expect(node({ type: 'tabs', tabs: [], active: 0 })[0]?.code).toBe('bad-index')
    expect(node({ type: 'compare', options: [], criteria: [], pick: 0 })[0]?.code).toBe('bad-index')
    expect(node({ type: 'decision', question: 'q', options: [], pick: 0 })[0]?.code).toBe(
      'bad-index',
    )
  })

  it('warns when parallel lists disagree', () => {
    const table = { type: 'table', columns: ['A'], rows: [], totals: [1, 2] }
    expect(node(table)[0]).toMatchObject({ code: 'length-mismatch', severity: 'warn' })
    expect(
      node({ type: 'compare', options: ['a'], criteria: [{ label: 'l', values: [] }] })[0],
    ).toMatchObject({ code: 'length-mismatch', path: '/body/0/criteria/0/values' })
    expect(node({ type: 'chart', kind: 'bar', x: ['a'], series: { s: [1, 2] } })[0]).toMatchObject({
      code: 'length-mismatch',
      path: '/body/0/series/s',
    })
    expect(node({ type: 'chart', kind: 'donut', x: [], series: { a: [], b: [] } })[0]?.code).toBe(
      'length-mismatch',
    )
  })

  it('warns on a flow edge to an undeclared node', () => {
    const flow = {
      type: 'flow',
      nodes: ['a', { id: 'b', label: 'B' }],
      edges: [
        ['a', 'b'],
        ['a', 'c'],
      ],
    }
    expect(node(flow)).toMatchObject([
      { code: 'bad-ref', severity: 'warn', path: '/body/0/edges/1/1' },
    ])
  })

  it('needs items or paths on a tree', () => {
    expect(node({ type: 'tree' })).toMatchObject([{ code: 'tree-source', severity: 'error' }])
    expect(node({ type: 'tree', paths: ['a'] })).toEqual([])
  })

  it('warns on an unknown format name and leaves arguments to task 04', () => {
    const stats = { type: 'stats', items: [{ label: 'l', value: 1, format: 'pctt:0' }] }
    expect(node(stats)[0]).toMatchObject({
      code: 'unknown-format',
      severity: 'warn',
      hint: 'did you mean "pct"?',
    })
    expect(node({ type: 'table', columns: ['Foo:bogus'], rows: [] })[0]?.path).toBe(
      '/body/0/columns/0',
    )
    expect(node({ type: 'kv', pairs: [['k', 1, 'money:PLN']] })).toEqual([])
  })
})

describe('stat better and chart tones (VD-212, VD-213)', () => {
  it('accepts better on a stat item and suggests a value', () => {
    expect(node({ type: 'stats', items: [{ label: 'a', value: 1, better: 'low' }] })).toEqual([])
    expect(
      node({ type: 'stats', items: [{ label: 'a', value: 1, better: 'lo' }] })[0],
    ).toMatchObject({
      code: 'bad-enum',
      path: '/body/0/items/0/better',
      hint: 'did you mean "low"?',
    })
  })

  it('accepts tones on series charts and warns on a key that names no series', () => {
    const chart = { type: 'chart', kind: 'bar', x: ['a'], series: { ok: [1], fail: [2] } }
    expect(node({ ...chart, tones: { ok: 'ok', fail: 'err' } })).toEqual([])
    expect(node({ ...chart, kind: 'line', tones: { fail: 'err' } })).toEqual([])
    expect(node({ ...chart, tones: { fial: 'err' } })).toEqual([
      {
        severity: 'warn',
        path: '/body/0/tones/fial',
        code: 'bad-ref',
        message: 'tones names no series "fial"',
        hint: 'did you mean "fail"?',
      },
    ])
    expect(node({ ...chart, tones: { ok: 'green' } })[0]).toMatchObject({
      code: 'bad-enum',
      path: '/body/0/tones/ok',
    })
  })
})

describe('value checks', () => {
  const warn = { code: 'bad-value', severity: 'warn' }

  it('warns on a cell of the wrong type, at the cell', () => {
    const table = {
      type: 'table',
      columns: ['Name', 'Time:ms'],
      rows: [
        ['a', 'slow'],
        ['b', 2],
      ],
    }
    expect(node(table)).toMatchObject([{ ...warn, path: '/body/0/rows/0/1' }])
    expect(validate({ body: [table] }).ok).toBe(true)
  })

  it('points into object rows as written', () => {
    const table = { type: 'table', columns: ['Time:ms'], rows: [{ 'Time:ms': 'slow' }] }
    expect(node(table)).toMatchObject([{ ...warn, path: '/body/0/rows/0/Time:ms' }])
  })

  it('accepts null cells, unformatted columns and row options', () => {
    const table = {
      type: 'table',
      columns: ['Name', 'Time:ms'],
      rows: [
        ['a', null],
        [1, 2, { tone: 'ok' }],
      ],
    }
    expect(node(table)).toEqual([])
  })

  it('checks totals', () => {
    const table = { type: 'table', columns: ['Time:ms'], rows: [], totals: ['x'] }
    expect(node(table)).toMatchObject([{ ...warn, path: '/body/0/totals/0' }])
  })

  it('checks kv tuples, stats and compare', () => {
    expect(node({ type: 'kv', pairs: [['k', 'x', 'num']] })).toMatchObject([
      { ...warn, path: '/body/0/pairs/0/1' },
    ])
    expect(node({ type: 'kv', pairs: [['k', 'x']] })).toEqual([])
    const stats = { type: 'stats', items: [{ label: 'l', value: 'x', format: 'pct' }] }
    expect(node(stats)).toMatchObject([{ ...warn, path: '/body/0/items/0/value' }])
    expect(node({ type: 'stats', items: [{ label: 'l', value: 'x' }] })).toEqual([])
    const compare = {
      type: 'compare',
      options: ['a', 'b'],
      criteria: [{ label: 'l', values: [1, 'x'], format: 'num' }],
    }
    expect(node(compare)).toMatchObject([{ ...warn, path: '/body/0/criteria/0/values/1' }])
  })

  it('names the positional limit for a stats item that is too long or too short', () => {
    const message = (items: JsonValue[]) =>
      node({ type: 'stats', items }).map(({ code, path, message: text }) => ({ code, path, text }))
    expect(message([['a', 1, 'num', null, null, 'ok', 'extra']])).toEqual([
      {
        code: 'bad-type',
        path: '/body/0/items/0',
        text: 'expected an object or a positional item of 2 to 6 entries, got 7 entries',
      },
    ])
    expect(message([['a']])[0]?.text).toBe(
      'expected an object or a positional item of 2 to 6 entries, got 1 entry',
    )
    expect(message([[1, 2]])[0]?.text).toBe(
      'expected an object or a positional item whose first entry is the label, a string',
    )
    expect(message(['a'])[0]?.text).toBe('expected an object, got string')
  })

  it('checks a stats delta against its deltaFormat', () => {
    const stats = {
      type: 'stats',
      items: [{ label: 'l', value: 1, delta: 2, deltaFormat: 'status' }],
    }
    expect(node(stats)).toMatchObject([{ ...warn, path: '/body/0/items/0/delta' }])
    const fine = {
      type: 'stats',
      items: [{ label: 'l', value: 1, delta: 2, deltaFormat: 'delta:pct' }],
    }
    expect(node(fine)).toEqual([])
  })

  it('survives a long format string', () => {
    const format = 'delta:'.repeat(6_250)
    const text = JSON.stringify({ body: [{ type: 'kv', pairs: [['k', 1, format]] }] })
    expect(() => validateText(text)).not.toThrow()
  })

  it('warns on a bad format argument wherever a format is declared', () => {
    const bad = { code: 'bad-format-arg', severity: 'warn' }
    expect(node({ type: 'table', columns: ['A:pct:abc'], rows: [] })).toMatchObject([
      { ...bad, path: '/body/0/columns/0' },
    ])
    expect(node({ type: 'kv', pairs: [['k', 1, 'money']] })).toMatchObject([
      { ...bad, path: '/body/0/pairs/0/2' },
    ])
    const stats = { type: 'stats', items: [{ label: 'l', value: 1, deltaFormat: 'delta:status' }] }
    expect(node(stats)).toMatchObject([{ ...bad, path: '/body/0/items/0/deltaFormat' }])
  })

  it('accepts the delta syntax of VD-042 through a column suffix', () => {
    const table = { type: 'table', columns: ['p95:delta:ms:better:low'], rows: [[1]] }
    expect(node(table)).toEqual([])
    expect(validate({ body: [table] }).document?.body[0]).toMatchObject({
      columns: [{ label: 'p95', format: 'delta:ms:better:low' }],
    })
  })

  it('warns on an unusable generatedAt and locale', () => {
    expect(validate({ generatedAt: 'soon', body: [] }).diagnostics).toMatchObject([
      { ...warn, path: '/generatedAt' },
    ])
    expect(validate({ generatedAt: '2026-11-04T10:15:00Z', body: [] }).diagnostics).toEqual([])
    expect(validate({ locale: 'not a locale!', body: [] }).diagnostics).toMatchObject([
      { code: 'bad-format-arg', severity: 'warn', path: '/locale' },
    ])
    expect(validate({ locale: 'uk-UA', body: [] }).diagnostics).toEqual([])
  })
})

describe('suggestions', () => {
  it('suggests a type', () => {
    expect(validate({ type: 'tabel' }).diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'unknown-type',
      message: 'unknown type "tabel"',
      hint: 'did you mean "table"?',
    })
  })

  it('suggests a field', () => {
    expect(node({ type: 'card', children: [], titel: 'x' })[0]).toMatchObject({
      severity: 'info',
      code: 'unknown-field',
      hint: 'did you mean "title"?',
    })
  })

  it('suggests an enum value', () => {
    expect(node({ type: 'callout', text: 'x', tone: 'wran' })[0]?.hint).toBe('did you mean "warn"?')
    expect(node({ type: 'chart', kind: 'bra' })[0]?.hint).toBe('did you mean "bar"?')
  })

  it('lists the values of an enum that got the wrong type', () => {
    const [fold] = node({ type: 'section', title: 'x', fold: true, children: [] })
    expect(fold).toMatchObject({
      code: 'bad-type',
      path: '/body/0/fold',
      message: 'expected a fold state (open|closed), got boolean',
    })
    const [tone] = node({ type: 'callout', text: 'x', tone: 3 })
    expect(tone?.message).toBe(
      'expected a tone (ok|warn|err|info|muted|accent|default), got number',
    )
  })

  it('tells kv that it takes pairs, not items', () => {
    const diagnostics = node({ type: 'kv', items: [['a', 1]] })
    expect(diagnostics).toContainEqual({
      severity: 'error',
      path: '/body/0',
      code: 'missing-field',
      message: 'missing required field "pairs"',
      hint: 'kv takes "pairs", not "items"',
    })
    expect(diagnostics).toContainEqual({
      severity: 'info',
      path: '/body/0/items',
      code: 'unknown-field',
      message: 'unknown field "items" is ignored',
      hint: 'kv takes "pairs", not "items"',
    })
  })

  it('names the list a component takes for another list field', () => {
    expect(node({ type: 'checks', rows: [] })[0]?.hint).toBe('checks takes "items", not "rows"')
    expect(node({ type: 'table', columns: [], items: [] })[0]?.hint).toBe(
      'table takes "rows", not "items"',
    )
  })

  it('keeps a near-miss hint over the list hint', () => {
    expect(node({ type: 'kv', pair: [] })[0]?.hint).toBe('did you mean "pairs" instead of "pair"?')
  })

  it('stays silent when nothing is close', () => {
    expect(validate({ type: 'qqqqqqqq' }).diagnostics[0]).not.toHaveProperty('hint')
  })
})

describe('§17.1 forward compatibility', () => {
  it('fails an unknown component, keeps the document and leaves the node as written', () => {
    const unknown = { type: 'hologram', depth: 3 }
    const result = validate({ body: [unknown, 'after'] })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.code)).toEqual(['unknown-type'])
    expect(result.document?.body[0]).toEqual(unknown)
    expect(result.document?.body).toHaveLength(2)
  })

  it('reports unknown fields as info, at every level', () => {
    const result = validate({
      added: 1,
      body: [{ type: 'plan', added: 1, items: [{ text: 't', status: 'ok', added: 1 }] }],
    })
    expect(result.ok).toBe(true)
    expect(result.diagnostics.map((d) => [d.severity, d.code, d.path])).toEqual([
      ['info', 'unknown-field', '/body/0/items/0/added'],
      ['info', 'unknown-field', '/body/0/added'],
      ['info', 'unknown-field', '/added'],
    ])
  })

  it('warns on an unknown enum value and keeps the document', () => {
    const result = validate({ density: 'cosy', body: [] })
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toMatchObject([
      { severity: 'warn', code: 'bad-enum', path: '/density' },
    ])
  })

  it('fails a newer major and any other bad version', () => {
    for (const vui of [2, 0, 1.5, '1']) {
      expect(validate({ vui, body: [] }).diagnostics).toMatchObject([
        { severity: 'error', code: 'bad-version', path: '/vui' },
      ])
    }
    expect(validate({ vui: 1, body: [] }).diagnostics).toEqual([])
  })
})

describe('§13.4 limits', () => {
  const string = (length: number) => 'x'.repeat(length)
  const limitsOf = (input: JsonValue) => codes(input).filter(isLimitCode)

  it('nesting depth', () => {
    expect(limitsOf({ body: [nest(12)] })).toEqual([])
    expect(validate({ body: [nest(13)] }).diagnostics).toMatchObject([
      { severity: 'error', code: 'limit-depth' },
    ])
    expect(limitsOf({ body: [nest(40)] })).toEqual(['limit-depth'])
  })

  it('counts plan and tree items towards depth', () => {
    let item: JsonValue = { text: 't', status: 'ok' }
    for (let level = 0; level < 11; level++) item = { text: 't', status: 'ok', children: [item] }
    expect(limitsOf({ body: [{ type: 'plan', items: [item] }] })).toEqual(['limit-depth'])
  })

  it('keeps reporting structure below the depth limit', () => {
    let current: JsonValue = { type: 'nope' }
    for (let level = 1; level < 20; level++) current = { type: 'stack', children: [current] }
    expect(codes({ body: [current] })).toEqual(['limit-depth', 'unknown-type'])
  })

  it('nodes per document', () => {
    expect(limitsOf({ body: repeat(400, () => 'x') })).toEqual([])
    expect(validate({ body: repeat(401, () => 'x') }).diagnostics).toMatchObject([
      { severity: 'error', code: 'limit-nodes', path: '' },
    ])
  })

  it('does not count items as nodes', () => {
    expect(limitsOf({ body: [{ type: 'list', items: repeat(500, () => 'x') }] })).toEqual([])
  })

  it('table rows and columns', () => {
    const table = (columns: number, rows: number) => ({
      body: [
        {
          type: 'table',
          columns: repeat(columns, (i) => `c${i}`),
          rows: repeat(rows, () => repeat(columns, () => 1)),
        },
      ],
    })
    expect(limitsOf(table(30, 5))).toEqual([])
    expect(limitsOf(table(1, 5000))).toEqual([])
    expect(limitsOf(table(31, 1))).toEqual(['limit-table-columns'])
    expect(limitsOf(table(1, 5001))).toEqual(['limit-table-rows'])
  })

  it('reports a table past the expansion cap, whose rows stay objects', () => {
    const input = {
      body: [
        { type: 'table', columns: repeat(40, (i) => `c${i}`), rows: repeat(7000, () => ({})) },
      ],
    }
    const found = codes(input)
    expect(found).toContain('limit-table-rows')
    expect(found).toContain('limit-table-columns')
    expect(found).toContain('bad-type')
    expect(found).not.toContain('row-arity')
  })

  it('chart points and series', () => {
    const points = (count: number) => repeat(count, () => 1)
    const bar = (count: number) => ({
      type: 'chart',
      kind: 'bar',
      x: [],
      series: { s: points(count) },
    })
    expect(limitsOf({ body: [bar(10_000)] })).toEqual([])
    expect(limitsOf({ body: [bar(10_001)] })).toEqual(['limit-chart-points'])
    const spark = (count: number) => ({ type: 'chart', kind: 'spark', values: points(count) })
    expect(limitsOf({ body: [spark(10_000)] })).toEqual([])
    expect(limitsOf({ body: [spark(10_001)] })).toEqual(['limit-chart-points'])
    const scatter = { type: 'chart', kind: 'scatter', points: repeat(10_001, () => [1, 2]) }
    expect(limitsOf({ body: [scatter] })).toEqual(['limit-chart-points'])
    const series = (count: number) => ({
      type: 'chart',
      kind: 'line',
      x: [],
      series: Object.fromEntries(repeat(count, (i) => [`s${i}`, []])),
    })
    expect(limitsOf({ body: [series(12)] })).toEqual([])
    expect(limitsOf({ body: [series(13)] })).toEqual(['limit-chart-series'])
  })

  it('string length: 20,000 for md, code and log text, 2,000 elsewhere', () => {
    for (const type of ['md', 'code', 'log']) {
      expect(limitsOf({ body: [{ type, text: string(20_000) }] })).toEqual([])
      expect(limitsOf({ body: [{ type, text: string(20_001) }] })).toEqual(['limit-string'])
    }
    expect(limitsOf({ title: string(2_000), body: [] })).toEqual([])
    expect(limitsOf({ title: string(2_001), body: [] })).toEqual(['limit-string'])
    expect(limitsOf({ body: [string(20_001)] })).toEqual(['limit-string'])
    expect(limitsOf({ body: [{ type: 'callout', text: string(2_001) }] })).toEqual(['limit-string'])
    const table = { type: 'table', columns: ['A'], rows: [[string(2_001)]] }
    expect(limitsOf({ body: [table] })).toEqual(['limit-string'])
    const format = { type: 'kv', pairs: [['k', 1, string(2_001)]] }
    expect(limitsOf({ body: [format] })).toEqual(['limit-string'])
  })

  it('leaves meta, unknown fields and unknown nodes out of the string limit', () => {
    expect(limitsOf({ meta: { x: string(3_000) }, x: string(3_000), body: [] })).toEqual([])
    expect(limitsOf({ body: [{ type: 'nope', text: string(3_000) }] })).toEqual([])
  })

  it('flow nodes', () => {
    const flow = (count: number) => ({
      type: 'flow',
      nodes: repeat(count, (i) => `n${i}`),
      edges: [],
    })
    expect(limitsOf({ body: [flow(40)] })).toEqual([])
    expect(limitsOf({ body: [flow(41)] })).toEqual(['limit-flow-nodes'])
  })

  it('makes every limit an error', () => {
    const { diagnostics } = validate({
      body: [nest(13), { type: 'flow', nodes: repeat(41, () => 'n'), edges: [] }],
    })
    for (const diagnostic of diagnostics.filter((d) => isLimitCode(d.code))) {
      expect(diagnostic.severity).toBe('error')
    }
    expect(LIMITS.flowNodes).toBe(40)
  })
})

describe('validateText', () => {
  it('validates relaxed text', () => {
    expect(validateText("{body: ['hi',],}")).toMatchObject({ ok: true, diagnostics: [] })
  })

  it('reports a parse error with line and column and no document', () => {
    const result = validateText('{\n  body: [\n}')
    expect(result.ok).toBe(false)
    expect(result.document).toBeUndefined()
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'parse-error',
      path: '',
    })
    expect(result.diagnostics[0]?.message).toMatch(/line 3, column 1/)
    expect(isLimitCode('parse-error')).toBe(false)
  })

  it('maps parser nesting to the depth limit (VD-023)', () => {
    const result = validateText('['.repeat(MAX_NESTING + 1))
    expect(result.diagnostics).toMatchObject([{ severity: 'error', code: 'limit-depth', path: '' }])
  })

  it('refuses input over 256 KiB before parsing', () => {
    const body = (size: number) => `["${'x'.repeat(size - 4)}"]`
    expect(validateText(`${body(LIMITS.inputBytes)}`).diagnostics.map((d) => d.code)).not.toContain(
      'limit-input-size',
    )
    expect(validateText(`${body(LIMITS.inputBytes + 1)}`)).toMatchObject({
      ok: false,
      diagnostics: [{ severity: 'error', code: 'limit-input-size', path: '' }],
    })
    expect(validateText('x'.repeat(LIMITS.inputBytes + 1)).diagnostics[0]?.code).toBe(
      'limit-input-size',
    )
  })

  it('counts bytes, not characters', () => {
    expect(validateText(`"${'é'.repeat(140_000)}"`).diagnostics[0]?.code).toBe('limit-input-size')
    expect(validateText(`"${'€'.repeat(90_000)}"`).diagnostics[0]?.code).toBe('limit-input-size')
    expect(validateText(`"${'😀'.repeat(70_000)}"`).diagnostics[0]?.code).toBe('limit-input-size')
    expect(validateText(`"${'\ud83d'.repeat(90_000)}"`).diagnostics[0]?.code).toBe(
      'limit-input-size',
    )
  })

  it('reports a canonical form over the POST limit (VD-012)', () => {
    const columns = repeat(30, (i) => `c${i}`)
    const text = JSON.stringify({
      body: [{ type: 'table', columns, rows: repeat(5_000, () => ({})) }],
    })
    expect(text.length).toBeLessThan(LIMITS.inputBytes)
    const result = validateText(text)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.code)).toContain('limit-canonical-size')
    expect(result.document).toBeDefined()
  })
})

describe('hostile values stay data', () => {
  it('reads prototype names as ordinary strings', () => {
    expect(codes({ type: 'constructor' })).toEqual(['unknown-type'])
    expect(codes({ type: '__proto__' })).toEqual(['unknown-type'])
    expect(node({ type: 'chart', kind: 'constructor' })[0]?.code).toBe('bad-enum')
    expect(node({ type: 'card', children: [], constructor: 1 })[0]?.code).toBe('unknown-field')
    const parsed = validateText(`{"body":[{"type":"card","children":[],"__proto__":{"x":1}}]}`)
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(['unknown-field'])
  })

  it('walks a series named like a prototype key', () => {
    const text = `[{type:'chart',kind:'line',x:[1],series:{"__proto__":[1],constructor:[2]}}]`
    expect(validateText(text).diagnostics).toEqual([])
  })

  it('survives a host value nested far past the parser cap', () => {
    const deep = nest(100_000)
    const result = validate({ body: [deep] })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.code)).toEqual(['limit-depth'])
  })

  it('refuses NaN and Infinity from a host value', () => {
    expect(node({ type: 'progress', value: Number.NaN })[0]?.code).toBe('bad-type')
    expect(node({ type: 'progress', value: Number.POSITIVE_INFINITY })[0]?.code).toBe('bad-type')
  })
})
