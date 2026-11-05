import { readFileSync } from 'node:fs'
import { render } from '@vadd/ui-render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { packageName, version } from '../src/index.js'

const manifest = JSON.parse(readFileSync(`${import.meta.dirname}/../package.json`, 'utf8')) as {
  version: string
}

describe('the boot script entry', () => {
  beforeEach(() => {
    vi.resetModules()
    document.head.replaceChildren()
    document.body.replaceChildren()
    Reflect.deleteProperty(window, 'VUI')
  })

  it('exposes exactly render and the manifest version', async () => {
    await import('../src/vui.js')
    expect(Object.keys(window.VUI).sort()).toEqual(['render', 'version'])
    expect(window.VUI.version).toBe(manifest.version)
    expect(typeof window.VUI.render).toBe('function')
  })

  it('boots the page', async () => {
    const script = document.createElement('script')
    script.type = 'application/vui+json'
    script.textContent = '{ vui: 1, body: [] }'
    document.body.append(script)
    await import('../src/vui.js')
    expect(script.nextElementSibling?.className).toContain('vui-root')
    expect(document.querySelector('#vui-style')).not.toBeNull()
  })
})

describe('the ESM entry', () => {
  it('does nothing to the page on import', async () => {
    Reflect.deleteProperty(window, 'VUI')
    document.head.replaceChildren()
    vi.resetModules()
    await import('../src/index.js')
    expect(window.VUI).toBeUndefined()
    expect(document.querySelector('#vui-style')).toBeNull()
  })

  it('names itself and carries the manifest version', () => {
    expect(packageName).toBe('@vadd/ui')
    expect(version).toBe(manifest.version)
    expect(render).toBeTypeOf('function')
  })
})
