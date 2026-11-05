import { LIMITS } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { prepare } from '../src/prepare.js'

const body = (input: unknown) => prepare(input as never).document?.body as Record<string, never>[]
const repeat = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index))

describe('prepare: reading', () => {
  it('parses relaxed text', () => {
    const { document, failure } = prepare("{body: [{type: 'md', text: 'x'}]}")
    expect(failure).toBeUndefined()
    expect(document?.locale).toBe('en-US')
  })

  it('reports a parse failure with the first 40 raw lines', () => {
    const raw = `{${'\nbad bad'.repeat(100)}`
    const { failure, document, diagnostics } = prepare(raw)
    expect(document).toBeUndefined()
    expect(failure?.raw.split('\n')).toHaveLength(40)
    expect(failure?.message).toMatch(/line \d+, column \d+/)
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'parse-error', path: '' })
  })

  it('names nesting past the parser cap a limit', () => {
    expect(prepare('['.repeat(5_000)).diagnostics[0]?.code).toBe('limit-depth')
  })

  it('renders an oversize string with a warn', () => {
    const text = 'x'.repeat(LIMITS.inputBytes)
    const { diagnostics, document } = prepare(JSON.stringify({ body: [{ type: 'md', text }] }))
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warn', code: 'limit-input-size' }),
    )
    expect(document).toBeDefined()
  })

  it('sanitizes an object first', () => {
    const input: Record<string, unknown> = { type: 'md', text: 'x' }
    input.self = input
    const { document, diagnostics } = prepare(input as never)
    expect(document?.body).toHaveLength(1)
    expect(diagnostics.some((diagnostic) => diagnostic.path === '/self')).toBe(true)
  })

  it('leaves the host object alone', () => {
    const input = { type: 'table', columns: ['a'], rows: repeat(LIMITS.tableRows + 1, () => [1]) }
    prepare(input as never)
    expect(input.rows).toHaveLength(LIMITS.tableRows + 1)
  })

  it('tolerates a root that is no document', () => {
    expect(prepare(42 as never).document?.body).toBeUndefined()
    expect(prepare('null').document?.body).toBeUndefined()
  })
})

describe('prepare: §13.4 truncation', () => {
  it('turns limit errors into warnings', () => {
    const rows = repeat(LIMITS.tableRows + 1, () => [1])
    const { diagnostics, failed } = prepare({ type: 'table', columns: ['a'], rows } as never)
    expect(diagnostics.find((item) => item.code === 'limit-table-rows')?.severity).toBe('warn')
    expect(failed.size).toBe(0)
  })

  it('cuts rows', () => {
    const rows = repeat(LIMITS.tableRows + 7, () => [1])
    expect(body({ type: 'table', columns: ['a'], rows })[0]?.rows).toHaveLength(LIMITS.tableRows)
  })

  it('cuts columns, array rows and totals', () => {
    const count = LIMITS.tableColumns + 2
    const [table] = body({
      type: 'table',
      columns: repeat(count, (index) => `c${index}`),
      rows: [repeat(count, () => 1)],
      totals: repeat(count, () => 1),
    }) as unknown as { columns: unknown[]; rows: unknown[][]; totals: unknown[] }[]
    expect(table?.columns).toHaveLength(LIMITS.tableColumns)
    expect(table?.rows[0]).toHaveLength(LIMITS.tableColumns)
    expect(table?.totals).toHaveLength(LIMITS.tableColumns)
  })

  it('passes unconverted object rows through a column cut, to an error card', () => {
    // VD-038: past the cell budget object rows stay objects.
    const columns = repeat(LIMITS.tableColumns + 500, (index) => `c${index}`)
    const rows = repeat(LIMITS.tableRows + 500, () => ({}))
    const { document, failed } = prepare({ type: 'table', columns, rows } as never)
    expect(document?.body).toHaveLength(1)
    expect(failed.has('/body/0')).toBe(true)
  })

  it('cuts series and points', () => {
    const series = Object.fromEntries(repeat(LIMITS.chartSeries + 3, (index) => [`s${index}`, [1]]))
    const [chart] = body({ type: 'chart', kind: 'line', series })
    expect(Object.keys(chart?.series ?? {})).toHaveLength(LIMITS.chartSeries)
    const values = repeat(LIMITS.chartPoints + 3, () => 1)
    const [spark] = body({ type: 'chart', kind: 'spark', values })
    expect(spark?.values).toHaveLength(LIMITS.chartPoints)
  })

  it('cuts flow nodes', () => {
    const nodes = repeat(LIMITS.flowNodes + 3, (index) => ({ id: `n${index}`, label: 'x' }))
    expect(body({ type: 'flow', nodes, edges: [] })[0]?.nodes).toHaveLength(LIMITS.flowNodes)
  })

  it('clips strings by field', () => {
    const text = 'x'.repeat(LIMITS.longString + 5)
    expect(body({ type: 'md', text })[0]?.text).toHaveLength(LIMITS.longString)
    const title = 'x'.repeat(LIMITS.string + 5)
    expect(body({ type: 'md', text: 'y', title })[0]?.title).toHaveLength(LIMITS.string)
  })

  it('drops an over-long key', () => {
    const key = 'k'.repeat(LIMITS.string + 1)
    const [chart] = body({ type: 'chart', kind: 'line', series: { [key]: [1], ok: [2] } })
    expect(Object.keys(chart?.series ?? {})).toEqual(['ok'])
  })

  it('cuts the document at the node limit', () => {
    const { document } = prepare(repeat(LIMITS.nodes + 50, () => 'x') as never)
    expect(document?.body).toHaveLength(LIMITS.nodes)
  })

  it('cuts nesting past the depth limit', () => {
    let node: unknown = { type: 'md', text: 'deep' }
    for (let index = 0; index < LIMITS.depth + 5; index += 1) {
      node = { type: 'stack', children: [node] }
    }
    const { document, diagnostics } = prepare(node as never)
    expect(diagnostics.find((item) => item.code === 'limit-depth')?.severity).toBe('warn')
    expect(JSON.stringify(document)).not.toContain('deep')
  })

  it('ignores an error in a row that was cut', () => {
    const rows: unknown[][] = repeat(LIMITS.tableRows + 1, () => [1])
    rows[LIMITS.tableRows] = [1, 2, 3]
    const { failed } = prepare({ type: 'table', columns: ['a'], rows } as never)
    expect(failed.size).toBe(0)
  })
})

describe('prepare: lenient fields', () => {
  it('drops an invalid optional field', () => {
    const { document, diagnostics } = prepare({ type: 'md', text: 'x', tone: 'neon' } as never)
    expect((document?.body?.[0] as { tone?: string }).tone).toBeUndefined()
    expect(diagnostics.find((item) => item.code === 'bad-enum')?.severity).toBe('warn')
  })

  it('leaves an invalid array item in place', () => {
    const [node] = body({ type: 'list', items: [{ text: 'a', status: 'neon' }] })
    expect(node?.items).toEqual([{ text: 'a' }])
  })
})

describe('prepare: failed nodes', () => {
  it('gives an error to the deepest node', () => {
    const { failed } = prepare({
      type: 'stack',
      children: [{ type: 'md' }, { type: 'md', text: 'fine' }],
    } as never)
    expect([...failed.keys()]).toEqual(['/body/0/children/0'])
    expect(failed.get('/body/0/children/0')?.code).toBe('missing-field')
  })

  it('reaches into tabs', () => {
    const { failed } = prepare({
      type: 'tabs',
      tabs: [{ label: 'a', children: [{ type: 'md' }] }],
    } as never)
    expect([...failed.keys()]).toEqual(['/body/0/tabs/0/children/0'])
  })

  it('fails a slot that holds no node', () => {
    const { failed } = prepare({ type: 'stack', children: [42] } as never)
    expect(failed.has('/body/0/children/0')).toBe(true)
  })

  it('leaves unknown types for the placeholder', () => {
    expect(prepare({ type: 'hologram' } as never).failed.size).toBe(0)
  })

  it('records a document-level error without a node', () => {
    const { failed, diagnostics, document } = prepare({ vui: 2, body: [] } as never)
    expect(failed.size).toBe(0)
    expect(diagnostics[0]?.code).toBe('bad-version')
    expect(document?.body).toEqual([])
  })

  it('walks a pointer with escaped segments safely', () => {
    const { failed } = prepare({ type: 'chart', kind: 'line', series: { 'a/b~c': 'bad' } } as never)
    expect(failed.size).toBeLessThanOrEqual(1)
  })
})
