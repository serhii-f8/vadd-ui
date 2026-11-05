import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Through each package's `exports`, so this works from any install layout (VD-097), and not
// by a path that only holds inside this monorepo.
const require = createRequire(import.meta.url)

/** `vui.min.js`, as §10.1 inlines it. */
export function readBundle(): string {
  return readFileSync(require.resolve('@vadd/ui/vui.min.js'), 'utf8')
}

/** The generated JSON Schema (§13.1). */
export function readSchema(): string {
  return readFileSync(require.resolve('@vadd/ui-spec/schema.json'), 'utf8')
}
