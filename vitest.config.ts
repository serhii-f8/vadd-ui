import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Tests run against source, so they never see a stale `dist` and need no build first.
// A subpath comes first: an alias matches by prefix, and the first match wins.
const alias = Object.fromEntries([
  [
    '@vadd/ui-spec/catalog',
    fileURLToPath(new URL('./packages/ui-spec/src/catalog.ts', import.meta.url)),
  ],
  ...['ui-spec', 'ui-render', 'ui-text', 'ui', 'ui-viewer', 'ui-cli', 'ui-react'].map((name) => [
    `@vadd/${name}`,
    fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  ]),
])

// What the bundle build defines, from the same manifest. At the transform, since Vitest
// turns a plain `define` into a global that these workers do not see.
const { version } = JSON.parse(
  readFileSync(new URL('./packages/ui/package.json', import.meta.url), 'utf8'),
)
const define = { __VUI_VERSION__: JSON.stringify(version) }

export default defineConfig({
  test: {
    // Explicit root: without it, project `include` globs resolve against
    // `process.cwd()`, so a filtered run from a package directory matches nothing.
    root: rootDir,
    // `pnpm test:coverage`, part of `pnpm gate`. Each package adds its §16 target here.
    coverage: {
      provider: 'v8',
      include: [
        'packages/ui-spec/src/**/*.ts',
        'packages/ui-text/src/**/*.ts',
        'packages/ui-render/src/**/*.ts',
        'packages/ui/src/**/*.ts',
        'packages/ui-viewer/src/**/*.ts',
        'packages/ui-cli/src/**/*.ts',
      ],
      // Lines of wiring, run for real by `bin.test.ts` and `process.test.ts`.
      exclude: ['packages/ui-cli/src/bin.ts', 'packages/ui-viewer/src/viewer.ts'],
      reporter: ['text-summary'],
      thresholds: {
        'packages/ui-spec/src/**/*.ts': { lines: 95 },
        'packages/ui-text/src/**/*.ts': { lines: 95 },
        'packages/ui-render/src/**/*.ts': { lines: 95 },
        'packages/ui/src/**/*.ts': { lines: 95 },
        'packages/ui-viewer/src/**/*.ts': { lines: 95 },
        'packages/ui-cli/src/**/*.ts': { lines: 95 },
      },
    },
    projects: [
      {
        resolve: { alias },
        oxc: { define },
        test: {
          name: 'node',
          include: [
            'packages/{ui-spec,ui-text,ui-viewer,ui-cli}/test/**/*.test.ts',
            'skills/*/test/**/*.test.ts',
            'scripts/test/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        oxc: { define },
        test: {
          name: 'jsdom',
          include: ['packages/{ui-render,ui,ui-react}/test/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
