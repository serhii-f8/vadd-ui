import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { version } from '@vadd/ui'
import { cleanText, MEDIA_TYPE, type VuiDocument } from '@vadd/ui-spec'

export const GENERATOR = 'vadd-ui'

/** The text of the generator `<meta>` (§10.1). */
export const GENERATOR_LABEL = `${GENERATOR} ${version}`

// Through the package's `exports`, so this works from any install layout (VD-097), and not
// by a path that only holds inside this monorepo.
const require = createRequire(import.meta.url)

/** `vui.min.js`, as §10.1 inlines it. */
export function readBundle(): string {
  return readFileSync(require.resolve('@vadd/ui/vui.min.js'), 'utf8')
}

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

/** The `<title>` text, escaped. A title with no text left once cleaned names the file. */
function titleOf(title: unknown): string {
  const text = typeof title === 'string' ? cleanText(title) : ''
  return escapeHtml(text.trim() === '' ? DEFAULT_TITLE : text)
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
  const title = titleOf(document.title)
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

/**
 * §10.2, with the inline file's `lang` and `<title>` on the first line (VD-168): the other
 * lines are the template an agent writes, with the same escaping.
 */
export function cdnHtml(document: VuiDocument): string {
  const title = titleOf(document.title)
  return [
    `<!doctype html><html lang="${languageOf(document.locale)}"><meta charset="utf-8">`,
    `<title>${title}</title>\n`,
    `<script src="${CDN_URL}"></script>\n`,
    documentScript(document),
  ].join('')
}
