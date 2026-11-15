import { EXT_COMPONENTS } from '../src/components/ext.js'
import { COMPONENTS } from '../src/components/index.js'
import type { Registry } from '../src/context.js'
import { el } from '../src/el.js'
import { createRenderer } from '../src/renderer.js'

const realRender = createRenderer(COMPONENTS)
const fullRender = createRenderer(EXT_COMPONENTS)

export function target(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

/** Enough of `stack` and `md` to test the core without the catalog. */
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

/** A render of `body` with the real catalog. */
export function show(body: unknown[], fields: Record<string, unknown> = {}) {
  const box = target()
  const handle = realRender({ vui: 1, ...fields, body } as never, box)
  return { box, handle }
}

/** A render of `body` with the whole catalog, the §6 `ext` tier included (VD-182). */
export function showExt(body: unknown[], fields: Record<string, unknown> = {}) {
  const box = target()
  const handle = fullRender({ vui: 1, ...fields, body } as never, box)
  return { box, handle }
}
