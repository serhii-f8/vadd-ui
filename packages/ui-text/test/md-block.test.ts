import { type JsonValue, type VuiDocument, validate } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { renderMarkdown, renderPlain } from '../src/index.js'

function documentOf(text: string): VuiDocument {
  return validate({ type: 'md', text } as JsonValue).document as VuiDocument
}

function both(source: string, markdown: string, text: string = markdown): void {
  expect(renderMarkdown(documentOf(source))).toBe(`${markdown}\n`)
  expect(renderPlain(documentOf(source))).toBe(`${text}\n`)
}

describe('md node (§6.2)', () => {
  it('keeps the inline subset', () => {
    both('**a** *b* `c` ~~d~~ :ok:', '**a** *b* `c` ~~d~~ ✓ ok', 'a b c d ✓ ok')
  })

  it('joins soft-wrapped lines and splits paragraphs on blank lines', () => {
    both('one\ntwo\n\nthree', 'one two\n\nthree')
    both('a\r\nb\r\rc', 'a b\n\nc')
  })

  it('keeps h3 and h4 as written', () => {
    both('### A\n\n#### *B*', '### A\n\n#### *B*', 'A\n\nB')
    both('### A ###\ntext', '### A\n\ntext', 'A\n\ntext')
  })

  it('leaves other heading levels as text', () => {
    both('# A', '\\# A', '# A')
    both('## A', '\\## A', '## A')
    both('##### A', '\\##### A', '##### A')
  })

  it('renders lists, renumbering ordered ones', () => {
    both('- a\n- **b**\n* c\n+ d', '- a\n- **b**\n- c\n- d', '- a\n- b\n- c\n- d')
    both('3. a\n4. b', '1. a\n2. b')
    both('1. a\n\n2. b', '1. a\n2. b')
  })

  it('nests lists by indent', () => {
    both('- a\n  - b\n    - c\n  - d\n- e', '- a\n  - b\n    - c\n  - d\n- e')
    both('1. a\n   - b\n2. c', '1. a\n   - b\n2. c')
  })

  it('folds an indented continuation into its item', () => {
    both('- a\n  more\n- b', '- a more\n- b')
  })

  it('ends a list at text', () => {
    both('- a\n\ntext', '- a\n\ntext')
    both('- a\ntext', '- a\n\ntext')
  })

  it('quotes paragraphs', () => {
    both('> a\n> b\n>\n> c', '> a b\n>\n> c')
    both('>no space', '> no space')
  })

  it('does not nest quotes', () => {
    both('> > a', '> \\> a', '> > a')
  })

  it('keeps a fence verbatim', () => {
    both(
      '```ts\nconst a = "<b>"\n\n# x\n```',
      '```ts\nconst a = "<b>"\n\n# x\n```',
      '    const a = "<b>"\n\n    # x',
    )
    both('~~~\n`x`\n~~~', '```\n`x`\n```', '    `x`')
  })

  it('closes a fence only with a run as long as the opener', () => {
    both('````\n```\n````\nafter', '````\n```\n````\n\nafter', '    ```\n\nafter')
  })

  it('closes an open fence at the end of the text', () => {
    both('```\nabc', '```\nabc\n```', '    abc')
  })

  it('lets a block interrupt a paragraph', () => {
    both(
      'a\n### B\nc\n- d\ne\n> f\ng\n```\nh\n```',
      'a\n\n### B\n\nc\n\n- d\n\ne\n\n> f\n\ng\n\n```\nh\n```',
      'a\n\nB\n\nc\n\n- d\n\ne\n\n> f\n\ng\n\n    h',
    )
  })

  it('treats what the subset leaves out as text', () => {
    both('---', '\\---', '---')
    both('a | b\n--- | ---', 'a \\| b --- \\| ---', 'a | b --- | ---')
    both('<div>x</div>', '&lt;div>x&lt;/div>', '<div>x</div>')
    both('- [ ] task', '- \\[ \\] task', '- [ ] task')
  })

  it('gives empty text no output', () => {
    expect(renderMarkdown(documentOf('   \n\n'))).toBe('')
  })
})
