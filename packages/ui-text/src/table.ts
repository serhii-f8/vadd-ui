import {
  alignOf,
  badgeOf,
  type Column,
  groupKey,
  type JsonValue,
  type ParsedRow,
  parseInline,
  parseRow,
  type RowOptions,
  sortRows,
  type TableNode,
} from '@vadd/ui-spec'
import { type Block, bold, code, type Inline, text, toneMark, trailed } from './blocks.js'
import { type Context, format, tokensOf } from './value.js'

// The table's static reading: sort, group, totals, row options (§6.6). `sort` is applied
// here because a text host has no header to click.

function cell(value: JsonValue | undefined, column: Column, context: Context): Inline {
  const formatted = format(value, column.format, context)
  const empty = value === null || value === undefined
  const { tone, status } = empty ? {} : badgeOf(column, formatted)
  if (status !== undefined) return [{ type: 'status', status }]
  const body = column.cell === 'code' && !empty ? [code(formatted.text)] : tokensOf(formatted)
  return trailed(body, toneMark(tone))
}

function withRowOptions(tokens: Inline, { tone, note }: RowOptions): Inline {
  const marked = trailed(tokens, toneMark(tone))
  return note === undefined ? marked : [...marked, text(' — '), ...parseInline(note)]
}

export function tableBlocks(node: TableNode, context: Context): Block[] {
  const { columns } = node
  if (columns.length === 0) return []
  const parsed: ParsedRow[] = node.rows.map((row, index) => parseRow(row, index, columns))
  const rows: Inline[][] = []
  const groupColumn = node.group === undefined ? undefined : columns[node.group]
  let group: string | undefined
  for (const { cells, options } of sortRows(parsed, columns, node.sort, context.locale)) {
    if (groupColumn !== undefined) {
      const value = cells[node.group as number]
      const name = groupKey(value)
      if (name !== group) {
        group = name
        rows.push(
          columns.map((_, i) => (i === 0 ? [bold(...cell(value, groupColumn, context))] : [])),
        )
      }
    }
    rows.push(
      columns.map((column, index) => {
        const tokens = cell(cells[index], column, context)
        return index === 0 ? withRowOptions(tokens, options) : tokens
      }),
    )
  }
  if (node.totals !== undefined) {
    const { totals } = node
    rows.push(columns.map((column, i) => [bold(...cell(totals[i], column, context))]))
  }
  const header = columns.map(({ label }) => [text(label)])
  const aligns = columns.map((column, index) => alignOf(column, index, parsed))
  return [{ kind: 'table', header, aligns, rows }]
}
