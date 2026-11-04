import { quote } from './diagnostics.js'
import { inlineToPlain, parseInline, safeHref } from './inline.js'
import { hasOwn, type JsonValue } from './json.js'
import { FORMAT_NAMES, STATUSES } from './types.js'

// §7 without Intl: what a format string means and whether a value fits it. The walker and
// `formatValue` share these checks, so the CLI warns exactly where the renderer falls back.

export interface FormatSpec {
  name: string
  arg?: string
  /** `delta` only (VD-042). */
  base?: FormatSpec
  better?: 'low' | 'high'
}

export interface FormatIssue {
  code: 'bad-value' | 'bad-format-arg' | 'unknown-format'
  message: string
  hint?: string
}

const KNOWN: ReadonlySet<string> = new Set(FORMAT_NAMES)
const BETTER = /(?:^|:)better:(low|high)$/
const DELTA_BASES = ['num', 'int', 'compact', 'pct', 'pct100', 'ms', 'dur', 'bytes', 'money']
const NUMERIC: ReadonlySet<string> = new Set([...DELTA_BASES, 'delta'])
const MAX_DECIMALS = 20
const MAX_SHA = 64

const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/

export function isKnownFormat(name: string): boolean {
  return KNOWN.has(name)
}

export function parseFormat(format = 'text'): FormatSpec {
  const colon = format.indexOf(':')
  const name = colon === -1 ? format : format.slice(0, colon)
  const arg = colon === -1 ? undefined : format.slice(colon + 1)
  if (name !== 'delta') return arg === undefined ? { name } : { name, arg }
  const match = arg === undefined ? null : BETTER.exec(arg)
  const rest = match === null ? arg : (arg as string).slice(0, match.index)
  const spec: FormatSpec = { name, base: parseFormat(rest || 'num') }
  if (match !== null) spec.better = match[1] as 'low' | 'high'
  return spec
}

function isDecimals(arg: string): boolean {
  return /^\d{1,2}$/.test(arg) && Number(arg) <= MAX_DECIMALS
}

function isShaLength(arg: string): boolean {
  return /^\d{1,2}$/.test(arg) && Number(arg) >= 1 && Number(arg) <= MAX_SHA
}

/** What each format takes after the colon, for those that take anything. */
const ARGS: Record<string, { label: string; accepts(arg: string): boolean; required?: true }> = {
  num: { label: `decimals from 0 to ${MAX_DECIMALS}`, accepts: isDecimals },
  pct: { label: `decimals from 0 to ${MAX_DECIMALS}`, accepts: isDecimals },
  pct100: { label: `decimals from 0 to ${MAX_DECIMALS}`, accepts: isDecimals },
  bytes: { label: 'si or iec', accepts: (arg) => arg === 'si' || arg === 'iec' },
  money: {
    label: 'an ISO 4217 code',
    accepts: (arg) => /^[A-Za-z]{3}$/.test(arg),
    required: true,
  },
  date: {
    label: 'short, long, time or datetime',
    accepts: (arg) => ['short', 'long', 'time', 'datetime'].includes(arg),
  },
  sha: { label: `a length from 1 to ${MAX_SHA}`, accepts: isShaLength },
}

function argIssue(message: string, hint?: string): FormatIssue {
  const issue: FormatIssue = { code: 'bad-format-arg', message }
  if (hint !== undefined) issue.hint = hint
  return issue
}

/** A problem with the format string itself. An unknown name is the caller's to report. */
export function checkFormat(spec: FormatSpec): FormatIssue | undefined {
  const { name, arg, base } = spec
  if (base !== undefined) {
    if (!DELTA_BASES.includes(base.name)) {
      const hint = `use one of ${DELTA_BASES.join('|')}`
      return argIssue(`${quote(base.name)} cannot be the base of delta`, hint)
    }
    return checkFormat(base)
  }
  if (!isKnownFormat(name)) return undefined
  const rule = hasOwn(ARGS, name) ? ARGS[name] : undefined
  if (rule === undefined) {
    return arg === undefined ? undefined : argIssue(`format ${name} takes no argument`)
  }
  if (arg === undefined) {
    return rule.required ? argIssue(`format ${name} needs ${rule.label}`) : undefined
  }
  return rule.accepts(arg) ? undefined : argIssue(`format ${name} takes ${rule.label}`)
}

/** The same format with a bad argument dropped: the §7 default, or `num` for `money`. */
export function withoutBadArg(spec: FormatSpec): FormatSpec {
  if (spec.base !== undefined) return { ...spec, base: withoutBadArg(sanitizeBase(spec.base)) }
  return spec.name === 'money' ? { name: 'num' } : { name: spec.name }
}

function sanitizeBase(base: FormatSpec): FormatSpec {
  return DELTA_BASES.includes(base.name) ? base : { name: 'num' }
}

/** Epoch ms for an ISO 8601 string, in UTC unless it has an offset (VD-047). */
function parseIso(text: string): number | undefined {
  const match = ISO_8601.exec(text)
  if (match === null) return undefined
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((field) => Number(field ?? 0))
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3))
  const date = new Date(
    Date.UTC(year as number, (month as number) - 1, day, hour, minute, second, milliseconds),
  )
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month as number) - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  if (!roundTrips) return undefined
  const zone = match[8]
  if (zone === undefined || zone === 'Z') return date.getTime()
  const digits = zone.slice(1).replace(':', '')
  const offset = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))
  return date.getTime() - (zone[0] === '-' ? -offset : offset) * 60_000
}

/** Epoch ms for an ISO 8601 string or a number that fits a `Date`, otherwise undefined. */
export function parseTime(value: unknown): number | undefined {
  if (typeof value === 'string') return parseIso(value)
  if (typeof value !== 'number') return undefined
  return Number.isNaN(new Date(value).getTime()) ? undefined : value
}

export interface LinkTarget {
  text: string
  href: string
}

/** A `link` cell: a bare URL, or exactly one `[label](url)`. */
export function parseLink(value: string): LinkTarget | undefined {
  const tokens = parseInline(value)
  const [first] = tokens
  if (tokens.length === 1 && first?.type === 'link') {
    return { text: inlineToPlain(first.children), href: first.href }
  }
  const href = safeHref(value)
  return href === undefined ? undefined : { text: value, href }
}

export function rawText(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function fits(name: string, value: JsonValue): boolean {
  if (NUMERIC.has(name)) return typeof value === 'number' && Number.isFinite(value)
  switch (name) {
    case 'text':
      return value === null || typeof value !== 'object'
    case 'date':
    case 'rel':
      return parseTime(value) !== undefined
    case 'status':
      return (STATUSES as readonly JsonValue[]).includes(value)
    case 'link':
      return typeof value === 'string' && parseLink(value) !== undefined
    default:
      return typeof value === 'string' || !isKnownFormat(name)
  }
}

const EXPECTED: Record<string, string> = {
  date: 'an ISO 8601 date or epoch ms',
  rel: 'an ISO 8601 date or epoch ms',
  status: 'a status',
  link: 'an http, https or mailto URL',
  text: 'a scalar',
}

/** A problem with a value under a format. `null` and a missing cell are fine (§7). */
export function checkValue(
  spec: FormatSpec,
  value: JsonValue | undefined,
): FormatIssue | undefined {
  if (value === null || value === undefined || fits(spec.name, value)) return undefined
  const expected =
    (hasOwn(EXPECTED, spec.name) ? EXPECTED[spec.name] : undefined) ??
    (NUMERIC.has(spec.name) ? 'a number' : 'a string')
  return {
    code: 'bad-value',
    message: `format ${spec.name} expects ${expected}, got ${quote(rawText(value))}`,
  }
}
