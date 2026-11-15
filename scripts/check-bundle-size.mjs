#!/usr/bin/env node
// §9.5: `vui.min.js` including CSS is ≤ 120 KiB minified and ≤ 38 KiB gzip.
// VD-182: `vui-ext.min.js`, the same boot script with the §6 `ext` tier, is embedded only for a
// document that uses that tier, and has its own budget: ≤ 132 KiB minified, ≤ 45 KiB gzip.
//
// §10.1 inlines a bundle in a `<script>`, so it must hold nothing that ends the element or
// sends the HTML parser into its escaped states. A size check is the one that reads the file.
//
// Before task 11 there is no bundle and that is fine. Once `@vadd/ui` declares a bundle in
// `exports`, a missing file fails, so a dropped build step cannot pass.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { constants, gzipSync } from 'node:zlib'
import { finish, rootArg } from './lib/cli.mjs'
import { readJson } from './lib/workspace.mjs'

const BUNDLES = [
  { file: 'vui.min.js', min: 120 * 1024, gzip: 38 * 1024 },
  { file: 'vui-ext.min.js', min: 132 * 1024, gzip: 45 * 1024 },
]

/** @param {number} bytes */
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

/** @type {string[]} */
const findings = []
/** @type {string[]} */
const summaries = []
const root = rootArg(process.argv.slice(2))
const manifest = readJson(root, 'packages/ui/package.json', findings)

for (const { file, min, gzip: maxGzip } of BUNDLES) {
  const name = `packages/ui/dist/${file}`
  const path = join(root, name)
  if (manifest && existsSync(path)) {
    const bundle = readFileSync(path)
    const gzip = gzipSync(bundle, { level: constants.Z_BEST_COMPRESSION }).length
    summaries.push(`${file} ${kib(bundle.length)} minified, ${kib(gzip)} gzip`)
    if (bundle.length > min) {
      findings.push(`${name}: ${kib(bundle.length)} minified, budget ${kib(min)}`)
    }
    if (gzip > maxGzip) findings.push(`${name}: ${kib(gzip)} gzip, budget ${kib(maxGzip)}`)
    const text = bundle.toString('latin1')
    if (/<\/script|<!--/i.test(text)) findings.push(`${name}: cannot be inlined in HTML`)
  } else if (JSON.stringify(manifest?.exports ?? {}).includes(`"./${file}"`)) {
    findings.push(`${name}: declared in exports but missing`)
  }
}

finish('check-bundle-size', findings, summaries.length > 0 ? summaries.join('; ') : 'no bundle yet')
