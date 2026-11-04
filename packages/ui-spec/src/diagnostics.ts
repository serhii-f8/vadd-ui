/** §13.2. */
export type Severity = 'error' | 'warn' | 'info'

export const LIMIT_CODES = [
  'limit-input-size',
  'limit-canonical-size',
  'limit-depth',
  'limit-nodes',
  'limit-table-rows',
  'limit-table-columns',
  'limit-chart-points',
  'limit-chart-series',
  'limit-string',
  'limit-flow-nodes',
] as const
export type LimitCode = (typeof LIMIT_CODES)[number]

/** The schema rejects a document exactly when one of these is reported (VD-030). */
export const SCHEMA_CODES = [
  'unknown-type',
  'missing-field',
  'bad-type',
  'bad-enum',
  'bad-range',
  'bad-version',
] as const
export type SchemaCode = (typeof SCHEMA_CODES)[number]

export type DiagnosticCode =
  | LimitCode
  | SchemaCode
  | 'parse-error'
  | 'row-arity'
  | 'bad-cell'
  | 'tree-source'
  | 'bad-index'
  | 'length-mismatch'
  | 'bad-ref'
  | 'unknown-format'
  | 'dropped-cell'
  | 'unknown-field'

export interface Diagnostic {
  severity: Severity
  /** JSON Pointer into the input as written (VD-036). */
  path: string
  code: DiagnosticCode
  /** One sentence, at most 120 chars. */
  message: string
  /** A suggested fix. */
  hint?: string
}

export const MAX_MESSAGE = 120
const MAX_QUOTED = 30

const LIMITS_SET: ReadonlySet<string> = new Set(LIMIT_CODES)

/** True for a §13.4 limit, which the CLI maps to exit 3 (§11.4). */
export function isLimitCode(code: string): boolean {
  return LIMITS_SET.has(code)
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Quotes a value from the document, short enough to fit in a message. */
export function quote(value: string): string {
  return `"${clip(value, MAX_QUOTED)}"`
}

export function makeDiagnostic(
  severity: Severity,
  path: string,
  code: DiagnosticCode,
  message: string,
  hint?: string,
): Diagnostic {
  const diagnostic: Diagnostic = { severity, path, code, message: clip(message, MAX_MESSAGE) }
  if (hint !== undefined) diagnostic.hint = hint
  return diagnostic
}
