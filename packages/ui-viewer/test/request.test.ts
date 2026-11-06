import { createServer } from 'node:http'
import { connect } from 'node:net'
import { describe, expect, it } from 'vitest'
import { isAllowedHost, readBody, tokensMatch, WriteLimiter } from '../src/request.js'
import { request } from './helpers.js'

describe('isAllowedHost', () => {
  it.each(['localhost:47100', '127.0.0.1:47100', '[::1]:47100', 'LOCALHOST:47100'])(
    'accepts %s',
    (host) => {
      expect(isAllowedHost(host, 47100)).toBe(true)
    },
  )

  it.each([
    undefined,
    '',
    'localhost',
    'localhost:47101',
    'evil.com:47100',
    'localhost.evil.com:47100',
    'localhost:47100.evil.com',
    '0.0.0.0:47100',
    '127.0.0.2:47100',
    '::1:47100',
  ])('refuses %s', (host) => {
    expect(isAllowedHost(host, 47100)).toBe(false)
  })
})

describe('tokensMatch', () => {
  it('compares any lengths', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true)
    expect(tokensMatch('abc', 'abd')).toBe(false)
    expect(tokensMatch('abc', 'abcd')).toBe(false)
    expect(tokensMatch('', 'abc')).toBe(false)
  })
})

describe('WriteLimiter', () => {
  it('allows 20 in any second', () => {
    const limiter = new WriteLimiter()
    for (let i = 0; i < 20; i += 1) expect(limiter.allow(1000 + i)).toBe(true)
    expect(limiter.allow(1020)).toBe(false)
    expect(limiter.allow(1999)).toBe(false)
    expect(limiter.allow(2000)).toBe(true)
    expect(limiter.allow(2000)).toBe(false)
    expect(limiter.allow(2020)).toBe(true)
  })

  it('survives the clock stepping back', () => {
    const limiter = new WriteLimiter()
    for (let i = 0; i < 20; i += 1) expect(limiter.allow(10_000_000)).toBe(true)
    expect(limiter.allow(1000)).toBe(true)
  })
})

describe('readBody', () => {
  async function reading(limit: number, send: (port: number) => Promise<unknown>) {
    const outcome = new Promise<unknown>((resolve) => {
      const server = createServer((req, res) => {
        readBody(req, limit, limit + 3).then(
          (body) => {
            resolve(body)
            res.end()
            server.close()
          },
          (error: Error) => {
            resolve(error)
            server.close()
          },
        )
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number }
        send(port).catch(() => undefined)
      })
    })
    return outcome
  }

  it('reads up to the limit', async () => {
    const body = await reading(5, (port) => request(port, '/', { method: 'POST', body: 'hello' }))
    expect(body).toEqual(Buffer.from('hello'))
  })

  it('stops at one byte past it', async () => {
    const body = await reading(5, (port) => request(port, '/', { method: 'POST', body: 'hello!' }))
    expect(body).toBe('too-large')
  })

  it('reads on to the end within the drain, so the client finishes sending', async () => {
    let ended = false
    const body = await new Promise<unknown>((resolve) => {
      const server = createServer((req, res) => {
        req.on('end', () => {
          ended = true
        })
        readBody(req, 5, 100).then((value) => {
          resolve(value)
          res.end()
          server.close()
        })
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number }
        void request(port, '/', { method: 'POST', body: 'x'.repeat(50) })
      })
    })
    expect(body).toBe('too-large')
    expect(ended).toBe(true)
  })

  it('rejects a body already read, rather than wait for ever', async () => {
    const outcome = await new Promise<unknown>((resolve) => {
      const server = createServer((req, res) => {
        req.resume()
        req.on('end', () => {
          readBody(req, 5, 5).then(resolve, resolve)
          res.end()
          server.close()
        })
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number }
        void request(port, '/', { method: 'POST', body: 'hi' })
      })
    })
    expect(outcome).toBeInstanceOf(Error)
  })

  it('rejects when the client goes away', async () => {
    const body = await reading(1000, async (port) => {
      const socket = connect(port, '127.0.0.1')
      socket.write('POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 500\r\n\r\npartial')
      setTimeout(() => socket.destroy(), 20)
    })
    expect(body).toBeInstanceOf(Error)
  })
})
