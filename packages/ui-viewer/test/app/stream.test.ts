import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceLike, Status } from '../../src/app/stream.js'
import { startStream } from '../../src/app/stream.js'
import type { DocHeader } from '../../src/doc-header.js'

const header = (seq: number): DocHeader => ({
  seq,
  id: `${seq}-doc`,
  title: `Doc ${seq}`,
  createdAt: '2026-11-06T10:00:00.000Z',
  cwd: null,
  branch: null,
})

class FakeSource implements SourceLike {
  closed = false
  readonly listeners = new Map<string, (event: { data: string }) => void>()
  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(type, listener)
  }
  close(): void {
    this.closed = true
  }
  emit(type: string, data = ''): void {
    this.listeners.get(type)?.({ data })
  }
}

type Reply = { status: number; body?: unknown } | 'network'

function setup() {
  const sources: FakeSource[] = []
  const urls: string[] = []
  const delivered: DocHeader[][] = []
  const updated: DocHeader[] = []
  const statuses: Status[] = []
  const replies: (Reply | Promise<Reply>)[] = []
  const fetcher = async (url: string) => {
    urls.push(url)
    const reply = await (replies.shift() ?? { status: 200, body: { docs: [] } })
    if (reply === 'network') throw new TypeError('network')
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    }
  }
  const stream = startStream({
    open: () => {
      const source = new FakeSource()
      sources.push(source)
      return source
    },
    fetch: fetcher,
    onDocs: (docs) => delivered.push(docs),
    onUpdate: (doc) => updated.push(doc),
    onStatus: (status) => statuses.push(status),
  })
  const last = () => sources[sources.length - 1] as FakeSource
  const seqs = () => delivered.flat().map(({ seq }) => seq)
  return { sources, urls, delivered, updated, statuses, replies, stream, last, seqs }
}

const docs = (...seqs: number[]) => ({ status: 200, body: { docs: seqs.map(header) } })
const settle = () => vi.advanceTimersByTimeAsync(0)
const fullPage = () => docs(...Array.from({ length: 500 }, (_, i) => i + 1))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('updates (--replace)', () => {
  it('passes an update of a shown entry on, and moves no seq', async () => {
    const { last, updated, seqs, replies } = setup()
    replies.push(docs(1, 2))
    last().emit('hello')
    await settle()
    last().emit('update', JSON.stringify({ ...header(1), title: 'New' }))
    expect(updated.map(({ title }) => title)).toEqual(['New'])
    last().emit('doc', JSON.stringify(header(3)))
    expect(seqs()).toEqual([1, 2, 3])
  })

  it('leaves an update of an entry not yet shown to the fill, and skips a bad one', async () => {
    const { last, updated } = setup()
    last().emit('hello')
    await settle()
    last().emit('update', JSON.stringify(header(5)))
    last().emit('update', 'not json')
    expect(updated).toEqual([])
  })
})

describe('first connection', () => {
  it('opens the stream and reads nothing until hello proves it is registered (VD-118)', async () => {
    const { sources, urls, last } = setup()
    await settle()
    expect(sources).toHaveLength(1)
    expect(urls).toEqual([])
    last().emit('hello')
    await settle()
    expect(urls).toEqual(['api/docs?after=0&limit=500'])
  })

  it('delivers the stored documents in one batch and goes live', async () => {
    const { replies, last, delivered, statuses } = setup()
    replies.push(docs(1, 2))
    last().emit('hello')
    await settle()
    expect(delivered).toEqual([[header(1), header(2)]])
    expect(statuses).toEqual(['connecting', 'live'])
  })

  it('reads every page, a full one meaning there may be more', async () => {
    const { replies, last, urls, seqs } = setup()
    replies.push(fullPage(), docs(501))
    last().emit('hello')
    await settle()
    expect(urls).toEqual(['api/docs?after=0&limit=500', 'api/docs?after=500&limit=500'])
    expect(seqs()).toHaveLength(501)
  })
})

describe('live documents', () => {
  it('delivers a doc event as it arrives', async () => {
    const { last, seqs } = setup()
    last().emit('hello')
    await settle()
    last().emit('doc', JSON.stringify(header(1)))
    expect(seqs()).toEqual([1])
  })

  it('drops a seq it already has, which is how a replay and a fill overlap (VD-118)', async () => {
    const { replies, last, seqs } = setup()
    replies.push(docs(1, 2))
    last().emit('hello')
    await settle()
    last().emit('doc', JSON.stringify(header(2)))
    last().emit('doc', JSON.stringify(header(1)))
    expect(seqs()).toEqual([1, 2])
  })

  it('reads again rather than deliver a doc that arrived during a fill', async () => {
    const { replies, last, urls, seqs } = setup()
    let release: (reply: Reply) => void = () => undefined
    replies.push(new Promise<Reply>((resolve) => (release = resolve)), docs(3))
    last().emit('hello')
    await settle()
    last().emit('doc', JSON.stringify(header(3)))
    expect(seqs()).toEqual([])
    release(docs(1, 2))
    await settle()
    expect(seqs()).toEqual([1, 2, 3])
    expect(urls[1]).toBe('api/docs?after=2&limit=500')
  })

  it('ignores a malformed doc event', async () => {
    const { last, seqs } = setup()
    last().emit('hello')
    await settle()
    last().emit('doc', 'not json')
    last().emit('doc', '{"seq":"1"}')
    expect(seqs()).toEqual([])
  })
})

describe('losing the stream', () => {
  it('closes the source itself, so the browser does not reconnect without backoff', async () => {
    const { last, statuses } = setup()
    const first = last()
    first.emit('error')
    await settle()
    expect(first.closed).toBe(true)
    expect(statuses).toEqual(['connecting', 'reconnecting'])
  })

  it('fills the gap after a reconnect with after=<lastSeq>', async () => {
    const { replies, last, urls, seqs, sources } = setup()
    replies.push(docs(1, 2))
    last().emit('hello')
    await settle()
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(2)
    replies.push(docs(3, 4))
    last().emit('hello')
    await settle()
    expect(urls.at(-1)).toBe('api/docs?after=2&limit=500')
    expect(seqs()).toEqual([1, 2, 3, 4])
  })

  it('backs off 1, 2, 4, 8, 16 and then 30 seconds', async () => {
    const { last, sources } = setup()
    for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      last().emit('error')
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(sources).toHaveLength(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(sources).toHaveLength(index + 2)
    }
  })

  it('starts the backoff again after a completed fill', async () => {
    const { last, sources } = setup()
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    last().emit('error')
    await vi.advanceTimersByTimeAsync(2000)
    last().emit('hello')
    await settle()
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(4)
  })

  it('keeps retrying when nothing answers, since that does not prove the token died', async () => {
    const { replies, last, sources, statuses } = setup()
    replies.push('network', 'network')
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    last().emit('error')
    await vi.advanceTimersByTimeAsync(2000)
    expect(sources).toHaveLength(3)
    expect(statuses).not.toContain('gone')
  })

  it('ignores everything a replaced source still sends', async () => {
    const { last, sources, urls, seqs, statuses } = setup()
    const first = last()
    first.emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(2)
    const asked = urls.length
    const told = statuses.length
    first.emit('hello')
    first.emit('doc', JSON.stringify(header(1)))
    first.emit('error')
    await vi.advanceTimersByTimeAsync(5000)
    expect(urls).toHaveLength(asked)
    expect(statuses).toHaveLength(told)
    expect(seqs()).toEqual([])
    expect(sources).toHaveLength(2)
  })
})

describe('a failing fill', () => {
  it('treats a failed read as a lost stream, keeping lastSeq for the retry', async () => {
    const { replies, last, urls, seqs } = setup()
    replies.push(docs(1))
    last().emit('hello')
    await settle()
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    replies.push({ status: 500 })
    last().emit('hello')
    await settle()
    expect(last().closed).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    last().emit('hello')
    await settle()
    expect(urls.at(-1)).toBe('api/docs?after=1&limit=500')
    expect(seqs()).toEqual([1])
  })

  it('leaves no hole when a page fails while live events arrive', async () => {
    const { replies, last, urls, seqs } = setup()
    replies.push(fullPage(), new Promise<Reply>(() => undefined))
    last().emit('hello')
    await settle()
    last().emit('doc', JSON.stringify(header(600)))
    expect(seqs()).toHaveLength(500)
    last().emit('error')
    await vi.advanceTimersByTimeAsync(1000)
    last().emit('hello')
    await settle()
    expect(urls.at(-1)).toBe('api/docs?after=500&limit=500')
  })

  it('counts a 200 of the wrong shape as a failure', async () => {
    const { replies, last, statuses } = setup()
    replies.push({ status: 200, body: { nope: true } })
    last().emit('hello')
    await settle()
    expect(statuses.at(-1)).toBe('reconnecting')
  })

  it('counts a malformed header in a page as a failure', async () => {
    const { replies, last, statuses, seqs } = setup()
    replies.push({ status: 200, body: { docs: [{ seq: 'one' }] } })
    last().emit('hello')
    await settle()
    expect(statuses.at(-1)).toBe('reconnecting')
    expect(seqs()).toEqual([])
  })

  it('stops a fill whose stream was replaced', async () => {
    const { replies, last, seqs } = setup()
    let release: (reply: Reply) => void = () => undefined
    replies.push(new Promise<Reply>((resolve) => (release = resolve)))
    last().emit('hello')
    await settle()
    last().emit('error')
    await settle()
    release(docs(1))
    await settle()
    expect(seqs()).toEqual([])
  })
})

describe('a Viewer that stops answering', () => {
  const hang = () => new Promise<Reply>(() => undefined)

  it('gives up on a read that never ends, and reconnects', async () => {
    const { replies, last, sources, statuses } = setup()
    replies.push(hang())
    last().emit('hello')
    await vi.advanceTimersByTimeAsync(9_999)
    expect(statuses.at(-1)).toBe('connecting')
    await vi.advanceTimersByTimeAsync(1)
    expect(statuses.at(-1)).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(2)
  })

  it('reconnects after a probe that never ends', async () => {
    const { replies, last, sources } = setup()
    replies.push(hang())
    last().emit('error')
    await vi.advanceTimersByTimeAsync(10_000 + 1000)
    expect(sources).toHaveLength(2)
  })

  it('checks a live connection, since a heartbeat is invisible to EventSource', async () => {
    const { last, urls, statuses } = setup()
    last().emit('hello')
    await settle()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(urls.at(-1)).toBe('api/docs?after=0&limit=1')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(urls).toHaveLength(3)
    expect(statuses.at(-1)).toBe('live')
  })

  it('stops saying live when a check gets no answer', async () => {
    const { replies, last, statuses } = setup()
    last().emit('hello')
    await settle()
    replies.push(hang())
    await vi.advanceTimersByTimeAsync(40_000)
    expect(statuses.at(-1)).toBe('reconnecting')
    expect(last().closed).toBe(true)
  })

  it('is gone when a check gets 404', async () => {
    const { replies, last, statuses } = setup()
    last().emit('hello')
    await settle()
    replies.push({ status: 404 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(statuses.at(-1)).toBe('gone')
  })

  it('drops a check that answers after the connection was lost', async () => {
    const { replies, last, sources } = setup()
    last().emit('hello')
    await settle()
    let release: (reply: Reply) => void = () => undefined
    replies.push(new Promise<Reply>((resolve) => (release = resolve)))
    await vi.advanceTimersByTimeAsync(30_000)
    last().emit('error')
    await settle()
    release({ status: 404 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(2)
  })
})

describe('a gone Viewer (VD-114)', () => {
  it('stops for good when the probe after a lost stream gets 404', async () => {
    const { replies, last, sources, statuses } = setup()
    replies.push({ status: 404 })
    last().emit('error')
    await settle()
    expect(statuses.at(-1)).toBe('gone')
    await vi.advanceTimersByTimeAsync(600_000)
    expect(sources).toHaveLength(1)
  })

  it('stops for good when a fill gets 404', async () => {
    const { replies, last, sources, statuses } = setup()
    replies.push({ status: 404 })
    last().emit('hello')
    await settle()
    expect(statuses.at(-1)).toBe('gone')
    expect(last().closed).toBe(true)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(sources).toHaveLength(1)
  })

  it('probes with after=<lastSeq> and a page of one', async () => {
    const { replies, last, urls } = setup()
    replies.push(docs(4))
    last().emit('hello')
    await settle()
    last().emit('error')
    await settle()
    expect(urls.at(-1)).toBe('api/docs?after=4&limit=1')
  })
})

describe('close', () => {
  it('ends the stream and any pending retry', async () => {
    const { last, sources, stream } = setup()
    last().emit('error')
    await settle()
    stream.close()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(sources).toHaveLength(1)
  })

  it('ignores a probe that answers after it', async () => {
    const { replies, last, sources, statuses, stream } = setup()
    let release: (reply: Reply) => void = () => undefined
    replies.push(new Promise<Reply>((resolve) => (release = resolve)))
    last().emit('error')
    await settle()
    stream.close()
    release({ status: 404 })
    await vi.advanceTimersByTimeAsync(600_000)
    expect(sources).toHaveLength(1)
    expect(statuses).not.toContain('gone')
  })
})
