#!/usr/bin/env node
// §16 agent eval: each prompt goes to Claude Code (`claude -p`) in a throwaway project with the
// vadd-ui skill installed, a logging `vui` first on PATH, and ORCA_CHAT_SCRATCH_DIR set (an
// Orca-like environment). It uses Claude Code's own login; run `pnpm build` first.
//
//   node scripts/agent-eval/run.mjs [--only id,id] [--model opus] [--no-skill] [--parallel 3]
//                                   [--timeout-ms 300000] [--out dir]
//
// `--no-skill` is the baseline: the same prompts with no skill (VD-139, `writing-skills`).
// The user's settings, plugins and MCP servers stay out (`--setting-sources project`,
// `--strict-mcp-config`).

import { spawn } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finished, parseStream, score, summarize } from './lib.mjs'

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url))
const BIN = here('../../packages/ui-cli/dist/bin.js')
const SHIM = here('./vui-shim.mjs')
const SKILL = here('../../skills/vadd-ui/SKILL.md')

/** @param {string} name */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

if (!existsSync(BIN)) {
  console.error(`agent-eval: ${BIN} is missing; run pnpm build`)
  process.exit(2)
}

/** @type {{id: string, component: string, prompt: string}[]} */
const all = JSON.parse(readFileSync(here('./prompts.json'), 'utf8'))
const only = flag('--only')?.split(',')
const prompts = only ? all.filter(({ id }) => only.includes(id)) : all
const model = flag('--model') ?? 'opus'
const withSkill = !process.argv.includes('--no-skill')
const parallel = Number(flag('--parallel') ?? 3)
const timeoutMs = Number(flag('--timeout-ms') ?? 300_000)
const out = flag('--out') ?? mkdtempSync(join(tmpdir(), 'vui-agent-eval-'))
mkdirSync(out, { recursive: true })

/** Every `.html` under `dir`, skipping `.git` and `.claude`. */
function htmlUnder(/** @type {string} */ dir) {
  /** @type {string[]} */
  const found = []
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === '.claude') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...htmlUnder(path))
    else if (name.endsWith('.html')) found.push(name)
  }
  return found
}

/** @param {{id: string, prompt: string}} item */
async function runOne({ id, prompt }) {
  const dir = join(out, id)
  const project = join(dir, 'project')
  const scratch = join(dir, 'scratch')
  const bin = join(dir, 'bin')
  for (const path of [project, scratch, bin]) mkdirSync(path, { recursive: true })
  if (withSkill) {
    mkdirSync(join(project, '.claude/skills/vadd-ui'), { recursive: true })
    copyFileSync(SKILL, join(project, '.claude/skills/vadd-ui/SKILL.md'))
  }
  writeFileSync(join(bin, 'vui'), `#!/bin/sh\nexec "${process.execPath}" "${SHIM}" "$@"\n`)
  chmodSync(join(bin, 'vui'), 0o755)
  const log = join(dir, 'vui-calls.jsonl')
  writeFileSync(log, '')

  /** @type {NodeJS.ProcessEnv} */
  const env = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('ORCA_') && !name.startsWith('VUI_') && name !== 'CLAUDECODE')
      env[name] = value
  }
  Object.assign(env, {
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    ORCA_CHAT_SCRATCH_DIR: scratch,
    XDG_STATE_HOME: join(dir, 'state'),
    VUI_EVAL_LOG: log,
  })
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--dangerously-skip-permissions',
  ]
  const started = Date.now()
  const stream = await new Promise((resolve) => {
    const child = spawn('git', ['init', '-q', project]).on('close', () => {
      const claude = spawn('claude', args, { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let text = ''
      claude.stdout.on('data', (chunk) => {
        text += chunk
      })
      claude.stderr.on('data', (chunk) => {
        text += `\n${JSON.stringify({ type: 'stderr', text: String(chunk) })}`
      })
      const timer = setTimeout(() => claude.kill('SIGTERM'), timeoutMs)
      claude.on('close', (code) => {
        clearTimeout(timer)
        resolve(`${text}\n${JSON.stringify({ type: 'exit', code })}`)
      })
    })
    child.on('error', () => resolve(''))
  })
  writeFileSync(join(dir, 'stream.jsonl'), String(stream))
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const shimFiles = calls.flatMap((/** @type {{stdout: string}} */ call) =>
    [...call.stdout.matchAll(/::orca-visual\{file="([^"]+)"/g)].map((m) => m[1] ?? ''),
  )
  const { toolWrites, finalText } = parseStream(String(stream))
  const htmlFiles = [
    ...readdirSync(scratch).filter((name) => name.endsWith('.html')),
    ...htmlUnder(project),
  ]
  const row = {
    id,
    ...score({ calls, htmlFiles, shimFiles, toolWrites, finalText }),
    finished: finished(String(stream)),
    seconds: Math.round((Date.now() - started) / 1000),
    exits: calls
      .filter((/** @type {{argv: string[]}} */ c) => c.argv[0] === 'show')
      .map((/** @type {{exit: number}} */ c) => c.exit),
  }
  console.log(
    `${id}: shows ${row.showCalls} ${JSON.stringify(row.exits)}, first ${row.firstValid ? 'valid' : 'INVALID'}, html ${row.handHtml}, directive ${row.directivePasted}, ${row.seconds}s`,
  )
  return row
}

/** @type {Awaited<ReturnType<typeof runOne>>[]} */
const rows = []
const queue = [...prompts]
await Promise.all(
  Array.from({ length: Math.max(1, parallel) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) rows.push(await runOne(next))
  }),
)
rows.sort(
  (a, b) => prompts.findIndex((p) => p.id === a.id) - prompts.findIndex((p) => p.id === b.id),
)
const summary = { model, withSkill, date: new Date().toISOString(), ...summarize(rows) }
writeFileSync(join(out, 'report.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`)
const pct = (/** @type {number | null} */ v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`)
console.log(
  `agent-eval (${withSkill ? 'skill' : 'no skill'}, ${model}): ${summary.n} prompts, ${summary.shown} showed a visual (${pct(summary.visualRate)}); of those, first show valid ${pct(summary.firstValidRate)} (gate 98%), valid after one retry ${pct(summary.retryValidRate)} (gate 100%); hand-written HTML ${summary.handHtmlTotal} (gate 0); directive pasted ${pct(summary.directivePastedRate)}`,
)
console.log(`agent-eval: report in ${join(out, 'report.json')}`)
if (summary.unfinished > 0) {
  console.log(
    `agent-eval: ${summary.unfinished} run(s) did not finish (timeout or error); see stream.jsonl`,
  )
}
process.exitCode = Object.values(summary.gate).every(Boolean) ? 0 : 1
