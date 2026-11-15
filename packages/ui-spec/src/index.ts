export { CHART_LABELS } from './chart-labels.js'
export {
  cleanText,
  type DiffEntry,
  diffEntries,
  isIsoTime,
  itemsFromPaths,
  planCounts,
  tailLines,
  treeSource,
} from './dev-view.js'
export {
  clip,
  type Diagnostic,
  type DiagnosticCode,
  isLimitCode,
  LIMIT_CODES,
  type LimitCode,
  SCHEMA_CODES,
  type SchemaCode,
  type Severity,
} from './diagnostics.js'
export { compareBest, compareWinner, usesExt } from './ext.js'
export { type FormatContext, type Formatted, formatValue, isLocale } from './format.js'
export {
  checkFormat,
  checkValue,
  type FormatIssue,
  type FormatSpec,
  parseFormat,
  rawText,
} from './format-spec.js'
export {
  type InlineToken,
  inlineToPlain,
  parseInline,
  STATUS_TONES,
  safeHref,
} from './inline.js'
export { hasOwn, isJsonObject, type JsonObject, type JsonValue, setOwn } from './json.js'
export { LIMITS } from './limits.js'
export { type MdBlock, type MdItem, type MdList, parseMd } from './md-block.js'
export {
  type NormalizeOptions,
  type NormalizeResult,
  normalize,
} from './normalize.js'
export { MAX_NESTING, type ParseError, type ParseResult, parse } from './parser.js'
export type { PathMap } from './path-map.js'
export { escapeSegment, joinPointer } from './pointer.js'
export {
  alignOf,
  type Badge,
  badgeOf,
  groupKey,
  type ParsedRow,
  parseRow,
  sortRows,
} from './table-view.js'
export type * from './types.js'
export {
  COMPONENT_TYPES,
  DENSITIES,
  FILE_EXTENSION,
  FORMAT_NAMES,
  MEDIA_TYPE,
  STATUSES,
  TONES,
} from './types.js'

export {
  type Inspection,
  inspect,
  type LocatedIssue,
  MAX_ISSUES,
  type ValidationResult,
  validate,
  validateText,
} from './validate.js'

export const packageName = '@vadd/ui-spec' as const
