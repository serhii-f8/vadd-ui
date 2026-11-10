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
  NODE_IDS,
  PAYLOADS,
  poison,
  type Scan,
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

const types = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) for (const item of value) types(item, found)
  else if (typeof value === 'object' && value !== null) {
    const { type } = value as { type?: unknown }
    if (typeof type === 'string') found.add(type)
    for (const item of Object.values(value)) types(item, found)
  }
  return found
}

/**
 * The payload is in the text as itself, or as the JSON a §9.3 placeholder prints: `compare`
 * and `flow` are placeholders until task 22, and show their raw node.
 */
function holds(text: string, payload: string): boolean {
  return (
    comparable(text).includes(comparable(payload)) ||
    text.includes(JSON.stringify(payload).slice(1, -1))
  )
}

/** Everything wrong with one rendered page, as readable lines. Empty when it is safe. */
function problems(seen: Scan, ran: string[], payload: string, mode: Mode): string[] {
  const found = [...ran, ...seen.unsafe]
  if (mode === 'all') return found
  const shows = (text: string) => holds(text, payload)
  if (!shows(seen.text)) found.push('payload text missing from the page')
  for (const id of NODE_IDS) {
    const texts = seen.byId[id] ?? []
    if (texts.length === 0) found.push(`#${id} not rendered`)
    if (!texts.every(shows)) found.push(`#${id} lost it`)
  }
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
  return html.slice(start, html.lastIndexOf('</script>'))
}

/** §15.3 allows 20 writes a second, so a refused write waits out the window once. */
async function post(viewer: LiveViewer, document: object): Promise<string> {
  try {
    return await postDoc(viewer, document)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    return postDoc(viewer, document)
  }
}

async function inShell(page: Page, html: string): Promise<Frame> {
  const { frame } = await openVisual(page, { input: null, html }, 'light', WIDTH)
  return frame
}

test('the template holds every component, and each payload leaves it valid in text mode', () => {
  expect([...types(TEMPLATE.body)].sort()).toEqual([...COMPONENT_TYPES].sort())
  for (const payload of PAYLOADS) {
    const document = poison(TEMPLATE, payload, 'text')
    expect(JSON.stringify(document)).not.toContain('{p}')
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
        '<iframe></iframe>',
        '<b style="background:url(x)">d</b>',
      ].join('')
      root.append(document.createElement('script'))
    })
    await expect.poll(() => ran.length).toBeGreaterThan(0)
    expect(ran.some((line) => line.startsWith('dialog alert'))).toBe(true)
    const { unsafe } = await scan(page.mainFrame(), 0)
    expect(unsafe).toEqual([
      'img src="x"',
      'img onerror="alert(1)"',
      'a href=" javascript:alert(1)"',
      'a href="https://example.com/" without rel=noopener',
      'a xlink:href="data:text/html,x"',
      'iframe element',
      'b style="background:url(x)"',
      'script inside a rendered root',
      '1 script elements, expected 0',
    ])
  })

  test('a call in the sandboxed Orca frame, where alert is mute, still tells', async ({ page }) => {
    const ran = await watchExecution(page)
    await inShell(page, '<div class="vui-doc"></div><img src=x onerror="alert(1)">')
    await expect.poll(() => ran).toEqual(['vui-xss-ran alert(1)'])
  })

  test('a page that drops the payload fails the text check', () => {
    const seen: Scan = { unsafe: [], text: 'nothing here', byId: {} }
    const found = problems(seen, [], '<b>x</b>', 'text')
    expect(found).toContain('payload text missing from the page')
    expect(found).toContain('#x-md not rendered')
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
      await page.goto(pathToFileURL(path).href)
      await page.locator('.vui-doc').waitFor({ state: 'attached' })
      const file = await scan(page.mainFrame(), OWN_SCRIPTS.file)
      expect.soft(problems(file, ran.splice(0), payload, 'text'), 'file').toEqual([])

      // The same file inside Orca's sandboxed frame and CSP.
      const shell = await scan(await inShell(page, html), OWN_SCRIPTS.shell)
      expect.soft(problems(shell, ran.splice(0), payload, 'text'), 'shell, text').toEqual([])

      // Every string and key poisoned, valid or not: the CLI refuses it, a hand-written file
      // does not, so the real bundle meets it through the inline file's own escaping.
      const bundle = readFileSync(BUNDLE, 'utf8')
      const all = inlineHtml(poison(TEMPLATE, payload, 'all') as never, { bundle, generator: 'x' })
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

  test('the feed shows every poisoned document, title, branch and cwd included', async ({
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

    const entries = await page.evaluate(() =>
      [...document.querySelectorAll('.feed-entry')].map((entry) => {
        const host = entry.querySelector('.feed-body')
        const head = entry.querySelector('.feed-head')
        const ids: Record<string, string> = {}
        for (const element of host?.shadowRoot?.querySelectorAll('[id]') ?? []) {
          ids[element.id] = element.textContent ?? ''
        }
        return {
          title: entry.querySelector('.feed-title')?.textContent ?? '',
          branch: head?.querySelector('.feed-branch')?.textContent ?? '',
          cwd: head?.querySelector('.feed-cwd')?.textContent ?? '',
          ids,
        }
      }),
    )
    const lost: string[] = []
    PAYLOADS.forEach((payload, index) => {
      // The feed lists documents in the order they were written.
      const wanted = comparable(payload)
      const entry = entries[index]
      if (entry === undefined || comparable(entry.title) !== wanted) {
        lost.push(`${index}: entry ${index} is not titled with it`)
        return
      }
      if (comparable(entry.branch) !== wanted) lost.push(`${index}: branch`)
      if (comparable(entry.cwd) !== wanted) lost.push(`${index}: cwd`)
      for (const id of NODE_IDS) {
        if (!holds(entry.ids[id] ?? '', payload)) lost.push(`${index}: #${id}`)
      }
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
