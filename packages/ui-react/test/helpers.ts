import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { VuiDocument } from '../src/index.js'

// React's `act` warns unless the environment says it is a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface Mounted {
  container: HTMLElement
  root: Root
  rerender(element: ReactElement): void
  unmount(): void
}

export function mount(element: ReactElement): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    root,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

export function hostOf(container: HTMLElement): HTMLElement {
  const host = container.querySelector<HTMLElement>('[data-vui-view]')
  if (host === null) throw new Error('no VuiView host')
  return host
}

export function shadowOf(container: HTMLElement): ShadowRoot {
  const shadow = hostOf(container).shadowRoot
  if (shadow === null) throw new Error('no shadow root')
  return shadow
}

export function vuiRoot(container: HTMLElement): HTMLElement {
  const root = shadowOf(container).querySelector<HTMLElement>('.vui-root')
  if (root === null) throw new Error('no .vui-root')
  return root
}

/** A canonical document, which is what the `VuiDocument` half of the prop means. */
export const doc = (title: string): VuiDocument =>
  ({
    vui: 1,
    title,
    density: 'comfortable',
    locale: 'en-US',
    body: [{ type: 'callout', tone: 'info', text: `${title} body` }],
  }) as VuiDocument

export { act, createElement }
