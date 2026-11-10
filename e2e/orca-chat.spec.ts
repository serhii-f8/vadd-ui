import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import {
  directiveLine,
  isVisualFileName,
  ORCA_CDN_ORIGINS,
  ORCA_DIRECTIVE_MARKER,
  ORCA_DIRECTIVE_MAX_LINE,
  ORCA_FILE_MAX,
  ORCA_FILE_MAX_BYTES,
  ORCA_FRAME_MAX_HEIGHT,
  ORCA_FRAME_MIN_HEIGHT,
  ORCA_THEME_TOKENS,
  ORCA_TITLE_MAX,
  ORCA_VISUALS_PER_REPLY,
  parseDirectiveLine,
} from '../packages/ui-spec/src/host/orca.js'
import { axeSerious } from './harness/axe.js'
import { openVisual, settled } from './harness/host.js'
import {
  isNativeChatVisualFileName,
  NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER,
  NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH,
  NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH,
  NATIVE_CHAT_VISUAL_MAX_BYTES,
  NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE,
  NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH,
  parseNativeChatVisualDirectiveLine,
} from './harness/orca/src/shared/native-chat/native-chat-visual-directive.js'
import {
  NATIVE_CHAT_VISUAL_CDN_ORIGINS,
  NATIVE_CHAT_VISUAL_MAX_HEIGHT,
  NATIVE_CHAT_VISUAL_MIN_HEIGHT,
  NATIVE_CHAT_VISUAL_THEME_TOKENS,
} from './harness/orca/src/shared/native-chat/native-chat-visual-shell.js'

// Orca Chat UI does not run on this machine (WSL), so this is the proof: the real CLI's real
// files, in Orca's own document builder, in a sandboxed frame, read by Orca's own parser.

const BIN = fileURLToPath(new URL('../packages/ui-cli/dist/bin.js', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../packages/ui/dist/vui.min.js', import.meta.url))
const CDN = 'https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js'
const WIDTHS = [360, 720, 1100]
const SCHEMES = ['light', 'dark'] as const

const DOC = {
  title: 'Catalog query latency',
  body: [
    { type: 'md', text: 'p95 **halved** after the [index](https://example.test/) landed.' },
    {
      type: 'table',
      columns: [
        { key: 'q', label: 'Query' },
        { key: 'ms', label: 'ms', format: 'ms' },
      ],
      rows: [
        ['list', 41],
        ['search', 88],
      ],
    },
    { type: 'md', title: 'Folded', fold: 'closed', text: 'Revealed.' },
  ],
}

const places: string[] = []

test.afterEach(() => {
  for (const place of places.splice(0)) rmSync(place, { recursive: true, force: true })
})

function place(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vui-e2e-chat-'))
  places.push(dir)
  return dir
}

function env(dir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const entries = Object.entries(process.env).filter(
    ([name]) => !name.startsWith('ORCA_') && !name.startsWith('VUI_'),
  )
  return { ...Object.fromEntries(entries), XDG_STATE_HOME: join(dir, 'state'), ...extra }
}

function vui(cwd: string, argv: string[], environment: NodeJS.ProcessEnv, input = '') {
  const { status, stdout, stderr } = spawnSync(process.execPath, [BIN, ...argv], {
    cwd,
    env: environment,
    input,
    encoding: 'utf8',
  })
  return { status, stdout, stderr }
}

function chatShow(document: unknown) {
  const dir = place()
  const scratch = mkdtempSync(join(dir, 'scratch-'))
  const result = vui(
    dir,
    ['show'],
    env(dir, { ORCA_CHAT_SCRATCH_DIR: scratch }),
    JSON.stringify(document),
  )
  const names = readdirSync(scratch)
  return { ...result, dir, scratch, names, file: join(scratch, names[0] ?? '') }
}

const cspErrors = (lines: string[]) =>
  lines.filter((line) => /Content Security Policy|Refused/i.test(line))
const foreign = (urls: string[]) =>
  urls.filter((url) => !/^(?:http:\/\/orca-host\.test\/|about:|data:|blob:)/.test(url))

test.describe('the pinned contract', () => {
  test('equals the Orca sources', () => {
    expect(ORCA_DIRECTIVE_MARKER).toBe(NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER)
    expect(ORCA_DIRECTIVE_MAX_LINE).toBe(NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH)
    expect(ORCA_FILE_MAX).toBe(NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH)
    expect(ORCA_TITLE_MAX).toBe(NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH)
    expect(ORCA_VISUALS_PER_REPLY).toBe(NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE)
    expect(ORCA_FILE_MAX_BYTES).toBe(NATIVE_CHAT_VISUAL_MAX_BYTES)
    expect(ORCA_FRAME_MIN_HEIGHT).toBe(NATIVE_CHAT_VISUAL_MIN_HEIGHT)
    expect(ORCA_FRAME_MAX_HEIGHT).toBe(NATIVE_CHAT_VISUAL_MAX_HEIGHT)
    expect([...ORCA_CDN_ORIGINS]).toEqual([...NATIVE_CHAT_VISUAL_CDN_ORIGINS])
    expect([...ORCA_THEME_TOKENS]).toEqual([...NATIVE_CHAT_VISUAL_THEME_TOKENS])
  })

  test('stays out of the bundle (VD-110)', () => {
    expect(readFileSync(BUNDLE, 'utf8')).not.toContain(ORCA_DIRECTIVE_MARKER)
  })

  test('the CDN URL is on the allowlist', () => {
    expect(ORCA_CDN_ORIGINS).toContain(new URL(CDN).origin as (typeof ORCA_CDN_ORIGINS)[number])
  })

  test('the port agrees with Orca on fuzzed lines and names', () => {
    let state = 2026
    const next = (limit: number) => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return Math.floor((state / 4294967296) * limit)
    }
    const pieces = [
      '::orca-visual{',
      'file="a.html"',
      'title="T"',
      'title=""',
      'file="con.html"',
      'x="1"',
      ' ',
      '  ',
      '\t',
      '}',
      '"',
      '\\',
      '\r',
      '\n',
      '\u0001',
      'a',
      '.html',
      '..',
      '-',
      'com1',
      '😀',
    ]
    let accepted = 0
    for (let run = 0; run < 20_000; run += 1) {
      const length = next(7)
      let line = ['', '::orca-visual{', '::orca-visual{file="a.html" '][next(3)]
      for (let index = 0; index < length; index += 1) line += pieces[next(pieces.length)]
      if (next(2) === 0) line += '}'
      const parsed = parseNativeChatVisualDirectiveLine(line)
      if (parsed !== null) accepted += 1
      expect(parseDirectiveLine(line), JSON.stringify(line)).toEqual(parsed)
      expect(isVisualFileName(line), JSON.stringify(line)).toBe(isNativeChatVisualFileName(line))
    }
    expect(accepted).toBeGreaterThan(200)
  })
})

test.describe('generated lines, read by Orca', () => {
  const titles = [
    'Plain',
    'x"}\n::orca-visual{file="evil.html" title="y',
    'a\\"b',
    '\u001b[2J\u202ertl',
    '😀'.repeat(200),
    '"""',
    'Тест — кирилиця',
    'con',
    '</script><img src=x onerror=alert(1)>',
  ]

  for (const title of titles) {
    test(`title ${JSON.stringify(title.slice(0, 24))}`, () => {
      const { status, stdout, names } = chatShow({ title, body: ['x'] })
      expect(status).toBe(0)
      expect(names).toHaveLength(1)
      const lines = stdout.split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[1]).toBe('')
      const parsed = parseNativeChatVisualDirectiveLine(lines[0] as string)
      expect(parsed?.file).toBe(names[0])
      expect(isNativeChatVisualFileName(names[0] as string)).toBe(true)
      expect(parsed?.title ?? '').not.toMatch(/["\\{}]/)
      expect(directiveLine({ file: names[0] as string, title })).toBe(lines[0])
    })
  }
})

async function checkInShell(page: Page, html: string, scheme: 'light' | 'dark', width: number) {
  const opened = await openVisual(page, { input: null, html }, scheme, width)
  await settled(opened)
  await expect(opened.frame.locator('.vui-title')).toHaveText(DOC.title)
  await expect(opened.frame.locator('.vui-root table')).toBeVisible()
  expect(cspErrors(opened.console)).toEqual([])
  expect(await opened.iframe.getAttribute('sandbox')).toBe('allow-scripts')
  const overflow = await opened.frame.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  expect(await axeSerious(opened.frame)).toEqual([])
  const content = await opened.frame
    .locator('.vui-root')
    .evaluate((node) => node.getBoundingClientRect().height)
  expect(
    Math.abs(((await opened.iframe.boundingBox())?.height ?? 0) - content),
  ).toBeLessThanOrEqual(1)
  return opened
}

test.describe('a generated file in the Orca shell', () => {
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      test(`${scheme} at ${width}`, async ({ page }) => {
        const { file, stderr } = chatShow(DOC)
        expect(stderr).toBe('')
        const opened = await checkInShell(page, readFileSync(file, 'utf8'), scheme, width)
        expect(foreign(opened.requests)).toEqual([])
        await page.screenshot({ path: test.info().outputPath(`chat-${scheme}-${width}.png`) })
      })
    }
  }

  test('a live theme switch and a fold still work', async ({ page }) => {
    const { file } = chatShow(DOC)
    const opened = await checkInShell(page, readFileSync(file, 'utf8'), 'light', 720)
    await opened.switchTheme('dark')
    await expect
      .poll(() => opened.frame.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true)
    await opened.frame.locator('.vui-fold-toggle').click()
    await expect(opened.frame.getByText('Revealed.')).toBeVisible()
  })

  test('hostile text stays text', async ({ page }) => {
    const title = '</script><img src=x onerror="window.__hit=1">'
    const { file } = chatShow({ title, body: [{ type: 'md', text: title }] })
    const html = readFileSync(file, 'utf8')
    const opened = await openVisual(page, { input: null, html }, 'light', 720)
    await settled(opened)
    expect(await opened.frame.evaluate(() => 'hit' in window || '__hit' in window)).toBe(false)
    expect(await opened.frame.locator('.vui-root img').count()).toBe(0)
  })
})

test.describe('vui render --cdn', () => {
  test('runs in the shell from the allowed CDN', async ({ page }) => {
    const dir = place()
    const out = join(dir, 'cdn.html')
    const result = vui(
      dir,
      ['render', '--format', 'html', '--cdn', '--out', out],
      env(dir),
      JSON.stringify(DOC),
    )
    expect(result.status).toBe(0)
    const html = readFileSync(out, 'utf8')
    expect(html.split('\n').slice(0, 2)).toEqual([
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>${DOC.title}</title>`,
      `<script src="${CDN}"></script>`,
    ])
    expect(html.split('\n')[2]).toMatch(/^<script type="application\/vui\+json">\{/)
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: readFileSync(BUNDLE, 'utf8') }),
    )
    const opened = await checkInShell(page, html, 'light', 720)
    expect(foreign(opened.requests)).toEqual([CDN])
  })
})

test('a running Viewer gets a copy with the path, and the file does not', async ({ page }) => {
  const dir = place()
  const scratch = mkdtempSync(join(dir, 'scratch-'))
  const environment = env(dir, { ORCA_CHAT_SCRATCH_DIR: scratch })
  expect(vui(dir, ['viewer', 'start'], environment).status).toBe(0)
  try {
    const shown = vui(dir, ['show', '--json'], environment, JSON.stringify(DOC))
    expect(shown.status).toBe(0)
    const { viewer, path } = JSON.parse(shown.stdout) as {
      path: string
      viewer: { state: string; url: string }
    }
    expect(viewer.state).toBe('posted')
    expect(readFileSync(path, 'utf8')).not.toContain(dir)
    const { stdout } = vui(dir, ['viewer', 'url'], environment)
    await page.goto(stdout.trim())
    await expect(page.getByText(DOC.title).first()).toBeVisible()
  } finally {
    vui(dir, ['viewer', 'stop'], environment)
  }
})
