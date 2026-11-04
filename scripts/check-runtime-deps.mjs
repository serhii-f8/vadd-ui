#!/usr/bin/env node
// §3 and the definition of done: `ui-spec`, `ui-render` and `ui` have no runtime
// dependency beyond their §3 workspace edges, and every package's `@vadd/*`
// dependencies equal §3.

import { finish, rootArg } from './lib/cli.mjs'
import { PACKAGES, readJson } from './lib/workspace.mjs'

const INSTALLED_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']
const BUNDLED_FIELDS = ['bundleDependencies', 'bundledDependencies']

/** @type {string[]} */
const findings = []
const root = rootArg(process.argv.slice(2))

for (const { name, dir, deps, zeroDep } of PACKAGES) {
  const manifest = readJson(root, `${dir}/package.json`, findings)
  if (!manifest) continue
  const declared = manifest.dependencies ?? {}

  for (const dep of deps) {
    if (!(dep in declared)) findings.push(`${name}: missing §3 dependency ${dep}`)
    else if (declared[dep] !== 'workspace:*') findings.push(`${name}: ${dep} must be workspace:*`)
  }
  for (const dep of Object.keys(declared)) {
    if (dep.startsWith('@vadd/') && !deps.includes(dep)) {
      findings.push(`${name}: ${dep} is not a §3 dependency`)
    }
  }

  if (!zeroDep) continue
  for (const field of INSTALLED_FIELDS) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      if (field !== 'dependencies' || !deps.includes(dep)) {
        findings.push(`${name}: runtime dependency ${dep} in ${field}`)
      }
    }
  }
  for (const field of BUNDLED_FIELDS) {
    if (manifest[field]) findings.push(`${name}: ${field} is not allowed`)
  }
}

finish('check-runtime-deps', findings, `${PACKAGES.length} packages match §3`)
