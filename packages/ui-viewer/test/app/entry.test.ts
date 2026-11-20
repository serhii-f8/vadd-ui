import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEntry, type EntryOptions, shortPath } from '../../src/app/entry.js'
import type { DocHeader } from '../../src/doc-header.js'

const ATTACK = '<img src=x onerror=window.pwned=1>'
const DOC = JSON.stringify({ vui: 1, title: 'Report', body: ['hello'] })

const header: DocHeader = {
  seq: 7,
  id: '7-report',
  title: 'Report',
  createdAt: '2026-11-06T10:00:00.000Z',
  cwd: '/work/app',
  branch: 'feature/x',
}

function setup(overrides: Partial<DocHeader> = {}, options: Partial<EntryOptions> = {}) {
  const load = vi.fn(async (_id: string) => DOC)
  const onGrow = vi.fn()
  const track = vi.fn((root: HTMLElement) => {
    root.setAttribute('data-vui-theme', 'dark')
    return () => undefined
  })
  const openLink = vi.fn()
  const entry = createEntry(
    { ...header, ...overrides },
    { open: true, load, onGrow, track, openLink, ...options },
  )
  document.body.append(entry)
  const button = (name: string) =>
    [...entry.querySelectorAll('button')].find(({ textContent }) => textContent === name) as
      | HTMLButtonElement
      | undefined
  const body = entry.querySelector('.feed-body') as HTMLElement
  return { entry, body, load, onGrow, track, openLink, button }
}

const settle = () => new Promise((done) => setTimeout(done))

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('header', () => {
  it('shows the title, time, branch and cwd', () => {
    const { entry } = setup()
    expect(entry.querySelector('h2')?.textContent).toBe('Report')
    expect(entry.querySelector('time')?.getAttribute('datetime')).toBe(header.createdAt)
    expect(entry.querySelector('time')?.textContent).not.toBe('')
    expect(entry.querySelector('.feed-branch')?.textContent).toBe('feature/x')
    expect(entry.querySelector('.feed-cwd')?.textContent).toBe('/work/app')
  })

  it('shortens a deep cwd to its last two segments, with the whole path in its title (VD-194)', () => {
    const { entry } = setup({ cwd: '/home/u/work/apps/web' })
    const cwd = entry.querySelector('.feed-cwd')
    expect(cwd?.textContent).toBe('apps/web')
    expect(cwd?.getAttribute('title')).toBe('/home/u/work/apps/web')
  })

  it('keeps the whole branch in its title, since one meta line may cut it', () => {
    const { entry } = setup()
    expect(entry.querySelector('.feed-branch')?.getAttribute('title')).toBe('feature/x')
  })

  it('keeps title, meta and actions in reading order', () => {
    const { entry } = setup()
    const head = entry.querySelector('.feed-head') as HTMLElement
    expect([...head.children].map((child) => child.className)).toEqual([
      'feed-title',
      'feed-meta',
      'feed-actions',
    ])
  })

  it('names itself by its heading, so its identical buttons have context', () => {
    const { entry } = setup()
    const label = entry.getAttribute('aria-labelledby') as string
    expect(document.getElementById(label)?.textContent).toBe('Report')
  })

  it('leaves out what a header does not have', () => {
    const { entry } = setup({ title: null, cwd: null, branch: null })
    expect(entry.querySelector('h2')?.textContent).toBe('Untitled')
    expect(entry.querySelector('.feed-branch')).toBeNull()
    expect(entry.querySelector('.feed-cwd')).toBeNull()
  })

  it('prints a time it cannot read as it came, with no datetime', () => {
    const { entry } = setup({ createdAt: 'soon' })
    expect(entry.querySelector('time')?.textContent).toBe('soon')
    expect(entry.querySelector('time')?.hasAttribute('datetime')).toBe(false)
  })

  it('keeps hostile fields as text', () => {
    const { entry } = setup({ title: ATTACK, cwd: ATTACK, branch: ATTACK, createdAt: ATTACK })
    expect(entry.querySelector('h2')?.textContent).toBe(ATTACK)
    expect(entry.querySelector('.feed-cwd')?.textContent).toBe(ATTACK)
    expect(entry.querySelector('.feed-branch')?.textContent).toBe(ATTACK)
    expect(entry.querySelector('img')).toBeNull()
  })
})

describe('open standalone', () => {
  it('links the standalone file in a new tab that gets no opener', () => {
    const { entry } = setup()
    const link = entry.querySelector('a') as HTMLAnchorElement
    expect(link.textContent).toBe('Open standalone')
    expect(link.getAttribute('href')).toBe('docs/7-report.html')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('encodes an id, so it stays one relative path segment', () => {
    const { entry } = setup({ id: 'javascript:alert(1)/../x' })
    expect(entry.querySelector('a')?.getAttribute('href')).toBe(
      'docs/javascript%3Aalert(1)%2F..%2Fx.html',
    )
  })
})

describe('body', () => {
  it('renders the document in its own open shadow root', async () => {
    const { body, load, track } = setup()
    await settle()
    expect(load).toHaveBeenCalledWith('7-report')
    const root = body.shadowRoot?.querySelector('.vui-root') as HTMLElement
    expect(root.textContent).toContain('hello')
    expect(root.dataset.vuiTheme).toBe('dark')
    expect(track).toHaveBeenCalledWith(root)
    expect(body.shadowRoot?.querySelector('style')?.textContent).toContain('.vui-root')
  })

  it('leaves the title to the entry, so it does not print twice', async () => {
    const { body } = setup()
    await settle()
    const css = body.shadowRoot?.querySelector('style')?.textContent
    expect(css).toContain('.vui-title{display:none}')
    expect(css).toContain('.vui-header:not(:has(.vui-subtitle)){display:none}')
  })

  it('reports growth, once the document is in', async () => {
    const { onGrow } = setup()
    await settle()
    expect(onGrow).toHaveBeenCalledTimes(1)
  })

  it('tells assistive technology about a failed load (§15.2)', async () => {
    const { entry } = setup({}, { load: () => Promise.reject(new Error('404')) })
    await settle()
    expect(entry.querySelector('.feed-note')?.getAttribute('role')).toBe('alert')
  })

  it('drops the failure note when folded', async () => {
    const { entry, button } = setup({}, { load: () => Promise.reject(new Error('404')) })
    await settle()
    button('Fold')?.click()
    expect(entry.querySelector('.feed-note')).toBeNull()
  })

  it('says so when a load fails, and tries again on the next open', async () => {
    const load = vi.fn<(id: string) => Promise<string>>()
    load.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(DOC)
    const { entry, body, button } = setup({}, { load })
    await settle()
    expect(entry.querySelector('.feed-note')?.textContent).toBe(
      'This document could not be loaded.',
    )
    button('Fold')?.click()
    button('Unfold')?.click()
    await settle()
    expect(entry.querySelector('.feed-note')).toBeNull()
    expect(body.shadowRoot?.textContent).toContain('hello')
  })
})

describe('fold', () => {
  it('starts folded when told to, without fetching anything', () => {
    const { body, load, button } = setup({}, { open: false })
    expect(body.hidden).toBe(true)
    expect(load).not.toHaveBeenCalled()
    expect(button('Unfold')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('loads on the first open and only then', async () => {
    const { body, load, button } = setup({}, { open: false })
    button('Unfold')?.click()
    await settle()
    expect(body.hidden).toBe(false)
    expect(button('Fold')?.getAttribute('aria-expanded')).toBe('true')
    button('Fold')?.click()
    expect(body.hidden).toBe(true)
    button('Unfold')?.click()
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shows a drawn document again with no second draw', async () => {
    const { entry, body, button } = setup()
    await settle()
    const root = body.shadowRoot?.querySelector('.vui-root')
    button('Fold')?.click()
    button('Unfold')?.click()
    await settle()
    expect(entry.querySelector('.feed-note')).toBeNull()
    expect(body.shadowRoot?.querySelector('.vui-root')).toBe(root)
  })

  it('leaves the page alone when the reader opens an old entry', async () => {
    const { onGrow, body, button } = setup({}, { open: false })
    button('Unfold')?.click()
    await settle()
    expect(body.shadowRoot?.textContent).toContain('hello')
    expect(onGrow).not.toHaveBeenCalled()
  })

  it('does not load twice when opened again before the first load ends', async () => {
    const { load, button } = setup({}, { open: false })
    button('Unfold')?.click()
    button('Fold')?.click()
    button('Unfold')?.click()
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('copy spec', () => {
  it('writes the stored document', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { button } = setup()
    await settle()
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(button('Copied')).toBeDefined())
    expect(writeText).toHaveBeenCalledWith(DOC)
  })

  it('reads a folded document first', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { button, load } = setup({}, { open: false })
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(DOC))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('falls back to a copy event with the exact text (§9.3)', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    })
    const setData = vi.fn()
    const copyEvent = () => {
      const event = new Event('copy', { cancelable: true })
      Object.assign(event, { clipboardData: { setData } })
      document.dispatchEvent(event)
      return event
    }
    let fired: Event | undefined
    document.execCommand = vi.fn(() => {
      fired = copyEvent()
      return true
    })
    const { button } = setup()
    await settle()
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(button('Copied')).toBeDefined())
    expect(setData).toHaveBeenCalledWith('text/plain', DOC)
    expect(fired?.defaultPrevented).toBe(true)
    // A reader's own copy later must not be replaced by this document.
    expect(copyEvent().defaultPrevented).toBe(false)
  })

  it('says so when both ways fail', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => false)
    const { button } = setup()
    await settle()
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(button('Copy failed')).toBeDefined())
  })

  it('says so when the fallback throws', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => {
      throw new Error('blocked')
    })
    const { button } = setup()
    await settle()
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(button('Copy failed')).toBeDefined())
  })

  it('says so when the document cannot be read', async () => {
    const { button } = setup({}, { open: false, load: () => Promise.reject(new Error('gone')) })
    button('Copy spec')?.click()
    await vi.waitFor(() => expect(button('Copy failed')).toBeDefined())
  })

  it('is a polite live region, like the copy button of a code block (§15.2)', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined } })
    const { button } = setup()
    await settle()
    expect(button('Copy spec')?.getAttribute('aria-live')).toBe('polite')
  })

  it('holds a repeated result for its full time', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined } })
    const { button } = setup()
    await vi.advanceTimersByTimeAsync(0)
    button('Copy spec')?.click()
    await vi.advanceTimersByTimeAsync(1500)
    button('Copied')?.click()
    await vi.advanceTimersByTimeAsync(1000)
    expect(button('Copied')).toBeDefined()
  })

  it('goes back to its label', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined } })
    const { button } = setup()
    await vi.advanceTimersByTimeAsync(0)
    button('Copy spec')?.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(button('Copied')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(button('Copy spec')).toBeDefined()
  })
})

describe('links in a document', () => {
  const LINKS = JSON.stringify({
    vui: 1,
    body: [
      '[out](https://example.com/a) and [in](#target) and [odd](#a%20b) and [lost](#nowhere)',
      { type: 'callout', id: 'target', text: 'here' },
      { type: 'callout', id: 'a b', text: 'spaced' },
    ],
  })

  async function links() {
    const made = setup({}, { load: async () => LINKS })
    await settle()
    const root = made.body.shadowRoot as ShadowRoot
    const click = (text: string) => {
      const link = [...root.querySelectorAll('a')].find((item) => item.textContent === text)
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link?.dispatchEvent(event)
      return event
    }
    return { ...made, root, click }
  }

  it('opens an outside link through the host, so the feed stays', async () => {
    const { click, openLink } = await links()
    click('out')
    expect(openLink).toHaveBeenCalledWith('https://example.com/a')
  })

  it('scrolls to a #id inside this shadow root, which the browser will not do (VD-100)', async () => {
    const { click, root } = await links()
    const target = root.getElementById('target') as HTMLElement
    target.scrollIntoView = vi.fn()
    expect(click('in').defaultPrevented).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalled()
  })

  it('finds a target by its decoded name too', async () => {
    const { click, root } = await links()
    const target = root.getElementById('a b') as HTMLElement
    target.scrollIntoView = vi.fn()
    click('odd')
    expect(target.scrollIntoView).toHaveBeenCalled()
  })

  it('survives a #id with no target', async () => {
    const { click } = await links()
    expect(click('lost').defaultPrevented).toBe(true)
  })
})

describe('shortPath (VD-194)', () => {
  it.each([
    ['/home/u/work/apps/web', 'apps/web'],
    ['/home/u/work/apps/web/', 'apps/web'],
    ['C:\\Users\\u\\src\\vadd', 'src\\vadd'],
    ['\\\\wsl.localhost\\Ubuntu\\home\\u', 'home\\u'],
    ['/work/app', '/work/app'],
    ['/proj', '/proj'],
    ['/', '/'],
    ['', ''],
    ['relative/a/b', 'a/b'],
  ])('shows %j as %j', (path, short) => {
    expect(shortPath(path)).toBe(short)
  })
})
