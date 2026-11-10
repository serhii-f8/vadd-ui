import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, loadavg, totalmem } from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { gatedValue, LIMITS, metricValue } from '../scripts/lib/perf-baseline.mjs'

// §9.5's render timings and memory per mounted visual, by the real `dist/vui.min.js` in headless
// Chromium (VD-171). The spec holds the §9.5 limits; `scripts/check-perf-budgets.mjs` holds the
// 5% against `scripts/perf-baseline.json`, from the `test-results/budgets.json` written here.
//
// Each render is paired, alternating, with a render of the same document by the reference bundle
// (`scripts/perf-reference.vui.min.js`, the build the baseline was taken from) in the same page.
// Load slows both alike, so the check gates the ratio current ÷ reference: a regression against
// the baseline's code, with the machine cancelled; each side reads its 2nd percentile of the run,
// near the fastest without its outliers. The raw fastest render is held to §9.5's ms limits.

const BUNDLE = fileURLToPath(new URL('../packages/ui/dist/vui.min.js', import.meta.url))
const REFERENCE = fileURLToPath(new URL('../scripts/perf-reference.vui.min.js', import.meta.url))
const RESULT = fileURLToPath(new URL('../test-results/budgets.json', import.meta.url))

/**
 * Pairs per round. The page is cross-origin isolated (COOP + COEP), so `performance.now()`
 * resolves to 5 µs and one render is one sample; the short documents get more pairs, which keeps
 * a run's ratio within about 2% of the baseline under load (VD-171).
 */
const SAMPLES = { 'render.table': 200, 'render.doc20': 200, 'render.chart': 100 }
/** Rounds per metric, after one warm-up round, the three metrics interleaved. */
const ROUNDS = 9
/** Orca holds 8 frames per message (§9.5). */
const MOUNTS = 8

const TABLE = {
  vui: 1,
  body: [
    {
      type: 'table',
      columns: ['Name', 'Status:status', 'Time:ms', 'Cov:pct', 'Size:bytes', 'When:date'],
      rows: Array.from({ length: 1000 }, (_, index) => [
        `row ${index}`,
        index % 3 ? 'ok' : 'fail',
        index * 7,
        (index % 100) / 100,
        index * 1024,
        `2026-11-0${1 + (index % 9)}T10:00:00Z`,
      ]),
    },
  ],
}

const wave = (shift: number) =>
  Array.from({ length: 1000 }, (_, index) => Math.sin(index / 20 + shift) * 100)

/** The document `charts.spec.ts` held before task 20. */
const CHART = {
  vui: 1,
  body: [
    {
      type: 'chart',
      kind: 'line',
      x: wave(0).map((_, index) => index),
      series: Object.fromEntries([0, 1, 2, 3, 4].map((shift) => [`s${shift}`, wave(shift)])),
    },
  ],
}

/** 20 nodes across text, data, chart and dev components: §19.1 to §19.3 together, and more. */
const DOC20 = {
  vui: 1,
  title: 'Objective #14 — refresh-token rotation',
  subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
  body: [
    {
      type: 'stats',
      items: [
        { label: 'Checks', value: '5/6', tone: 'warn' },
        { label: 'Tests', value: 142, delta: -3, deltaFormat: 'delta' },
        { label: 'Coverage', value: 0.874, format: 'pct', delta: 0.012, deltaFormat: 'delta:pct' },
        { label: 'Duration', value: 48200, format: 'ms' },
      ],
    },
    {
      type: 'checks',
      items: [
        { name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100 },
        { name: 'Unit tests', status: 'ok', cmd: 'pnpm vitest run', ms: 21400 },
        {
          name: 'E2E',
          status: 'fail',
          cmd: 'pnpm e2e',
          ms: 17700,
          output: 'auth.spec.ts:88  expected 401, got 200',
        },
      ],
    },
    {
      type: 'callout',
      tone: 'warn',
      text: 'E2E fails on expired-token replay. Rotation is **not** invalidating the old token.',
    },
    {
      type: 'grid',
      children: [
        {
          type: 'plan',
          title: 'Plan',
          items: [
            { text: 'Add rotation table', status: 'ok' },
            { text: 'Invalidate on refresh', status: 'run' },
            { text: 'Replay protection test', status: 'wait' },
          ],
        },
        {
          type: 'diff',
          title: 'Changes',
          files: [
            ['src/auth/refresh.ts', 64, 12, 'M'],
            ['src/auth/rotation.repo.ts', 88, 0, 'A'],
            ['migrations/0042_token_rotation.sql', 21, 0, 'A'],
          ],
        },
      ],
    },
    {
      type: 'chart',
      kind: 'line',
      yFormat: 'ms',
      x: ['10:00', '10:05', '10:10', '10:15', '10:20'],
      series: { p50: [42, 40, 45, 41, 39], p95: [120, 180, 95, 88, 84] },
      refLines: [{ y: 100, label: 'SLO', tone: 'err' }],
    },
    {
      type: 'table',
      columns: ['Query', 'Calls:int', 'p95:ms', 'Hit rate:pct'],
      rows: [
        ['listProducts', 18420, 84, 0.93],
        ['getVariant', 9310, 61, 0.88],
        ['searchSku', 2204, 212, 0.41, { tone: 'warn' }],
      ],
      sort: [2, 'desc'],
    },
    {
      type: 'md',
      text: '## Findings\n\nThe old token stays valid for `60 s` after a refresh.\n\n- Replay succeeds\n- No audit row\n- See [RFC 6819](https://www.rfc-editor.org/rfc/rfc6819)',
    },
    {
      type: 'kv',
      pairs: [
        ['Branch', 'vadd/obj-14'],
        ['Commit', '4f2c1a9'],
        ['Runner', 'local'],
      ],
    },
    { type: 'progress', value: 62, label: 'Migrated' },
    {
      type: 'code',
      lang: 'ts',
      text: "export async function rotate(token: string) {\n  const row = await repo.find(token)\n  if (!row) throw new Error('unknown token')\n  await repo.revoke(row.id)\n  return repo.issue(row.userId)\n}",
    },
    {
      type: 'log',
      text: 'INFO start auth.spec.ts\nWARN slow query 212 ms\nERROR expected 401, got 200\nINFO done in 17.7 s',
    },
    {
      type: 'tree',
      paths: ['src/auth/refresh.ts', 'src/auth/rotation.repo.ts', 'migrations/0042.sql'],
    },
    {
      type: 'timeline',
      items: [
        { at: '2026-11-05T10:00:00Z', text: 'Branch opened', status: 'ok' },
        { at: '2026-11-05T11:30:00Z', text: 'E2E failed', status: 'fail' },
      ],
    },
    {
      type: 'decision',
      question: 'How to invalidate the old token?',
      options: [
        { label: 'Revoke on refresh', effort: 'S', risk: 'low', pros: 'Simple' },
        { label: 'Token families', effort: 'M', reversible: true, cons: 'New table' },
      ],
      pick: 0,
    },
    {
      type: 'section',
      title: 'Follow-ups',
      children: [
        { type: 'list', items: ['Audit row on refresh', { text: 'Replay test', status: 'wait' }] },
      ],
    },
    { type: 'divider' },
    {
      type: 'chart',
      kind: 'bar',
      x: ['auth', 'catalog', 'orders'],
      series: { ms: [17700, 9100, 4300] },
    },
  ],
}

/** Every node, containers and children included. */
function countNodes(nodes: unknown[]): number {
  let count = 0
  for (const node of nodes as { children?: unknown[] }[]) {
    count += 1 + countNodes(node.children ?? [])
  }
  return count
}

const DOCUMENTS = { 'render.table': TABLE, 'render.doc20': DOC20, 'render.chart': CHART }
type Timing = keyof typeof DOCUMENTS

/**
 * One round of one document: `samples` renders by the current bundle and as many by the
 * reference, paired and alternating, each into a fresh box with layout forced, in ms.
 */
function round(
  page: Page,
  input: unknown,
  samples: number,
): Promise<{ current: number[]; reference: number[] }> {
  return page.evaluate(
    ({ input, samples }) => {
      type Bundle = { render(doc: unknown, target: HTMLElement): { destroy(): void } }
      const { VUI, VUI_REF } = window as unknown as { VUI: Bundle; VUI_REF: Bundle }
      const once = (bundle: Bundle) => {
        const box = document.createElement('div')
        document.body.append(box)
        document.body.getBoundingClientRect()
        const start = performance.now()
        const handle = bundle.render(input, box)
        box.getBoundingClientRect()
        const time = performance.now() - start
        handle.destroy()
        box.remove()
        return time
      }
      const current: number[] = []
      const reference: number[] = []
      for (let sample = 0; sample < samples; sample += 1) {
        if (sample % 2 === 0) reference.push(once(VUI_REF))
        current.push(once(VUI))
        if (sample % 2 === 1) reference.push(once(VUI_REF))
      }
      return { current, reference }
    },
    { input, samples },
  )
}

/** Bytes retained per mounted visual: `MOUNTS` mounts, the JS and Blink heaps after GC. */
async function memoryRound(page: Page, name: Timing): Promise<number> {
  const cdp = await page.context().newCDPSession(page)
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('HeapProfiler.collectGarbage')
    const usage = (await cdp.send('Runtime.getHeapUsage')) as {
      usedSize: number
      embedderHeapUsedSize?: number
    }
    return usage.usedSize + (usage.embedderHeapUsedSize ?? 0)
  }
  const before = await heap()
  await page.evaluate(
    ({ name, mounts }) => {
      const scope = window as unknown as {
        VUI: { render(doc: unknown, target: HTMLElement): { destroy(): void } }
        __docs: Record<string, unknown>
        __mounted: { destroy(): void }[]
      }
      scope.__mounted = []
      for (let mount = 0; mount < mounts; mount += 1) {
        const box = document.createElement('div')
        document.body.append(box)
        scope.__mounted.push(scope.VUI.render(scope.__docs[name], box))
        box.getBoundingClientRect()
      }
    },
    { name, mounts: MOUNTS },
  )
  const after = await heap()
  await page.evaluate(() => {
    const scope = window as unknown as { __mounted: { destroy(): void }[] }
    for (const handle of scope.__mounted) handle.destroy()
    scope.__mounted = []
    document.body.replaceChildren()
  })
  await cdp.detach()
  return (after - before) / MOUNTS
}

function readLoad(): number[] {
  try {
    return readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).map(Number)
  } catch {
    return loadavg()
  }
}

test('the 20-node document has 20 nodes and no error', async ({ page }) => {
  expect(countNodes(DOC20.body)).toBe(20)
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
  await page.addScriptTag({ path: BUNDLE })
  const errors = await page.evaluate((input) => {
    const box = document.createElement('div')
    document.body.append(box)
    const { VUI } = window as unknown as {
      VUI: { render(doc: unknown, target: HTMLElement): { diagnostics: { severity: string }[] } }
    }
    return VUI.render(input, box).diagnostics.filter((item) => item.severity === 'error')
  }, DOC20)
  expect(errors).toEqual([])
  await expect(page.locator('.vui-chart-line').first()).toBeVisible()
})

test('§9.5: render timings and memory per visual, within their limits', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 720, height: 800 })
  // A localhost page answered here: a secure context, and with COOP + COEP cross-origin
  // isolated, which is what gives `performance.now()` its 5 µs resolution.
  await page.route('http://localhost:9/budgets', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      body: '<!doctype html><meta charset="utf-8"><style>body{margin:0;width:720px}</style><body></body>',
    }),
  )
  await page.goto('http://localhost:9/budgets')
  // The current bundle first, so its stylesheet is the page's (one `style#vui-style` per page);
  // then the reference, kept as `VUI_REF`, and `VUI` restored to the current bundle.
  expect(existsSync(REFERENCE), 'run node scripts/check-perf-budgets.mjs --update').toBe(true)
  await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8') })
  await page.evaluate(() => {
    const scope = window as unknown as { VUI: unknown; VUI_CURRENT: unknown }
    scope.VUI_CURRENT = scope.VUI
  })
  await page.addScriptTag({ content: readFileSync(REFERENCE, 'utf8') })
  await page.evaluate(() => {
    const scope = window as unknown as { VUI: unknown; VUI_CURRENT: unknown; VUI_REF: unknown }
    scope.VUI_REF = scope.VUI
    scope.VUI = scope.VUI_CURRENT
  })
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)

  const cores = cpus()
  const hardware = {
    cpu: cores[0]?.model.trim() ?? 'unknown',
    cores: cores.length,
    memGiB: Math.round((totalmem() / 2 ** 30) * 10) / 10,
    load: readLoad(),
  }
  const chromium = browser.version()

  const rounds: Record<string, number[]> = {}
  const samples: Record<string, { current: number[]; reference: number[] }> = {}
  const names = Object.keys(DOCUMENTS) as Timing[]
  for (const name of names) {
    rounds[name] = []
    samples[name] = { current: [], reference: [] }
  }
  // Metrics interleave round by round, so a burst of load on the machine spreads over all three.
  for (let index = 0; index <= ROUNDS; index += 1) {
    for (const name of names) {
      const { current, reference } = await round(page, DOCUMENTS[name], SAMPLES[name])
      if (index === 0) continue
      rounds[name]?.push(Math.min(...current))
      samples[name]?.current.push(...current)
      samples[name]?.reference.push(...reference)
    }
  }

  await page.evaluate((docs) => {
    ;(window as unknown as { __docs: unknown }).__docs = docs
  }, DOCUMENTS)
  const perDocument: Record<string, number[]> = {}
  for (const name of names) {
    await memoryRound(page, name)
    perDocument[name] = []
    for (let index = 0; index < ROUNDS; index += 1) {
      perDocument[name]?.push(await memoryRound(page, name))
    }
  }
  // The largest of the three documents is the metric, round by round.
  rounds['memory.visual'] = Array.from({ length: ROUNDS }, (_, index) =>
    Math.max(...names.map((name) => perDocument[name]?.[index] ?? 0)),
  )

  const result = {
    chromium,
    hardware: { ...hardware, load: readLoad() },
    method: {
      samples: SAMPLES,
      rounds: ROUNDS,
      warmup: 1,
      mounts: MOUNTS,
    },
    rounds,
    samples,
    memoryByDocument: perDocument,
  }
  mkdirSync(dirname(RESULT), { recursive: true })
  writeFileSync(RESULT, `${JSON.stringify(result, null, 2)}\n`)
  const fmt = (values: number[] | undefined, scale = 1) =>
    (values ?? []).map((value) => (value / scale).toFixed(3)).join(' ')
  for (const name of names) {
    const gated = gatedValue(name, result)?.toFixed(3)
    console.log(`${name} ms (fastest per round): ${fmt(rounds[name])}; ratio ${gated}`)
  }
  console.log(`memory.visual MB: ${fmt(rounds['memory.visual'], 2 ** 20)}`)
  console.log(
    `load ${hardware.load.join(' ')} → ${result.hardware.load.join(' ')}, Chromium ${chromium}`,
  )

  for (const [name, limit] of Object.entries(LIMITS)) {
    const value = metricValue(name, rounds[name])
    expect.soft(value, `${name} measured`).toBeDefined()
    expect.soft(value, `${name} within §9.5's ${limit}`).toBeLessThanOrEqual(limit)
  }
})
