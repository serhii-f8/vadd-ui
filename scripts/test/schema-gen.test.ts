import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateSchema } from '../lib/schema-gen.mjs'

const typesPath = fileURLToPath(new URL('../../packages/ui-spec/src/types.ts', import.meta.url))
const script = fileURLToPath(new URL('../generate-schema.mjs', import.meta.url))
const source = readFileSync(typesPath, 'utf8')

/** A root named `VuiDocument` around `body`, so each test states only what it needs. */
function schemaOf(body: string): { $defs: Record<string, Record<string, unknown>> } {
  return generateSchema(`export interface VuiDocument { x: T }\n${body}`) as never
}

describe('generateSchema on the subset', () => {
  it('declares draft 2020-12 and refers to the root type', () => {
    const schema = generateSchema(source) as Record<string, unknown>
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.$ref).toBe('#/$defs/VuiDocument')
  })

  it('reads literal unions, const arrays and primitive unions', () => {
    const { $defs } = schemaOf(`
      export const NAMES = ['a', 'b'] as const
      export type Name = (typeof NAMES)[number]
      export interface T { n: Name; lit: 'x' | 'y'; one: 'z'; yes: true; s: string | null }
    `)
    expect($defs.T?.properties).toEqual({
      n: { $ref: '#/$defs/Name' },
      lit: { enum: ['x', 'y'] },
      one: { const: 'z' },
      yes: { const: true },
      s: { type: ['string', 'null'] },
    })
    expect($defs.Name).toEqual({ enum: ['a', 'b'] })
  })

  it('writes labeled and plain tuples with prefixItems', () => {
    const { $defs } = schemaOf(`
      export type T = [number, string] | [path: string, added: number, change: 'A' | 'M']
    `)
    expect($defs.T).toEqual({
      anyOf: [
        {
          type: 'array',
          prefixItems: [{ type: 'number' }, { type: 'string' }],
          minItems: 2,
          maxItems: 2,
        },
        {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }, { enum: ['A', 'M'] }],
          minItems: 3,
          maxItems: 3,
        },
      ],
    })
  })

  it('reads arrays, records and unknown', () => {
    const { $defs } = schemaOf(`
      export interface T { a: string[]; b: (string | U)[]; c: Record<string, number>; d: Record<string, unknown> }
      export interface U { k?: boolean }
    `)
    expect($defs.T?.properties).toEqual({
      a: { type: 'array', items: { type: 'string' } },
      b: { type: 'array', items: { anyOf: [{ type: 'string' }, { $ref: '#/$defs/U' }] } },
      c: { type: 'object', additionalProperties: { type: 'number' } },
      d: { type: 'object', additionalProperties: {} },
    })
    expect($defs.U).toEqual({
      type: 'object',
      properties: { k: { type: 'boolean' } },
      required: [],
    })
  })

  it('flattens extends, lets a child tighten a field and omits unreachable types', () => {
    const { $defs } = schemaOf(`
      export interface Base { id?: string; title?: string }
      export interface T extends Base { title: string }
      export interface Unused { a: string }
    `)
    expect($defs.T?.required).toEqual(['title'])
    expect(Object.keys($defs.T?.properties as object)).toEqual(['id', 'title'])
    expect(Object.keys($defs).sort()).toEqual(['T', 'VuiDocument'])
  })

  it('turns doc tags on an alias into keywords', () => {
    const { $defs } = schemaOf(`
      /** A span. @integer @minimum 1 @maximum 12 */
      export type T = number
    `)
    expect($defs.T).toEqual({ type: 'integer', minimum: 1, maximum: 12 })
  })

  it('ignores comments and scalar constants', () => {
    const { $defs } = schemaOf(`
      // export type Nope = number
      export const NAME = 'text'
      /* block */
      export type T = string
    `)
    expect($defs.T).toEqual({ type: 'string' })
  })

  it('names the line of syntax it cannot read', () => {
    expect(() =>
      generateSchema('export interface VuiDocument {\n  a: Map<string, string>\n}'),
    ).toThrow(/line 2/)
    expect(() => generateSchema('export function nope() {}')).toThrow(/line 1/)
    expect(() => generateSchema('export type A = number @')).toThrow(/line 1/)
    expect(() => generateSchema('export interface VuiDocument { a: Missing }')).toThrow(/Missing/)
    expect(() => generateSchema('export interface Other {}')).toThrow(/VuiDocument/)
  })
})

describe('generateSchema refuses what it would otherwise lose', () => {
  const root = 'export interface VuiDocument { x: T }\n'

  it.each([
    ['an unknown tag', '/** @interger */ export type T = number', /@interger/],
    ['a fractional bound', '/** @minimum 0.5 */ export type T = number', /@minimum needs/],
    ['a bound with no value', '/** @maximum */ export type T = number', /@maximum needs/],
    ['a tag on a union', '/** @integer */ export type T = number | string', /tags need a number/],
    ['a tag on an interface', '/** @integer */ export interface T {}', /type alias/],
    ['a tag on a member', 'export interface T {\n /** @integer */\n a: number }', /type alias/],
    ['a second declaration', 'export interface T {}\nexport interface T {}', /declared twice/],
  ])('%s', (_, body, message) => {
    expect(() => generateSchema(root + body)).toThrow(message)
  })
})

describe('the schema follows the types', () => {
  const base = generateSchema(source) as { $defs: Record<string, { properties?: object }> }

  it('gains a field when types.ts gains one', () => {
    const edited = source.replace(
      "export interface CalloutNode extends NodeBase {\n  type: 'callout'",
      "export interface CalloutNode extends NodeBase {\n  type: 'callout'\n  added?: boolean",
    )
    expect(edited).not.toBe(source)
    const schema = generateSchema(edited) as typeof base
    expect(base.$defs.CalloutNode?.properties).not.toHaveProperty('added')
    expect(schema.$defs.CalloutNode?.properties).toHaveProperty('added', { type: 'boolean' })
  })

  it('loses a component and an enum value when types.ts does', () => {
    const edited = source
      .replace("  'stack',\n", '')
      .replace("'ok', 'warn', 'err'", "'warn', 'err'")
    expect(
      (generateSchema(edited) as { $defs: { Tone: { enum: string[] } } }).$defs.Tone.enum,
    ).not.toContain('ok')
  })

  it('covers all 24 components, with the chart split by kind', () => {
    const members = (base.$defs.VuiNode as unknown as { anyOf: { $ref: string }[] }).anyOf
    expect(members).toHaveLength(24)
    const chart = base.$defs.ChartNode as unknown as { anyOf: unknown[] }
    expect(chart.anyOf).toHaveLength(4)
  })

  it('carries the §5.4 and §6 ranges', () => {
    expect(base.$defs.Span).toEqual({ type: 'integer', minimum: 1, maximum: 12 })
    expect(base.$defs.GridCols).toEqual({ type: 'integer', minimum: 1, maximum: 6 })
    expect(base.$defs.KvCols).toEqual({ type: 'integer', minimum: 1, maximum: 3 })
  })
})

describe('generate-schema.mjs', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'vui-schema-')), 'nested', 'vui.schema.json')

  it('writes what generateSchema returns, and --check accepts it', () => {
    execFileSync('node', [script, '--out', out], { stdio: 'pipe' })
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(generateSchema(source))
    execFileSync('node', [script, '--out', out, '--check'], { stdio: 'pipe' })
  })

  it('--check fails on a stale or missing file', () => {
    expect(() =>
      execFileSync('node', [script, '--out', `${out}.missing`, '--check'], { stdio: 'pipe' }),
    ).toThrow(/stale or missing/)
  })
})
