import { parse, type VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { cdnHtml, embedJson, escapeHtml, inlineHtml } from '../src/visual-file.js'

const doc = (fields: Record<string, unknown> = {}): VuiDocument =>
  ({ vui: 1, density: 'compact', locale: 'en-US', body: [], ...fields }) as VuiDocument

const inline = (fields: Record<string, unknown> = {}, bundle = '/*b*/') =>
  inlineHtml(doc(fields), { bundle, generator: 'vadd-ui 1.0.0' })

/** The text a browser would hand the boot script. */
function embedded(html: string): string {
  const start = html.indexOf('<script type="application/vui+json">')
  const open = html.indexOf('>', start) + 1
  return html.slice(open, html.indexOf('</script>', open))
}

describe('embedJson', () => {
  it.each([
    ['closing tag', '{"a":"</script>"}', '{"a":"<\\/script>"}'],
    ['any case', '{"a":"</SCRIPT>"}', '{"a":"<\\/SCRIPT>"}'],
    ['comment open', '{"a":"<!--"}', '{"a":"\\u003c!--"}'],
    ['line separator', '{"a":"\u2028"}', '{"a":"\\u2028"}'],
    ['paragraph separator', '{"a":"\u2029"}', '{"a":"\\u2029"}'],
    ['a key', '{"</":1}', '{"<\\/":1}'],
  ])('escapes %s', (_, input, expected) => {
    expect(embedJson(input)).toBe(expected)
  })

  it.each([
    ['closing tag', '</script></script>'],
    ['comment', '<!-- <!-- --> </'],
    ['separators', '\u2028\u2029'],
    ['text that reads as an escape already', '<\\/ \\u2028 \\u003c!-- \\\\/'],
    ['a backslash before a slash', 'a\\/b'],
    ['a backslash before the tag', '\\</script>'],
    ['replacement patterns', "$& $1 $` $' $$"],
    ['a broken pair', '\ud83d'],
    ['an emoji', '😀'],
  ])('survives a JSON parser for %s', (_, text) => {
    const value = { text, [text]: 1 }
    const json = JSON.stringify(value)
    const escaped = embedJson(json)
    expect(JSON.parse(escaped)).toEqual(value)
    expect(JSON.stringify(JSON.parse(escaped))).toBe(json)
    expect(escaped).not.toMatch(/<\/|<!--|\u2028|\u2029/)
    const relaxed = parse(escaped)
    expect(relaxed).toEqual({ ok: true, value })
  })
})

describe('escapeHtml', () => {
  it('escapes every character that matters in text and in a quoted attribute', () => {
    expect(escapeHtml('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e')
  })

  it('escapes an ampersand once, first', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('inlineHtml', () => {
  it('writes the §10.1 layout', () => {
    const value = doc({ title: 'Test run' })
    expect(inlineHtml(value, { bundle: 'BUNDLE', generator: 'vadd-ui 1.0.0' })).toBe(
      '<!doctype html>\n' +
        '<html lang="en"><head><meta charset="utf-8">\n' +
        '<meta name="generator" content="vadd-ui 1.0.0">\n' +
        '<title>Test run</title>\n' +
        '<script>BUNDLE</script>\n' +
        '</head><body>\n' +
        `<script type="application/vui+json">${JSON.stringify(value)}</script>\n` +
        '</body></html>\n',
    )
  })

  it('keeps replacement patterns in the bundle literal', () => {
    const bundle = "a$&b$1c$`d$'e$$f"
    expect(inline({}, bundle)).toContain(`<script>${bundle}</script>`)
  })

  it('keeps replacement patterns in the document literal', () => {
    const text = "$& $1 $` $' $$"
    expect(embedded(inline({ title: text }))).toBe(JSON.stringify(doc({ title: text })))
    expect(inline({ title: text })).toContain("<title>$&amp; $1 $` $' $$</title>")
  })

  it('escapes the document, so it stays one element', () => {
    const html = inline({ title: '</script><script>alert(1)</script><!--' })
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })

  it('treats the title as HTML, not JSON', () => {
    const html = inline({ title: '</title><img src=x onerror=alert(1)> & "q"' })
    expect(html).toContain(
      '<title>&lt;/title&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</title>',
    )
  })

  it('strips controls from the title', () => {
    expect(inline({ title: 'a\x1b[2Jb\x00c' })).toContain('<title>abc</title>')
  })

  it('names the file when there is no title', () => {
    expect(inline()).toContain('<title>vadd-ui</title>')
  })

  it('falls back when a warning let a mistyped title or locale through', () => {
    const html = inline({ title: 5, locale: 5 })
    expect(html).toContain('<title>vadd-ui</title>')
    expect(html).toContain('<html lang="en">')
  })

  it('escapes the generator attribute', () => {
    const html = inlineHtml(doc(), { bundle: '', generator: 'a"><script>' })
    expect(html).toContain('<meta name="generator" content="a&quot;&gt;&lt;script&gt;">')
  })

  it.each([
    ['en-US', 'en'],
    ['uk-UA', 'uk'],
    ['PL', 'pl'],
    ['gsw', 'gsw'],
    ['"><script>', 'en'],
    ['x', 'en'],
    ['english', 'en'],
  ])('reads lang from locale %s', (locale, lang) => {
    expect(inline({ locale })).toContain(`<html lang="${lang}">`)
  })
})

describe('cdnHtml', () => {
  it('writes the §10.2 template', () => {
    const value = doc({ title: 'x' })
    expect(cdnHtml(value)).toBe(
      '<!doctype html><meta charset="utf-8">\n' +
        '<script src="https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js"></script>\n' +
        `<script type="application/vui+json">${JSON.stringify(value)}</script>\n`,
    )
  })

  it('escapes the document', () => {
    expect(cdnHtml(doc({ title: '</script>' }))).toContain('"title":"<\\/script>"')
  })
})
