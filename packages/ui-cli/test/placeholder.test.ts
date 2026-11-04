import { describe, expect, it } from 'vitest'
import { dependsOn, packageName } from '../src/index.js'

describe('@vadd/ui-cli placeholder', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui-cli')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec', '@vadd/ui', '@vadd/ui-text', '@vadd/ui-viewer'])
  })
})
