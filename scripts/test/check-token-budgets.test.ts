import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareToBaseline, makeBaseline } from '../lib/token-baseline.mjs'
import { repoRoot, run } from './helpers.js'

const COUNTER = { kind: 'offline', tokenizer: 'js-tiktoken 1.0.21 cl100k_base', method: 'm' }
const LIMITS: Record<string, number> = { 'fixed.show': 30, 'ratio.html': 0.2, 'catalog.table': 300 }

interface Result {
  counter: typeof COUNTER | { kind: 'api'; model: string }
  metrics: Record<string, number | null>
  budgets: { name: string; value: number | null; limit: number; ok: boolean }[]
}

function result(
  metrics: Record<string, number | null>,
  counter: Result['counter'] = COUNTER,
): Result {
  const budgets = Object.entries(metrics).map(([name, value]) => {
    const limit = LIMITS[name] ?? 1000
    return { name, value, limit, ok: value === null || value <= limit }
  })
  return { counter, metrics, budgets }
}

const BASE = { 'fixed.show': 20, 'ratio.html': 0.25, 'catalog.table': 200 }
const baseline = { counter: COUNTER, metrics: BASE, unmet: ['ratio.html'] }

describe('compareToBaseline (§14.3, §16 Budgets: ≤ 5% regression)', () => {
  it('fails a 6% regression and names the metric', () => {
    const findings = compareToBaseline(result({ ...BASE, 'catalog.table': 212 }), baseline)
    expect(findings).toEqual(['catalog.table: 212, baseline 200 (+6.0%, allowed +5%)'])
  })

  it('passes a 4% rise, exactly 5%, and a fall', () => {
    expect(compareToBaseline(result({ ...BASE, 'catalog.table': 208 }), baseline)).toEqual([])
    expect(compareToBaseline(result({ ...BASE, 'catalog.table': 210 }), baseline)).toEqual([])
    expect(compareToBaseline(result({ ...BASE, 'fixed.show': 12 }), baseline)).toEqual([])
  })

  it('applies the 5% to ratios too', () => {
    expect(compareToBaseline(result({ ...BASE, 'ratio.html': 0.265 }), baseline)).toEqual([
      'ratio.html: 0.265, baseline 0.25 (+6.0%, allowed +5%)',
    ])
    expect(compareToBaseline(result({ ...BASE, 'ratio.html': 0.26 }), baseline)).toEqual([])
  })

  it('fails a metric missing on either side', () => {
    const { 'fixed.show': _, ...fewer } = BASE
    expect(compareToBaseline(result(fewer), baseline)).toEqual([
      'fixed.show: in the baseline, not measured',
    ])
    expect(compareToBaseline(result({ ...BASE, 'catalog.kv': 90 }), baseline)).toEqual([
      'catalog.kv: measured, not in the baseline; run with --update',
    ])
  })

  it('fails a value that turned unmeasured', () => {
    expect(compareToBaseline(result({ ...BASE, 'fixed.show': null }), baseline)).toEqual([
      'fixed.show: in the baseline, not measured',
    ])
  })

  it('fails another counter, since the numbers would not compare', () => {
    const findings = compareToBaseline(result(BASE, { kind: 'api', model: 'x' }), baseline)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatch(/^counter: /)
  })

  it('fails a budget miss the baseline does not accept', () => {
    const fails = { ...BASE, 'fixed.show': 31 }
    const findings = compareToBaseline(result(fails), {
      ...baseline,
      metrics: { ...BASE, 'fixed.show': 31 },
    })
    expect(findings).toEqual(['fixed.show: 31 is over the §14.2 budget of 30'])
  })

  it('fails an accepted miss that is now met, so the file stays true', () => {
    const findings = compareToBaseline(result({ ...BASE, 'ratio.html': 0.19 }), baseline)
    expect(findings).toEqual([
      'ratio.html: now within its budget; remove it from unmet with --update',
    ])
  })
})

describe('makeBaseline', () => {
  it('keeps accepted misses and refuses new ones unless named', () => {
    const current = result({ ...BASE, 'fixed.show': 31 })
    expect(makeBaseline(current, baseline, []).findings).toEqual([
      'fixed.show: 31 is over the §14.2 budget of 30; accept it with --accept-unmet fixed.show',
    ])
    const accepted = makeBaseline(current, baseline, ['fixed.show'])
    expect(accepted.findings).toEqual([])
    expect(accepted.baseline).toEqual({
      counter: COUNTER,
      metrics: { ...BASE, 'fixed.show': 31 },
      unmet: ['fixed.show', 'ratio.html'],
    })
  })

  it('drops a miss that is now met', () => {
    const { baseline: next } = makeBaseline(result({ ...BASE, 'ratio.html': 0.19 }), baseline, [])
    expect(next.unmet).toEqual([])
  })
})

describe('check-token-budgets', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'vui-tokens-'))
  const write = (folder: string, name: string, value: unknown) => {
    const path = join(folder, name)
    writeFileSync(path, JSON.stringify(value))
    return path
  }

  it('exits 1 on a 6% regression and 0 on 4%', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const worse = write(folder, 'worse.json', result({ ...BASE, 'fixed.show': 21.2 }))
    const fine = write(folder, 'fine.json', result({ ...BASE, 'fixed.show': 20.8 }))
    const bad = run('check-token-budgets.mjs', '--result', worse, '--baseline', base)
    expect(bad.code).toBe(1)
    expect(bad.out).toContain('fixed.show: 21.2, baseline 20 (+6.0%, allowed +5%)')
    const good = run('check-token-budgets.mjs', '--result', fine, '--baseline', base)
    expect(good.code).toBe(0)
    expect(good.out).toContain(
      'unmet §14.2 budgets, accepted in the baseline: ratio.html 0.25 > 0.2',
    )
  })

  it('updates the baseline on request, refusing an unaccepted miss', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const over = write(folder, 'over.json', result({ ...BASE, 'fixed.show': 31 }))
    const refused = run('check-token-budgets.mjs', '--result', over, '--baseline', base, '--update')
    expect(refused.code).toBe(1)
    expect(JSON.parse(readFileSync(base, 'utf8'))).toEqual(baseline)
    const ok = run(
      'check-token-budgets.mjs',
      '--result',
      over,
      '--baseline',
      base,
      '--update',
      '--accept-unmet',
      'fixed.show',
    )
    expect(ok.code).toBe(0)
    expect(JSON.parse(readFileSync(base, 'utf8')).metrics['fixed.show']).toBe(31)
  })

  it('has a committed baseline from the offline counter, with every budget metric', () => {
    const committed = JSON.parse(readFileSync(`${repoRoot}scripts/token-baseline.json`, 'utf8'))
    expect(committed.counter.kind).toBe('offline')
    for (const name of [
      'fixed.show',
      'fixed.cdn',
      'ratio.md',
      'ratio.html',
      'skill',
      'catalog.table',
    ]) {
      expect(typeof committed.metrics[name]).toBe('number')
    }
  })

  it('runs in pnpm check', () => {
    const manifest = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8'))
    expect(manifest.scripts.check).toContain('node scripts/check-token-budgets.mjs')
  })
})
