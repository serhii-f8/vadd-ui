import { describe, expect, it } from 'vitest'
import { parseMd } from '../src/index.js'

describe('parseMd (VD-054)', () => {
  it('takes only h3 and h4 as headings', () => {
    expect(parseMd('### a\n#### b ##')).toEqual([
      { kind: 'heading', level: 3, text: 'a' },
      { kind: 'heading', level: 4, text: 'b' },
    ])
    expect(parseMd('## a\n\n##### b')).toEqual([
      { kind: 'paragraph', text: '## a' },
      { kind: 'paragraph', text: '##### b' },
    ])
  })

  it('joins a paragraph across lines and leaves inline text raw', () => {
    expect(parseMd('**a**\n  b\n\nc')).toEqual([
      { kind: 'paragraph', text: '**a** b' },
      { kind: 'paragraph', text: 'c' },
    ])
  })

  it('nests lists by indent, and the first marker sets the kind', () => {
    expect(parseMd('1. a\n- b\n  - c\n    wrapped\n\n2. d')).toEqual([
      {
        kind: 'list',
        list: {
          ordered: true,
          items: [
            { text: 'a' },
            {
              text: 'b',
              children: { ordered: false, items: [{ text: 'c wrapped' }] },
            },
            { text: 'd' },
          ],
        },
      },
    ])
  })

  it('joins an item that steps back between two levels to the child list', () => {
    const [block] = parseMd('- a\n    - b\n  - c')
    expect(block).toEqual({
      kind: 'list',
      list: {
        ordered: false,
        items: [{ text: 'a', children: { ordered: false, items: [{ text: 'b' }, { text: 'c' }] } }],
      },
    })
  })

  it('splits a quote into paragraphs and does not nest', () => {
    expect(parseMd('> a\n> b\n>\n> > c')).toEqual([{ kind: 'quote', paragraphs: ['a b', '> c'] }])
  })

  it('reads fences, keeps lang, and closes at the end of the text', () => {
    expect(parseMd('```ts\nconst a\n\n  b\n```\n~~~\nopen')).toEqual([
      { kind: 'code', text: 'const a\n\n  b', lang: 'ts' },
      { kind: 'code', text: 'open' },
    ])
  })

  it('keeps a one-line ```a``` as a paragraph', () => {
    expect(parseMd('```a```')).toEqual([{ kind: 'paragraph', text: '```a```' }])
  })

  it('has no blocks for blank text', () => {
    expect(parseMd(' \n\n')).toEqual([])
  })
})
