import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot, run } from './helpers.js'

const script = 'check-forbidden-apis.mjs'
const fixture = (name: string) => `${repoRoot}scripts/test/fixtures/${name}`

describe('check-forbidden-apis', () => {
  it.each([
    ['inner-html.ts', 'innerHTML'],
    ['insert-adjacent-html.ts', 'insertAdjacentHTML'],
    ['document-write.ts', 'document.write'],
    ['document-writeln.ts', 'document.write'],
    ['eval.ts', 'eval'],
    ['indirect-eval.ts', 'eval'],
    ['new-function.ts', 'Function'],
    ['function-call.ts', 'Function'],
    ['computed-inner-html.ts', 'innerHTML'],
    ['concat-inner-html.ts', 'innerHTML'],
    ['component.tsx', 'dangerouslySetInnerHTML'],
    ['outer-html.ts', 'outerHTML'],
    ['srcdoc.ts', 'srcdoc'],
    ['contextual-fragment.ts', 'createContextualFragment'],
    ['dom-parser.ts', 'DOMParser'],
    ['string-timer.ts', 'string timer'],
  ])('fires on %s', (file, rule) => {
    const { code, out } = run(script, fixture(`forbidden/${file}`))
    expect(code).toBe(1)
    expect(out).toContain(`[${rule}]`)
  })

  it('names the file and line of a finding', () => {
    const { out } = run(script, fixture('forbidden/inner-html.ts'))
    expect(out).toContain('inner-html.ts:2 [innerHTML]')
  })

  it('reports every fixture when given the directory', () => {
    const { code, out } = run(script, fixture('forbidden'))
    expect(code).toBe(1)
    expect(out.trim().split('\n')).toHaveLength(17)
  })

  it('passes clean code whose comments and types mention banned words', () => {
    const { code, out } = run(script, fixture('forbidden-clean'))
    expect(out).toContain('1 file')
    expect(code).toBe(0)
  })

  it('fails rather than passes when nothing was scanned', () => {
    const { code, out } = run(script, mkdtempSync(join(tmpdir(), 'vui-scan-')))
    expect(code).toBe(1)
    expect(out).toContain('nothing scanned')
  })

  it('reports a file it cannot parse without a stack trace', () => {
    const { code, out } = run(script, fixture('forbidden-broken'))
    expect(code).toBe(1)
    expect(out).toContain('[unparsable]')
    expect(out).not.toContain('    at ')
  })

  it('scans every browser-reaching package by default and finds them clean', () => {
    const { code, out } = run(script)
    expect(out).toMatch(/\d+ files clean/)
    expect(code).toBe(0)
  })
})
