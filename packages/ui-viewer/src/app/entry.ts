import { render, stylesheet } from '@vadd/ui'
import type { DocHeader } from '../doc-header.js'
import { copyText } from './copy.js'
import { el } from './dom.js'

const UNTITLED = 'Untitled'
const LOAD_FAILED = 'This document could not be loaded.'
const COPY_LABEL = 'Copy spec'
const COPY_RESULT_MS = 2000

/**
 * The entry prints the title, so a document's own would be a second copy. The margin keeps a
 * `#id` target clear of the sticky bar.
 */
const DOCUMENT_CSS =
  '.vui-title{display:none}.vui-header:not(:has(.vui-subtitle)){display:none}[id]{scroll-margin-top:64px}'

export interface EntryOptions {
  /** Otherwise it starts folded and reads its document on the first open. */
  open: boolean
  load: (id: string) => Promise<string>
  /** Called once a document has made the entry taller. */
  onGrow: () => void
  track: (root: HTMLElement) => void
  openLink: (url: string) => void
}

function timeOf(createdAt: string): HTMLTimeElement {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return el('time', {}, createdAt)
  const text = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return el('time', { datetime: createdAt }, text)
}

function decoded(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

/** VD-100: `reveal` has opened what hides the target, but a browser only jumps in a document. */
function jumpWithin(shadow: ShadowRoot): void {
  shadow.addEventListener('click', (event) => {
    const link = (event.target as Element).closest('a[href^="#"]')
    if (link === null) return
    event.preventDefault()
    const fragment = (link.getAttribute('href') as string).slice(1)
    const target = shadow.getElementById(fragment) ?? shadow.getElementById(decoded(fragment))
    target?.scrollIntoView()
  })
}

export function createEntry(header: DocHeader, options: EntryOptions): HTMLElement {
  const { open, load, onGrow, track, openLink } = options
  const { seq, id, title, createdAt, cwd, branch } = header
  const headingId = `entry-${seq}`
  const body = el('div', { class: 'feed-body' })
  const toggle = el('button', { type: 'button', class: 'feed-button' })
  const copy = el('button', { type: 'button', class: 'feed-button' }, COPY_LABEL)
  const standalone = el(
    'a',
    {
      class: 'feed-button',
      href: `docs/${encodeURIComponent(id)}.html`,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    'Open standalone',
  )
  const meta = el('div', { class: 'feed-meta' }, timeOf(createdAt))
  if (branch !== null) meta.append(el('span', { class: 'feed-branch' }, branch))
  if (cwd !== null) meta.append(el('span', { class: 'feed-cwd', title: cwd }, cwd))
  const entry = el(
    'article',
    { class: 'feed-entry', 'aria-labelledby': headingId },
    el(
      'header',
      { class: 'feed-head' },
      el('h2', { class: 'feed-title', id: headingId }, title ?? UNTITLED),
      meta,
      el('div', { class: 'feed-actions' }, toggle, standalone, copy),
    ),
    body,
  )

  let text: Promise<string> | undefined
  let drawn = false
  let note: HTMLElement | undefined

  /** One read at a time, and a failure is forgotten so the next attempt reads again. */
  const read = (): Promise<string> => {
    text ??= load(id).catch((error: unknown) => {
      text = undefined
      throw error
    })
    return text
  }

  const draw = async (): Promise<void> => {
    if (drawn) return
    drawn = true
    note?.remove()
    note = undefined
    try {
      const document = await read()
      const shadow = body.attachShadow({ mode: 'open' })
      const root = el('div')
      track(root)
      jumpWithin(shadow)
      shadow.append(el('style', {}, stylesheet + DOCUMENT_CSS), root)
      render(document, root, { linkHandler: openLink })
    } catch {
      drawn = false
      note = el('p', { class: 'feed-note' }, LOAD_FAILED)
      entry.append(note)
    }
    onGrow()
  }

  let opened = open

  const show = (): void => {
    body.hidden = !opened
    toggle.textContent = opened ? 'Fold' : 'Unfold'
    toggle.setAttribute('aria-expanded', String(opened))
    if (opened) void draw()
  }

  toggle.addEventListener('click', () => {
    opened = !opened
    show()
  })
  copy.addEventListener('click', async () => {
    const copied = await read().then(copyText, () => false)
    copy.textContent = copied ? 'Copied' : 'Copy failed'
    setTimeout(() => {
      copy.textContent = COPY_LABEL
    }, COPY_RESULT_MS)
  })

  show()
  return entry
}
