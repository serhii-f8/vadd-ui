import { describe, expect, it } from 'vitest'
import { show } from '../helpers.js'

const text = (value: string, fields: object = {}) => ({ type: 'callout', text: value, ...fields })
const typed = (box: HTMLElement, type: string) =>
  box.querySelector(`[data-vui-type="${type}"]`) as HTMLElement

describe('stack', () => {
  it('defaults to the md gap', () => {
    const { box } = show([{ type: 'stack', children: [text('a'), text('b')] }])
    const stack = box.querySelector('.vui-stack') as HTMLElement
    expect(stack.classList.contains('vui-gap-md')).toBe(true)
    expect(stack.children).toHaveLength(2)
  })

  it('takes a gap', () => {
    const { box } = show([{ type: 'stack', gap: 'lg', children: [] }])
    expect(box.querySelector('.vui-stack.vui-gap-lg')).not.toBeNull()
  })

  it('falls back when a gap is dropped', () => {
    const { box } = show([{ type: 'stack', gap: 'huge', children: [] }])
    expect(box.querySelector('.vui-stack.vui-gap-md')).not.toBeNull()
  })
})

describe('grid', () => {
  const grid = (count: number, fields: object = {}) => {
    const children = Array.from({ length: count }, () => text('x'))
    const { box } = show([{ type: 'grid', children, ...fields }])
    return box.querySelector('.vui-grid') as HTMLElement
  }

  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [12, 4],
  ])('with %i children and no cols has %i columns', (count, cols) => {
    expect(grid(count).getAttribute('data-vui-cols')).toBe(String(cols))
  })

  it('takes cols', () => {
    expect(grid(2, { cols: 5 }).getAttribute('data-vui-cols')).toBe('5')
  })

  it('goes auto when cols is dropped', () => {
    expect(grid(2, { cols: 9 }).getAttribute('data-vui-cols')).toBe('2')
  })

  it('sits in a query container, so it collapses by its own width', () => {
    expect(grid(2).parentElement?.classList.contains('vui-grid-box')).toBe(true)
  })

  it('clamps a span to the columns', () => {
    const { box } = show([
      {
        type: 'grid',
        cols: 3,
        children: [text('a', { span: 9 }), text('b', { span: 2 }), text('c')],
      },
    ])
    const spans = [...(box.querySelector('.vui-grid') as HTMLElement).children].map((child) =>
      child.getAttribute('data-vui-span'),
    )
    expect(spans).toEqual(['3', '2', null])
  })

  it('clamps the span of an error card and of an unknown node', () => {
    const { box } = show([
      {
        type: 'grid',
        cols: 2,
        children: [
          { type: 'callout', span: 12 },
          { type: 'hologram', span: 12 },
        ],
      },
    ])
    const grid = box.querySelector('.vui-grid') as HTMLElement
    expect(grid.querySelector('.vui-card-error')?.getAttribute('data-vui-span')).toBe('2')
    expect(grid.querySelector('.vui-card-placeholder')?.parentElement?.dataset.vuiSpan).toBe('2')
  })
})

describe('section', () => {
  it('draws its title and children', () => {
    const { box } = show([{ type: 'section', title: 'S', children: [text('a')] }])
    const section = typed(box, 'section')
    expect(section.querySelector('h3')?.textContent).toBe('S')
    expect(section.querySelector('[data-vui-type="callout"]')).not.toBeNull()
  })

  it('folds, starting closed', () => {
    const { box } = show([{ type: 'section', title: 'S', fold: 'closed', children: [text('a')] }])
    const toggle = box.querySelector('.vui-fold-toggle') as HTMLElement
    const body = box.querySelector('.vui-fold-body') as HTMLElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(body.hidden).toBe(true)
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(body.hidden).toBe(false)
  })

  it('puts its children a heading level down', () => {
    const { box } = show([
      {
        type: 'section',
        title: 'S',
        children: [{ type: 'section', title: 'T', children: [] }],
      },
    ])
    expect(box.querySelector('h4')?.textContent).toBe('T')
  })
})

describe('card', () => {
  it('keeps title, children and note on the surface', () => {
    const { box } = show([{ type: 'card', title: 'C', note: 'N', children: [text('a')] }])
    const card = typed(box, 'card')
    expect(card.querySelector('h3')?.textContent).toBe('C')
    expect(card.querySelector('.vui-note')?.textContent).toBe('N')
    expect(card.querySelector('[data-vui-type="callout"]')).not.toBeNull()
  })
})

describe('tone', () => {
  it('draws a bar and a mark for a tone with a meaning', () => {
    const { box } = show([{ type: 'card', tone: 'warn', children: [] }])
    const card = typed(box, 'card')
    expect(card.className).toBe('vui-node vui-tone-warn vui-toned vui-marked')
    const mark = card.firstElementChild as HTMLElement
    expect(mark.className).toBe('vui-node-mark')
    expect(mark.querySelector('[aria-hidden="true"]')?.textContent).toBe('⚠')
    expect(mark.querySelector('.vui-sr-only')?.textContent).toBe('warning')
  })

  it.each([
    ['ok', '✓', 'ok'],
    ['err', '✗', 'error'],
    ['info', 'ℹ', 'info'],
  ])('marks %s', (tone, glyph, word) => {
    const { box } = show([{ type: 'stack', tone, children: [] }])
    expect(box.querySelector('.vui-node-mark')?.textContent).toBe(`${glyph}${word}`)
  })

  it.each(['muted', 'accent'])('gives %s a bar and no mark', (tone) => {
    const { box } = show([{ type: 'stack', tone, children: [] }])
    expect(typed(box, 'stack').classList.contains('vui-toned')).toBe(true)
    expect(box.querySelector('.vui-node-mark')).toBeNull()
  })

  it('draws nothing for default', () => {
    const { box } = show([{ type: 'stack', tone: 'default', children: [] }])
    expect(typed(box, 'stack').classList.contains('vui-toned')).toBe(false)
    expect(box.querySelector('.vui-node-mark')).toBeNull()
  })

  it('draws nothing without a tone', () => {
    const { box } = show([{ type: 'stack', children: [] }])
    expect(typed(box, 'stack').className).toBe('vui-node')
  })
})

describe('divider', () => {
  it('is a rule', () => {
    const { box } = show([{ type: 'divider' }])
    expect(typed(box, 'divider').querySelector('hr')).not.toBeNull()
  })

  it('carries a label as plain text', () => {
    const { box } = show([{ type: 'divider', label: '**later**' }])
    const divider = box.querySelector('[role="separator"]') as HTMLElement
    expect(divider.getAttribute('aria-label')).toBe('**later**')
    expect(divider.textContent).toBe('**later**')
    expect(box.querySelector('hr')).toBeNull()
  })
})

describe('tolerance', () => {
  it.each(['stack', 'grid', 'card'])('%s survives children that are not a list', (type) => {
    const { box } = show([{ type, children: 'x' }])
    expect(
      box.querySelector('[data-vui-type]') ?? box.querySelector('.vui-card-error'),
    ).toBeTruthy()
  })
})
