import {
  type Diagnostic,
  type DiagnosticCode,
  DiagnosticLog,
  makeDiagnostic,
  type Severity,
} from './diagnostics.js'
import type { JsonObject, JsonValue } from './json.js'
import { LIMITS } from './limits.js'
import { type NormalizeOptions, normalize } from './normalize.js'
import { parse } from './parser.js'
import type { VuiDocument } from './types.js'
import { walk } from './walker.js'

export interface ValidationResult {
  /** No `error`. Warnings and info do not block delivery (§13.3). */
  ok: boolean
  diagnostics: Diagnostic[]
  /** The canonical form, present unless the input could not be read. */
  document?: VuiDocument
}

function hasNoError(diagnostics: Diagnostic[]): boolean {
  return diagnostics.every((diagnostic) => diagnostic.severity !== 'error')
}

function refuse(code: DiagnosticCode, message: string): ValidationResult {
  return { ok: false, diagnostics: [makeDiagnostic('error', '', code, message)] }
}

/** UTF-8 length. A lone surrogate counts 3 bytes, what an encoder writes in its place. */
function utf8Length(text: string): number {
  let bytes = 0
  for (const character of text) {
    const code = character.codePointAt(0) as number
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}

/**
 * Normalizes and checks a parsed document. Total: anything it cannot read becomes a
 * diagnostic. Size limits need the text, so they live in `validateText` (VD-032).
 */
export function validate(input: JsonValue, options?: NormalizeOptions): ValidationResult {
  const { document, paths, dropped } = normalize(input, options)
  const log = new DiagnosticLog()
  const report = (
    severity: Severity,
    pointer: string,
    code: DiagnosticCode,
    message: string,
    hint?: string,
  ) => {
    if (!log.wants(severity, code)) return
    log.add(makeDiagnostic(severity, paths.toInput(pointer), code, message, hint))
  }
  walk(document as unknown as JsonObject, report)
  for (const path of dropped) {
    const message = 'object-row key matches no column, so its value is dropped'
    if (log.wants('warn', 'dropped-cell')) {
      log.add(makeDiagnostic('warn', path, 'dropped-cell', message))
    }
  }
  const diagnostics = log.finish()
  return { ok: hasNoError(diagnostics), diagnostics, document }
}

/** The CLI's entry point: the whole of §13 from text to verdict. */
export function validateText(text: string, options?: NormalizeOptions): ValidationResult {
  const bytes = utf8Length(text)
  if (bytes > LIMITS.inputBytes) {
    const message = `input is ${bytes} bytes; the limit is ${LIMITS.inputBytes}`
    return refuse('limit-input-size', message)
  }
  const parsed = parse(text)
  if (!parsed.ok) {
    const { code, message, line, column } = parsed.error
    const located = `line ${line}, column ${column}: ${message}`
    return refuse(code === 'too-deep' ? 'limit-depth' : 'parse-error', located)
  }
  const result = validate(parsed.value, options)
  const canonicalBytes = utf8Length(JSON.stringify(result.document))
  if (canonicalBytes <= LIMITS.inputBytes) return result
  const message = `canonical form is ${canonicalBytes} bytes; the limit is ${LIMITS.inputBytes}`
  result.diagnostics.push(makeDiagnostic('error', '', 'limit-canonical-size', message))
  return { ...result, ok: false }
}
