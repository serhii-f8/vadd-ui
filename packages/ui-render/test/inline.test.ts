import { type Formatted, parseInline, STATUSES } from '@vadd/ui-spec'
import { describe, expect, it, vi } from 'vitest'
import { renderInline, renderValue, statusBadge } from '../src/inline.js'

function host(nodes: Node[]): HTMLElement {
  const box = document.createElement('div')
  box.replaceChildren(...nodes)
  return box
}

const inline = (source: string, handler?: (url: string) => void) =>
  host(renderInline(parseInline(source), handler))

describe('renderInline', () => {
  it('draws the §5.5 subset as nodes', () => {
    const box = inline('**b** *i* `c` ~~s~~ [l](https://a.test/)')
    expect(box.querySelector('strong')?.textContent).toBe('b')
    expect(box.querySelector('em')?.textContent).toBe('i')
    expect(box.querySelector('code')?.textContent).toBe('c')
    expect(box.querySelector('s')?.textContent).toBe('s')
    const link = box.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://a.test/')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('leaves raw HTML as text', () => {
    const box = inline('<script>alert(1)</script><img src=x onerror=y>')
    expect(box.children).toHaveLength(0)
    expect(box.textContent).toContain('<script>')
  })

  it('leaves a bad scheme as text', () => {
    const box = inline('[x](javascript:alert(1))')
    expect(box.querySelector('a')).toBeNull()
    expect(box.textContent).toContain('javascript:')
  })

  it('sends a clicked link to the handler instead of navigating', () => {
    const handler = vi.fn()
    const link = inline('[l](https://a.test/)', handler).querySelector('a') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(handler).toHaveBeenCalledWith('https://a.test/')
    expect(event.defaultPrevented).toBe(true)
  })

  it('survives a throwing handler', () => {
    const link = inline('[l](https://a.test/)', () => {
      throw new Error('host')
    }).querySelector('a') as HTMLAnchorElement
    expect(() => link.click()).not.toThrow()
  })

  it('keeps in-document links native', () => {
    const handler = vi.fn()
    const link = inline('[l](#part)', handler).querySelector('a') as HTMLAnchorElement
    link.addEventListener('click', (event) => event.preventDefault())
    link.click()
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('statusBadge', () => {
  it.each(STATUSES)('%s has an icon and a text label', (status) => {
    const badge = statusBadge(status)
    expect(badge.querySelector('.vui-status-icon')?.getAttribute('aria-hidden')).toBe('true')
    expect(badge.querySelector('.vui-status-icon')?.textContent).not.toBe('')
    expect(badge.querySelector('.vui-status-label')?.textContent).toBe(status)
  })

  it('uses the tone of the status', () => {
    expect(statusBadge('fail').classList.contains('vui-tone-err')).toBe(true)
  })
})

describe('renderValue', () => {
  const value = (formatted: Formatted) => host(renderValue(formatted))

  it('draws plain text', () => {
    expect(value({ text: '1,234' }).textContent).toBe('1,234')
  })

  it('applies tone', () => {
    expect(value({ text: 'x', tone: 'ok' }).querySelector('.vui-tone-ok')?.textContent).toBe('x')
  })

  it('applies mono', () => {
    expect(value({ text: 'x', mono: true }).querySelector('code')?.textContent).toBe('x')
  })

  it('shows the full value as a title', () => {
    expect(value({ text: 'x…', title: 'xyz' }).querySelector('[title]')?.getAttribute('title')).toBe(
      'xyz',
    )
  })

  it('emphasizes the path base', () => {
    const box = value({ text: 'src/a.ts', mono: true, base: 'a.ts' })
    expect(box.textContent).toBe('src/a.ts')
    expect(box.querySelector('.vui-path-base')?.textContent).toBe('a.ts')
  })

  it('makes a link from href', () => {
    const box = value({ text: 'site', href: 'https://a.test/' })
    expect(box.querySelector('a')?.getAttribute('href')).toBe('https://a.test/')
  })

  it('draws status as a badge', () => {
    const box = value({ text: 'ok', status: 'ok' })
    expect(box.querySelector('.vui-status-label')?.textContent).toBe('ok')
  })

  it('prefers parsed inline text', () => {
    const box = value({ text: 'b', inline: parseInline('**b**') })
    expect(box.querySelector('strong')?.textContent).toBe('b')
  })
})
