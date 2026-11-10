import { type JsonValue, normalize, parse } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import {
  excerpt,
  fastestMs,
  fuzzCount,
  fuzzDocument,
  fuzzSeed,
  fuzzText,
} from '../../ui-spec/test/fuzz/generator.js'
import { renderMarkdown, renderPlain } from '../../ui-text/src/index.js'
import { render } from '../src/index.js'
import { target } from './helpers.js'

// §16 "Fuzzing": the renderer never throws to the host. `pnpm fuzz` runs the long version.
const CASES = fuzzCount(2_000)
const SEED = fuzzSeed(process.env.VUI_FUZZ_FRESH === '1' ? Date.now() >>> 0 : 20_261_110)
const CASE_MS = 2_000
/** One case in this many is `fuzzText`'s JSON, relaxed JSON or damaged text, as a string. */
const TEXT_SHARE = 10
const SVG = 'http://www.w3.org/2000/svg'
const BAD = /NaN|Infinity|undefined/
/** What `ui-text` answers when its own catch-all fired, which is a throw in disguise. */
const TEXT_FAILED = 'Could not render this document\n'

/**
 * Every attribute of an SVG element, and every `style` anywhere, that holds `NaN`, `Infinity`
 * or `undefined`: a number that went wrong on its way into geometry (VD-088's class).
 */
export function badAttributes(root: Element): string[] {
  const found: string[] = []
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const svg = element.namespaceURI === SVG
    for (const { name, value } of element.attributes) {
      if ((svg || name === 'style') && BAD.test(value)) {
        found.push(`<${element.localName} ${name}="${value.slice(0, 120)}">`)
      }
    }
  }
  return found
}

/** What is wrong with case `index`, an object or text, or nothing. */
function check(document: unknown, next: unknown): string[] {
  const problems: string[] = []
  const box = target()
  try {
    const handle = render(document as never, box)
    const failed = (where: string) =>
      handle.diagnostics
        .filter(({ code }) => code === 'render-failed')
        .map(({ path, message }) => `${where}: render-failed at ${path || '/'}: ${message}`)
    problems.push(...failed('render'), ...badAttributes(box))
    handle.update(next as never)
    problems.push(...failed('update'), ...badAttributes(box).map((bad) => `update: ${bad}`))
    handle.destroy()
    if (box.childElementCount !== 0) problems.push('destroy left children behind')
    // Total on anything (VD-166): its catch-all firing is a throw in disguise, inside the
    // limits or past them. Text that does not parse has no document for them to render.
    const parsed = typeof document === 'string' ? parse(document) : { ok: true, value: document }
    if (parsed.ok) {
      const { document: canonical } = normalize(parsed.value as JsonValue)
      if (renderMarkdown(canonical) === TEXT_FAILED) problems.push('renderMarkdown failed')
      if (renderPlain(canonical) === TEXT_FAILED) problems.push('renderPlain failed')
    }
  } catch (error) {
    problems.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : error}`)
  } finally {
    box.remove()
  }
  return problems
}

describe('the renderer under fuzzing', () => {
  it(`${CASES} cases from seed ${SEED} neither throw nor draw NaN`, async () => {
    let next = fuzzDocument(SEED, 0)
    let texts = 0
    for (let index = 0; index < CASES; index++) {
      // One case in TEXT_SHARE goes in as text, as `boot` hands a script's text to `render`.
      const asText = index % TEXT_SHARE === TEXT_SHARE - 1
      const document = asText ? fuzzText(SEED, index) : next
      if (asText) texts += 1
      next = fuzzDocument(SEED, index + 1)
      const started = performance.now()
      const problems = check(document, next)
      const once = performance.now() - started
      const ms = await fastestMs(once, CASE_MS, () => check(document, next))
      if (ms > CASE_MS) problems.push(`took ${Math.round(ms)} ms at best, over ${CASE_MS}`)
      if (problems.length > 0) {
        const updated = problems.some((problem) => problem.startsWith('update'))
        expect.fail(
          `seed ${SEED}, index ${index} (VUI_FUZZ_SEED=${SEED}):\n${problems.slice(0, 10).join('\n')}\n` +
            `case: ${excerpt(document)}` +
            (updated ? `\nupdated to index ${index + 1}: ${excerpt(next)}` : ''),
        )
      }
    }
    expect(texts, 'cases rendered from text').toBe(Math.floor(CASES / TEXT_SHARE))
  }, 600_000)
})
