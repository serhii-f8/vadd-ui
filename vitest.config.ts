import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Tests run against source, so they never see a stale `dist` and need no build first.
// A subpath comes first: an alias matches by prefix, and the first match wins.
const alias = Object.fromEntries([
  [
    '@vadd/ui-spec/catalog',
    fileURLToPath(new URL('./packages/ui-spec/src/catalog.ts', import.meta.url)),
  ],
  [
    '@vadd/ui-render/core',
    fileURLToPath(new URL('./packages/ui-render/src/core.ts', import.meta.url)),
  ],
  [
    '@vadd/ui-viewer/contract',
    fileURLToPath(new URL('./packages/ui-viewer/src/contract.ts', import.meta.url)),
  ],
  [
    '@vadd/ui-spec/host/orca',
    fileURLToPath(new URL('./packages/ui-spec/src/host/orca.ts', import.meta.url)),
  ],
  ...['ui-spec', 'ui-render', 'ui-text', 'ui', 'ui-viewer', 'ui-cli', 'ui-react'].map((name) => [
    `@vadd/${name}`,
    fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  ]),
])

// B14: no test may write to the real state root (`~/.local/state/vadd-ui`, or `LOCALAPPDATA` on
// Windows), even one that builds its environment from `process.env` and forgets `stateHome()`.
// One temporary root per run, for both platform rules (VD-204, VD-215).
const stateRoot = mkdtempSync(join(tmpdir(), 'vui-test-state-'))
const stateEnv = { XDG_STATE_HOME: stateRoot, LOCALAPPDATA: stateRoot }

// GitHub's Windows and macOS runners, and the gate job under coverage, take several tests that
// spawn processes or sweep 2000 cases to 4.7-5.5 s. On CI the per-test timeout guards a hang,
// not speed; locally the 5 s default keeps a slow test visible (VD-230).
const testTimeout = process.env.CI ? 30_000 : 5_000

// What the bundle build defines, from the same manifest. At the transform, since Vitest
// turns a plain `define` into a global that these workers do not see.
const { version } = JSON.parse(
  readFileSync(new URL('./packages/ui/package.json', import.meta.url), 'utf8'),
)
const define = { __VUI_VERSION__: JSON.stringify(version) }

// VD-143: React 18 sits in its own private package, where its DOM meets React 18 and not the
// React 19 that `ui-react` develops against. These come first, so `react-dom` never reaches
// the `react` rule by prefix.
const react18 = fileURLToPath(new URL('./packages/ui-react/react18/node_modules/', import.meta.url))
const react18Alias = [
  { find: /^react-dom$/, replacement: `${react18}react-dom/index.js` },
  { find: /^react-dom\/(.*)$/, replacement: `${react18}react-dom/$1.js` },
  { find: /^react$/, replacement: `${react18}react/index.js` },
  { find: /^react\/(.*)$/, replacement: `${react18}react/$1.js` },
  ...Object.entries(alias).map(([find, replacement]) => ({ find, replacement })),
]

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
        'packages/ui-react/src/**/*.ts',
      ],
      // Lines of wiring, run for real by `bin.test.ts` and `process.test.ts`.
      exclude: [
        'packages/ui-cli/src/bin.ts',
        'packages/ui-viewer/src/viewer.ts',
        'packages/ui-viewer/src/app/main.ts',
      ],
      reporter: ['text-summary'],
      thresholds: {
        'packages/ui-spec/src/**/*.ts': { lines: 95 },
        'packages/ui-text/src/**/*.ts': { lines: 95 },
        'packages/ui-render/src/**/*.ts': { lines: 95 },
        'packages/ui/src/**/*.ts': { lines: 95 },
        'packages/ui-viewer/src/**/*.ts': { lines: 95 },
        'packages/ui-cli/src/**/*.ts': { lines: 95 },
        'packages/ui-react/src/**/*.ts': { lines: 95 },
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
          // The feed app is browser code, in a package that is otherwise Node.
          exclude: [...configDefaults.exclude, 'packages/ui-viewer/test/app/**'],
          environment: 'node',
          env: stateEnv,
          testTimeout,
        },
      },
      {
        resolve: { alias },
        oxc: { define },
        test: {
          name: 'jsdom',
          include: [
            'packages/{ui-render,ui,ui-react}/test/**/*.test.{ts,tsx}',
            'packages/ui-viewer/test/app/**/*.test.ts',
          ],
          environment: 'jsdom',
          env: { ...stateEnv, VUI_REACT_MAJOR: '19' },
          testTimeout,
        },
      },
      {
        resolve: { alias: react18Alias },
        oxc: { define },
        test: {
          name: 'jsdom-react18',
          include: ['packages/ui-react/test/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          env: { ...stateEnv, VUI_REACT_MAJOR: '18' },
          testTimeout,
        },
      },
    ],
  },
})
