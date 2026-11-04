export { hasOwn, isJsonObject, type JsonObject, type JsonValue } from './json.js'
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
  MEDIA_TYPE,
  STATUSES,
  TONES,
} from './types.js'

export const packageName = '@vadd/ui-spec' as const
