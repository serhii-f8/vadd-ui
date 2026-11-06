import { readFileSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { LIMITS } from '@vadd/ui-spec'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stateDirOf, workspaceHash } from '../src/paths.js'
import { type RunningViewer, type StartOptions, startViewer } from '../src/server.js'
import { MAX_CLIENTS } from '../src/sse.js'
import { openStream, type Reply, type RequestOptions, request, tempDir } from './helpers.js'

// §15.3, one `describe` per row, each against a whole started Viewer.

const running = new Set<RunningViewer>()

afterEach(async () => {
  await Promise.all([...running].map((viewer) => viewer.close()))
  running.clear()
})

async function start(options: Partial<StartOptions> = {}): Promise<RunningViewer> {
  const viewer = await startViewer({
    workspace: tempDir(),
    env: { XDG_STATE_HOME: tempDir() },
    ports: [0],
    ...options,
  })
  running.add(viewer)
  return viewer
}

function call(viewer: RunningViewer, path: string, options: RequestOptions = {}): Promise<Reply> {
  const headers = { host: `localhost:${viewer.port}`, ...options.headers }
  return request(viewer.port, path, { ...options, headers })
}

function write(viewer: RunningViewer, headers: Record<string, string> = {}): Promise<Reply> {
  return call(viewer, `/v/${viewer.readToken}/api/docs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${viewer.writeToken}`, ...headers },
    body: '{"title":"T","body":[]}',
  })
}

function externalAddress(): string | undefined {
  const all = Object.values(networkInterfaces()).flat()
  return all.find((item) => item?.family === 'IPv4' && !item.internal)?.address
}

describe('§15.3 Exposure', () => {
  it('listens on loopback only by default', async () => {
    const viewer = await start()
    expect(viewer.address).toBe('127.0.0.1')
    const address = externalAddress()
    if (address === undefined) return
    const reached = await fetch(`http://${address}:${viewer.port}/health`).then(
      () => true,
      () => false,
    )
    expect(reached).toBe(false)
  })

  it('takes 0.0.0.0 only by explicit request, with a warning', async () => {
    const warn = vi.fn()
    const viewer = await start({ bind: '0.0.0.0', warn })
    expect(viewer.address).toBe('0.0.0.0')
    expect(warn.mock.calls.flat().join()).toMatch(/warning/)
  })
})

describe('§15.3 Unauthorized readers', () => {
  it('uses a 128-bit read token, and 404s anything outside it', async () => {
    const viewer = await start()
    expect(viewer.readToken).toHaveLength(32)
    for (const path of ['/', '/api/docs', '/api/events', '/v/', '/v/0/', '/v/0/api/docs']) {
      expect((await call(viewer, path)).status).toBe(404)
    }
    expect((await call(viewer, `/v/${viewer.readToken}/`)).status).toBe(200)
  })
})

describe('§15.3 Unauthorized writers', () => {
  it('needs the separate write token, which only viewer.json holds', async () => {
    const env = { XDG_STATE_HOME: tempDir() }
    const workspace = tempDir()
    const viewer = await start({ env, workspace })
    expect(viewer.writeToken).toHaveLength(32)
    expect(viewer.writeToken).not.toBe(viewer.readToken)
    const reader = { authorization: `Bearer ${viewer.readToken}` }
    expect((await write(viewer, reader)).status).toBe(401)
    expect((await write(viewer)).status).toBe(201)

    const file = join(stateDirOf(workspaceHash(workspace), env), 'viewer.json')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8')).writeToken).toBe(viewer.writeToken)
    const page = await call(viewer, `/v/${viewer.readToken}/`)
    expect(page.text).not.toContain(viewer.writeToken)
  })
})

describe('§15.3 DNS rebinding', () => {
  it('accepts only a loopback name with the bound port', async () => {
    const viewer = await start()
    const path = `/v/${viewer.readToken}/`
    for (const name of ['localhost', '127.0.0.1', '[::1]']) {
      const reply = await call(viewer, path, { headers: { host: `${name}:${viewer.port}` } })
      expect(reply.status).toBe(200)
    }
    for (const host of ['evil.test', `evil.test:${viewer.port}`, 'localhost:1']) {
      const reply = await call(viewer, path, { headers: { host } })
      expect(reply.status).toBe(403)
      expect(reply.text).not.toContain('Viewer')
    }
  })

  it('covers the routes with no token too', async () => {
    const viewer = await start()
    const headers = { host: 'evil.test' }
    expect((await call(viewer, '/health', { headers })).status).toBe(403)
    expect((await call(viewer, '/favicon.ico', { headers })).status).toBe(403)
  })
})

describe('§15.3 Cross-origin reads', () => {
  it('sends no CORS header, even to a preflight or a page that asks', async () => {
    const viewer = await start()
    const base = `/v/${viewer.readToken}`
    const headers = { origin: 'https://evil.test', 'access-control-request-method': 'POST' }
    const replies = [
      await call(viewer, `${base}/`, { headers }),
      await call(viewer, `${base}/api/docs`, { headers }),
      await call(viewer, `${base}/api/docs`, { headers, method: 'OPTIONS' }),
      await call(viewer, '/health', { headers }),
    ]
    for (const reply of replies) {
      const names = Object.keys(reply.headers).filter((name) => name.startsWith('access-control'))
      expect(names).toEqual([])
    }
    expect(replies[2]?.status).toBe(405)
  })

  it('sets the exact CSP on the feed app', async () => {
    const viewer = await start()
    const reply = await call(viewer, `/v/${viewer.readToken}/`)
    expect(reply.headers['content-security-policy']).toBe(
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    )
  })

  it('loads no third-party asset', async () => {
    const viewer = await start()
    const reply = await call(viewer, `/v/${viewer.readToken}/`)
    expect(reply.text).not.toMatch(/https?:/)
  })
})

describe('§15.3 Abuse', () => {
  it('refuses a body over 256 KiB', async () => {
    const viewer = await start()
    const reply = await call(viewer, `/v/${viewer.readToken}/api/docs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${viewer.writeToken}` },
      body: ' '.repeat(LIMITS.inputBytes + 1),
    })
    expect(LIMITS.inputBytes).toBe(256 * 1024)
    expect(reply.status).toBe(413)
  })

  it('refuses the 21st write in a second, without counting strangers', async () => {
    const viewer = await start()
    const strangers = Array.from({ length: 30 }, () =>
      write(viewer, { authorization: 'Bearer nope' }),
    )
    expect((await Promise.all(strangers)).every(({ status }) => status === 401)).toBe(true)
    const replies = await Promise.all(Array.from({ length: 21 }, () => write(viewer)))
    const statuses = replies.map(({ status }) => status)
    expect(statuses.filter((status) => status === 201)).toHaveLength(20)
    const refused = replies.find(({ status }) => status === 429)
    expect(refused?.headers['retry-after']).toBe('1')
  })

  it('refuses the 51st event stream', async () => {
    const viewer = await start()
    const path = `/v/${viewer.readToken}/api/events`
    const host = { host: `localhost:${viewer.port}` }
    const streams = await Promise.all(
      Array.from({ length: MAX_CLIENTS }, () => openStream(viewer.port, path, host)),
    )
    expect((await call(viewer, path)).status).toBe(503)
    for (const stream of streams) stream.close()
  })
})

describe('§15.3 Surface', () => {
  it.each([
    '/../viewer.json',
    '/..%2fviewer.json',
    '/%2e%2e/viewer.json',
    '/viewer.json',
    '/docs/',
    '/docs/1-t.vui.json',
    '/docs/../../viewer.json',
    '/api/docs/..%2F..%2Fviewer.json',
    '/api/docs/%2e%2e',
    '/docs/%2e%2e%2fviewer.html',
    '/etc/passwd',
    '//etc/passwd',
    '/proxy?url=http://example.com',
  ])('serves stored documents and its bundle only: %s', async (path) => {
    const viewer = await start()
    await write(viewer)
    const reply = await call(viewer, `/v/${viewer.readToken}${path}`)
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('not found\n')
  })
})

describe('§15.3 Lifetime', () => {
  it('shuts down when idle', async () => {
    const viewer = await start({ idleMs: 10 })
    await viewer.closed
    await expect(request(viewer.port, '/health')).rejects.toThrow()
  })

  it('stays up while a client is connected', async () => {
    const viewer = await start({ idleMs: 40 })
    const path = `/v/${viewer.readToken}/api/events`
    const stream = await openStream(viewer.port, path, { host: `localhost:${viewer.port}` })
    await new Promise((done) => setTimeout(done, 100))
    expect((await call(viewer, '/health')).status).toBe(200)
    stream.close()
    await viewer.closed
  })

  it('rotates tokens on every start, so old URLs stop working', async () => {
    const env = { XDG_STATE_HOME: tempDir() }
    const workspace = tempDir()
    const first = await start({ env, workspace })
    await first.close()
    const second = await start({ env, workspace, ports: [first.port] })
    expect(second.port).toBe(first.port)
    expect((await call(second, `/v/${first.readToken}/`)).status).toBe(404)
    const stale = { authorization: `Bearer ${first.writeToken}` }
    expect((await write(second, stale)).status).toBe(401)
    expect((await call(second, `/v/${second.readToken}/`)).status).toBe(200)
  })
})
