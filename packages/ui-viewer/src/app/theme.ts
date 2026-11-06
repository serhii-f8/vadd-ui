export type ThemeName = 'dark' | 'light'

/** The part of `MediaQueryList` this uses. */
export interface MediaLike {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
}

export interface Theme {
  readonly current: ThemeName
  /** Keeps `data-vui-theme` on `root` current. Every `.vui-root` needs this (VD-007). */
  track(root: HTMLElement): void
  toggle(): void
  onChange(listener: (current: ThemeName) => void): void
}

/**
 * `:root` cannot match in a shadow stylesheet, so the OS rule never reaches a document and
 * the scheme has to be written on each root. The choice lives in a variable, so a reload
 * goes back to the OS (§4.1). Only attributes change: no re-render (§8.2).
 */
export function createTheme(media: MediaLike, html: HTMLElement): Theme {
  const roots: HTMLElement[] = []
  const listeners: ((current: ThemeName) => void)[] = []
  let manual: ThemeName | undefined

  const current = (): ThemeName => manual ?? (media.matches ? 'dark' : 'light')

  const apply = (): void => {
    const name = current()
    html.className = name
    for (const root of roots) root.setAttribute('data-vui-theme', name)
    for (const listener of listeners) listener(name)
  }

  media.addEventListener('change', () => {
    if (manual === undefined) apply()
  })
  html.className = current()

  return {
    get current() {
      return current()
    },
    track(root) {
      roots.push(root)
      root.setAttribute('data-vui-theme', current())
    },
    toggle() {
      manual = current() === 'dark' ? 'light' : 'dark'
      apply()
    },
    onChange(listener) {
      listeners.push(listener)
    },
  }
}
