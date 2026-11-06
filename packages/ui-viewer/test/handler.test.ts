import { connect } from 'node:net'
import { version } from '@vadd/ui'
import { LIMITS, MEDIA_TYPE, type VuiDocument } from '@vadd/ui-spec'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { placeholderFeed } from '../src/feed.js'
import { BEARER, HASH, openStream, READ, request, type Served, serve } from './helpers.js'

const DOC = { vui: 1, title: 'Report', body: ['hello'] }

let served: Served | undefined

async function start(overrides?: Parameters<typeof serve>[0]): Promise<Served> {
  served = await serve(overrides)
  return served
}

afterEach(async () => {
  await served?.close()
  served = undefined
})

describe('pages', () => {
  it('serves the feed with the exact §15.3 CSP', async () => {
    const { get } = await start()
    const reply = await get('/')
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(reply.headers['content-security-policy']).toBe(
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    )
    expect(reply.text).toBe(placeholderFeed.html)
  })

  it('serves the feed script (VD-006)', async () => {
    const { get } = await start()
    const reply = await get('/app.js')
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(reply.text).toBe(placeholderFeed.script)
  })

  it('takes the feed from its option, the seam for task 14', async () => {
    const { get } = await start({ feed: { html: '<p>real', script: 'real()' } })
    expect((await get('/')).text).toBe('<p>real')
    expect((await get('/app.js')).text).toBe('real()')
  })

  it('serves a document as a standalone file, with its own CSP (VD-006)', async () => {
    const { get, post } = await start()
    const { id } = (await post(DOC)).json()
    const reply = await get(`/docs/${id}.html`)
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(reply.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
    )
    expect(reply.text).toContain('<title>Report</title>')
    expect(reply.text).toContain(`<script type="${MEDIA_TYPE}">`)
  })

  it('answers 404 for an unknown standalone file', async () => {
    const { get } = await start()
    expect((await get('/docs/9-nope.html')).status).toBe(404)
  })
})

describe('outside the token', () => {
  it('answers /health with no token', async () => {
    const { port } = await start()
    const reply = await request(port, '/health')
    expect(reply.status).toBe(200)
    expect(reply.json()).toEqual({ ok: true, version, workspaceHash: HASH })
  })

  it('answers /favicon.ico with 204', async () => {
    const { port } = await start()
    const reply = await request(port, '/favicon.ico')
    expect(reply.status).toBe(204)
    expect(reply.text).toBe('')
  })

  it('gives one identical 404 to any other path', async () => {
    const { port } = await start()
    const paths = ['/', '/v/', '/v/wrong/', `/v/${READ}`, '/v/wrong/api/docs', `/v/${READ}/nope`]
    const replies = await Promise.all(paths.map((path) => request(port, path)))
    expect(replies.map(({ status }) => status)).toEqual(paths.map(() => 404))
    expect(new Set(replies.map(({ text }) => text)).size).toBe(1)
  })

  it('refuses to POST /health or /favicon.ico', async () => {
    const { port } = await start()
    expect((await request(port, '/health', { method: 'POST' })).status).toBe(404)
    expect((await request(port, '/favicon.ico', { method: 'POST' })).status).toBe(404)
  })
})

describe('every response', () => {
  it('is uncacheable, unsniffable, and leaks no referrer', async () => {
    const { get, port } = await start()
    for (const reply of [await get('/'), await get('/nope'), await request(port, '/health')]) {
      expect(reply.headers['cache-control']).toBe('no-store')
      expect(reply.headers['x-content-type-options']).toBe('nosniff')
      expect(reply.headers['referrer-policy']).toBe('no-referrer')
    }
  })
})

describe('methods', () => {
  it.each([
    ['DELETE', '/', 'GET'],
    ['POST', '/app.js', 'GET'],
    ['PUT', '/api/docs', 'GET, POST'],
    ['POST', '/api/events', 'GET'],
    ['OPTIONS', '/api/docs', 'GET, POST'],
  ])('%s %s is 405', async (method, path, allow) => {
    const { get } = await start()
    const reply = await get(path, { method })
    expect(reply.status).toBe(405)
    expect(reply.headers.allow).toBe(allow)
  })
})

describe('GET /api/docs', () => {
  async function withDocs(count: number): Promise<Served> {
    const server = await start()
    for (let i = 1; i <= count; i += 1) await server.post({ ...DOC, title: `D${i}` })
    return server
  }

  it('lists headers, ascending', async () => {
    const { get } = await withDocs(2)
    const { docs } = (await get('/api/docs')).json()
    expect(docs).toHaveLength(2)
    expect(docs[0]).toEqual({
      seq: 1,
      id: '1-d1',
      title: 'D1',
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
      cwd: null,
      branch: null,
    })
  })

  it('pages with after and limit', async () => {
    const { get } = await withDocs(4)
    const seqs = async (query: string) =>
      (await get(`/api/docs?${query}`)).json().docs.map(({ seq }: { seq: number }) => seq)
    expect(await seqs('after=1&limit=2')).toEqual([2, 3])
    expect(await seqs('after=4')).toEqual([])
    expect(await seqs('limit=1')).toEqual([1])
  })

  it('defaults to 100', async () => {
    const { get, store } = await start()
    for (let i = 0; i < 101; i += 1) store.add(DOC as unknown as VuiDocument)
    expect((await get('/api/docs')).json().docs).toHaveLength(100)
    expect((await get('/api/docs?limit=500')).json().docs).toHaveLength(101)
  })

  it.each(['after=-1', 'after=x', 'after=', 'after=1e3', 'limit=0', 'limit=501', 'limit=x'])(
    'refuses %s',
    async (query) => {
      const { get } = await start()
      expect((await get(`/api/docs?${query}`)).status).toBe(400)
    },
  )
})

describe('GET /api/docs/<id>', () => {
  it('serves the canonical document', async () => {
    const { get, post } = await start()
    const { id } = (await post(DOC)).json()
    const reply = await get(`/api/docs/${id}`)
    expect(reply.status).toBe(200)
    expect(reply.headers['content-type']).toBe(MEDIA_TYPE)
    expect(reply.json()).toMatchObject({ title: 'Report', body: [{ type: 'md', text: 'hello' }] })
  })

  it('answers 404 for an unknown id', async () => {
    const { get } = await start()
    expect((await get('/api/docs/7-x')).status).toBe(404)
  })
})

describe('POST /api/docs', () => {
  it('stores the canonical form and returns {seq, id, url, clients}', async () => {
    const { post, port, store } = await start()
    const reply = await post(DOC)
    expect(reply.status).toBe(201)
    expect(reply.json()).toEqual({
      seq: 1,
      id: '1-report',
      url: `http://localhost:${port}/v/${READ}/`,
      clients: 0,
    })
    expect(JSON.parse(store.read('1-report') as string).body[0].type).toBe('md')
  })

  it('stamps generatedAt when the document has none', async () => {
    const { post, store } = await start({ now: () => Date.parse('2026-11-06T00:00:00.000Z') })
    await post(DOC)
    const stored = JSON.parse(store.read('1-report') as string)
    expect(stored.generatedAt).toBe('2026-11-06T00:00:00.000Z')
  })

  it('counts connected clients and pushes the header to them', async () => {
    const { post, port } = await start()
    const stream = await openStream(port, `/v/${READ}/api/events`)
    await stream.until('event: hello')
    const reply = await post(DOC)
    expect(reply.json().clients).toBe(1)
    await stream.until('event: doc')
    expect(stream.text()).toContain('"id":"1-report"')
    stream.close()
  })

  it('reports activity on each document', async () => {
    const onActivity = vi.fn()
    const { post } = await start({ onActivity })
    await post(DOC)
    expect(onActivity).toHaveBeenCalledWith(0)
  })

  it.each([
    ['nothing', {}],
    ['a read token', { authorization: `Bearer ${READ}` }],
    ['a wrong scheme', { authorization: `Basic ${'w'.repeat(32)}` }],
    ['a wrong token', { authorization: 'Bearer nope' }],
  ])('answers 401 to %s', async (_, headers) => {
    const { post, store } = await start()
    const reply = await post(DOC, headers)
    expect(reply.status).toBe(401)
    expect(reply.headers['www-authenticate']).toBe('Bearer')
    expect(store.size).toBe(0)
  })

  it('takes the scheme in any case', async () => {
    const { post } = await start()
    const authorization = BEARER.authorization.replace('Bearer', 'bEARER')
    expect((await post(DOC, { authorization })).status).toBe(201)
  })

  it('answers 422 with diagnostics to an invalid document', async () => {
    const { post, store } = await start()
    const reply = await post({ title: 'T', body: [{ type: 'tabel' }] })
    expect(reply.status).toBe(422)
    expect(reply.json().ok).toBe(false)
    expect(reply.json().diagnostics[0].code).toBeTypeOf('string')
    expect(store.size).toBe(0)
  })

  it('answers 422 to text that does not parse, or nests without end', async () => {
    const { post } = await start()
    expect((await post('{not')).status).toBe(422)
    expect((await post('['.repeat(200_000))).status).toBe(422)
  })

  it('answers 400 to bytes that are not UTF-8', async () => {
    const { post } = await start()
    const reply = await post(Buffer.from([0x7b, 0xff, 0x7d]))
    expect(reply.status).toBe(400)
  })

  it('takes a body of exactly the limit', async () => {
    const { post } = await start()
    const base = JSON.stringify({ title: 'T', body: [''] })
    const padded = base.padEnd(LIMITS.inputBytes, ' ')
    expect((await post(padded)).status).toBe(201)
  })

  it('answers 413 by Content-Length, one byte over', async () => {
    const { post, store } = await start()
    const reply = await post(' '.repeat(LIMITS.inputBytes + 1))
    expect(reply.status).toBe(413)
    expect(store.size).toBe(0)
  })

  it('answers 413 to a chunked body, which declares no length', async () => {
    const { port, store } = await start()
    const reply = await new Promise<string>((resolve) => {
      const socket = connect(port, '127.0.0.1')
      let text = ''
      socket.on('data', (chunk) => {
        text += chunk.toString()
      })
      socket.on('close', () => resolve(text))
      socket.on('error', () => resolve(text))
      const size = (LIMITS.inputBytes + 1).toString(16)
      socket.write(
        `POST /v/${READ}/api/docs HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
          `Authorization: ${BEARER.authorization}\r\nTransfer-Encoding: chunked\r\n\r\n` +
          `${size}\r\n${' '.repeat(LIMITS.inputBytes + 1)}\r\n`,
      )
    })
    expect(reply).toContain('413')
    expect(store.size).toBe(0)
  })

  it('stores nothing from a client that leaves mid-body, and keeps serving', async () => {
    const { port, store, get } = await start()
    const socket = connect(port, '127.0.0.1')
    socket.write(
      `POST /v/${READ}/api/docs HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
        `Authorization: ${BEARER.authorization}\r\nContent-Length: 1000\r\n\r\n{"body":`,
    )
    await new Promise((done) => setTimeout(done, 20))
    socket.destroy()
    await new Promise((done) => setTimeout(done, 20))
    expect(store.size).toBe(0)
    expect((await get('/')).status).toBe(200)
  })

  it('answers 500 when the store fails, and keeps serving', async () => {
    const { post, get, store } = await start()
    vi.spyOn(store, 'add').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const reply = await post(DOC)
    expect(reply.status).toBe(500)
    expect(reply.text).not.toContain('disk full')
    expect((await get('/')).status).toBe(200)
  })
})

describe('GET /api/events', () => {
  it('opens with hello', async () => {
    const { port } = await start()
    const stream = await openStream(port, `/v/${READ}/api/events`)
    expect(stream.status).toBe(200)
    await stream.until(`event: hello\ndata: {"version":"${version}"}`)
    stream.close()
  })

  it('replays what came after Last-Event-ID', async () => {
    const { port, post } = await start()
    await post({ ...DOC, title: 'one' })
    await post({ ...DOC, title: 'two' })
    await post({ ...DOC, title: 'three' })
    const stream = await openStream(port, `/v/${READ}/api/events`, { 'Last-Event-ID': '1' })
    await stream.until('"id":"3-three"')
    expect(stream.text()).not.toContain('1-one')
    expect(stream.text()).toContain('id: 2\nevent: doc')
    stream.close()
  })

  it('replays nothing without a usable Last-Event-ID', async () => {
    const { port, post } = await start()
    await post(DOC)
    for (const headers of [{}, { 'Last-Event-ID': 'x' }] as Record<string, string>[]) {
      const stream = await openStream(port, `/v/${READ}/api/events`, headers)
      await stream.until('event: hello')
      expect(stream.text()).not.toContain('event: doc')
      stream.close()
    }
  })

  it('counts a client out when it leaves, and reports both', async () => {
    const onActivity = vi.fn()
    const { port, handler } = await start({ onActivity })
    const stream = await openStream(port, `/v/${READ}/api/events`)
    await stream.until('hello')
    expect(handler.clients()).toBe(1)
    expect(onActivity).toHaveBeenLastCalledWith(1)
    stream.close()
    await vi.waitFor(() => expect(handler.clients()).toBe(0))
    expect(onActivity).toHaveBeenLastCalledWith(0)
  })

  it('answers 503 past 50 clients', async () => {
    const { port } = await start()
    const path = `/v/${READ}/api/events`
    const streams = await Promise.all(Array.from({ length: 50 }, () => openStream(port, path)))
    const reply = await request(port, path)
    expect(reply.status).toBe(503)
    expect(reply.headers['retry-after']).toBeDefined()
    for (const stream of streams) stream.close()
  })
})
