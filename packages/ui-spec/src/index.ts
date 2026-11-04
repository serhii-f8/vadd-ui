export {
  type Diagnostic,
  type DiagnosticCode,
  isLimitCode,
  LIMIT_CODES,
  type LimitCode,
  SCHEMA_CODES,
  type SchemaCode,
  type Severity,
} from './diagnostics.js'
export { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
export { LIMITS } from './limits.js'
export {
  type NormalizeOptions,
  type NormalizeResult,
  normalize,
} from './normalize.js'
export { MAX_NESTING, type ParseError, type ParseResult, parse } from './parser.js'
export type { PathMap } from './path-map.js'
export { escapeSegment, joinPointer } from './pointer.js'
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

export { type ValidationResult, validate, validateText } from './validate.js'

export const packageName = '@vadd/ui-spec' as const
