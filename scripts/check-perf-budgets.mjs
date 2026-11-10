#!/usr/bin/env node
// §9.5's render timings and memory per visual, and §16's "≤ 5% regression allowed vs main"
// (VD-171). `e2e/budgets.spec.ts` measures them in headless Chromium and writes
// `test-results/budgets.json`; this compares that file with `scripts/perf-baseline.json`.
//
// `pnpm gate` runs `test:e2e` before `check`, so the file is always fresh there. Alone, run
// `pnpm exec playwright test e2e/budgets.spec.ts --no-deps` first.
//
// Intentional change: `node scripts/check-perf-budgets.mjs --update` rewrites the baseline from
// the last run. The diff shows in review, and the commit says why.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { finish, rootArg } from './lib/cli.mjs'
import { compare, makeBaseline } from './lib/perf-baseline.mjs'

const argv = process.argv.slice(2)
/** @param {string} name */
const option = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const root = rootArg(argv)
const baselinePath = option('--baseline') ?? join(root, 'scripts/perf-baseline.json')
const resultPath = option('--result') ?? join(root, 'test-results/budgets.json')
const update = argv.includes('--update')

/** @type {string[]} */
const findings = []
let summary = ''

const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : undefined
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : undefined

if (result === undefined) {
  findings.push(
    `no results at ${resultPath}; run \`pnpm build && pnpm exec playwright test e2e/budgets.spec.ts --no-deps\` first (pnpm gate runs test:e2e before check)`,
  )
} else if (update) {
  const next = makeBaseline(result, new Date().toISOString().slice(0, 10))
  findings.push(...next.findings)
  if (next.findings.length === 0) {
    writeFileSync(baselinePath, `${JSON.stringify(next.baseline, null, 2)}\n`)
    summary = `wrote ${baselinePath}`
  }
} else if (baseline === undefined) {
  findings.push(`no baseline at ${baselinePath}; run with --update`)
} else {
  const { failures, lines } = compare(baseline, result)
  for (const line of lines) console.log(line)
  findings.push(...failures)
  summary = `${Object.keys(baseline.metrics).length} metrics within 5% of the baseline`
  if (lines[0]?.startsWith('hardware differs')) {
    summary = 'every metric within its §9.5 limit (other hardware, so no 5% rule)'
  }
}

finish('check-perf-budgets', findings, summary)
