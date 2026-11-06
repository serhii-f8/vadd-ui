#!/usr/bin/env node
// §3: `@vadd/ui` ships two bundles, built from what `tsc -b` just wrote.
//
// `vui.min.js` is the boot script, and its path is stable for the whole 1.x line (§10.3).
// `index.js` is the ESM build: one self-contained module, with nothing on import.
//
// The Viewer's `app.js` comes last, because it bundles that `index.js` through the package's
// `exports`, the §3 edge. It is its own file because the §15.3 CSP blocks an inline script.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { BROWSER_TARGET } from './lib/targets.mjs'

const dir = fileURLToPath(new URL('../packages/ui/', import.meta.url))
const viewerDir = fileURLToPath(new URL('../packages/ui-viewer/', import.meta.url))
// The one source of the version; `check-versions` ties this manifest to the root.
const { version } = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'))

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  minify: true,
  target: BROWSER_TARGET,
  legalComments: 'none',
  define: { __VUI_VERSION__: JSON.stringify(version) },
  logLevel: 'warning',
}

await Promise.all([
  build({
    ...shared,
    entryPoints: [`${dir}src/vui.ts`],
    format: 'iife',
    outfile: `${dir}dist/vui.min.js`,
  }),
  build({
    ...shared,
    entryPoints: [`${dir}src/index.ts`],
    format: 'esm',
    outfile: `${dir}dist/index.js`,
  }),
])

await build({
  ...shared,
  entryPoints: [`${viewerDir}src/app/main.ts`],
  format: 'iife',
  outfile: `${viewerDir}dist/app.js`,
})
