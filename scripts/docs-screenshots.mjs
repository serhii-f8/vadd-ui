// Renders docs/assets/src/*.vui and the bundled bench corpus with the built CLI and saves light and dark PNGs to docs/assets.
// Run after `pnpm build`: node scripts/docs-screenshots.mjs [name…]
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'docs/assets')
const source = join(assets, 'src')
const cli = join(root, 'packages/ui-cli/dist/bin.js')

/** Page width in CSS pixels; anything not listed uses 760. @type {Record<string, number>} */
const WIDTHS = { hero: 1040, ext: 1040 }

const wanted = process.argv.slice(2)
const corpus = join(root, 'packages/ui-cli/corpus')

/** `png` is the image path without the scheme suffix. */
const jobs = [
  ...readdirSync(source)
    .filter((file) => file.endsWith('.vui'))
    .map((file) => basename(file, '.vui'))
    .map((name) => ({ name, document: join(source, `${name}.vui`), png: join(assets, name) })),
  // One bundled bench case per component; the folder name starts with the component type.
  ...readdirSync(corpus).map((dir) => {
    const name = dir.split('-')[0] ?? dir
    return { name, document: join(corpus, dir, 'doc.vui'), png: join(assets, 'components', name) }
  }),
].filter(({ name }) => wanted.length === 0 || wanted.includes(name))

mkdirSync(join(assets, 'components'), { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'vui-docs-'))
const browser = await chromium.launch()
try {
  for (const { name, document, png } of jobs) {
    const html = join(work, `${name}.html`)
    execFileSync(process.execPath, [cli, 'render', document, '--format', 'html', '--out', html])
    for (const colorScheme of /** @type {const} */ (['dark', 'light'])) {
      const page = await browser.newPage({
        colorScheme,
        deviceScaleFactor: 2,
        // A short viewport, so the full-page capture ends where the document does.
        viewport: { width: WIDTHS[name] ?? 760, height: 100 },
      })
      await page.goto(pathToFileURL(html).href)
      await page.addStyleTag({ content: 'body{padding:16px 20px}' })
      await page.screenshot({ path: `${png}-${colorScheme}.png`, fullPage: true })
      await page.close()
      console.log(`${png}-${colorScheme}.png`)
    }
  }
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}
