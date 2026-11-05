import { describe, expect, it } from 'vitest'
import { dependsOn, packageName, prepare, renderOutput, run, writeOutput } from '../src/index.js'

describe('@vadd/ui-cli', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@vadd/ui-cli')
  })

  it('offers what task 15 and 16 build on', () => {
    expect(typeof run).toBe('function')
    expect(typeof prepare).toBe('function')
    expect(typeof renderOutput).toBe('function')
    expect(typeof writeOutput).toBe('function')
  })

  it('reaches its §3 dependencies', () => {
    expect(dependsOn).toEqual(['@vadd/ui-spec', '@vadd/ui', '@vadd/ui-text', '@vadd/ui-viewer'])
  })
})
