import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compare, LIMITS, makeBaseline } from '../lib/perf-baseline.mjs'
import { repoRoot, run } from './helpers.js'

const MB = 1_048_576
const HARDWARE = {
  cpu: 'AMD Ryzen 9 9950X3D 16-Core Processor',
  cores: 8,
  memGiB: 35,
  load: [9, 8, 7],
}
const CHROMIUM = '140.0.7339.16'
const METRICS = {
  'render.table': 2.6,
  'render.doc20': 1.0,
  'render.chart': 4.0,
  'memory.visual': 0.5 * MB,
}
const baseline = {
  date: '2026-11-10',
  chromium: CHROMIUM,
  hardware: HARDWARE,
  metrics: METRICS,
}

type Rounds = Record<string, number[]>

/** Five rounds of each metric, each scaled from its baseline by `factors`. */
function rounds(factors: number[] = [1, 1, 1, 1, 1], only?: string): Rounds {
  return Object.fromEntries(
    Object.entries(METRICS).map(([name, base]) => [
      name,
      factors.map((factor) => (only === undefined || only === name ? base * factor : base)),
    ]),
  )
}

const result = (values: Rounds, hardware = HARDWARE, chromium = CHROMIUM) => ({
  chromium,
  hardware,
  rounds: values,
})

describe('compare (§9.5, §16 Budgets: ≤ 5% regression)', () => {
  it('fails +6% in every round and names the metric', () => {
    const { failures } = compare(
      baseline,
      result(rounds([1.06, 1.06, 1.06, 1.06, 1.06], 'render.table')),
    )
    expect(failures).toEqual(['render.table: 2.756 ms, baseline 2.600 ms (+6.0%, allowed +5%)'])
  })

  it('passes +4% in every round, and exactly +5%', () => {
    expect(compare(baseline, result(rounds([1.04, 1.04, 1.04, 1.04, 1.04]))).failures).toEqual([])
    expect(compare(baseline, result(rounds([1.05, 1.05, 1.05, 1.05, 1.05]))).failures).toEqual([])
  })

  it('passes +6% in one round of five when the others are +1%: timing is the fastest round', () => {
    const values = rounds([1.06, 1.01, 1.01, 1.01, 1.01], 'render.chart')
    expect(compare(baseline, result(values)).failures).toEqual([])
  })

  it('fails memory when its median is +6%, though two rounds are not', () => {
    const values = rounds([1.06, 1.0, 1.06, 1.0, 1.06], 'memory.visual')
    expect(compare(baseline, result(values)).failures).toEqual([
      'memory.visual: 0.530 MB, baseline 0.500 MB (+6.0%, allowed +5%)',
    ])
    const passing = rounds([1.06, 1.0, 1.0, 1.0, 1.06], 'memory.visual')
    expect(compare(baseline, result(passing)).failures).toEqual([])
  })

  it('fails a value over the §9.5 limit even when the baseline allows it', () => {
    const loose = { ...baseline, metrics: { ...METRICS, 'render.doc20': 15 } }
    const values = { ...rounds(), 'render.doc20': [15.5, 15.6, 15.7, 15.8, 15.9] }
    expect(compare(loose, result(values)).failures).toEqual([
      'render.doc20: 15.500 ms is over the §9.5 limit of 15 ms',
    ])
    expect(LIMITS['memory.visual']).toBe(8 * MB)
  })

  it('fails a metric missing on either side, or with no rounds', () => {
    const { 'render.table': _, ...fewer } = rounds()
    expect(compare(baseline, result(fewer)).failures).toEqual([
      'render.table: in the baseline, not measured',
    ])
    expect(compare(baseline, result({ ...rounds(), 'render.table': [] })).failures).toEqual([
      'render.table: in the baseline, not measured',
    ])
    const { 'memory.visual': __, ...shorter } = METRICS
    expect(compare({ ...baseline, metrics: shorter }, result(rounds())).failures).toEqual([
      'memory.visual: measured, not in the baseline; run with --update',
    ])
  })

  it('reports a fall over 5% without failing, since a quieter machine is faster', () => {
    const { failures, lines } = compare(
      baseline,
      result(rounds([0.8, 0.8, 0.8, 0.8, 0.8], 'render.table')),
    )
    expect(failures).toEqual([])
    expect(lines.find((line) => line.startsWith('render.table'))).toContain(
      '-20.0%; faster than the baseline',
    )
  })

  it('on other hardware or another Chromium, holds only the §9.5 limits', () => {
    const other = { ...HARDWARE, cpu: 'Intel Xeon', cores: 4 }
    const slow = rounds([1.5, 1.5, 1.5, 1.5, 1.5])
    const { failures, lines } = compare(baseline, result(slow, other))
    expect(failures).toEqual([])
    expect(lines[0]).toMatch(/^hardware differs from the baseline/)
    expect(compare(baseline, result(slow, HARDWARE, '141.0.0.0')).failures).toEqual([])
    const over = { ...slow, 'render.chart': [26, 27, 28, 29, 30] }
    expect(compare(baseline, result(over, other)).failures).toEqual([
      'render.chart: 26.000 ms is over the §9.5 limit of 25 ms',
    ])
  })

  it('prints one line per metric with its value, baseline and limit', () => {
    const { lines } = compare(baseline, result(rounds()))
    expect(lines).toContain(
      'render.table: 2.600 ms (fastest of 5 rounds), baseline 2.600 ms (+0.0%), §9.5 limit 30 ms',
    )
    expect(lines).toContain(
      'memory.visual: 0.500 MB (median of 5 rounds), baseline 0.500 MB (+0.0%), §9.5 limit 8 MB',
    )
  })
})

describe('makeBaseline', () => {
  it('takes the hardware, Chromium and each metric from a run', () => {
    const next = makeBaseline(result(rounds([1, 1.1, 1.2, 1.3, 1.4])), '2026-11-11')
    expect(next.findings).toEqual([])
    expect(next.baseline).toEqual({
      date: '2026-11-11',
      chromium: CHROMIUM,
      hardware: HARDWARE,
      metrics: { ...METRICS, 'memory.visual': Math.round(1.2 * 0.5 * MB) },
    })
  })

  it('refuses a run over a §9.5 limit, or with a metric unmeasured', () => {
    const values = { ...rounds(), 'render.table': [31] }
    expect(makeBaseline(result(values), 'd').findings).toEqual([
      'render.table: 31.000 ms is over the §9.5 limit of 30 ms',
    ])
    const { 'render.chart': _, ...fewer } = rounds()
    expect(makeBaseline(result(fewer), 'd').findings).toEqual(['render.chart: not measured'])
  })
})

describe('check-perf-budgets', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'vui-perf-'))
  const write = (folder: string, name: string, value: unknown) => {
    const path = join(folder, name)
    writeFileSync(path, JSON.stringify(value))
    return path
  }

  it('exits 1 on +6% in every round and 0 on +4%', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const worse = write(folder, 'worse.json', result(rounds([1.06, 1.06, 1.06, 1.06, 1.06])))
    const fine = write(folder, 'fine.json', result(rounds([1.04, 1.04, 1.04, 1.04, 1.04])))
    const bad = run('check-perf-budgets.mjs', '--result', worse, '--baseline', base)
    expect(bad.code).toBe(1)
    expect(bad.out).toContain('render.table: 2.756 ms, baseline 2.600 ms (+6.0%, allowed +5%)')
    const good = run('check-perf-budgets.mjs', '--result', fine, '--baseline', base)
    expect(good.code).toBe(0)
    expect(good.out).toContain('check-perf-budgets: 4 metrics within 5% of the baseline')
  })

  it('fails with the command to run when the e2e results are missing', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const missing = join(folder, 'none.json')
    const out = run('check-perf-budgets.mjs', '--result', missing, '--baseline', base)
    expect(out.code).toBe(1)
    expect(out.out).toContain('pnpm exec playwright test e2e/budgets.spec.ts')
  })

  it('updates the baseline on request, refusing a run over a limit', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const over = write(folder, 'over.json', result({ ...rounds(), 'render.table': [31] }))
    const refused = run('check-perf-budgets.mjs', '--result', over, '--baseline', base, '--update')
    expect(refused.code).toBe(1)
    expect(JSON.parse(readFileSync(base, 'utf8'))).toEqual(baseline)
    const faster = write(folder, 'faster.json', result(rounds([0.5, 0.5, 0.5, 0.5, 0.5])))
    const ok = run('check-perf-budgets.mjs', '--result', faster, '--baseline', base, '--update')
    expect(ok.code).toBe(0)
    expect(JSON.parse(readFileSync(base, 'utf8')).metrics['render.table']).toBe(1.3)
  })

  it('has a committed baseline with every metric and the hardware it was measured on', () => {
    const committed = JSON.parse(readFileSync(`${repoRoot}scripts/perf-baseline.json`, 'utf8'))
    expect(Object.keys(committed.metrics).sort()).toEqual(Object.keys(LIMITS).sort())
    expect(typeof committed.chromium).toBe('string')
    expect(committed.hardware.cores).toBeGreaterThan(0)
    expect(committed.hardware.load).toHaveLength(3)
  })

  it('runs last in pnpm check', () => {
    const manifest = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8'))
    expect(manifest.scripts.check).toMatch(/node scripts\/check-perf-budgets\.mjs$/)
  })
})
