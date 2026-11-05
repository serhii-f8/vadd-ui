#!/usr/bin/env node
// §9.5: `vui.min.js` including CSS is ≤ 120 KiB minified and ≤ 38 KiB gzip.
//
// §10.1 inlines the bundle in a `<script>`, so it must hold nothing that ends the element or
// sends the HTML parser into its escaped states. A size check is the one that reads the file.
//
// Before task 11 there is no bundle and that is fine. Once `@vadd/ui` declares the
// bundle in `exports`, a missing file fails, so a dropped build step cannot pass.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { constants, gzipSync } from 'node:zlib'
import { finish, rootArg } from './lib/cli.mjs'
import { readJson } from './lib/workspace.mjs'

const BUNDLE = 'packages/ui/dist/vui.min.js'
const MAX_MIN = 120 * 1024
const MAX_GZIP = 38 * 1024

/** @param {number} bytes */
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

/** @type {string[]} */
const findings = []
const root = rootArg(process.argv.slice(2))
const manifest = readJson(root, 'packages/ui/package.json', findings)
const path = join(root, BUNDLE)
let summary = 'no bundle yet'

if (manifest && existsSync(path)) {
  const bundle = readFileSync(path)
  const gzip = gzipSync(bundle, { level: constants.Z_BEST_COMPRESSION }).length
  summary = `${kib(bundle.length)} minified, ${kib(gzip)} gzip`
  if (bundle.length > MAX_MIN) {
    findings.push(`${BUNDLE}: ${kib(bundle.length)} minified, budget ${kib(MAX_MIN)}`)
  }
  if (gzip > MAX_GZIP) findings.push(`${BUNDLE}: ${kib(gzip)} gzip, budget ${kib(MAX_GZIP)}`)
  const text = bundle.toString('latin1')
  if (/<\/script|<!--/i.test(text)) findings.push(`${BUNDLE}: cannot be inlined in HTML`)
} else if (JSON.stringify(manifest?.exports ?? {}).includes('vui.min.js')) {
  findings.push(`${BUNDLE}: declared in exports but missing`)
}

finish('check-bundle-size', findings, summary)
