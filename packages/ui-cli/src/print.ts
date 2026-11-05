import type { Diagnostic, Severity } from '@vadd/ui-spec'

/** §11.3. */
const MAX_LINES = 20
const SEVERITY_WIDTH = 5
const RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
const LEFT_OUT = /^\d+/

const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
const C1 = /[\u007f-\u009f]/g

function escapeCharacter(character: string): string {
  return `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
}

/**
 * For human output. `Diagnostic.path` keeps a key's control characters on purpose (VD-041),
 * and a terminal must not act on anything a document wrote.
 */
export function safe(text: string): string {
  return text.replace(UNSAFE, escapeCharacter)
}

/**
 * `JSON.stringify`, with C1 controls written as escapes: it leaves those raw, and U+009B is a
 * terminal's CSI. The value is unchanged, and any other text stays byte for byte.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(C1, escapeCharacter)
}

function line({ severity, path, message, hint }: Diagnostic): string {
  const suffix = hint === undefined ? '' : ` (${hint})`
  const head = path === '' ? `${severity}:` : `${severity.padEnd(SEVERITY_WIDTH)} ${path}:`
  return safe(`${head} ${message}${suffix}`)
}

/** §11.3: worst first, at most 20 lines, then a count of the rest, and silent on `info`. */
export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  options: { info?: boolean } = {},
): string {
  const shown = diagnostics.filter(({ severity }) => options.info || severity !== 'info')
  const listed = shown.filter(({ code }) => code !== 'too-many-diagnostics')
  const leftOut = shown
    .filter(({ code }) => code === 'too-many-diagnostics')
    .reduce((sum, { message }) => sum + Number(LEFT_OUT.exec(message)?.[0] ?? 0), 0)
  const sorted = [...listed].sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const lines = sorted.slice(0, MAX_LINES).map(line)
  const rest = sorted.length - lines.length + leftOut
  if (rest > 0) lines.push(`and ${rest} more`)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}
