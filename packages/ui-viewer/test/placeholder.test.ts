import { describe, expect, it } from 'vitest'
import { dependsOn, packageName } from '../src/index.js'

describe('@vadd/ui-viewer placeholder', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui-viewer')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec', '@vadd/ui'])
  })
})
