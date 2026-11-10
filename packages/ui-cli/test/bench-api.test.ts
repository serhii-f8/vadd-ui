import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { apiCounter, selectCounter } from '../src/bench/api.js'
import { CliError } from '../src/outcome.js'

const KEY = 'sk-ant-test-0123456789-secret'
const FRAMING = 7

interface Seen {
  method?: string
  url?: string
  headers: IncomingHttpHeaders
  body: { model: string; messages: { role: string; content: string }[] }
}

let server: Server | undefined

afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()))
  server = undefined
})

type Reply = (seen: Seen) => { status: number; body: string }

/** One token per word, plus the framing the real endpoint adds to every message. */
const counting: Reply = (seen) => {
  const text = seen.body.messages[0]?.content ?? ''
  const words = text === '.' ? 1 : text.split(/\s+/).filter(Boolean).length
  return { status: 200, body: JSON.stringify({ input_tokens: FRAMING + words }) }
}

async function stub(reply: Reply): Promise<{ baseUrl: string; seen: Seen[] }> {
  const seen: Seen[] = []
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const entry = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: JSON.parse(raw),
      }
      seen.push(entry)
      const { status, body } = reply(entry)
      res.writeHead(status, { 'content-type': 'application/json' }).end(body)
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, seen }
}

async function failure(promise: Promise<unknown>): Promise<CliError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof CliError) return error
    throw error
  }
  throw new Error('expected a failure')
}

describe('API counter (§14.3, VD-149)', () => {
  it('posts one user message to count_tokens and subtracts the framing', async () => {
    const { baseUrl, seen } = await stub(counting)
    const counter = apiCounter({ key: KEY, baseUrl })
    expect(await counter.count('one two three')).toBe(3)
    expect(await counter.count('four five')).toBe(2)
    expect(seen).toHaveLength(3)
    const [probe, first] = seen
    expect(probe?.body.messages).toEqual([{ role: 'user', content: '.' }])
    expect(first?.method).toBe('POST')
    expect(first?.url).toBe('/v1/messages/count_tokens')
    expect(first?.headers['x-api-key']).toBe(KEY)
    expect(first?.headers['anthropic-version']).toBe('2023-06-01')
    expect(first?.headers['content-type']).toBe('application/json')
    expect(first?.body).toEqual({
      model: 'claude-opus-5-5',
      messages: [{ role: 'user', content: 'one two three' }],
    })
  })

  it('takes the model from the environment and describes itself', async () => {
    const { baseUrl, seen } = await stub(counting)
    const counter = apiCounter({ key: KEY, baseUrl, model: 'claude-sonnet-5-5' })
    expect(counter.describe).toEqual({ kind: 'api', model: 'claude-sonnet-5-5' })
    await counter.count('a b')
    expect(seen.every(({ body }) => body.model === 'claude-sonnet-5-5')).toBe(true)
  })

  it('never goes below zero', async () => {
    const { baseUrl } = await stub(counting)
    expect(await apiCounter({ key: KEY, baseUrl }).count('')).toBe(0)
  })

  it.each([
    [
      '401',
      () => ({ status: 401, body: JSON.stringify({ error: { message: `bad key ${KEY}` } }) }),
      'HTTP 401',
    ],
    ['500', () => ({ status: 500, body: 'oops' }), 'HTTP 500'],
    ['non-JSON', () => ({ status: 200, body: 'not json' }), 'no input_tokens'],
    ['no count', () => ({ status: 200, body: '{"tokens": 3}' }), 'no input_tokens'],
  ] as [string, Reply, string][])(
    'fails with exit 5 on %s, without the key',
    async (_, reply, text) => {
      const { baseUrl } = await stub(reply)
      const error = await failure(apiCounter({ key: KEY, baseUrl }).count('x'))
      expect(error.exit).toBe(5)
      expect(error.code).toBe('token-api')
      expect(error.message).toContain(text)
      expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(KEY)
    },
  )

  it('fails with exit 5 when nothing listens, without the key', async () => {
    const { baseUrl } = await stub(counting)
    await new Promise<void>((done) => server?.close(() => done()))
    server = undefined
    const error = await failure(apiCounter({ key: KEY, baseUrl }).count('x'))
    expect(error.exit).toBe(5)
    expect(error.message).toMatch(/^token counting API: /)
    expect(error.message).not.toContain(KEY)
  })
})

describe('selectCounter', () => {
  it('uses the API when a key is set', async () => {
    const { baseUrl } = await stub(counting)
    const counter = await selectCounter({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: baseUrl })
    expect(counter.describe).toEqual({ kind: 'api', model: 'claude-opus-5-5' })
    expect(await counter.count('a b c')).toBe(3)
  })

  it('reads VUI_BENCH_MODEL', async () => {
    const counter = await selectCounter({ ANTHROPIC_API_KEY: KEY, VUI_BENCH_MODEL: 'm' })
    expect(counter.describe).toEqual({ kind: 'api', model: 'm' })
  })

  it.each([[{}], [{ ANTHROPIC_API_KEY: '' }]])('stays offline without a key: %j', async (env) => {
    expect((await selectCounter(env)).describe.kind).toBe('offline')
  })
})
