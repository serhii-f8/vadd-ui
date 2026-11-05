import { hasOwn, type InlineToken, type Status, type Tone } from '@vadd/ui-spec'

// What both serializers read. A component is written once, against this, so markdown and
// plain text cannot disagree on content.

export type Inline = InlineToken[]

export type Align = 'left' | 'right' | 'center'

export interface Entry {
  text: Inline
  /** Blocks nested under the item. */
  blocks?: Block[]
}

export type Block =
  | { kind: 'heading'; level: number; text: Inline }
  | { kind: 'para'; text: Inline; muted?: true }
  | { kind: 'list'; ordered: boolean; items: Entry[]; start?: number }
  | { kind: 'table'; header: Inline[]; aligns: Align[]; rows: Inline[][] }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' }

// §15.2 keeps an icon beside each label, and §19.5 shows ⚠ for `warn` (VD-051).
const STATUS_MARKS: Readonly<Record<Status, string>> = {
  ok: '✓',
  fail: '✗',
  warn: '⚠',
  info: 'ℹ',
  run: '▶',
  wait: '…',
  skip: '⊘',
  none: '',
}

const TONE_MARKS: Readonly<Record<Tone, string>> = {
  ok: '✓',
  warn: '⚠',
  err: '✗',
  info: 'ℹ',
  muted: '',
  accent: '',
  default: '',
}

export function statusMark(status: string | undefined): string {
  return status !== undefined && hasOwn(STATUS_MARKS, status)
    ? (STATUS_MARKS[status as Status] as string)
    : ''
}

export function toneMark(tone: string | undefined): string {
  return tone !== undefined && hasOwn(TONE_MARKS, tone) ? (TONE_MARKS[tone as Tone] as string) : ''
}

/** A status token as it prints: icon and label, or only the label where there is no icon. */
export function statusText(status: Status): string {
  return `${statusMark(status)} ${status}`.trim()
}

/** Inline text is one line: a value can never start a block or break a table row. */
export function oneLine(value: string): string {
  return value.replace(/[\n\u2028\u2029]+/g, ' ')
}

// `String`: a wrong type in an optional field survives validation as a `warn` (VD-031), and
// the serializers run outside the node guard.
export const text = (value: string): InlineToken => ({ type: 'text', text: String(value) })
export const code = (value: string): InlineToken => ({ type: 'code', text: String(value) })
export const bold = (...children: Inline): InlineToken => ({ type: 'bold', children })

/** `tokens` after a mark, for marks that lead (`✓ name`). */
export function led(mark: string, tokens: Inline): Inline {
  return mark === '' ? tokens : [text(`${mark} `), ...tokens]
}

/** `tokens` before a mark, for marks that trail (`searchSku ⚠`). */
export function trailed(tokens: Inline, mark: string): Inline {
  return mark === '' ? tokens : [...tokens, text(` ${mark}`)]
}

/** Code without the final newline, which would print as an empty line. */
export function codeBlock(value: string, lang?: string): Block {
  const body = String(value).replace(/\n$/, '')
  return typeof lang === 'string'
    ? { kind: 'code', text: body, lang }
    : { kind: 'code', text: body }
}

export const para = (tokens: Inline): Block => ({ kind: 'para', text: tokens })
export const muted = (tokens: Inline): Block => ({ kind: 'para', text: tokens, muted: true })

export const list = (items: Entry[], ordered = false, start?: number): Block =>
  start === undefined ? { kind: 'list', ordered, items } : { kind: 'list', ordered, items, start }
