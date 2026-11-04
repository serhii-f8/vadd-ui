#!/usr/bin/env node
// §17.4: renderer packages compile to ES2020, Node code to what Node 20 runs.

import { finish, rootArg } from './lib/cli.mjs'
import { TS_TARGETS } from './lib/targets.mjs'
import { PACKAGES, readJson } from './lib/workspace.mjs'

/** @type {string[]} */
const findings = []
const root = rootArg(process.argv.slice(2))

for (const [kind, target] of Object.entries(TS_TARGETS)) {
  const file = `tsconfig.${kind}.json`
  const config = readJson(root, file, findings)
  if (config && config.compilerOptions?.target !== target) {
    findings.push(`${file}: target must be ${target}`)
  }
}

for (const { name, dir, target } of PACKAGES) {
  const config = readJson(root, `${dir}/tsconfig.json`, findings)
  if (!config) continue
  const base = `../../tsconfig.${target}.json`
  if (config.extends !== base) findings.push(`${name}: must extend ${base}`)
  if (config.compilerOptions?.target) findings.push(`${name}: must not override target`)
}

finish('check-targets', findings, `${PACKAGES.length} packages on their target`)
