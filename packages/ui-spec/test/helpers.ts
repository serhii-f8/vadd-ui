import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { expect } from 'vitest'
import { generateSchema } from '../../../scripts/lib/schema-gen.mjs'
import {
  isJsonObject,
  type JsonValue,
  MAX_NESTING,
  SCHEMA_CODES,
  type ValidationResult,
} from '../src/index.js'

const typesPath = fileURLToPath(new URL('../src/types.ts', import.meta.url))

export const schema = generateSchema(readFileSync(typesPath, 'utf8'))

// `strict: false` because the generated schema uses type unions, which Ajv's strict mode
// flags as a style matter. The draft itself is still checked.
const ajv = new (Ajv2020 as unknown as typeof Ajv2020.default)({ strict: false, allErrors: false })
const accepts = ajv.compile(schema)

const schemaCodes: ReadonlySet<string> = new Set(SCHEMA_CODES)

/** VD-030: the schema rejects exactly when the walker reports a schema code. */
export function expectAgreement(result: ValidationResult): void {
  if (result.document === undefined) return
  const walkerRejects = result.diagnostics.some((d) => schemaCodes.has(d.code))
  const schemaRejects = !accepts(result.document)
  const detail = JSON.stringify({
    result: result.diagnostics.slice(0, 5),
    ajv: accepts.errors?.[0],
  })
  expect(schemaRejects, detail).toBe(walkerRejects)
}

function resolves(input: JsonValue, path: string): boolean {
  let current: JsonValue | undefined = input
  for (const raw of path.split('/').slice(1)) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (isJsonObject(current)) current = current[segment]
    else return false
    if (current === undefined) return false
  }
  return true
}

/** §13.2 on every diagnostic. `input` is left out for cases given as text. */
export function expectWellFormed(result: ValidationResult, input?: JsonValue): void {
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.message.length, diagnostic.message).toBeLessThanOrEqual(120)
    expect(diagnostic.message.length).toBeGreaterThan(0)
    expect(['error', 'warn', 'info']).toContain(diagnostic.severity)
    expect(diagnostic.path === '' || diagnostic.path.startsWith('/')).toBe(true)
    if (diagnostic.hint !== undefined) expect(diagnostic.hint).toMatch(/^did you mean /)
    if (input !== undefined) expect(resolves(input, diagnostic.path), diagnostic.path).toBe(true)
  }
  expect(result.ok).toBe(result.diagnostics.every((d) => d.severity !== 'error'))
}

export { MAX_NESTING }
