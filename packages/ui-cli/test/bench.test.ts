import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { COMPONENT_TYPES } from '@vadd/ui-spec'
import { afterEach, describe, expect, it } from 'vitest'
import { DIRECTIVE, FIXED_CDN, FIXED_SHOW, hasGfmTable } from '../src/bench/budgets.js'
import { bench, skillCandidates } from '../src/bench/command.js'
import { offlineCounter } from '../src/bench/tokens.js'
import { catalogText } from '../src/commands.js'
import { fakeSystem, NOW, tempDir, vui, vuiJson } from './helpers.js'

interface Files {
  vui?: string
  md?: string
  html?: string
}

const TABLE =
  "{title: 'Runs', body: [{type: 'table', columns: ['Test', 'Time:ms'], rows: [['login', 120], ['refresh', 340]]}]}"
const TABLE_MD = `## Runs\n\n| Test | Time |\n| --- | ---: |\n| login | 120 ms |\n| refresh | 340 ms |\n\n${'The table lists the runs. '.repeat(10)}\n`
const PAGE = `<!doctype html><html><head><style>${'.row{color:var(--foreground,#171717);padding:4px 8px}'.repeat(30)}</style></head><body><h1>Runs</h1><table><tr><td>login</td><td>120 ms</td></tr><tr><td>refresh</td><td>340 ms</td></tr></table></body></html>\n`
const PROSE = "{title: 'Plan', body: [{type: 'plan', items: [{text: 'Add table', status: 'ok'}]}]}"
const PROSE_MD = '## Plan\n\n- [x] Add table\n'

function corpus(cases: Record<string, Files>): string {
  const dir = tempDir()
  for (const [name, files] of Object.entries(cases)) {
    mkdirSync(join(dir, name))
    for (const [kind, text] of Object.entries(files))
      writeFileSync(join(dir, name, `doc.${kind}`), text)
  }
  return dir
}

const good = (): string =>
  corpus({
    a: { vui: TABLE, md: TABLE_MD, html: PAGE },
    b: { vui: PROSE, md: PROSE_MD, html: PAGE },
  })

describe('vui bench (§11.1, §14)', () => {
  it('names the counter and passes every budget', async () => {
    const { exit, stdout, stderr } = await vui(['bench', good()])
    expect(stderr).toBe('')
    expect(exit).toBe(0)
    const lines = stdout.split('\n')
    expect(lines[0]).toBe(
      'vui bench: 2 cases, offline estimate (js-tiktoken 1.0.21 cl100k_base, max(cl100k × 1.3, chars × 1.3 / 3.5))',
    )
    for (const name of ['fixed.show', 'fixed.cdn', 'ratio.md', 'ratio.html', 'skill', 'catalog']) {
      expect(stdout).toMatch(new RegExp(`^ok +${name.replace('.', '\\.')}`, 'm'))
    }
    expect(stdout).toMatch(/^info +orca-visual line +\d+ tokens/m)
  })

  it('answers in JSON', async () => {
    const { exit, json } = await vuiJson(['bench', good()])
    expect(exit).toBe(0)
    expect(json.ok).toBe(true)
    expect(json.counter).toEqual({
      kind: 'offline',
      tokenizer: 'js-tiktoken 1.0.21 cl100k_base',
      method: 'max(cl100k × 1.3, chars × 1.3 / 3.5)',
    })
    const cases = json.cases as Record<string, unknown>[]
    expect(cases.map(({ name }) => name)).toEqual(['a', 'b'])
    expect(cases[0]).toMatchObject({ name: 'a', mdTable: true })
    expect(cases[1]).toMatchObject({ name: 'b', mdTable: false })
    for (const key of ['vui', 'md', 'html', 'ratioMd', 'ratioHtml']) {
      expect(typeof cases[0]?.[key]).toBe('number')
    }
    const metrics = json.metrics as Record<string, number | null>
    expect(Object.keys(metrics).sort()).toEqual(
      [
        'fixed.show',
        'fixed.cdn',
        'ratio.md',
        'ratio.html',
        'skill',
        ...COMPONENT_TYPES.map((t) => `catalog.${t}`),
      ].sort(),
    )
    expect(metrics['ratio.md']).toBe(cases[0]?.ratioMd)
    const budgets = json.budgets as { name: string; value: number; limit: number; ok: boolean }[]
    expect(budgets.find(({ name }) => name === 'fixed.show')).toMatchObject({ limit: 30, ok: true })
    expect(budgets.find(({ name }) => name === 'catalog.table')).toMatchObject({ limit: 300 })
    expect(json.info).toMatchObject({ directive: expect.any(Number), mdTotal: expect.any(Number) })
    expect(typeof json.skillPath).toBe('string')
  })

  it('measures the overheads, the skill and the catalog with the offline estimate', async () => {
    const counter = await offlineCounter()
    const { json } = await vuiJson(['bench', good()])
    const metrics = json.metrics as Record<string, number>
    expect(metrics['fixed.show']).toBe(counter.estimate(FIXED_SHOW).estimate)
    expect(metrics['fixed.cdn']).toBe(counter.estimate(FIXED_CDN).estimate)
    expect((json.info as { directive: number }).directive).toBe(
      counter.estimate(DIRECTIVE).estimate,
    )
    const skill = readFileSync(json.skillPath as string, 'utf8')
    expect(metrics.skill).toBe(counter.estimate(skill).estimate)
    for (const type of COMPONENT_TYPES) {
      expect(metrics[`catalog.${type}`]).toBe(counter.estimate(catalogText(type)).estimate)
    }
  })

  it('fails a case whose VUI is not five times smaller than its HTML', async () => {
    const dir = corpus({ a: { vui: TABLE, md: TABLE_MD, html: '<p>login 120 refresh 340</p>' } })
    const { exit, stdout } = await vui(['bench', dir])
    expect(exit).toBe(1)
    expect(stdout).toMatch(/^fail +ratio\.html .*\(worst: a\)/m)
  })

  it('fails a table case over 1.2 times its markdown', async () => {
    const md = '## Runs\n\n|Test|Time|\n|-|-|\n|login|120|\n|refresh|340|\n'
    const dir = corpus({ a: { vui: TABLE, md: md.replace('|-|-|', '|---|---|'), html: PAGE } })
    const { exit, stdout } = await vui(['bench', dir])
    expect(exit).toBe(1)
    expect(stdout).toMatch(/^fail +ratio\.md /m)
  })

  it('does not hold a case without a markdown table to the table ratio', async () => {
    const dir = corpus({ b: { vui: PROSE, md: PROSE_MD, html: PAGE } })
    const { exit, stdout, json } = await (async () => {
      const human = await vui(['bench', dir])
      return { ...human, json: (await vuiJson(['bench', dir])).json }
    })()
    expect(exit).toBe(0)
    expect(stdout).toMatch(/^ok +ratio\.md +not measured: no case has a markdown table/m)
    expect((json.metrics as Record<string, unknown>)['ratio.md']).toBeNull()
  })

  it('names the case and path of an invalid document', async () => {
    const dir = corpus({ bad: { vui: "{body: [{type: 'tabel'}]}", md: PROSE_MD, html: PAGE } })
    const { exit, stdout } = await vui(['bench', dir])
    expect(exit).toBe(1)
    expect(stdout).toContain('bad: error /body/0: unknown type "tabel"')
  })

  it.each([
    ['a missing file', () => corpus({ a: { vui: TABLE, html: PAGE } }), /a\/doc\.md/],
    ['a missing folder', () => join(tempDir(), 'nope'), /cannot read/],
    ['an empty folder', () => tempDir(), /no cases/],
  ])('exits 5 on %s', async (_, dir, message) => {
    const { exit, stderr } = await vui(['bench', dir()])
    expect(exit).toBe(5)
    expect(stderr).toMatch(message)
  })

  it('takes one folder at most', async () => {
    expect((await vui(['bench', 'a', 'b'])).exit).toBe(2)
    expect((await vui(['--help'])).stdout).toContain('vui bench [dir]\n')
  })
})

describe('the skill file', () => {
  it('is looked up in the repo, then the project, then the user', () => {
    const list = skillCandidates('/work', '/home/u')
    expect(list.slice(1)).toEqual([
      '/work/.claude/skills/vadd-ui/SKILL.md',
      '/home/u/.claude/skills/vadd-ui/SKILL.md',
    ])
    expect(list[0]).toMatch(/skills\/vadd-ui\/SKILL\.md$/)
  })

  it('is reported as not measured when there is none', async () => {
    const parsed = { command: 'bench' as const, positional: [good()], flags: {} }
    const io = {
      stdin: process.stdin,
      stdout: () => undefined,
      stderr: () => undefined,
      now: () => NOW,
      readBundle: () => '',
      readSchema: () => '',
      system: fakeSystem(),
    }
    const outcome = await bench(parsed, io, { skills: [join(tempDir(), 'SKILL.md')] })
    expect(outcome.exit).toBe(0)
    expect((outcome.json.metrics as Record<string, unknown>).skill).toBeNull()
    expect(outcome.stdout).toMatch(/^ok +skill +not measured: no SKILL\.md found/m)
  })

  it('uses the CDN template the skill teaches', () => {
    const skill = readFileSync(new URL('../../../skills/vadd-ui/SKILL.md', import.meta.url), 'utf8')
    const [first, second] = FIXED_CDN.split('\n')
    expect(skill).toContain(`${first}\n${second}\n<script type="application/vui+json">{`)
    expect(skill).toContain('`vui show --title "…" <<\'EOF\' … EOF`')
    expect(FIXED_SHOW.startsWith('vui show --title "" <<\'EOF\'\n')).toBe(true)
  })

  it('spots a GFM table by its delimiter row', () => {
    expect(hasGfmTable('| a | b |\n| --- | :---: |\n| 1 | 2 |\n')).toBe(true)
    expect(hasGfmTable('a | b\n--- | ---\n1 | 2\n')).toBe(true)
    expect(hasGfmTable('- item\n---\n')).toBe(false)
    expect(hasGfmTable('```\n|---|---|\n```\n')).toBe(true)
  })
})

describe('the API counter in a run', () => {
  let server: Server | undefined
  afterEach(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()))
  })

  it('reports the API and never prints the key', async () => {
    const key = 'sk-ant-run-secret-42'
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        const text: string = JSON.parse(raw).messages[0].content
        res.end(JSON.stringify({ input_tokens: 5 + Math.ceil(text.length / 4) }))
      })
    })
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    const env = { ANTHROPIC_API_KEY: key, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` }
    const human = await vui(['bench', good()], { system: fakeSystem({ env }) })
    expect(human.stdout.split('\n')[0]).toBe(
      'vui bench: 2 cases, Anthropic token counting API (claude-opus-5-5)',
    )
    const machine = await vuiJson(['bench', good()], { system: fakeSystem({ env }) })
    expect(machine.json.counter).toEqual({ kind: 'api', model: 'claude-opus-5-5' })
    for (const text of [human.stdout, human.stderr, JSON.stringify(machine.json)]) {
      expect(text).not.toContain(key)
    }
  })

  it('exits 5 when the API refuses', async () => {
    server = createServer((_, res) => res.writeHead(401).end())
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    const env = { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` }
    const { exit, stderr } = await vui(['bench', good()], { system: fakeSystem({ env }) })
    expect(exit).toBe(5)
    expect(stderr).toBe('vui: token counting API: HTTP 401\n')
  })
})
