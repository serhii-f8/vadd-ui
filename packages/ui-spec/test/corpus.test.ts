import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  isLimitCode,
  type JsonValue,
  normalize,
  type ValidationResult,
  validate,
  validateText,
} from '../src/index.js'
import { invalidCases, noticeCases, validCases } from './corpus/cases.js'
import {
  example52,
  example66,
  example67,
  example191,
  example192,
  example193,
} from './corpus/examples.js'
import type { DiagnosedCase, Source } from './corpus/types.js'
import { expectAgreement, expectWellFormed } from './helpers.js'

const specPath = fileURLToPath(
  new URL('../../../docs/specs/vadd-ui-technical-spec.md', import.meta.url),
)
/** The spec is not in the public repository; the test that quotes it runs only where the file is. */
const hasSpec = existsSync(specPath)
const spec = hasSpec ? readFileSync(specPath, 'utf8') : ''

const run = ({ text, input }: Source): ValidationResult =>
  text === undefined ? validate(input as JsonValue) : validateText(text)

const sourceOf = (item: Source) => (item.text === undefined ? item.input : undefined)

function diagnosed(item: DiagnosedCase): void {
  const result = run(item)
  const found = result.diagnostics.map(({ severity, code, path }) => ({ severity, code, path }))
  const sort = <T>(list: T[]) => list.map((entry) => JSON.stringify(entry)).sort()
  expect(sort(found)).toEqual(sort(item.diagnostics))
  expectWellFormed(result, sourceOf(item))
  expectAgreement(result)
}

describe('corpus size', () => {
  it('has the §16 counts', () => {
    expect(validCases.length).toBeGreaterThanOrEqual(150)
    expect(invalidCases.length).toBeGreaterThanOrEqual(150)
  })

  it('has unique names', () => {
    const names = [...validCases, ...invalidCases, ...noticeCases].map((item) => item.name)
    const repeated = names.filter((name, index) => names.indexOf(name) !== index)
    expect([...new Set(repeated)]).toEqual([])
  })

  it('keeps each list to its meaning', () => {
    for (const item of invalidCases) {
      expect(
        item.diagnostics.some((d) => d.severity === 'error'),
        item.name,
      ).toBe(true)
    }
    for (const item of noticeCases) {
      expect(
        item.diagnostics.some((d) => d.severity === 'error'),
        item.name,
      ).toBe(false)
    }
  })

  it('tests a limit for every limit code', () => {
    const covered = new Set(invalidCases.flatMap((c) => c.diagnostics.map((d) => d.code)))
    expect([...covered].filter(isLimitCode)).toHaveLength(10)
  })
})

describe.skipIf(!hasSpec)('spec examples are in the corpus as written', () => {
  it.each([
    ['### 19.1', example191],
    ['### 19.2', example192],
    ['### 19.3', example193],
    ['### 6.6', example66],
    ['### 6.7', example67],
    ['### 5.2', example52],
  ])('%s', (heading, text) => {
    const section = spec.slice(spec.indexOf(heading))
    const block = /```json\n([\s\S]*?)\n```/.exec(section)?.[1]
    expect(block).toBe(text)
  })
})

describe('valid documents', () => {
  it.each(validCases.map((item) => [item.name, item] as const))('%s', (_, item) => {
    const result = run(item)
    expect(result.diagnostics).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.document).toEqual(item.canonical)
    const canonical = result.document as unknown as JsonValue
    expect(JSON.parse(JSON.stringify(canonical))).toEqual(canonical)
    expect(normalize(canonical).document).toEqual(canonical)
    expectAgreement(result)
  })
})

describe('invalid documents', () => {
  it.each(invalidCases.map((item) => [item.name, item] as const))('%s', (_, item) => {
    expect(run(item).ok).toBe(false)
    diagnosed(item)
  })
})

describe('deliverable documents with notices', () => {
  it.each(noticeCases.map((item) => [item.name, item] as const))('%s', (_, item) => {
    expect(run(item).ok).toBe(true)
    diagnosed(item)
  })
})
