import { type JsonValue, normalize, validateText } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import {
  excerpt,
  fastestMs,
  fuzzCount,
  fuzzDocument,
  fuzzSeed,
} from '../../ui-spec/test/fuzz/generator.js'
import { renderMarkdown, renderPlain } from '../../ui-text/src/index.js'
import { render } from '../src/index.js'
import { target } from './helpers.js'

// §16 "Fuzzing": the renderer never throws to the host. `pnpm fuzz` runs the long version.
const CASES = fuzzCount(2_000)
const SEED = fuzzSeed(process.env.VUI_FUZZ_FRESH === '1' ? Date.now() >>> 0 : 20_261_110)
const CASE_MS = 2_000
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

/** What is wrong with case `index`, or nothing. */
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
    // Total on anything; and on what the CLI would accept, its catch-all must not fire.
    const { document: canonical } = normalize(document as JsonValue)
    const accepted = validateText(JSON.stringify(document) ?? '').ok
    const markdown = renderMarkdown(canonical)
    const plain = renderPlain(canonical)
    if (accepted && markdown === TEXT_FAILED) problems.push('renderMarkdown failed')
    if (accepted && plain === TEXT_FAILED) problems.push('renderPlain failed')
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
    for (let index = 0; index < CASES; index++) {
      const document = next
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
  }, 600_000)
})
