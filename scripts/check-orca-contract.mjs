#!/usr/bin/env node
// §17.3's scheduled host-contract job, runnable anywhere:
//   node scripts/check-orca-contract.mjs --orca <stablyai/orca checkout> [--orca-cli "<command>"]
// Compares the constants in Orca's `native-chat-visual-directive.ts` and
// `native-chat-visual-shell.ts`, and the token list in its built-in skill, with
// `packages/ui-spec/src/host/orca.ts`; with `--orca-cli`, runs `<command> tab create --help`
// and fails if `--url` or `--split` is gone. Exit 1 on any difference, 2 on bad usage.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { finish } from './lib/cli.mjs'
import {
  CONTRACT,
  compareConstants,
  compareTokenSets,
  helpFindings,
  skillTokens,
} from './lib/orca-contract.mjs'

const OURS = fileURLToPath(new URL('../packages/ui-spec/src/host/orca.ts', import.meta.url))
const DIRECTIVE = 'native-chat-visual-directive.ts'
const SHELL = 'native-chat-visual-shell.ts'
// Newest first: Orca moved both files into visuals/ in November 2026 (VD-208).
const LAYOUTS = ['src/shared/native-chat/visuals', 'src/shared/native-chat']
const SKILL = 'resources/native-chat-visuals/skills/orca-chat-visuals/SKILL.md'

/** @param {string} name */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

/**
 * Orca's sources import packages (zod, ...) that a bare checkout does not install. The check
 * reads only literal constants, so every bare package import resolves to a permissive stub:
 * a Proxy that any property access, call or `new` returns again, enough for top-level schema
 * definitions such as `z.object({ ... })` to evaluate (VD-229). esbuild's CJS interop copies
 * only own names onto an object whose prototype it reads from the module, so the stub reports
 * itself as its prototype and every named import (`z`, ...) still reaches it.
 *
 * @type {import('esbuild').Plugin}
 */
const stubPackages = {
  name: 'stub-packages',
  setup(build) {
    // `^[^./]` also matches a Windows absolute path (`D:\a\...`), which is a source file.
    build.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('node:') || isAbsolute(args.path)
        ? undefined
        : { path: args.path, namespace: 'stub' },
    )
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      loader: 'js',
      contents: `const stub = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : stub),
  apply: () => stub,
  construct: () => stub,
  getPrototypeOf: () => stub,
})
module.exports = stub`,
    }))
  },
}

/**
 * Bundles TypeScript sources into one module and imports it, so neither side needs a build.
 *
 * @param {string[]} files
 * @returns {Promise<Record<string, unknown>>}
 */
async function load(files) {
  const contents = files.map((file) => `export * from ${JSON.stringify(file)}`).join('\n')
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [stubPackages],
  })
  const code = result.outputFiles[0]?.text ?? ''
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const orca = flag('--orca')
if (!orca || !existsSync(join(orca, 'src'))) {
  console.error(
    'usage: check-orca-contract.mjs --orca <stablyai/orca checkout> [--orca-cli "<command>"]',
  )
  process.exit(2)
}

// A checkout without the files is drift to report, not bad usage.
const layout = LAYOUTS.find((dir) => existsSync(join(orca, dir, DIRECTIVE)))
if (!layout) {
  finish(
    'check-orca-contract',
    [
      `${DIRECTIVE} is not where it was (${LAYOUTS.join(', ')}); find it in Orca and update LAYOUTS`,
    ],
    '',
  )
  process.exit(1)
}

const ours = await load([OURS])
const theirs = await load([join(orca, layout, DIRECTIVE), join(orca, layout, SHELL)])
const skillPath = join(orca, SKILL)
const tokens = existsSync(skillPath) ? skillTokens(readFileSync(skillPath, 'utf8')) : []
const findings = [
  ...compareConstants(ours, theirs),
  ...compareTokenSets(/** @type {string[]} */ (ours.ORCA_THEME_TOKENS ?? []), tokens),
]

const cli = flag('--orca-cli')
if (cli) {
  const [command = '', ...args] = cli.split(' ').filter(Boolean)
  const help = spawnSync(command, [...args, 'tab', 'create', '--help'], { encoding: 'utf8' })
  if (help.error) findings.push(`${cli}: ${help.error.message}`)
  else findings.push(...helpFindings(`${help.stdout}${help.stderr}`))
}

const helpNote = cli ? ', and tab create --help lists --url and --split' : ''
finish(
  'check-orca-contract',
  findings,
  `${CONTRACT.length} constants and ${tokens.length} skill tokens match Orca${helpNote}`,
)
