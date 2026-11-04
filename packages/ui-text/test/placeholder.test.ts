import { describe, expect, it } from 'vitest'
import { dependsOn, packageName } from '../src/index.js'

describe('@vadd/ui-text placeholder', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui-text')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec'])
  })
})
