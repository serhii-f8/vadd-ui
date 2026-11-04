#!/usr/bin/env node
// §15.1: no HTML-string or dynamic-code APIs in anything that reaches a browser.
//
// Usage: check-forbidden-apis.mjs [paths...]
// With no paths it scans `src` of every package marked `scanned` in the §3 table.
//
// Biome has no rule for most of this list, and a regex over raw source cannot tell a
// comment from code. esbuild drops comments and types and folds constant strings, so
// the patterns run on real code, strings included: `el['inner' + 'HTML']` still matches.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import { finish, rootArg } from './lib/cli.mjs'
import { PACKAGES } from './lib/workspace.mjs'

/** @type {[string, RegExp][]} */
const RULES = [
  ['innerHTML', /\binnerHTML\b/],
  ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /\bdocument\s*\.\s*write(?:ln)?\b/],
  ['eval', /\beval\b/],
  ['Function', /\bFunction\s*\(/],
]

/** @type {Record<string, 'ts' | 'tsx' | 'js' | 'jsx'>} */
const LOADERS = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
}

/**
 * Finds banned constructs in one source. Line 0 means the construct exists only after
 * constant folding, so no raw source line spells it. Task 11's bundle grep reuses this.
 *
 * @param {string} code
 * @param {string} filename
 * @returns {Promise<{ rule: string, line: number }[]>}
 */
export async function scanSource(code, filename) {
  const { code: stripped } = await transform(code, {
    loader: LOADERS[extname(filename)] ?? 'js',
    jsx: 'preserve',
    minifySyntax: true,
    legalComments: 'none',
    logLevel: 'silent',
  })
  const lines = code.split('\n')
  return RULES.filter(([, pattern]) => pattern.test(stripped)).map(([rule, pattern]) => ({
    rule,
    line: lines.findIndex((line) => pattern.test(line)) + 1,
  }))
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function sourceFiles(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { recursive: true, encoding: 'utf8' })
    .sort()
    .map((entry) => join(path, entry))
    .filter((file) => extname(file) in LOADERS && statSync(file).isFile())
}

async function main() {
  const argv = process.argv.slice(2)
  const root = rootArg(argv)
  const paths = argv.filter((arg, i) => arg !== '--root' && argv[i - 1] !== '--root')
  const targets = paths.length
    ? paths
    : PACKAGES.filter((pkg) => pkg.scanned).map((pkg) => join(root, pkg.dir, 'src'))

  /** @type {string[]} */
  const findings = []
  let scanned = 0
  for (const target of targets) {
    if (!existsSync(target)) {
      findings.push(`${target}: missing`)
      continue
    }
    for (const file of sourceFiles(target)) {
      scanned += 1
      const shown = relative(root, file)
      try {
        for (const { rule, line } of await scanSource(readFileSync(file, 'utf8'), file)) {
          findings.push(`${shown}${line ? `:${line}` : ''} [${rule}]`)
        }
      } catch {
        findings.push(`${shown} [unparsable]`)
      }
    }
  }
  if (scanned === 0) findings.push('nothing scanned')
  finish('check-forbidden-apis', findings, `${scanned} files clean`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
