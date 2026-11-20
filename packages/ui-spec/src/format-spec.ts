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
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/

export function isKnownFormat(name: string): boolean {
  return KNOWN.has(name)
}

export function isNumericFormat(name: string): boolean {
  return NUMERIC.has(name)
}

function splitFormat(format: string): FormatSpec {
  const colon = format.indexOf(':')
  if (colon === -1) return { name: format }
  return { name: format.slice(0, colon), arg: format.slice(colon + 1) }
}

export function parseFormat(format = 'text'): FormatSpec {
  const spec = splitFormat(format)
  if (spec.name !== 'delta') return spec
  const arg = spec.arg ?? ''
  const match = BETTER.exec(arg)
  // One level only: `delta` is never a legal base, and a format string can be 20,000 chars.
  const parsed: FormatSpec = {
    name: 'delta',
    base: splitFormat((match === null ? arg : arg.slice(0, match.index)) || 'num'),
  }
  if (match !== null) parsed.better = match[1] as 'low' | 'high'
  return parsed
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

/**
 * The format of a stat's `delta`: `deltaFormat`, or `delta`, with `better: 'low'` turned into
 * the `delta` format's own `better:low` (VD-220). A format that says `better` itself wins.
 */
export function statDeltaFormat(item: { deltaFormat?: unknown; better?: unknown }): string {
  const format = typeof item.deltaFormat === 'string' ? item.deltaFormat : 'delta'
  if (item.better !== 'low' || parseFormat(format).name !== 'delta' || BETTER.test(format)) {
    return format
  }
  return `${format}:better:low`
}

/** The same format with a bad argument dropped: the §7 default, or `num` for `money`. */
export function withoutBadArg(spec: FormatSpec): FormatSpec {
  if (spec.base !== undefined) {
    const base = DELTA_BASES.includes(spec.base.name) ? withoutBadArg(spec.base) : { name: 'num' }
    return { ...spec, base }
  }
  return spec.name === 'money' ? { name: 'num' } : { name: spec.name }
}

/** Minutes east of UTC, or undefined outside the range of real offsets. */
function offsetMinutes(zone: string): number | undefined {
  const digits = zone.slice(1).replace(':', '')
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2) || 0)
  const total = hours * 60 + minutes
  if (minutes > 59 || total > 14 * 60) return undefined
  return zone[0] === '-' ? -total : total
}

/** Epoch ms for an ISO 8601 string, in UTC unless it has an offset (VD-047). */
function parseIso(text: string): number | undefined {
  const match = ISO_8601.exec(text)
  if (match === null) return undefined
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((field) => Number(field ?? 0)) as [number, number, number, number, number, number]
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3))
  // Not `Date.UTC`, which reads years 0 to 99 as 19xx.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, milliseconds)
  const roundTrips =
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  if (!roundTrips) return undefined
  const zone = match[8]
  if (zone === undefined || zone === 'Z') return date.getTime()
  const offset = offsetMinutes(zone)
  return offset === undefined ? undefined : date.getTime() - offset * 60_000
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

/** Total, including for what only a non-JSON caller can pass. */
export function rawText(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value
  try {
    return (typeof value === 'object' && value !== null && JSON.stringify(value)) || String(value)
  } catch {
    return '[unprintable]'
  }
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
