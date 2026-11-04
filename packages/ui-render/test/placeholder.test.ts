import { describe, expect, it } from 'vitest'
import { dependsOn, packageName } from '../src/index.js'

describe('@vadd/ui-render placeholder', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui-render')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec'])
  })

  it('runs under jsdom', () => {
    expect(document.createElement('div').tagName).toBe('DIV')
  })
})
