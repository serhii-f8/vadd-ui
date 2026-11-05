import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../src/index.js'
import { show, target } from './helpers.js'

const LINK = { type: 'md', text: '[jump](#deep)' }
const DEEP = { type: 'md', id: 'deep', text: 'target' }

function jump(box: HTMLElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  box.querySelector('a.vui-link')?.dispatchEvent(event)
  return event
}

const deep = (box: HTMLElement) => box.querySelector('#deep') as HTMLElement
const shown = (node: HTMLElement) => node.closest('[hidden]') === null
const fold = (children: unknown[], extra = {}) => ({
  type: 'section',
  title: 'Folded',
  fold: 'closed',
  children,
  ...extra,
})
const tabs = (children: unknown[]) => ({
  type: 'tabs',
  tabs: [
    { label: 'One', children: [{ type: 'md', text: 'first' }] },
    { label: 'Two', children },
  ],
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('a #id link into hidden content (VD-070)', () => {
  it('opens a closed fold', () => {
    const { box } = show([LINK, fold([DEEP])])
    expect(shown(deep(box))).toBe(false)
    jump(box)
    expect(shown(deep(box))).toBe(true)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('selects a hidden tab', () => {
    const { box } = show([LINK, tabs([DEEP])])
    jump(box)
    expect(shown(deep(box))).toBe(true)
    const selected = box.querySelector('[role="tab"][aria-selected="true"]')
    expect(selected?.textContent).toBe('Two')
  })

  it('opens a fold inside a hidden tab', () => {
    const { box } = show([LINK, tabs([fold([DEEP])])])
    jump(box)
    expect(shown(deep(box))).toBe(true)
  })

  it('opens a hidden tab inside a closed fold', () => {
    const { box } = show([LINK, fold([tabs([DEEP])])])
    jump(box)
    expect(shown(deep(box))).toBe(true)
  })

  it('leaves a closed section shut when the link targets the section, whose title shows', () => {
    const { box } = show([LINK, fold([{ type: 'md', text: 'x' }], { id: 'deep' })])
    jump(box)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('goes through the component, so the opening outlives update', () => {
    const doc = { vui: 1, body: [LINK, fold([DEEP]), tabs([{ type: 'md', text: 'two' }])] }
    const { box, handle } = show(doc.body)
    jump(box)
    handle.update(doc as never)
    expect(shown(deep(box))).toBe(true)
  })

  it('leaves the open fold of a visible target alone', () => {
    const { box } = show([LINK, fold([DEEP], { fold: 'open' })])
    jump(box)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves the page alone when the id is not there', () => {
    const { box } = show([{ type: 'md', text: '[jump](#nowhere)' }, fold([DEEP])])
    expect(() => jump(box)).not.toThrow()
    expect(shown(deep(box))).toBe(false)
  })

  it('matches a percent-encoded fragment, as the browser does', () => {
    const { box } = show([
      { type: 'md', text: '[jump](#caf%C3%A9)' },
      fold([{ type: 'md', id: 'café', text: 'target' }]),
    ])
    jump(box)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('tries the fragment as written first, as the browser does', () => {
    const { box } = show([
      { type: 'md', text: '[jump](#a%20b)' },
      fold([{ type: 'md', id: 'a%20b', text: 'target' }]),
    ])
    jump(box)
    expect(box.querySelector('.vui-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('survives a malformed fragment', () => {
    const { box } = show([{ type: 'md', text: '[jump](#%E0%A4%A)' }])
    expect(() => jump(box)).not.toThrow()
  })

  it('keeps the native jump, so the browser scrolls and the URL updates', () => {
    const { box } = show([LINK, fold([DEEP])])
    expect(jump(box).defaultPrevented).toBe(false)
  })

  it('reveals under a linkHandler too, which never sees a #id link', () => {
    const handler = vi.fn()
    const box = target()
    render({ vui: 1, body: [LINK, fold([DEEP])] } as never, box, { linkHandler: handler })
    jump(box)
    expect(handler).not.toHaveBeenCalled()
    expect(shown(deep(box))).toBe(true)
  })
})
