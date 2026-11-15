import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editJson, makeWorkspace, repoRoot, run } from './helpers.js'

const script = 'check-publish.mjs'

/** A copy of the manifests plus the release workflow. */
function tree(): string {
  const root = makeWorkspace()
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  const release = readFileSync(`${repoRoot}.github/workflows/release.yml`, 'utf8')
  writeFileSync(join(root, '.github/workflows/release.yml'), release)
  return root
}

const check = (root: string) => run(script, '--root', root)

describe('check-publish', () => {
  it('passes the real workspace', () => {
    const { code, out } = run(script)
    expect(out).toContain('check-publish: 7 packages publish with provenance')
    expect(code).toBe(0)
  })

  it('fails a package without provenance', () => {
    const root = tree()
    editJson(root, 'packages/ui-text/package.json', (pkg) => {
      pkg.publishConfig = { access: 'public' }
    })
    const { code, out } = check(root)
    expect(out).toContain('@vadd/ui-text: publishConfig.provenance must be true')
    expect(code).toBe(1)
  })

  it('fails a package that is not public', () => {
    const root = tree()
    editJson(root, 'packages/ui-cli/package.json', (pkg) => {
      pkg.publishConfig = { access: 'restricted', provenance: true }
    })
    expect(check(root).out).toContain('@vadd/ui-cli: publishConfig.access must be "public"')
  })

  it('fails a package that does not ship dist', () => {
    const root = tree()
    editJson(root, 'packages/ui-spec/package.json', (pkg) => {
      pkg.files = ['src']
    })
    expect(check(root).out).toContain('@vadd/ui-spec: files must include "dist"')
  })

  it('fails @vadd/ui without the CDN path (§10.3)', () => {
    const root = tree()
    editJson(root, 'packages/ui/package.json', (pkg) => {
      delete pkg.jsdelivr
      pkg.exports = { '.': './dist/index.js' }
    })
    const { code, out } = check(root)
    expect(out).toContain('@vadd/ui: jsdelivr must be "dist/vui.min.js"')
    expect(out).toContain('@vadd/ui: exports["./vui.min.js"] must be "./dist/vui.min.js"')
    expect(code).toBe(1)
  })

  it('ignores a private package', () => {
    const root = tree()
    editJson(root, 'skills/vadd-ui/package.json', (pkg) => {
      delete pkg.publishConfig
    })
    expect(check(root).code).toBe(0)
  })

  it('fails a release workflow that cannot sign provenance', () => {
    const root = tree()
    const file = join(root, '.github/workflows/release.yml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('id-token: write', 'id-token: none'))
    expect(check(root).out).toContain('release.yml: needs permissions id-token: write')
  })
})
