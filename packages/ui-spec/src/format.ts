import { clip, quote } from './diagnostics.js'
import {
  checkFormat,
  checkValue,
  type FormatIssue,
  type FormatSpec,
  isKnownFormat,
  parseFormat,
  parseLink,
  parseTime,
  rawText,
  withoutBadArg,
} from './format-spec.js'
import { type InlineToken, inlineToPlain, parseInline, STATUS_TONES } from './inline.js'
import type { JsonValue } from './json.js'
import type { Status, Tone } from './types.js'

// §7. Pure, and total: a document can never make these throw, and they never read a clock.

export interface FormatContext {
  /** BCP 47, default `en-US`. */
  locale?: string
  /** The document's `generatedAt`, the reference for `rel` (§5.2). */
  now?: string | number
}

/** One display value. Everything except `text` is present only when it applies. */
export interface Formatted {
  /** The plain display string, identical in every renderer. */
  text: string
  tone?: Tone
  /** The parsed form of `text`, for format `text`. */
  inline?: InlineToken[]
  status?: Status
  mono?: boolean
  /** The full value, when `text` is truncated. */
  title?: string
  /** The emphasized end of a `path`. Always a suffix of `text`. */
  base?: string
  href?: string
  /** For a caller to report as `warn`, adding the JSON Pointer (§13.3). */
  issues?: FormatIssue[]
}

const DEFAULT_LOCALE = 'en-US'
const EM_DASH = '—'
const MINUS = '−'
const MAX_MONO = 60
const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
const SI_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte']
const MAX_CACHED = 256

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
  ['second', SECOND],
]

const DAY_FIELDS = { year: 'numeric', month: 'short', day: 'numeric' } as const
const TIME_FIELDS = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const
const DATE_STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: DAY_FIELDS,
  long: { ...DAY_FIELDS, month: 'long' },
  time: TIME_FIELDS,
  datetime: { ...DAY_FIELDS, ...TIME_FIELDS },
}

// Building an Intl object costs far more than using one, and a table formats every cell.
const cache = new Map<string, unknown>()

function cached<T>(key: string, make: () => T): T {
  if (cache.has(key)) return cache.get(key) as T
  if (cache.size >= MAX_CACHED) cache.clear()
  const value = make()
  cache.set(key, value)
  return value
}

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(`n${locale}${JSON.stringify(options)}`, () => {
    // ES2023 `'always'` (VD-043). `lib` is ES2020, which types this as a boolean.
    const grouping = { useGrouping: 'always' as unknown as boolean }
    return new Intl.NumberFormat(locale, { ...grouping, ...options })
  })
}

function fixed(decimals: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
}

function unitFormat(
  locale: string,
  unit: string,
  display: 'short' | 'narrow',
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return numberFormat(locale, { style: 'unit', unit, unitDisplay: display, ...options })
}

/** A number, a space, and the narrow unit symbol: Intl gives `1.24s`, §7 wants `1.24 s`. */
function spaced(locale: string, value: number, unit: string, decimals: number): string {
  return unitFormat(locale, unit, 'narrow', fixed(decimals))
    .formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => (part.type === 'unit' ? ` ${part.value.trim()}` : part.value))
    .join('')
}

/** Two narrow Intl units, the second padded: `2m 05s`, `1h 02m` (VD-044). */
function pair(locale: string, sign: number, high: number, low: number, units: [string, string]) {
  const first = unitFormat(locale, units[0], 'narrow', {}).format(sign * high)
  const second = unitFormat(locale, units[1], 'narrow', { minimumIntegerDigits: 2 }).format(low)
  return `${first} ${second}`
}

function clock(locale: string, seconds: number): string {
  const sign = seconds < 0 ? -1 : 1
  const whole = Math.round(Math.abs(seconds))
  if (whole < 3_600) {
    return pair(locale, sign, Math.floor(whole / 60), whole % 60, ['minute', 'second'])
  }
  const minutes = Math.round(Math.abs(seconds) / 60)
  return pair(locale, sign, Math.floor(minutes / 60), minutes % 60, ['hour', 'minute'])
}

function formatMs(locale: string, value: number): string {
  const rounded = Math.round(value) + 0
  if (Math.abs(rounded) < SECOND) {
    return unitFormat(locale, 'millisecond', 'short', fixed(0)).format(rounded)
  }
  const seconds = Math.round(value / 10) / 100
  if (Math.abs(seconds) < 60) return spaced(locale, seconds, 'second', 2)
  return clock(locale, value / SECOND)
}

function formatDur(locale: string, value: number): string {
  const rounded = Math.round(value) + 0
  if (Math.abs(rounded) < 60) return spaced(locale, rounded, 'second', 0)
  return clock(locale, value)
}

function formatBytes(locale: string, value: number, arg: string | undefined): string {
  const step = arg === 'si' ? 1_000 : 1_024
  const last = IEC_UNITS.length - 1
  const magnitude = Math.abs(value)
  let exponent = 0
  let scaled = magnitude
  const rounds = (amount: number, at: number) => {
    const factor = at === 0 ? 1 : 10
    return Math.round(amount * factor) / factor
  }
  while (exponent < last && rounds(scaled, exponent) >= step) {
    scaled /= step
    exponent++
  }
  const signed = (value < 0 ? -scaled : scaled) + 0
  const decimals = exponent === 0 ? 0 : 1
  if (arg === 'si') return spaced(locale, signed, SI_UNITS[exponent] as string, decimals)
  return `${numberFormat(locale, fixed(decimals)).format(signed)} ${IEC_UNITS[exponent]}`
}

function decimalsOf(arg: string | undefined, fallback: number): number {
  return arg === undefined ? fallback : Number(arg)
}

function percent(locale: string, ratio: number, arg: string | undefined): string {
  return numberFormat(locale, { style: 'percent', ...fixed(decimalsOf(arg, 1)) }).format(ratio)
}

function formatNumeric(locale: string, spec: FormatSpec, value: number): string {
  const { name, arg } = spec
  switch (name) {
    case 'int':
      return numberFormat(locale, fixed(0)).format(value)
    case 'compact':
      return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    case 'pct':
      return percent(locale, value, arg)
    case 'pct100':
      return percent(locale, value / 100, arg)
    case 'ms':
      return formatMs(locale, value)
    case 'dur':
      return formatDur(locale, value)
    case 'bytes':
      return formatBytes(locale, value, arg)
    case 'money':
      return numberFormat(locale, {
        style: 'currency',
        currency: (arg as string).toUpperCase(),
      }).format(value)
    default:
      return numberFormat(
        locale,
        arg === undefined ? { maximumFractionDigits: 2 } : fixed(Number(arg)),
      ).format(value)
  }
}

function formatDelta(locale: string, spec: FormatSpec, value: number): Formatted {
  const base = spec.base as FormatSpec
  const zero = formatNumeric(locale, base, 0)
  const magnitude = formatNumeric(locale, base, Math.abs(value))
  if (magnitude === zero) return { text: zero, tone: 'muted' }
  const good = value > 0 === (spec.better !== 'low')
  return { text: `${value > 0 ? '+' : MINUS}${magnitude}`, tone: good ? 'ok' : 'err' }
}

function formatDate(locale: string, time: number, style = 'short'): string {
  const format = cached(
    `d${locale}${style}`,
    () => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...DATE_STYLES[style] }),
  )
  return format.format(new Date(time))
}

function formatRel(locale: string, time: number, now: number): string {
  const difference = time - now
  const distance = Math.abs(difference)
  const entry = REL_UNITS.find(([, size]) => distance >= size)
  const numeric = entry === undefined ? 'auto' : 'always'
  const format = cached(
    `r${locale}${numeric}`,
    () => new Intl.RelativeTimeFormat(locale, { style: 'short', numeric }),
  )
  if (entry === undefined) return format.format(0, 'second')
  const [unit, size] = entry
  const text = format.format(Math.trunc(difference / size), unit)
  return /^en\b/i.test(locale) ? text.replace(/\.(?= |$)/g, '') : text
}

/** Keeps the end of a path and cuts the middle (§7): the basename survives if it can. */
function truncatePath(value: string): Formatted {
  const base = (/[^\\/]*[\\/]*$/.exec(value) as RegExpExecArray)[0]
  const characters = Array.from(value)
  if (characters.length <= MAX_MONO) return { text: value, mono: true, base }
  const baseLength = Array.from(base).length
  const tail = baseLength + 2 <= MAX_MONO ? baseLength + 1 : MAX_MONO / 2
  const head = MAX_MONO - tail - 1
  const end = characters.slice(-tail).join('')
  const kept = baseLength + 2 <= MAX_MONO ? base : end
  return {
    text: `${characters.slice(0, head).join('')}…${end}`,
    mono: true,
    base: kept,
    title: value,
  }
}

function formatStringValue(spec: FormatSpec, value: string): Formatted {
  switch (spec.name) {
    case 'code': {
      const text = clip(value, MAX_MONO)
      return text === value ? { text, mono: true } : { text, mono: true, title: value }
    }
    case 'path':
      return truncatePath(value)
    case 'sha':
      return { text: value.slice(0, decimalsOf(spec.arg, 7)), mono: true }
    default:
      return parseLink(value) as Formatted
  }
}

function formatChecked(
  locale: string,
  spec: FormatSpec,
  value: JsonValue,
  now: number | undefined,
  issues: FormatIssue[],
): Formatted {
  switch (spec.name) {
    case 'text': {
      const inline = parseInline(String(value))
      return { text: inlineToPlain(inline), inline }
    }
    case 'delta':
      return formatDelta(locale, spec, value as number)
    case 'date':
      return { text: formatDate(locale, parseTime(value) as number, spec.arg) }
    case 'rel': {
      const time = parseTime(value) as number
      if (now !== undefined) return { text: formatRel(locale, time, now) }
      issues.push({
        code: 'bad-value',
        message: 'format rel needs a reference time',
        hint: 'set generatedAt to an ISO 8601 date',
      })
      return { text: formatDate(locale, time, 'datetime') }
    }
    case 'status':
      return {
        text: value as Status,
        status: value as Status,
        tone: STATUS_TONES[value as Status],
      }
    case 'code':
    case 'path':
    case 'sha':
    case 'link':
      return formatStringValue(spec, value as string)
    default:
      return { text: formatNumeric(locale, spec, value as number) }
  }
}

/** The locale to use, or undefined when it is malformed. No data for it means `en-US`. */
function supportedLocale(locale: string): string | undefined {
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale).length > 0 ? locale : DEFAULT_LOCALE
  } catch {
    return undefined
  }
}

/** False for a string that is not BCP 47, which `formatValue` replaces with `en-US`. */
export function isLocale(locale: string): boolean {
  return supportedLocale(locale) !== undefined
}

/** A usable locale, never the machine's, which would differ between renderers (§7). */
function resolveLocale(locale: string | undefined, issues: FormatIssue[]): string {
  if (locale === undefined) return DEFAULT_LOCALE
  const resolved = cached(`l${locale}`, () => supportedLocale(locale))
  if (resolved !== undefined) return resolved
  issues.push({ code: 'bad-format-arg', message: `locale ${quote(locale)} is not valid BCP 47` })
  return DEFAULT_LOCALE
}

function done(result: Formatted, issues: FormatIssue[]): Formatted {
  if (issues.length > 0) result.issues = issues
  return result
}

/**
 * Formats one value (§7). Total: `null` and a missing cell give a muted em dash, a value of
 * the wrong type gives its raw text, and every problem comes back in `issues`.
 */
export function formatValue(
  value: JsonValue | undefined,
  format: string | undefined,
  context: FormatContext = {},
): Formatted {
  if (value === null || value === undefined) return { text: EM_DASH, tone: 'muted' }
  const issues: FormatIssue[] = []
  const raw = rawText(value)
  try {
    const locale = resolveLocale(context.locale, issues)
    const parsed = parseFormat(format)
    if (!isKnownFormat(parsed.name)) {
      const message = `unknown format ${quote(parsed.name)}`
      issues.push({ code: 'unknown-format', message })
      return done({ text: raw }, issues)
    }
    const argProblem = checkFormat(parsed)
    if (argProblem !== undefined) issues.push(argProblem)
    const spec = argProblem === undefined ? parsed : withoutBadArg(parsed)
    const valueProblem = checkValue(spec, value)
    if (valueProblem !== undefined) {
      issues.push(valueProblem)
      return done({ text: raw }, issues)
    }
    return done(formatChecked(locale, spec, value, parseTime(context.now), issues), issues)
  } catch {
    issues.push({ code: 'bad-format-arg', message: 'the format failed on this value' })
    return done({ text: raw }, issues)
  }
}
