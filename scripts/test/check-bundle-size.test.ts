import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot, run } from './helpers.js'

const script = 'check-bundle-size.mjs'
const KIB = 1024

function tree(
  options: { bundle?: Buffer; ext?: Buffer; exports?: unknown; manifest?: string } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'vui-bundle-'))
  mkdirSync(join(root, 'packages/ui/dist'), { recursive: true })
  const manifest = options.manifest ?? JSON.stringify({ exports: options.exports ?? {} })
  writeFileSync(join(root, 'packages/ui/package.json'), manifest)
  if (options.bundle) writeFileSync(join(root, 'packages/ui/dist/vui.min.js'), options.bundle)
  if (options.ext) writeFileSync(join(root, 'packages/ui/dist/vui-ext.min.js'), options.ext)
  return root
}

const check = (root: string) => run(script, '--root', root)

describe('check-bundle-size', () => {
  it('reports no bundle yet before a manifest declares one', () => {
    const { code, out } = check(tree())
    expect(out).toContain('no bundle yet')
    expect(code).toBe(0)
  })

  it('has the real manifest declare the bundle, so a dropped build step fails', () => {
    const manifest = JSON.parse(readFileSync(`${repoRoot}packages/ui/package.json`, 'utf8'))
    expect(manifest.exports['./vui.min.js']).toBe('./dist/vui.min.js')
    expect(manifest.exports['./vui-ext.min.js']).toBe('./dist/vui-ext.min.js')
  })

  it.each([
    ['a closing script tag', 'a="</script>"'],
    ['the same tag in capitals', 'a="</SCRIPT "'],
    ['a comment opener', 'a="<!--"'],
  ])('fails on %s, which would break the bundle inlined in HTML', (_, text) => {
    const { code, out } = check(tree({ bundle: Buffer.from(text) }))
    expect(code).toBe(1)
    expect(out).toContain('inline')
  })

  it('passes a bundle of exactly 120 KiB that gzips under 38 KiB', () => {
    const { code, out } = check(tree({ bundle: Buffer.alloc(120 * KIB, 'a') }))
    expect(out).toContain('120.0 KiB')
    expect(code).toBe(0)
  })

  it('fails one byte over the minified budget', () => {
    const { code, out } = check(tree({ bundle: Buffer.alloc(120 * KIB + 1, 'a') }))
    expect(code).toBe(1)
    expect(out).toContain('minified')
  })

  it('fails a bundle under the minified budget but over the gzip budget', () => {
    const { code, out } = check(tree({ bundle: randomBytes(60 * KIB) }))
    expect(code).toBe(1)
    expect(out).toContain('gzip')
  })

  it('fails when the manifest declares the bundle and the file is missing', () => {
    const { code, out } = check(tree({ exports: { './vui.min.js': './dist/vui.min.js' } }))
    expect(code).toBe(1)
    expect(out).not.toContain('no bundle yet')
    expect(out).toContain('vui.min.js')
  })

  it('reports a broken manifest without a stack trace', () => {
    const { code, out } = check(tree({ manifest: '{ nope' }))
    expect(code).toBe(1)
    expect(out).toContain('unreadable')
    expect(out).not.toContain('    at ')
  })

  describe('vui-ext.min.js (VD-182)', () => {
    it('passes 128 KiB and fails one byte more', () => {
      expect(check(tree({ ext: Buffer.alloc(128 * KIB, 'a') })).code).toBe(0)
      const { code, out } = check(tree({ ext: Buffer.alloc(128 * KIB + 1, 'a') }))
      expect(code).toBe(1)
      expect(out).toContain('vui-ext.min.js: 128.0 KiB minified, budget 128.0 KiB')
    })

    it('fails over 42 KiB gzip, which vui.min.js would fail at 38', () => {
      const { code, out } = check(tree({ ext: randomBytes(44 * KIB) }))
      expect(code).toBe(1)
      expect(out).toContain('vui-ext.min.js')
      expect(out).toContain('gzip, budget 42.0 KiB')
    })

    it('fails on a comment opener, as the core bundle does', () => {
      const { code, out } = check(tree({ ext: Buffer.from('a="<!--"') }))
      expect(code).toBe(1)
      expect(out).toContain('vui-ext.min.js: cannot be inlined in HTML')
    })

    it('fails when the manifest declares it and the file is missing', () => {
      const exports = { './vui.min.js': './dist/vui.min.js', './vui-ext.min.js': './x' }
      const { code, out } = check(tree({ bundle: Buffer.from('a'), exports }))
      expect(code).toBe(1)
      expect(out).toContain('vui-ext.min.js: declared in exports but missing')
    })
  })
})
