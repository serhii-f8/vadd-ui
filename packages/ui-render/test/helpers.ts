import { issuePad } from '../../ui-spec/test/fuzz/generator.js'
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

/** `show` past the issue cap: nothing after the pad is checked or dropped, so a component
 * meets each field exactly as written (VD-187). The pad is `/body/0`. */
export { issuePad }

export function showUnchecked(body: unknown[], fields: Record<string, unknown> = {}) {
  return show([issuePad(), ...body], fields)
}

/** An object that no `String()`, template, `+` or computed key can coerce: its own
 * `toString` and `valueOf` are data. Valid JSON: `{"toString":{},"valueOf":[]}`. */
export const hostile = () => ({ toString: {}, valueOf: [] }) as unknown

const SVG = 'http://www.w3.org/2000/svg'
const BAD = /NaN|Infinity|undefined/

/**
 * Every attribute of an SVG element, and every `style` anywhere, that holds `NaN`, `Infinity`
 * or `undefined`: a number that went wrong on its way into geometry (VD-088's class).
 */
export function badAttributes(root: Element): string[] {
  const found: string[] = []
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const svg = element.namespaceURI === SVG
    for (const { name, value } of element.attributes) {
      if ((svg || name === 'style') && BAD.test(value)) {
        found.push(`<${element.localName} ${name}="${value.slice(0, 120)}">`)
      }
    }
  }
  return found
}
