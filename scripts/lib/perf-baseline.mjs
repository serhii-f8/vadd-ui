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
 * The comparison is against this machine's own baseline: on another CPU, core count or Chromium,
 * the numbers do not compare, and only §9.5's limits hold.
 *
 * @param {PerfBaseline} baseline
 * @param {PerfResult} result
 */
function sameMachine(baseline, result) {
  const { cpu, cores } = baseline.hardware
  return (
    result.hardware?.cpu === cpu &&
    result.hardware?.cores === cores &&
    result.chromium === baseline.chromium
  )
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
  if (!same) {
    const was = `${baseline.hardware.cpu}, ${baseline.hardware.cores} cores, Chromium ${baseline.chromium}`
    const now = `${result.hardware?.cpu}, ${result.hardware?.cores} cores, Chromium ${result.chromium}`
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
    if (same && rise > allowance + 1e-9) {
      failures.push(
        `${name}: ${show(name, value)}, baseline ${show(name, base)} (${percent(rise)}, allowed +${allowance * 100}%)`,
      )
    } else if (rise < -allowance - 1e-9) {
      // Not a failure: a quieter machine is faster, and the gate must fail on the code (VD-087).
      note = '; faster than the baseline, run with --update to keep the gain'
    }
    lines.push(`${head}, baseline ${show(name, base)} (${percent(rise)}${note}), ${tail}`)
  }
  return { failures, lines }
}

/**
 * The baseline a run would write. A run over a §9.5 limit, or with a metric unmeasured, cannot be one.
 *
 * @param {PerfResult} result
 * @param {string} date
 * @returns {{ baseline: PerfBaseline, findings: string[] }}
 */
export function makeBaseline(result, date) {
  /** @type {string[]} */
  const findings = []
  /** @type {Record<string, number>} */
  const metrics = {}
  for (const [name, limit] of Object.entries(LIMITS)) {
    const value = metricValue(name, result.rounds?.[name])
    if (value === undefined) {
      findings.push(`${name}: not measured`)
      continue
    }
    if (value > limit) findings.push(overLimit(name, value))
    metrics[name] = isMemory(name) ? Math.round(value) : Math.round(value * 1e4) / 1e4
  }
  const baseline = { date, chromium: result.chromium, hardware: result.hardware, metrics }
  return { baseline, findings }
}
