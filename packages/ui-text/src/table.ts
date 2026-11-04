import {
  type Column,
  hasOwn,
  inlineToPlain,
  isJsonObject,
  type JsonValue,
  parseFormat,
  parseInline,
  type Row,
  type RowOptions,
  type TableNode,
} from '@vadd/ui-spec'
import {
  type Align,
  type Block,
  bold,
  code,
  type Inline,
  text,
  toneMark,
  trailed,
} from './blocks.js'
import { type Context, format, tokensOf } from './value.js'

// The table's static reading: sort, group, totals, row options (§6.6). `sort` is applied
// here because a text host has no header to click.

const NUMERIC = new Set([
  'num',
  'int',
  'compact',
  'pct',
  'pct100',
  'delta',
  'ms',
  'dur',
  'bytes',
  'money',
])

interface ParsedRow {
  cells: JsonValue[]
  options: RowOptions
}

function parseRow(row: Row): ParsedRow {
  const list = (Array.isArray(row) ? row : []) as JsonValue[]
  const last = list[list.length - 1]
  return isJsonObject(last)
    ? { cells: list.slice(0, -1), options: last as RowOptions }
    : { cells: list, options: {} }
}

type SortKey = number | string | null

function sortKey(value: JsonValue | undefined, column: Column): SortKey {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const raw = String(value)
  return column.format === undefined ? inlineToPlain(parseInline(raw)) : raw
}

function collator(locale: string): Intl.Collator {
  try {
    return new Intl.Collator(locale)
  } catch {
    return new Intl.Collator('en-US')
  }
}

/** Empty cells last in both directions, then numbers, then strings (VD-055). */
function sorted(rows: ParsedRow[], node: TableNode, locale: string): ParsedRow[] {
  const [index, direction] = node.sort ?? []
  const column = index === undefined ? undefined : node.columns[index]
  if (column === undefined) return rows
  const order = direction === 'desc' ? -1 : 1
  const { compare } = collator(locale)
  const compareKeys = (a: SortKey, b: SortKey): number => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    if (typeof a === 'number' && typeof b === 'number') return order * (a - b)
    if (typeof a === 'string' && typeof b === 'string') return order * compare(a, b)
    return order * (typeof a === 'number' ? -1 : 1)
  }
  return rows
    .map((row) => ({ row, key: sortKey(row.cells[index as number], column) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(({ row }) => row)
}

function alignOf(column: Column, index: number, rows: ParsedRow[]): Align {
  if (column.align !== undefined) return column.align
  const name = typeof column.format === 'string' ? parseFormat(column.format).name : 'text'
  if (NUMERIC.has(name)) return 'right'
  if (name !== 'text') return 'left'
  const values = rows.map((row) => row.cells[index] ?? null).filter((value) => value !== null)
  return values.length > 0 && values.every((value) => typeof value === 'number') ? 'right' : 'left'
}

function cell(value: JsonValue | undefined, column: Column, context: Context): Inline {
  const formatted = format(value, column.format, context)
  const tokens = tokensOf(formatted)
  const tone =
    column.cell === 'badge' && column.tones !== undefined && hasOwn(column.tones, formatted.text)
      ? column.tones[formatted.text]
      : undefined
  const body = column.cell === 'code' && value !== null ? [code(formatted.text)] : tokens
  return trailed(body, toneMark(tone))
}

function withRowOptions(tokens: Inline, { tone, note }: RowOptions): Inline {
  const marked = trailed(tokens, toneMark(tone))
  return note === undefined ? marked : [...marked, text(' — '), ...parseInline(note)]
}

export function tableBlocks(node: TableNode, context: Context): Block[] {
  const { columns } = node
  if (columns.length === 0) return []
  const parsed = node.rows.map(parseRow)
  const rows: Inline[][] = []
  const groupColumn = node.group === undefined ? undefined : columns[node.group]
  let group: string | undefined
  for (const { cells, options } of sorted(parsed, node, context.locale)) {
    if (groupColumn !== undefined) {
      const value = cells[node.group as number]
      const name = JSON.stringify(value ?? null)
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
