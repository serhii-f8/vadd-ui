import { readBundle } from '@vadd/ui-viewer'
import { describe, expect, it } from 'vitest'
import { readSchema } from '../src/assets.js'

// The built files, which `pnpm gate` makes before it runs tests.
describe('assets, through package exports', () => {
  it('reads the bundle', () => {
    const bundle = readBundle()
    expect(bundle.length).toBeGreaterThan(50_000)
    expect(bundle).not.toMatch(/<\/script|<!--/i)
  })

  it('reads a draft 2020-12 schema', () => {
    expect(JSON.parse(readSchema()).$schema).toContain('2020-12')
  })
})
