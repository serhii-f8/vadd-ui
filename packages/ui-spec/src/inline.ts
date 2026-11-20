import { STATUSES, type Status, type Tone } from './types.js'

// §5.5. A token tree, never an HTML string: renderers build nodes from it, so raw HTML in a
// document stays the text it is (§15.1).

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'status'; status: Status }
  | { type: 'bold' | 'italic' | 'strike'; children: InlineToken[] }
  | { type: 'link'; href: string; children: InlineToken[] }

/** The color intent of each status (§2, §15.2). */
export const STATUS_TONES: Readonly<Record<Status, Tone>> = {
  ok: 'ok',
  fail: 'err',
  warn: 'warn',
  info: 'info',
  run: 'accent',
  wait: 'muted',
  skip: 'muted',
  none: 'default',
}

const STATUS_TOKEN = new RegExp(`:(${STATUSES.join('|')}):`, 'y')
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/
// The longest URL any field but a `md` block can hold (§13.4). It keeps the scan for `)`
// from going quadratic on `[a](b[a](b…`.
const MAX_URL = 2_000

/** `url` when it may become an anchor (§15.1, VD-048), otherwise undefined. */
export function safeHref(url: string): string | undefined {
  if (/[\s\p{Cc}]/u.test(url)) return undefined
  return /^(?:https?:\/\/.|mailto:.|#.)/i.test(url) ? url : undefined
}

function blankCode(text: string): string {
  return text.replace(/`[^`]+`/g, (span) => '\0'.repeat(span.length))
}

/**
 * The `)` closing a URL that starts at `start`, allowing one level of parens. Takes the
 * mask: a `)` inside a code span must not end the URL, or the scan lands inside the span.
 */
function urlEnd(mask: string, start: number): number {
  const stop = Math.min(mask.length, start + MAX_URL)
  let open = 0
  for (let index = start; index < stop; index++) {
    const character = mask[index]
    if (character === '(' && ++open > 1) return -1
    if (character === ')' && open-- === 0) return index
  }
  return -1
}

function runEnd(text: string, start: number): number {
  let end = start
  while (text[end] === '*') end++
  return end
}

/**
 * One pass over a span, with code spans blanked in `mask`. The nearest closer always wins,
 * so a span cannot hold its own delimiter, and depth stays at the four delimiter kinds.
 */
class Scanner {
  private readonly mask: string
  private readonly tokens: InlineToken[] = []
  // First closer at or after the last search, by delimiter. The scan only moves forward,
  // so each closer is found once and a failed search never repeats. This keeps hostile
  // input linear.
  private readonly closers = new Map<string, number>()
  private textStart = 0
  private index = 0

  constructor(private readonly text: string) {
    this.mask = blankCode(text)
  }

  run(): InlineToken[] {
    const { text } = this
    while (this.index < text.length) {
      const character = text[this.index]
      if (character === '`') this.code()
      else if (character === '*') this.star()
      else if (character === '_') this.under()
      else if (character === '~') this.strike()
      else if (character === '[') this.link()
      else if (character === ':') this.status()
      else this.index++
    }
    this.flush(text.length)
    return this.tokens
  }

  private flush(end: number): void {
    if (end > this.textStart) {
      this.tokens.push({ type: 'text', text: this.text.slice(this.textStart, end) })
    }
  }

  private emit(token: InlineToken, end: number): void {
    this.flush(this.index)
    this.tokens.push(token)
    this.index = end
    this.textStart = end
  }

  private cached(key: string, from: number, find: () => number): number {
    const known = this.closers.get(key)
    if (known === -1 || (known !== undefined && known > from)) return known
    const found = find()
    this.closers.set(key, found)
    return found
  }

  private code(): void {
    const { index, text } = this
    const end = text.indexOf('`', index + 1)
    if (this.mask[index] !== '\0' || end === -1) {
      this.index++
      return
    }
    this.emit({ type: 'code', text: text.slice(index + 1, end) }, end + 1)
  }

  private opensAt(from: number): boolean {
    const next = this.text[from]
    return next !== undefined && !SPACE.test(next)
  }

  private starCloser(from: number, size: 1 | 2): number {
    const { mask } = this
    return this.cached(`*${size}`, from, () => {
      let start = mask.indexOf('*', from)
      while (start !== -1) {
        const end = runEnd(mask, start)
        const length = end - start
        const fits = size === 2 ? length >= 2 : length !== 2
        if (fits && start > from && !SPACE.test(mask[start - 1] as string)) return end - size
        start = mask.indexOf('*', end)
      }
      return -1
    })
  }

  private star(): void {
    const { index, text } = this
    const end = runEnd(text, index)
    const size = end - index === 1 ? 1 : 2
    const from = index + size
    const closer = this.opensAt(from) ? this.starCloser(from, size) : -1
    if (closer === -1) {
      this.index = end
      return
    }
    const children = parseInline(text.slice(from, closer))
    this.emit({ type: size === 1 ? 'italic' : 'bold', children }, closer + size)
  }

  /**
   * `_italic_` with CommonMark's flanking rules for `_` (VD-216): it opens after no letter or
   * digit and before no space, and closes after no space and before no letter or digit. So
   * `snake_case_names` and `a_b` stay text, and a run of two or more is always text.
   */
  private under(): void {
    const { index, mask, text } = this
    const from = index + 1
    const opens =
      text[from] !== '_' &&
      text[index - 1] !== '_' &&
      this.opensAt(from) &&
      !WORD.test(text[index - 1] ?? '')
    const closer = opens
      ? this.cached('_', from, () => {
          let at = mask.indexOf('_', from)
          while (at !== -1) {
            const before = mask[at - 1] as string
            const after = mask[at + 1] ?? ''
            if (before !== '_' && !SPACE.test(before) && after !== '_' && !WORD.test(after))
              return at
            at = mask.indexOf('_', at + 1)
          }
          return -1
        })
      : -1
    if (closer === -1) {
      this.index = from
      return
    }
    this.emit({ type: 'italic', children: parseInline(text.slice(from, closer)) }, closer + 1)
  }

  private strike(): void {
    const { index, mask, text } = this
    const from = index + 2
    if (text[index + 1] !== '~' || !this.opensAt(from)) {
      this.index++
      return
    }
    const closer = this.cached('~', from, () => {
      let start = mask.indexOf('~~', from)
      while (start !== -1) {
        if (start > from && !SPACE.test(mask[start - 1] as string)) return start
        start = mask.indexOf('~~', start + 1)
      }
      return -1
    })
    if (closer === -1) {
      this.index = from
      return
    }
    this.emit({ type: 'strike', children: parseInline(text.slice(from, closer)) }, closer + 2)
  }

  private link(): void {
    const { index, mask, text } = this
    const close = this.cached(']', index, () => mask.indexOf(']', index + 1))
    const start = close + 2
    const end = close > index + 1 && text[close + 1] === '(' ? urlEnd(mask, start) : -1
    if (end === -1) {
      this.index++
      return
    }
    const href = safeHref(text.slice(start, end))
    if (href === undefined) {
      this.index = end + 1
      return
    }
    this.emit({ type: 'link', href, children: parseInline(text.slice(index + 1, close)) }, end + 1)
  }

  private status(): void {
    const { index, text } = this
    STATUS_TOKEN.lastIndex = index
    const match = STATUS_TOKEN.exec(text)
    const end = index + (match === null ? 0 : match[0].length)
    if (match === null || WORD.test(text[index - 1] ?? '') || WORD.test(text[end] ?? '')) {
      this.index++
      return
    }
    this.emit({ type: 'status', status: match[1] as Status }, end)
  }
}

/** Parses the §5.5 subset. Total: whatever does not match stays text. */
export function parseInline(text: string): InlineToken[] {
  return new Scanner(text).run()
}

/** The text of a token tree with its markup gone, for sorting, labels and tooltips. */
export function inlineToPlain(tokens: readonly InlineToken[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'status':
          return token.status
        case 'text':
        case 'code':
          return token.text
        default:
          return inlineToPlain(token.children)
      }
    })
    .join('')
}
