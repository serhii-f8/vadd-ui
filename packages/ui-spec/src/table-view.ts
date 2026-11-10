import type { Formatted } from './format.js'
import { isNumericFormat, parseFormat } from './format-spec.js'
import { inlineToPlain, parseInline } from './inline.js'
import { hasOwn, isJsonObject, type JsonValue } from './json.js'
import {
  type Column,
  type RowOptions,
  STATUSES,
  type Status,
  type TableNode,
  TONES,
  type Tone,
} from './types.js'

// How a table reads, whatever draws it: every renderer must agree (§6.6, VD-055). All of it
// is tolerant, because a cut or VD-066's cap can leave a table in any shape.

export interface ParsedRow {
  cells: JsonValue[]
  options: RowOptions
  /** The position in `rows`, which stays true after a sort. */
  index: number
}

/** Anything but an array is an empty row: reading an object row left over by VD-038 would
 * expand exactly the cells that cap refused. */
export function parseRow(row: unknown, index: number, columns: readonly Column[]): ParsedRow {
  const list = (Array.isArray(row) ? row : []) as JsonValue[]
  const last = list[list.length - 1]
  const options = isJsonObject(last) ? (last as RowOptions) : {}
  const end = isJsonObject(last) ? list.length - 1 : list.length
  return { cells: list.slice(0, Math.min(end, columns.length)), options, index }
}

type SortKey = number | string | null

function formatName(column: Column): string {
  return typeof column.format === 'string' ? parseFormat(column.format).name : 'text'
}

function sortKey(value: JsonValue | undefined, column: Column): SortKey {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const raw = String(value)
  return formatName(column) === 'text' ? inlineToPlain(parseInline(raw)) : raw
}

function collator(locale: string): Intl.Collator {
  try {
    return new Intl.Collator(locale)
  } catch {
    return new Intl.Collator('en-US')
  }
}

/** Empty cells last in both directions, then numbers, then strings. The input stays as it is. */
export function sortRows(
  rows: ParsedRow[],
  columns: readonly Column[],
  sort: TableNode['sort'],
  locale: string,
): ParsedRow[] {
  if (!Array.isArray(sort)) return rows
  const [index, direction] = sort
  const column = Number.isInteger(index) ? columns[index] : undefined
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
    .map((row) => ({ row, key: sortKey(row.cells[index], column) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(({ row }) => row)
}

export function alignOf(
  column: Column,
  index: number,
  rows: readonly ParsedRow[],
): 'left' | 'right' | 'center' {
  // A bad `align` is only a warn (§13.3), so a renderer meets any value here.
  const { align } = column as { align?: unknown }
  if (align === 'left' || align === 'right' || align === 'center') return align
  const name = formatName(column)
  if (isNumericFormat(name)) return 'right'
  if (name !== 'text') return 'left'
  const values = rows.map((row) => row.cells[index] ?? null).filter((value) => value !== null)
  return values.length > 0 && values.every((value) => typeof value === 'number') ? 'right' : 'left'
}

/** Two cells in one `group` have the same key. */
export function groupKey(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? null)
}

export interface Badge {
  tone?: Tone
  status?: Status
}

/** §7: a `tones` match, or the status value, in a `badge` cell. */
export function badgeOf(column: Column, formatted: Formatted): Badge {
  if (column.cell !== 'badge') return {}
  const { text, status } = formatted
  const { tones } = column
  if (isJsonObject(tones as JsonValue) && hasOwn(tones as object, text)) {
    const tone = (tones as Record<string, Tone>)[text] as Tone
    if (TONES.includes(tone)) return { tone }
  }
  if (status !== undefined) return { status }
  return (STATUSES as readonly string[]).includes(text) ? { status: text as Status } : {}
}
