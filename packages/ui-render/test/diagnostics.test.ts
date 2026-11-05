import type { Diagnostic } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { diagnosticsView, MAX_SHOWN } from '../src/diagnostics.js'

const warn: Diagnostic = {
  severity: 'warn',
  path: '/body/0',
  code: 'bad-enum',
  message: 'bad <b>value</b>',
  hint: 'did you mean "ok"?',
}
const error: Diagnostic = { severity: 'error', path: '/x', code: 'missing-field', message: 'gone' }
const info: Diagnostic = { severity: 'info', path: '/y', code: 'unknown-field', message: 'extra' }

describe('diagnosticsView', () => {
  it('shows nothing when hidden', () => {
    expect(diagnosticsView([warn, error], 'hidden', new Map())).toBeNull()
  })

  it('stays silent on info alone (§13.3)', () => {
    expect(diagnosticsView([info], 'badge', new Map())).toBeNull()
    expect(diagnosticsView([info], 'panel', new Map())).toBeNull()
    expect(diagnosticsView([], 'badge', new Map())).toBeNull()
  })

  it('counts by severity on a collapsed badge', () => {
    const view = diagnosticsView([warn, warn, error, info], 'badge', new Map()) as HTMLElement
    const button = view.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toContain('1 error')
    expect(button.textContent).toContain('2 warnings')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(view.querySelector('ul')?.hidden).toBe(true)
  })

  it('opens the panel, and remembers it', () => {
    const state = new Map<string, unknown>()
    const view = diagnosticsView([warn], 'badge', state) as HTMLElement
    view.querySelector('button')?.click()
    expect(view.querySelector('ul')?.hidden).toBe(false)
    expect(view.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
    const again = diagnosticsView([warn], 'badge', state) as HTMLElement
    expect(again.querySelector('ul')?.hidden).toBe(false)
  })

  it('lists path, code, message and hint as text', () => {
    const view = diagnosticsView([warn], 'panel', new Map()) as HTMLElement
    expect(view.querySelector('button')).toBeNull()
    const item = view.querySelector('li') as HTMLElement
    expect(item.textContent).toContain('/body/0')
    expect(item.textContent).toContain('bad-enum')
    expect(item.textContent).toContain('bad <b>value</b>')
    expect(item.textContent).toContain('did you mean')
    expect(item.querySelector('b')).toBeNull()
  })

  it('names the root path and bounds the list', () => {
    const many = Array.from({ length: MAX_SHOWN + 5 }, () => ({ ...error, path: '' }))
    const view = diagnosticsView(many, 'panel', new Map()) as HTMLElement
    expect(view.querySelectorAll('.vui-diagnostic')).toHaveLength(MAX_SHOWN)
    expect(view.textContent).toContain('and 5 more')
    expect(view.querySelector('.vui-diagnostic-path')?.textContent).toBe('/')
  })
})
