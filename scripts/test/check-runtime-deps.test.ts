import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editJson, makeWorkspace, run } from './helpers.js'

const script = 'check-runtime-deps.mjs'
const check = (root: string) => run(script, '--root', root)

describe('check-runtime-deps', () => {
  it('passes the real workspace', () => {
    const { code, out } = run(script)
    expect(out).toContain('7 packages')
    expect(code).toBe(0)
  })

  describe.each(['ui-spec', 'ui-render', 'ui'])('%s', (name) => {
    it.each(['dependencies', 'peerDependencies', 'optionalDependencies'])(
      'fails on a third-party entry in %s',
      (field) => {
        const root = makeWorkspace()
        editJson(root, `packages/${name}/package.json`, (pkg) => {
          pkg[field] = { ...(pkg[field] as object), lodash: '^4.0.0' }
        })
        const { code, out } = check(root)
        expect(code).toBe(1)
        expect(out).toContain(`@vadd/${name}`)
        expect(out).toContain('lodash')
      },
    )

    it('fails on bundleDependencies', () => {
      const root = makeWorkspace()
      editJson(root, `packages/${name}/package.json`, (pkg) => {
        pkg.bundleDependencies = ['lodash']
      })
      expect(check(root).code).toBe(1)
    })
  })

  it('allows a third-party dependency where §3 does not forbid it', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-cli/package.json', (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies as object), lodash: '^4.0.0' }
    })
    expect(check(root).code).toBe(0)
  })

  it('fails when a §3 edge is missing', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-render/package.json', (pkg) => {
      pkg.dependencies = {}
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('missing §3 dependency @vadd/ui-spec')
  })

  it('fails on a workspace edge §3 does not have', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-cli/package.json', (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies as object), '@vadd/ui-react': 'workspace:*' }
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('@vadd/ui-react')
  })

  it('fails on a workspace edge not using the workspace protocol', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-render/package.json', (pkg) => {
      pkg.dependencies = { '@vadd/ui-spec': '^1.0.0' }
    })
    expect(check(root).code).toBe(1)
  })

  it('reports a broken manifest without a stack trace', () => {
    const root = makeWorkspace()
    writeFileSync(join(root, 'packages/ui/package.json'), '{ nope')
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('packages/ui/package.json: unreadable')
    expect(out).not.toContain('    at ')
  })
})
