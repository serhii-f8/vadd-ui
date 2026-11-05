import { describe, expect, it } from 'vitest'
import { show } from '../helpers.js'

const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) => all(box, selector).map((item) => item.textContent)
const click = (box: Element, label: string) => {
  const button = all(box, 'button').find((item) => item.textContent?.includes(label))
  ;(button as HTMLButtonElement).click()
  return button as HTMLButtonElement
}

describe('checks', () => {
  const output = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n')

  it('shows status, name, command and time', () => {
    const items = [{ name: 'Types', status: 'ok', cmd: 'pnpm tsc', ms: 9100 }]
    const { box } = show([{ type: 'checks', items }])
    expect(box.querySelector('.vui-status')?.textContent).toContain('ok')
    expect(box.querySelector('li')?.textContent).toContain('Types')
    expect(box.querySelector('code')?.textContent).toBe('pnpm tsc')
    expect(box.querySelector('.vui-row-end')?.textContent).toBe('9.10 s')
  })

  it('has no fold without output', () => {
    const { box } = show([{ type: 'checks', items: [{ name: 'a', status: 'ok' }] }])
    expect(box.querySelector('button')).toBeNull()
  })

  it('folds output, closed at the start', () => {
    const items = [{ name: 'a', status: 'fail', output: 'boom' }]
    const { box } = show([{ type: 'checks', items }])
    const toggle = box.querySelector('button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect((box.querySelector('.vui-fold-body') as HTMLElement).hidden).toBe(true)
    expect(box.querySelector('pre')?.textContent).toBe('boom')
  })

  it('strips ANSI from output', () => {
    const items = [{ name: 'a', status: 'fail', output: '\u001b[31mred\u001b[0m\r\nnext' }]
    const { box } = show([{ type: 'checks', items }])
    expect(box.querySelector('pre')?.textContent).toBe('red\nnext')
  })

  it('shows the last 20 lines, and folds the ones before', () => {
    const { box } = show([{ type: 'checks', items: [{ name: 'a', status: 'ok', output }] }])
    const blocks = all(box, 'pre')
    expect(blocks.map((item) => item.textContent?.split('\n').length)).toEqual([5, 20])
    expect(blocks[1]?.textContent?.startsWith('line 6\n')).toBe(true)
    expect(blocks[1]?.textContent?.endsWith('line 25')).toBe(true)
    const earlier = click(box, '5 earlier lines')
    expect(earlier.getAttribute('aria-expanded')).toBe('true')
    expect(blocks[0]?.textContent?.startsWith('line 1\n')).toBe(true)
  })

  it('has one fold at exactly 20 lines, and says one line in the singular', () => {
    const lines = (count: number) =>
      Array.from({ length: count }, (_, index) => `l${index}`).join('\n')
    const exact = show([
      { type: 'checks', items: [{ name: 'a', status: 'ok', output: lines(20) }] },
    ])
    expect(all(exact.box, 'button')).toHaveLength(1)
    const one = show([{ type: 'checks', items: [{ name: 'a', status: 'ok', output: lines(21) }] }])
    expect(texts(one.box, 'button')[1]).toContain('1 earlier line')
    expect(texts(one.box, 'button')[1]).not.toContain('lines')
  })

  it('keeps each fold of its own across an update', () => {
    const items = [
      { name: 'a', status: 'ok', output: 'x' },
      { name: 'b', status: 'ok', output: 'y' },
    ]
    const { box, handle } = show([{ id: 'c', type: 'checks', items }])
    all(box, 'button')[1]?.dispatchEvent(new MouseEvent('click'))
    handle.update({ vui: 1, body: [{ id: 'c', type: 'checks', items }] } as never)
    expect(all(box, 'button').map((item) => item.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
    ])
  })
})

describe('plan', () => {
  const items = [
    { text: '**Add** table', status: 'ok', note: 'done `x`' },
    {
      text: 'Invalidate',
      status: 'run',
      children: [
        { text: 'First', status: 'ok' },
        { text: 'Second', status: 'wait' },
      ],
    },
  ]

  it('counts done over total in the header, children included', () => {
    const { box } = show([{ type: 'plan', title: 'Plan', items }])
    expect(box.querySelector('.vui-plan-head')?.textContent).toBe('2/4 done')
  })

  it('nests children', () => {
    const { box } = show([{ type: 'plan', items }])
    expect(all(box, 'ul ul > li')).toHaveLength(2)
    expect(box.querySelector('ul ul li')?.textContent).toContain('First')
  })

  it('draws text and note as inline text, with a status', () => {
    const { box } = show([{ type: 'plan', items }])
    expect(box.querySelector('li strong')?.textContent).toBe('Add')
    expect(box.querySelector('li .vui-note code')?.textContent).toBe('x')
    expect(all(box, '.vui-status')).toHaveLength(4)
  })
})

describe('tree', () => {
  it('takes items, nested, with a status and a note', () => {
    const items = [
      { name: '**src**', status: 'ok', note: 'new', children: [{ name: 'a.ts' }] },
      { name: 'b.ts' },
    ]
    const { box } = show([{ type: 'tree', items }])
    expect(box.querySelector('li')?.textContent).toContain('**src**')
    expect(box.querySelector('ul ul li')?.textContent).toBe('a.ts')
    expect(all(box, '.vui-status')).toHaveLength(1)
    expect(box.querySelector('.vui-note')?.textContent).toBe('new')
  })

  it('takes paths', () => {
    const { box } = show([{ type: 'tree', paths: ['src/a.ts', 'src/b.ts', 'c.ts'] }])
    expect(texts(box, 'ul ul li')).toEqual(['a.ts', 'b.ts'])
    expect(all(box, '.vui-tree > li')).toHaveLength(2)
  })

  it('ignores paths past the cap that are not text', () => {
    const { box } = show([{ type: 'tree', paths: [7, 'a'] }])
    expect(box.querySelector('.vui-card-error')).toBeNull()
  })

  it('has no list inside a leaf', () => {
    const { box } = show([{ type: 'tree', paths: ['a'] }])
    expect(all(box, 'ul')).toHaveLength(1)
  })
})

describe('timeline', () => {
  const items = [
    { at: '2026-11-05T10:00:00Z', text: 'Started **now**', status: 'ok' },
    { at: 'Next week', text: 'Ships' },
  ]

  it('is an ordered list', () => {
    const { box } = show([{ type: 'timeline', items }])
    expect(all(box, 'ol > li')).toHaveLength(2)
  })

  it('formats an ISO time, and keeps a label as written, with no diagnostic', () => {
    const { box, handle } = show([{ type: 'timeline', items }])
    const [time, label] = texts(box, '.vui-time')
    expect(time).toContain('2026')
    expect(time).not.toContain('T10')
    expect(label).toBe('Next week')
    expect(handle.diagnostics).toEqual([])
  })

  it('draws text inline, with an optional status', () => {
    const { box } = show([{ type: 'timeline', items }])
    expect(box.querySelector('li strong')?.textContent).toBe('now')
    expect(all(box, '.vui-status')).toHaveLength(1)
  })
})
