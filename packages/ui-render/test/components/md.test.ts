import { describe, expect, it } from 'vitest'
import { show } from '../helpers.js'

const md = (text: string, fields: object = {}) => ({ type: 'md', text, ...fields })
const typed = (box: HTMLElement, type: string) =>
  box.querySelector(`[data-vui-type="${type}"]`) as HTMLElement

describe('md inline subset', () => {
  it('renders every form as nodes', () => {
    const { box } = show([md('**b** *i* `c` ~~s~~ [l](https://a.test/) :ok:')])
    const paragraph = box.querySelector('p') as HTMLElement
    expect(paragraph.querySelector('strong')?.textContent).toBe('b')
    expect(paragraph.querySelector('em')?.textContent).toBe('i')
    expect(paragraph.querySelector('code')?.textContent).toBe('c')
    expect(paragraph.querySelector('s')?.textContent).toBe('s')
    expect(paragraph.querySelector('a')?.getAttribute('href')).toBe('https://a.test/')
    expect(paragraph.querySelector('.vui-status')?.textContent).toContain('ok')
  })

  it('works inside headings, list items and quotes', () => {
    const { box } = show([md('### **h**\n\n- **l**\n\n> **q**')])
    expect(box.querySelector('h3 strong')?.textContent).toBe('h')
    expect(box.querySelector('li strong')?.textContent).toBe('l')
    expect(box.querySelector('blockquote strong')?.textContent).toBe('q')
  })
})

describe('md blocks', () => {
  it('maps ### and #### to h3 and h4', () => {
    const { box } = show([md('### a\n#### b')])
    expect(box.querySelector('h3')?.textContent).toBe('a')
    expect(box.querySelector('h4')?.textContent).toBe('b')
  })

  it('leaves other heading levels as text', () => {
    const { box } = show([md('## a\n\n##### b')])
    expect(box.querySelectorAll('h2, h5')).toHaveLength(0)
    expect(box.querySelectorAll('p')).toHaveLength(2)
  })

  it('sits below the title of the node', () => {
    const { box } = show([md('### a\n#### b', { title: 'T' })])
    expect([...box.querySelectorAll('h3, h4, h5')].map((item) => item.tagName)).toEqual([
      'H3',
      'H4',
      'H5',
    ])
  })

  it('stops at h6', () => {
    const inner = md('### a\n#### b', { title: 'x' })
    const deep = (node: object, count: number): object =>
      count === 0 ? node : { type: 'section', title: 's', children: [deep(node, count - 1)] }
    const { box } = show([deep(inner, 3)])
    const typedMd = typed(box, 'md')
    expect(typedMd.querySelectorAll('h6').length).toBeGreaterThanOrEqual(2)
  })

  it('renders lists with nesting', () => {
    const { box } = show([md('- a\n  1. b\n- c')])
    const list = box.querySelector('ul') as HTMLElement
    expect(list.children).toHaveLength(2)
    expect(list.querySelector('li > ol > li')?.textContent).toBe('b')
  })

  it('renders an ordered list', () => {
    const { box } = show([md('1. a\n2. b')])
    expect(box.querySelectorAll('ol > li')).toHaveLength(2)
  })

  it('starts an ordered list on its first number', () => {
    const { box } = show([md('1. a\n\n```\nx\n```\n\n2. b')])
    const lists = box.querySelectorAll('ol')
    expect(lists[0]?.hasAttribute('start')).toBe(false)
    expect(lists[1]?.getAttribute('start')).toBe('2')
  })

  it('reads CRLF text', () => {
    const { box } = show([md('### a\r\n\r\n- b\r\n- c')])
    expect(box.querySelector('h3')?.textContent).toBe('a')
    expect(box.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders a quote of paragraphs', () => {
    const { box } = show([md('> a\n>\n> b')])
    expect(box.querySelectorAll('blockquote > p')).toHaveLength(2)
  })

  it('uses the code block for a fence', () => {
    const { box } = show([md('```ts\nconst a = 1\n```')])
    expect(box.querySelector('pre code')?.textContent).toBe('const a = 1')
    expect(box.querySelector('.vui-code-lang')?.textContent).toBe('ts')
    expect(box.querySelector('.vui-code-copy')).not.toBeNull()
  })

  it('folds a long fence, and each fence keeps its own state', () => {
    const fence = `\`\`\`\n${'x\n'.repeat(40)}\`\`\``
    const body = [md(`${fence}\n\n${fence}`, { id: 'm' })]
    const { box, handle } = show(body)
    const toggles = () => [...box.querySelectorAll<HTMLElement>('.vui-fold-toggle')]
    expect(toggles()).toHaveLength(2)
    toggles()[1]?.click()
    handle.update({ vui: 1, body } as never)
    expect(toggles().map((toggle) => toggle.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
    ])
  })

  it('renders nothing for blank text', () => {
    const { box } = show([md('  ')])
    expect(typed(box, 'md').children).toHaveLength(0)
  })
})

describe('md is nodes only', () => {
  const hostile = [
    '<script>globalThis.hit = 1</script>',
    '<img src=x onerror="globalThis.hit = 1">',
    '### <iframe src="https://a.test/"></iframe>',
    '- <b onclick="a()">x</b>',
    '> <style>*{display:none}</style>',
    '[x](javascript:alert(1))',
    '![x](https://a.test/a.png)',
    '```html\n<script>a()</script>\n```',
  ]

  it.each(hostile)('keeps %s as text', (text) => {
    const { box } = show([md(text)])
    expect(box.querySelectorAll('script, img, iframe, style, b, [onclick]')).toHaveLength(0)
    expect(box.querySelector('a[href^="javascript"]')).toBeNull()
    expect(box.textContent).not.toBe('')
  })

  it('stays inside the budget on an indent ladder', () => {
    const lines: string[] = []
    let used = 0
    for (let depth = 0; used < 19_000; depth += 2) {
      const line = `${' '.repeat(depth)}- x`
      lines.push(line)
      used += line.length + 1
    }
    const { box } = show([md(lines.join('\n'))])
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(box.querySelectorAll('ul').length).toBeGreaterThan(100)
  })
})

describe('callout', () => {
  it('is info by default, even with no tone left', () => {
    const { box } = show([{ type: 'callout', text: 'x', tone: 'neon' }])
    const callout = typed(box, 'callout')
    expect(callout.classList.contains('vui-tone-info')).toBe(true)
    expect(callout.querySelector('.vui-sr-only')?.textContent).toBe('info')
  })

  it('takes a tone', () => {
    const { box } = show([{ type: 'callout', text: 'x', tone: 'err' }])
    expect(typed(box, 'callout').classList.contains('vui-tone-err')).toBe(true)
  })

  it('leaves the icon to a leading status token (B8)', () => {
    const { box } = show([{ type: 'callout', tone: 'err', text: ':fail: `a.ts:88` fails' }])
    const callout = typed(box, 'callout')
    expect(callout.querySelector('.vui-node-mark')).toBeNull()
    expect(callout.className).toBe('vui-node vui-tone-err vui-toned')
    expect(callout.querySelectorAll('.vui-status')).toHaveLength(1)
    const later = typed(show([{ type: 'callout', tone: 'err', text: 'x :fail:' }]).box, 'callout')
    expect(later.querySelector('.vui-node-mark')).not.toBeNull()
    expect(later.className).toContain('vui-marked')
  })

  it('renders inline text and a title', () => {
    const { box } = show([{ type: 'callout', title: 'T', text: '**x**' }])
    const callout = typed(box, 'callout')
    expect(callout.querySelector('h3')?.textContent).toBe('T')
    expect(callout.querySelector('p strong')?.textContent).toBe('x')
  })
})
