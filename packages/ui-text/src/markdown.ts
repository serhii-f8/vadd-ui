import { type Align, type Block, type Entry, type Inline, oneLine, statusText } from './blocks.js'

// GitHub-flavored markdown. Document text is escaped here and nowhere else, so the only live
// markup is what this file writes (§5.5, §15.1, VD-053).

// `_` inside a word is not emphasis in GFM. `&` matters only before an entity, and `<` only
// where a tag or autolink could start. Those two become entities, not backslash escapes: a
// bare-URL autolink swallows the backslash, and `http://a.dev\\<b>` would leave a live tag.
//
// A bare URL gets no autolink: §5.5 has none, and an autolink runs over what follows it, so
// `http://a.dev` before a code span would swallow the opening backtick and free its content.
const SPECIAL =
  /:(?=\/\/)|(?<=\b[wW]{3})\.|[\\`*[\]~|]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|&(?=#?\w+;)|<(?=[A-Za-z/!?])/gu
const ENTITIES: Readonly<Record<string, string>> = { '<': '&lt;', '&': '&amp;' }
const HREF_SPECIAL = /[()|\\<>]/g

function escapeText(value: string): string {
  return oneLine(value).replace(SPECIAL, (match) => ENTITIES[match] ?? `\\${match}`)
}

function longestRun(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).reduce((longest, run) => Math.max(longest, run.length), 0)
}

function codeSpan(raw: string): string {
  const value = oneLine(raw)
  if (value === '') return ''
  const ticks = '`'.repeat(longestRun(value, /`+/g) + 1)
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${value}${pad}${ticks}`
}

function encodeHref(href: string): string {
  return href.replace(HREF_SPECIAL, (character) => {
    return `%${(character.codePointAt(0) as number).toString(16).toUpperCase()}`
  })
}

/** GFM reads no emphasis with a space inside its markers, or nothing between them. */
function wrap(marker: string, inner: string): string {
  const body = inner.trim()
  if (body === '') return inner
  const before = inner.slice(0, inner.length - inner.trimStart().length)
  const after = inner.slice(inner.trimEnd().length)
  return `${before}${marker}${body}${marker}${after}`
}

function inline(tokens: Inline): string {
  return tokens
    .map((token, index) => {
      switch (token.type) {
        case 'text': {
          // Text before a link: a bare `!` would make it an image, a remote load (§15.1).
          const beforeLink = tokens[index + 1]?.type === 'link'
          const escaped = escapeText(token.text)
          return beforeLink ? escaped.replace(/!$/, '\\!') : escaped
        }
        case 'code':
          return codeSpan(token.text)
        case 'status':
          return statusText(token.status)
        case 'bold':
          return wrap('**', inline(token.children))
        case 'italic':
          return wrap('*', inline(token.children))
        case 'strike':
          return wrap('~~', inline(token.children))
        default:
          return `[${inline(token.children)}](${encodeHref(token.href)})`
      }
    })
    .join('')
}

/** Keeps a line of text from reading as a heading, list item, quote or rule. */
function guardLineStart(line: string): string {
  return line
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
    .replace(/^(?:#{1,6}(?=\s|$)|[-+](?=\s|$)|-[- \t]*$|>)/, '\\$&')
}

const ALIGN_RULES: Readonly<Record<Align, string>> = {
  left: '---',
  right: '---:',
  center: ':---:',
}

function tableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** A code span keeps its `|`, which GFM would still read as a cell break. */
function tableCell(tokens: Inline): string {
  return inline(tokens)
    .trim()
    .replace(/(?<!\\)\|/g, '\\|')
}

function fence(value: string, lang: string | undefined): string {
  const ticks = '`'.repeat(Math.max(3, longestRun(value, /`+/g) + 1))
  const label = (lang ?? '').replace(/[^\w+#.-]/g, '')
  return `${ticks}${label}\n${value}\n${ticks}`
}

function indent(value: string, width: number): string {
  const pad = ' '.repeat(width)
  return value
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

function entry(item: Entry, marker: string): string {
  const head = `${marker} ${guardLineStart(inline(item.text).trim())}`.trimEnd()
  const nested = (item.blocks ?? []).map((block) => indent(serialize(block), marker.length + 1))
  return [head, ...nested].join('\n')
}

function listBody(block: Extract<Block, { kind: 'list' }>, alternate: boolean): string {
  const bullet = alternate ? '*' : '-'
  const closer = alternate ? ')' : '.'
  return block.items
    .map((item, index) =>
      entry(item, block.ordered ? `${(block.start ?? 1) + index}${closer}` : bullet),
    )
    .join('\n')
}

function serialize(block: Block, alternate = false): string {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${inline(block.text)
        .trim()
        .replace(/(?<!#)#+$/, '\\$&')}`
    case 'para': {
      const line = inline(block.text).trim()
      if (line === '') return ''
      return block.muted === true ? `_${line}_` : guardLineStart(line)
    }
    case 'list':
      return listBody(block, alternate)
    case 'table':
      return [
        tableRow(block.header.map(tableCell)),
        tableRow(block.aligns.map((align) => ALIGN_RULES[align])),
        ...block.rows.map((row) => tableRow(row.map(tableCell))),
      ].join('\n')
    case 'code':
      return fence(block.text, block.lang)
    case 'quote':
      return blocksToMarkdown(block.blocks)
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n')
    default:
      return '---'
  }
}

/** Two neighboring lists of one kind need different markers, or GFM reads one list. */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = []
  let previous: Block | undefined
  let alternate = false
  for (const block of blocks) {
    const follows = block.kind === 'list' && previous?.kind === 'list'
    alternate =
      follows && previous?.kind === 'list' && previous.ordered === block.ordered && !alternate
    const part = serialize(block, alternate)
    if (part === '') continue
    parts.push(part)
    previous = block
  }
  return parts.join('\n\n')
}
