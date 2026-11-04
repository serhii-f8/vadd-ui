/** esbuild targets for the bundles later tasks build. §17.4. */
export const BROWSER_TARGET = 'es2020'
export const NODE_TARGET = 'node20'

/** The `tsconfig.<key>.json` compile targets. Node 20 runs all of ES2023. */
export const TS_TARGETS = { browser: 'ES2020', node: 'ES2023' }
