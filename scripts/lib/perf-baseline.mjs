// §9.5's timing and memory budgets, and §16's "≤ 5% regression allowed vs main", against
// `scripts/perf-baseline.json` (VD-171). `e2e/budgets.spec.ts` measures; this judges.
//
// A timing metric is the fastest of its rounds, so one round slowed by a loaded machine does not
// fail it: a real regression is slower in every round, contention is not. Memory is the median.

export const ALLOWANCE = 0.05

const MB = 1_048_576

/** §9.5, in milliseconds and bytes. */
export const LIMITS = {
  'render.table': 30,
  'render.doc20': 15,
  'render.chart': 25,
  'memory.visual': 8 * MB,
}

/**
 * @typedef {{ cpu: string, cores: number, memGiB: number, load: number[] }} Hardware
 * @typedef {{ chromium: string, hardware: Hardware, rounds: Record<string, number[]> }} PerfResult
 * @typedef {{ date: string, chromium: string, hardware: Hardware, metrics: Record<string, number> }} PerfBaseline
 */

/** @param {string} name */
const isMemory = (name) => name.startsWith('memory.')

/** @param {string} name @param {number} value */
const show = (name, value) =>
  isMemory(name) ? `${(value / MB).toFixed(3)} MB` : `${value.toFixed(3)} ms`

/** @param {string} name @param {number} value */
const showLimit = (name, value) => (isMemory(name) ? `${value / MB} MB` : `${value} ms`)

/** @param {number} rise */
const percent = (rise) => `${rise >= 0 ? '+' : ''}${(rise * 100).toFixed(1)}%`

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const high = sorted[middle] ?? Number.NaN
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? Number.NaN) + high) / 2
}

/**
 * The metric's value: the fastest round for timing, the median round for memory.
 *
 * @param {string} name
 * @param {unknown} rounds
 * @returns {number | undefined}
 */
export function metricValue(name, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return undefined
  if (!rounds.every((round) => typeof round === 'number' && Number.isFinite(round))) {
    return undefined
  }
  return isMemory(name) ? median(rounds) : Math.min(...rounds)
}

/** @param {string} name */
const statistic = (name) => (isMemory(name) ? 'median' : 'fastest')

/** @param {string} name @param {number} value */
const overLimit = (name, value) =>
  `${name}: ${show(name, value)} is over the §9.5 limit of ${showLimit(name, LIMITS[/** @type {keyof typeof LIMITS} */ (name)])}`

/**
 * The 5% compares only on this machine: the same CPU model, core count and Chromium. On other
 * hardware the numbers do not compare and only §9.5's limits hold; on this hardware with another
 * Chromium, the check fails and asks for `--update` (VD-171).
 *
 * @param {{ chromium: string, hardware: { cpu: string, cores: number } }} baseline
 * @param {{ chromium?: string, hardware?: { cpu?: string, cores?: number } }} result
 */
export function sameMachine(baseline, result) {
  return sameHardware(baseline, result) && result.chromium === baseline.chromium
}

/**
 * @param {{ hardware: { cpu: string, cores: number } }} baseline
 * @param {{ hardware?: { cpu?: string, cores?: number } }} result
 */
function sameHardware(baseline, result) {
  return (
    result.hardware?.cpu === baseline.hardware.cpu &&
    result.hardware?.cores === baseline.hardware.cores
  )
}

/**
 * The one regression rule, for the check and for the spec's re-measure: more than `allowance`
 * above the baseline. Exactly the allowance is within.
 *
 * @param {number} base
 * @param {number} value
 * @param {number} [allowance]
 */
export function isOver(base, value, allowance = ALLOWANCE) {
  return (value - base) / base > allowance + 1e-9
}

/**
 * @param {PerfBaseline} baseline
 * @param {PerfResult} result
 * @param {number} [allowance]
 * @returns {{ failures: string[], lines: string[] }}
 */
export function compare(baseline, result, allowance = ALLOWANCE) {
  /** @type {string[]} */
  const failures = []
  /** @type {string[]} */
  const lines = []
  const same = sameMachine(baseline, result)
  const was = `${baseline.hardware.cpu}, ${baseline.hardware.cores} cores, Chromium ${baseline.chromium}`
  const now = `${result.hardware?.cpu}, ${result.hardware?.cores} cores, Chromium ${result.chromium}`
  if (!same && sameHardware(baseline, result)) {
    failures.push(
      `Chromium ${result.chromium} on the baseline's hardware, baseline Chromium ${baseline.chromium}: run with --update`,
    )
  } else if (!same) {
    lines.push(
      `hardware differs from the baseline (${was}; this run ${now}): only the §9.5 limits apply`,
    )
  }
  const rounds = result.rounds ?? {}
  for (const name of Object.keys(LIMITS)) {
    const base = baseline.metrics[name]
    const value = metricValue(name, rounds[name])
    const limit = LIMITS[/** @type {keyof typeof LIMITS} */ (name)]
    if (value === undefined) {
      failures.push(`${name}: in the baseline, not measured`)
      continue
    }
    if (value > limit) failures.push(overLimit(name, value))
    const count = /** @type {number[]} */ (rounds[name]).length
    const head = `${name}: ${show(name, value)} (${statistic(name)} of ${count} rounds)`
    const tail = `§9.5 limit ${showLimit(name, limit)}`
    if (typeof base !== 'number') {
      failures.push(`${name}: measured, not in the baseline; run with --update`)
      lines.push(`${head}, ${tail}`)
      continue
    }
    const rise = (value - base) / base
    let note = ''
    if (same && isOver(base, value, allowance)) {
      failures.push(
        `${name}: ${show(name, value)}, baseline ${show(name, base)} (${percent(rise)}, allowed +${allowance * 100}%)`,
      )
    } else if (same && isMemory(name) && isOver(value, base, allowance)) {
      // Memory reads the same to 0.1% run to run, so a gain left out of the file would become
      // room to regress (VD-154's ratchet).
      failures.push(
        `${name}: ${show(name, value)}, baseline ${show(name, base)} (${percent(rise)}); improved, so run with --update`,
      )
    } else if (rise < -allowance - 1e-9) {
      // Not a failure for timing: a quieter machine is faster, and the gate must fail on the code.
      note = '; faster than the baseline, run with --update to keep the gain'
    }
    lines.push(`${head}, baseline ${show(name, base)} (${percent(rise)}${note}), ${tail}`)
  }
  return { failures, lines }
}

/**
 * The baseline one or more runs would write: every run's rounds together, so a timing is the
 * fastest round of all runs and load during one run does not eat the 5%. A run over a §9.5 limit,
 * a metric unmeasured, or runs from different machines cannot be one.
 *
 * @param {PerfResult | PerfResult[]} results
 * @param {string} date
 * @returns {{ baseline: PerfBaseline & { runs: number, loads: number[][] }, findings: string[] }}
 */
export function makeBaseline(results, date) {
  const runs = Array.isArray(results) ? results : [results]
  const last = /** @type {PerfResult} */ (runs[runs.length - 1])
  /** @type {string[]} */
  const findings = []
  for (const run of runs) {
    if (!sameMachine(last, run)) {
      findings.push(
        `runs from different machines or Chromium versions: ${run.hardware?.cpu}, Chromium ${run.chromium}`,
      )
    }
  }
  /** @type {Record<string, number>} */
  const metrics = {}
  for (const [name, limit] of Object.entries(LIMITS)) {
    const all = runs.flatMap((run) => run.rounds?.[name] ?? [])
    const value = metricValue(name, all)
    if (value === undefined) {
      findings.push(`${name}: not measured`)
      continue
    }
    if (value > limit) findings.push(overLimit(name, value))
    metrics[name] = isMemory(name) ? Math.round(value) : Math.round(value * 1e4) / 1e4
  }
  const loads = runs.map((run) => run.hardware?.load ?? [])
  const baseline = {
    date,
    chromium: last.chromium,
    hardware: last.hardware,
    runs: runs.length,
    loads,
    metrics,
  }
  return { baseline, findings }
}
