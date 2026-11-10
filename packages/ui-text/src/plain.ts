import { type Align, type Block, type Entry, type Inline, oneLine, statusText } from './blocks.js'

// Plain text: the same blocks with the markup gone.

function inline(tokens: Inline): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
        case 'code':
          return oneLine(token.text)
        case 'status':
          return statusText(token.status)
        case 'link': {
          const label = inline(token.children)
          return label === token.href || token.href.startsWith('#')
            ? label
            : `${label} (${token.href})`
        }
        default:
          return inline(token.children)
      }
    })
    .join('')
}

const width = (value: string) => Array.from(value).length

/**
 * §15.1: a column pads to its widest cell, but never past this. A longer cell keeps all its
 * text and overflows its column, so the output grows with the cells, not with rows × widest.
 */
const PAD_CAP = 40

function pad(value: string, size: number, align: Align): string {
  const space = Math.max(size - width(value), 0)
  const before = align === 'right' ? space : align === 'center' ? space >> 1 : 0
  return ' '.repeat(before) + value + ' '.repeat(space - before)
}

function table(block: Extract<Block, { kind: 'table' }>): string {
  const rows = [block.header, ...block.rows].map((row) => row.map(inline))
  const sizes = block.aligns.map((_, column) =>
    rows.reduce((size, row) => Math.min(Math.max(size, width(row[column] ?? '')), PAD_CAP), 0),
  )
  const line = (cells: string[]) =>
    cells
      .map((cell, column) => pad(cell, sizes[column] ?? 0, block.aligns[column] ?? 'left'))
      .join('  ')
      .trimEnd()
  const [header = [], ...body] = rows
  return [line(header), sizes.map((size) => '-'.repeat(size)).join('  '), ...body.map(line)].join(
    '\n',
  )
}

function indent(value: string, size: number): string {
  const space = ' '.repeat(size)
  return value
    .split('\n')
    .map((line) => (line === '' ? line : space + line))
    .join('\n')
}

function entry(item: Entry, marker: string): string {
  const head = `${marker} ${inline(item.text).trim()}`.trimEnd()
  const nested = (item.blocks ?? []).map((block) => indent(serialize(block), marker.length + 1))
  return [head, ...nested].join('\n')
}

function serialize(block: Block): string {
  switch (block.kind) {
    case 'heading':
    case 'para':
      return inline(block.text).trim()
    case 'list':
      return block.items
        .map((item, index) => entry(item, block.ordered ? `${(block.start ?? 1) + index}.` : '-'))
        .join('\n')
    case 'table':
      return table(block)
    case 'code':
      return indent(block.text, 4)
    case 'quote':
      return blocksToPlain(block.blocks)
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n')
    default:
      return '---'
  }
}

export function blocksToPlain(blocks: Block[]): string {
  return blocks
    .map(serialize)
    .filter((part) => part !== '')
    .join('\n\n')
}
