// VD-154: §14.3's "CI fails when a budget regresses by more than 5%", against a committed
// baseline. Every metric is smaller-is-better: tokens or a ratio of tokens.

export const ALLOWANCE = 0.05

/**
 * @typedef {{ kind: string, [key: string]: unknown }} Counter
 * @typedef {{ name: string, value: number | null, limit: number, ok: boolean }} Budget
 * @typedef {{ counter: Counter, metrics: Record<string, number | null>, budgets: Budget[] }} BenchResult
 * @typedef {{ counter: Counter, metrics: Record<string, number>, unmet: string[] }} Baseline
 */

/** @param {unknown} value */
const stable = (value) => JSON.stringify(value)

/** @param {number} rise */
const percent = (rise) => `${rise >= 0 ? '+' : ''}${(rise * 100).toFixed(1)}%`

/**
 * @param {BenchResult} result
 * @returns {Budget[]}
 */
const missed = (result) => result.budgets.filter((budget) => !budget.ok)

/** @param {Budget} budget */
const overBudget = (budget) =>
  `${budget.name}: ${budget.value} is over the §14.2 budget of ${budget.limit}`

/**
 * Findings, empty when the result is within the allowance of the baseline.
 *
 * @param {BenchResult} result
 * @param {Baseline} baseline
 * @param {number} [allowance]
 * @returns {string[]}
 */
export function compareToBaseline(result, baseline, allowance = ALLOWANCE) {
  if (stable(result.counter) !== stable(baseline.counter)) {
    return [`counter: ${stable(result.counter)}, baseline ${stable(baseline.counter)}`]
  }
  /** @type {string[]} */
  const findings = []
  for (const [name, base] of Object.entries(baseline.metrics)) {
    const value = result.metrics[name]
    if (typeof value !== 'number') {
      findings.push(`${name}: in the baseline, not measured`)
      continue
    }
    const rise = base === 0 ? (value > 0 ? Number.POSITIVE_INFINITY : 0) : (value - base) / base
    if (rise > allowance + 1e-9) {
      findings.push(
        `${name}: ${value}, baseline ${base} (${percent(rise)}, allowed +${allowance * 100}%)`,
      )
    }
  }
  for (const [name, value] of Object.entries(result.metrics)) {
    if (typeof value === 'number' && !(name in baseline.metrics)) {
      findings.push(`${name}: measured, not in the baseline; run with --update`)
    }
  }
  const accepted = new Set(baseline.unmet)
  for (const budget of missed(result)) {
    if (!accepted.has(budget.name)) findings.push(overBudget(budget))
  }
  for (const name of baseline.unmet) {
    if (result.budgets.find((budget) => budget.name === name)?.ok) {
      findings.push(`${name}: now within its budget; remove it from unmet with --update`)
    }
  }
  return findings
}

/**
 * The baseline a result would write. A miss the old baseline did not accept needs naming.
 *
 * @param {BenchResult} result
 * @param {Baseline | undefined} previous
 * @param {string[]} accept
 * @returns {{ baseline: Baseline, findings: string[] }}
 */
export function makeBaseline(result, previous, accept) {
  const known = new Set([...(previous?.unmet ?? []), ...accept])
  const misses = missed(result)
  const findings = misses
    .filter((budget) => !known.has(budget.name))
    .map((budget) => `${overBudget(budget)}; accept it with --accept-unmet ${budget.name}`)
  /** @type {Record<string, number>} */
  const metrics = {}
  for (const [name, value] of Object.entries(result.metrics)) {
    if (typeof value === 'number') metrics[name] = value
  }
  const unmet = misses.map((budget) => budget.name).sort()
  return { baseline: { counter: result.counter, metrics, unmet }, findings }
}
