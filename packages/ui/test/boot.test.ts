import { pageCss, stylesheet } from '@vadd/ui-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boot, start } from '../src/boot.js'

const GOOD = '{ vui: 1, body: [{ type: "md", text: "hello" }] }'

function embed(text: string, parent: HTMLElement = document.body): HTMLScriptElement {
  const script = document.createElement('script')
  script.type = 'application/vui+json'
  script.textContent = text
  parent.append(script)
  return script
}

const roots = () => [...document.querySelectorAll<HTMLElement>('.vui-root')]
const styles = () => document.querySelectorAll('style#vui-style')

function setReadyState(state: DocumentReadyState) {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state)
}

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('boot', () => {
  it('mounts a sibling root right after each document, in order', () => {
    const first = embed(GOOD)
    const second = embed('{ vui: 1, body: [{ type: "md", text: "two" }] }')
    boot()
    expect(first.nextElementSibling).toBe(roots()[0])
    expect(second.nextElementSibling).toBe(roots()[1])
    expect(roots().map((root) => root.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('hello'), expect.stringContaining('two')]),
    )
  })

  it('leaves other script types alone', () => {
    const other = document.createElement('script')
    other.type = 'application/json'
    other.textContent = GOOD
    document.body.append(other)
    boot()
    expect(roots()).toHaveLength(0)
  })

  it('injects one stylesheet for many documents, the page rules last', () => {
    embed(GOOD)
    embed(GOOD)
    boot()
    expect(styles()).toHaveLength(1)
    expect(document.head.querySelector('#vui-style')?.textContent).toBe(stylesheet + pageCss)
  })

  it('injects the stylesheet with no document, for manual render', () => {
    boot()
    expect(styles()).toHaveLength(1)
  })

  it('keeps a stylesheet that is already there', () => {
    const own = document.createElement('style')
    own.id = 'vui-style'
    own.textContent = 'a{}'
    document.head.append(own)
    boot()
    expect(styles()).toHaveLength(1)
    expect(own.textContent).toBe('a{}')
  })

  it('adds nothing on a second run, as with two copies of the bundle', () => {
    embed(GOOD)
    embed(GOOD)
    boot()
    boot()
    expect(roots()).toHaveLength(2)
    expect(styles()).toHaveLength(1)
  })

  it('mounts a document from <head> in <body>, in order: §10.2 has no body tag', () => {
    embed(GOOD, document.head)
    embed('{ vui: 1, body: [{ type: "md", text: "two" }] }', document.head)
    boot()
    expect(document.head.querySelector('.vui-root')).toBeNull()
    expect(roots()).toHaveLength(2)
    expect(roots().every((root) => root.parentElement === document.body)).toBe(true)
    expect(roots()[0]?.textContent).toContain('hello')
    expect(roots()[1]?.textContent).toContain('two')
  })

  it('keeps source order when a <head> document precedes body content', () => {
    embed('{ vui: 1, body: [{ type: "md", text: "first" }] }', document.head)
    const between = document.createElement('h2')
    document.body.append(between)
    const second = embed('{ vui: 1, body: [{ type: "md", text: "second" }] }')
    boot()
    const order = [...document.body.children]
    expect(order[0]?.textContent).toContain('first')
    expect(order[1]).toBe(between)
    expect(order[2]).toBe(second)
    expect(order[3]?.textContent).toContain('second')
  })

  it('leaves a painted page alone: a root background would stop body propagating', () => {
    const style = document.createElement('style')
    style.textContent = 'body{background:rgb(0, 0, 200)}'
    document.head.append(style)
    boot()
    expect(document.querySelector('#vui-style')?.textContent).toBe(stylesheet)
  })

  it('does not mount a <head> document twice', () => {
    embed(GOOD, document.head)
    boot()
    boot()
    expect(roots()).toHaveLength(1)
  })

  it('shows the parse message and the raw input for a broken document', () => {
    embed('{ vui: 1, body: [')
    boot()
    const card = roots()[0]?.querySelector('.vui-card-error')
    expect(card?.textContent).toContain('Could not read this document')
    expect(card?.querySelector('.vui-card-detail')?.textContent).toMatch(/\S/)
    expect(card?.querySelector('pre')?.textContent).toBe('{ vui: 1, body: [')
  })

  it('shows at most the first 40 lines of raw input', () => {
    const lines = Array.from({ length: 41 }, (_, index) => `line ${index + 1}`)
    embed(lines.join('\n'))
    boot()
    const raw = roots()[0]?.querySelector('pre')?.textContent ?? ''
    expect(raw).toContain('line 40')
    expect(raw).not.toContain('line 41')
  })

  it('draws an error card for an empty script', () => {
    embed('')
    boot()
    expect(roots()[0]?.querySelector('.vui-card-error')?.textContent).toContain(
      'Could not read this document',
    )
  })

  it('keeps raw input as text', () => {
    embed('</div><img src=x onerror=alert(1)>')
    boot()
    const root = roots()[0] as HTMLElement
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('pre')?.textContent).toContain('onerror')
  })

  it('still renders the good document beside a broken one', () => {
    embed('nonsense')
    embed(GOOD)
    embed('')
    boot()
    expect(roots()).toHaveLength(3)
    expect(roots()[0]?.querySelector('.vui-card-error')).not.toBeNull()
    expect(roots()[1]?.textContent).toContain('hello')
    expect(roots()[1]?.querySelector('.vui-card-error')).toBeNull()
    expect(roots()[2]?.querySelector('.vui-card-error')).not.toBeNull()
  })
})

describe('start', () => {
  it('boots at once when the document is past loading', () => {
    setReadyState('interactive')
    const add = vi.spyOn(document, 'addEventListener')
    embed(GOOD)
    start()
    expect(roots()).toHaveLength(1)
    expect(add).not.toHaveBeenCalled()
  })

  it('waits for DOMContentLoaded while loading, with its only listener', () => {
    setReadyState('loading')
    const add = vi.spyOn(document, 'addEventListener')
    const addOnWindow = vi.spyOn(window, 'addEventListener')
    embed(GOOD)
    start()
    expect(roots()).toHaveLength(0)
    expect(add.mock.calls.map(([type]) => type)).toEqual(['DOMContentLoaded'])
    expect(addOnWindow).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(roots()).toHaveLength(1)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(roots()).toHaveLength(1)
  })
})
