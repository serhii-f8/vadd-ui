import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

// The real `dist/viewer.js` in a real process, opened by a real browser under real CSPs.

const ENTRY = fileURLToPath(new URL('../packages/ui-viewer/dist/viewer.js', import.meta.url))
const ATTACK = '</script><script>window.pwned=1</script><img src=x onerror=window.pwned=2>'

interface ViewerFile {
  port: number
  readToken: string
  writeToken: string
}

let child: ChildProcess
let info: ViewerFile
let base: string

async function launch(): Promise<ViewerFile> {
  const state = mkdtempSync(join(tmpdir(), 'vui-e2e-state-'))
  const cwd = mkdtempSync(join(tmpdir(), 'vui-e2e-work-'))
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const { port } = probe.address() as AddressInfo
  await new Promise((done) => probe.close(done))
  child = spawn(process.execPath, [ENTRY], {
    cwd,
    env: { ...process.env, XDG_STATE_HOME: state, VUI_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  await new Promise<void>((resolve) => {
    child.stderr?.setEncoding('utf8').on('data', (text: string) => {
      if (text.includes('listening')) resolve()
    })
  })
  const [hash] = readdirSync(join(state, 'vadd-ui'))
  return JSON.parse(readFileSync(join(state, 'vadd-ui', hash as string, 'viewer.json'), 'utf8'))
}

async function post(document: object): Promise<string> {
  const reply = await fetch(`${base}api/docs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${info.writeToken}` },
    body: JSON.stringify(document),
  })
  expect(reply.status).toBe(201)
  return ((await reply.json()) as { id: string }).id
}

/** Everything a page must never do, gathered for one test. */
function watch(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('requestfailed', (item) => problems.push(`failed: ${item.url()}`))
  return problems
}

test.beforeAll(async () => {
  info = await launch()
  base = `http://localhost:${info.port}/v/${info.readToken}/`
})

test.afterAll(() => {
  child.kill('SIGTERM')
})

test('the feed page loads its script under the §15.3 CSP, with no violation', async ({ page }) => {
  const problems = watch(page)
  const requests: string[] = []
  page.on('request', (item) => requests.push(new URL(item.url()).pathname))
  await page.goto(base)
  await expect(page.locator('main')).toHaveText('vadd-ui Viewer')
  expect(requests).toContain(`/v/${info.readToken}/app.js`)
  expect(requests).not.toContain('/favicon.ico')
  expect(problems).toEqual([])
})

test('the §15.3 CSP does block an inline script on the feed page', async ({ page }) => {
  await page.goto(base)
  const blocked = await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.ranInline = true'
    document.head.append(script)
    return (window as unknown as { ranInline?: boolean }).ranInline !== true
  })
  expect(blocked).toBe(true)
})

test('a standalone document renders under its own CSP, with no violation', async ({ page }) => {
  const problems = watch(page)
  const id = await post({
    title: 'Standalone proof',
    body: [
      { type: 'callout', tone: 'ok', text: 'All green' },
      { type: 'chart', kind: 'bar', x: ['a', 'b'], series: { n: [3, 1] } },
    ],
  })
  await page.goto(`${base}docs/${id}.html`)
  await expect(page.getByRole('heading', { name: 'Standalone proof' })).toBeVisible()
  await expect(page.getByText('All green')).toBeVisible()
  await expect(page.locator('svg').first()).toBeVisible()
  expect(problems).toEqual([])
})

test('a hostile document runs nothing', async ({ page }) => {
  const problems = watch(page)
  const id = await post({ title: ATTACK, body: [ATTACK, { type: 'code', text: ATTACK }] })
  await page.goto(`${base}docs/${id}.html`)
  await expect(page.getByRole('heading', { level: 2 })).toContainText('window.pwned')
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  expect(problems).toEqual([])
})

test('a browser event stream gets hello and a live doc', async ({ page }) => {
  await page.goto(base)
  const received = page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const events: string[] = []
        const source = new EventSource('api/events')
        source.addEventListener('hello', () => {
          events.push('hello')
          document.title = 'open'
        })
        source.addEventListener('doc', (event) => {
          events.push(`doc:${(event as MessageEvent<string>).lastEventId}`)
          source.close()
          resolve(events)
        })
      }),
  )
  await expect(page).toHaveTitle('open')
  await post({ title: 'Live', body: [] })
  expect((await received)[0]).toBe('hello')
  expect((await received)[1]).toMatch(/^doc:\d+$/)
})
