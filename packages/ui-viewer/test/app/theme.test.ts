import { describe, expect, it } from 'vitest'
import { createTheme, type MediaLike } from '../../src/app/theme.js'

class FakeMedia implements MediaLike {
  #listener: (() => void) | undefined
  constructor(public matches: boolean) {}
  addEventListener(_type: 'change', listener: () => void): void {
    this.#listener = listener
  }
  flip(matches: boolean): void {
    this.matches = matches
    this.#listener?.()
  }
}

function setup(dark: boolean) {
  const media = new FakeMedia(dark)
  const html = document.createElement('html')
  const root = document.createElement('div')
  const theme = createTheme(media, html)
  theme.track(root)
  return { media, html, root, theme }
}

describe('createTheme', () => {
  it('starts from the OS scheme, on <html> (§8.1) and on each root (VD-007)', () => {
    const dark = setup(true)
    expect(dark.theme.current).toBe('dark')
    expect(dark.html.className).toBe('dark')
    expect(dark.root.dataset.vuiTheme).toBe('dark')
    expect(setup(false).root.dataset.vuiTheme).toBe('light')
  })

  it('follows a change of the OS scheme while nobody has chosen', () => {
    const { media, html, root } = setup(false)
    media.flip(true)
    expect(root.dataset.vuiTheme).toBe('dark')
    expect(html.className).toBe('dark')
  })

  it('toggles a dark OS to light and back', () => {
    const { theme, root, html } = setup(true)
    theme.toggle()
    expect(root.dataset.vuiTheme).toBe('light')
    expect(html.className).toBe('light')
    theme.toggle()
    expect(root.dataset.vuiTheme).toBe('dark')
  })

  it('toggles a light OS to dark and back', () => {
    const { theme, root } = setup(false)
    theme.toggle()
    expect(root.dataset.vuiTheme).toBe('dark')
    theme.toggle()
    expect(root.dataset.vuiTheme).toBe('light')
  })

  it('keeps a manual choice when the OS scheme changes', () => {
    const { media, theme, root } = setup(true)
    theme.toggle()
    media.flip(false)
    media.flip(true)
    expect(root.dataset.vuiTheme).toBe('light')
  })

  it('gives a root tracked later the current theme', () => {
    const { theme } = setup(false)
    theme.toggle()
    const late = document.createElement('div')
    theme.track(late)
    expect(late.dataset.vuiTheme).toBe('dark')
  })

  it('tells listeners of a toggle and of an OS change', () => {
    const { theme, media } = setup(false)
    const seen: string[] = []
    theme.onChange((current) => seen.push(current))
    media.flip(true)
    theme.toggle()
    expect(seen).toEqual(['dark', 'light'])
  })
})

/** A `Storage` stand-in, or one whose every call throws, as a blocked one does. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const blocked = {
  getItem: (): string | null => {
    throw new Error('SecurityError')
  },
  setItem: (): void => {
    throw new Error('SecurityError')
  },
}

describe('a remembered choice (B9)', () => {
  const make = (dark: boolean, storage: () => unknown) => {
    const html = document.createElement('html')
    const theme = createTheme(new FakeMedia(dark), html, storage as never)
    return { html, theme }
  }

  it('starts from the stored choice over the OS scheme', () => {
    const { theme, html } = make(false, () => memoryStorage({ 'vui-viewer-theme': 'dark' }))
    expect(theme.current).toBe('dark')
    expect(html.className).toBe('dark')
  })

  it('stores each toggle', () => {
    const storage = memoryStorage()
    const { theme } = make(true, () => storage)
    theme.toggle()
    expect(storage.data.get('vui-viewer-theme')).toBe('light')
    theme.toggle()
    expect(storage.data.get('vui-viewer-theme')).toBe('dark')
  })

  it('ignores a stored value that is not a theme', () => {
    const { theme } = make(true, () => memoryStorage({ 'vui-viewer-theme': 'blue' }))
    expect(theme.current).toBe('dark')
  })

  it('stops following the OS once a stored choice applies', () => {
    const media = new FakeMedia(false)
    const html = document.createElement('html')
    const storage = memoryStorage({ 'vui-viewer-theme': 'light' })
    createTheme(media, html, () => storage)
    media.flip(true)
    expect(html.className).toBe('light')
  })

  it.each([
    ['calls that throw', () => blocked],
    [
      'a getter that throws',
      () => {
        throw new Error('SecurityError')
      },
    ],
    ['no storage', () => undefined],
  ])('falls back to the OS scheme with %s, and still toggles', (_name, storage) => {
    const { theme, html } = make(true, storage)
    expect(theme.current).toBe('dark')
    theme.toggle()
    expect(html.className).toBe('light')
  })
})

describe('untrack', () => {
  it('stops updating a root it was told to let go of', () => {
    const html = document.createElement('html')
    const theme = createTheme(new FakeMedia(true), html)
    const root = document.createElement('div')
    const untrack = theme.track(root)
    untrack()
    theme.toggle()
    expect(root.dataset.vuiTheme).toBe('dark')
  })
})
