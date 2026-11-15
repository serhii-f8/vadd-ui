#!/usr/bin/env node
// §10.3, §15.1, §17.2: every published package goes to npm with provenance, public, shipping
// `dist`; `@vadd/ui` keeps `dist/vui.min.js` as the CDN path for the whole major; the release
// workflow can sign. Publishing itself is the user's (RELEASE_CHECKLIST.md).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { finish, rootArg } from './lib/cli.mjs'
import { readJson } from './lib/workspace.mjs'

const CDN_FILE = 'dist/vui.min.js'

/** @type {string[]} */
const findings = []
const root = rootArg(process.argv.slice(2))
let published = 0

for (const entry of readdirSync(join(root, 'packages'))) {
  const file = `packages/${entry}/package.json`
  if (!existsSync(join(root, file))) continue
  const manifest = readJson(root, file, findings)
  if (!manifest || manifest.private === true) continue
  published += 1
  const name = manifest.name ?? file
  const config = manifest.publishConfig ?? {}
  if (config.access !== 'public') findings.push(`${name}: publishConfig.access must be "public"`)
  if (config.provenance !== true) findings.push(`${name}: publishConfig.provenance must be true`)
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
    findings.push(`${name}: files must include "dist"`)
  }
  if (typeof manifest.license !== 'string') findings.push(`${name}: license missing`)
  if (name === '@vadd/ui') {
    for (const field of ['jsdelivr', 'unpkg']) {
      if (manifest[field] !== CDN_FILE) findings.push(`${name}: ${field} must be "${CDN_FILE}"`)
    }
    if (manifest.exports?.['./vui.min.js'] !== `./${CDN_FILE}`) {
      findings.push(`${name}: exports["./vui.min.js"] must be "./${CDN_FILE}"`)
    }
  }
}

const workflow = join(root, '.github/workflows/release.yml')
const release = existsSync(workflow) ? readFileSync(workflow, 'utf8') : ''
if (!release) findings.push('release.yml: missing')
else {
  if (!/^\s+id-token: write$/m.test(release)) {
    findings.push('release.yml: needs permissions id-token: write')
  }
  if (!/NPM_CONFIG_PROVENANCE: 'true'/.test(release)) {
    findings.push('release.yml: must publish with NPM_CONFIG_PROVENANCE')
  }
  if (/^\s+(push|pull_request|schedule):/m.test(release)) {
    findings.push('release.yml: must run by hand only (workflow_dispatch)')
  }
}

if (published === 0) findings.push('nothing checked')
finish('check-publish', findings, `${published} packages publish with provenance`)
