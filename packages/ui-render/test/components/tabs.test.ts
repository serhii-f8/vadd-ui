import { describe, expect, it } from 'vitest'
import { tabs } from '../../src/components/tabs.js'
import type { NodeContext } from '../../src/context.js'
import { show } from '../helpers.js'

const panel = (text: string) => ({ label: text, children: [{ type: 'divider', label: text }] })
const tabsNode = (fields: object = {}) => ({
  type: 'tabs',
  id: 't',
  tabs: [panel('One'), panel('Two'), panel('Three')],
  ...fields,
})

const tabsOf = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>('[role="tab"]')]
const panelsOf = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
const selected = (box: HTMLElement) =>
  tabsOf(box).map((tab) => tab.getAttribute('aria-selected') === 'true')
const shown = (box: HTMLElement) => panelsOf(box).map((item) => !item.hidden)
const press = (element: HTMLElement, key: string) =>
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

describe('tabs', () => {
  it('shows the first panel by default', () => {
    const { box } = show([tabsNode()])
    expect(selected(box)).toEqual([true, false, false])
    expect(shown(box)).toEqual([true, false, false])
  })

  it('takes active', () => {
    const { box } = show([tabsNode({ active: 2 })])
    expect(selected(box)).toEqual([false, false, true])
    expect(shown(box)).toEqual([false, false, true])
  })

  it('uses the first tab when active is past the end', () => {
    const { box } = show([tabsNode({ active: 7 })])
    expect(selected(box)).toEqual([true, false, false])
  })

  it('names each panel, and needs no element ids', () => {
    const { box } = show([tabsNode()])
    expect(panelsOf(box).map((item) => item.getAttribute('aria-label'))).toEqual([
      'One',
      'Two',
      'Three',
    ])
    expect(box.querySelectorAll('[role="tablist"] [id]')).toHaveLength(0)
  })

  it('uses buttons that all stay in the Tab order', () => {
    const { box } = show([tabsNode()])
    for (const tab of tabsOf(box)) {
      expect(tab.tagName).toBe('BUTTON')
      expect(tab.getAttribute('type')).toBe('button')
      expect(tab.hasAttribute('tabindex')).toBe(false)
    }
  })

  it('switches on click', () => {
    const { box } = show([tabsNode()])
    tabsOf(box)[1]?.click()
    expect(selected(box)).toEqual([false, true, false])
    expect(shown(box)).toEqual([false, true, false])
  })

  it('keeps the choice across update', () => {
    const { box, handle } = show([tabsNode()])
    tabsOf(box)[2]?.click()
    handle.update({ vui: 1, body: [tabsNode()] } as never)
    expect(selected(box)).toEqual([false, false, true])
  })

  it('uses active when the remembered tab is gone after update', () => {
    const { box, handle } = show([tabsNode()])
    tabsOf(box)[2]?.click()
    handle.update({
      vui: 1,
      body: [tabsNode({ tabs: [panel('A'), panel('B')], active: 1 })],
    } as never)
    expect(selected(box)).toEqual([false, true])
    expect(shown(box)).toEqual([false, true])
  })

  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowLeft', 1, 0],
    ['ArrowRight', 2, 0],
    ['ArrowLeft', 0, 2],
    ['Home', 2, 0],
    ['End', 0, 2],
  ])('%s from tab %i selects and focuses tab %i', (key, from, to) => {
    const { box } = show([tabsNode({ active: from })])
    const tab = tabsOf(box)[from] as HTMLElement
    tab.focus()
    press(tab, key)
    expect(selected(box)[to]).toBe(true)
    expect(document.activeElement).toBe(tabsOf(box)[to])
  })

  it('ignores other keys and lets them through', () => {
    const { box } = show([tabsNode()])
    const tab = tabsOf(box)[0] as HTMLElement
    expect(press(tab, 'a')).toBe(true)
    expect(selected(box)).toEqual([true, false, false])
  })

  it.each(['altKey', 'ctrlKey', 'metaKey'])(
    'leaves %s with an arrow to the browser',
    (modifier) => {
      const { box } = show([tabsNode()])
      const tab = tabsOf(box)[0] as HTMLElement
      const event = { key: 'ArrowRight', bubbles: true, cancelable: true, [modifier]: true }
      expect(tab.dispatchEvent(new KeyboardEvent('keydown', event))).toBe(true)
      expect(selected(box)).toEqual([true, false, false])
    },
  )

  it('renders nothing for an empty list', () => {
    const { box } = show([{ type: 'tabs', tabs: [] }])
    expect(box.querySelector('[role="tablist"]')).toBeNull()
    expect(box.querySelector('.vui-card-error')).toBeNull()
  })

  it('fails the node when a tab is not an object', () => {
    const { box } = show([{ type: 'tabs', tabs: [panel('A'), 'x'] }])
    expect(box.querySelector('.vui-card-error')).not.toBeNull()
  })

  it('skips such a tab, keeping pointers, if nothing caught it (VD-066)', () => {
    const pointers: string[] = []
    const context = {
      pointer: '/body/0',
      state: new Map(),
      children: (_: unknown, at: string) => {
        pointers.push(at)
        return []
      },
    } as unknown as NodeContext
    const element = tabs.render({ tabs: ['x', panel('B')] }, context) as HTMLElement
    expect(element.querySelectorAll('[role="tab"]')).toHaveLength(1)
    expect(pointers).toEqual(['/body/0/tabs/1/children'])
  })

  it('shows a label as plain text', () => {
    const { box } = show([{ type: 'tabs', tabs: [panel('[x](https://a.test/)')] }])
    expect(tabsOf(box)[0]?.textContent).toBe('[x](https://a.test/)')
    expect(tabsOf(box)[0]?.querySelector('a')).toBeNull()
  })

  it('isolates a failing child to its panel', () => {
    const { box } = show([
      { type: 'tabs', tabs: [{ label: 'A', children: [{ type: 'callout' }] }, panel('B')] },
    ])
    expect(panelsOf(box)[0]?.querySelector('.vui-card-error')).not.toBeNull()
    expect(tabsOf(box)).toHaveLength(2)
  })
})
