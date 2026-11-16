#!/usr/bin/env node
// §3: `@vadd/ui` ships two bundles, built from what `tsc -b` just wrote.
//
// `vui.min.js` is the boot script, and its path is stable for the whole 1.x line (§10.3).
// `vui-ext.min.js` is the same boot script with the §6 `ext` tier too: a writer embeds it in
// place of `vui.min.js` only for a document that uses that tier (VD-182). Both come from one
// entry; the core build resolves `@vadd/ui-render` to its `core` entry, so its bytes are the
// core tier's alone and no source carries a switch.
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
const coreRender = fileURLToPath(new URL('../packages/ui-render/dist/core.js', import.meta.url))
// The one source of the version; `check-versions` ties this manifest to the root.
const { version } = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'))

// VD-195: each CSS module writes one rule per line, then drops the newlines at runtime with
// `.trim().replace(/\n/g, '')`. Here the newlines go at build time, with the call, for the same
// string in fewer bytes. A module that no longer matches the pattern fails the build.
const CSS_MODULE = /[\\/]ui-render[\\/]dist[\\/]css[\\/](?:base|components|data)\.js$/
const CSS_TEMPLATE = /`\n([^`]*)`\s*\.trim\(\)\s*\.replace\(\/\\n\/g, ''\)/g

/** @type {import('esbuild').Plugin} */
const flatCss = {
  name: 'flat-css',
  setup(on) {
    on.onLoad({ filter: CSS_MODULE }, ({ path }) => {
      const source = readFileSync(path, 'utf8')
      const contents = source.replace(CSS_TEMPLATE, (_, css) => `\`${css.replace(/\n/g, '')}\``)
      if (contents === source || contents.includes('.trim()')) {
        throw new Error(`flat-css: no CSS template in ${path}`)
      }
      return { contents, loader: 'js' }
    })
  },
}

/** @type {import('esbuild').BuildOptions} */
const shared = {
  plugins: [flatCss],
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
    alias: { '@vadd/ui-render': coreRender },
    outfile: `${dir}dist/vui.min.js`,
  }),
  build({
    ...shared,
    entryPoints: [`${dir}src/vui.ts`],
    format: 'iife',
    outfile: `${dir}dist/vui-ext.min.js`,
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
