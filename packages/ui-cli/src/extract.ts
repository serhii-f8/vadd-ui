import { MEDIA_TYPE } from '@vadd/ui-spec'

// `vui extract` reads a file it did not write, so a text search would be wrong twice: a
// document's own text can spell a script tag, and a comment can hide one. This follows the
// HTML tokenizer over the states that decide where elements start and end, and it never
// builds a DOM, so nothing in the file can run.

export interface Embedded {
  text: string
  /** Where `text` starts in the file. */
  offset: number
}

interface Tag {
  name: string
  type: string | undefined
  /** Just past the `>`. */
  end: number
}

const RAW_TEXT: ReadonlySet<string> = new Set([
  'title',
  'textarea',
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
])

const SPACE = /[\t\n\f\r ]/
const SPACE_OR_SLASH = /[\t\n\f\r /]/
const NAME_END = /[\t\n\f\r />]/
const LETTER = /[a-z]/i
const SCRIPT_MARK = /<!--|-->|<\/?script(?=[\t\n\f\r />])/gi

function indexWhere(html: string, from: number, pattern: RegExp): number {
  let index = from
  while (index < html.length && !pattern.test(html.charAt(index))) index++
  return index
}

function skip(html: string, from: number, pattern: RegExp): number {
  let index = from
  while (index < html.length && pattern.test(html.charAt(index))) index++
  return index
}

/** The value at `from`, and where it ends. `undefined` when the file ends first. */
function readValue(html: string, from: number): { value: string; end: number } | undefined {
  const quote = html.charAt(from)
  if (quote === '"' || quote === "'") {
    const close = html.indexOf(quote, from + 1)
    return close === -1 ? undefined : { value: html.slice(from + 1, close), end: close + 1 }
  }
  const end = indexWhere(html, from, /[\t\n\f\r >]/)
  return { value: html.slice(from, end), end }
}

/** A tag whose name starts at `from`. `undefined` when the file ends inside it. */
function readTag(html: string, from: number): Tag | undefined {
  let index = indexWhere(html, from, NAME_END)
  const name = html.slice(from, index).toLowerCase()
  let type: string | undefined
  let typeSeen = false
  while (true) {
    index = skip(html, index, SPACE_OR_SLASH)
    if (index >= html.length) return undefined
    if (html.charAt(index) === '>') return { name, type, end: index + 1 }
    // A leading `=` is part of the name.
    const nameEnd = indexWhere(html, index + 1, /[\t\n\f\r />=]/)
    const attribute = html.slice(index, nameEnd).toLowerCase()
    index = skip(html, nameEnd, SPACE)
    let value = ''
    if (html.charAt(index) === '=') {
      const read = readValue(html, skip(html, index + 1, SPACE))
      if (read === undefined) return undefined
      value = read.value
      index = read.end
    }
    if (attribute === 'type' && !typeSeen) {
      type = value
      typeSeen = true
    }
  }
}

/** Where scanning resumes after a raw-text element. */
function endOfRawText(html: string, name: string, from: number): number {
  const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'gi')
  close.lastIndex = from
  const match = close.exec(html)
  if (match === null) return html.length
  return readTag(html, match.index + 2)?.end ?? html.length
}

/** The script-data states, with the escaped pair a `<!--` opens. */
function endOfScript(html: string, from: number): [number, number] {
  const marks = new RegExp(SCRIPT_MARK)
  marks.lastIndex = from
  let state: 'data' | 'escaped' | 'double' = 'data'
  for (let match = marks.exec(html); match !== null; match = marks.exec(html)) {
    const mark = match[0].toLowerCase()
    if (mark === '<!--') {
      if (state === 'data') state = 'escaped'
      // `<!-->` ends at once, so the dashes also count towards a `-->`.
      marks.lastIndex = match.index + 2
    } else if (mark === '-->') {
      state = 'data'
    } else if (mark === '<script') {
      if (state === 'escaped') state = 'double'
    } else if (state === 'double') {
      state = 'escaped'
    } else {
      const tag = readTag(html, match.index + 2)
      return [match.index, tag?.end ?? html.length]
    }
  }
  return [html.length, html.length]
}

/** Where scanning resumes after the `<!` or `<?` at `from`. */
function endOfMarkup(html: string, from: number): number {
  if (!html.startsWith('<!--', from)) {
    const close = html.indexOf('>', from)
    return close === -1 ? html.length : close + 1
  }
  // `-->` may reuse the opener's dashes, so `<!-->` is whole, while `--!>` may not.
  const arrow = html.indexOf('-->', from + 2)
  const bang = html.indexOf('--!>', from + 4)
  const ends = [arrow === -1 ? -1 : arrow + 3, bang === -1 ? -1 : bang + 4]
  const found = ends.filter((end) => end !== -1)
  return found.length === 0 ? html.length : Math.min(...found)
}

/** What the boot script would find: `script[type="application/vui+json"]`, outside `template`. */
export function findDocuments(html: string): Embedded[] {
  const found: Embedded[] = []
  let templates = 0
  let index = html.indexOf('<')
  while (index !== -1) {
    const next = html.charAt(index + 1)
    let resume = index + 1
    if (next === '!' || next === '?') {
      resume = endOfMarkup(html, index)
    } else if (next === '/') {
      const start = index + 2
      if (LETTER.test(html.charAt(start))) {
        const tag = readTag(html, start)
        if (tag === undefined) break
        if (tag.name === 'template') templates = Math.max(templates - 1, 0)
        resume = tag.end
      } else {
        resume = endOfMarkup(html, index)
      }
    } else if (LETTER.test(next)) {
      const tag = readTag(html, index + 1)
      if (tag === undefined) break
      resume = tag.end
      if (tag.name === 'plaintext') break
      if (tag.name === 'template') templates++
      else if (tag.name === 'script') {
        const [end, after] = endOfScript(html, tag.end)
        if (templates === 0 && tag.type?.toLowerCase() === MEDIA_TYPE) {
          found.push({ text: html.slice(tag.end, end), offset: tag.end })
        }
        resume = after
      } else if (RAW_TEXT.has(tag.name)) {
        resume = endOfRawText(html, tag.name, tag.end)
      }
    }
    index = html.indexOf('<', resume)
  }
  return found
}

/** 1-based. Each of `\n`, `\r\n` and `\r` ends a line, as in the `ui-spec` parser. */
export function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let start = 0
  for (const match of text.slice(0, offset).matchAll(/\r\n?|\n/g)) {
    line++
    start = match.index + match[0].length
  }
  return { line, column: offset - start + 1 }
}
