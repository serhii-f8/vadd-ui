import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  COMPONENT_TYPES,
  type JsonValue,
  type ValidationResult,
  validate,
  validateText,
} from '@vadd/ui-spec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidCases, noticeCases, validCases } from '../../ui-spec/test/corpus/cases.js'
import type { Source } from '../../ui-spec/test/corpus/types.js'
import { renderMarkdown, renderPlain } from '../src/index.js'

const run = ({ text, input }: Source): ValidationResult =>
  text === undefined ? validate(input as JsonValue) : validateText(text)

const FAILURE = /Could not render|Unsupported component/
const WHOLE_FAILURE = 'Could not render this document'

describe('valid corpus snapshots (§16)', () => {
  it('holds at least 150 documents', () => {
    expect(validCases.length).toBeGreaterThanOrEqual(150)
  })

  it('covers every component', () => {
    const seen = new Set<string>()
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit)
      else if (typeof value === 'object' && value !== null) {
        const { type } = value as { type?: unknown }
        if (typeof type === 'string') seen.add(type)
        Object.values(value).forEach(visit)
      }
    }
    visit(validCases.map((item) => item.canonical))
    expect(COMPONENT_TYPES.filter((type) => !seen.has(type))).toEqual([])
  })

  it.each(validCases.map((item) => [item.name, item] as const))('%s', (_, item) => {
    const document = run(item).document
    expect(document).toBeDefined()
    if (document === undefined) return
    const markdown = renderMarkdown(document)
    const plain = renderPlain(document)
    expect(markdown).not.toMatch(FAILURE)
    expect(plain).not.toMatch(FAILURE)
    expect(markdown).toMatchSnapshot('markdown')
    expect(plain).toMatchSnapshot('plain')
  })
})

describe('never throws, never logs (§15.1)', () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const
  const sinks = () => [
    ...methods.map((name) => vi.spyOn(console, name)),
    vi.spyOn(process.stdout, 'write'),
    vi.spyOn(process.stderr, 'write'),
  ]
  let spies: ReturnType<typeof sinks>

  beforeEach(() => {
    spies = sinks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['valid', validCases as Source[]],
    ['notice', noticeCases as Source[]],
    ['invalid', invalidCases as Source[]],
  ])('%s cases', (_, cases) => {
    let rendered = 0
    for (const item of cases) {
      const { document } = run(item)
      if (document === undefined) continue
      // §9.3: a bad field costs one node at most, never the document.
      expect(renderMarkdown(document)).not.toContain(WHOLE_FAILURE)
      expect(renderPlain(document)).not.toContain(WHOLE_FAILURE)
      rendered++
    }
    expect(rendered).toBeGreaterThan(0)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('has no way to log: the source names no console, process or I/O', () => {
    const dir = fileURLToPath(new URL('../src/', import.meta.url))
    for (const file of readdirSync(dir)) {
      expect(readFileSync(`${dir}${file}`, 'utf8')).not.toMatch(/\b(console|process|node:)\b/)
    }
  })
})
