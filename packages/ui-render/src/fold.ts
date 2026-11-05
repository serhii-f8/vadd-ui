import { type Child, el, fill } from './el.js'

export type FoldBody = Child | Child[] | (() => Child | Child[])

export interface FoldOptions {
  /** What the toggle shows. */
  label: Child | Child[]
  /** A function builds the body on the first open, for what may never be read. */
  body: FoldBody
  open: boolean
  onToggle(open: boolean): void
  /** The heading tag that wraps the toggle, when the label is a heading. */
  heading?: 'h3' | 'h4' | 'h5' | 'h6'
}

/** A fold is a button, not `<details>`: §15.2 names `aria-expanded` on a button. */
export function foldable({ label, body, open, onToggle, heading }: FoldOptions): HTMLElement[] {
  let pending = typeof body === 'function' ? body : undefined
  const drawn = pending === undefined ? (body as Child | Child[]) : open ? pending() : []
  if (open) pending = undefined
  const region = el('div', { class: 'vui-fold-body', hidden: !open }, drawn)
  const toggle = el(
    'button',
    {
      class: 'vui-fold-toggle',
      type: 'button',
      'aria-expanded': String(open),
      on: {
        click: () => {
          const opening = toggle.getAttribute('aria-expanded') !== 'true'
          toggle.setAttribute('aria-expanded', String(opening))
          region.hidden = !opening
          if (opening && pending !== undefined) {
            fill(region, pending())
            pending = undefined
          }
          region.classList.toggle('vui-fold-opening', opening)
          onToggle(opening)
        },
      },
    },
    [el('span', { class: 'vui-fold-icon', 'aria-hidden': 'true' }, '▸'), el('span', {}, label)],
  )
  const head = heading === undefined ? toggle : el(heading, { class: 'vui-node-title' }, toggle)
  return [head, region]
}
