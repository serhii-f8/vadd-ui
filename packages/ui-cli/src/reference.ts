import { STATUSES, TONES } from '@vadd/ui-spec'

// `vui catalog common` and `vui catalog formats` (task 26, VD-213): what §5.4 and §7 allow,
// which no component's entry says. Names come from `ui-spec`, and tests check that every
// common field and every format has a line, so this cannot fall behind.

export interface CommonField {
  name: string
  type: string
  /** The allowed values, where they are a closed set. */
  values?: readonly string[]
  meaning: string
}

export interface FormatEntry {
  name: string
  /** `name`, `name[:optional]` or `name:<required>`. */
  syntax: string
  input: string
  example?: string
}

export const COMMON_REFERENCE: readonly CommonField[] = [
  { name: 'id', type: 'string', meaning: 'target of #id links' },
  { name: 'title', type: 'inline text', meaning: 'heading' },
  { name: 'note', type: 'inline text', meaning: 'muted caption below' },
  { name: 'tone', type: 'tone', values: TONES, meaning: 'frame color' },
  { name: 'span', type: 'integer 1–12', meaning: 'columns inside a grid' },
  { name: 'fold', type: 'string', values: ['open', 'closed'], meaning: 'collapsible by title' },
]

const DELTA_BASES = 'num|int|compact|pct|pct100|ms|dur|bytes|money'

export const FORMAT_REFERENCE: readonly FormatEntry[] = [
  { name: 'text', syntax: 'text', input: 'any (default)' },
  { name: 'num', syntax: 'num[:decimals 0–20]', input: 'number', example: 'num:1' },
  { name: 'int', syntax: 'int', input: 'number' },
  { name: 'compact', syntax: 'compact', input: 'number, as 12.3K' },
  { name: 'pct', syntax: 'pct[:decimals]', input: 'ratio 0–1' },
  { name: 'pct100', syntax: 'pct100[:decimals]', input: 'number 0–100' },
  {
    name: 'delta',
    syntax: 'delta[:<base>][:better:low|high]',
    input: `number; base: ${DELTA_BASES}`,
    example: 'delta:pct',
  },
  { name: 'ms', syntax: 'ms', input: 'milliseconds' },
  { name: 'dur', syntax: 'dur', input: 'seconds' },
  { name: 'bytes', syntax: 'bytes[:si|iec]', input: 'bytes' },
  { name: 'money', syntax: 'money:<ISO 4217 code>', input: 'number', example: 'money:USD' },
  { name: 'date', syntax: 'date[:short|long|time|datetime]', input: 'ISO 8601 or epoch ms' },
  { name: 'rel', syntax: 'rel', input: 'ISO 8601 or epoch ms' },
  { name: 'status', syntax: 'status', input: STATUSES.join('|') },
  { name: 'code', syntax: 'code', input: 'string' },
  { name: 'path', syntax: 'path', input: 'string' },
  { name: 'link', syntax: 'link', input: 'URL or [label](url)' },
  { name: 'sha', syntax: 'sha[:length 1–64]', input: 'string' },
]

function commonLine({ name, type, values, meaning }: CommonField): string {
  return `${name}: ${values === undefined ? type : values.join('|')} — ${meaning}\n`
}

/** Terse, for §14.2's 300 tokens: the syntax carries the argument, the example only when needed. */
function formatLine({ syntax, input }: FormatEntry): string {
  return `${syntax}: ${input}\n`
}

export function commonText(): string {
  return `common fields, on every node:\n${COMMON_REFERENCE.map(commonLine).join('')}`
}

export function formatsText(): string {
  const where = 'use: column suffix "Time:ms", format, yFormat'
  return `formats (name or name:arg):\n${FORMAT_REFERENCE.map(formatLine).join('')}${where}\n`
}
