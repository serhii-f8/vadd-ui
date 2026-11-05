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
import { EXIT, type ExitCode } from './outcome.js'

export const GENERATOR = 'vadd-ui'

/** The text of the generator `<meta>` (§10.1). */
export const GENERATOR_LABEL = `${GENERATOR} ${version}`

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
function stamped(document: VuiDocument): VuiDocument {
  // A mistyped `meta` is only a `warn` (§13.3), and a string must not spread into characters.
  const meta = isJsonObject(document.meta as JsonValue | undefined) ? document.meta : {}
  return { ...document, meta: { ...meta, generator: GENERATOR, version } }
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
export function prepare(text: string, now: Date): Prepared {
  const { diagnostics, document } = validateText(text, { generatedAt: now.toISOString() })
  if (document === undefined || exitCodeOf(diagnostics) !== EXIT.ok) return { diagnostics }
  const canonical = stamped(document)
  const bytes = Buffer.byteLength(JSON.stringify(canonical))
  if (bytes <= LIMITS.inputBytes) return { diagnostics, document: canonical }
  const message = `canonical form is ${bytes} bytes; the limit is ${LIMITS.inputBytes}`
  const code = 'limit-canonical-size'
  return { diagnostics: [...diagnostics, { severity: 'error', path: '', code, message }] }
}
