import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEARTBEAT_MS, MAX_CLIENTS, SseHub } from '../src/sse.js'
import type { DocHeader } from '../src/store.js'

class FakeResponse extends EventEmitter {
  text = ''
  status = 0
  headers: Record<string, string> = {}
  ended = false
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status
    this.headers = headers
  }
  flushHeaders() {}
  write(chunk: string) {
    this.text += chunk
    return true
  }
  end() {
    this.ended = true
  }
}

const header = (seq: number): DocHeader => ({
  seq,
  id: `${seq}-a`,
  title: 'a\nb',
  createdAt: '2026-11-06T10:00:00.000Z',
  cwd: null,
  branch: null,
})

function client(hub: SseHub, replay: DocHeader[] = []) {
  const res = new FakeResponse()
  const opened = hub.open(res as unknown as ServerResponse, replay)
  return { res, opened }
}

describe('SseHub', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has the §4.1 and §15.3 numbers', () => {
    expect(HEARTBEAT_MS).toBe(15_000)
    expect(MAX_CLIENTS).toBe(50)
  })

  it('sends an event stream, hello first', () => {
    const hub = new SseHub({ version: '1.2.3' })
    const { res } = client(hub)
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/event-stream')
    expect(res.text).toBe('event: hello\ndata: {"version":"1.2.3"}\n\n')
    hub.close()
  })

  it('replays after hello, then goes live, each with its seq as the event id', () => {
    const hub = new SseHub({ version: '1' })
    const { res } = client(hub, [header(2)])
    hub.broadcast(header(3))
    const data = (seq: number) => JSON.stringify(header(seq))
    expect(res.text).toBe(
      'event: hello\ndata: {"version":"1"}\n\n' +
        `id: 2\nevent: doc\ndata: ${data(2)}\n\n` +
        `id: 3\nevent: doc\ndata: ${data(3)}\n\n`,
    )
    hub.close()
  })

  it('beats every 15 s with a comment, while anyone listens', () => {
    const hub = new SseHub({ version: '1' })
    const { res } = client(hub)
    const before = res.text
    vi.advanceTimersByTime(14_999)
    expect(res.text).toBe(before)
    vi.advanceTimersByTime(1)
    expect(res.text).toBe(`${before}: heartbeat\n\n`)
    res.emit('close')
    expect(vi.getTimerCount()).toBe(0)
    hub.close()
  })

  it('refuses the 51st client and takes one once a place frees', () => {
    const hub = new SseHub({ version: '1' })
    const clients = Array.from({ length: 50 }, () => client(hub))
    expect(clients.every(({ opened }) => opened)).toBe(true)
    expect(hub.count).toBe(50)
    expect(client(hub).opened).toBe(false)
    clients[0]?.res.emit('close')
    expect(hub.count).toBe(49)
    expect(client(hub).opened).toBe(true)
    hub.close()
  })

  it('tells of each change in the count', () => {
    const onChange = vi.fn()
    const hub = new SseHub({ version: '1', onChange })
    const { res } = client(hub)
    expect(onChange).toHaveBeenLastCalledWith(1)
    res.emit('close')
    expect(onChange).toHaveBeenLastCalledWith(0)
    hub.close()
  })

  it('ends every stream on close', () => {
    const hub = new SseHub({ version: '1' })
    const { res } = client(hub)
    hub.close()
    expect(res.ended).toBe(true)
    expect(hub.count).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
