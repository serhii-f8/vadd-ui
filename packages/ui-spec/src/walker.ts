import type { DiagnosticCode, Severity } from './diagnostics.js'
import { quote } from './diagnostics.js'
import { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
import { LIMITS } from './limits.js'
import { MAX_NESTING } from './parser.js'
import { joinPointer } from './pointer.js'
import { CHART_SHAPES, NODE_SHAPES, type Rule, SHAPES } from './rules.js'
import { suggest } from './suggest.js'
import { COMPONENT_TYPES, FORMAT_NAMES } from './types.js'

export type Report = (
  severity: Severity,
  pointer: string,
  code: DiagnosticCode,
  message: string,
  hint?: string,
) => void

const CHART_KINDS = [...CHART_SHAPES.keys()]
const FORMATS: ReadonlySet<string> = new Set(FORMAT_NAMES)

function didYouMean(value: string, candidates: readonly string[]): string | undefined {
  const candidate = suggest(value, candidates)
  return candidate === undefined ? undefined : `did you mean ${quote(candidate)}?`
}

function typeName(value: JsonValue): string {
  if (value === null) return 'null'
  return Array.isArray(value) ? 'array' : typeof value
}

function describe(rule: Rule): string {
  switch (rule.kind) {
    case 'string':
    case 'format':
      return 'a string'
    case 'number':
      return rule.integer ? 'an integer' : 'a number'
    case 'boolean':
      return 'a boolean'
    case 'true':
      return 'true'
    case 'scalar':
      return 'a string, number, boolean or null'
    case 'enum':
      return rule.label
    case 'array':
    case 'nested':
    case 'tuple':
      return 'an array'
    case 'oneOf':
      return rule.expected
    case 'node':
      return 'a node'
    default:
      return 'an object'
  }
}

function range({ min, max }: { min?: number; max?: number }): string {
  return max === undefined ? `an integer of at least ${min}` : `an integer from ${min} to ${max}`
}

/** Shallow test that picks the branch of a `oneOf`. */
function accepts(rule: Rule, value: JsonValue): boolean {
  switch (rule.kind) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'scalar':
      return value === null || typeof value !== 'object'
    case 'array': {
      const [first] = Array.isArray(value) ? value : []
      return Array.isArray(value) && (first === undefined || accepts(rule.items, first))
    }
    case 'tuple':
      return Array.isArray(value)
    default:
      return isJsonObject(value)
  }
}

function asArray(value: JsonValue | undefined): JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined
}

/** Walks the canonical form. Reports through canonical pointers; the caller translates. */
class Walker {
  private nodes = 0

  constructor(private readonly report: Report) {}

  document(document: JsonObject): void {
    this.shape('VuiDocument', document, '', 0)
    if (this.nodes > LIMITS.nodes) {
      const message = `document has ${this.nodes} nodes; the limit is ${LIMITS.nodes}`
      this.report('error', '', 'limit-nodes', message)
    }
  }

  private badType(rule: Rule, value: JsonValue, pointer: string, required: boolean): void {
    const message = `expected ${describe(rule)}, got ${typeName(value)}`
    this.report(required ? 'error' : 'warn', pointer, 'bad-type', message)
  }

  /** Counts one level of nesting. False past the point where subtrees stay raw. */
  private enter(depth: number, pointer: string): boolean {
    if (depth === LIMITS.depth + 1) {
      this.report('error', pointer, 'limit-depth', `nesting exceeds ${LIMITS.depth} levels`)
    }
    return depth <= MAX_NESTING
  }

  private length(value: string, limit: number, pointer: string): void {
    if (value.length <= limit) return
    const message = `string has ${value.length} chars; the limit is ${limit}`
    this.report('error', pointer, 'limit-string', message)
  }

  private check(
    rule: Rule,
    value: JsonValue,
    pointer: string,
    required: boolean,
    depth: number,
  ): void {
    switch (rule.kind) {
      case 'any':
        return
      case 'string':
        if (typeof value !== 'string') {
          this.badType(rule, value, pointer, required)
          return
        }
        this.length(value, rule.long ? LIMITS.longString : LIMITS.string, pointer)
        return
      case 'format':
        this.format(rule, value, pointer, required)
        return
      case 'number':
        this.number(rule, value, pointer, required)
        return
      case 'boolean':
        if (typeof value !== 'boolean') this.badType(rule, value, pointer, required)
        return
      case 'true':
        if (value !== true) this.badType(rule, value, pointer, required)
        return
      case 'scalar':
        this.scalar(rule, value, pointer, required)
        return
      case 'version':
        if (value !== 1) {
          const shown = JSON.stringify(value).slice(0, 20)
          this.report(
            'error',
            pointer,
            'bad-version',
            `unsupported vui ${shown}; this version is 1`,
          )
        }
        return
      case 'enum':
        this.enumeration(rule, value, pointer, required)
        return
      case 'array':
        if (!Array.isArray(value)) {
          this.badType(rule, value, pointer, required)
          return
        }
        value.forEach((item, index) => {
          this.check(rule.items, item, joinPointer(pointer, index), required, depth)
        })
        return
      case 'tuple':
        this.tuple(rule, value, pointer, required, depth)
        return
      case 'record':
        if (!isJsonObject(value)) {
          this.badType(rule, value, pointer, required)
          return
        }
        for (const [key, item] of Object.entries(value)) {
          this.check(rule.values, item, joinPointer(pointer, key), required, depth)
        }
        return
      case 'object':
        if (!isJsonObject(value)) {
          this.badType(rule, value, pointer, required)
          return
        }
        this.shape(rule.shape, value, pointer, depth)
        return
      case 'any-object':
        if (!isJsonObject(value)) this.badType(rule, value, pointer, required)
        return
      case 'oneOf': {
        const option = rule.options.find((candidate) => accepts(candidate, value))
        if (option === undefined) {
          this.badType(rule, value, pointer, required)
          return
        }
        this.check(option, value, pointer, required, depth)
        return
      }
      case 'node':
        this.node(value, pointer, depth + 1)
        return
      case 'nested':
        this.nested(rule, value, pointer, required, depth)
        return
    }
  }

  private format(rule: Rule, value: JsonValue, pointer: string, required: boolean): void {
    if (typeof value !== 'string') {
      this.badType(rule, value, pointer, required)
      return
    }
    this.length(value, LIMITS.string, pointer)
    const colon = value.indexOf(':')
    const name = colon === -1 ? value : value.slice(0, colon)
    if (FORMATS.has(name)) return
    const hint = didYouMean(name, FORMAT_NAMES)
    this.report('warn', pointer, 'unknown-format', `unknown format ${quote(name)}`, hint)
  }

  private number(
    rule: Extract<Rule, { kind: 'number' }>,
    value: JsonValue,
    pointer: string,
    required: boolean,
  ): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.badType(rule, value, pointer, required)
      return
    }
    const { integer, min = value, max = value } = rule
    if ((integer && !Number.isInteger(value)) || value < min || value > max) {
      const expected = rule.min === undefined ? 'an integer' : range(rule)
      this.report('warn', pointer, 'bad-range', `expected ${expected}, got ${value}`)
    }
  }

  private scalar(rule: Rule, value: JsonValue, pointer: string, required: boolean): void {
    if (!accepts(rule, value) || (typeof value === 'number' && !Number.isFinite(value))) {
      this.badType(rule, value, pointer, required)
      return
    }
    if (typeof value === 'string') this.length(value, LIMITS.string, pointer)
  }

  private enumeration(
    rule: Extract<Rule, { kind: 'enum' }>,
    value: JsonValue,
    pointer: string,
    required: boolean,
  ): void {
    if (typeof value !== 'string') {
      this.badType(rule, value, pointer, required)
      return
    }
    if (rule.values.includes(value)) return
    const hint = didYouMean(value, rule.values)
    const message = `${quote(value)} is not ${rule.label}; use ${rule.values.join('|')}`
    this.report('warn', pointer, 'bad-enum', message, hint)
  }

  private tuple(
    rule: Extract<Rule, { kind: 'tuple' }>,
    value: JsonValue,
    pointer: string,
    required: boolean,
    depth: number,
  ): void {
    if (!Array.isArray(value)) {
      this.badType(rule, value, pointer, required)
      return
    }
    const { items, min } = rule
    if (value.length < min || value.length > items.length) {
      const expected = min === items.length ? `${min}` : `${min} to ${items.length}`
      const message = `expected ${expected} items, got ${value.length}`
      this.report(required ? 'error' : 'warn', pointer, 'bad-type', message)
    }
    items.forEach((item, index) => {
      const element = value[index]
      if (element === undefined) return
      this.check(item, element, joinPointer(pointer, index), required && index < min, depth)
    })
  }

  private nested(
    rule: Extract<Rule, { kind: 'nested' }>,
    value: JsonValue,
    pointer: string,
    required: boolean,
    depth: number,
  ): void {
    if (!Array.isArray(value)) {
      this.badType(rule, value, pointer, required)
      return
    }
    value.forEach((item, index) => {
      const itemPointer = joinPointer(pointer, index)
      if (!this.enter(depth + 1, itemPointer)) return
      if (isJsonObject(item)) this.shape(rule.shape, item, itemPointer, depth + 1)
      else this.badType({ kind: 'object', shape: rule.shape }, item, itemPointer, required)
    })
  }

  private node(value: JsonValue, pointer: string, depth: number): void {
    if (!this.enter(depth, pointer)) return
    this.nodes++
    if (!isJsonObject(value)) {
      this.badType({ kind: 'node' }, value, pointer, true)
      return
    }
    const type = value.type
    if (!hasOwn(value, 'type')) {
      this.report('error', pointer, 'missing-field', 'missing required field "type"')
      return
    }
    if (typeof type !== 'string') {
      const typePointer = joinPointer(pointer, 'type')
      this.badType({ kind: 'string' }, type as JsonValue, typePointer, true)
      return
    }
    const shape = type === 'chart' ? this.chartShape(value, pointer) : NODE_SHAPES.get(type)
    if (shape !== undefined) {
      this.shape(shape, value, pointer, depth)
      return
    }
    if (type === 'chart') return
    const message = `unknown type ${quote(type)}`
    this.report('error', pointer, 'unknown-type', message, didYouMean(type, COMPONENT_TYPES))
  }

  private chartShape(chart: JsonObject, pointer: string): string | undefined {
    const kind = chart.kind
    const kindPointer = joinPointer(pointer, 'kind')
    if (!hasOwn(chart, 'kind')) {
      this.report('error', pointer, 'missing-field', 'missing required field "kind"')
    } else if (typeof kind !== 'string') {
      this.badType({ kind: 'string' }, kind as JsonValue, kindPointer, true)
    } else if (!CHART_SHAPES.has(kind)) {
      const message = `${quote(kind)} is not a chart kind; use ${CHART_KINDS.join('|')}`
      this.report('error', kindPointer, 'bad-enum', message, didYouMean(kind, CHART_KINDS))
    } else {
      return CHART_SHAPES.get(kind)
    }
    return undefined
  }

  private shape(name: string, value: JsonObject, pointer: string, depth: number): void {
    const { fields } = SHAPES[name] as { fields: (typeof SHAPES)[string]['fields'] }
    for (const [field, { rule, presence }] of Object.entries(fields)) {
      if (hasOwn(value, field)) {
        const required = presence === 'required'
        this.check(rule, value[field] as JsonValue, joinPointer(pointer, field), required, depth)
      } else if (presence === 'required') {
        this.report('error', pointer, 'missing-field', `missing required field ${quote(field)}`)
      }
    }
    const known = Object.keys(fields)
    for (const key of Object.keys(value)) {
      if (hasOwn(fields, key)) continue
      const message = `unknown field ${quote(key)} is ignored`
      const fieldPointer = joinPointer(pointer, key)
      this.report('info', fieldPointer, 'unknown-field', message, didYouMean(key, known))
    }
    CROSS_FIELD[name]?.(this.report, value, pointer)
  }
}

type CrossField = (report: Report, value: JsonObject, pointer: string) => void

function checkIndex(report: Report, index: JsonValue | undefined, size: number, pointer: string) {
  if (typeof index === 'number' && Number.isInteger(index) && index >= size) {
    report('warn', pointer, 'bad-index', `index ${index} is past the ${size} available`)
  }
}

function checkLength(report: Report, actual: number, expected: number, pointer: string) {
  if (actual === expected) return
  report('warn', pointer, 'length-mismatch', `expected ${expected} values, got ${actual}`)
}

function checkPoints(report: Report, count: number, pointer: string) {
  if (count <= LIMITS.chartPoints) return
  const message = `series has ${count} points; the limit is ${LIMITS.chartPoints}`
  report('error', pointer, 'limit-chart-points', message)
}

function checkRow(report: Report, row: JsonValue[], width: number, pointer: string) {
  const last = row.length - 1
  const cells = isJsonObject(row[last]) ? last : row.length
  for (let index = 0; index < cells; index++) {
    if (isJsonObject(row[index] as JsonValue)) {
      const message = 'an object is allowed only as the last element of a row'
      report('error', joinPointer(pointer, index), 'bad-cell', message)
    }
  }
  if (cells !== width)
    report('error', pointer, 'row-arity', `expected ${width} cells, got ${cells}`)
}

function checkTable(report: Report, table: JsonObject, pointer: string) {
  const columns = asArray(table.columns)
  const rows = asArray(table.rows)
  if (columns && columns.length > LIMITS.tableColumns) {
    const message = `table has ${columns.length} columns; the limit is ${LIMITS.tableColumns}`
    report('error', joinPointer(pointer, 'columns'), 'limit-table-columns', message)
  }
  if (rows && rows.length > LIMITS.tableRows) {
    const message = `table has ${rows.length} rows; the limit is ${LIMITS.tableRows}`
    report('error', joinPointer(pointer, 'rows'), 'limit-table-rows', message)
  }
  if (!columns) return
  rows?.forEach((row, index) => {
    if (Array.isArray(row)) {
      checkRow(report, row, columns.length, joinPointer(joinPointer(pointer, 'rows'), index))
    }
  })
  const [sortColumn] = asArray(table.sort) ?? []
  const sortPointer = joinPointer(joinPointer(pointer, 'sort'), 0)
  checkIndex(report, sortColumn, columns.length, sortPointer)
  checkIndex(report, table.group, columns.length, joinPointer(pointer, 'group'))
  const totals = asArray(table.totals)
  if (totals) {
    checkLength(report, totals.length, columns.length, joinPointer(pointer, 'totals'))
  }
}

function checkSeries(report: Report, chart: JsonObject, pointer: string) {
  if (!isJsonObject(chart.series)) return
  const seriesPointer = joinPointer(pointer, 'series')
  const entries = Object.entries(chart.series)
  if (entries.length > LIMITS.chartSeries) {
    const message = `chart has ${entries.length} series; the limit is ${LIMITS.chartSeries}`
    report('error', seriesPointer, 'limit-chart-series', message)
  }
  if (chart.kind === 'donut') checkLength(report, entries.length, 1, seriesPointer)
  const x = asArray(chart.x)
  for (const [name, data] of entries) {
    if (!Array.isArray(data)) continue
    const dataPointer = joinPointer(seriesPointer, name)
    checkPoints(report, data.length, dataPointer)
    if (x) checkLength(report, data.length, x.length, dataPointer)
  }
}

function checkFlow(report: Report, flow: JsonObject, pointer: string) {
  const nodes = asArray(flow.nodes) ?? []
  if (nodes.length > LIMITS.flowNodes) {
    const message = `flow has ${nodes.length} nodes; the limit is ${LIMITS.flowNodes}`
    report('error', joinPointer(pointer, 'nodes'), 'limit-flow-nodes', message)
  }
  const ids = nodes.map((node) => (isJsonObject(node) ? node.id : node))
  const edgesPointer = joinPointer(pointer, 'edges')
  asArray(flow.edges)?.forEach((edge, index) => {
    for (const end of [0, 1]) {
      const id = asArray(edge)?.[end]
      if (typeof id !== 'string' || ids.includes(id)) continue
      const message = `edge refers to undeclared node ${quote(id)}`
      const known = ids.filter((candidate): candidate is string => typeof candidate === 'string')
      const hint = didYouMean(id, known)
      const endPointer = joinPointer(joinPointer(edgesPointer, index), end)
      report('warn', endPointer, 'bad-ref', message, hint)
    }
  })
}

function checkCount(field: string, list: string): CrossField {
  return (report, value, pointer) => {
    const size = asArray(value[list])?.length ?? 0
    checkIndex(report, value[field], size, joinPointer(pointer, field))
  }
}

const CROSS_FIELD: Record<string, CrossField> = {
  TableNode: checkTable,
  TabsNode: checkCount('active', 'tabs'),
  DecisionNode: checkCount('pick', 'options'),
  CompareNode(report, compare, pointer) {
    checkCount('pick', 'options')(report, compare, pointer)
    const size = asArray(compare.options)?.length ?? 0
    asArray(compare.criteria)?.forEach((criterion, index) => {
      const values = isJsonObject(criterion) ? asArray(criterion.values) : undefined
      if (values) {
        const criterionPointer = joinPointer(joinPointer(pointer, 'criteria'), index)
        checkLength(report, values.length, size, joinPointer(criterionPointer, 'values'))
      }
    })
  },
  CategoryChart: checkSeries,
  LineChart: checkSeries,
  SparkChart(report, chart, pointer) {
    const values = asArray(chart.values)
    if (values) checkPoints(report, values.length, joinPointer(pointer, 'values'))
  },
  ScatterChart(report, chart, pointer) {
    const points = asArray(chart.points)
    if (points) checkPoints(report, points.length, joinPointer(pointer, 'points'))
  },
  FlowNode: checkFlow,
  TreeNode(report, tree, pointer) {
    if (hasOwn(tree, 'items') || hasOwn(tree, 'paths')) return
    report('error', pointer, 'tree-source', 'a tree needs "items" or "paths"')
  },
}

export function walk(document: JsonObject, report: Report): void {
  new Walker(report).document(document)
}
