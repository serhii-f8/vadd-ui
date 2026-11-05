import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Tests run against source, so they never see a stale `dist` and need no build first.
const alias = Object.fromEntries(
  ['ui-spec', 'ui-render', 'ui-text', 'ui', 'ui-viewer', 'ui-cli', 'ui-react'].map((name) => [
    `@vadd/${name}`,
    fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  ]),
)

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
      ],
      reporter: ['text-summary'],
      thresholds: {
        'packages/ui-spec/src/**/*.ts': { lines: 95 },
        'packages/ui-text/src/**/*.ts': { lines: 95 },
        'packages/ui-render/src/**/*.ts': { lines: 95 },
      },
    },
    projects: [
      {
        resolve: { alias },
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
        test: {
          name: 'jsdom',
          include: ['packages/{ui-render,ui,ui-react}/test/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
