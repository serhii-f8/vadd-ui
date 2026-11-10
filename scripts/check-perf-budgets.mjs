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
// The baseline names its reference by sha256, and each run records the sha256 of the reference it
// loaded: a reference that is not the baseline's build fails the check.
//
// Intentional change: `node scripts/check-perf-budgets.mjs --update` snapshots the current
// `packages/ui/dist/vui.min.js`, runs the budgets spec `--runs` times (default 5) against that
// snapshot as the reference (`VUI_PERF_REFERENCE`), and only when every run passed and the
// baseline is sound writes the snapshot to the reference and the baseline; on any failure both
// stay as they were. `--update --result a.json --result b.json` merges recorded runs instead and
// writes only the baseline. The diff shows in review, and the commit says why.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
const referencePath = option('--reference') ?? join(root, 'scripts/perf-reference.vui.min.js')
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

/** @param {string} path */
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * Runs the spec `count` times against `reference` and returns each run's result, or none when
 * one failed. Nothing in the tree is written here.
 *
 * @param {number} count
 * @param {string} reference
 */
function measure(count, reference) {
  const cli = join(root, 'node_modules/@playwright/test/cli.js')
  const results = []
  for (let run = 0; run < count; run += 1) {
    const spec = spawnSync(process.execPath, [cli, 'test', 'e2e/budgets.spec.ts', '--no-deps'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, VUI_PERF_REFERENCE: reference },
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

/**
 * The reference and the baseline go together: when the second write fails, the first is undone,
 * so a half-written update cannot leave a reference the baseline does not name.
 *
 * @param {unknown} next
 * @param {string | undefined} snapshot
 */
function writeBaseline(next, snapshot) {
  const previous = existsSync(referencePath) ? readFileSync(referencePath) : undefined
  if (snapshot !== undefined) copyFileSync(snapshot, referencePath)
  try {
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
  } catch (error) {
    if (snapshot !== undefined && previous !== undefined) writeFileSync(referencePath, previous)
    else if (snapshot !== undefined) rmSync(referencePath, { force: true })
    throw error
  }
}

if (update && !(Number.isInteger(runs) && runs >= 1)) {
  findings.push(`--runs must be a whole number of 1 or more, not ${runsOption}`)
} else if (update) {
  const bundle = join(root, 'packages/ui/dist/vui.min.js')
  /** The current build, as it was when the runs began: the reference they measure against. */
  let snapshot
  /** @type {unknown[]} */
  let results = []
  if (resultPaths.length > 0) results = resultPaths.map((path) => read(path) ?? path)
  else if (!existsSync(bundle)) findings.push(`no bundle at ${bundle}; run pnpm build first`)
  else {
    snapshot = join(mkdtempSync(join(tmpdir(), 'vui-perf-')), 'reference.vui.min.js')
    copyFileSync(bundle, snapshot)
    results = measure(runs, snapshot)
  }
  for (const result of results) if (typeof result === 'string') findings.push(missing(result))
  if (findings.length === 0 && results.length > 0) {
    const next = makeBaseline(
      /** @type {import('./lib/perf-baseline.mjs').PerfResult[]} */ (results),
      new Date().toISOString().slice(0, 10),
    )
    findings.push(...next.findings)
    const built = snapshot === undefined ? undefined : sha256(snapshot)
    if (
      built !== undefined &&
      next.findings.length === 0 &&
      next.baseline.referenceSha256 !== built
    ) {
      findings.push(
        `the runs measured against sha256 ${next.baseline.referenceSha256}, not the current build's ${built}`,
      )
    }
    if (findings.length === 0) {
      writeBaseline(next.baseline, snapshot)
      summary = `wrote ${baselinePath} from ${results.length} run(s)`
      if (snapshot !== undefined) summary += ` and ${referencePath} (sha256 ${built})`
    }
  }
  if (snapshot !== undefined) rmSync(join(snapshot, '..'), { recursive: true, force: true })
} else {
  const resultPath = resultPaths[0] ?? defaultResult
  const result = read(resultPath)
  if (result === undefined) {
    findings.push(missing(resultPath))
  } else if (baseline === undefined) {
    findings.push(`no baseline at ${baselinePath}; run with --update`)
  } else {
    const committed = existsSync(referencePath) ? sha256(referencePath) : undefined
    if (committed === undefined) {
      findings.push(`no reference bundle at ${referencePath}; run with --update`)
    }
    const { failures, lines } = compare(baseline, result, undefined, committed)
    for (const line of lines) console.log(line)
    findings.push(...failures)
    summary = `${Object.keys(baseline.metrics).length} metrics within 5% of the baseline`
    if (lines[0]?.startsWith('hardware differs')) {
      summary = 'every metric within its §9.5 limit (other hardware, so no 5% rule)'
    }
  }
}

finish('check-perf-budgets', findings, summary)
