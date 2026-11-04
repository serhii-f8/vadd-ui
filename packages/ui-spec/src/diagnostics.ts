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
  | 'too-many-diagnostics'

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

/** The CLI prints 20. This bounds memory on a document made of mistakes (VD-039). */
export const MAX_DIAGNOSTICS = 1_000

// Control characters and line separators, which `JSON.stringify` leaves partly in place.
const UNSAFE = /[\p{Cc}\p{Zl}\p{Zp}]/gu

const RANK: Record<Severity, number> = { info: 0, warn: 1, error: 2 }

const LIMITS_SET: ReadonlySet<string> = new Set(LIMIT_CODES)

/** True for a §13.4 limit, which the CLI maps to exit 3 (§11.4). */
export function isLimitCode(code: string): boolean {
  return LIMITS_SET.has(code)
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const end = isHighSurrogate(text.charCodeAt(max - 2)) ? max - 2 : max - 1
  return `${text.slice(0, end)}…`
}

function escapeUnsafe(character: string): string {
  return `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
}

/**
 * Quotes a value from the document for a message: short, and escaped, so a document cannot
 * add a line to the output or send a terminal a control sequence.
 */
export function quote(value: string): string {
  return JSON.stringify(clip(value, MAX_QUOTED)).replace(UNSAFE, escapeUnsafe)
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

/** Collects up to `MAX_DIAGNOSTICS`, plus the first of each limit, which sets the exit code. */
export class DiagnosticLog {
  readonly diagnostics: Diagnostic[] = []
  private readonly limits = new Set<string>()
  private omitted = 0
  private worst: Severity = 'info'

  /** False once the log is full. The caller can then skip building the diagnostic. */
  wants(severity: Severity, code: DiagnosticCode): boolean {
    const firstLimit = isLimitCode(code) && !this.limits.has(code)
    if (firstLimit) this.limits.add(code)
    if (firstLimit || this.diagnostics.length < MAX_DIAGNOSTICS) return true
    this.omitted++
    if (RANK[severity] > RANK[this.worst]) this.worst = severity
    return false
  }

  /** Skips a repeat of the last entry, as when one string fills two fields. */
  add(diagnostic: Diagnostic): void {
    const last = this.diagnostics[this.diagnostics.length - 1]
    if (
      last?.code === diagnostic.code &&
      last.path === diagnostic.path &&
      last.message === diagnostic.message
    ) {
      return
    }
    this.diagnostics.push(diagnostic)
  }

  /** Ends the log, with a count of what it left out. */
  finish(): Diagnostic[] {
    if (this.omitted > 0) {
      const message = `${this.omitted} more diagnostics were left out`
      this.add(makeDiagnostic(this.worst, '', 'too-many-diagnostics', message))
    }
    return this.diagnostics
  }
}
