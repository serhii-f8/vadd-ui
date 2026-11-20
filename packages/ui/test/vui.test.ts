import { readFileSync } from 'node:fs'
import { pageCss, render, stylesheet } from '@vadd/ui-render'
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

describe('both bundles on one page (VD-211)', () => {
  const COMPARE = '{ vui: 1, body: [{ type: "compare", options: ["a", "b"], criteria: [] }] }'

  /** The core bundle: `vui.ts` over the core entry, as `build-bundle` aliases it. */
  async function loadCore() {
    vi.resetModules()
    vi.doMock('@vadd/ui-render', async () => ({
      ...(await vi.importActual<object>('@vadd/ui-render')),
      ...(await vi.importActual<object>('@vadd/ui-render/core')),
    }))
    await import('../src/vui.js')
    vi.doUnmock('@vadd/ui-render')
  }

  async function loadExt() {
    vi.resetModules()
    await import('../src/vui.js')
  }

  beforeEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
    Reflect.deleteProperty(window, 'VUI')
  })

  const page = () => {
    const script = document.createElement('script')
    script.type = 'application/vui+json'
    script.textContent = COMPARE
    document.body.append(script)
    return script
  }
  const roots = () => document.querySelectorAll('.vui-root')
  const placeholder = () => document.querySelector('.vui-card-placeholder')

  it('core alone names the missing bundle', async () => {
    page()
    await loadCore()
    expect(roots()).toHaveLength(1)
    expect(placeholder()?.textContent).toContain('compare needs vui-ext.min.js')
  })

  it('ext loaded after core redraws the same root with the ext tier', async () => {
    const script = page()
    await loadCore()
    const first = roots()[0]
    await loadExt()
    expect(roots()).toHaveLength(1)
    expect(roots()[0]).toBe(first)
    expect(script.nextElementSibling).toBe(first)
    expect(placeholder()).toBeNull()
    expect(document.querySelector('[data-vui-type="compare"]')).not.toBeNull()
    // The core sheet gave way to the whole one, page rules kept.
    const styles = document.querySelectorAll('style#vui-style')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe(stylesheet + pageCss)
    expect(styles[0]?.hasAttribute('data-vui-core')).toBe(false)
  })

  it("leaves a host's own stylesheet to ext as well", async () => {
    const own = document.createElement('style')
    own.id = 'vui-style'
    own.textContent = 'a{}'
    document.head.append(own)
    page()
    await loadExt()
    expect(own.textContent).toBe('a{}')
  })

  it('core loaded after ext leaves the page and VUI to ext', async () => {
    page()
    await loadExt()
    const owner = window.VUI
    const drawn = roots()[0]?.firstChild
    await loadCore()
    expect(window.VUI).toBe(owner)
    expect(roots()).toHaveLength(1)
    expect(roots()[0]?.firstChild).toBe(drawn)
    expect(placeholder()).toBeNull()
  })

  it('two scripts while loading render once, by ext, in either order', async () => {
    for (const order of [
      [loadCore, loadExt],
      [loadExt, loadCore],
    ]) {
      document.body.replaceChildren()
      Reflect.deleteProperty(window, 'VUI')
      vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
      page()
      for (const load of order) await load()
      vi.restoreAllMocks()
      expect(roots()).toHaveLength(0)
      document.dispatchEvent(new Event('DOMContentLoaded'))
      expect(roots()).toHaveLength(1)
      expect(placeholder()).toBeNull()
    }
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
