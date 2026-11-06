import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startFeed } from '../../src/app/start.js'
import type { DocHeader } from '../../src/doc-header.js'

const header = (seq: number): DocHeader => ({
  seq,
  id: `${seq}-doc`,
  title: `Doc ${seq}`,
  createdAt: '2026-11-06T10:00:00.000Z',
  cwd: null,
  branch: null,
})

class FakeSource {
  static last: FakeSource
  readonly listeners = new Map<string, (event: { data: string }) => void>()
  constructor(readonly url: string) {
    FakeSource.last = this
  }
  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(type, listener)
  }
  close(): void {}
  emit(type: string, data = ''): void {
    this.listeners.get(type)?.({ data })
  }
}

const replies = new Map<string, { status: number; text: string }>()
const opened = vi.fn()
const scrollTo = vi.fn()

function stub(): void {
  vi.stubGlobal('EventSource', FakeSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const reply = replies.get(url.split('?')[0] as string) ?? {
        status: 200,
        text: JSON.stringify({ docs: [] }),
      }
      return {
        ok: reply.status === 200,
        status: reply.status,
        text: async () => reply.text,
        json: async () => JSON.parse(reply.text),
      }
    }),
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: () => undefined })),
  )
  vi.stubGlobal('open', opened)
  vi.stubGlobal('scrollTo', scrollTo)
}

const statusText = () => document.querySelector('[role="status"]')?.textContent
const entries = () => [...document.querySelectorAll('article')]
const settle = () => new Promise((done) => setTimeout(done))

function list(...seqs: number[]): void {
  replies.set('api/docs', { status: 200, text: JSON.stringify({ docs: seqs.map(header) }) })
  for (const seq of seqs) {
    replies.set(`api/docs/${seq}-doc`, {
      status: 200,
      text: JSON.stringify({ vui: 1, body: [`text ${seq}`, '[out](https://example.com/)'] }),
    })
  }
}

beforeEach(() => {
  stub()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.body.removeAttribute('class')
  replies.clear()
  opened.mockClear()
  scrollTo.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('startFeed', () => {
  it('injects one stylesheet and makes the page a vui-root, so the chrome shares the tokens', () => {
    startFeed(window)
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(document.head.querySelector('style')?.textContent).toContain('--vui-bg')
    expect(document.body.classList.contains('vui-root')).toBe(true)
    expect(document.body.dataset.vuiTheme).toBe('dark')
  })

  it('opens the event stream through a relative URL, under the token prefix', () => {
    startFeed(window)
    expect(FakeSource.last.url).toBe('api/events')
  })

  it('tells the reader the state of the connection', async () => {
    startFeed(window)
    expect(statusText()).toBe('Connecting…')
    FakeSource.last.emit('hello')
    await settle()
    expect(statusText()).toBe('Live')
  })

  it('says a stopped Viewer is gone (VD-114)', async () => {
    replies.set('api/docs', { status: 404, text: 'not found\n' })
    startFeed(window)
    FakeSource.last.emit('error')
    await settle()
    expect(statusText()).toBe('This Viewer has stopped. Run vui show to open a new feed.')
  })

  it('shows an empty state until the first entry', async () => {
    startFeed(window)
    const empty = document.querySelector('.feed-empty') as HTMLElement
    expect(empty.hidden).toBe(false)
    list(1)
    FakeSource.last.emit('hello')
    await settle()
    expect(empty.hidden).toBe(true)
  })

  it('appends in order, the newest last', async () => {
    list(1, 2)
    startFeed(window)
    FakeSource.last.emit('hello')
    await settle()
    FakeSource.last.emit('doc', JSON.stringify(header(3)))
    expect(entries().map((entry) => entry.querySelector('h2')?.textContent)).toEqual([
      'Doc 1',
      'Doc 2',
      'Doc 3',
    ])
  })

  it('opens only the last 10 of a batch', async () => {
    list(...Array.from({ length: 12 }, (_, index) => index + 1))
    startFeed(window)
    FakeSource.last.emit('hello')
    await settle()
    const folded = entries().map((entry) => entry.querySelector<HTMLElement>('.feed-body')?.hidden)
    expect(folded.filter(Boolean)).toHaveLength(2)
    expect(folded.slice(0, 2)).toEqual([true, true])
  })

  it('keeps the page at the bottom as entries and documents arrive', async () => {
    list(1)
    startFeed(window)
    FakeSource.last.emit('hello')
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
  })

  it('reads a document by its encoded id', async () => {
    replies.set('api/docs/a%2Fb', { status: 200, text: JSON.stringify({ vui: 1, body: ['deep'] }) })
    replies.set('api/docs', {
      status: 200,
      text: JSON.stringify({ docs: [{ ...header(1), id: 'a/b' }] }),
    })
    startFeed(window)
    FakeSource.last.emit('hello')
    const host = () => document.querySelector('.feed-body') as HTMLElement
    await vi.waitFor(() => expect(host().shadowRoot?.textContent).toContain('deep'))
  })

  it('reports a document it cannot read in the entry, not the status', async () => {
    replies.set('api/docs', { status: 200, text: JSON.stringify({ docs: [header(1)] }) })
    replies.set('api/docs/1-doc', { status: 404, text: 'not found\n' })
    startFeed(window)
    FakeSource.last.emit('hello')
    await vi.waitFor(() => expect(document.querySelector('.feed-note')).not.toBeNull())
    expect(statusText()).toBe('Live')
  })

  it('opens an outside link in a new tab with no opener', async () => {
    list(1)
    startFeed(window)
    FakeSource.last.emit('hello')
    const host = () => document.querySelector('.feed-body') as HTMLElement
    await vi.waitFor(() => expect(host().shadowRoot?.querySelector('a')).toBeTruthy())
    host().shadowRoot?.querySelector('a')?.click()
    expect(opened).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer')
  })
})

describe('the theme toggle', () => {
  const toggle = () => document.querySelector<HTMLButtonElement>('.feed-theme')

  it('offers the other theme and flips every root', async () => {
    list(1)
    startFeed(window)
    FakeSource.last.emit('hello')
    await settle()
    expect(toggle()?.textContent).toBe('Light theme')
    toggle()?.click()
    expect(document.documentElement.className).toBe('light')
    expect(document.body.dataset.vuiTheme).toBe('light')
    const root = document.querySelector('.feed-body')?.shadowRoot?.querySelector('.vui-root')
    expect(root?.getAttribute('data-vui-theme')).toBe('light')
    expect(toggle()?.textContent).toBe('Dark theme')
  })
})
