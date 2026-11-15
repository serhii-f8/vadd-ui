import {
  type Formatted,
  type InlineToken,
  STATUS_TONES,
  type Status,
  TONES,
  type Tone,
} from '@vadd/ui-spec'
import { el } from './el.js'
import { reveal } from './reveal.js'

export type LinkHandler = (url: string) => void

// VD-051: the same marks as the text renderer. `none` has no mark there, but §15.2 wants an
// icon on every status.
export const STATUS_ICONS: Readonly<Record<Status, string>> = {
  ok: '✓',
  fail: '✗',
  warn: '⚠',
  info: 'ℹ',
  run: '▶',
  wait: '…',
  skip: '⊘',
  none: '○',
}

const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  ok: 'vui-tone-ok',
  warn: 'vui-tone-warn',
  err: 'vui-tone-err',
  info: 'vui-tone-info',
  muted: 'vui-tone-muted',
  accent: 'vui-tone-accent',
  default: 'vui-tone-default',
}

export function toneClass(tone: Tone): string {
  return TONE_CLASSES[tone]
}

/** The tone a document field names, if it names one. */
export function toneOf(value: unknown): Tone | undefined {
  return (TONES as readonly unknown[]).includes(value) ? (value as Tone) : undefined
}

// VD-051's marks, with a word for the tones that have one. `muted`, `accent` and `default`
// mean nothing, so color tells nothing that a mark should repeat.
const TONE_MARKS: Partial<Readonly<Record<Tone, readonly [string, string]>>> = {
  ok: ['✓', 'ok'],
  warn: ['⚠', 'warning'],
  err: ['✗', 'error'],
  info: ['ℹ', 'info'],
}

/** VD-068's classes: a bar for any tone but `default`, and room for a mark if it has one. */
export function tonedClass(tone: Tone): string {
  if (tone === 'default') return toneClass(tone)
  return `${toneClass(tone)} vui-toned${TONE_MARKS[tone] === undefined ? '' : ' vui-marked'}`
}

/** §15.2: what a tone says, without color, placed by `className`. */
export function toneMark(tone: Tone, className = 'vui-node-mark'): HTMLElement | null {
  const mark = TONE_MARKS[tone]
  if (mark === undefined) return null
  const [glyph, word] = mark
  return el('span', { class: className }, [
    el('span', { 'aria-hidden': 'true' }, glyph),
    el('span', { class: 'vui-sr-only' }, word),
  ])
}

/** §15.2: an icon and a text label, so a status never rests on color alone. */
export function statusBadge(status: Status): HTMLElement {
  return el('span', { class: `vui-status ${toneClass(STATUS_TONES[status])}` }, [
    el('span', { class: 'vui-status-icon', 'aria-hidden': 'true' }, STATUS_ICONS[status]),
    el('span', { class: 'vui-status-label' }, status),
  ])
}

function link(href: string, children: Node[], handler: LinkHandler | undefined): HTMLElement {
  if (href.startsWith('#')) {
    const click = (event: MouseEvent) => reveal(event.currentTarget as Element, href.slice(1))
    return el('a', { href, class: 'vui-link', on: { click } }, children)
  }
  if (handler === undefined) return el('a', { href, class: 'vui-link' }, children)
  const click = (event: MouseEvent) => {
    event.preventDefault()
    try {
      handler(href)
    } catch {
      // The host's handler is the host's failure, and nothing here can show it (§9.3).
    }
  }
  return el('a', { href, class: 'vui-link', on: { click } }, children)
}

function renderToken(token: InlineToken, handler: LinkHandler | undefined): Node {
  switch (token.type) {
    case 'text':
      return document.createTextNode(token.text)
    case 'code':
      return el('code', { class: 'vui-code' }, token.text)
    case 'status':
      return statusBadge(token.status)
    case 'bold':
      return el('strong', {}, renderInline(token.children, handler))
    case 'italic':
      return el('em', {}, renderInline(token.children, handler))
    case 'strike':
      return el('s', {}, renderInline(token.children, handler))
    case 'link':
      return link(token.href, renderInline(token.children, handler), handler)
  }
}

/** The §5.5 token tree as nodes. Nothing here parses a string as markup (§15.1). */
export function renderInline(tokens: InlineToken[], handler?: LinkHandler): Node[] {
  return tokens.map((token) => renderToken(token, handler))
}

function pathNodes(text: string, base: string): Node[] {
  const head = text.slice(0, text.length - base.length)
  return [document.createTextNode(head), el('span', { class: 'vui-path-base' }, base)]
}

function valueContent(formatted: Formatted, handler: LinkHandler | undefined): Node[] {
  const { text, status, inline, href, mono, base } = formatted
  if (status !== undefined) return [statusBadge(status)]
  if (inline !== undefined) return renderInline(inline, handler)
  if (href !== undefined) return [link(href, [document.createTextNode(text)], handler)]
  if (mono === true) {
    return [el('code', { class: 'vui-code' }, base === undefined ? text : pathNodes(text, base))]
  }
  return [document.createTextNode(text)]
}

/** One `formatValue` result, using every field it sets (§7). */
export function renderValue(formatted: Formatted, handler?: LinkHandler): Node[] {
  const { tone, title } = formatted
  const content = valueContent(formatted, handler)
  if (tone === undefined && title === undefined) return content
  const attributes = tone === undefined ? { title } : { title, class: toneClass(tone) }
  return [el('span', attributes, content)]
}
