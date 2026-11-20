import { type DiagnosticCode, quote, type Severity } from './diagnostics.js'
import { isLocale } from './format.js'
import {
  checkFormat,
  checkValue,
  type FormatSpec,
  isKnownFormat,
  parseFormat,
  parseTime,
} from './format-spec.js'
import { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
import { LIMITS } from './limits.js'
import { STAT_FIELDS, STAT_MIN_ENTRIES } from './normalize.js'
import { MAX_NESTING } from './parser.js'
import { joinPointer } from './pointer.js'
import { CHART_SHAPES, NODE_SHAPES, type Rule, SHAPES, type Shape } from './rules.js'
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
/** The list fields an author mixes up between components, as `items` on a `kv` (VD-214). */
const LISTS = ['items', 'pairs', 'rows', 'points', 'values', 'files', 'nodes']
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
      return `${rule.label} (${rule.values.join('|')})`
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

/** A positional stat the normalizer could not expand (VD-164) says why, not just "array". */
function statMessage(rule: Rule, value: JsonValue): string | undefined {
  if (rule.kind !== 'object' || rule.shape !== 'StatItem' || !Array.isArray(value)) return undefined
  const expected = 'expected an object or a positional item'
  const { length } = value
  if (length >= STAT_MIN_ENTRIES && length <= STAT_FIELDS.length) {
    return `${expected} whose first entry is the label, a string`
  }
  const entries = `${length} ${length === 1 ? 'entry' : 'entries'}`
  return `${expected} of ${STAT_MIN_ENTRIES} to ${STAT_FIELDS.length} entries, got ${entries}`
}

function range({ min, max }: { min?: number; max?: number }): string {
  return max === undefined ? `an integer of at least ${min}` : `an integer from ${min} to ${max}`
}

/** Does the outer type of `value` fit `rule`? */
function fits(rule: Rule, value: JsonValue): boolean {
  switch (rule.kind) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'scalar':
      return value === null || typeof value !== 'object'
    case 'array':
    case 'tuple':
      return Array.isArray(value)
    default:
      return isJsonObject(value)
  }
}

/**
 * The branch of a `oneOf` to check `value` against. An array's first item tells branches
 * of arrays apart, so a later item of another type is reported at that item.
 */
function chooseOption(options: Rule[], value: JsonValue): Rule | undefined {
  const fitting = options.filter((option) => fits(option, value))
  const [first] = Array.isArray(value) ? value : []
  const byItem = fitting.find(
    (option) => option.kind === 'array' && first !== undefined && fits(option.items, first),
  )
  return byItem ?? fitting[0]
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
    const message = statMessage(rule, value) ?? `expected ${describe(rule)}, got ${typeName(value)}`
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
          const shown = typeof value === 'number' ? value : typeName(value)
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
          const itemPointer = joinPointer(pointer, key)
          if (key.length > LIMITS.string) {
            this.length(key, LIMITS.string, itemPointer)
          } else {
            this.check(rule.values, item, itemPointer, required, depth)
          }
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
        const option = chooseOption(rule.options, value)
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
    if (FORMATS.has(name)) {
      const issue = checkFormat(parseFormat(value))
      if (issue !== undefined) this.report('warn', pointer, issue.code, issue.message, issue.hint)
      return
    }
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
    if (!fits(rule, value) || (typeof value === 'number' && !Number.isFinite(value))) {
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
    this.length(value, LIMITS.string, pointer)
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
    const { fields } = SHAPES[name] as Shape
    const unknown = Object.keys(value).filter((key) => !hasOwn(fields, key))
    // A component's list under another's name, as `items` on a `kv` (VD-214).
    const swap = typeof value.type === 'string' ? unknown.find((key) => LISTS.includes(key)) : ''
    let takes: string | undefined
    for (const [field, { rule, presence }] of Object.entries(fields)) {
      if (hasOwn(value, field)) {
        const required = presence === 'required'
        this.check(rule, value[field] as JsonValue, joinPointer(pointer, field), required, depth)
      } else if (presence === 'required') {
        const near = suggest(field, unknown)
        // Only the first missing list field: `swap` stands in for one of them, not for all.
        const swapped = !near && swap && takes === undefined && LISTS.includes(field)
        if (swapped) takes = `${value.type} takes ${quote(field)}, not ${quote(swap)}`
        const hint = near
          ? `did you mean ${quote(field)} instead of ${quote(near)}?`
          : swapped
            ? takes
            : undefined
        const message = `missing required field ${quote(field)}`
        this.report('error', pointer, 'missing-field', message, hint)
      }
    }
    const known = Object.keys(fields)
    for (const key of unknown) {
      const message = `unknown field ${quote(key)} is ignored`
      const hint = didYouMean(key, known) ?? (key === swap ? takes : undefined)
      this.report('info', joinPointer(pointer, key), 'unknown-field', message, hint)
    }
    CROSS_FIELD[name]?.(this.report, value, pointer)
  }
}

type CrossField = (report: Report, value: JsonObject, pointer: string) => void

function checkIndex(
  report: Report,
  index: JsonValue | undefined,
  size: number | undefined,
  pointer: string,
) {
  if (size === undefined) return
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

/** The format a value is checked against, if the document declares a usable one. */
function specOf(format: JsonValue | undefined): FormatSpec | undefined {
  if (typeof format !== 'string') return undefined
  const spec = parseFormat(format)
  return isKnownFormat(spec.name) ? spec : undefined
}

function checkCell(
  report: Report,
  spec: FormatSpec | undefined,
  value: JsonValue | undefined,
  pointer: string,
) {
  // Objects and arrays are reported by the shape rules, or are row options.
  if (spec === undefined || (typeof value === 'object' && value !== null)) return
  const issue = checkValue(spec, value)
  if (issue !== undefined) report('warn', pointer, issue.code, issue.message, issue.hint)
}

function checkCells(
  report: Report,
  specs: (FormatSpec | undefined)[],
  cells: JsonValue[],
  pointer: string,
) {
  specs.forEach((spec, index) => {
    checkCell(report, spec, cells[index], joinPointer(pointer, index))
  })
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
  const specs = columns.map((column) => (isJsonObject(column) ? specOf(column.format) : undefined))
  rows?.forEach((row, index) => {
    if (Array.isArray(row)) {
      const rowPointer = joinPointer(joinPointer(pointer, 'rows'), index)
      checkRow(report, row, columns.length, rowPointer)
      checkCells(report, specs, row, rowPointer)
    }
  })
  const [sortColumn] = asArray(table.sort) ?? []
  const sortPointer = joinPointer(joinPointer(pointer, 'sort'), 0)
  checkIndex(report, sortColumn, columns.length, sortPointer)
  checkIndex(report, table.group, columns.length, joinPointer(pointer, 'group'))
  const totals = asArray(table.totals)
  if (totals) {
    const totalsPointer = joinPointer(pointer, 'totals')
    checkLength(report, totals.length, columns.length, totalsPointer)
    checkCells(report, specs, totals, totalsPointer)
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
  const names = entries.map(([name]) => name)
  if (isJsonObject(chart.tones)) {
    for (const key of Object.keys(chart.tones)) {
      if (names.includes(key)) continue
      const tonePointer = joinPointer(joinPointer(pointer, 'tones'), key)
      const message = `tones names no series ${quote(key)}`
      report('warn', tonePointer, 'bad-ref', message, didYouMean(key, names))
    }
  }
  const x = asArray(chart.x)
  for (const [name, data] of entries) {
    if (!Array.isArray(data) || name.length > LIMITS.string) continue
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
    return
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

/** Usable as a tree source: a list that is empty or holds at least one entry of its kind. */
function hasEntries(source: JsonValue | undefined, isEntry: (entry: JsonValue) => boolean) {
  return Array.isArray(source) && (source.length === 0 || source.some(isEntry))
}

function checkCount(field: string, list: string): CrossField {
  return (report, value, pointer) => {
    checkIndex(report, value[field], asArray(value[list])?.length, joinPointer(pointer, field))
  }
}

const CROSS_FIELD: Record<string, CrossField> = {
  VuiDocument(report, document, pointer) {
    const { generatedAt, locale } = document
    if (typeof generatedAt === 'string' && parseTime(generatedAt) === undefined) {
      const message = `generatedAt ${quote(generatedAt)} is not ISO 8601`
      report('warn', joinPointer(pointer, 'generatedAt'), 'bad-value', message)
    }
    if (typeof locale === 'string' && !isLocale(locale)) {
      const message = `locale ${quote(locale)} is not valid BCP 47`
      report('warn', joinPointer(pointer, 'locale'), 'bad-format-arg', message)
    }
  },
  TableNode: checkTable,
  TabsNode: checkCount('active', 'tabs'),
  DecisionNode: checkCount('pick', 'options'),
  CompareNode(report, compare, pointer) {
    checkCount('pick', 'options')(report, compare, pointer)
    const size = asArray(compare.options)?.length
    if (size === undefined) return
    asArray(compare.criteria)?.forEach((criterion, index) => {
      const values = isJsonObject(criterion) ? asArray(criterion.values) : undefined
      if (values) {
        const criterionPointer = joinPointer(joinPointer(pointer, 'criteria'), index)
        const valuesPointer = joinPointer(criterionPointer, 'values')
        checkLength(report, values.length, size, valuesPointer)
        const spec = specOf((criterion as JsonObject).format)
        values.forEach((value, valueIndex) => {
          checkCell(report, spec, value, joinPointer(valuesPointer, valueIndex))
        })
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
  KvNode(report, kv, pointer) {
    asArray(kv.pairs)?.forEach((pair, index) => {
      const [, value, format] = asArray(pair) ?? []
      const pairPointer = joinPointer(joinPointer(pointer, 'pairs'), index)
      checkCell(report, specOf(format), value, joinPointer(pairPointer, 1))
    })
  },
  StatItem(report, item, pointer) {
    checkCell(report, specOf(item.format), item.value, joinPointer(pointer, 'value'))
    checkCell(report, specOf(item.deltaFormat), item.delta, joinPointer(pointer, 'delta'))
    const spark = asArray(item.spark)
    if (spark) checkPoints(report, spark.length, joinPointer(pointer, 'spark'))
  },
  TreeNode(report, tree, pointer) {
    if (hasEntries(tree.items, isJsonObject)) return
    if (hasEntries(tree.paths, (path) => typeof path === 'string')) return
    report('error', pointer, 'tree-source', 'a tree needs "items" or "paths"')
  },
}

export function walk(document: JsonObject, report: Report): void {
  new Walker(report).document(document)
}
