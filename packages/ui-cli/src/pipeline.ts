import { version } from '@vadd/ui'
import {
  type Diagnostic,
  isJsonObject,
  isLimitCode,
  type JsonValue,
  LIMITS,
  type VuiDocument,
  validateText,
} from '@vadd/ui-spec'
import { GENERATOR } from '@vadd/ui-viewer'
import { EXIT, type ExitCode } from './outcome.js'

/** What a command adds. A `meta` key set to `undefined` removes a document's claim. */
export interface Overrides {
  title?: string
  meta?: Record<string, string | undefined>
}

export interface Prepared {
  diagnostics: Diagnostic[]
  /** The canonical form, stamped. Absent on any error, since nothing may be delivered. */
  document?: VuiDocument
}

/** §13.3: a `warn` does not block, unless `--strict`. A limit needs fixing first of all. */
export function exitCodeOf(diagnostics: readonly Diagnostic[], strict = false): ExitCode {
  const errors = diagnostics.filter(({ severity }) => severity === 'error')
  if (errors.some(({ code }) => isLimitCode(code))) return EXIT.limit
  if (errors.some(({ code }) => code === 'parse-error')) return EXIT.parse
  if (errors.length > 0) return EXIT.invalid
  if (strict && diagnostics.some(({ severity }) => severity === 'warn')) return EXIT.invalid
  return EXIT.ok
}

/** §17.2: these record what the CLI inlined, so they replace what a document claims. */
export function stamped(document: VuiDocument, overrides: Overrides): VuiDocument {
  // A mistyped `meta` is only a `warn` (§13.3), and a string must not spread into characters.
  const meta = isJsonObject(document.meta as JsonValue | undefined) ? document.meta : {}
  const merged = { ...meta, ...overrides.meta, generator: GENERATOR, version }
  const title = overrides.title === undefined ? {} : { title: overrides.title }
  // Through JSON, so a removed key is gone and not an `undefined` in a document.
  return JSON.parse(JSON.stringify({ ...document, ...title, meta: merged })) as VuiDocument
}

export function inputTooLarge(): Diagnostic {
  return {
    severity: 'error',
    path: '',
    code: 'limit-input-size',
    message: `input is over the limit of ${LIMITS.inputBytes} bytes`,
  }
}

/**
 * Text to a stamped canonical document, or the reasons why not. `validate` and `render` both
 * run this, so one cannot pass what the other refuses. Measures after the stamp, or a file
 * could hold what `vui validate` later refuses to read back.
 */
export function prepare(text: string, now: Date, overrides: Overrides = {}): Prepared {
  const { diagnostics, document } = validateText(text, { generatedAt: now.toISOString() })
  if (document === undefined || exitCodeOf(diagnostics) !== EXIT.ok) return { diagnostics }
  const { title = '' } = overrides
  if (title.length > LIMITS.string) {
    const message = `--title has ${title.length} chars; the limit is ${LIMITS.string}`
    const tooLong = { severity: 'error', path: '/title', code: 'limit-string', message } as const
    return { diagnostics: [...diagnostics, tooLong] }
  }
  const canonical = stamped(document, overrides)
  const bytes = Buffer.byteLength(JSON.stringify(canonical))
  if (bytes <= LIMITS.inputBytes) return { diagnostics, document: canonical }
  const message = `canonical form is ${bytes} bytes; the limit is ${LIMITS.inputBytes}`
  const code = 'limit-canonical-size'
  return { diagnostics: [...diagnostics, { severity: 'error', path: '', code, message }] }
}
