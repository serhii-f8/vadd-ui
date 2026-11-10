import { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
import { MAX_NESTING } from './parser.js'
import { type PathMap, PathMapBuilder } from './path-map.js'
import { joinPointer } from './pointer.js'
import { expandTable, type WalkContext } from './table.js'
import { COMPONENT_TYPES, type VuiDocument } from './types.js'

export interface NormalizeOptions {
  /** Stamped when the document has no `generatedAt`. This package has no clock (VD-024). */
  generatedAt?: string
}

export interface NormalizeResult {
  /**
   * The canonical form. Normalization runs before validation (§5.3), so this has the
   * `VuiDocument` shape only once task 03's validator has passed it. Untouched subtrees
   * may be shared with the input.
   */
  document: VuiDocument
  paths: PathMap
  /** Input pointers of object-row keys that match no column. */
  dropped: string[]
}

const ENVELOPE_ORDER = [
  'vui',
  'title',
  'subtitle',
  'density',
  'locale',
  'generatedAt',
  'body',
  'meta',
]

const ENVELOPE_DEFAULTS: Record<string, JsonValue> = { vui: 1, density: 'compact', locale: 'en-US' }

/** §6 fields with a stated concrete default (VD-024). `table.sticky` is computed. */
export const COMPONENT_DEFAULTS: Record<string, Record<string, JsonValue>> = {
  callout: { tone: 'info' },
  code: { maxLines: 30 },
  log: { maxLines: 40 },
  progress: { max: 100 },
  table: { pageSize: 25 },
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(COMPONENT_TYPES)

type Expand = (raw: JsonValue, cp: string, ip: string) => JsonValue

/** Applies shorthand 4 to `field`, then expands each element. */
function expandList(
  owner: JsonObject,
  field: string,
  cp: string,
  ip: string,
  ctx: WalkContext,
  expand: Expand,
): void {
  const raw = owner[field]
  const listPointer = joinPointer(cp, field)
  const listInput = joinPointer(ip, field)
  if (Array.isArray(raw)) {
    owner[field] = raw.map((item, index) =>
      expand(item, joinPointer(listPointer, index), joinPointer(listInput, index)),
    )
  } else if (typeof raw === 'string' || isJsonObject(raw)) {
    const itemPointer = joinPointer(listPointer, 0)
    ctx.paths.set(itemPointer, listInput)
    owner[field] = [expand(raw, itemPointer, listInput)]
  }
}

function expandNodes(owner: JsonObject, cp: string, ip: string, ctx: WalkContext, depth: number) {
  expandList(owner, 'children', cp, ip, ctx, (raw, itemCp, itemIp) =>
    normalizeNode(raw, itemCp, itemIp, ctx, depth + 1),
  )
}

function expandTabs(tabs: JsonObject, cp: string, ip: string, ctx: WalkContext, depth: number) {
  if (!Array.isArray(tabs.tabs)) return
  const tabsPointer = joinPointer(cp, 'tabs')
  const tabsInput = joinPointer(ip, 'tabs')
  tabs.tabs = tabs.tabs.map((tab, index) => {
    if (!isJsonObject(tab)) return tab
    const copy = { ...tab }
    expandNodes(copy, joinPointer(tabsPointer, index), joinPointer(tabsInput, index), ctx, depth)
    return copy
  })
}

/** `plan` and `tree` items nest through `children`. Those hold items, not nodes. */
function normalizeItem(
  raw: JsonValue,
  cp: string,
  ip: string,
  ctx: WalkContext,
  depth: number,
): JsonValue {
  if (!isJsonObject(raw) || depth >= MAX_NESTING) return raw
  const copy = { ...raw }
  expandList(copy, 'children', cp, ip, ctx, (child, childCp, childIp) =>
    normalizeItem(child, childCp, childIp, ctx, depth + 1),
  )
  return copy
}

function applyDefaults(node: JsonObject, type: string, cp: string, ip: string, ctx: WalkContext) {
  const defaults = { ...COMPONENT_DEFAULTS[type] }
  if (type === 'table' && Array.isArray(node.rows)) defaults.sticky = node.rows.length > 15
  for (const [field, value] of Object.entries(defaults)) {
    if (hasOwn(node, field)) continue
    node[field] = value
    ctx.paths.set(joinPointer(cp, field), ip)
  }
}

const STAT_FIELDS = ['label', 'value', 'format', 'delta', 'deltaFormat', 'tone']

/** A positional stat, `[label, value, format?, delta?, deltaFormat?, tone?]` (VD-164). */
function statItemOf(raw: JsonValue, cp: string, ip: string, ctx: WalkContext): JsonValue {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 6 || typeof raw[0] !== 'string') {
    return raw
  }
  const item: JsonObject = {}
  raw.forEach((value, index) => {
    const field = STAT_FIELDS[index] as string
    if (value === null) return
    item[field] = value
    ctx.paths.set(joinPointer(cp, field), joinPointer(ip, index))
  })
  return item
}

function normalizeNode(
  raw: JsonValue,
  cp: string,
  ip: string,
  ctx: WalkContext,
  depth: number,
): JsonValue {
  if (depth >= MAX_NESTING) return raw
  if (typeof raw === 'string') {
    ctx.paths.set(joinPointer(cp, 'type'), ip)
    ctx.paths.set(joinPointer(cp, 'text'), ip)
    return { type: 'md', text: raw }
  }
  if (!isJsonObject(raw) || typeof raw.type !== 'string' || !KNOWN_TYPES.has(raw.type)) return raw

  const node = { ...raw }
  const { type } = raw
  switch (type) {
    case 'stack':
    case 'grid':
    case 'section':
    case 'card':
      expandNodes(node, cp, ip, ctx, depth)
      break
    case 'tabs':
      expandTabs(node, cp, ip, ctx, depth)
      break
    case 'stats':
      expandList(node, 'items', cp, ip, ctx, (item, itemCp, itemIp) =>
        statItemOf(item, itemCp, itemIp, ctx),
      )
      break
    case 'list':
    case 'checks':
    case 'timeline':
      expandList(node, 'items', cp, ip, ctx, (item) => item)
      break
    case 'plan':
    case 'tree':
      expandList(node, 'items', cp, ip, ctx, (item, itemCp, itemIp) =>
        normalizeItem(item, itemCp, itemIp, ctx, depth + 1),
      )
      break
    case 'table':
      expandTable(node, cp, ip, ctx)
      break
  }
  applyDefaults(node, type, cp, ip, ctx)
  return node
}

function expandBody(body: JsonValue[], bodyInput: string, ctx: WalkContext): JsonValue[] {
  return body.map((item, index) =>
    normalizeNode(item, joinPointer('/body', index), joinPointer(bodyInput, index), ctx, 0),
  )
}

/** Applies shorthands 1 and 2, and normalizes the body. */
function expandEnvelope(input: JsonValue, ctx: WalkContext): JsonObject {
  if (Array.isArray(input)) {
    ctx.paths.set('/body', '')
    return { body: expandBody(input, '', ctx) }
  }
  if (!isJsonObject(input)) return {}
  if (hasOwn(input, 'type')) {
    ctx.paths.set('/body', '')
    ctx.paths.set('/body/0', '')
    return { body: [normalizeNode(input, '/body/0', '', ctx, 0)] }
  }
  const envelope = { ...input }
  if (Array.isArray(envelope.body)) envelope.body = expandBody(envelope.body, '/body', ctx)
  return envelope
}

/**
 * Expands a JSON value to the canonical form (§2, §5.2, §5.3). Total and tolerant: what it
 * does not recognise stays in place for the validator to report (VD-024).
 */
export function normalize(input: JsonValue, options: NormalizeOptions = {}): NormalizeResult {
  const paths = new PathMapBuilder()
  const ctx: WalkContext = { paths, dropped: [], cells: 0 }
  const envelope = expandEnvelope(input, ctx)
  const defaults = { ...ENVELOPE_DEFAULTS }
  if (options.generatedAt !== undefined) defaults.generatedAt = options.generatedAt

  const document: JsonObject = {}
  for (const key of ENVELOPE_ORDER) {
    const value = hasOwn(envelope, key) ? envelope[key] : defaults[key]
    if (value === undefined) continue
    document[key] = value
    if (!hasOwn(envelope, key)) paths.set(`/${key}`, '')
  }
  const rest = { ...envelope }
  for (const key of ENVELOPE_ORDER) delete rest[key]
  return {
    document: { ...document, ...rest } as unknown as VuiDocument,
    paths: paths.build(),
    dropped: ctx.dropped,
  }
}
