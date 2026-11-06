import { type ChildProcess, spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// The real CLI, a real detached Viewer and a real page, with a stub in Orca's place.

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const BUDGET_MS = 1000

interface Rig {
  cwd: string
  env: NodeJS.ProcessEnv
  calls: string
  tabs: string
}

const rigs: Rig[] = []

// A hook, so a failed test leaves no detached Viewer behind.
test.afterEach(async () => {
  for (const place of rigs.splice(0)) {
    await vui(place, ['viewer', 'stop'])
    rmSync(place.cwd, { recursive: true, force: true })
  }
})

function rig(): Rig {
  const dir = mkdtempSync(join(tmpdir(), 'vui-e2e-show-'))
  const calls = join(dir, 'calls')
  const tabs = join(dir, 'tabs.json')
  const stub = join(dir, 'orca-stub')
  writeFileSync(tabs, '[]')
  writeFileSync(calls, '')
  writeFileSync(
    stub,
    `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs')
appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ') + '\\n')
const result = process.argv[3] === 'list'
  ? { tabs: JSON.parse(readFileSync(${JSON.stringify(tabs)}, 'utf8')) }
  : { browserPageId: 'page-1' }
console.log(JSON.stringify({ ok: true, result }))
`,
  )
  chmodSync(stub, 0o755)
  const entries = Object.entries(process.env).filter(([name]) => !name.startsWith('ORCA_'))
  const env = {
    ...Object.fromEntries(entries),
    PATH: dirname(process.execPath),
    XDG_STATE_HOME: join(dir, 'state'),
    ORCA_CLI_COMMAND: stub,
  }
  const place = { cwd: dir, env, calls, tabs }
  rigs.push(place)
  return place
}

function vui(place: Rig, argv: string[], stdin = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, [BIN, ...argv], {
      cwd: place.cwd,
      env: place.env,
    })
    let stdout = ''
    child.stdout?.setEncoding('utf8').on('data', (text: string) => {
      stdout += text
    })
    child.stdin?.end(stdin)
    child.on('error', reject)
    child.on('close', () => resolve(stdout))
  })
}

const show = async (place: Rig, title: string) => {
  const out = await vui(place, ['show', '--json'], JSON.stringify({ title, body: ['text'] }))
  return JSON.parse(out) as { url: string; pane: string; clients: number }
}

const calls = (place: Rig) => readFileSync(place.calls, 'utf8').trim().split('\n').filter(Boolean)

test('a show reaches an open page within the budget, and only the first opens a pane', async ({
  page,
}) => {
  const place = rig()
  const first = await show(place, 'First document')
  expect(first.pane).toBe('opened')
  await page.goto(first.url)
  await expect(page.getByText('First document').first()).toBeVisible()
  await expect(page.getByText('Live')).toBeVisible()

  const started = performance.now()
  const second = await show(place, 'Second document')
  await expect(page.getByText('Second document').first()).toBeVisible()
  const elapsed = performance.now() - started
  console.log(`delivery: ${elapsed.toFixed(0)} ms from the CLI's spawn to visible`)
  expect(elapsed).toBeLessThan(BUDGET_MS)
  expect(second.clients).toBe(1)
  expect(calls(place).filter((line) => line.startsWith('tab create'))).toHaveLength(1)
})

test('a killed Viewer restarts, and its pane comes back on the new URL', async ({ page }) => {
  const place = rig()
  const first = await show(place, 'Before the kill')
  await page.goto(first.url)
  await expect(page.getByText('Before the kill').first()).toBeVisible()

  const status = JSON.parse(await vui(place, ['viewer', 'status', '--json'])) as { pid: number }
  writeFileSync(place.tabs, JSON.stringify([{ browserPageId: 'page-1', url: first.url }]))
  process.kill(status.pid, 'SIGKILL')

  const second = await show(place, 'After the kill')
  expect(second.pane).toBe('moved')
  expect(second.url).not.toBe(first.url)
  expect(calls(place).at(-1)).toBe(`goto --page page-1 --url ${second.url} --json`)

  // The old URL stays dead (§15.3): the page says so, until Orca moves it.
  await expect(page.getByText('This Viewer has stopped')).toBeVisible({ timeout: 40_000 })
  await page.goto(second.url)
  await expect(page.getByText('Before the kill').first()).toBeVisible()
  await expect(page.getByText('After the kill').first()).toBeVisible()
  await expect(page.getByText('Live')).toBeVisible()
})
