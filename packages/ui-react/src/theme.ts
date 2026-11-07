export type VuiTheme = 'light' | 'dark' | 'auto'
export type ThemeName = 'light' | 'dark'

/** The part of `MediaQueryList` this reads. */
export interface MediaLike {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/**
 * The scheme a root shows. `auto` reads the host page the way the stylesheet would outside a
 * shadow root, where its `:root.dark` and OS rules cannot match (VD-145): `.dark` or `.light`
 * on `<html>`, which is how VADD's `ThemeProvider` marks it, then an empty `class` as light,
 * and otherwise the OS.
 */
export function resolveTheme(
  theme: VuiTheme,
  html: HTMLElement,
  media: MediaLike | undefined,
): ThemeName {
  if (theme !== 'auto') return theme
  if (html.classList.contains('dark')) return 'dark'
  if (html.classList.contains('light')) return 'light'
  // The stylesheet's rule (VD-058): a toggle that removed `dark` leaves `class=""`, which
  // means light. VADD's ThemeProvider toggles exactly that way.
  if (html.getAttribute('class') === '') return 'light'
  return media?.matches === true ? 'dark' : 'light'
}

/**
 * Calls `apply` now and whenever the resolved scheme may have changed. Returns the cleanup.
 * Only an attribute changes, so nothing re-renders (§8.2).
 */
export function watchTheme(
  theme: VuiTheme,
  html: HTMLElement,
  media: MediaLike | undefined,
  apply: (name: ThemeName) => void,
): () => void {
  const update = () => apply(resolveTheme(theme, html, media))
  update()
  if (theme !== 'auto') return () => undefined
  const observer = new MutationObserver(update)
  observer.observe(html, { attributes: true, attributeFilter: ['class'] })
  media?.addEventListener('change', update)
  return () => {
    observer.disconnect()
    media?.removeEventListener('change', update)
  }
}
