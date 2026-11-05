import type { Registry } from '../src/context.js'
import { el } from '../src/el.js'

export function target(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

/** Enough of `stack` and `md` to give the core a tree. Real ones arrive in task 07. */
export const testRegistry: Registry = new Map([
  ['md', { render: (node, ctx) => el('p', {}, ctx.inline(String(node.text))) }],
  [
    'stack',
    {
      render: (node, ctx) =>
        el('div', {}, ctx.children(node.children as never, `${ctx.pointer}/children`)),
    },
  ],
])
