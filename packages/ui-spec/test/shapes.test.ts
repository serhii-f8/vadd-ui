import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateSchema } from '../../../scripts/lib/schema-gen.mjs'
import { type Rule, SHAPES } from '../src/rules.js'

// The walker's tables are hand-written and the schema is generated. This compares them
// rule by rule, so a type changed on one side fails here, not in some later corpus case.

type Node = Record<string, unknown>

const types = fileURLToPath(new URL('../src/types.ts', import.meta.url))
const { $defs: defs } = generateSchema(readFileSync(types, 'utf8')) as {
  $defs: Record<string, Node>
}

function resolve(schema: Node): Node {
  const { $ref: ref } = schema
  return typeof ref === 'string' ? resolve(defs[ref.split('/').pop() as string] as Node) : schema
}

function refName(schema: Node): string | undefined {
  const ref = schema.$ref
  if (typeof ref !== 'string') return undefined
  const name = ref.split('/').pop() as string
  const target = defs[name] as Node
  return target.$ref === undefined && target.properties === undefined ? refName(target) : name
}

/** A union of tuples that differ only in a trailing element reads as one optional tuple. */
function asTuple(schema: Node): { items: Node[]; min: number } | undefined {
  const variants = schema.anyOf ? (schema.anyOf as Node[]).map(resolve) : [schema]
  if (!variants.every((variant) => variant.prefixItems)) return undefined
  const longest = variants.at(-1) as Node
  return {
    items: longest.prefixItems as Node[],
    min: Math.min(...variants.map((variant) => (variant.prefixItems as Node[]).length)),
  }
}

function expectMatch(schema: Node, rule: Rule, where: string): void {
  const target = resolve(schema)
  switch (rule.kind) {
    case 'any':
      return
    case 'node':
      expect(refName(schema) ?? (schema.$ref as string), where).toMatch(/VuiNode/)
      return
    case 'string':
    case 'format':
      expect(target, where).toEqual({ type: 'string' })
      return
    case 'number': {
      const type = rule.integer ? 'integer' : 'number'
      const expected: Node = { type }
      if (rule.min !== undefined) expected.minimum = rule.min
      if (rule.max !== undefined) expected.maximum = rule.max
      expect(target, where).toEqual(expected)
      return
    }
    case 'boolean':
      expect(target, where).toEqual({ type: 'boolean' })
      return
    case 'true':
      expect(target, where).toEqual({ const: true })
      return
    case 'version':
      expect(target, where).toEqual({ type: 'integer', minimum: 1, maximum: 1 })
      return
    case 'scalar':
      expect(target, where).toEqual({ type: ['string', 'number', 'boolean', 'null'] })
      return
    case 'enum':
      expect(target.enum ?? [target.const], where).toEqual([...rule.values])
      return
    case 'array':
    case 'nested': {
      expect(target.type, where).toBe('array')
      const items = target.items as Node
      if (rule.kind === 'nested') expect(refName(items), where).toBe(rule.shape)
      else expectMatch(items, rule.items, `${where}[]`)
      return
    }
    case 'tuple': {
      const tuple = asTuple(target)
      expect(tuple, where).toBeDefined()
      expect(tuple?.items, where).toHaveLength(rule.items.length)
      expect(tuple?.min, where).toBe(rule.min)
      rule.items.forEach((item, index) => {
        expectMatch(tuple?.items[index] as Node, item, `${where}/${index}`)
      })
      return
    }
    case 'record':
      expect(target.type, where).toBe('object')
      expectMatch(target.additionalProperties as Node, rule.values, `${where}{}`)
      return
    case 'object':
      expect(refName(schema), where).toBe(rule.shape)
      return
    case 'any-object':
      expect(target, where).toEqual({ type: 'object', additionalProperties: {} })
      return
    case 'oneOf': {
      const options = target.anyOf as Node[]
      expect(options, where).toHaveLength(rule.options.length)
      rule.options.forEach((option, index) => {
        expectMatch(options[index] as Node, option, `${where}|${index}`)
      })
    }
  }
}

const objectDefs = Object.entries(defs).filter(([, schema]) => schema.properties !== undefined)

describe('SHAPES against the generated schema', () => {
  it('has a shape for each object type, and no extras', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(objectDefs.map(([name]) => name).sort())
    expect(objectDefs.length).toBeGreaterThan(35)
  })

  it.each(objectDefs)('%s has the same fields, requirements and rules', (name, schema) => {
    const shape = SHAPES[name]
    const properties = schema.properties as Record<string, Node>
    expect(Object.keys(shape?.fields ?? {}).sort()).toEqual(Object.keys(properties).sort())
    const required = Object.entries(shape?.fields ?? {})
      .filter(([, field]) => field.presence !== 'optional')
      .map(([field]) => field)
    expect(required.sort()).toEqual([...(schema.required as string[])].sort())
    for (const [field, spec] of Object.entries(shape?.fields ?? {})) {
      expectMatch(properties[field] as Node, spec.rule, `${name}.${field}`)
    }
  })
})
