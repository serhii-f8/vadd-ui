#!/usr/bin/env node
// §14.2 and §14.3: every token budget, through the built `vui bench`, against
// `scripts/token-baseline.json`. Fails on a miss the baseline does not accept, and on any
// metric more than 5% worse than the baseline (VD-154).
//
// Always offline: `ANTHROPIC_API_KEY` is removed, so a key in the environment cannot change
// what the numbers are compared with.
//
// Intentional change: `node scripts/check-token-budgets.mjs --update` rewrites the baseline
// from this run; a new budget miss must be named with `--accept-unmet <name,...>`.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finish, rootArg } from './lib/cli.mjs'
import { compareToBaseline, makeBaseline } from './lib/token-baseline.mjs'

const argv = process.argv.slice(2)
/** @param {string} name */
const option = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const root = rootArg(argv)
const baselinePath = option('--baseline') ?? join(root, 'scripts/token-baseline.json')
const resultPath = option('--result')
const update = argv.includes('--update')
const accept = (option('--accept-unmet') ?? '').split(',').filter(Boolean)

/** @type {string[]} */
const findings = []

function bench() {
  if (resultPath) return JSON.parse(readFileSync(resultPath, 'utf8'))
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  const bin = join(root, 'packages/ui-cli/dist/bin.js')
  const run = spawnSync(process.execPath, [bin, 'bench', '--json'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  // Exit 1 is a budget miss, which the comparison below judges.
  if (run.status !== 0 && run.status !== 1) {
    findings.push(`vui bench exited ${run.status}: ${run.stderr || run.stdout}`.trim())
    return undefined
  }
  const json = JSON.parse(run.stdout)
  if (!json.metrics) findings.push(`vui bench: ${json.error?.message ?? 'no metrics'}`)
  return json.metrics ? json : undefined
}

const result = bench()
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : undefined
let summary = ''

if (result && update) {
  const next = makeBaseline(result, baseline, accept)
  findings.push(...next.findings)
  if (next.findings.length === 0) {
    writeFileSync(baselinePath, `${JSON.stringify(next.baseline, null, 2)}\n`)
    summary = `wrote ${baselinePath}`
  }
} else if (result && baseline === undefined) {
  findings.push(`no baseline at ${baselinePath}; run with --update`)
} else if (result) {
  findings.push(...compareToBaseline(result, baseline))
  const count = Object.keys(baseline.metrics).length
  summary = `${count} metrics within 5% of the baseline (${result.counter.kind} counter)`
}

if (result && summary) {
  /** @type {{ name: string, value: number, limit: number, ok: boolean }[]} */
  const budgets = result.budgets
  const unmet = budgets.filter((budget) => !budget.ok)
  if (unmet.length > 0) {
    const list = unmet.map(({ name, value, limit }) => `${name} ${value} > ${limit}`).join(', ')
    summary += `; unmet §14.2 budgets, accepted in the baseline: ${list}`
  }
}

finish('check-token-budgets', findings, summary)
