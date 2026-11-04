import { type Formatted, formatValue, type JsonValue } from '@vadd/ui-spec'
import { code, type Inline, text } from './blocks.js'

export interface Context {
  locale: string
  /** The document's `generatedAt` (§5.2). */
  now?: string
  /** Heading level for a node title. */
  level: number
}

export function format(
  value: JsonValue | undefined,
  name: string | undefined,
  { locale, now }: Context,
): Formatted {
  return formatValue(value, name, now === undefined ? { locale } : { locale, now })
}

/** A formatted value as tokens. The strings are `formatValue`'s, unchanged (§7). */
export function tokensOf(formatted: Formatted): Inline {
  if (formatted.status !== undefined) return [{ type: 'status', status: formatted.status }]
  if (formatted.inline !== undefined) return formatted.inline
  if (formatted.href !== undefined) {
    return [{ type: 'link', href: formatted.href, children: [text(formatted.text)] }]
  }
  return [formatted.mono === true ? code(formatted.text) : text(formatted.text)]
}
