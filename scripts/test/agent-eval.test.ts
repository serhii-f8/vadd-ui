import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COMPONENT_TYPES } from '../../packages/ui-spec/src/index.js'
import { parseStream, score, summarize } from '../agent-eval/lib.mjs'
import { repoRoot } from './helpers.js'

const prompts: { id: string; component: string; prompt: string }[] = JSON.parse(
  readFileSync(`${repoRoot}scripts/agent-eval/prompts.json`, 'utf8'),
)

/** §6.3 `compare` and §6.5 `flow` are `ext` (task 22); `stack`, `card` and `divider` only arrange. */
const EXPECTED = COMPONENT_TYPES.filter(
  (type) => !['compare', 'flow', 'stack', 'card', 'divider'].includes(type),
)

const directive = '::orca-visual{file="weekly-metrics-1a2b.html" title="Weekly metrics"}'
const ok = { argv: ['show', '--title', 'x'], exit: 0, stdout: `${directive}\n` }
const bad = { argv: ['show'], exit: 2, stdout: '' }
const run = (overrides: Partial<Parameters<typeof score>[0]> = {}) =>
  score({
    calls: [],
    htmlFiles: [],
    shimFiles: [],
    toolWrites: [],
    finalText: '',
    ...overrides,
  })

describe('prompts.json', () => {
  it('holds 40 prompts with unique ids (§16)', () => {
    expect(prompts).toHaveLength(40)
    expect(new Set(prompts.map(({ id }) => id)).size).toBe(40)
    for (const { prompt } of prompts) expect(prompt).not.toMatch(/\bvui\b/)
  })

  it('covers every core content component', () => {
    const named = new Set(prompts.map(({ component }) => component))
    expect(EXPECTED.filter((type) => !named.has(type))).toEqual([])
  })
})

describe('score', () => {
  it('counts a first show that exits 0 as valid, and a pasted directive', () => {
    expect(
      run({
        calls: [ok],
        shimFiles: ['weekly-metrics-1a2b.html'],
        htmlFiles: ['weekly-metrics-1a2b.html'],
        finalText: `Done.\n${directive}\n`,
      }),
    ).toEqual({
      showCalls: 1,
      firstValid: true,
      validAfterRetry: true,
      handHtml: 0,
      directivePasted: true,
    })
  })

  it('counts a retry that succeeds as valid after one retry only', () => {
    const result = run({ calls: [bad, ok] })
    expect(result.firstValid).toBe(false)
    expect(result.validAfterRetry).toBe(true)
  })

  it('does not count a third attempt as valid after one retry', () => {
    expect(run({ calls: [bad, bad, ok] }).validAfterRetry).toBe(false)
  })

  it('ignores vui calls that are not show', () => {
    const catalog = { argv: ['catalog', 'stats'], exit: 0, stdout: '' }
    expect(run({ calls: [catalog, ok] }).firstValid).toBe(true)
  })

  it('counts no show at all as invalid', () => {
    expect(run()).toMatchObject({ showCalls: 0, firstValid: false, validAfterRetry: false })
  })

  it('counts an HTML file the CLI did not write as hand-written', () => {
    expect(run({ htmlFiles: ['report.html'], shimFiles: [] }).handHtml).toBe(1)
  })

  it('counts a tool write of HTML markup as hand-written', () => {
    const toolWrites = [{ path: 'notes.md', content: '<table><tr><td>1</td></tr></table>' }]
    expect(run({ toolWrites }).handHtml).toBe(1)
  })

  it('a re-show that replaces a visual needs only its latest directive pasted', () => {
    const later = {
      ...ok,
      stdout: '::orca-visual{file="weekly-metrics-9f9f.html" title="Weekly metrics"}\n',
    }
    const finalText =
      'Here:\n::orca-visual{file="weekly-metrics-9f9f.html" title="Weekly metrics"}\n'
    expect(run({ calls: [ok, later], finalText }).directivePasted).toBe(true)
    expect(run({ calls: [ok, later], finalText: `x\n${directive}\n` }).directivePasted).toBe(false)
  })

  it('a directive not pasted in the reply is false; a viewer line is not applicable', () => {
    expect(run({ calls: [ok], finalText: 'see it' }).directivePasted).toBe(false)
    const viewer = { ...ok, stdout: 'vui: shown "x" (#1) in viewer\n' }
    expect(run({ calls: [viewer] }).directivePasted).toBeNull()
  })
})

describe('summarize', () => {
  const row = (firstValid: boolean, validAfterRetry = true, handHtml = 0) => ({
    id: 'x',
    showCalls: 1,
    firstValid,
    validAfterRetry,
    handHtml,
    directivePasted: true,
  })

  it('holds the §16 gate at 98%, 100% and zero', () => {
    const rows = [...Array.from({ length: 39 }, () => row(true)), row(false)]
    const summary = summarize(rows)
    expect(summary.firstValidRate).toBe(0.975)
    expect(summary.gate).toEqual({ first: false, retry: true, html: true })
    expect(summarize(Array.from({ length: 40 }, () => row(true))).gate).toEqual({
      first: true,
      retry: true,
      html: true,
    })
    expect(summarize([row(true, true, 1)]).gate.html).toBe(false)
    expect(summarize([row(false, false)]).gate.retry).toBe(false)
  })
})

describe('parseStream', () => {
  it('reads tool writes, HTML in shell commands, and the final reply', () => {
    const lines = [
      { type: 'system', subtype: 'init' },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/p/a.html', content: '<div>x</div>' },
            },
            { type: 'tool_use', name: 'Bash', input: { command: "vui show <<'EOF'\n{}\nEOF" } },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/p/b.md', new_string: 'y' } },
          ],
        },
      },
      { type: 'result', result: 'All done.' },
    ]
    const parsed = parseStream(lines.map((line) => JSON.stringify(line)).join('\n'))
    expect(parsed.finalText).toBe('All done.')
    expect(parsed.toolWrites).toEqual([
      { path: '/p/a.html', content: '<div>x</div>' },
      { path: 'Bash', content: "vui show <<'EOF'\n{}\nEOF" },
      { path: '/p/b.md', content: 'y' },
    ])
  })

  it('skips lines that are not JSON', () => {
    expect(parseStream('not json\n').toolWrites).toEqual([])
  })
})
