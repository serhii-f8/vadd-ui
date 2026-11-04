// The canonical form (§2): every shorthand resolved, every default explicit.
// These types are the source of truth for the task 03 JSON Schema (§13.1), so they stay
// plain interfaces and literal unions.
//
// Fields with a stated default (VD-024) are required here. Other optional fields stay
// optional: their default is "none", which the canonical form spells as an absent key.

export const STATUSES = ['ok', 'fail', 'warn', 'info', 'run', 'wait', 'skip', 'none'] as const
export type Status = (typeof STATUSES)[number]

export const TONES = ['ok', 'warn', 'err', 'info', 'muted', 'accent', 'default'] as const
export type Tone = (typeof TONES)[number]

export const DENSITIES = ['compact', 'comfortable'] as const
export type Density = (typeof DENSITIES)[number]

export const COMPONENT_TYPES = [
  'stack',
  'grid',
  'section',
  'card',
  'tabs',
  'divider',
  'md',
  'callout',
  'code',
  'table',
  'kv',
  'stats',
  'list',
  'progress',
  'compare',
  'chart',
  'checks',
  'plan',
  'diff',
  'tree',
  'timeline',
  'decision',
  'log',
  'flow',
] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

/** A field that accepts the §5.5 inline subset. Task 04 parses it. */
export type InlineText = string

/** A format spec, `name` or `name:arg` (§7). Task 04 interprets it. */
export type Format = string

export type Scalar = string | number | boolean | null

/** Common node fields (§5.4). */
export interface NodeBase {
  id?: string
  title?: InlineText
  note?: InlineText
  tone?: Tone
  span?: number
  fold?: 'open' | 'closed'
}

// Layout (§6.1)

export interface StackNode extends NodeBase {
  type: 'stack'
  children: VuiNode[]
  gap?: 'sm' | 'md' | 'lg'
}

export interface GridNode extends NodeBase {
  type: 'grid'
  children: VuiNode[]
  /** Absent means auto by child count, which the renderer resolves (VD-024). */
  cols?: number
}

export interface SectionNode extends NodeBase {
  type: 'section'
  title: InlineText
  children: VuiNode[]
}

export interface CardNode extends NodeBase {
  type: 'card'
  children: VuiNode[]
}

export interface Tab {
  label: string
  children: VuiNode[]
}

export interface TabsNode extends NodeBase {
  type: 'tabs'
  tabs: Tab[]
  active?: number
}

export interface DividerNode extends NodeBase {
  type: 'divider'
  label?: string
}

// Text (§6.2)

export interface MdNode extends NodeBase {
  type: 'md'
  text: string
}

export interface CalloutNode extends NodeBase {
  type: 'callout'
  text: InlineText
  tone: Tone
}

export interface CodeNode extends NodeBase {
  type: 'code'
  text: string
  lang?: string
  lines?: true
  mark?: number[]
  maxLines: number
}

// Data (§6.3, §6.6)

export interface Column {
  key: string
  label: string
  format?: Format
  align?: 'left' | 'right' | 'center'
  cell?: 'text' | 'bar' | 'badge' | 'code'
  width?: 'auto' | 'narrow' | 'wide'
  wrap?: boolean
  /** Value-to-tone map for `cell: 'badge'` (§7). */
  tones?: Record<string, Tone>
}

export interface RowOptions {
  tone?: Tone
  note?: InlineText
}

/** Cells in column order; a trailing object is row options (§6.6). */
export type Row = (Scalar | RowOptions)[]

export interface TableNode extends NodeBase {
  type: 'table'
  columns: Column[]
  rows: Row[]
  sort?: [number, 'asc' | 'desc']
  pageSize: number
  totals?: Scalar[]
  group?: number
  sticky: boolean
}

export type KvPair = [string, Scalar] | [string, Scalar, Format]

export interface KvNode extends NodeBase {
  type: 'kv'
  pairs: KvPair[] | Record<string, Scalar>
  cols?: number
}

export interface StatItem {
  label: string
  value: Scalar
  format?: Format
  delta?: number
  deltaFormat?: Format
  tone?: Tone
  spark?: number[]
}

export interface StatsNode extends NodeBase {
  type: 'stats'
  items: StatItem[]
}

export interface ListItem {
  text: InlineText
  status?: Status
  note?: InlineText
}

export interface ListNode extends NodeBase {
  type: 'list'
  items: (InlineText | ListItem)[]
  ordered?: boolean
}

export interface ProgressSegment {
  value: number
  tone: Tone
  label: string
}

export interface ProgressNode extends NodeBase {
  type: 'progress'
  value: number
  max: number
  label?: string
  segments?: ProgressSegment[]
}

export interface CompareCriterion {
  label: string
  values: Scalar[]
  format?: Format
  better?: 'high' | 'low'
}

export interface CompareNode extends NodeBase {
  type: 'compare'
  options: string[]
  criteria: CompareCriterion[]
  pick?: number
}

// Charts (§6.4)

export interface RefLine {
  y: number
  label?: string
  tone?: Tone
}

export interface ChartBase extends NodeBase {
  type: 'chart'
  yFormat?: Format
  xFormat?: Format
  stackTotal?: true
  height?: 'sm' | 'md' | 'lg'
  legend?: 'auto' | 'none'
  refLines?: RefLine[]
}

export type Series = Record<string, number[]>

export interface CategoryChart extends ChartBase {
  kind: 'bar' | 'hbar' | 'stacked' | 'donut'
  x: string[]
  series: Series
}

export interface LineChart extends ChartBase {
  kind: 'line' | 'area'
  x: (string | number)[]
  series: Series
}

export interface SparkChart extends ChartBase {
  kind: 'spark'
  values: number[]
}

export type ScatterPoint = [number, number] | [number, number, string]

export interface ScatterChart extends ChartBase {
  kind: 'scatter'
  points: ScatterPoint[]
}

export type ChartNode = CategoryChart | LineChart | SparkChart | ScatterChart

// Dev workflow (§6.5, §6.7)

export interface CheckItem {
  name: string
  status: Status
  cmd?: string
  ms?: number
  output?: string
}

export interface ChecksNode extends NodeBase {
  type: 'checks'
  items: CheckItem[]
}

export interface PlanItem {
  text: InlineText
  status: Status
  note?: InlineText
  children?: PlanItem[]
}

export interface PlanNode extends NodeBase {
  type: 'plan'
  items: PlanItem[]
}

export type DiffFile =
  | [path: string, added: number, removed: number]
  | [path: string, added: number, removed: number, change: 'A' | 'M' | 'D' | 'R']

export interface DiffNode extends NodeBase {
  type: 'diff'
  files: DiffFile[]
  hunks?: Record<string, string>
}

export interface TreeItem {
  name: string
  status?: Status
  note?: InlineText
  children?: TreeItem[]
}

export interface TreeNode extends NodeBase {
  type: 'tree'
  items?: TreeItem[]
  paths?: string[]
}

export interface TimelineItem {
  at: string
  text: InlineText
  status?: Status
}

export interface TimelineNode extends NodeBase {
  type: 'timeline'
  items: TimelineItem[]
}

export interface DecisionOption {
  label: string
  pros?: string[]
  cons?: string[]
  effort?: 'XS' | 'S' | 'M' | 'L' | 'XL'
  reversible?: boolean
  risk?: 'low' | 'med' | 'high'
  verify?: InlineText
}

export interface DecisionNode extends NodeBase {
  type: 'decision'
  question: string
  context?: InlineText
  options: DecisionOption[]
  pick?: number
}

export interface LogNode extends NodeBase {
  type: 'log'
  text: string
  maxLines: number
}

export interface FlowNodeObject {
  id: string
  label?: string
  status?: Status
}

export type FlowEdge = [from: string, to: string] | [from: string, to: string, label: string]

export interface FlowNode extends NodeBase {
  type: 'flow'
  nodes: (string | FlowNodeObject)[]
  edges: FlowEdge[]
}

/** One of the 24 known components. Unknown types are handled at runtime (§17.1). */
export type VuiNode =
  | StackNode
  | GridNode
  | SectionNode
  | CardNode
  | TabsNode
  | DividerNode
  | MdNode
  | CalloutNode
  | CodeNode
  | TableNode
  | KvNode
  | StatsNode
  | ListNode
  | ProgressNode
  | CompareNode
  | ChartNode
  | ChecksNode
  | PlanNode
  | DiffNode
  | TreeNode
  | TimelineNode
  | DecisionNode
  | LogNode
  | FlowNode

/** The envelope in canonical form (§5.2). */
export interface VuiDocument {
  vui: number
  title?: string
  subtitle?: InlineText
  density: Density
  locale: string
  generatedAt?: string
  body: VuiNode[]
  meta?: Record<string, unknown>
}
