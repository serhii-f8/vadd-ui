import { cleanText, MEDIA_TYPE, type VuiDocument } from '@vadd/ui-spec'

/** §10.2. Pinned to the format's major for the whole line (§10.3). */
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js'
const DEFAULT_TITLE = 'vadd-ui'
const DEFAULT_LANG = 'en'

const LANGUAGE_SUBTAG = /^([a-z]{2,3})(?:-|$)/i

// `<` only occurs inside a string once serialized, so these never touch structure.
// C1 controls too: with no `--out` this text is stdout, and U+009B is a terminal's CSI.
const UNSAFE_IN_SCRIPT = /<\/|<!--|[\u0080-\u009f\u2028\u2029]/g
const SCRIPT_ESCAPES: Record<string, string> = { '</': '<\\/', '<!--': '\\u003c!--' }

function codeEscape(character: string): string {
  return `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
}

const UNSAFE_IN_HTML = /[&<>"]/g
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

/**
 * §15.1, on serialized JSON. Each escape is a JSON escape, so a real parser undoes it and
 * nothing here needs an inverse. A replacer function keeps `$&` in the text inert.
 */
export function embedJson(json: string): string {
  return json.replace(UNSAFE_IN_SCRIPT, (match) => SCRIPT_ESCAPES[match] ?? codeEscape(match))
}

/** For HTML text and a double-quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(UNSAFE_IN_HTML, (match) => HTML_ESCAPES[match] as string)
}

// A mistyped `title` or `locale` is only a `warn` (§13.3), so these reach here as anything.

function languageOf(locale: unknown): string {
  if (typeof locale !== 'string') return DEFAULT_LANG
  return LANGUAGE_SUBTAG.exec(locale)?.[1]?.toLowerCase() ?? DEFAULT_LANG
}

function titleOf(title: unknown): string {
  return typeof title === 'string' ? title : DEFAULT_TITLE
}

function documentScript(document: VuiDocument): string {
  const json = embedJson(JSON.stringify(document))
  return `<script type="${MEDIA_TYPE}">${json}</script>\n`
}

export interface InlineOptions {
  /** `vui.min.js`. It holds no `</script` or `<!--`; `check-bundle-size` proves that. */
  bundle: string
  /** The text of the generator `<meta>`, such as `vadd-ui 1.0.0`. */
  generator: string
}

/** §10.1, by concatenation: neither the bundle nor the document passes through a pattern. */
export function inlineHtml(document: VuiDocument, { bundle, generator }: InlineOptions): string {
  const title = escapeHtml(cleanText(titleOf(document.title)))
  return [
    '<!doctype html>\n',
    `<html lang="${languageOf(document.locale)}"><head><meta charset="utf-8">\n`,
    `<meta name="generator" content="${escapeHtml(generator)}">\n`,
    `<title>${title}</title>\n`,
    '<script>',
    bundle,
    '</script>\n',
    '</head><body>\n',
    documentScript(document),
    '</body></html>\n',
  ].join('')
}

/** §10.2. The same file an agent would write, with the same escaping. */
export function cdnHtml(document: VuiDocument): string {
  return [
    '<!doctype html><meta charset="utf-8">\n',
    `<script src="${CDN_URL}"></script>\n`,
    documentScript(document),
  ].join('')
}
