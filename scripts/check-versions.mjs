#!/usr/bin/env node
// §17.2: all packages share one version number. The root manifest carries it.
// Walks the workspace globs, so a package missing from the §3 table is still checked.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { finish, rootArg } from './lib/cli.mjs'
import { readJson } from './lib/workspace.mjs'

/** @type {string[]} */
const findings = []
const root = rootArg(process.argv.slice(2))
const rootManifest = readJson(root, 'package.json', findings)
const expected = rootManifest?.version
if (rootManifest && typeof expected !== 'string') findings.push('package.json: missing version')

let checked = 0
for (const parent of ['packages', 'skills']) {
  for (const entry of existsSync(join(root, parent)) ? readdirSync(join(root, parent)) : []) {
    const file = `${parent}/${entry}/package.json`
    if (!existsSync(join(root, file))) continue
    const manifest = readJson(root, file, findings)
    if (!manifest) continue
    checked += 1
    if (manifest.version !== expected) {
      findings.push(`${manifest.name ?? file}: version ${manifest.version}, expected ${expected}`)
    }
  }
}

if (checked === 0) findings.push('nothing checked')
finish('check-versions', findings, `${checked} packages at ${expected}`)
