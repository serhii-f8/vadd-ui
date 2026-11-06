import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** The generated JSON Schema (§13.1). */
export function readSchema(): string {
  return readFileSync(require.resolve('@vadd/ui-spec/schema.json'), 'utf8')
}
