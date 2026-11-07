import { describe, expect, it, vi } from 'vitest'
import { resolveTheme, watchTheme } from '../src/theme.js'

function media(initial: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches: initial,
    addEventListener: (_: 'change', listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_: 'change', listener: () => void) => {
      listeners.delete(listener)
    },
    fire(next: boolean) {
      this.matches = next
      for (const listener of listeners) listener()
    },
    listeners,
  }
}

function html(className = ''): HTMLElement {
  const element = document.createElement('html')
  // No attribute at all unless asked: `class=""` has a meaning of its own.
  if (className !== '') element.className = className
  return element
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('resolveTheme', () => {
  it('takes an explicit theme over everything', () => {
    expect(resolveTheme('light', html('dark'), media(true))).toBe('light')
    expect(resolveTheme('dark', html('light'), media(false))).toBe('dark')
  })

  it('reads .dark and .light on <html> under auto', () => {
    expect(resolveTheme('auto', html('dark'), media(false))).toBe('dark')
    expect(resolveTheme('auto', html('light'), media(true))).toBe('light')
  })

  it('reads an empty class on <html> as light, as the stylesheet does (VD-058)', () => {
    // VADD's ThemeProvider removes `dark` with `classList.toggle`, which leaves `class=""`.
    const root = html('dark')
    root.classList.toggle('dark', false)
    expect(root.getAttribute('class')).toBe('')
    expect(resolveTheme('auto', root, media(true))).toBe('light')
  })

  it('follows the OS beside other classes on <html>', () => {
    expect(resolveTheme('auto', html('app'), media(true))).toBe('dark')
  })

  it('falls back to the OS, and to light with no matchMedia', () => {
    expect(resolveTheme('auto', html(), media(true))).toBe('dark')
    expect(resolveTheme('auto', html(), media(false))).toBe('light')
    expect(resolveTheme('auto', html(), undefined)).toBe('light')
  })
})

describe('watchTheme', () => {
  it('applies at once, then on a class change and an OS change, until stopped', async () => {
    const root = html()
    const os = media(false)
    const apply = vi.fn()
    const stop = watchTheme('auto', root, os, apply)
    expect(apply).toHaveBeenLastCalledWith('light')
    root.classList.add('dark')
    await tick()
    expect(apply).toHaveBeenLastCalledWith('dark')
    root.classList.remove('dark')
    await tick()
    expect(apply).toHaveBeenLastCalledWith('light')
    root.removeAttribute('class')
    await tick()
    os.fire(true)
    expect(apply).toHaveBeenLastCalledWith('dark')
    stop()
    expect(os.listeners.size).toBe(0)
    const calls = apply.mock.calls.length
    root.classList.add('light')
    os.fire(false)
    await tick()
    expect(apply.mock.calls.length).toBe(calls)
  })

  it('applies an explicit theme once and watches nothing', async () => {
    const root = html()
    const os = media(false)
    const apply = vi.fn()
    const stop = watchTheme('dark', root, os, apply)
    root.classList.add('light')
    os.fire(true)
    await tick()
    expect(apply.mock.calls).toEqual([['dark']])
    expect(os.listeners.size).toBe(0)
    stop()
  })

  it('works with no matchMedia at all', async () => {
    const root = html()
    const apply = vi.fn()
    const stop = watchTheme('auto', root, undefined, apply)
    root.classList.add('dark')
    await tick()
    expect(apply).toHaveBeenLastCalledWith('dark')
    stop()
  })
})
