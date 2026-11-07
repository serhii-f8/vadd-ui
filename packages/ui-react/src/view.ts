import {
  type Diagnostic,
  type RenderHandle,
  render,
  stylesheet,
  type VuiDocument,
} from '@vadd/ui-render'
import { createElement, type ReactElement, useLayoutEffect, useRef } from 'react'
import { type MediaLike, type VuiTheme, watchTheme } from './theme.js'

/** §4.4, exactly. */
export interface VuiViewProps {
  doc: VuiDocument | string
  theme?: VuiTheme
  onDiagnostics?: (diagnostics: Diagnostic[]) => void
}

/** The host is the custom element's box in the dashboard's layout; nothing else leaks out. */
const HOST_CSS = ':host{display:block}'

interface Mount {
  root: HTMLElement
  handle: RenderHandle
  doc: VuiDocument | string
}

function osScheme(view: Window | null): MediaLike | undefined {
  return typeof view?.matchMedia === 'function'
    ? view.matchMedia('(prefers-color-scheme: dark)')
    : undefined
}

/** The browser cannot find an id inside a shadow root, so `#x` links would go nowhere. */
function jumpWithin(shadow: ShadowRoot): (event: Event) => void {
  return (event) => {
    const link = (event.target as Element | null)?.closest?.('a')
    const href = link?.getAttribute('href')
    if (href?.startsWith('#') !== true || href.length < 2) return
    const fragment = href.slice(1)
    let decoded = fragment
    try {
      decoded = decodeURIComponent(fragment)
    } catch {
      // A malformed escape is looked up as written.
    }
    const target = shadow.getElementById(fragment) ?? shadow.getElementById(decoded)
    if (target === null) return
    event.preventDefault()
    target.scrollIntoView()
  }
}

/**
 * §4.4: one VUI document, rendered by `@vadd/ui-render` inside a shadow root so dashboard CSS
 * and vadd-ui CSS cannot meet. Host tokens (`--background`, `--card`, …) still inherit into
 * it, which is how a host themes it (§8.1).
 */
export function VuiView({ doc, theme = 'auto', onDiagnostics }: VuiViewProps): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const mounted = useRef<Mount | null>(null)
  const report = useRef(onDiagnostics)
  report.current = onDiagnostics
  // The first render's document: later ones go through `update`, below.
  const initial = useRef(doc)

  useLayoutEffect(() => {
    const element = host.current as HTMLDivElement
    // StrictMode mounts twice, and a second `attachShadow` would throw.
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
    const style = element.ownerDocument.createElement('style')
    style.textContent = stylesheet + HOST_CSS
    const root = element.ownerDocument.createElement('div')
    shadow.replaceChildren(style, root)
    const jump = jumpWithin(shadow)
    shadow.addEventListener('click', jump)
    // As the feed does (VD-147): a link opens beside the dashboard instead of replacing it.
    const view = element.ownerDocument.defaultView
    const linkHandler = (url: string) => {
      view?.open(url, '_blank', 'noopener,noreferrer')
    }
    const handle = render(initial.current, root, { linkHandler })
    mounted.current = { root, handle, doc: initial.current }
    report.current?.(handle.diagnostics)
    return () => {
      shadow.removeEventListener('click', jump)
      handle.destroy()
      shadow.replaceChildren()
      mounted.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const current = mounted.current
    if (current === null || current.doc === doc) return
    current.doc = doc
    current.handle.update(doc)
    report.current?.(current.handle.diagnostics)
  }, [doc])

  useLayoutEffect(() => {
    const current = mounted.current as Mount
    const html = current.root.ownerDocument.documentElement
    return watchTheme(theme, html, osScheme(current.root.ownerDocument.defaultView), (name) =>
      current.root.setAttribute('data-vui-theme', name),
    )
  }, [theme])

  return createElement('div', { ref: host, 'data-vui-view': '' })
}
