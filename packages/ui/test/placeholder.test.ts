import { describe, expect, it } from 'vitest'
import { dependsOn, packageName } from '../src/index.js'

describe('@vadd/ui placeholder', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec', '@vadd/ui-render'])
  })

  it('runs under jsdom', () => {
    expect(document.createElement('div').tagName).toBe('DIV')
  })
})
