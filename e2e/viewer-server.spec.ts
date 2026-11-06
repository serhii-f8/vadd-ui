import { expect, test } from '@playwright/test'
import { type LiveViewer, launchViewer, postDoc, watchProblems as watch } from './harness/viewer'

// The real `dist/viewer.js` in a real process, opened by a real browser under real CSPs.

const ATTACK = '</script><script>window.pwned=1</script><img src=x onerror=window.pwned=2>'

let viewer: LiveViewer
let base: string

const post = (document: object) => postDoc(viewer, document)

test.beforeAll(async () => {
  viewer = await launchViewer()
  base = viewer.base
})

test.afterAll(async () => {
  await viewer.stop()
})

test('the feed page loads its script under the §15.3 CSP, with no violation', async ({ page }) => {
  const problems = watch(page)
  const requests: string[] = []
  page.on('request', (item) => requests.push(new URL(item.url()).pathname))
  await page.goto(base)
  await expect(page.getByRole('heading', { name: 'vadd-ui Viewer' })).toBeVisible()
  expect(requests).toContain(`/v/${viewer.info.readToken}/app.js`)
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
