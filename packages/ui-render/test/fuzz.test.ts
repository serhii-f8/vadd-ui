import { type JsonValue, normalize, parse } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import {
  excerpt,
  fastestMs,
  fuzzCount,
  fuzzDocument,
  fuzzSeed,
  fuzzText,
  fuzzUnchecked,
} from '../../ui-spec/test/fuzz/generator.js'
import { renderMarkdown, renderPlain } from '../../ui-text/src/index.js'
import { render } from '../src/index.js'
import { badAttributes, target } from './helpers.js'

// §16 "Fuzzing": the renderer never throws to the host. `pnpm fuzz` runs the long version.
const CASES = fuzzCount(2_000)
const SEED = fuzzSeed(process.env.VUI_FUZZ_FRESH === '1' ? Date.now() >>> 0 : 20_261_110)
const CASE_MS = 2_000
/** One case in this many is `fuzzText`'s JSON, relaxed JSON or damaged text, as a string. */
const TEXT_SHARE = 10
/** What `ui-text` answers when its own catch-all fired, which is a throw in disguise. */
const TEXT_FAILED = 'Could not render this document\n'
/** One case in this many sits behind `issuePad`, so no field is checked or dropped (VD-187).
 * Each costs about 100 ms, the pad's 20,000 fields, so they stay a small share. */
const UNCHECKED_SHARE = 100
/** About 3.5 ms per case, plus the unchecked ones, with room for a slower machine. */
const RUN_MS = Math.max(600_000, CASES * 10)

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
    let unchecked = 0
    for (let index = 0; index < CASES; index++) {
      // One case in TEXT_SHARE goes in as text, as `boot` hands a script's text to `render`.
      const asText = index % TEXT_SHARE === TEXT_SHARE - 1
      const raw = index % UNCHECKED_SHARE === UNCHECKED_SHARE - 2
      const document = asText ? fuzzText(SEED, index) : raw ? fuzzUnchecked(SEED, index) : next
      if (asText) texts += 1
      if (raw) unchecked += 1
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
            (raw
              ? `case, after issuePad(): ${excerpt((document as { body: unknown[] }).body.slice(1))}`
              : `case: ${excerpt(document)}`) +
            (updated ? `\nupdated to index ${index + 1}: ${excerpt(next)}` : ''),
        )
      }
    }
    expect(texts, 'cases rendered from text').toBe(Math.floor(CASES / TEXT_SHARE))
    expect(unchecked, 'cases past the issue cap').toBe(Math.floor((CASES + 1) / UNCHECKED_SHARE))
  }, RUN_MS)
})
