import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compare, isOver, LIMITS, makeBaseline, sameMachine } from '../lib/perf-baseline.mjs'
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
/** The reference bundle a baseline was taken against, by its sha256 (VD-171). */
const REFERENCE_TEXT = '/* reference build */\n'
const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
const SHA = sha256(REFERENCE_TEXT)
const baseline = {
  date: '2026-11-10',
  chromium: CHROMIUM,
  hardware: HARDWARE,
  referenceSha256: SHA,
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

const TIMINGS = ['render.table', 'render.doc20', 'render.chart']

type Samples = Record<string, { current: number[]; reference: number[] }>

/** Samples for every timing in `values`: its rounds as the current renders, against reference
 * renders of `scale` ms each (1: the ratio reads as the ms). */
function sampled(values: Rounds, scale = 1): Samples {
  return Object.fromEntries(
    TIMINGS.filter((name) => name in values).map((name) => {
      const current = values[name] ?? []
      return [name, { current, reference: current.map(() => scale) }]
    }),
  )
}

const result = (
  values: Rounds,
  hardware = HARDWARE,
  chromium = CHROMIUM,
  samples = sampled(values),
) => ({ chromium, hardware, reference: { sha256: SHA }, rounds: values, samples })

/** Every timing scaled by `factor` in current and reference renders alike: load, not code. */
function underLoad(values: Rounds, factor: number) {
  const slowed = Object.fromEntries(
    Object.entries(values).map(([name, list]) => [
      name,
      TIMINGS.includes(name) ? list.map((value) => value * factor) : list,
    ]),
  )
  return result(slowed, HARDWARE, CHROMIUM, sampled(slowed, factor))
}

describe('compare (§9.5, §16 Budgets: ≤ 5% regression)', () => {
  it('fails +6% in every round and names the metric', () => {
    const { failures } = compare(
      baseline,
      result(rounds([1.06, 1.06, 1.06, 1.06, 1.06], 'render.table')),
    )
    expect(failures).toEqual([
      'render.table: ratio 2.756, baseline ratio 2.600 (+6.0%, allowed +5%)',
    ])
  })

  it('passes +4% in every round, and exactly +5%', () => {
    expect(compare(baseline, result(rounds([1.04, 1.04, 1.04, 1.04, 1.04]))).failures).toEqual([])
    expect(compare(baseline, result(rounds([1.05, 1.05, 1.05, 1.05, 1.05]))).failures).toEqual([])
  })

  it('passes +6% in one round of five when the others are +1%: timing is the fastest round', () => {
    const values = rounds([1.06, 1.01, 1.01, 1.01, 1.01], 'render.chart')
    expect(compare(baseline, result(values)).failures).toEqual([])
  })

  it('cancels load: current and reference renders 30% slower alike pass', () => {
    expect(compare(baseline, underLoad(rounds(), 1.3)).failures).toEqual([])
  })

  it('still fails +6% under load, and fails a slowdown the reference did not share', () => {
    const regressed = rounds([1.06, 1.06, 1.06, 1.06, 1.06], 'render.doc20')
    expect(compare(baseline, underLoad(regressed, 1.3)).failures).toEqual([
      'render.doc20: ratio 1.060, baseline ratio 1.000 (+6.0%, allowed +5%)',
    ])
    const unshared = result(rounds([1.3, 1.3, 1.3, 1.3, 1.3], 'render.doc20'))
    expect(compare(baseline, unshared).failures).toEqual([
      'render.doc20: ratio 1.300, baseline ratio 1.000 (+30.0%, allowed +5%)',
    ])
  })

  it('reads the 2nd percentile of each side: one lucky sample does not hide +6%', () => {
    const current = [0.5, ...Array.from({ length: 99 }, () => 1.06)]
    const reference = Array.from({ length: 100 }, () => 1)
    const samples = { ...sampled(rounds()), 'render.doc20': { current, reference } }
    expect(compare(baseline, result(rounds(), HARDWARE, CHROMIUM, samples)).failures).toEqual([
      'render.doc20: ratio 1.060, baseline ratio 1.000 (+6.0%, allowed +5%)',
    ])
  })

  it('fails a timing whose reference renders are missing', () => {
    const { 'render.chart': _, ...partial } = sampled(rounds())
    expect(compare(baseline, result(rounds(), HARDWARE, CHROMIUM, partial)).failures).toEqual([
      'render.chart: in the baseline, not measured',
    ])
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

  it('on other hardware, holds only the §9.5 limits', () => {
    const other = { ...HARDWARE, cpu: 'Intel Xeon', cores: 4 }
    const slow = rounds([1.5, 1.5, 1.5, 1.5, 1.5])
    const { failures, lines } = compare(baseline, result(slow, other))
    expect(failures).toEqual([])
    expect(lines[0]).toMatch(/^hardware differs from the baseline/)
    const over = { ...slow, 'render.chart': [26, 27, 28, 29, 30] }
    expect(compare(baseline, result(over, other)).failures).toEqual([
      'render.chart: 26.000 ms is over the §9.5 limit of 25 ms',
    ])
  })

  it('fails another Chromium on the same hardware, asking for --update', () => {
    expect(compare(baseline, result(rounds(), HARDWARE, '141.0.0.0')).failures).toEqual([
      "Chromium 141.0.0.0 on the baseline's hardware, baseline Chromium 140.0.7339.16: run with --update",
    ])
  })

  it('fails memory more than 5% below its baseline, asking for --update (ratchet)', () => {
    const values = rounds([0.94, 0.94, 0.94, 0.94, 0.94], 'memory.visual')
    expect(compare(baseline, result(values)).failures).toEqual([
      'memory.visual: 0.470 MB, baseline 0.500 MB (-6.0%); improved, so run with --update',
    ])
    const close = rounds([0.96, 0.96, 0.96, 0.96, 0.96], 'memory.visual')
    expect(compare(baseline, result(close)).failures).toEqual([])
  })

  it('fails when the committed reference is not the build the baseline was taken from', () => {
    expect(compare(baseline, result(rounds()), undefined, SHA).failures).toEqual([])
    const other = sha256('/* another build */')
    expect(compare(baseline, result(rounds()), undefined, other).failures).toEqual([
      `scripts/perf-reference.vui.min.js has sha256 ${other}, but the baseline was taken against ${SHA}: run with --update`,
    ])
  })

  it('fails a run that measured against another reference than the baseline names', () => {
    const run = { ...result(rounds()), reference: { sha256: 'f'.repeat(64) } }
    expect(compare(baseline, run).failures).toEqual([
      `the run measured against a reference with sha256 ${'f'.repeat(64)}, the baseline's is ${SHA}: rerun the budgets spec`,
    ])
    const { reference: _, ...unrecorded } = result(rounds())
    expect(compare(baseline, unrecorded as ReturnType<typeof result>).failures).toEqual([
      `the run recorded no reference sha256, the baseline's is ${SHA}: rerun the budgets spec`,
    ])
  })

  it('fails a baseline that names no reference', () => {
    const { referenceSha256: _, ...unnamed } = baseline
    expect(compare(unnamed as typeof baseline, result(rounds())).failures).toEqual([
      'the baseline names no reference sha256: run with --update',
    ])
  })

  it('prints one line per metric with its value, baseline and limit', () => {
    const { lines } = compare(baseline, result(rounds()))
    expect(lines).toContain(
      'render.table: ratio 2.600 (current over reference, 2nd percentiles; fastest of 5 rounds 2.600 ms), baseline ratio 2.600 (+0.0%), §9.5 limit 30 ms',
    )
    expect(lines).toContain(
      'memory.visual: 0.500 MB (median of 5 rounds), baseline 0.500 MB (+0.0%), §9.5 limit 8 MB',
    )
  })
})

describe('isOver and sameMachine', () => {
  it('is over only past the allowance; exactly 5% is within', () => {
    expect(isOver(2, 2.1)).toBe(false)
    expect(isOver(2, 2.1001)).toBe(true)
    expect(isOver(2, 2.2, 0.1)).toBe(false)
  })

  it('matches CPU, cores and Chromium; memGiB and load are informational', () => {
    const same = { chromium: CHROMIUM, hardware: { ...HARDWARE, memGiB: 64, load: [1, 1, 1] } }
    expect(sameMachine(baseline, same)).toBe(true)
    expect(sameMachine(baseline, { ...same, chromium: 'x' })).toBe(false)
    expect(
      sameMachine(baseline, { chromium: CHROMIUM, hardware: { ...HARDWARE, cores: 16 } }),
    ).toBe(false)
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
      referenceSha256: SHA,
      runs: 1,
      loads: [HARDWARE.load],
      metrics: { ...METRICS, 'memory.visual': Math.round(1.2 * 0.5 * MB) },
      ms: { 'render.table': 2.6, 'render.doc20': 1, 'render.chart': 4 },
    })
  })

  it('merges runs: a timing is the median run ratio, memory the median of all rounds', () => {
    const quiet = result(rounds([1.01, 1.0, 1.02, 1.0, 1.03]), { ...HARDWARE, load: [3, 5, 8] })
    const busy = { ...underLoad(rounds(), 2), hardware: { ...HARDWARE, load: [14, 9, 9] } }
    const slower = result(rounds([1.04, 1.04, 1.04, 1.04, 1.04]))
    const { baseline: next, findings } = makeBaseline([quiet, busy, slower], 'd')
    expect(findings).toEqual([])
    expect(next.metrics['render.table']).toBe(2.6)
    expect(next.ms?.['render.table']).toBe(2.6)
    expect(next.runs).toBe(3)
    expect(next.loads).toEqual([[3, 5, 8], [14, 9, 9], HARDWARE.load])
  })

  it('refuses runs from different machines', () => {
    const other = result(rounds(), { ...HARDWARE, cpu: 'Intel Xeon' })
    expect(makeBaseline([other, result(rounds())], 'd').findings).toEqual([
      'runs from different machines or Chromium versions: Intel Xeon, Chromium 140.0.7339.16',
    ])
  })

  it('refuses runs against different references, or against none recorded', () => {
    const other = { ...result(rounds()), reference: { sha256: 'e'.repeat(64) } }
    expect(makeBaseline([other, result(rounds())], 'd').findings).toEqual([
      `runs against different reference builds: sha256 ${'e'.repeat(64)} and ${SHA}`,
    ])
    const { reference: _, ...unrecorded } = result(rounds())
    expect(makeBaseline(unrecorded as ReturnType<typeof result>, 'd').findings).toEqual([
      'a run recorded no reference sha256',
    ])
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

describe('sensitivity on a recorded run of e2e/budgets.spec.ts', () => {
  // A real result of the A/B spec, one frame per bundle (2026-11-10, final review). Tightening a baseline by 6% is a 6% regression seen
  // from the other side: the check must fail on it.
  const recorded = JSON.parse(
    readFileSync(`${repoRoot}scripts/test/fixtures/perf-run.json`, 'utf8'),
  ) as ReturnType<typeof result>
  const own = makeBaseline(recorded, 'd').baseline

  it('passes against a baseline from the same run', () => {
    expect(compare(own, recorded).failures).toEqual([])
  })

  for (const name of Object.keys(LIMITS)) {
    it(`fails ${name} at +6%`, () => {
      const base = own.metrics[name] as number
      const tight = { ...own, metrics: { ...own.metrics, [name]: base / 1.06 } }
      const { failures } = compare(tight, recorded)
      expect(failures).toHaveLength(1)
      expect(failures[0]).toMatch(
        new RegExp(`^${name.replace('.', '\\.')}: .*\\(\\+6\\.0%, allowed \\+5%\\)$`),
      )
    })
  }
})

describe('check-perf-budgets', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'vui-perf-'))
  const write = (folder: string, name: string, value: unknown) => {
    const path = join(folder, name)
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }
  /** The checks below run against this reference, whose sha256 the baseline names. */
  const check = (folder: string, ...args: string[]) =>
    run(
      'check-perf-budgets.mjs',
      '--reference',
      write(folder, 'reference.js', REFERENCE_TEXT),
      ...args,
    )

  /**
   * A tree for `--update --root`: a current bundle, the committed reference and baseline, and a
   * stub Playwright whose runs are scripted by `runs`: `fail` exits 1, `over` records a run over
   * a §9.5 limit, `ok` records a clean run against the reference it was handed.
   */
  const tree = (runs: ('ok' | 'over' | 'fail')[]) => {
    const root = dir()
    const file = (path: string, text: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    file('packages/ui/dist/vui.min.js', '/* current build */\n')
    file('scripts/perf-reference.vui.min.js', REFERENCE_TEXT)
    file('scripts/perf-baseline.json', JSON.stringify(baseline))
    const clean = result(rounds())
    const over = result({ ...rounds(), 'render.table': [31] })
    file(
      'node_modules/@playwright/test/cli.js',
      `const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const counter = 'runs.txt'
const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(count + 1))
const step = ${JSON.stringify(runs)}[count]
if (step === 'fail') process.exit(1)
const reference = process.env.VUI_PERF_REFERENCE
const sha256 = createHash('sha256').update(readFileSync(reference)).digest('hex')
const run = step === 'over' ? ${JSON.stringify(over)} : ${JSON.stringify(clean)}
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/budgets.json', JSON.stringify({ ...run, reference: { sha256 } }))
`,
    )
    chmodSync(join(root, 'node_modules/@playwright/test/cli.js'), 0o644)
    const read = (path: string) => readFileSync(join(root, path), 'utf8')
    const update = () =>
      run('check-perf-budgets.mjs', '--root', root, '--update', '--runs', String(runs.length))
    return { root, read, update }
  }

  it('exits 1 on +6% in every round and 0 on +4%', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const worse = write(folder, 'worse.json', result(rounds([1.06, 1.06, 1.06, 1.06, 1.06])))
    const fine = write(folder, 'fine.json', result(rounds([1.04, 1.04, 1.04, 1.04, 1.04])))
    const bad = check(folder, '--result', worse, '--baseline', base)
    expect(bad.code).toBe(1)
    expect(bad.out).toContain(
      'render.table: ratio 2.756, baseline ratio 2.600 (+6.0%, allowed +5%)',
    )
    const good = check(folder, '--result', fine, '--baseline', base)
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

  it('fails when the committed reference is not the one the baseline names', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const fine = write(folder, 'fine.json', result(rounds()))
    const other = write(folder, 'other.js', '/* rebuilt */')
    const out = run(
      'check-perf-budgets.mjs',
      '--result',
      fine,
      '--baseline',
      base,
      '--reference',
      other,
    )
    expect(out.code).toBe(1)
    expect(out.out).toContain(`perf-reference.vui.min.js has sha256 ${sha256('/* rebuilt */')}`)
    const none = run(
      'check-perf-budgets.mjs',
      '--result',
      fine,
      '--baseline',
      base,
      '--reference',
      join(folder, 'none.js'),
    )
    expect(none.code).toBe(1)
    expect(none.out).toContain(
      `no reference bundle at ${join(folder, 'none.js')}; run with --update`,
    )
  })

  it('a failed --update run leaves the reference and the baseline as they were', () => {
    const { read, update } = tree(['ok', 'fail'])
    const out = update()
    expect(out.code).toBe(1)
    expect(out.out).toContain('budgets spec run 2 of 2 failed (exit 1)')
    expect(read('scripts/perf-reference.vui.min.js')).toBe(REFERENCE_TEXT)
    expect(JSON.parse(read('scripts/perf-baseline.json'))).toEqual(baseline)
  })

  it('an --update the baseline refuses leaves the reference and the baseline as they were', () => {
    const { read, update } = tree(['over', 'over'])
    const out = update()
    expect(out.code).toBe(1)
    expect(out.out).toContain('render.table: 31.000 ms is over the §9.5 limit of 30 ms')
    expect(read('scripts/perf-reference.vui.min.js')).toBe(REFERENCE_TEXT)
    expect(JSON.parse(read('scripts/perf-baseline.json'))).toEqual(baseline)
  })

  it('a clean --update measures against the current build, then commits it and its sha256', () => {
    const { read, update } = tree(['ok', 'ok'])
    const out = update()
    expect(out.code).toBe(0)
    expect(read('scripts/perf-reference.vui.min.js')).toBe('/* current build */\n')
    const written = JSON.parse(read('scripts/perf-baseline.json'))
    expect(written.referenceSha256).toBe(sha256('/* current build */\n'))
    expect(written.runs).toBe(2)
  })

  it('updates from several recorded runs, keeping the median run', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    const slow = write(folder, 'slow.json', result(rounds([1.1, 1.1, 1.1, 1.1, 1.1])))
    const fast = write(folder, 'fast.json', result(rounds([1.02, 1.0, 1.03, 1.01, 1.02])))
    const args = ['--baseline', base, '--update', '--result', slow, '--result', fast]
    const out = run('check-perf-budgets.mjs', ...[...args, '--result', fast])
    expect(out.code).toBe(0)
    expect(out.out).toContain('from 3 run(s)')
    const written = JSON.parse(readFileSync(base, 'utf8'))
    expect(written.metrics['render.table']).toBe(2.6)
    expect(written.runs).toBe(3)
  })

  it('refuses --runs below 1 or not a number', () => {
    const folder = dir()
    const base = write(folder, 'base.json', baseline)
    for (const runs of ['0', 'x', '-2']) {
      const out = run('check-perf-budgets.mjs', '--baseline', base, '--update', '--runs', runs)
      expect(out.code).toBe(1)
      expect(out.out).toContain(`--runs must be a whole number of 1 or more, not ${runs}`)
    }
    expect(JSON.parse(readFileSync(base, 'utf8'))).toEqual(baseline)
  })

  it('has a committed baseline with every metric and the hardware it was measured on', () => {
    const committed = JSON.parse(readFileSync(`${repoRoot}scripts/perf-baseline.json`, 'utf8'))
    expect(Object.keys(committed.metrics).sort()).toEqual(Object.keys(LIMITS).sort())
    expect(typeof committed.chromium).toBe('string')
    expect(committed.hardware.cores).toBeGreaterThan(0)
    expect(committed.hardware.load).toHaveLength(3)
    // The build the baseline was measured against, committed with it, and named by its sha256.
    const reference = `${repoRoot}scripts/perf-reference.vui.min.js`
    expect(existsSync(reference)).toBe(true)
    expect(committed.referenceSha256).toBe(sha256(readFileSync(reference)))
  })

  it('runs last in pnpm check', () => {
    const manifest = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8'))
    expect(manifest.scripts.check).toMatch(/node scripts\/check-perf-budgets\.mjs$/)
  })
})
