import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateText } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { example193 } from '../../ui-spec/test/corpus/examples.js'
import { renderMarkdown, renderPlain } from '../src/index.js'

const specPath = fileURLToPath(
  new URL('../../../docs/specs/vadd-ui-technical-spec.md', import.meta.url),
)

/** The fenced block under the §19.5 heading, read from the spec so the two cannot drift. */
function section195(): string {
  const spec = readFileSync(specPath, 'utf8')
  const start = spec.indexOf('### 19.5')
  const open = spec.indexOf('```markdown\n', start) + '```markdown\n'.length
  return spec.slice(open, spec.indexOf('```', open))
}

const document193 = () => {
  const { document } = validateText(example193)
  if (document === undefined) throw new Error('§19.3 must validate')
  return document
}

describe('§19.5', () => {
  // The spec is not in the public repository; this runs only where the file is.
  it.skipIf(!existsSync(specPath))(
    'reproduces the markdown for the §19.3 document, byte for byte',
    () => {
      const expected = section195()
      expect(expected).toContain('searchSku ⚠')
      expect(renderMarkdown(document193())).toBe(expected)
    },
  )

  it('renders the same document as plain text', () => {
    expect(renderPlain(document193())).toBe(PLAIN)
  })
})

const PLAIN = `Catalog query latency

Query          Calls     p95  Hit rate
------------  ------  ------  --------
searchSku ⚠    2,204  212 ms     41.0%
listProducts  18,420   84 ms     93.0%
getVariant     9,310   61 ms     88.0%

Line chart: p50, p95 over 10:00–10:20; SLO 100 ms.
`
