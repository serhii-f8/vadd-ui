import {
  clip,
  type Diagnostic,
  type DiagnosticCode,
  hasOwn,
  inspect,
  isJsonObject,
  isLimitCode,
  type JsonObject,
  type JsonValue,
  joinPointer,
  LIMITS,
  type LocatedIssue,
  type ParseError,
  type PathMap,
  parse,
  type VuiDocument,
} from '@vadd/ui-spec'
import { sanitize } from './sanitize.js'

// Everything between the input and `build`. A document that breaks a rule of §13 is still
// shown: limits truncate, invalid fields go, and only what cannot be drawn fails a node.

const MAX_RAW_LINES = 40
const DROPPABLE: ReadonlySet<DiagnosticCode> = new Set(['bad-type', 'bad-enum', 'bad-range'])
const LONG_TEXT_TYPES: ReadonlySet<JsonValue> = new Set(['md', 'code', 'log'])

export interface Failure {
  code: DiagnosticCode
  message: string
}

export interface ParseFailure {
  message: string
  /** The first lines of the input (§9.2 step 4). */
  raw: string
}

export interface Prepared {
  document?: VuiDocument
  paths?: PathMap
  diagnostics: Diagnostic[]
  /** Canonical node pointer to the problem that makes it an error card. */
  failed: Map<string, Failure>
  failure?: ParseFailure
}

function segmentsOf(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

type Container = JsonObject | JsonValue[]

function childOf(container: JsonValue | undefined, key: string): JsonValue | undefined {
  if (Array.isArray(container)) return container[Number(key)]
  return isJsonObject(container) && hasOwn(container, key) ? container[key] : undefined
}

/** The parent of what `pointer` names, and the last segment. */
function locate(root: JsonObject, pointer: string): [Container, string] | undefined {
  const segments = segmentsOf(pointer)
  const last = segments.pop()
  if (last === undefined) return undefined
  let parent: JsonValue | undefined = root
  for (const segment of segments) parent = childOf(parent, segment)
  return typeof parent === 'object' && parent !== null ? [parent, last] : undefined
}

/** Removes what `pointer` names. In an array that also removes all that follows it. */
function cut(root: JsonObject, pointer: string): void {
  const target = locate(root, pointer)
  if (target === undefined) return
  const [parent, key] = target
  if (Array.isArray(parent)) parent.length = Math.min(parent.length, Number(key))
  else delete parent[key]
}

function cutList(list: JsonValue | undefined, limit: number): void {
  if (Array.isArray(list) && list.length > limit) list.length = limit
}

function cutColumns(root: JsonObject, pointer: string): void {
  const table = locate(root, pointer)?.[0]
  if (!isJsonObject(table)) return
  cutList(table.columns, LIMITS.tableColumns)
  cutList(table.totals, LIMITS.tableColumns)
  if (!Array.isArray(table.rows)) return
  // Object rows that stayed unconverted (VD-038) have no columns to cut.
  for (const row of table.rows) cutList(row, LIMITS.tableColumns)
}

function cutSeries(root: JsonObject, pointer: string): void {
  const target = locate(root, pointer)
  const series = target && childOf(target[0], target[1])
  if (!isJsonObject(series)) return
  for (const key of Object.keys(series).slice(LIMITS.chartSeries)) delete series[key]
}

function cutString(root: JsonObject, pointer: string): void {
  const target = locate(root, pointer)
  if (target === undefined) return
  const [parent, key] = target
  const value = childOf(parent, key)
  if (typeof value !== 'string') {
    // The over-long string is the key itself (VD-039).
    cut(root, pointer)
    return
  }
  const long = key === 'text' && !Array.isArray(parent) && LONG_TEXT_TYPES.has(parent.type ?? null)
  const limit = long ? LIMITS.longString : LIMITS.string
  if (Array.isArray(parent)) parent[Number(key)] = clip(value, limit)
  else parent[key] = clip(value, limit)
}

function truncate(root: JsonObject, issues: LocatedIssue[]): void {
  // Backwards: a cut in an array must not move what a later issue points at.
  for (const { code, pointer } of [...issues].reverse()) {
    const target = locate(root, pointer)
    const list = target && childOf(target[0], target[1])
    switch (code) {
      case 'limit-table-rows':
        cutList(list, LIMITS.tableRows)
        break
      case 'limit-table-columns':
        cutColumns(root, pointer)
        break
      case 'limit-chart-points':
        cutList(list, LIMITS.chartPoints)
        break
      case 'limit-chart-series':
        cutSeries(root, pointer)
        break
      case 'limit-flow-nodes':
        cutList(list, LIMITS.flowNodes)
        break
      case 'limit-string':
        cutString(root, pointer)
        break
      case 'limit-depth':
        cut(root, pointer)
        break
    }
  }
}

/** Every slot that holds a node, in document order. Stops at `budget` when it is set. */
function collectNodes(root: JsonObject, budget: number): Set<string> {
  const nodes = new Set<string>()
  const visit = (list: JsonValue | undefined, pointer: string): void => {
    if (!Array.isArray(list)) return
    for (let index = 0; index < list.length; index += 1) {
      if (nodes.size >= budget) {
        list.length = index
        return
      }
      const nodePointer = joinPointer(pointer, index)
      nodes.add(nodePointer)
      const node = list[index]
      if (!isJsonObject(node)) continue
      visit(node.children, joinPointer(nodePointer, 'children'))
      if (Array.isArray(node.tabs)) {
        const tabsPointer = joinPointer(nodePointer, 'tabs')
        node.tabs.forEach((tab, tabIndex) => {
          if (isJsonObject(tab)) {
            const tabPointer = joinPointer(tabsPointer, tabIndex)
            visit(tab.children, joinPointer(tabPointer, 'children'))
          }
        })
      }
    }
  }
  visit(root.body, '/body')
  return nodes
}

/** False when truncation removed what `pointer` names. */
function survives(root: JsonObject, pointer: string): boolean {
  let value: JsonValue | undefined = root
  for (const segment of segmentsOf(pointer)) {
    const next = childOf(value, segment)
    if (next === undefined) return Array.isArray(value) === false
    value = next
  }
  return true
}

function ownerOf(pointer: string, nodes: Set<string>): string | undefined {
  let current = pointer
  while (current !== '') {
    if (nodes.has(current)) return current
    current = current.slice(0, current.lastIndexOf('/'))
  }
  return undefined
}

function dropInvalid(root: JsonObject, issues: LocatedIssue[]): void {
  for (const { severity, code, pointer } of issues) {
    if (severity !== 'warn' || !DROPPABLE.has(code)) continue
    const target = locate(root, pointer)
    // An array item stays: removing it would renumber its neighbours.
    if (target && !Array.isArray(target[0])) delete target[0][target[1]]
  }
}

function failures(
  root: JsonObject,
  issues: LocatedIssue[],
  nodes: Set<string>,
): Map<string, Failure> {
  const failed = new Map<string, Failure>()
  for (const { severity, code, message, pointer } of issues) {
    if (severity !== 'error' || isLimitCode(code) || code === 'unknown-type') continue
    if (!survives(root, pointer)) continue
    const owner = ownerOf(pointer, nodes)
    if (owner !== undefined && !failed.has(owner)) failed.set(owner, { code, message })
  }
  return failed
}

function softened(diagnostic: Diagnostic): Diagnostic {
  // §13.4: an `error` in the CLI, a `warn` badge in the browser.
  return isLimitCode(diagnostic.code) ? { ...diagnostic, severity: 'warn' } : diagnostic
}

function parseFailed(error: ParseError, text: string): Prepared {
  const { code, message, line, column } = error
  const located = `line ${line}, column ${column}: ${message}`
  const diagnostic: Diagnostic = {
    severity: 'error',
    path: '',
    code: code === 'too-deep' ? 'limit-depth' : 'parse-error',
    message: clip(located, 120),
  }
  const raw = text.split('\n', MAX_RAW_LINES).join('\n')
  return { diagnostics: [diagnostic], failed: new Map(), failure: { message: located, raw } }
}

function oversize(text: string): Diagnostic[] {
  const bytes = new TextEncoder().encode(text).length
  if (bytes <= LIMITS.inputBytes) return []
  const message = `input is ${bytes} bytes; the limit is ${LIMITS.inputBytes}`
  return [{ severity: 'warn', path: '', code: 'limit-input-size', message }]
}

function examine(input: JsonValue, early: Diagnostic[]): Prepared {
  const { document, paths, diagnostics, issues } = inspect(input)
  const root = document as unknown as JsonObject
  truncate(root, issues)
  dropInvalid(root, issues)
  const overLimit = issues.some(({ code }) => code === 'limit-nodes')
  const nodes = collectNodes(root, overLimit ? LIMITS.nodes : Number.POSITIVE_INFINITY)
  return {
    document,
    paths,
    diagnostics: [...early, ...diagnostics.map(softened)],
    failed: failures(root, issues, nodes),
  }
}

/** Input to a document `build` can draw. Total. The result never shares with the input. */
export function prepare(input: string | VuiDocument): Prepared {
  if (typeof input === 'string') {
    const parsed = parse(input)
    return parsed.ok ? examine(parsed.value, oversize(input)) : parseFailed(parsed.error, input)
  }
  const { value, diagnostics } = sanitize(input)
  return examine(value, diagnostics)
}
