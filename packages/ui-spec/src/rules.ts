import { DENSITIES, STATUSES, TONES } from './types.js'

// The field rules of §5.2, §5.4 and §6 as data. One shape per object type, named after its
// interface in `types.ts`. A test compares these with the generated schema rule by rule.

export type Rule =
  | { kind: 'any' }
  | { kind: 'string'; long?: true }
  | { kind: 'format' }
  | { kind: 'number'; integer?: true; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'true' }
  | { kind: 'scalar' }
  | { kind: 'version' }
  | { kind: 'enum'; label: string; values: readonly string[] }
  | { kind: 'array'; items: Rule }
  | { kind: 'tuple'; items: Rule[]; min: number }
  | { kind: 'record'; values: Rule }
  | { kind: 'object'; shape: string }
  | { kind: 'any-object' }
  | { kind: 'oneOf'; options: Rule[]; expected: string }
  | { kind: 'node' }
  /** An array of items that nest, so each level counts towards depth (VD-032). */
  | { kind: 'nested'; shape: string }

/** `default`: required in the canonical form, optional to the author (VD-024). */
export type Presence = 'required' | 'optional' | 'default'

export interface Field {
  rule: Rule
  presence: Presence
}

export interface Shape {
  fields: Record<string, Field>
}

const req = (rule: Rule): Field => ({ rule, presence: 'required' })
const opt = (rule: Rule): Field => ({ rule, presence: 'optional' })
const dflt = (rule: Rule): Field => ({ rule, presence: 'default' })

const any: Rule = { kind: 'any' }
const string: Rule = { kind: 'string' }
const longString: Rule = { kind: 'string', long: true }
const format: Rule = { kind: 'format' }
const number: Rule = { kind: 'number' }
const boolean: Rule = { kind: 'boolean' }
const literalTrue: Rule = { kind: 'true' }
const scalar: Rule = { kind: 'scalar' }
const node: Rule = { kind: 'node' }
const positiveInt: Rule = { kind: 'number', integer: true, min: 1 }
const nonNegativeInt: Rule = { kind: 'number', integer: true, min: 0 }
const upTo = (max: number): Rule => ({ kind: 'number', integer: true, min: 1, max })

const oneIn = (label: string, values: readonly string[]): Rule => ({ kind: 'enum', label, values })
const list = (items: Rule): Rule => ({ kind: 'array', items })
const object = (shape: string): Rule => ({ kind: 'object', shape })
const record = (values: Rule): Rule => ({ kind: 'record', values })
const tuple = (min: number, ...items: Rule[]): Rule => ({ kind: 'tuple', items, min })
const oneOf = (expected: string, ...options: Rule[]): Rule => ({ kind: 'oneOf', options, expected })
const nested = (shape: string): Rule => ({ kind: 'nested', shape })

const tone = oneIn('a tone', TONES)
const status = oneIn('a status', STATUSES)
const size = oneIn('a size', ['sm', 'md', 'lg'])

export const NODE_BASE: Record<string, Field> = {
  id: opt(string),
  title: opt(string),
  note: opt(string),
  tone: opt(tone),
  span: opt(upTo(12)),
  fold: opt(oneIn('a fold state', ['open', 'closed'])),
  type: req(any),
}

const nodeShape = (fields: Record<string, Field>): Shape => ({
  fields: { ...NODE_BASE, ...fields },
})

const children = req(list(node))

const CHART_BASE: Record<string, Field> = {
  yFormat: opt(format),
  xFormat: opt(format),
  stackTotal: opt(literalTrue),
  height: opt(size),
  legend: opt(oneIn('a legend mode', ['auto', 'none'])),
  refLines: opt(list(object('RefLine'))),
}

const series = req(record(list(number)))

const chartKind = (...kinds: string[]) => req(oneIn('a chart kind', kinds))

export const SHAPES: Record<string, Shape> = {
  VuiDocument: {
    fields: {
      vui: dflt({ kind: 'version' }),
      title: opt(string),
      subtitle: opt(string),
      density: dflt(oneIn('a density', DENSITIES)),
      locale: dflt(string),
      generatedAt: opt(string),
      body: req(list(node)),
      meta: opt({ kind: 'any-object' }),
    },
  },

  StackNode: nodeShape({ children, gap: opt(size) }),
  GridNode: nodeShape({ children, cols: opt(upTo(6)) }),
  SectionNode: nodeShape({ title: req(string), children }),
  CardNode: nodeShape({ children }),
  Tab: { fields: { label: req(string), children } },
  TabsNode: nodeShape({ tabs: req(list(object('Tab'))), active: opt(nonNegativeInt) }),
  DividerNode: nodeShape({ label: opt(string) }),

  MdNode: nodeShape({ text: req(longString) }),
  CalloutNode: nodeShape({ text: req(string), tone: dflt(tone) }),
  CodeNode: nodeShape({
    text: req(longString),
    lang: opt(string),
    lines: opt(literalTrue),
    mark: opt(list(positiveInt)),
    maxLines: dflt(positiveInt),
  }),

  Column: {
    fields: {
      key: req(string),
      label: req(string),
      format: opt(format),
      align: opt(oneIn('an alignment', ['left', 'right', 'center'])),
      cell: opt(oneIn('a cell type', ['text', 'bar', 'badge', 'code'])),
      width: opt(oneIn('a width', ['auto', 'narrow', 'wide'])),
      wrap: opt(boolean),
      tones: opt(record(tone)),
    },
  },
  RowOptions: { fields: { tone: opt(tone), note: opt(string) } },
  TableNode: nodeShape({
    columns: req(list(object('Column'))),
    rows: req(list(list(oneOf('a cell or row options', scalar, object('RowOptions'))))),
    sort: opt(tuple(2, nonNegativeInt, oneIn('a sort direction', ['asc', 'desc']))),
    pageSize: dflt(positiveInt),
    totals: opt(list(scalar)),
    group: opt(nonNegativeInt),
    sticky: dflt(boolean),
  }),

  KvNode: nodeShape({
    pairs: req(oneOf('pairs or an object', list(tuple(2, string, scalar, format)), record(scalar))),
    cols: opt(upTo(3)),
  }),
  StatItem: {
    fields: {
      label: req(string),
      value: req(scalar),
      format: opt(format),
      delta: opt(number),
      deltaFormat: opt(format),
      tone: opt(tone),
      spark: opt(list(number)),
    },
  },
  StatsNode: nodeShape({ items: req(list(object('StatItem'))) }),
  ListItem: { fields: { text: req(string), status: opt(status), note: opt(string) } },
  ListNode: nodeShape({
    items: req(list(oneOf('text or an item', string, object('ListItem')))),
    ordered: opt(boolean),
  }),
  ProgressSegment: { fields: { value: req(number), tone: req(tone), label: req(string) } },
  ProgressNode: nodeShape({
    value: req(number),
    max: dflt(number),
    label: opt(string),
    segments: opt(list(object('ProgressSegment'))),
  }),
  CompareCriterion: {
    fields: {
      label: req(string),
      values: req(list(scalar)),
      format: opt(format),
      better: opt(oneIn('a direction', ['high', 'low'])),
    },
  },
  CompareNode: nodeShape({
    options: req(list(string)),
    criteria: req(list(object('CompareCriterion'))),
    pick: opt(nonNegativeInt),
  }),

  RefLine: { fields: { y: req(number), label: req(string), tone: req(tone) } },
  CategoryChart: nodeShape({
    ...CHART_BASE,
    kind: chartKind('bar', 'hbar', 'stacked', 'donut'),
    x: req(list(string)),
    series,
  }),
  LineChart: nodeShape({
    ...CHART_BASE,
    kind: chartKind('line', 'area'),
    x: req(oneOf('labels or numbers', list(string), list(number))),
    series,
  }),
  SparkChart: nodeShape({ ...CHART_BASE, kind: chartKind('spark'), values: req(list(number)) }),
  ScatterChart: nodeShape({
    ...CHART_BASE,
    kind: chartKind('scatter'),
    points: req(list(tuple(2, number, number, string))),
  }),

  CheckItem: {
    fields: {
      name: req(string),
      status: req(status),
      cmd: opt(string),
      ms: opt(number),
      output: opt(string),
    },
  },
  ChecksNode: nodeShape({ items: req(list(object('CheckItem'))) }),
  PlanItem: {
    fields: {
      text: req(string),
      status: req(status),
      note: opt(string),
      children: opt(nested('PlanItem')),
    },
  },
  PlanNode: nodeShape({ items: req(nested('PlanItem')) }),
  DiffNode: nodeShape({
    files: req(
      list(
        tuple(3, string, nonNegativeInt, nonNegativeInt, oneIn('a change', ['A', 'M', 'D', 'R'])),
      ),
    ),
    hunks: opt(record(string)),
  }),
  TreeItem: {
    fields: {
      name: req(string),
      status: opt(status),
      note: opt(string),
      children: opt(nested('TreeItem')),
    },
  },
  TreeNode: nodeShape({ items: opt(nested('TreeItem')), paths: opt(list(string)) }),
  TimelineItem: { fields: { at: req(string), text: req(string), status: opt(status) } },
  TimelineNode: nodeShape({ items: req(list(object('TimelineItem'))) }),
  DecisionOption: {
    fields: {
      label: req(string),
      pros: opt(list(string)),
      cons: opt(list(string)),
      effort: opt(oneIn('an effort', ['XS', 'S', 'M', 'L', 'XL'])),
      reversible: opt(boolean),
      risk: opt(oneIn('a risk', ['low', 'med', 'high'])),
      verify: opt(string),
    },
  },
  DecisionNode: nodeShape({
    question: req(string),
    context: opt(string),
    options: req(list(object('DecisionOption'))),
    pick: opt(nonNegativeInt),
  }),
  LogNode: nodeShape({ text: req(longString), maxLines: dflt(positiveInt) }),
  FlowNodeObject: { fields: { id: req(string), label: req(string), status: opt(status) } },
  FlowNode: nodeShape({
    nodes: req(list(oneOf('an id or a node', string, object('FlowNodeObject')))),
    edges: req(list(tuple(2, string, string, string))),
  }),
}

/** Shape of each component but `chart`, whose shape depends on `kind`. */
export const NODE_SHAPES: ReadonlyMap<string, string> = new Map([
  ['stack', 'StackNode'],
  ['grid', 'GridNode'],
  ['section', 'SectionNode'],
  ['card', 'CardNode'],
  ['tabs', 'TabsNode'],
  ['divider', 'DividerNode'],
  ['md', 'MdNode'],
  ['callout', 'CalloutNode'],
  ['code', 'CodeNode'],
  ['table', 'TableNode'],
  ['kv', 'KvNode'],
  ['stats', 'StatsNode'],
  ['list', 'ListNode'],
  ['progress', 'ProgressNode'],
  ['compare', 'CompareNode'],
  ['checks', 'ChecksNode'],
  ['plan', 'PlanNode'],
  ['diff', 'DiffNode'],
  ['tree', 'TreeNode'],
  ['timeline', 'TimelineNode'],
  ['decision', 'DecisionNode'],
  ['log', 'LogNode'],
  ['flow', 'FlowNode'],
])

export const CHART_SHAPES: ReadonlyMap<string, string> = new Map([
  ['bar', 'CategoryChart'],
  ['hbar', 'CategoryChart'],
  ['stacked', 'CategoryChart'],
  ['donut', 'CategoryChart'],
  ['line', 'LineChart'],
  ['area', 'LineChart'],
  ['spark', 'SparkChart'],
  ['scatter', 'ScatterChart'],
])
