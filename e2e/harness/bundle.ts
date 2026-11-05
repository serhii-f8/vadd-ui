import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

let cached: string | undefined

/** The harness entry as one IIFE, as a visual inlines it. */
export function harnessBundle(): string {
  cached ??= (() => {
    const { outputFiles } = buildSync({
      entryPoints: [path('./entry.ts')],
      alias: { '@vadd/ui-spec': path('../../packages/ui-spec/src/index.ts') },
      bundle: true,
      format: 'iife',
      minify: true,
      target: 'es2020',
      write: false,
    })
    return (outputFiles[0] as { text: string }).text
  })()
  return cached
}
