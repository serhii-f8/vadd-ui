#!/usr/bin/env node
// §16.1's scenario on this host, with the real `vui` (run `pnpm build` first):
//   1. a first show delivers a document that appears in the pane (cold: no Viewer, no pane);
//   2. a second show appends without opening another pane (warm: the pane is open);
//   3. killing the Viewer and showing again restarts it, and the open page reconnects;
//   4. `vui doctor` reports no failures.
//
//   node scripts/host-scenario.mjs --surface orca      # inside an Orca terminal: the Orca pane
//   node scripts/host-scenario.mjs --surface browser   # outside Orca: a headless Chromium stands
//                                                      # in for the system browser (VD-173)
//   [--out report.json]   also writes report.png outside Orca
//   [--keep]              keeps the temporary workspace and state
//
// It runs in a temporary git workspace with its own XDG_STATE_HOME, so it never meets the
// user's Viewers, and closes the pane it opened.

import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  BUDGET_MS,
  estimateOffset,
  parseUrlLine,
  verdict,
  viewerTabs,
  workspaceEnv,
} from './lib/host-scenario.mjs'

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const POLL_MS = 25

/** Samples ours against the page's clock and puts them in the title, for \`orca eval\` to read. */
const CLOCK_PAGE = `<!doctype html><title>sync</title><script>
(async () => {
  const samples = []
  for (let i = 0; i < 20; i += 1) {
    const before = Date.now()
    const remote = Number(await (await fetch('/now', { cache: 'no-store' })).text())
    samples.push({ before, remote, after: Date.now() })
  }
  document.title = JSON.stringify(samples)
})()
</script>`
const WAIT_MS = 15_000

/** @param {string} name */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const surface = /** @type {'orca' | 'browser'} */ (flag('--surface'))
if (surface !== 'orca' && surface !== 'browser') {
  console.error('usage: host-scenario.mjs --surface orca|browser [--out file.json]')
  process.exit(2)
}
if (!existsSync(BIN)) {
  console.error(`host-scenario: ${BIN} is missing; run pnpm build`)
  process.exit(2)
}

const ORCA = process.env.ORCA_CLI_COMMAND || 'orca'
const dir = mkdtempSync(join(tmpdir(), 'vui-scenario-'))
const workspace = join(dir, 'ws')
execFileSync('git', ['init', '-q', workspace])

const SUFFIXES = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
/** @param {string} entry */
const hasOrca = (entry) =>
  ['orca-ide', 'orca'].some((name) =>
    SUFFIXES.some((suffix) => existsSync(join(entry, name + suffix))),
  )
const env = workspaceEnv(process.env, dir, surface, hasOrca)

/** @param {string[]} argv @param {string} [input] */
function vui(argv, input = '') {
  const started = Date.now()
  const { status, stdout, stderr } = spawnSync(process.execPath, [BIN, ...argv], {
    cwd: workspace,
    env,
    input,
    encoding: 'utf8',
  })
  return { status, stdout, stderr, started, ended: Date.now() }
}

/**
 * One `vui show`. Outside Orca the text mode runs, since its URL line is what a person follows
 * (VD-125); the document id is then `<seq>-…`, from the `(#seq)` in the shown line.
 *
 * @param {string} title
 * @param {boolean} json
 */
function show(title, json = surface === 'orca') {
  const document = { title, body: [{ type: 'md', text: `Scenario document **${title}**.` }] }
  const result = vui(json ? ['show', '--json'] : ['show'], JSON.stringify(document))
  if (result.status !== 0) throw new Error(`vui show exit ${result.status}: ${result.stderr}`)
  if (json) return { ...result, json: JSON.parse(result.stdout) }
  const seq = /\(#(\d+)\)/.exec(result.stdout)?.[1]
  if (seq === undefined) throw new Error(`no shown line: ${result.stdout}`)
  return { ...result, json: { id: `${seq}-`, title, clients: Number.NaN } }
}

/** @param {string[]} args */
function orca(args) {
  const out = execFileSync(ORCA, [...args, '--json'], { encoding: 'utf8' })
  const reply = JSON.parse(out)
  if (reply.ok !== true) throw new Error(`${ORCA} ${args.join(' ')}: ${out}`)
  return reply.result
}

/** The same, without blocking this process, which serves the clock page meanwhile. */
async function orcaAsync(/** @type {string[]} */ args) {
  const { stdout } = await promisify(execFile)(ORCA, [...args, '--json'], { encoding: 'utf8' })
  const reply = JSON.parse(stdout)
  if (reply.ok !== true) throw new Error(`${ORCA} ${args.join(' ')}: ${stdout}`)
  return reply.result
}

function viewerInfo() {
  const root = join(dir, 'state', 'vadd-ui')
  const [hash] = readdirSync(root)
  return JSON.parse(readFileSync(join(root, String(hash), 'viewer.json'), 'utf8'))
}

/** What the page reports about one document: when `api/docs/<id>` arrived, if it rendered. */
function probe(/** @type {string} */ id, /** @type {string} */ title) {
  return `(() => {
    const entry = performance.getEntriesByType('resource')
      .filter((e) => e.name.includes('/api/docs/' + ${JSON.stringify(encodeURIComponent(id))}))
      .pop()
    const text = document.body ? document.body.innerText : ''
    return JSON.stringify({
      now: Date.now(),
      arrived: entry ? performance.timeOrigin + entry.responseEnd : null,
      shown: text.includes(${JSON.stringify(title)}),
      stopped: /stopped/i.test(text),
      href: location.href,
    })
  })()`
}

/**
 * A pane the scenario can read: the Orca pane through `orca eval`, or a Playwright page.
 * `evaluate` returns the probe's object; `offset` converts the page's clock to ours.
 */
async function openSurface() {
  if (surface === 'orca') {
    /** @type {string | undefined} */
    let pageId
    return {
      offset: 0,
      uncertainty: 0,
      synced: false,
      /** @param {string} id */
      attach(id) {
        pageId = id
      },
      /**
       * The pane's clock against ours. An \`orca eval\` round trip is most of a second, so the
       * pane itself measures it: it visits a page served here whose script asks this process for
       * the time 20 times (a round trip of a millisecond or two) and keeps the tightest sample.
       */
      async syncClock() {
        if (pageId === undefined) return
        const back = (await this.evaluate(probe('-', '-'))).href
        const server = createServer((request, response) => {
          if (request.url === '/now') {
            response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
            response.end(String(Date.now()))
            return
          }
          response.writeHead(200, { 'content-type': 'text/html' })
          response.end(CLOCK_PAGE)
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        try {
          await orcaAsync(['goto', '--page', pageId, '--url', `http://localhost:${port}/`])
          const deadline = Date.now() + WAIT_MS
          while (Date.now() < deadline) {
            const title = String(
              evalValue(
                await orcaAsync(['eval', '--page', pageId, '--expression', 'document.title']),
              ),
            )
            if (title.startsWith('[')) {
              // The pane took \`before\`/\`after\`, so the estimate is ours minus the pane's.
              const { offset, uncertainty } = estimateOffset(JSON.parse(title))
              Object.assign(this, { offset: -offset, uncertainty, synced: true })
              break
            }
            await new Promise((resolve) => setTimeout(resolve, 200))
          }
        } finally {
          server.closeAllConnections()
          server.close()
          await orcaAsync(['goto', '--page', pageId, '--url', back])
        }
      },
      /** @param {string} expression */
      async evaluate(expression) {
        if (pageId === undefined) throw new Error('no pane yet')
        return JSON.parse(
          String(evalValue(orca(['eval', '--page', pageId, '--expression', expression]))),
        )
      },
      /** @param {string} url */
      async goto(url) {
        if (pageId !== undefined) orca(['goto', '--page', pageId, '--url', url])
      },
      async screenshot() {
        if (pageId === undefined) return undefined
        const result = orca(['screenshot', '--page', pageId])
        return result.path ?? result.file ?? JSON.stringify(result)
      },
      async close() {
        if (pageId === undefined) return
        const { tabs } = orca(['tab', 'list'])
        const index = tabs.findIndex(
          (/** @type {{browserPageId: string}} */ t) => t.browserPageId === pageId,
        )
        if (index !== -1) orca(['tab', 'close', '--index', String(tabs[index].index ?? index)])
      },
    }
  }
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 720, height: 900 } })
  return {
    offset: 0,
    uncertainty: 0,
    synced: true,
    attach() {},
    async syncClock() {},
    /** @param {string} expression */
    async evaluate(expression) {
      return JSON.parse(await page.evaluate(expression))
    },
    /** @param {string} url */
    async goto(url) {
      await page.goto(url)
    },
    async screenshot() {
      const out = flag('--out')
      const path = out ? out.replace(/(\.json)?$/, '.png') : join(dir, 'browser-surface.png')
      await page.screenshot({ path, fullPage: true })
      return path
    },
    async close() {
      await browser.close()
    },
  }
}

/** Orca's `eval` result holds the value under one of a few names, depending on the version. */
function evalValue(/** @type {Record<string, unknown>} */ result) {
  for (const key of ['value', 'result', 'output']) if (key in result) return result[key]
  throw new Error(`eval: no value in ${JSON.stringify(result)}`)
}

/**
 * Waits until the pane shows the document. Returns when it arrived on the page's clock (the
 * page's arrival of `api/docs/<id>`, or the first poll that saw it rendered) and when the CLI
 * was spawned on ours; `msOf` subtracts them once the clocks are synchronized.
 */
async function delivered(
  /** @type {Awaited<ReturnType<typeof openSurface>>} */ pane,
  /** @type {{started: number, json: {id: string, title: string}}} */ shown,
) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const seen = await pane.evaluate(probe(shown.json.id, shown.json.title))
    if (seen.shown) {
      const at = seen.arrived ?? seen.now
      return { at, started: shown.started, fromResourceTiming: seen.arrived !== null }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  return { at: null, started: shown.started, fromResourceTiming: false }
}

async function titlesInOrder(
  /** @type {Awaited<ReturnType<typeof openSurface>>} */ pane,
  /** @type {string[]} */ titles,
) {
  const text = (await pane.evaluate(`JSON.stringify({ t: document.body.innerText })`)).t
  const at = titles.map((title) => text.indexOf(title))
  return at.every((index, i) => index >= 0 && (i === 0 || index > (at[i - 1] ?? -1)))
}

/** @param {{at: number | null, started: number}} d @returns {number | null} */
const msOf = (d) => (d.at === null ? null : d.at - pane.offset - d.started)

const stamp = Date.now().toString(36)
const titles = ['first', 'second', 'restart', 'after'].map(
  (step) => `vui scenario ${step} ${stamp}`,
)
const pane = await openSurface()
const notes = []
const tabCount = () =>
  surface === 'orca'
    ? viewerTabs(orca(['tab', 'list']).tabs, `http://localhost:${viewerInfo().port}`).length
    : 1

try {
  // 1. Cold.
  const first = show(titles[0] ?? '')
  let listedAfterCreate = null
  if (surface === 'orca') {
    const pageId = first.json.browserPageId
    if (typeof pageId !== 'string') throw new Error(`no pane: ${first.stdout} ${first.stderr}`)
    pane.attach(pageId)
    listedAfterCreate = orca(['tab', 'list']).tabs.some(
      (/** @type {{browserPageId: string}} */ t) => t.browserPageId === pageId,
    )
  } else {
    const url = parseUrlLine(first.stdout)
    if (url === undefined) throw new Error(`no URL line: ${first.stdout}`)
    await pane.goto(url)
  }
  const cold = await delivered(pane, first)
  const afterFirst = tabCount()

  // 2. Warm.
  const second = show(titles[1] ?? '')
  const warm = await delivered(pane, second)
  const afterSecond = tabCount() + (surface === 'browser' && parseUrlLine(second.stdout) ? 1 : 0)
  if (surface === 'orca' && second.json.clients < 1)
    notes.push(`second show saw clients ${second.json.clients}`)

  // 3. Restart.
  const { pid: oldPid } = viewerInfo()
  process.kill(oldPid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  const third = show(titles[2] ?? '')
  const { pid: newPid } = viewerInfo()
  /** @type {boolean | null} */
  let oldPageStopped = null
  if (surface === 'browser') {
    // The old page retries, and the restarted Viewer answers its old token with 404, so the page
    // says it stopped (VD-114, VD-120). A system browser has no `goto`: the new URL line is the
    // way back (VD-125), and the scenario follows it as a person would.
    const deadline = Date.now() + WAIT_MS
    let stopped = false
    while (!stopped && Date.now() < deadline) {
      stopped = (await pane.evaluate(probe('-', '-'))).stopped
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    oldPageStopped = stopped
    const url = parseUrlLine(third.stdout)
    notes.push(`URL line after restart: ${url ? 'printed' : 'missing'}`)
    if (url) await pane.goto(url)
  }
  const restarted = await delivered(pane, third)
  const afterRestart = tabCount()
  const fourth = show(titles[3] ?? '', true)
  await delivered(pane, fourth)

  // 4. Doctor.
  const doctor = vui(['doctor', '--json'])
  const doctorJson = JSON.parse(doctor.stdout)
  // Read the feed before the clock step navigates the pane away and back.
  const ordered = await titlesInOrder(pane, titles)
  const screenshot = await pane.screenshot()
  /** @type {boolean | null} */
  let clockSynced = null
  if (surface === 'orca') {
    try {
      await pane.syncClock()
      clockSynced = pane.synced
    } catch (error) {
      clockSynced = false
      notes.push(`clock sync failed: ${error instanceof Error ? error.message : error}`)
    }
  }
  const doctorFailures = doctorJson.checks
    .filter((/** @type {{status: string}} */ c) => c.status === 'fail')
    .map((/** @type {{name: string, detail: string}} */ c) => `${c.name}: ${c.detail}`)

  const report = {
    surface,
    host: {
      platform: process.platform,
      wsl: Boolean(process.env.WSL_DISTRO_NAME),
      node: process.version,
    },
    date: new Date().toISOString(),
    coldMs: msOf(cold),
    warmMs: msOf(warm),
    restartMs: msOf(restarted),
    timing: {
      budgetMs: BUDGET_MS,
      clockOffsetMs: pane.offset,
      clockUncertaintyMs: pane.uncertainty,
      fromResourceTiming: { cold: cold.fromResourceTiming, warm: warm.fromResourceTiming },
      cliMs: [first, second, third, fourth].map((s) => s.ended - s.started),
    },
    panes: { afterFirst, afterSecond, afterRestart },
    titlesInOrder: ordered,
    restart: {
      newPid: newPid !== oldPid,
      pageShowsDoc: restarted.at !== null,
      clientsAfter: fourth.json.clients,
    },
    doctorFailures,
    doctor: doctorJson.checks,
    listedAfterCreate,
    clockSynced,
    oldPageStopped,
    notes,
    screenshot,
  }
  const result = verdict(report)
  const out = flag('--out')
  if (out) writeFileSync(out, `${JSON.stringify({ ...report, verdict: result }, null, 2)}\n`)
  const ms = (/** @type {number | null} */ v) => (v === null ? 'n/a' : `${Math.round(v)} ms`)
  console.log(
    `host-scenario (${surface}): cold ${ms(report.coldMs)}, warm ${ms(report.warmMs)}, restart ${ms(report.restartMs)}; panes ${afterFirst}/${afterSecond}/${afterRestart}; clock offset ${Math.round(pane.offset)} ± ${Math.round(pane.uncertainty)} ms`,
  )
  for (const note of notes) console.log(`  note: ${note}`)
  for (const item of result.known) console.log(`  known: ${item}`)
  for (const failure of result.failures) console.error(`  FAIL: ${failure}`)
  console.log(result.ok ? 'host-scenario: pass' : 'host-scenario: FAIL')
  process.exitCode = result.ok ? 0 : 1
} finally {
  await pane.close().catch((/** @type {Error} */ error) => console.error(`close: ${error.message}`))
  vui(['viewer', 'stop'])
  if (!process.argv.includes('--keep')) rmSync(dir, { recursive: true, force: true })
}
