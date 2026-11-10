import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, type Frame, type Page, test } from '@playwright/test'
import { COMPONENT_TYPES, validate } from '../packages/ui-spec/src/index.js'
import { inlineHtml } from '../packages/ui-viewer/src/visual-file.js'
import { openVisual } from './harness/host.js'
import { type LiveViewer, launchViewer, postDoc } from './harness/viewer.js'
import {
  comparable,
  type Mode,
  PAYLOADS,
  poison,
  type Scan,
  SLOTS,
  type Slot,
  scan,
  TEMPLATE,
  watchExecution,
} from './harness/xss.js'

// §16 Security: every payload in every text field, through every path a document renders by,
// and nothing runs. The CLI file has no CSP of its own, so it is the renderer's own proof.

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../packages/ui/dist/vui.min.js', import.meta.url))
const WIDTH = 720

/** The `script` elements each page holds by itself, before any document. */
const OWN_SCRIPTS = { file: 2, shell: 3, feed: 1, standalone: 2 }

/**
 * Slots whose text is not shown by design, and why. Every other slot's payload, with its
 * marker, must be on the page as text.
 */
const SILENT: Record<string, string> = {
  // Only the Viewer feed shows them (§4.1); the shared page drops them (VD-161). The feed
  // test checks them.
  '/meta/branch': 'feed only',
  '/meta/cwd': 'feed only',
  // A link's target is its `href`, not text, whenever the URL is safe.
  '#x-md/text (slot 5)': 'link target',
  // An object column's `key` is how object rows name it (§6.6); its `label` is shown.
  '#x-table/columns/2/key': 'column key',
  '#x-table/columns/3/key': 'column key',
  '#x-table/columns/6/key': 'column key',
}

/**
 * Slots in a §9.3 placeholder, which shows its raw node as JSON: `compare` and `flow` until
 * task 22, and `scatter`, which `vui.min.js` does not draw (§6.4 tier `ext`).
 */
const PLACEHOLDER = /^#x-(compare|flow|chart-scatter)\b|^@(a|b)$/

/** Slots in a `tree`'s `paths`, which split at `/` into one item per segment (§6.5). */
const SPLIT = /^#x-tree-paths\/paths\//

const types = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) for (const item of value) types(item, found)
  else if (typeof value === 'object' && value !== null) {
    const { type } = value as { type?: unknown }
    if (typeof type === 'string') found.add(type)
    for (const item of Object.values(value)) types(item, found)
  }
  return found
}

/** The slot's payload with its marker is in the text: as itself, by segment, or as JSON. */
function shows(text: string, payload: string, slot: Slot): boolean {
  const marked = payload + slot.marker
  const seen = comparable(text)
  if (SPLIT.test(slot.where)) {
    return marked.split('/').every((part) => seen.includes(comparable(part)))
  }
  if (seen.includes(comparable(marked))) return true
  return PLACEHOLDER.test(slot.where) && text.includes(JSON.stringify(marked).slice(1, -1))
}

/** The slots of `text` mode whose payload is not in `text`. */
function missing(text: string, payload: string, silent = SILENT): string[] {
  return SLOTS.filter((slot) => !(slot.where in silent) && !shows(text, payload, slot)).map(
    ({ where }) => `${where} not shown`,
  )
}

/** Everything wrong with one rendered page, as readable lines. Empty when it is safe. */
function problems(seen: Scan, ran: string[], payload: string, mode: Mode): string[] {
  const found = [...ran, ...seen.unsafe]
  if (mode === 'text') return [...found, ...missing(seen.text, payload)]
  // Every string is the payload, so it shows at least as the title and the unknown node.
  if (!comparable(seen.text).includes(comparable(payload))) found.push('payload not shown')
  return found
}

function cliFile(document: object, name: string): { path: string; html: string } {
  const input = test.info().outputPath(`${name}.vui.json`)
  const path = test.info().outputPath(`${name}.html`)
  writeFileSync(input, JSON.stringify(document))
  execFileSync(process.execPath, [BIN, 'render', input, '--format', 'html', '--out', path], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  return { path, html: readFileSync(path, 'utf8') }
}

/** The JSON the CLI embedded, as the file spells it (§15.1). */
function embedded(html: string): string {
  const open = '<script type="application/vui+json">'
  const start = html.indexOf(open) + open.length
  return html.slice(start, html.indexOf('</script>', start))
}

/** §15.3 allows 20 writes a second, so a write refused for that waits out the window once. */
async function post(viewer: LiveViewer, document: object): Promise<string> {
  try {
    return await postDoc(viewer, document)
  } catch (error) {
    if (!String(error).includes('429')) throw error
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    return postDoc(viewer, document)
  }
}

async function inShell(page: Page, html: string): Promise<Frame> {
  const { frame } = await openVisual(page, { input: null, html }, 'light', WIDTH)
  return frame
}

async function inFile(page: Page, path: string): Promise<Frame> {
  await page.goto(pathToFileURL(path).href)
  await page.locator('.vui-doc').waitFor({ state: 'attached' })
  return page.mainFrame()
}

test('the template holds every component, and each payload leaves it valid in text mode', () => {
  expect([...types(TEMPLATE.body)].sort()).toEqual([...COMPONENT_TYPES].sort())
  expect(SLOTS.length).toBe(181)
  for (const payload of PAYLOADS) {
    const document = poison(TEMPLATE, payload, 'text')
    const json = JSON.stringify(document)
    expect(json).not.toMatch(/\{p[@}]/)
    for (const { marker } of SLOTS)
      expect(json).toContain(JSON.stringify(payload + marker).slice(1, -1))
    const errors = validate(document as never).diagnostics.filter(
      ({ severity }) => severity === 'error',
    )
    expect(errors, JSON.stringify(payload)).toEqual([])
  }
})

test.describe('controls: the oracle can fail', () => {
  test('a payload set by innerHTML raises the dialog and every finding', async ({ page }) => {
    const ran = await watchExecution(page)
    await page.setContent('<!doctype html><body><div class="vui-root"></div></body>')
    await page.evaluate(() => {
      const root = document.querySelector('.vui-root') as HTMLElement
      // The unsafe page the oracle exists to catch.
      root.innerHTML = [
        '<img src=x onerror=alert(1)>',
        '<a href=" javascript:alert(1)">a</a>',
        '<a href="https://example.com/">b</a>',
        '<svg><a xlink:href="data:text/html,x"><text>c</text></a></svg>',
        '<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="x" to="1"/></svg>',
        '<iframe></iframe>',
        '<b style="background:url(x)">d</b>',
        '<style>b{}</style><meta name="x" content="y"><link rel="x" href="https://example.com/">',
      ].join('')
      root.append(document.createElement('script'))
    })
    await expect.poll(() => ran.some((line) => line.startsWith('dialog alert'))).toBe(true)
    const { unsafe } = await scan(page.mainFrame(), 0)
    expect(unsafe).toEqual([
      'img src="x"',
      'img onerror="alert(1)"',
      'a href=" javascript:alert(1)"',
      'a href="https://example.com/" without rel=noopener',
      'a xlink:href="data:text/html,x"',
      'animate element',
      'animate attributeName="href"',
      'animate to="javascript:alert(1)"',
      'set element',
      'iframe element',
      'b style="background:url(x)"',
      'style inside a rendered root',
      'meta inside a rendered root',
      'link inside a rendered root',
      'script inside a rendered root',
      '1 script elements, expected 0',
    ])
  })

  test('a page error is a finding', async ({ page }) => {
    const ran = await watchExecution(page)
    await page.setContent('<!doctype html><script>throw new Error("boom")</script>')
    await expect.poll(() => ran).toEqual(['pageerror: boom'])
  })

  test('a call in the sandboxed Orca frame, where alert is mute, still tells', async ({ page }) => {
    const ran = await watchExecution(page)
    await inShell(page, '<div class="vui-doc"></div><img src=x onerror="alert(1)">')
    await expect.poll(() => ran).toEqual(['vui-xss-ran alert(1)'])
  })

  test('a page that drops one field, or the payload, fails the text check', () => {
    const payload = '<b>x</b>'
    const all = SLOTS.map(({ marker }) => payload + marker).join(' ')
    expect(missing(all, payload)).toEqual([])
    const one = SLOTS.find(({ where }) => where === '#x-decision/options/0/pros/0') as Slot
    expect(missing(all.replace(payload + one.marker, ''), payload)).toEqual([
      '#x-decision/options/0/pros/0 not shown',
    ])
    const seen: Scan = { unsafe: [], text: 'nothing here' }
    expect(problems(seen, [], payload, 'all')).toEqual(['payload not shown'])
  })
})

test.describe('each payload', () => {
  test.describe.configure({ mode: 'parallel' })

  PAYLOADS.forEach((payload, index) => {
    test(`payload ${index} ${JSON.stringify(payload).slice(0, 40)}: CLI file and Orca shell`, async ({
      page,
    }) => {
      const ran = await watchExecution(page)
      const text = poison(TEMPLATE, payload, 'text')
      const { path, html } = cliFile(text, `xss-${index}`)

      const json = embedded(html)
      expect(json).not.toMatch(/<\/script|<!--|[\u2028\u2029]/i)
      expect(JSON.parse(json).title).toBe(text.title)

      // The file as a user opens it: no CSP at all, so only the renderer stands in the way.
      const file = await scan(await inFile(page, path), OWN_SCRIPTS.file)
      expect.soft(problems(file, ran.splice(0), payload, 'text'), 'file').toEqual([])

      // The same file inside Orca's sandboxed frame and CSP.
      const shell = await scan(await inShell(page, html), OWN_SCRIPTS.shell)
      expect.soft(problems(shell, ran.splice(0), payload, 'text'), 'shell, text').toEqual([])

      // Every string and key poisoned, valid or not: the CLI refuses it, a hand-written file
      // does not, so the real bundle meets it in the inline file `inlineHtml` writes, opened
      // with no CSP and in the shell.
      const bundle = readFileSync(BUNDLE, 'utf8')
      const all = inlineHtml(poison(TEMPLATE, payload, 'all') as never, { bundle, generator: 'x' })
      const allPath = test.info().outputPath(`xss-${index}-all.html`)
      writeFileSync(allPath, all)
      const fileAll = await scan(await inFile(page, allPath), OWN_SCRIPTS.file)
      expect.soft(problems(fileAll, ran.splice(0), payload, 'all'), 'file, all').toEqual([])
      const shellAll = await scan(await inShell(page, all), OWN_SCRIPTS.shell)
      expect.soft(problems(shellAll, ran.splice(0), payload, 'all'), 'shell, all').toEqual([])
    })
  })
})

test.describe('a running Viewer', () => {
  let viewer: LiveViewer
  const ids: string[] = []

  test.beforeAll(async () => {
    viewer = await launchViewer()
    for (const payload of PAYLOADS) ids.push(await post(viewer, poison(TEMPLATE, payload, 'text')))
  })

  test.afterAll(async () => {
    await viewer.stop()
  })

  test('the feed shows every field of every poisoned document, branch and cwd included', async ({
    page,
  }) => {
    const ran = await watchExecution(page)
    await page.goto(viewer.base)
    const articles = page.getByRole('article')
    await expect(articles).toHaveCount(PAYLOADS.length)
    // Only the newest ten start open; a clicked button is renamed, so take the first each time.
    const unfold = page.getByRole('button', { name: 'Unfold' })
    while ((await unfold.count()) > 0) await unfold.first().click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.querySelectorAll('.feed-body')].filter((host) =>
              host.shadowRoot?.querySelector('.vui-doc'),
            ).length,
        ),
      )
      .toBe(PAYLOADS.length)
    const seen = await scan(page.mainFrame(), OWN_SCRIPTS.feed)
    expect([...ran, ...seen.unsafe]).toEqual([])

    // Each entry's own text: its header, then its document's shadow root.
    const entries = await page.evaluate(() => {
      const textOf = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
        if (node instanceof Element && ['script', 'style'].includes(node.localName)) return ''
        let text = ''
        // As `scan` reads it: a tooltip counts.
        const title = node instanceof Element ? node.getAttribute('title') : null
        if (title !== null) text += ` ${title} `
        if (node instanceof Element && node.shadowRoot) text += textOf(node.shadowRoot)
        for (const child of node.childNodes) text += textOf(child)
        return text
      }
      return [...document.querySelectorAll('.feed-entry')].map((entry) => ({
        title: entry.querySelector('.feed-title')?.textContent ?? '',
        text: textOf(entry),
      }))
    })
    const { '/meta/branch': _branch, '/meta/cwd': _cwd, ...silent } = SILENT
    const lost: string[] = []
    PAYLOADS.forEach((payload, index) => {
      // The feed lists documents in the order they were written.
      const entry = entries[index]
      const title = SLOTS.find(({ where }) => where === '/title') as Slot
      if (entry === undefined || comparable(entry.title) !== comparable(payload + title.marker)) {
        lost.push(`${index}: entry ${index} is not titled with it`)
        return
      }
      for (const line of missing(entry.text, payload, silent)) lost.push(`${index}: ${line}`)
    })
    expect(lost).toEqual([])
  })

  test('each standalone page runs nothing and shows every field', async ({ page }) => {
    const ran = await watchExecution(page)
    const found: string[] = []
    for (const [index, payload] of PAYLOADS.entries()) {
      await page.goto(`${viewer.base}docs/${ids[index]}.html`)
      await page.locator('.vui-doc').waitFor({ state: 'attached' })
      const seen = await scan(page.mainFrame(), OWN_SCRIPTS.standalone)
      for (const line of problems(seen, ran.splice(0), payload, 'text')) {
        found.push(`${index}: ${line}`)
      }
    }
    expect(found).toEqual([])
  })
})
