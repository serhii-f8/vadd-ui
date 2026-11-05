import { describe, expect, it } from 'vitest'
import { findDocuments, locate } from '../src/extract.js'
import { inlineHtml } from '../src/html.js'

const DOC = '<script type="application/vui+json">{"a":1}</script>'
const texts = (html: string) => findDocuments(html).map((item) => item.text)

describe('findDocuments', () => {
  it('finds a document and where it starts', () => {
    const html = `<body>${DOC}</body>`
    const [found] = findDocuments(html)
    expect(found?.text).toBe('{"a":1}')
    expect(html.slice(found?.offset, (found?.offset ?? 0) + 7)).toBe('{"a":1}')
  })

  it('finds nothing in a file with no document', () => {
    expect(findDocuments('')).toEqual([])
    expect(findDocuments('<html><body>hi</body></html>')).toEqual([])
    expect(findDocuments('plain < text << <')).toEqual([])
  })

  it('finds every document', () => {
    expect(texts(`${DOC}x${DOC}`)).toHaveLength(2)
  })

  it.each([
    ['single quotes', "<script type='application/vui+json'>1</script>"],
    ['no quotes', '<script type=application/vui+json>1</script>'],
    ['upper case', '<SCRIPT TYPE="APPLICATION/VUI+JSON">1</SCRIPT>'],
    ['other attributes', '<script id=x data-a="b>c" type="application/vui+json">1</script>'],
    ['spaces', '<script  type = "application/vui+json" >1</script >'],
    ['a slash in the tag', '<script/type="application/vui+json">1</script/>'],
    ['the first of two types', '<script type="application/vui+json" type="x">1</script>'],
    ['an end tag with attributes', '<script type="application/vui+json">1</script a="b">'],
    ['a valueless attribute', '<script async type="application/vui+json">1</script>'],
    ['no end tag', '<script type="application/vui+json">1'],
  ])('reads a tag with %s', (_, html) => {
    expect(texts(html)).toEqual(['1'])
  })

  it.each([
    ['another type', '<script type="text/plain">1</script>'],
    ['a second type lost', '<script type="x" type="application/vui+json">1</script>'],
    ['no type', '<script>1</script>'],
    ['a padded type', '<script type=" application/vui+json">1</script>'],
    ['a valueless type', '<script type>1</script>'],
    ['another element', '<div type="application/vui+json">1</div>'],
    ['a longer name', '<scripty type="application/vui+json">1</scripty>'],
    ['a tag cut short', '<script type="application/vui+json"'],
    ['a value cut short', '<script type="application/vui+json'],
    ['a name cut short', '<script'],
  ])('ignores %s', (_, html) => {
    expect(texts(html)).toEqual([])
  })

  it.each([
    ['a comment', `<!-- ${DOC} -->`],
    ['an unclosed comment', `<!-- ${DOC}`],
    ['a bogus comment', `<!x ${DOC.replaceAll('>', ' ')}>`],
    ['a processing instruction', `<?x ${DOC.replaceAll('>', ' ')}>`],
    ['a title', `<title>${DOC}</title>`],
    ['a textarea', `<textarea>${DOC}</textarea>`],
    ['a style', `<style>${DOC}</style>`],
    ['an xmp', `<xmp>${DOC}</xmp>`],
    ['an iframe', `<iframe>${DOC}</iframe>`],
    ['a noembed', `<noembed>${DOC}</noembed>`],
    ['a noframes', `<noframes>${DOC}</noframes>`],
    ['a noscript', `<noscript>${DOC}</noscript>`],
    ['plaintext', `<plaintext>${DOC}`],
    ['a template', `<template>${DOC}</template>`],
    ['a nested template', `<template><template></template>${DOC}</template>`],
    ['another script', `<script>var a = '${DOC.replace('</script>', '')}'</script>`],
    ['an attribute value', `<div title='${DOC}'></div>`],
    ['an unclosed raw element', `<style>${DOC}`],
  ])('finds nothing inside %s', (_, html) => {
    expect(texts(html)).toEqual([])
  })

  it.each([
    ['a comment', `<!-- a -->${DOC}`],
    ['an empty comment', `<!-->${DOC}`],
    ['a short comment', `<!--->${DOC}`],
    ['a comment ended with a bang', `<!-- a --!>${DOC}`],
    ['a title', `<title>x</title>${DOC}`],
    ['an upper case title', `<TITLE>x</TITLE>${DOC}`],
    ['a closed template', `<template></template>${DOC}`],
    ['a stray end tag', `</template>${DOC}`],
    ['an end tag', `</div>${DOC}`],
    ['an odd end tag', `</ div>${DOC}`],
    ['an empty end tag', `</>${DOC}`],
    ['a stray open bracket', `a < b ${DOC}`],
    ['a tag with a quoted bracket', `<div title="a>b<c">${DOC}`],
    ['a script', `<script>1</script>${DOC}`],
    ['a script in the body of a comment-like text', `<script>a<!--b-->c</script>${DOC}`],
    ['a script holding a false end', `<script>a</scripty>b</script>${DOC}`],
    ['an empty comment in a script', `<script><!--></script>${DOC}`],
    ['a short comment in a script', `<script><!---></script>${DOC}`],
    ['an escaped end in a script', `<script><!--</script>${DOC}`],
    ['a double escape', `<script><!--<script></script>--></script>${DOC}`],
    ['a double escape in upper case', `<script><!--<SCRIPT></SCRIPT>--></script>${DOC}`],
  ])('finds the document after %s', (_, html) => {
    expect(texts(html)).toEqual(['{"a":1}'])
  })

  it('needs the double escape to read past a nested end tag', () => {
    expect(texts(`<script><!--<script></script>${DOC}`)).toEqual([])
  })

  it('leaves the escape at once on an empty comment in a script', () => {
    expect(texts(`<script><!--><script></script>${DOC}`)).toEqual(['{"a":1}'])
  })

  it.each([
    ['<!--!>', `<!--!>${DOC}`],
    ['<!---!>', `<!---!>${DOC}`],
  ])('stays in a comment past %s, as a browser does', (_, html) => {
    expect(texts(html)).toEqual([])
  })

  it('finds nothing after a double escape that never ends', () => {
    expect(texts(`<script><!--<script>${DOC}`)).toEqual([])
  })

  it('stays in the double escape past a nested open tag and comment', () => {
    expect(texts(`<script><!--<script><script><!--x</script></script>${DOC}`)).toEqual(['{"a":1}'])
  })

  it('reads a script end only at a delimiter', () => {
    const html = '<script type="application/vui+json">a</scriptx>b</script>'
    expect(texts(html)).toEqual(['a</scriptx>b'])
  })

  it('ignores markup-like text inside a document', () => {
    const text = "<script type='application/vui+json'>x<\\/script><!x"
    const html = inlineHtml(
      { vui: 1, density: 'compact', locale: 'en-US', body: [], title: text },
      { bundle: 'var a="<script"', generator: 'g' },
    )
    expect(findDocuments(html)).toHaveLength(1)
  })

  it('stays fast on a long run of brackets', () => {
    const started = performance.now()
    findDocuments('<'.repeat(500_000))
    findDocuments('<a '.repeat(150_000))
    findDocuments(`<script>${'<!--'.repeat(120_000)}`)
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

describe('locate', () => {
  it('counts lines and columns from 1', () => {
    expect(locate('ab\ncd', 0)).toEqual({ line: 1, column: 1 })
    expect(locate('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  it('counts CRLF and CR once each', () => {
    expect(locate('a\r\nb\rc', 3)).toEqual({ line: 2, column: 1 })
    expect(locate('a\r\nb\rc', 5)).toEqual({ line: 3, column: 1 })
  })
})
