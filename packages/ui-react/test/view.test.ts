import { type ReactElement, StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Diagnostic, type VuiDocument, VuiView } from '../src/index.js'
import {
  act,
  createElement,
  doc,
  hostOf,
  type Mounted,
  mount,
  shadowOf,
  vuiRoot,
} from './helpers.js'

const mounted: Mounted[] = []
const view = (props: Parameters<typeof VuiView>[0]) => createElement(VuiView, props)
const open = (element: ReactElement) => {
  const handle = mount(element)
  mounted.push(handle)
  return handle
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  for (const handle of mounted.splice(0)) {
    if (handle.container.isConnected) handle.unmount()
  }
  document.documentElement.className = ''
})

describe('VuiView', () => {
  it('mounts into an open shadow root and leaves the light DOM empty', () => {
    const { container } = open(view({ doc: doc('Hello') }))
    const host = hostOf(container)
    expect(host.children.length).toBe(0)
    const shadow = shadowOf(container)
    expect(shadow.mode).toBe('open')
    const styles = shadow.querySelectorAll('style')
    expect(styles.length).toBe(1)
    expect(styles[0]?.textContent).toContain('.vui-root')
    expect(styles[0]?.textContent).toContain(':host{display:block}')
    expect(vuiRoot(container).textContent).toContain('Hello')
  })

  it('takes a relaxed JSON string', () => {
    const { container } = open(
      view({ doc: "{title: 'From text', body: [{type: 'callout', text: 'x'}]}" }),
    )
    expect(vuiRoot(container).textContent).toContain('From text')
  })

  it('survives StrictMode with one stylesheet and one root', () => {
    const { container } = open(createElement(StrictMode, null, view({ doc: doc('Strict') })))
    const shadow = shadowOf(container)
    expect(shadow.querySelectorAll('style').length).toBe(1)
    expect(shadow.querySelectorAll('.vui-root').length).toBe(1)
    expect(vuiRoot(container).textContent).toContain('Strict')
  })

  it('updates in place on a new doc', () => {
    const handle = open(view({ doc: doc('First') }))
    const root = vuiRoot(handle.container)
    handle.rerender(view({ doc: doc('Second') }))
    expect(vuiRoot(handle.container)).toBe(root)
    expect(root.textContent).toContain('Second')
    expect(root.textContent).not.toContain('First')
  })

  it('skips an identical doc and a new callback', () => {
    const same = doc('Same')
    const first = vi.fn()
    const handle = open(view({ doc: same, onDiagnostics: first }))
    const second = vi.fn()
    handle.rerender(view({ doc: same, onDiagnostics: second }))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    handle.rerender(view({ doc: doc('Other'), onDiagnostics: second }))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('reports diagnostics after the first render and each update', () => {
    const seen: Diagnostic[][] = []
    const onDiagnostics = (diagnostics: Diagnostic[]) => seen.push(diagnostics)
    const handle = open(view({ doc: doc('Clean'), onDiagnostics }))
    expect(seen).toEqual([[]])
    handle.rerender(view({ doc: { ...doc('Odd'), bogus: true } as VuiDocument, onDiagnostics }))
    expect(seen.length).toBe(2)
    expect(seen[1]?.length).toBeGreaterThan(0)
  })

  it('shows an error card for text that does not parse, and never throws', () => {
    const onDiagnostics = vi.fn()
    const { container } = open(view({ doc: '{nope', onDiagnostics }))
    const diagnostics = onDiagnostics.mock.calls[0]?.[0] as Diagnostic[]
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true)
    expect(vuiRoot(container).textContent?.length).toBeGreaterThan(0)
  })

  it('empties the shadow root on unmount', () => {
    const handle = open(view({ doc: doc('Gone') }))
    const shadow = shadowOf(handle.container)
    handle.unmount()
    expect(shadow.childNodes.length).toBe(0)
  })

  it('jumps to a #fragment inside the shadow root', () => {
    const { container } = open(view({ doc: doc('Jump') }))
    const shadow = shadowOf(container)
    const target = document.createElement('div')
    target.id = 'x'
    const scroll = vi.fn()
    target.scrollIntoView = scroll
    const link = document.createElement('a')
    link.href = '#x'
    vuiRoot(container).append(target, link)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    link.dispatchEvent(event)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(shadow.getElementById('x')).toBe(target)
  })

  it('leaves a fragment with no target and other links alone', () => {
    const { container } = open(view({ doc: doc('Links') }))
    const missing = document.createElement('a')
    missing.href = '#nowhere'
    const away = document.createElement('a')
    away.href = 'https://example.com/'
    vuiRoot(container).append(missing, away)
    for (const link of [missing, away]) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it('opens a link in a new tab, as the feed does, and leaves the dashboard in place', () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const linked = {
      ...doc('Linked'),
      body: [{ type: 'callout', tone: 'info', text: 'See [the docs](https://example.com/x).' }],
    } as VuiDocument
    const { container } = open(view({ doc: linked }))
    const anchor = vuiRoot(container).querySelector<HTMLAnchorElement>('a[href^="https:"]')
    expect(anchor).not.toBeNull()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)
    expect(opened).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer')
    expect(event.defaultPrevented).toBe(true)
    opened.mockRestore()
  })

  it('writes an explicit theme on the root', () => {
    const handle = open(view({ doc: doc('Dark'), theme: 'dark' }))
    expect(vuiRoot(handle.container).dataset.vuiTheme).toBe('dark')
    handle.rerender(view({ doc: doc('Dark'), theme: 'light' }))
    expect(vuiRoot(handle.container).dataset.vuiTheme).toBe('light')
  })

  it('follows .dark on <html> under auto without a re-render', async () => {
    const { container } = open(view({ doc: doc('Auto') }))
    const root = vuiRoot(container)
    const title = root.firstElementChild
    expect(root.dataset.vuiTheme).toBe('light')
    await act(async () => {
      document.documentElement.classList.add('dark')
      await tick()
    })
    expect(root.dataset.vuiTheme).toBe('dark')
    expect(root.firstElementChild).toBe(title)
  })
})
