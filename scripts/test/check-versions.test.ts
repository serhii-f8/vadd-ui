import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editJson, makeWorkspace, run } from './helpers.js'

const script = 'check-versions.mjs'
const check = (root: string) => run(script, '--root', root)

describe('check-versions', () => {
  it('passes the real workspace', () => {
    const { code, out } = run(script)
    expect(out).toContain('8 packages')
    expect(code).toBe(0)
  })

  it('fails on a drifted package and names both versions', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-text/package.json', (pkg) => {
      pkg.version = '9.9.9'
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('@vadd/ui-text')
    expect(out).toContain('9.9.9')
    expect(out).toContain('1.0.0')
  })

  it('fails on drift in the skill package', () => {
    const root = makeWorkspace()
    editJson(root, 'skills/vadd-ui/package.json', (pkg) => {
      pkg.version = '9.9.9'
    })
    expect(check(root).code).toBe(1)
  })

  it('fails when the root drifts', () => {
    const root = makeWorkspace()
    editJson(root, 'package.json', (pkg) => {
      pkg.version = '9.9.9'
    })
    expect(check(root).code).toBe(1)
  })

  it('fails when no manifest has a version, rather than matching undefined', () => {
    const root = makeWorkspace()
    const manifests = readdirSync(join(root, 'packages')).map((n) => `packages/${n}/package.json`)
    for (const file of ['package.json', 'skills/vadd-ui/package.json', ...manifests]) {
      editJson(root, file, (pkg) => {
        delete pkg.version
      })
    }
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('package.json: missing version')
  })

  it('fails on a missing version', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui/package.json', (pkg) => {
      delete pkg.version
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('@vadd/ui:')
  })
})
