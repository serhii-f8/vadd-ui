import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import type { Render } from '../packages/ui/src/index.js'
import { openVisual } from './harness/host.js'
import type { Scheme } from './harness/theme.js'

// The real `dist/vui.min.js`, which `pnpm gate` builds first. A page here has no stylesheet of
// its own, so whatever looks right comes from the bundle.

const BUNDLE = fileURLToPath(new URL('../packages/ui/dist/vui.min.js', import.meta.url))
const ESM = fileURLToPath(new URL('../packages/ui/dist/index.js', import.meta.url))
const bundleText = () => readFileSync(BUNDLE, 'utf8')

const REPORT = {
  vui: 1,
  title: 'Test run',
  generatedAt: '2026-11-05T10:00:00Z',
  body: [
    { type: 'callout', tone: 'ok', text: 'All **green**. See [details](#deep).' },
    {
      type: 'stats',
      items: [
        { label: 'Passed', value: 412, tone: 'ok' },
        { label: 'Failed', value: 3, tone: 'err' },
      ],
    },
    {
      type: 'grid',
      cols: 2,
      children: [
        { type: 'md', text: 'Left\n\n- a\n- b' },
        { type: 'kv', pairs: [['Branch', 'main']] },
      ],
    },
    {
      type: 'table',
      columns: ['Name', { key: 'ms', label: 'Time', format: 'ms' }],
      rows: [
        ['auth', 1200],
        ['catalog', 90],
      ],
    },
    { type: 'chart', kind: 'bar', x: ['a', 'b', 'c'], series: { n: [3, 1, 2] } },
    {
      type: 'tabs',
      tabs: [
        { label: 'One', children: [{ type: 'md', text: 'first' }] },
        {
          label: 'Two',
          children: [
            {
              type: 'section',
              title: 'Folded',
              fold: 'closed',
              children: [{ type: 'md', id: 'deep', text: 'target' }],
            },
          ],
        },
      ],
    },
  ],
}

const canonical = (doc: unknown) => JSON.stringify(doc).replace(/<\//g, '<\\/')
const embedded = (text: string) => `<script type="application/vui+json">${text}</script>`

/** §10.1, with the bundle inlined. */
const inlinePage = (text: string, html = '<html lang="en">') => `<!doctype html>
${html}<head><meta charset="utf-8">
<title>inline</title>
<script>${bundleText()}</script>
</head><body>
${embedded(text)}
</body></html>`

/** §10.2, with a local file for the CDN URL. */
const templatePage = (text: string) => `<!doctype html><meta charset="utf-8">
<script src="vui.min.js"></script>
${embedded(text)}
`

const PAGES = { inline: inlinePage, template: templatePage }

function serve(dir: string): Promise<Server> {
  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0]?.slice(1) ?? ''
    try {
      const type = name.endsWith('.js') ? 'text/javascript' : 'text/html'
      response.writeHead(200, { 'content-type': type }).end(readFileSync(join(dir, name)))
    } catch {
      response.writeHead(404).end()
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

interface Watched {
  errors: string[]
  requests: string[]
}

function watch(page: Page): Watched {
  const seen: Watched = { errors: [], requests: [] }
  page.on('pageerror', (error) => seen.errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') seen.errors.push(message.text())
  })
  page.on('request', (request) => seen.requests.push(request.url()))
  return seen
}

function write(name: string, html: string): string {
  const dir = test.info().outputDir
  mkdirSync(dir, { recursive: true })
  copyFileSync(BUNDLE, join(dir, 'vui.min.js'))
  writeFileSync(join(dir, name), html)
  return dir
}

const fileUrl = (dir: string, name: string) => `file://${join(dir, name)}`

async function paint(page: Page) {
  return page.evaluate(() => ({
    canvas: getComputedStyle(document.documentElement).backgroundColor,
    text: getComputedStyle(document.querySelector('.vui-root') as Element).color,
    width: (document.querySelector('.vui-root') as HTMLElement).getBoundingClientRect().width,
    grown: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
}

/** One pixel of `color`, drawn in a blank page so both shots go through the same encoder. */
async function solidPixel(page: Page, color: string): Promise<Buffer> {
  const other = await page.context().newPage()
  await other.setContent(`<style>html{background:${color}}</style>`)
  const shot = await other.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
  await other.close()
  return shot
}

const CANVAS = { light: 'rgb(255, 255, 255)', dark: 'rgb(10, 10, 10)' }
const TEXT = { light: 'rgb(23, 23, 23)', dark: 'rgb(237, 237, 237)' }

for (const [kind, build] of Object.entries(PAGES)) {
  for (const colorScheme of ['light', 'dark'] as Scheme[]) {
    for (const width of [360, 720, 1100]) {
      test(`${kind} page, ${colorScheme}, ${width} px: same in both URL schemes`, async ({
        page,
      }) => {
        const dir = write('page.html', build(canonical(REPORT)))
        const server = await serve(dir)
        const seen = watch(page)
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width, height: 900 })

        const views = []
        const { port } = server.address() as AddressInfo
        for (const url of [fileUrl(dir, 'page.html'), `http://127.0.0.1:${port}/page.html`]) {
          await page.goto(url)
          await expect(page.locator('.vui-root .vui-table-box')).toBeVisible()
          await expect(page.locator('.vui-root svg')).not.toHaveCount(0)
          await expect(page.locator('.vui-card-error')).toHaveCount(0)
          views.push({
            dom: await page.locator('.vui-root').evaluate((root) => root.outerHTML),
            shot: await page.screenshot({ animations: 'disabled', fullPage: true }),
            paint: await paint(page),
          })
        }
        server.close()

        const [file, http] = views as [(typeof views)[0], (typeof views)[0]]
        expect(file.dom).toBe(http.dom)
        expect(file.shot.equals(http.shot)).toBe(true)
        expect(file.paint.canvas).toBe(CANVAS[colorScheme])
        expect(file.paint.text).toBe(TEXT[colorScheme])
        expect(file.paint.width).toBeGreaterThan(width - 40)
        expect(file.paint.grown).toBe(0)
        expect(seen.errors).toEqual([])
        const allowed = [`file://${dir}/`, `http://127.0.0.1:${port}/`]
        const elsewhere = seen.requests.filter(
          (url) => !allowed.some((origin) => url.startsWith(origin)),
        )
        expect(elsewhere).toEqual([])
      })
    }
  }
}

test.describe('theme on a bare page', () => {
  const cases: [string, string, Scheme, Scheme][] = [
    ['.dark on a light OS', '<html class="dark">', 'light', 'dark'],
    ['.light on a dark OS', '<html class="light">', 'dark', 'light'],
    ['an empty class on a dark OS', '<html class="">', 'dark', 'light'],
  ]
  for (const [name, html, colorScheme, expected] of cases) {
    test(name, async ({ page }) => {
      const dir = write('page.html', inlinePage(canonical(REPORT), html))
      await page.emulateMedia({ colorScheme })
      await page.goto(fileUrl(dir, 'page.html'))
      const { canvas, text } = await paint(page)
      expect(canvas).toBe(CANVAS[expected])
      expect(text).toBe(TEXT[expected])
    })
  }

  for (const element of ['html', 'body']) {
    test(`a ${element} background of the page's own wins`, async ({ page }) => {
      const css = `<html><style>${element}{background:rgb(1, 2, 3)}</style>`
      const dir = write('page.html', inlinePage(canonical(REPORT), css))
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.setViewportSize({ width: 720, height: 3000 })
      await page.goto(fileUrl(dir, 'page.html'))
      const shot = await page.screenshot({ clip: { x: 0, y: 2990, width: 1, height: 1 } })
      expect(shot.equals(await solidPixel(page, 'rgb(1, 2, 3)'))).toBe(true)
    })
  }
})

test.describe('boot', () => {
  test('window.VUI holds render and version, and render works by hand', async ({ page }) => {
    const dir = write('page.html', inlinePage(canonical(REPORT)))
    await page.goto(fileUrl(dir, 'page.html'))
    const result = await page.evaluate(() => {
      const box = document.createElement('div')
      document.body.append(box)
      const { VUI } = window as unknown as { VUI: { render: Render; version: string } }
      VUI.render('{ vui: 1, body: [{ type: "md", text: "by hand" }] }', box)
      return { keys: Object.keys(VUI).sort(), version: VUI.version, text: box.textContent }
    })
    const manifest = new URL('../packages/ui/package.json', import.meta.url)
    expect(result.keys).toEqual(['render', 'version'])
    expect(result.version).toBe(JSON.parse(readFileSync(manifest, 'utf8')).version)
    expect(result.text).toContain('by hand')
  })

  test('adds no global listener beyond its one DOMContentLoaded', async ({ page }) => {
    await page.addInitScript(() => {
      const added: string[] = []
      ;(window as unknown as { added: string[] }).added = added
      for (const [name, host] of [
        ['window', window],
        ['document', document],
      ] as const) {
        const original = host.addEventListener.bind(host)
        host.addEventListener = ((type: string, ...rest: never[]) => {
          added.push(`${name}:${type}`)
          return (original as (...args: unknown[]) => void)(type, ...rest)
        }) as typeof host.addEventListener
      }
    })
    const dir = write('page.html', inlinePage(canonical(REPORT)))
    await page.goto(fileUrl(dir, 'page.html'))
    await expect(page.locator('.vui-root .vui-table-box')).toBeVisible()
    await page.getByRole('tab', { name: 'Two' }).click()
    const added = await page.evaluate(() => (window as unknown as { added: string[] }).added)
    expect(added).toEqual(['document:DOMContentLoaded'])
  })

  test('runs at once when loaded after the page, and twice adds nothing', async ({ page }) => {
    const html = `<!doctype html><meta charset="utf-8"><body>${embedded(canonical(REPORT))}</body>`
    const dir = write('page.html', html)
    await page.goto(fileUrl(dir, 'page.html'))
    await expect(page.locator('.vui-root')).toHaveCount(0)
    for (let copy = 0; copy < 2; copy += 1) await page.addScriptTag({ path: BUNDLE })
    await expect(page.locator('.vui-root')).toHaveCount(1)
    await expect(page.locator('style#vui-style')).toHaveCount(1)
  })

  test('a broken, an empty and a good document on one page', async ({ page }) => {
    const lines = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`).join('\n')
    const html = `<!doctype html><meta charset="utf-8"><script>${bundleText()}</script><body>
${embedded(`${lines}<img src=x onerror=window.pwned=1>`)}
${embedded('')}
${embedded(canonical(REPORT))}
</body>`
    const dir = write('page.html', html)
    const seen = watch(page)
    await page.goto(fileUrl(dir, 'page.html'))
    const roots = page.locator('.vui-root')
    await expect(roots).toHaveCount(3)
    await expect(page.locator('style#vui-style')).toHaveCount(1)
    await expect(roots.nth(0).locator('.vui-card-error')).toContainText('line 40')
    await expect(roots.nth(0).locator('pre')).not.toContainText('line 41')
    await expect(roots.nth(1).locator('.vui-card-error')).toBeVisible()
    await expect(roots.nth(2).locator('.vui-card-error')).toHaveCount(0)
    await expect(roots.nth(2).locator('.vui-table-box')).toBeVisible()
    expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
    expect(seen.errors).toEqual([])
  })

  test('a script close in a document stays inside its element', async ({ page }) => {
    const text = canonical({ vui: 1, body: [{ type: 'md', text: '</script><b>x</b>' }] })
    const dir = write('page.html', inlinePage(text))
    await page.goto(fileUrl(dir, 'page.html'))
    await expect(page.locator('.vui-root')).toContainText('</script><b>x</b>')
  })

  test('a link opens the tab and fold that hide its target', async ({ page }) => {
    const dir = write('page.html', inlinePage(canonical(REPORT)))
    await page.setViewportSize({ width: 720, height: 400 })
    await page.goto(fileUrl(dir, 'page.html'))
    await expect(page.locator('#deep')).toBeHidden()
    await page.getByRole('link', { name: 'details' }).click()
    await expect(page.locator('#deep')).toBeInViewport()
    expect(page.url().endsWith('#deep')).toBe(true)
  })
})

test('the ESM build runs in a browser with no bundler, and mounts only when asked', async ({
  page,
}) => {
  const html = `<!doctype html><meta charset="utf-8"><body>${embedded(canonical(REPORT))}</body>`
  const dir = write('page.html', html)
  copyFileSync(ESM, join(dir, 'index.js'))
  const server = await serve(dir)
  const seen = watch(page)
  await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/page.html`)
  const before = await page.evaluate(async () => {
    const url = new URL('index.js', location.href).href
    const esm = await import(url)
    const untouched = document.querySelectorAll('.vui-root, #vui-style').length === 0
    esm.boot()
    return { keys: Object.keys(esm).sort(), untouched, global: 'VUI' in window }
  })
  server.close()
  expect(before.untouched).toBe(true)
  expect(before.global).toBe(false)
  expect(before.keys).toEqual(['boot', 'packageName', 'render', 'stylesheet', 'version'])
  await expect(page.locator('.vui-root .vui-table-box')).toBeVisible()
  expect(seen.errors).toEqual([])
})

test('the bundle runs inline in the Orca shell with no CSP violation', async ({ page }) => {
  const html = `<body>${embedded(canonical(REPORT))}<script>${bundleText()}</script></body>`
  const opened = await openVisual(page, { input: null, html }, 'dark', 720)
  await expect(opened.frame.locator('.vui-root .vui-table-box')).toBeVisible()
  expect(opened.console.filter((line) => /Content Security Policy/i.test(line))).toEqual([])
  expect(opened.requests.filter((url) => !url.startsWith('http://orca-host.test/'))).toEqual([])
  const height = await opened.frame.locator('.vui-root').evaluate((root) => root.scrollHeight)
  await expect.poll(() => opened.lastReport()).toBeGreaterThanOrEqual(height)
  await opened.frame.getByRole('link', { name: 'details' }).click()
  await expect(opened.frame.locator('#deep')).toBeVisible()
  const color = () =>
    opened.frame.locator('.vui-root').evaluate((root) => getComputedStyle(root).color)
  const dark = await color()
  await opened.switchTheme('light')
  await expect.poll(color).not.toBe(dark)
})

// VD-182: the ext tier ships in `vui-ext.min.js`, a whole boot script of its own, which a
// writer embeds in place of `vui.min.js` for a document that uses that tier.
test.describe('vui-ext.min.js', () => {
  const EXT_BUNDLE = fileURLToPath(new URL('../packages/ui/dist/vui-ext.min.js', import.meta.url))
  const EXT_DOC = {
    vui: 1,
    body: [
      {
        type: 'compare',
        options: ['A', 'B'],
        criteria: [{ label: 'p95', values: [80, 120], format: 'ms', better: 'low' }],
      },
      {
        type: 'chart',
        kind: 'scatter',
        points: [
          [1, 2, 'a'],
          [3, 5],
        ],
      },
      { type: 'flow', nodes: ['plan', 'build'], edges: [['plan', 'build']] },
      { type: 'chart', kind: 'bar', x: ['a'], series: { n: [1] } },
    ],
  }
  const page = (script: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ext</title>
${script}
</head><body>
${embedded(canonical(EXT_DOC))}
</body></html>`

  test('draws every ext component, inline and from a script URL, offline', async ({
    page: tab,
  }) => {
    const dir = test.info().outputDir
    mkdirSync(dir, { recursive: true })
    copyFileSync(EXT_BUNDLE, join(dir, 'vui-ext.min.js'))
    const inline = `<script>${readFileSync(EXT_BUNDLE, 'utf8')}</script>`
    writeFileSync(join(dir, 'inline.html'), page(inline))
    writeFileSync(join(dir, 'cdn.html'), page('<script src="vui-ext.min.js"></script>'))
    const seen = watch(tab)
    for (const name of ['inline.html', 'cdn.html']) {
      await tab.goto(fileUrl(dir, name))
      await expect(tab.locator('.vui-compare .vui-compare-win')).toHaveCount(2)
      await expect(tab.locator('.vui-chart[data-vui-kind="scatter"] .vui-chart-dot')).toHaveCount(1)
      await expect(tab.locator('.vui-flow .vui-flow-box')).toHaveCount(2)
      await expect(tab.locator('.vui-chart[data-vui-kind="bar"]')).toHaveCount(1)
      await expect(tab.locator('.vui-card-placeholder, .vui-card-error')).toHaveCount(0)
      expect(
        await tab.evaluate(() => Object.keys((window as unknown as { VUI: object }).VUI).sort()),
      ).toEqual(['render', 'version'])
    }
    expect(seen.errors).toEqual([])
    expect(seen.requests.filter((url) => !url.startsWith(`file://${dir}/`))).toEqual([])
  })

  test('the core bundle shows the §9.3 placeholder for the same document', async ({
    page: tab,
  }) => {
    const dir = write('core.html', page(`<script>${bundleText()}</script>`))
    await tab.goto(fileUrl(dir, 'core.html'))
    await expect(tab.locator('.vui-card-placeholder')).toHaveCount(3)
    await expect(tab.locator('.vui-chart[data-vui-kind="bar"]')).toHaveCount(1)
  })
})
