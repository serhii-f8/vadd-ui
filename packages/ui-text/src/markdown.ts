import { type Align, type Block, type Entry, type Inline, statusText } from './blocks.js'

// GitHub-flavored markdown. Document text is escaped here and nowhere else, so the only live
// markup is what this file writes (§5.5, §15.1, VD-053).

// `_` inside a word is not emphasis in GFM. `&` matters only before an entity, and `<` only
// where a tag or autolink could start.
const SPECIAL = /[\\`*[\]~|]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|&(?=#?\w+;)|<(?=[A-Za-z/!?])/gu
const HREF_SPECIAL = /[()|\\<>]/g

/** Inline text is one line: a value can never start a block or break a table row. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ')
}

function escapeText(value: string): string {
  return oneLine(value).replace(SPECIAL, '\\$&')
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

function inline(tokens: Inline): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
          return escapeText(token.text)
        case 'code':
          return codeSpan(token.text)
        case 'status':
          return statusText(token.status)
        case 'bold':
          return `**${inline(token.children)}**`
        case 'italic':
          return `*${inline(token.children)}*`
        case 'strike':
          return `~~${inline(token.children)}~~`
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
    .replace(/^(?:#{1,6}(?=\s|$)|[-+](?=\s|$)|-{3,}\s*$|>)/, '\\$&')
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
  return inline(tokens).replace(/(?<!\\)\|/g, '\\|')
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

function serialize(block: Block): string {
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
      return block.items
        .map((item, index) => entry(item, block.ordered ? `${index + 1}.` : '-'))
        .join('\n')
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

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map(serialize)
    .filter((part) => part !== '')
    .join('\n\n')
}
