#!/usr/bin/env node
// §13.1: writes the JSON Schema from the canonical types. `--check` compares instead, so
// `pnpm check` fails when the built schema is older than the types.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { finish, rootArg } from './lib/cli.mjs'
import { generateSchema } from './lib/schema-gen.mjs'

const argv = process.argv.slice(2)
const root = rootArg(argv)
const outIndex = argv.indexOf('--out')
const out = outIndex === -1 ? 'packages/ui-spec/dist/vui.schema.json' : (argv[outIndex + 1] ?? '')
const file = resolve(root, out)
const text = `${JSON.stringify(
  generateSchema(readFileSync(resolve(root, 'packages/ui-spec/src/types.ts'), 'utf8')),
  null,
  2,
)}\n`

if (argv.includes('--check')) {
  const fresh = existsSync(file) && readFileSync(file, 'utf8') === text
  finish('generate-schema', fresh ? [] : [`${out}: stale or missing; run pnpm build`], 'up to date')
} else {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  finish('generate-schema', [], `wrote ${out}`)
}
