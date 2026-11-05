import { type Formatted, type InlineToken, STATUS_TONES, type Status, type Tone } from '@vadd/ui-spec'
import { el } from './el.js'

export type LinkHandler = (url: string) => void

// VD-051: the same marks as the text renderer. `none` has no mark there, but §15.2 wants an
// icon on every status.
const STATUS_ICONS: Readonly<Record<Status, string>> = {
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

/** §15.2: an icon and a text label, so a status never rests on color alone. */
export function statusBadge(status: Status): HTMLElement {
  return el('span', { class: `vui-status ${toneClass(STATUS_TONES[status])}` }, [
    el('span', { class: 'vui-status-icon', 'aria-hidden': 'true' }, STATUS_ICONS[status]),
    el('span', { class: 'vui-status-label' }, status),
  ])
}

function link(href: string, children: Node[], handler: LinkHandler | undefined): HTMLElement {
  const native = handler === undefined || href.startsWith('#')
  const click = (event: MouseEvent) => {
    event.preventDefault()
    try {
      handler?.(href)
    } catch {
      // The host's handler is the host's failure, and nothing here can show it (§9.3).
    }
  }
  return el('a', native ? { href, class: 'vui-link' } : { href, class: 'vui-link', on: { click } }, children)
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
