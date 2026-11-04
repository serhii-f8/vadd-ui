import { describe, expect, it } from 'vitest'
import { PathMapBuilder } from '../src/path-map.js'

describe('PathMap', () => {
  it('is the identity with no rewrites', () => {
    const paths = new PathMapBuilder().build()
    expect(paths.toInput('')).toBe('')
    expect(paths.toInput('/body/0/rows/1')).toBe('/body/0/rows/1')
  })

  it('appends the remainder to a rewritten prefix', () => {
    const builder = new PathMapBuilder()
    builder.set('/body', '')
    const paths = builder.build()
    expect(paths.toInput('/body')).toBe('')
    expect(paths.toInput('/body/2/rows/4')).toBe('/2/rows/4')
  })

  it('prefers the longest prefix', () => {
    const builder = new PathMapBuilder()
    builder.set('/body', '')
    builder.set('/body/0/children/0', '/0/children')
    const paths = builder.build()
    expect(paths.toInput('/body/0/children/0/title')).toBe('/0/children/title')
    expect(paths.toInput('/body/0/note')).toBe('/0/note')
  })

  it('matches whole segments only', () => {
    const builder = new PathMapBuilder()
    builder.set('/body/1', '/x')
    const paths = builder.build()
    expect(paths.toInput('/body/10')).toBe('/body/10')
  })

  it('rewrites the root pointer itself', () => {
    const builder = new PathMapBuilder()
    builder.set('', '/x')
    expect(builder.build().toInput('/a')).toBe('/x/a')
  })
})
