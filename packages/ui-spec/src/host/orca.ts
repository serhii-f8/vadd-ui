import { cleanText } from '../dev-view.js'

// §17.3: the Orca Chat UI contract, in one place. A second entry, as `catalog` is (VD-110):
// `index.ts` must not import this, or it reaches the bundle.
//
// Read from `stablyai/orca` at the tag below, which is the installed version:
// `src/shared/native-chat/native-chat-visual-directive.ts`, `native-chat-visual-shell.ts` and
// `src/shared/plugins/frames/plugin-panel-design-tokens.ts`. `e2e/orca-chat.spec.ts` compares
// this file with the copies in `e2e/harness/orca/`.

export const ORCA_VERSION = '1.4.248'
export const ORCA_COMMIT = 'c2f3bb6574e17805c9c41a5d488fa24fb1d27306'

export const ORCA_DIRECTIVE_MARKER = '::orca-visual{'
export const ORCA_DIRECTIVE_MAX_LINE = 512
export const ORCA_FILE_MAX = 128
export const ORCA_TITLE_MAX = 120
export const ORCA_VISUALS_PER_REPLY = 8
/** UTF-8 bytes. The CLI stops earlier, at 500 KiB (§4.2). */
export const ORCA_FILE_MAX_BYTES = 512 * 1024
export const ORCA_FRAME_MIN_HEIGHT = 80
export const ORCA_FRAME_MAX_HEIGHT = 2000

export const ORCA_CDN_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://cdnjs.cloudflare.com',
  'https://esm.sh',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
] as const

export const ORCA_THEME_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--font-sans',
  '--font-mono',
] as const

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/
/** Windows maps these base names to devices, whatever the extension. */
const DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3]|conin\$|conout\$)$/i
const ATTRIBUTE = /^([a-z]+)="([^"]*)"/
const LINE_SPACE = /^[ \t]*/
const LINE_END = /\r\n$|[\r\n]$/
const LINE_BREAK = /[\r\n]/
const TRAILING_SPACE = /[ \t]+$/
const MAX_INDENT = 3

const SPACE_CODE = 0x20
const DELETE_CODE = 0x7f
const BACKSLASH_CODE = 0x5c

export function isVisualFileName(name: string): boolean {
  if (name.length > ORCA_FILE_MAX || !FILE_NAME.test(name) || name.includes('..')) return false
  return !DEVICE_NAME.test(name.slice(0, name.indexOf('.')))
}

function isPlainValue(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < SPACE_CODE || code === DELETE_CODE || code === BACKSLASH_CODE) return false
  }
  return true
}

function attributesOf(body: string): Map<string, string> | undefined {
  const attributes = new Map<string, string>()
  let rest = body.replace(LINE_SPACE, '')
  while (rest.length > 0) {
    const [whole, key, value] = ATTRIBUTE.exec(rest) ?? []
    if (whole === undefined || key === undefined || value === undefined) return undefined
    if (attributes.has(key) || !isPlainValue(value)) return undefined
    attributes.set(key, value)
    rest = rest.slice(whole.length)
    const separator = LINE_SPACE.exec(rest)?.[0] ?? ''
    if (rest.length > 0 && separator.length === 0) return undefined
    rest = rest.slice(separator.length)
  }
  return attributes
}

export interface VisualDirective {
  file: string
  title: string | null
}

/** What a whole line spells to Orca, or `null`. A port; the e2e suite runs the two side by side. */
export function parseDirectiveLine(raw: string): VisualDirective | null {
  const line = raw.replace(LINE_END, '')
  if (line.length > ORCA_DIRECTIVE_MAX_LINE || LINE_BREAK.test(line)) return null
  const indent = line.length - line.replace(/^ +/, '').length
  if (indent > MAX_INDENT || !line.startsWith(ORCA_DIRECTIVE_MARKER, indent)) return null
  const trimmed = line.replace(TRAILING_SPACE, '')
  if (!trimmed.endsWith('}')) return null
  const attributes = attributesOf(trimmed.slice(indent + ORCA_DIRECTIVE_MARKER.length, -1))
  const file = attributes?.get('file')
  if (file === undefined || !isVisualFileName(file)) return null
  const title = attributes?.get('title')?.trim() ?? ''
  if (title.length > ORCA_TITLE_MAX) return null
  return { file, title: title.length > 0 ? title : null }
}

const INVISIBLE = /[\p{Cf}\p{Cs}]/gu
const LONE_SURROGATE = /\p{Cs}/gu
// Orca allows braces in a quoted value. With none, a title cannot spell the marker.
const BREAKS_THE_LINE = /["\\{}\s]+/g

/** §4.2, and a line's only way in for a document's text. Measured as Orca does, in UTF-16 units. */
export function directiveTitle(text: string): string {
  const flat = cleanText(text).replace(INVISIBLE, '').replace(BREAKS_THE_LINE, ' ').trim()
  return flat.slice(0, ORCA_TITLE_MAX).replace(LONE_SURROGATE, '').trimEnd()
}

/** §11.2. `file` comes from this program, so one Orca would refuse is a bug here. */
export function directiveLine({ file, title = '' }: { file: string; title?: string }): string {
  if (!isVisualFileName(file)) throw new RangeError(`not a visual file name: ${file}`)
  const clean = directiveTitle(title)
  const label = clean === '' ? '' : ` title="${clean}"`
  return `${ORCA_DIRECTIVE_MARKER}file="${file}"${label}}`
}
