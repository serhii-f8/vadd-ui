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
