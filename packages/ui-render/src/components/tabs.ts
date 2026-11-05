import { isJsonObject } from '@vadd/ui-spec'
import type { Component } from '../context.js'
import { el } from '../el.js'
import { opensWith } from '../reveal.js'
import { nodeList, text, whole } from './fields.js'

const ACTIVE = 'active'

/** Where `key` moves from `index` among `count` tabs, if it moves at all. */
function moved(key: string, index: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}

export const tabs: Component = {
  render(node, context) {
    const items = nodeList(node, 'tabs').flatMap((tab, index) =>
      isJsonObject(tab) ? [{ tab, index }] : [],
    )
    if (items.length === 0) return []
    const wanted = [context.state.get(ACTIVE), whole(node, 'active')]
    const first = wanted.find((index) => items[index as number] !== undefined)
    const start = (first as number | undefined) ?? 0

    const select = (index: number) => {
      context.state.set(ACTIVE, index)
      buttons.forEach((button, position) => {
        button.setAttribute('aria-selected', String(position === index))
      })
      panels.forEach((panel, position) => {
        panel.hidden = position !== index
      })
    }

    const buttons = items.map(({ tab }, position) =>
      el(
        'button',
        {
          class: 'vui-tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(position === start),
          on: { click: () => select(position) },
        },
        text(tab, 'label'),
      ),
    )
    const panels = items.map(({ tab, index }, position) => {
      const children = nodeList(tab, 'children')
      const panel = el(
        'div',
        {
          class: 'vui-tab-panel',
          role: 'tabpanel',
          'aria-label': text(tab, 'label'),
          hidden: position !== start,
        },
        context.children(children, `${context.pointer}/tabs/${index}/children`),
      )
      opensWith(panel, () => select(position))
      return panel
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      const next = moved(event.key, index, buttons.length)
      if (next === undefined) return
      event.preventDefault()
      select(next)
      buttons[next]?.focus()
    }
    const list = el('div', { class: 'vui-tablist', role: 'tablist', on: { keydown } }, buttons)
    return el('div', { class: 'vui-tabs' }, [list, ...panels])
  },
}
