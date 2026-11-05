import { describe, expect, it } from 'vitest'
import { isLimitCode, type JsonValue, validate, validateText } from '../src/index.js'

const ESC = String.fromCharCode(0x1b)

const repeat = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index))

function timed(text: string) {
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(262_144)
  const started = performance.now()
  const result = validateText(text)
  return { result, ms: performance.now() - started }
}

// Each shape fits inside 256 KiB and once cost minutes, gigabytes or a crash.
describe('hostile documents inside the input limit', () => {
  it('a long series key with many bad points', () => {
    const key = 'k'.repeat(130_000)
    const points = repeat(42_000, () => '').join("','")
    const text = `{body:[{type:'chart',kind:'bar',x:[],series:{${key}:['${points}']}}]}`
    const { result, ms } = timed(text)
    expect(ms).toBeLessThan(3_000)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.code)).toContain('limit-string')
    expect(result.diagnostics.length).toBeLessThanOrEqual(1_012)
  })

  it('many tables each just under the expansion cap', () => {
    const table = JSON.stringify({
      type: 'table',
      columns: repeat(500, () => 'a'),
      rows: repeat(500, () => ({})),
    })
    const { result, ms } = timed(`[${repeat(72, () => table).join(',')}]`)
    expect(ms).toBeLessThan(5_000)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.code)).toContain('limit-canonical-size')
  })

  it('a huge flow whose edges all miss', () => {
    const nodes = repeat(32_000, (i) => `"${(i % 90) + 10}"`).join(',')
    const edges = repeat(9_000, () => '["z","z"]').join(',')
    const { result, ms } = timed(`[{type:'flow',nodes:[${nodes}],edges:[${edges}]}]`)
    expect(ms).toBeLessThan(1_000)
    expect(result.diagnostics.map((d) => d.code)).toEqual(['limit-flow-nodes'])
  })
})

describe('the diagnostic cap', () => {
  const badItems = (count: number) => repeat(count, () => 5)

  it('stops errors at 2,000 and says how many it left out', () => {
    const { diagnostics, ok } = validate({ body: [{ type: 'list', items: badItems(2_500) }] })
    expect(ok).toBe(false)
    expect(diagnostics).toHaveLength(2_001)
    expect(diagnostics.at(-1)).toMatchObject({
      severity: 'error',
      code: 'too-many-diagnostics',
      path: '',
      message: '500 more diagnostics were left out',
    })
  })

  it('stays ok when only warnings were left out', () => {
    const items = repeat(1_500, () => ({ text: 't', status: 'nope' }))
    const { diagnostics, ok } = validate({ body: [{ type: 'list', items }] })
    expect(ok).toBe(true)
    expect(diagnostics.at(-1)).toMatchObject({ severity: 'warn', code: 'too-many-diagnostics' })
  })

  it('never loses a limit, which decides the exit code', () => {
    const input = { body: [{ type: 'list', items: badItems(2_500) }, ...repeat(400, () => 'x')] }
    const found = validate(input).diagnostics.map((d) => d.code)
    expect(found).toContain('limit-nodes')
    expect(found.at(-1)).toBe('too-many-diagnostics')
  })

  it('counts dropped row keys too', () => {
    const rows = repeat(1_500, () => ({ a: 1, b: 2 }))
    const input = { body: [{ type: 'table', columns: ['a'], rows }] }
    expect(validate(input).diagnostics).toHaveLength(1_001)
  })
})

describe('limits that were reachable around', () => {
  const limits = (input: JsonValue) =>
    validate(input)
      .diagnostics.map((d) => d.code)
      .filter(isLimitCode)

  it('a stat sparkline is a series', () => {
    const item = (points: number) => ({ label: 'L', value: 1, spark: repeat(points, () => 1) })
    expect(limits({ body: [{ type: 'stats', items: [item(10_000)] }] })).toEqual([])
    expect(limits({ body: [{ type: 'stats', items: [item(10_001)] }] })).toEqual([
      'limit-chart-points',
    ])
  })

  it('an enum value counts as a string', () => {
    const tone = 'x'.repeat(2_001)
    expect(limits({ body: [{ type: 'card', children: [], tone }] })).toEqual(['limit-string'])
  })

  it('a record key counts as a string, and its value is skipped', () => {
    const series = { ['k'.repeat(2_001)]: ['x'] }
    const { diagnostics } = validate({ body: [{ type: 'chart', kind: 'bar', x: ['a'], series }] })
    expect(diagnostics.map((d) => d.code)).toEqual(['limit-string'])
    const hunks = { ['k'.repeat(2_001)]: 'x' }
    expect(limits({ body: [{ type: 'diff', files: [], hunks }] })).toEqual(['limit-string'])
  })

  it('one over-long string column reports once', () => {
    const columns = ['x'.repeat(2_001)]
    expect(limits({ body: [{ type: 'table', columns, rows: [] }] })).toEqual(['limit-string'])
  })
})

describe('text from a document cannot shape a diagnostic', () => {
  it('escapes line breaks and terminal controls', () => {
    const type = `x\nerror /body/9: forged${ESC}[31m${String.fromCharCode(0x9b, 0x2028)}`
    const [diagnostic] = validate({ type }).diagnostics
    expect(diagnostic?.message).toBe(
      String.raw`unknown type "x\nerror /body/9: forged\u001b[31m\u009b\u2028"`,
    )
    expect(diagnostic?.message).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u)
  })

  it('escapes C1 controls, quotes and separators', () => {
    const message = (type: string) => validate({ type }).diagnostics[0]?.message
    expect(message('a"b')).toBe(String.raw`unknown type "a\"b"`)
    expect(message(String.fromCharCode(0x85))).toBe(String.raw`unknown type "\u0085"`)
    expect(message(String.fromCharCode(0x2029))).toBe(String.raw`unknown type "\u2029"`)
  })

  it('does not split a surrogate pair when clipping', () => {
    const message = validate({ type: `${'x'.repeat(28)}😀😀` }).diagnostics[0]?.message
    expect(message).toBe(`unknown type "${'x'.repeat(28)}…"`)
  })

  it('survives a deep value in a bad version', () => {
    let vui: JsonValue = 1
    for (let level = 0; level < 100_000; level++) vui = [vui]
    expect(validate({ vui, body: [] }).diagnostics).toMatchObject([
      { code: 'bad-version', message: 'unsupported vui array; this version is 1' },
    ])
  })
})

describe('a tree that cannot render', () => {
  const codes = (node: JsonValue) => validate({ body: [node] }).diagnostics.map((d) => d.code)

  it('fails when items hold no item, the mistake of writing paths as items', () => {
    const found = codes({ type: 'tree', items: ['src/a.ts', 'src/b.ts'] })
    expect(found).toEqual(['bad-type', 'bad-type', 'tree-source'])
    expect(validate({ type: 'tree', items: ['a'] }).ok).toBe(false)
  })

  it('fails when the only source has the wrong type', () => {
    expect(validate({ type: 'tree', items: 5 }).ok).toBe(false)
    expect(validate({ type: 'tree', paths: 5 }).ok).toBe(false)
    expect(validate({ type: 'tree', paths: [5] }).ok).toBe(false)
  })

  it('passes when either source works', () => {
    expect(validate({ type: 'tree', items: 5, paths: ['a'] }).ok).toBe(true)
    expect(validate({ type: 'tree', items: [{ name: 'a' }], paths: 5 }).ok).toBe(true)
    expect(validate({ type: 'tree', items: [] }).ok).toBe(true)
    expect(validate({ type: 'tree', paths: [] }).ok).toBe(true)
  })
})

describe('a hint on a missing field', () => {
  it('points at the misspelled key', () => {
    const { diagnostics } = validate({ type: 'md', txt: 'x' })
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'missing-field',
      hint: 'did you mean "text" instead of "txt"?',
    })
  })

  it('stays out when no key is close', () => {
    expect(validate({ type: 'md', qqqqqq: 'x' }).diagnostics[0]).not.toHaveProperty('hint')
  })
})
