import { version } from '@vadd/ui'
import { type Diagnostic, LIMITS } from '@vadd/ui-spec'
import { GENERATOR } from '@vadd/ui-viewer'
import { describe, expect, it } from 'vitest'
import { exitCodeOf, prepare } from '../src/pipeline.js'
import { NOW } from './helpers.js'

const diag = (severity: Diagnostic['severity'], code: Diagnostic['code']): Diagnostic => ({
  severity,
  path: '',
  code,
  message: 'x',
})

describe('exitCodeOf', () => {
  it.each<[string, Diagnostic[], boolean, number]>([
    ['nothing', [], false, 0],
    ['a warning', [diag('warn', 'bad-enum')], false, 0],
    ['bad-value', [diag('warn', 'bad-value')], false, 0],
    ['bad-format-arg', [diag('warn', 'bad-format-arg')], false, 0],
    ['info', [diag('info', 'unknown-field')], false, 0],
    ['info, strictly', [diag('info', 'unknown-field')], true, 0],
    ['a warning, strictly', [diag('warn', 'bad-enum')], true, 1],
    ['an error', [diag('error', 'bad-type')], false, 1],
    ['a parse error', [diag('error', 'parse-error')], false, 2],
    ['a limit', [diag('error', 'limit-nodes')], false, 3],
    ['a limit past an error', [diag('error', 'bad-type'), diag('error', 'limit-depth')], false, 3],
    [
      'a parse error past an error',
      [diag('error', 'bad-type'), diag('error', 'parse-error')],
      false,
      2,
    ],
    [
      'a limit past a parse error',
      [diag('error', 'parse-error'), diag('error', 'limit-nodes')],
      false,
      3,
    ],
  ])('%s', (_, diagnostics, strict, exit) => {
    expect(exitCodeOf(diagnostics, strict)).toBe(exit)
  })
})

describe('prepare', () => {
  it('stamps meta and generatedAt', () => {
    const { document } = prepare('{"body":[]}', NOW)
    expect(document?.generatedAt).toBe('2026-11-05T10:00:00.000Z')
    expect(document?.meta).toEqual({ generator: GENERATOR, version })
  })

  it('keeps a generatedAt the document set', () => {
    const { document } = prepare('{"generatedAt":"2020-01-01T00:00:00Z","body":[]}', NOW)
    expect(document?.generatedAt).toBe('2020-01-01T00:00:00Z')
  })

  it('keeps other meta keys, and overrules what the document claims', () => {
    const text = '{"meta":{"event":"e1","generator":"fake","version":"9"},"body":[]}'
    expect(prepare(text, NOW).document?.meta).toEqual({
      event: 'e1',
      generator: GENERATOR,
      version,
    })
  })

  it.each([['"str"'], ['5'], ['[1]'], ['null']])('replaces a meta of %s', (meta) => {
    const { document, diagnostics } = prepare(`{"meta":${meta},"body":[]}`, NOW)
    expect(diagnostics[0]?.code).toBe('bad-type')
    expect(document?.meta).toEqual({ generator: GENERATOR, version })
  })

  it('stamps a document with warnings', () => {
    const { document, diagnostics } = prepare(
      '{"body":[{"type":"list","items":[{"text":"a","status":"passed"}]}]}',
      NOW,
    )
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(document?.meta).toBeDefined()
  })

  it('gives no document on an error', () => {
    expect(prepare('{"body":[{"type":"tabel"}]}', NOW).document).toBeUndefined()
  })

  it('gives no document on a parse error', () => {
    const { document, diagnostics } = prepare('{', NOW)
    expect(document).toBeUndefined()
    expect(diagnostics[0]?.code).toBe('parse-error')
  })

  it('measures the stamped document, to the byte', () => {
    const make = (pad: number) =>
      JSON.stringify({
        generatedAt: '2026-11-05T10:00:00Z',
        body: [],
        meta: { pad: 'y'.repeat(pad) },
      })
    const stampedBytes = Buffer.byteLength(JSON.stringify(prepare(make(0), NOW).document))
    const room = LIMITS.inputBytes - stampedBytes

    const fits = prepare(make(room), NOW)
    expect(fits.diagnostics).toEqual([])
    expect(Buffer.byteLength(JSON.stringify(fits.document))).toBe(LIMITS.inputBytes)

    const over = prepare(make(room + 1), NOW)
    expect(Buffer.byteLength(make(room + 1))).toBeLessThan(LIMITS.inputBytes)
    expect(over.document).toBeUndefined()
    expect(over.diagnostics.map(({ code }) => code)).toEqual(['limit-canonical-size'])
    expect(exitCodeOf(over.diagnostics)).toBe(3)
  })
})

describe('prepare overrides', () => {
  const NOW_ = new Date('2026-11-06T10:00:00.000Z')
  const text = '{"title":"T","meta":{"cwd":"/forged","branch":"forged","keep":"yes"},"body":["x"]}'

  it('replaces the title', () => {
    expect(prepare(text, NOW_, { title: 'New' }).document?.title).toBe('New')
  })

  it('replaces a claimed meta value, and keeps other keys', () => {
    const { document } = prepare(text, NOW_, { meta: { cwd: '/real', branch: 'main' } })
    expect(document?.meta).toMatchObject({ cwd: '/real', branch: 'main', keep: 'yes' })
  })

  it('removes a claimed value it has no answer for', () => {
    const { document } = prepare(text, NOW_, { meta: { branch: undefined } })
    expect(document?.meta).not.toHaveProperty('branch')
  })

  it('measures what it added', () => {
    const items = Array.from({ length: 190 }, () => 'x'.repeat(1300))
    const near = JSON.stringify({ body: items })
    expect(prepare(near, NOW_).document).toBeDefined()
    const { document, diagnostics } = prepare(near, NOW_, { meta: { cwd: 'y'.repeat(20000) } })
    expect(document).toBeUndefined()
    expect(diagnostics.at(-1)?.code).toBe('limit-canonical-size')
  })
})
