#!/usr/bin/env node
// §9.5's render timings and memory per visual, and §16's "≤ 5% regression allowed vs main"
// (VD-171). `e2e/budgets.spec.ts` measures them in headless Chromium and writes
// `test-results/budgets.json`; this compares that file with `scripts/perf-baseline.json`.
//
// `pnpm gate` runs `test:e2e` before `check`, so the file is always fresh there. Alone, run
// `pnpm exec playwright test e2e/budgets.spec.ts --no-deps` first.
//
// Timings are gated as current ÷ reference, where the reference is `scripts/perf-reference.vui.min.js`,
// the build the baseline was taken from, rendered in the same page (VD-171).
//
// Intentional change: `node scripts/check-perf-budgets.mjs --update` copies the current
// `packages/ui/dist/vui.min.js` to the reference, runs the budgets spec `--runs` times (default
// 5) and writes the baseline from all runs. `--update --result a.json --result b.json` merges recorded
// runs instead. The diff shows in review, and the commit says why.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
const defaultResult = join(root, 'test-results/budgets.json')
const resultPaths = argv.flatMap((arg, index) =>
  arg === '--result' && argv[index + 1] !== undefined
    ? [/** @type {string} */ (argv[index + 1])]
    : [],
)
const update = argv.includes('--update')
const runsOption = option('--runs') ?? '5'
const runs = Number(runsOption)

/** @type {string[]} */
const findings = []
let summary = ''

/** @param {string} path */
const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined)
const baseline = read(baselinePath)
const missing = (/** @type {string} */ path) =>
  `no results at ${path}; run \`pnpm build && pnpm exec playwright test e2e/budgets.spec.ts --no-deps\` first (pnpm gate runs test:e2e before check)`

/** Runs the spec `count` times and returns each run's result. */
function measure(/** @type {number} */ count) {
  const bundle = join(root, 'packages/ui/dist/vui.min.js')
  if (!existsSync(bundle)) {
    findings.push(`no bundle at ${bundle}; run pnpm build first`)
    return []
  }
  copyFileSync(bundle, join(root, 'scripts/perf-reference.vui.min.js'))
  const cli = join(root, 'node_modules/@playwright/test/cli.js')
  const results = []
  for (let run = 0; run < count; run += 1) {
    const spec = spawnSync(process.execPath, [cli, 'test', 'e2e/budgets.spec.ts', '--no-deps'], {
      cwd: root,
      stdio: 'inherit',
    })
    const result = read(defaultResult)
    if (spec.status !== 0 || result === undefined) {
      findings.push(`budgets spec run ${run + 1} of ${count} failed (exit ${spec.status})`)
      return []
    }
    results.push(result)
  }
  return results
}

if (update && !(Number.isInteger(runs) && runs >= 1)) {
  findings.push(`--runs must be a whole number of 1 or more, not ${runsOption}`)
} else if (update) {
  const results =
    resultPaths.length > 0 ? resultPaths.map((path) => read(path) ?? path) : measure(runs)
  for (const result of results) if (typeof result === 'string') findings.push(missing(result))
  if (findings.length === 0 && results.length > 0) {
    const next = makeBaseline(results, new Date().toISOString().slice(0, 10))
    findings.push(...next.findings)
    if (next.findings.length === 0) {
      writeFileSync(baselinePath, `${JSON.stringify(next.baseline, null, 2)}\n`)
      summary = `wrote ${baselinePath} from ${results.length} run(s)`
    }
  }
} else {
  const resultPath = resultPaths[0] ?? defaultResult
  const result = read(resultPath)
  if (result === undefined) {
    findings.push(missing(resultPath))
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
}

finish('check-perf-budgets', findings, summary)
