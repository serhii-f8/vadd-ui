import { stylesheet } from '@vadd/ui'
import type { DocHeader } from '../doc-header.js'
import { el } from './dom.js'
import { createEntry, type Entry } from './entry.js'
import { createFollow } from './follow.js'
import { type SourceLike, type Status, startStream } from './stream.js'
import { feedCss } from './styles.js'
import { createTheme, type ThemeName } from './theme.js'

/** A full store is 500 documents, and nobody reads the old ones on arrival. */
const OPEN_IN_BATCH = 10

const STATUS_TEXT: Record<Status, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  gone: 'This Viewer has stopped. Run vui show to open a new feed.',
}

const THEME_LABEL: Record<ThemeName, string> = { dark: 'Light theme', light: 'Dark theme' }

/** Builds the page and connects it. Everything is relative, so the token prefix just works. */
export function startFeed(win: Window): void {
  const { document: page } = win
  const media = win.matchMedia('(prefers-color-scheme: dark)')
  const theme = createTheme(media, page.documentElement, () => win.localStorage)
  const follow = createFollow(win)

  const status = el('p', { class: 'feed-status', role: 'status' })
  const toggle = el('button', { type: 'button', class: 'feed-button feed-theme' })
  const empty = el(
    'p',
    { class: 'feed-empty' },
    'No visuals yet. They appear here as agents show them.',
  )
  const list = el('main', { class: 'feed-list' }, empty)

  const showToggle = (current: ThemeName): void => {
    toggle.textContent = THEME_LABEL[current]
  }
  showToggle(theme.current)
  theme.onChange(showToggle)
  toggle.addEventListener('click', () => theme.toggle())

  page.head.append(el('style', {}, stylesheet + feedCss))
  page.body.className = 'vui-root feed'
  theme.track(page.body)
  const name = el('h1', { class: 'feed-name' }, 'vadd-ui Viewer')
  const bar = el('div', { class: 'feed-bar' }, name, status, toggle)
  page.body.append(bar, list)

  // A wrapped bar is taller, and the browser has to keep focus and `#id` targets out from under it.
  const measure = (): void => {
    const height = `${bar.offsetHeight}px`
    page.documentElement.style.setProperty('--feed-bar', height)
  }
  measure()
  win.addEventListener('resize', measure)

  const load = async (id: string): Promise<string> => {
    const reply = await win.fetch(`api/docs/${encodeURIComponent(id)}`)
    if (!reply.ok) throw new Error(String(reply.status))
    return reply.text()
  }

  const openLink = (url: string): void => {
    win.open(url, '_blank', 'noopener,noreferrer')
  }

  /** By seq, so an update finds the entry it replaces. */
  const shown = new Map<number, Entry>()
  const entryOf = (header: DocHeader, open: boolean): Entry => {
    const onGrow = () => follow.pin()
    const entry = createEntry(header, { open, load, onGrow, track: theme.track, openLink })
    shown.set(header.seq, entry)
    return entry
  }

  const addAll = (headers: DocHeader[]): void => {
    empty.hidden = true
    const firstOpen = headers.length - OPEN_IN_BATCH
    headers.forEach((header, index) => {
      list.append(entryOf(header, index >= firstOpen))
    })
    follow.pin()
  }

  /** `--replace`: the same place in the feed, open, with what the agent sent last. */
  const update = (header: DocHeader): void => {
    const old = shown.get(header.seq)
    if (old === undefined) return
    // Untracked and destroyed, or every update would keep a rendered document alive.
    old.dispose()
    old.replaceWith(entryOf(header, true))
  }

  startStream({
    open: (url) => new EventSource(url) as unknown as SourceLike,
    fetch: (url) => win.fetch(url),
    onDocs: addAll,
    onUpdate: update,
    onStatus: (state) => {
      // A live region reads every write, and retries repeat `reconnecting`.
      if (status.dataset.state === state) return
      status.textContent = STATUS_TEXT[state]
      status.dataset.state = state
      measure()
    },
  })
}
