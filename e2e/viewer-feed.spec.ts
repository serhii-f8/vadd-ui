import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  dropProxy,
  freePort,
  type LiveViewer,
  launchViewer,
  postDoc,
  watchProblems,
} from './harness/viewer'

const ATTACK = '</script><img src=x onerror=window.pwned=1><script>window.pwned=2</script>'

const RICH = {
  title: 'Rich report',
  subtitle: 'Everything at once',
  meta: { branch: 'feature/feed', cwd: '/work/app' },
  body: [
    { type: 'callout', tone: 'ok', text: 'All green' },
    { type: 'chart', kind: 'bar', x: ['a', 'b'], series: { n: [3, 1] } },
    { type: 'table', columns: ['name', 'n'], rows: [['one', 1]] },
    { type: 'code', text: 'const a = 1', lang: 'ts' },
  ],
}

const tall = (title: string) => ({
  title,
  body: Array.from({ length: 30 }, (_, index) => ({ type: 'callout', text: `Line ${index}` })),
})

let viewer: LiveViewer

const post = (document: object) => postDoc(viewer, document)
const entry = (page: Page, title: string): Locator => page.getByRole('article', { name: title })
const shadowRoots = (page: Page) =>
  page.evaluate(
    () => [...document.querySelectorAll('.feed-body')].filter((host) => host.shadowRoot).length,
  )
const atBottom = (page: Page) =>
  page.evaluate(() => {
    const { scrollHeight, clientHeight, scrollTop } = document.documentElement
    return scrollHeight - clientHeight - scrollTop < 2
  })

/** Resolves on the `scroll` event, a frame later: only then has the feed seen the reader move. */
const scrollTo = (page: Page, top: number) =>
  page.evaluate(
    (y) =>
      new Promise((done) => {
        window.addEventListener('scroll', done, { once: true })
        window.scrollTo(0, y)
      }),
    top,
  )

test.beforeEach(async () => {
  viewer = await launchViewer()
})

test.afterEach(async () => {
  await viewer.stop()
})

test('an entry shows its fields, and a live document appears after the stored ones', async ({
  page,
}) => {
  await post(RICH)
  await page.goto(viewer.base)
  const rich = entry(page, 'Rich report')
  await expect(rich.getByRole('heading', { name: 'Rich report', exact: true })).toHaveCount(1)
  await expect(rich.locator('time')).toHaveAttribute('datetime', /^2\d{3}-/)
  await expect(rich.locator('.feed-branch')).toHaveText('feature/feed')
  await expect(rich.locator('.feed-cwd')).toHaveText('/work/app')
  await expect(rich.getByRole('button', { name: 'Fold' })).toBeVisible()
  await expect(rich.getByRole('link', { name: 'Open standalone' })).toBeVisible()
  await expect(rich.getByRole('button', { name: 'Copy spec' })).toBeVisible()

  await post({ title: 'Second', body: ['later'] })
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('article').last()).toContainText('Second')
})

test('each document renders in its own shadow root, with the title printed once', async ({
  page,
}) => {
  await post(RICH)
  await post({ title: 'Other', body: ['plain'] })
  await page.goto(viewer.base)
  await expect(entry(page, 'Other').getByText('plain')).toBeVisible()
  await expect(entry(page, 'Rich report').getByText('All green')).toBeVisible()
  expect(await shadowRoots(page)).toBe(2)
  await expect(page.locator('.vui-title')).toHaveCount(2)
  await expect(page.locator('.vui-title').first()).toBeHidden()
  await expect(entry(page, 'Rich report').getByText('Everything at once')).toBeVisible()
})

test('the fold toggle hides and shows a document', async ({ page }) => {
  await post(RICH)
  await page.goto(viewer.base)
  const rich = entry(page, 'Rich report')
  await expect(rich.getByText('All green')).toBeVisible()
  await rich.getByRole('button', { name: 'Fold' }).click()
  await expect(rich.getByText('All green')).toBeHidden()
  await rich.getByRole('button', { name: 'Unfold' }).click()
  await expect(rich.getByText('All green')).toBeVisible()
})

test('only the newest of a long history starts open', async ({ page }) => {
  for (let index = 1; index <= 12; index += 1) await post({ title: `Doc ${index}`, body: ['x'] })
  await page.goto(viewer.base)
  await expect(page.getByRole('article')).toHaveCount(12)
  await expect(page.locator('.feed-body:not([hidden])')).toHaveCount(10)
  await entry(page, 'Doc 1').getByRole('button', { name: 'Unfold' }).click()
  await expect(page.locator('.feed-body:not([hidden])')).toHaveCount(11)
})

test('the page follows new documents, until the reader scrolls up', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 500 })
  await post(tall('First'))
  await page.goto(viewer.base)
  await expect(entry(page, 'First').getByText('Line 29')).toBeVisible()
  await post(tall('Second'))
  await expect(entry(page, 'Second').getByText('Line 29')).toBeVisible()
  await expect.poll(() => atBottom(page)).toBe(true)

  await scrollTo(page, 100)
  await post(tall('Third'))
  await expect(entry(page, 'Third').getByText('Line 29')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(100)

  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight))
  await expect.poll(() => atBottom(page)).toBe(true)
  await post(tall('Fourth'))
  await expect(entry(page, 'Fourth').getByText('Line 29')).toBeAttached()
  await expect.poll(() => atBottom(page)).toBe(true)
})

test('a document cannot paint over the bar', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 400 })
  const columns = ['a', 'b', 'c', 'd', 'e']
  await post({
    title: 'Wide',
    body: [
      {
        type: 'table',
        columns,
        pageSize: 50,
        rows: Array.from({ length: 40 }, (_, index) => columns.map(() => `row${index}`)),
      },
    ],
  })
  await page.goto(viewer.base)
  await expect(entry(page, 'Wide').getByText('row39').first()).toBeVisible()
  await scrollTo(page, 150)
  const hit = await page.evaluate(() => {
    const bar = document.querySelector('.feed-bar') as HTMLElement
    const { left, top, height } = bar.getBoundingClientRect()
    return document.elementFromPoint(left + 40, top + height / 2)?.closest('.feed-bar') !== null
  })
  expect(hit).toBe(true)
})

test('keyboard focus never lands under the bar (§15.2)', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 300 })
  await post(tall('Upper'))
  await post({ title: 'Lower', body: ['[next](https://example.com/)', ...tall('x').body] })
  await page.goto(viewer.base)
  const link = entry(page, 'Lower').getByRole('link', { name: 'next' })
  await expect(link).toBeVisible()
  // The buttons sit under the bar, still inside the viewport, and the link just below it.
  const copy = entry(page, 'Lower').getByRole('button', { name: 'Copy spec' })
  const top = (await copy.boundingBox())?.y ?? 0
  await scrollTo(page, (await page.evaluate(() => window.scrollY)) + top - 20)
  await link.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }))
  await page.keyboard.press('Shift+Tab')
  await expect(copy).toBeFocused()
  const bar = await page.locator('.feed-bar').boundingBox()
  expect((await copy.boundingBox())?.y).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0))
})

test('a #id target stays clear of a bar that wrapped', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 })
  await post({
    title: 'Links',
    body: [
      '[jump](#far)',
      ...Array.from({ length: 30 }, (_, index) => ({ type: 'callout', text: `Filler ${index}` })),
      { type: 'callout', id: 'far', text: 'Far away' },
      ...Array.from({ length: 30 }, (_, index) => ({ type: 'callout', text: `After ${index}` })),
    ],
  })
  await page.goto(viewer.base)
  await expect(entry(page, 'Links').getByText('Far away')).toBeAttached()
  await page.evaluate(() => {
    const status = document.querySelector('.feed-status') as HTMLElement
    status.textContent = 'This Viewer has stopped. Run vui show to open a new feed.'
    window.dispatchEvent(new Event('resize'))
    window.scrollTo(0, 0)
  })
  await entry(page, 'Links').getByRole('link', { name: 'jump' }).click()
  const box = await entry(page, 'Links').getByText('Far away').boundingBox()
  const bar = await page.locator('.feed-bar').boundingBox()
  expect(box?.y).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0))
})

test('copy spec falls back when the clipboard API refuses', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const original = navigator.clipboard.writeText.bind(navigator.clipboard)
    let calls = 0
    navigator.clipboard.writeText = (text) => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('denied')) : original(text)
    }
  })
  const id = await post(RICH)
  await page.goto(viewer.base)
  await entry(page, 'Rich report').getByRole('button', { name: 'Copy spec' }).click()
  await expect(entry(page, 'Rich report').getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(await (await fetch(`${viewer.base}api/docs/${id}`)).text())
})

test('a dropped stream reconnects with backoff and fills the gap', async ({ page }) => {
  const proxy = await dropProxy(viewer)
  await post({ title: 'Before', body: ['x'] })
  await page.goto(proxy.base)
  await expect(page.getByRole('status')).toHaveText('Live')
  await expect(page.getByRole('article')).toHaveCount(1)

  const asked: string[] = []
  page.on('request', (item) => asked.push(item.url()))
  proxy.down()
  await expect(page.getByRole('status')).toHaveText('Reconnecting…')
  await post({ title: 'During one', body: ['x'] })
  await post({ title: 'During two', body: ['x'] })
  await expect
    .poll(() => asked.filter((url) => url.endsWith('api/events')).length)
    .toBeGreaterThan(1)

  proxy.up()
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 })
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByRole('article').last()).toContainText('During two')
  expect(asked.some((url) => url.includes('api/docs?after=1&limit=500'))).toBe(true)

  await post({ title: 'After', body: ['x'] })
  await expect(page.getByRole('article')).toHaveCount(4)
  await proxy.close()
})

test('a Viewer restarted under new tokens is reported as gone, and the page stops', async ({
  page,
}) => {
  // An OS-chosen port: a fixed one can be held by another run's Viewer on this machine.
  const port = await freePort()
  await viewer.stop()
  viewer = await launchViewer({ port })
  await post({ title: 'Kept', body: ['still here'] })
  await page.goto(viewer.base)
  await expect(page.getByRole('status')).toHaveText('Live')
  const { state, cwd } = viewer
  await viewer.stop()
  viewer = await launchViewer({ state, cwd, port })
  await expect(page.getByRole('status')).toContainText('This Viewer has stopped', {
    timeout: 20_000,
  })
  const requests: string[] = []
  page.on('request', (item) => requests.push(item.url()))
  await page.waitForTimeout(3000)
  expect(requests).toEqual([])
  await expect(entry(page, 'Kept').getByText('still here')).toBeVisible()
})

for (const os of ['dark', 'light'] as const) {
  const other = os === 'dark' ? 'light' : 'dark'
  const background = { dark: 'rgb(10, 10, 10)', light: 'rgb(255, 255, 255)' }

  test(`on a ${os} OS the page and documents follow, and the toggle works both ways`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: os })
    await post(RICH)
    await page.goto(viewer.base)
    await expect(entry(page, 'Rich report').getByText('All green')).toBeVisible()
    const theme = () =>
      page.evaluate(() => {
        const host = document.querySelector('.feed-body') as HTMLElement
        const root = host.shadowRoot?.querySelector('.vui-root') as HTMLElement
        return {
          page: getComputedStyle(document.body).backgroundColor,
          token: getComputedStyle(root).getPropertyValue('--vui-bg'),
          scheme: getComputedStyle(root).colorScheme,
        }
      })
    const hex = { dark: '#0a0a0a', light: '#ffffff' }
    const expected = (name: 'dark' | 'light') => ({
      page: background[name],
      token: hex[name],
      scheme: name,
    })
    await page.evaluate(() => {
      const host = document.querySelector('.feed-body') as HTMLElement
      const root = host.shadowRoot?.querySelector('.vui-root') as HTMLElement & { mark?: true }
      root.mark = true
      ;(root.firstChild as HTMLElement & { mark?: true }).mark = true
    })

    expect(await theme()).toEqual(expected(os))
    await page.locator('.feed-theme').click()
    expect(await theme()).toEqual(expected(other))
    await page.locator('.feed-theme').click()
    expect(await theme()).toEqual(expected(os))

    // Nothing re-rendered: §8.2.
    const kept = await page.evaluate(() => {
      const host = document.querySelector('.feed-body') as HTMLElement
      const root = host.shadowRoot?.querySelector('.vui-root') as HTMLElement
      return (root.firstChild as HTMLElement & { mark?: true }).mark
    })
    expect(kept).toBe(true)
  })
}

test('a change of the OS scheme applies live, until the reader chooses', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(viewer.base)
  await expect(page.locator('html')).toHaveClass('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass('dark')
  await page.locator('.feed-theme').click()
  await expect(page.locator('html')).toHaveClass('light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass('light')
  await page.reload()
  await expect(page.locator('html')).toHaveClass('dark')
})

test('the page has an inline favicon and causes no CSP violation', async ({ page }) => {
  const problems = watchProblems(page)
  const requests: string[] = []
  page.on('request', (item) => requests.push(new URL(item.url()).pathname))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  await post(RICH)
  await page.goto(viewer.base)
  await expect(entry(page, 'Rich report').locator('svg').first()).toBeVisible()
  await post(RICH)
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.locator('.feed-theme').click()
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /^data:image\/svg\+xml,/)
  expect(requests).not.toContain('/favicon.ico')
  expect(problems).toEqual([])
})

test('a hostile document and header run nothing and stay text', async ({ page }) => {
  const problems = watchProblems(page)
  await post({
    title: ATTACK,
    meta: { branch: ATTACK, cwd: ATTACK },
    body: [ATTACK, { type: 'code', text: ATTACK }],
  })
  await page.goto(viewer.base)
  const hostile = page.getByRole('article')
  await expect(hostile.locator('h2').first()).toHaveText(ATTACK)
  await expect(hostile.locator('.feed-branch')).toHaveText(ATTACK)
  await expect(hostile.locator('.feed-cwd')).toHaveText(ATTACK)
  await expect(hostile.locator('.feed-body').getByText('window.pwned').last()).toBeVisible()
  expect(await page.locator('img').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  expect(problems).toEqual([])
})

test('copy spec writes the stored document', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const id = await post(RICH)
  await page.goto(viewer.base)
  await entry(page, 'Rich report').getByRole('button', { name: 'Copy spec' }).click()
  await expect(entry(page, 'Rich report').getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  const stored = await (await fetch(`${viewer.base}api/docs/${id}`)).text()
  expect(copied).toBe(stored)
})

test('open standalone opens the document in a tab with no opener', async ({ page, context }) => {
  await post(RICH)
  await page.goto(viewer.base)
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    entry(page, 'Rich report').getByRole('link', { name: 'Open standalone' }).click(),
  ])
  await expect(opened.getByRole('heading', { name: 'Rich report' })).toBeVisible()
  expect(await opened.evaluate(() => window.opener)).toBeNull()
})

test('a #id link scrolls inside its shadow root, even out of a closed fold', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 400 })
  await post({
    title: 'Links',
    body: [
      '[jump](#far)',
      ...Array.from({ length: 30 }, (_, index) => ({ type: 'callout', text: `Filler ${index}` })),
      {
        type: 'section',
        title: 'Closed',
        fold: 'closed',
        children: [{ type: 'callout', id: 'far', text: 'Far away' }],
      },
    ],
  })
  await page.goto(viewer.base)
  await page.evaluate(() => window.scrollTo(0, 0))
  await entry(page, 'Links').getByRole('link', { name: 'jump' }).click()
  await expect(entry(page, 'Links').getByText('Far away')).toBeInViewport()
  expect(new URL(page.url()).hash).toBe('')
})

test('an outside link leaves the feed in place', async ({ page, context }) => {
  await context.route('https://example.com/**', (route) => route.fulfill({ body: 'away' }))
  await post({ title: 'Out', body: ['[away](https://example.com/page)'] })
  await page.goto(viewer.base)
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    entry(page, 'Out').getByRole('link', { name: 'away' }).click(),
  ])
  await expect(opened).toHaveURL('https://example.com/page')
  expect(page.url()).toBe(viewer.base)
})
