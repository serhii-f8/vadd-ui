import type { JsonValue } from './json.js'
import { COMPONENT_DEFAULTS } from './normalize.js'
import { CHART_SHAPES, type Field, NODE_BASE, NODE_SHAPES, type Rule, SHAPES } from './rules.js'
import { suggest } from './suggest.js'
import { COMPONENT_TYPES, type ComponentType } from './types.js'

// The CLI's on-demand reference (§11.1, §12), at its own entry point `@vadd/ui-spec/catalog`.
// `index.ts` must not import this: the text would land in the browser bundle (§9.5).
//
// Fields come from `SHAPES` and defaults from the normalizer, so neither can drift. What is
// written by hand here is what no rule holds: the §6 purpose and a minimal example.

export interface CatalogField {
  name: string
  type: string
  required: boolean
  default?: string
  /** The chart kinds that take this field. Absent means all of them. */
  kinds?: string[]
}

export interface CatalogShape {
  name: string
  fields: CatalogField[]
}

export interface CatalogEntry {
  name: ComponentType
  group: 'layout' | 'text' | 'data' | 'chart' | 'dev'
  summary: string
  fields: CatalogField[]
  /** The object shapes `fields` names, such as `Column`. */
  shapes: CatalogShape[]
  example: Record<string, unknown>
}

type Handwritten = Pick<CatalogEntry, 'group' | 'summary' | 'example'>

/** The §5.4 fields of every node. Listed once, and only where a component changes one. */
export const COMMON_FIELDS: readonly string[] = ['id', 'title', 'note', 'tone', 'span', 'fold']

/** §6 defaults that are a rule, not a value (VD-024). */
const COMPUTED_DEFAULTS: Record<string, string> = {
  'GridNode.cols': 'auto by child count',
  'TableNode.sticky': 'true when rows > 15',
}

const HANDWRITTEN: Record<ComponentType, Handwritten> = {
  stack: {
    group: 'layout',
    summary: 'Vertical group',
    example: { type: 'stack', children: ['First', 'Second'] },
  },
  grid: {
    group: 'layout',
    summary: 'Responsive columns; collapses to one column under 480 px',
    example: { type: 'grid', cols: 2, children: ['Left', 'Right'] },
  },
  section: {
    group: 'layout',
    summary: 'Heading plus content',
    example: { type: 'section', title: 'Results', children: ['All green'] },
  },
  card: {
    group: 'layout',
    summary: 'Bordered surface',
    example: { type: 'card', children: ['Inside'] },
  },
  tabs: {
    group: 'layout',
    summary: 'One visible panel at a time',
    example: {
      type: 'tabs',
      tabs: [
        { label: 'One', children: ['First'] },
        { label: 'Two', children: ['Second'] },
      ],
    },
  },
  divider: {
    group: 'layout',
    summary: 'Horizontal rule',
    example: { type: 'divider', label: 'Details' },
  },
  md: {
    group: 'text',
    summary: 'Markdown block: inline subset, headings, lists, blockquote, fenced code',
    example: { type: 'md', text: '### Notes\n\n- one\n- two' },
  },
  callout: {
    group: 'text',
    summary: 'Highlighted message',
    example: { type: 'callout', tone: 'warn', text: 'Check the **staging** config' },
  },
  code: {
    group: 'text',
    summary: 'Monospace block with copy button, line numbers and highlighted lines',
    example: { type: 'code', lang: 'sh', text: 'pnpm gate' },
  },
  table: {
    group: 'data',
    summary: 'Tabular data with per-column formats, sort and paging',
    example: {
      type: 'table',
      columns: ['Test', 'Status:status', 'Time:ms'],
      rows: [
        ['login', 'ok', 120],
        ['refresh', 'fail', 340],
      ],
    },
  },
  kv: {
    group: 'data',
    summary: 'Key-value pairs',
    example: { type: 'kv', pairs: { Branch: 'main', Commit: '4f2c1a9' } },
  },
  stats: {
    group: 'data',
    summary: 'Metric tiles',
    example: { type: 'stats', items: [{ label: 'Passed', value: 412, tone: 'ok' }] },
  },
  list: {
    group: 'data',
    summary: 'Items with status or icon',
    example: { type: 'list', items: ['Plain', { text: 'Done', status: 'ok' }] },
  },
  progress: {
    group: 'data',
    summary: 'Bar or segmented progress',
    example: { type: 'progress', value: 40, label: 'Migrated' },
  },
  compare: {
    group: 'data',
    summary: 'Options by criteria matrix with a highlighted winner',
    example: {
      type: 'compare',
      options: ['A', 'B'],
      criteria: [{ label: 'Latency', values: [80, 120], format: 'ms', better: 'low' }],
      pick: 0,
    },
  },
  chart: {
    group: 'chart',
    summary: 'Inline SVG chart; kind picks the data shape',
    example: { type: 'chart', kind: 'bar', x: ['a', 'b'], series: { runs: [3, 5] } },
  },
  checks: {
    group: 'dev',
    summary: 'Verification results; output folds, last 20 lines shown',
    example: { type: 'checks', items: [{ name: 'lint', status: 'ok', cmd: 'pnpm lint' }] },
  },
  plan: {
    group: 'dev',
    summary: 'Task plan with progress; header shows done/total',
    example: { type: 'plan', items: [{ text: 'Write tests', status: 'ok' }] },
  },
  diff: {
    group: 'dev',
    summary: 'Change summary',
    example: { type: 'diff', files: [['src/a.ts', 12, 3, 'M']] },
  },
  tree: {
    group: 'dev',
    summary: 'File or object tree',
    example: { type: 'tree', paths: ['src/a.ts', 'src/b.ts'] },
  },
  timeline: {
    group: 'dev',
    summary: 'Ordered events; at is an ISO time or a label',
    example: { type: 'timeline', items: [{ at: '2026-11-05T10:00:00Z', text: 'Deployed' }] },
  },
  decision: {
    group: 'dev',
    summary: 'A fork that needs a choice; pick marks the recommendation',
    example: {
      type: 'decision',
      question: 'Which cache?',
      options: [{ label: 'LRU', effort: 'S' }, { label: 'Redis' }],
      pick: 0,
    },
  },
  log: {
    group: 'dev',
    summary: 'Log excerpt with level highlighting',
    example: { type: 'log', text: 'INFO start\nERROR failed' },
  },
  flow: {
    group: 'dev',
    summary: 'Small directed graph with layered auto-layout',
    example: { type: 'flow', nodes: ['a', 'b'], edges: [['a', 'b']] },
  },
}

const shapeName = (shape: string): string => shape.replace(/Node$/, '')

function numberType(rule: Extract<Rule, { kind: 'number' }>): string {
  const name = rule.integer === true ? 'integer' : 'number'
  if (rule.min === undefined) return name
  return rule.max === undefined ? `${name} ≥${rule.min}` : `${name} ${rule.min}-${rule.max}`
}

function typeOf(rule: Rule): string {
  switch (rule.kind) {
    case 'number':
      return numberType(rule)
    case 'enum':
      return rule.values.join('|')
    case 'array':
      return `${typeOf(rule.items)}[]`
    case 'tuple': {
      const items = rule.items.map((item, index) => {
        return `${typeOf(item)}${index < rule.min ? '' : '?'}`
      })
      return `[${items.join(', ')}]`
    }
    case 'record':
      return `{key: ${typeOf(rule.values)}}`
    case 'object':
      return shapeName(rule.shape)
    case 'nested':
      return `${shapeName(rule.shape)}[]`
    case 'oneOf':
      return rule.options.map(typeOf).join(' or ')
    case 'any-object':
      return 'object'
    default:
      return rule.kind
  }
}

function defaultOf(owner: string, name: string): string | undefined {
  const computed = COMPUTED_DEFAULTS[`${owner}.${name}`]
  if (computed !== undefined) return computed
  const component = [...NODE_SHAPES].find(([, shape]) => shape === owner)?.[0] ?? ''
  const value: JsonValue | undefined = COMPONENT_DEFAULTS[component]?.[name]
  return value === undefined ? undefined : String(value)
}

function fieldOf(owner: string, name: string, field: Field): CatalogField {
  const entry: CatalogField = {
    name,
    type: typeOf(field.rule),
    required: field.presence === 'required',
  }
  const value = defaultOf(owner, name)
  if (value !== undefined) entry.default = value
  return entry
}

/** A field a node owns: not `type`, and not a common field left as §5.4 has it. */
function isOwn(name: string, field: Field): boolean {
  return name !== 'type' && (!COMMON_FIELDS.includes(name) || field !== NODE_BASE[name])
}

function ownFields(shape: string): CatalogField[] {
  const fields = SHAPES[shape]?.fields ?? {}
  return Object.entries(fields)
    .filter(([name, field]) => isOwn(name, field))
    .map(([name, field]) => fieldOf(shape, name, field))
}

function subShapes(rule: Rule, seen: Set<string>): void {
  switch (rule.kind) {
    case 'array':
    case 'record':
      subShapes(rule.kind === 'array' ? rule.items : rule.values, seen)
      break
    case 'tuple':
      for (const item of rule.items) subShapes(item, seen)
      break
    case 'oneOf':
      for (const item of rule.options) subShapes(item, seen)
      break
    case 'object':
    case 'nested':
      collectShape(rule.shape, seen)
      break
    default:
  }
}

function collectShape(shape: string, seen: Set<string>): void {
  if (seen.has(shape)) return
  seen.add(shape)
  for (const field of Object.values(SHAPES[shape]?.fields ?? {})) subShapes(field.rule, seen)
}

/** The object shapes `shapes` reach, in first-reached order. */
function usedShapes(shapes: string[]): CatalogShape[] {
  const seen = new Set<string>()
  for (const shape of shapes) {
    const fields = SHAPES[shape]?.fields ?? {}
    for (const [name, field] of Object.entries(fields)) {
      if (isOwn(name, field)) subShapes(field.rule, seen)
    }
  }
  return [...seen].map((name) => ({ name: shapeName(name), fields: ownFields(name) }))
}

/** One list for the four chart shapes. A field whose type depends on `kind` appears per type. */
function chartFields(): CatalogField[] {
  const kindsOf = new Map<string, string[]>()
  const merged = new Map<string, CatalogField>()
  for (const [kind, shape] of CHART_SHAPES) {
    for (const field of ownFields(shape)) {
      if (field.name === 'kind') continue
      const key = `${field.name}:${field.type}`
      merged.set(key, field)
      kindsOf.set(key, [...(kindsOf.get(key) ?? []), kind])
    }
  }
  const fields = [...merged].map(([key, field]) => {
    const kinds = kindsOf.get(key) as string[]
    return kinds.length === CHART_SHAPES.size ? field : { ...field, kinds }
  })
  const kind = { name: 'kind', type: [...CHART_SHAPES.keys()].join('|'), required: true }
  return [kind, ...fields]
}

function entryOf(name: ComponentType): CatalogEntry {
  const written = HANDWRITTEN[name]
  const shape = NODE_SHAPES.get(name)
  return shape === undefined
    ? {
        name,
        ...written,
        fields: chartFields(),
        shapes: usedShapes([...new Set(CHART_SHAPES.values())]),
      }
    : { name, ...written, fields: ownFields(shape), shapes: usedShapes([shape]) }
}

export const CATALOG: readonly CatalogEntry[] = COMPONENT_TYPES.map(entryOf)

export function findComponent(name: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.name === name)
}

export function nearestComponent(name: string): string | undefined {
  return suggest(name, COMPONENT_TYPES)
}
