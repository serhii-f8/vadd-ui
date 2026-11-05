import { hasOwn, isJsonObject, type JsonValue } from './json.js'
import { LIMITS } from './limits.js'
import type { DiffFile, PlanItem, TreeItem } from './types.js'

// What both renderers read from the §6.5 components, so they cannot disagree.

// CSI and OSC go whole, so no parameters stay behind as text. An OSC with no terminator ends
// with its line, or one stray byte in a log would take the rest of the document with it.
const ESCAPE_SEQUENCE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escapes is the point.
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b\n\r]*(?:\x07|\x1b\\)?|\x9b[0-?]*[ -/]*[@-~]/g

// All of C0 and C1 except tab and newline.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
const CONTROL = /[\0-\x08\x0b-\x1f\x7f-\x9f]/g

export function cleanText(value: string): string {
  return value.replace(ESCAPE_SEQUENCE, '').replace(/\r\n?/g, '\n').replace(CONTROL, '')
}

/** The last `count` lines, and what comes before them. One trailing newline is not a line. */
export function tailLines(text: string, count: number): { earlier: string[]; last: string[] } {
  const lines = text.replace(/\n$/, '').split('\n')
  const cut = Math.max(lines.length - count, 0)
  return { earlier: lines.slice(0, cut), last: lines.slice(cut) }
}

/** Items with status `ok`, and all items, at every depth. */
export function planCounts(items: PlanItem[]): [done: number, total: number] {
  let done = 0
  let total = 0
  for (const item of items) {
    // Past VD-066's cap nothing checks an item, and a bad one is not drawn.
    if (!isJsonObject(item as unknown as JsonValue)) continue
    const children = item.children
    const [innerDone, innerTotal] = planCounts(Array.isArray(children) ? children : [])
    done += (item.status === 'ok' ? 1 : 0) + innerDone
    total += 1 + innerTotal
  }
  return [done, total]
}

type PathTrie = Map<string, PathTrie>

function trieItems(trie: PathTrie): TreeItem[] {
  return Array.from(trie, ([name, children]) => ({ name, children: trieItems(children) }))
}

/** §13.4 cannot see nesting that comes from a path, so the cap on it is applied here. */
function segmentsOf(path: string): string[] {
  const parts = path.split('/').filter((part) => part !== '')
  if (parts.length <= LIMITS.depth) return parts
  const last = LIMITS.depth - 1
  return [...parts.slice(0, last), parts.slice(last).join('/')]
}

export function itemsFromPaths(paths: string[]): TreeItem[] {
  const root: PathTrie = new Map()
  for (const path of paths) {
    let node = root
    for (const segment of segmentsOf(path)) {
      const child: PathTrie = node.get(segment) ?? new Map()
      node.set(segment, child)
      node = child
    }
  }
  return trieItems(root)
}

/** §6.5 gives `tree` two sources: `items` when it holds an item, or else `paths`. */
export function treeSource(items: JsonValue[], paths: JsonValue[]): JsonValue[] {
  if (items.some((item) => isJsonObject(item))) return items
  const named = paths.filter((path) => typeof path === 'string')
  return itemsFromPaths(named as string[]) as unknown as JsonValue[]
}

const ISO_TIME = /^\d{4}-\d\d-\d\dT/

/** A `timeline.at` to format. A label or a bare date prints as written (VD-092). */
export function isIsoTime(at: string): boolean {
  return ISO_TIME.test(at)
}

export interface DiffEntry {
  path: string
  added?: number
  removed?: number
  change?: 'A' | 'M' | 'D' | 'R'
  hunk?: string
}

/** One entry per file, then one per hunk that no file names. */
export function diffEntries(files: DiffFile[], hunks?: Record<string, string> | null): DiffEntry[] {
  const table = hunks ?? {}
  const paths = new Set(files.map(([path]) => path))
  const entries = files.map(([path, added, removed, change]) => {
    const entry: DiffEntry = { path, added, removed }
    if (change !== undefined) entry.change = change
    if (hasOwn(table, path)) entry.hunk = table[path] as string
    return entry
  })
  const orphans = Object.entries(table).filter(([path]) => !paths.has(path))
  return [...entries, ...orphans.map(([path, hunk]) => ({ path, hunk }))]
}
