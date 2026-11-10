// §9.5's timing and memory budgets, and §16's "≤ 5% regression allowed vs main", against
// `scripts/perf-baseline.json` (VD-171). `e2e/budgets.spec.ts` measures; this judges.
//
// A timing is gated as a ratio: the 2nd percentile of the run's renders by the current bundle
// over the 2nd percentile of renders of the same document by the reference bundle
// (`scripts/perf-reference.vui.min.js`, the build the baseline was taken from), paired and
// alternating in the same page. Load slows both alike, so the ratio cancels it and measures the
// code against the baseline's code (VD-171). The raw fastest render, in ms, is held to §9.5's
// absolute limits. Memory is the median round, in bytes.

export const ALLOWANCE = 0.05

/** The low percentile each side of a timing ratio reads: near the fastest, without its outliers. */
export const PERCENTILE = 0.02

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
 * @typedef {{ chromium: string, hardware: Hardware, reference?: { sha256: string }, rounds: Record<string, number[]>, samples?: Record<string, { current: number[], reference: number[] }> }} PerfResult
 * @typedef {{ date: string, chromium: string, hardware: Hardware, referenceSha256?: string, metrics: Record<string, number>, ms?: Record<string, number> }} PerfBaseline
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

/** @param {unknown} rounds */
const numbers = (rounds) =>
  Array.isArray(rounds) &&
  rounds.length > 0 &&
  rounds.every((round) => typeof round === 'number' && Number.isFinite(round) && round > 0)

/**
 * What §9.5's limit is held to: the fastest round for timing (ms), the median round for memory.
 *
 * @param {string} name
 * @param {unknown} rounds
 * @returns {number | undefined}
 */
export function metricValue(name, rounds) {
  if (!numbers(rounds)) return undefined
  const values = /** @type {number[]} */ (rounds)
  return isMemory(name) ? median(values) : Math.min(...values)
}

/**
 * What the 5% is held to: for timing, the `PERCENTILE` of the run's current renders ÷ the same
 * percentile of its reference renders; for memory, the median round in bytes. Undefined when
 * either side is missing.
 *
 * @param {string} name
 * @param {PerfResult} result
 * @returns {number | undefined}
 */
export function gatedValue(name, result) {
  const rounds = result.rounds?.[name]
  if (isMemory(name)) return metricValue(name, rounds)
  const { current, reference } = result.samples?.[name] ?? {}
  if (!numbers(current) || !numbers(reference)) return undefined
  return low(/** @type {number[]} */ (current)) / low(/** @type {number[]} */ (reference))
}

/** @param {number[]} values */
function low(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return /** @type {number} */ (sorted[Math.floor(sorted.length * PERCENTILE)])
}

/** @param {string} name @param {number} value */
const showGated = (name, value) =>
  isMemory(name) ? show(name, value) : `ratio ${value.toFixed(3)}`

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
 * The one regression rule: more than `allowance` above the baseline. Exactly the allowance is
 * within.
 *
 * @param {number} base
 * @param {number} value
 * @param {number} [allowance]
 */
export function isOver(base, value, allowance = ALLOWANCE) {
  return (value - base) / base > allowance + 1e-9
}

/**
 * The ratios mean "against the baseline's build" only while the reference is that build: the
 * baseline names it by sha256, and the run records the sha256 of the bundle it loaded (VD-171).
 *
 * @param {PerfBaseline} baseline
 * @param {PerfResult} result
 * @param {string} [committed] the sha256 of the committed `scripts/perf-reference.vui.min.js`
 * @returns {string[]}
 */
function referenceFailures(baseline, result, committed) {
  const named = baseline.referenceSha256
  if (named === undefined) return ['the baseline names no reference sha256: run with --update']
  /** @type {string[]} */
  const failures = []
  if (committed !== undefined && committed !== named) {
    failures.push(
      `scripts/perf-reference.vui.min.js has sha256 ${committed}, but the baseline was taken against ${named}: run with --update`,
    )
  }
  const measured = result.reference?.sha256
  if (measured === undefined) {
    failures.push(
      `the run recorded no reference sha256, the baseline's is ${named}: rerun the budgets spec`,
    )
  } else if (measured !== named) {
    failures.push(
      `the run measured against a reference with sha256 ${measured}, the baseline's is ${named}: rerun the budgets spec`,
    )
  }
  return failures
}

/**
 * @param {PerfBaseline} baseline
 * @param {PerfResult} result
 * @param {number} [allowance]
 * @param {string} [committed] the sha256 of the committed reference bundle, when the caller read it
 * @returns {{ failures: string[], lines: string[] }}
 */
export function compare(baseline, result, allowance = ALLOWANCE, committed = undefined) {
  /** @type {string[]} */
  const failures = referenceFailures(baseline, result, committed)
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
    const raw = metricValue(name, rounds[name])
    const value = gatedValue(name, result)
    const limit = LIMITS[/** @type {keyof typeof LIMITS} */ (name)]
    if (raw === undefined || value === undefined) {
      failures.push(`${name}: in the baseline, not measured`)
      continue
    }
    if (raw > limit) failures.push(overLimit(name, raw))
    const count = /** @type {number[]} */ (rounds[name]).length
    const head = isMemory(name)
      ? `${name}: ${show(name, value)} (median of ${count} rounds)`
      : `${name}: ratio ${value.toFixed(3)} (current over reference, 2nd percentiles; fastest of ${count} rounds ${show(name, raw)})`
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
        `${name}: ${showGated(name, value)}, baseline ${showGated(name, base)} (${percent(rise)}, allowed +${allowance * 100}%)`,
      )
    } else if (same && isMemory(name) && isOver(value, base, allowance)) {
      // Memory reads the same to 0.1% run to run, so a gain left out of the file would become
      // room to regress (VD-154's ratchet).
      failures.push(
        `${name}: ${show(name, value)}, baseline ${show(name, base)} (${percent(rise)}); improved, so run with --update`,
      )
    } else if (rise < -allowance - 1e-9) {
      note = '; faster than the baseline, run with --update to keep the gain'
    }
    lines.push(`${head}, baseline ${showGated(name, base)} (${percent(rise)}${note}), ${tail}`)
  }
  return { failures, lines }
}

/**
 * The baseline one or more runs would write. Timing: the median over runs of each run's ratio
 * (about 1, since the reference is the baseline's own build), and the fastest render in ms for
 * information. Memory: the median of all runs' rounds. It names the reference the runs measured
 * against by sha256. A run over a §9.5 limit, a metric unmeasured, runs from different machines,
 * or runs against different or unrecorded references cannot be one.
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
  const shas = runs.map((run) => run.reference?.sha256)
  const referenceSha256 = shas[shas.length - 1]
  if (shas.some((sha) => sha === undefined)) findings.push('a run recorded no reference sha256')
  else if (shas.some((sha) => sha !== referenceSha256)) {
    const other = shas.find((sha) => sha !== referenceSha256)
    findings.push(`runs against different reference builds: sha256 ${other} and ${referenceSha256}`)
  }
  /** @type {Record<string, number>} */
  const metrics = {}
  /** @type {Record<string, number>} */
  const ms = {}
  for (const [name, limit] of Object.entries(LIMITS)) {
    const all = runs.flatMap((run) => run.rounds?.[name] ?? [])
    const raw = metricValue(name, all)
    const ratios = runs.map((run) => gatedValue(name, run))
    if (raw === undefined || ratios.some((ratio) => ratio === undefined)) {
      findings.push(`${name}: not measured`)
      continue
    }
    if (raw > limit) findings.push(overLimit(name, raw))
    if (isMemory(name)) metrics[name] = Math.round(raw)
    else {
      metrics[name] = Math.round(median(/** @type {number[]} */ (ratios)) * 1e4) / 1e4
      ms[name] = Math.round(raw * 1e4) / 1e4
    }
  }
  const loads = runs.map((run) => run.hardware?.load ?? [])
  const baseline = {
    date,
    chromium: last.chromium,
    hardware: last.hardware,
    referenceSha256,
    runs: runs.length,
    loads,
    metrics,
    ms,
  }
  return { baseline, findings }
}
