import { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
import type { PathMapBuilder } from './path-map.js'
import { joinPointer } from './pointer.js'

export interface WalkContext {
  paths: PathMapBuilder
  /** Input pointers of object-row keys that match no column (VD-025). */
  dropped: string[]
}

export interface ParsedColumn {
  key: string
  label: string
  format?: string
}

// A format suffix has no whitespace, so a label like "Note: see docs" stays whole, and
// an unknown name such as "Foo:bogus" still splits, for task 03 to warn about (VD-026).
const SUFFIX = /^(.+?):([a-z][a-z0-9]*(?::\S+)?)$/

/** Shorthand 6 of §5.3. */
export function parseColumn(text: string): ParsedColumn {
  // Matching only past the last whitespace keeps the pattern linear on hostile labels.
  const tailStart = text.search(/\s\S*$/) + 1
  const match = SUFFIX.exec(text.slice(tailStart))
  const label = match?.[1]
  const format = match?.[2]
  if (label === undefined || format === undefined) return { key: text, label: text }
  const whole = text.slice(0, tailStart) + label
  return { key: whole, label: whole, format }
}

/** A column, plus how object rows may spell its key. */
interface ColumnSource {
  column: JsonValue
  spelling?: string
}

/** Points a column built from a string, and each of its fields, at that string. */
function pinColumn(column: ParsedColumn, pointer: string, input: string, ctx: WalkContext): void {
  ctx.paths.set(pointer, input)
  for (const field of Object.keys(column)) ctx.paths.set(joinPointer(pointer, field), input)
}

function expandColumns(columns: JsonValue[], pointer: string, input: string, ctx: WalkContext) {
  return columns.map((entry, index): ColumnSource => {
    if (typeof entry === 'string') {
      const column = parseColumn(entry)
      const columnInput = joinPointer(input, index)
      pinColumn(column, joinPointer(pointer, index), columnInput, ctx)
      return { column: { ...column }, spelling: entry }
    }
    return { column: entry }
  })
}

/** Shorthand 5: with no `columns`, the keys of the first object row become the columns. */
function deriveColumns(rows: JsonValue[], cp: string, ip: string, ctx: WalkContext) {
  const firstIndex = rows.findIndex((row) => isJsonObject(row))
  if (firstIndex === -1) return undefined
  const pointer = joinPointer(cp, 'columns')
  const rowInput = joinPointer(joinPointer(ip, 'rows'), firstIndex)
  ctx.paths.set(pointer, ip)
  return Object.keys(rows[firstIndex] as JsonObject).map((key, index): ColumnSource => {
    const column = parseColumn(key)
    pinColumn(column, joinPointer(pointer, index), joinPointer(rowInput, key), ctx)
    return { column: { ...column }, spelling: key }
  })
}

/** The own key of `row` that holds this column's cell, if any. */
function findCell(row: JsonObject, { column, spelling }: ColumnSource): string | undefined {
  if (spelling !== undefined && hasOwn(row, spelling)) return spelling
  const key = isJsonObject(column) ? column.key : undefined
  return typeof key === 'string' && hasOwn(row, key) ? key : undefined
}

function toCells(
  row: JsonObject,
  sources: ColumnSource[],
  rowPointer: string,
  rowInput: string,
  ctx: WalkContext,
): JsonValue[] {
  const used = new Set<string>()
  const cells = sources.map((source, index) => {
    const key = findCell(row, source)
    const cellPointer = joinPointer(rowPointer, index)
    if (key === undefined) {
      ctx.paths.set(cellPointer, rowInput)
      return null
    }
    used.add(key)
    ctx.paths.set(cellPointer, joinPointer(rowInput, key))
    return row[key] as JsonValue
  })
  for (const key of Object.keys(row)) {
    if (!used.has(key)) ctx.dropped.push(joinPointer(rowInput, key))
  }
  return cells
}

function columnSources(table: JsonObject, cp: string, ip: string, ctx: WalkContext) {
  const { columns, rows } = table
  if (Array.isArray(columns)) {
    return expandColumns(columns, joinPointer(cp, 'columns'), joinPointer(ip, 'columns'), ctx)
  }
  return columns === undefined && Array.isArray(rows) ? deriveColumns(rows, cp, ip, ctx) : undefined
}

/** Applies shorthands 5 and 6 to a copy of a table node, in place. */
export function expandTable(table: JsonObject, cp: string, ip: string, ctx: WalkContext): void {
  const sources = columnSources(table, cp, ip, ctx)
  if (sources === undefined) return
  table.columns = sources.map((source) => source.column)
  const { rows } = table
  if (!Array.isArray(rows)) return
  const rowsPointer = joinPointer(cp, 'rows')
  const rowsInput = joinPointer(ip, 'rows')
  table.rows = rows.map((row, index) =>
    isJsonObject(row)
      ? toCells(row, sources, joinPointer(rowsPointer, index), joinPointer(rowsInput, index), ctx)
      : row,
  )
}
