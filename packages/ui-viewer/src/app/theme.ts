export type ThemeName = 'dark' | 'light'

/** The part of `MediaQueryList` this uses. */
export interface MediaLike {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
}

/** The part of `Storage` this uses. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** A getter, since reading `window.localStorage` itself throws where storage is blocked. */
export type StorageSource = () => StorageLike | undefined

const STORAGE_KEY = 'vui-viewer-theme'

function isTheme(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light'
}

/** Every access may throw (blocked storage, private mode): then there is no stored choice. */
function readChoice(storage: StorageSource | undefined): ThemeName | undefined {
  try {
    const value = storage?.()?.getItem(STORAGE_KEY)
    return isTheme(value) ? value : undefined
  } catch {
    return undefined
  }
}

function writeChoice(storage: StorageSource | undefined, name: ThemeName): void {
  try {
    storage?.()?.setItem(STORAGE_KEY, name)
  } catch {
    // Kept in memory for this page, as before (B9).
  }
}

export interface Theme {
  readonly current: ThemeName
  /** Keeps `data-vui-theme` on `root` current (VD-007), until the returned untrack is called. */
  track(root: HTMLElement): () => void
  toggle(): void
  onChange(listener: (current: ThemeName) => void): void
}

/**
 * `:root` cannot match in a shadow stylesheet, so the OS rule never reaches a document and
 * the scheme has to be written on each root. A manual choice is kept in `storage` when it
 * works, so a reload keeps it, and falls back to the OS otherwise (B9, VD-211; §9.3's rule is
 * the renderer's, and this is Viewer chrome). Only attributes change: no re-render (§8.2).
 */
export function createTheme(media: MediaLike, html: HTMLElement, storage?: StorageSource): Theme {
  const roots = new Set<HTMLElement>()
  const listeners: ((current: ThemeName) => void)[] = []
  let manual: ThemeName | undefined = readChoice(storage)

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
      roots.add(root)
      root.setAttribute('data-vui-theme', current())
      return () => {
        roots.delete(root)
      }
    },
    toggle() {
      manual = current() === 'dark' ? 'light' : 'dark'
      writeChoice(storage, manual)
      apply()
    },
    onChange(listener) {
      listeners.push(listener)
    },
  }
}
