/**
 * The §4.1 HTTP interface as a contract any server can be checked against: the Viewer, or a
 * host that mounts its handler, such as VADD (§4.4). It needs no test runner (VD-144): each
 * case is an async function that throws an `AssertionError`, so Vitest, `node:test` or a
 * script can run it. `base` is what `VUI_VIEWER_URL` would hold, and `token` what
 * `VUI_VIEWER_TOKEN` would. Cases write documents, so point it at a test instance only, and
 * run them in order: later cases read what earlier ones wrote.
 */

import { deepStrictEqual, fail, ok, strictEqual } from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { LIMITS, MEDIA_TYPE, validateText } from '@vadd/ui-spec'

export interface ContractTarget {
  /** The interface's base URL, prefix included, e.g. `http://localhost:4319/v/<readToken>`. */
  base: string
  /** The write token. Without one, the auth case is skipped. */
  token?: string
  /** Per request. Default 5 s. */
  timeoutMs?: number
}

export interface ContractCase {
  name: string
  run(): Promise<void>
}

export interface ContractResult {
  name: string
  ok: boolean
  skipped?: boolean
  error?: string
}

/** The case names, in run order. Stable, so a host can refer to one. */
export const CONTRACT_CASES = [
  'health answers at the origin without a token',
  'the feed page is HTML',
  'the event stream opens with hello',
  'a write is stored and announced',
  'a stored document reads back canonical',
  'the list pages by seq',
  'a stored document has a standalone page',
  'an invalid document is refused with diagnostics',
  'a write without the token is refused',
  'a body over 256 KiB is refused',
  'unknown routes and ids are 404',
  'a foreign Host is refused',
] as const

/** Sent as `X-Vui-Contract` on each request, so a host's log shows which case asked. */
const SLUGS = [
  'health',
  'feed',
  'events',
  'write',
  'read',
  'list',
  'standalone',
  'invalid',
  'auth',
  'size',
  'miss',
  'host',
] as const

const DEFAULT_TIMEOUT_MS = 5_000
const SKIPPED = ' (skipped: no token)'
const FOREIGN_HOST = 'vui-contract.example'

interface Reply {
  status: number
  headers: IncomingHttpHeaders
  text: string
}

interface Options {
  method?: string
  headers?: Record<string, string>
  body?: string
  host?: string
}

interface Event {
  event: string
  data: string
}

interface Stream {
  status: number
  type: string
  /** The first event matching `test`, waiting up to the timeout. */
  next(test: (event: Event) => boolean): Promise<Event>
  close(): void
}

interface Posted {
  seq: number
  id: string
}

function typeOf(headers: IncomingHttpHeaders): string {
  return String(headers['content-type'] ?? '')
}

function json(reply: Reply, what: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(reply.text)
  } catch {
    fail(`${what}: the body is not JSON: ${reply.text.slice(0, 200)}`)
  }
  ok(typeof value === 'object' && value !== null && !Array.isArray(value), `${what}: not an object`)
  return value as Record<string, unknown>
}

function expectStatus(reply: Reply, status: number, what: string): void {
  strictEqual(reply.status, status, `${what}: expected ${status}, got ${reply.status}`)
}

function expectHeader(value: unknown, what: string): void {
  ok(typeof value === 'object' && value !== null, `${what}: not an object`)
  const header = value as Record<string, unknown>
  ok(typeof header.seq === 'number', `${what}: seq is not a number`)
  ok(typeof header.id === 'string', `${what}: id is not a string`)
  ok(typeof header.createdAt === 'string', `${what}: createdAt is not a string`)
  for (const field of ['title', 'cwd', 'branch']) {
    const type = typeof header[field]
    ok(header[field] === null || type === 'string', `${what}: ${field} is ${type}`)
  }
}

function eventJson(data: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(data)
    if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  } catch {
    // Reported below.
  }
  fail(`an event's data is not JSON: ${data.slice(0, 200)}`)
}

function withoutTime(document: Record<string, unknown>): Record<string, unknown> {
  const { generatedAt: _, ...rest } = document
  return rest
}

function parseEvents(text: string): { events: Event[]; rest: string } {
  const blocks = text.replace(/\r\n?/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  const events: Event[] = []
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    // A comment-only block, such as a heartbeat, is no event.
    if (data.length > 0) events.push({ event, data: data.join('\n') })
  }
  return { events, rest }
}

class Client {
  readonly #base: URL
  readonly #timeout: number

  constructor(target: ContractTarget) {
    this.#base = new URL(`${target.base.replace(/\/+$/, '')}/`)
    this.#timeout = target.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** `path` relative to base, or absolute (`/health`) from the origin. */
  url(path: string): URL {
    return path.startsWith('/') ? new URL(path, this.#base.origin) : new URL(path, this.#base)
  }

  #open(url: URL, options: Options) {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    return send(url, {
      method: options.method ?? 'GET',
      headers: { ...options.headers, host: options.host ?? url.host },
      agent: false,
      timeout: this.#timeout,
    })
  }

  fetch(path: string, slug: string, options: Options = {}): Promise<Reply> {
    const url = this.url(path)
    return new Promise((resolve, reject) => {
      const outgoing = this.#open(url, {
        ...options,
        headers: { 'x-vui-contract': slug, ...options.headers },
      })
      outgoing.on('timeout', () => outgoing.destroy(new Error(`${url.pathname}: timed out`)))
      outgoing.on('error', reject)
      outgoing.on('response', (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('error', reject)
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, text })
        })
      })
      outgoing.end(options.body)
    })
  }

  stream(path: string, slug: string): Promise<Stream> {
    const url = this.url(path)
    const timeout = this.#timeout
    return new Promise((resolve, reject) => {
      const outgoing = this.#open(url, {
        headers: { accept: 'text/event-stream', 'x-vui-contract': slug },
      })
      outgoing.on('timeout', () => outgoing.destroy(new Error(`${url.pathname}: timed out`)))
      outgoing.on('error', reject)
      outgoing.on('response', (incoming) => {
        // A stream is meant to stay quiet between events.
        outgoing.setTimeout(0)
        const events: Event[] = []
        const waiting = new Set<() => void>()
        let rest = ''
        incoming.setEncoding('utf8')
        incoming.on('data', (chunk: string) => {
          const parsed = parseEvents(rest + chunk)
          rest = parsed.rest
          events.push(...parsed.events)
          for (const check of waiting) check()
        })
        incoming.on('error', () => undefined)
        resolve({
          status: incoming.statusCode ?? 0,
          type: typeOf(incoming.headers),
          close: () => outgoing.destroy(),
          next: (test) =>
            new Promise((done, failed) => {
              const timer = setTimeout(() => {
                waiting.delete(check)
                const seen = events.map((event) => event.event).join(', ') || 'none'
                failed(new Error(`no matching event within ${timeout} ms; seen: ${seen}`))
              }, timeout)
              // Runs in the stream's `data` listener, where a throw would end the process.
              function check() {
                let found: Event | undefined
                try {
                  found = events.find(test)
                } catch (error) {
                  clearTimeout(timer)
                  waiting.delete(check)
                  failed(error)
                  return
                }
                if (found === undefined) return
                clearTimeout(timer)
                waiting.delete(check)
                done(found)
              }
              waiting.add(check)
              check()
            }),
        })
      })
      outgoing.end()
    })
  }
}

/** The cases for `target`, in the order they must run. */
export function contractCases(target: ContractTarget): ContractCase[] {
  const client = new Client(target)
  const auth: Record<string, string> =
    target.token === undefined ? {} : { authorization: `Bearer ${target.token}` }
  const title = `vadd-ui contract ${randomBytes(4).toString('hex')}`
  // Relaxed JSON (§5.1), so the read case can prove the server stores the canonical form.
  const source = `{title: '${title}', body: [{type: 'callout', tone: 'info', text: 'Contract check'}]}`
  let stream: Stream | undefined
  let posted: Posted | undefined

  const write = (slug: string, body: string, headers: Record<string, string> = auth) =>
    client.fetch('api/docs', slug, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    })

  const stored = (): Posted => {
    ok(posted !== undefined, `nothing was stored by "${CONTRACT_CASES[3]}"`)
    return posted
  }

  const newest = async (slug: string, what: string): Promise<number> => {
    let seq = stored().seq
    for (;;) {
      const reply = await client.fetch(`api/docs?after=${seq}&limit=500`, slug)
      expectStatus(reply, 200, what)
      const docs = json(reply, what).docs
      ok(Array.isArray(docs), `${what}: docs is not an array`)
      if (docs.length === 0) return seq
      const last = (docs.at(-1) as Partial<Posted> | undefined)?.seq
      // A list that ignores `after` would answer the same page forever.
      ok(typeof last === 'number' && last > seq, `${what}: after is not honoured`)
      seq = last
    }
  }

  /** `refuse` stores nothing: the newest seq is the same before and after it. */
  const storesNothing = async (slug: string, what: string, refuse: () => Promise<void>) => {
    const before = await newest(slug, what)
    await refuse()
    strictEqual(await newest(slug, what), before, `${what}: a refused write was stored`)
  }

  const runs: Record<(typeof SLUGS)[number], () => Promise<void>> = {
    async health() {
      const reply = await client.fetch('/health', 'health')
      expectStatus(reply, 200, 'GET /health')
      const body = json(reply, 'GET /health')
      strictEqual(body.ok, true, 'GET /health: ok is not true')
      ok(typeof body.version === 'string', 'GET /health: version is not a string')
      ok(typeof body.workspaceHash === 'string', 'GET /health: workspaceHash is not a string')
    },

    async feed() {
      const reply = await client.fetch('', 'feed')
      expectStatus(reply, 200, 'GET /')
      ok(typeOf(reply.headers).startsWith('text/html'), `GET /: type ${typeOf(reply.headers)}`)
    },

    async events() {
      stream = await client.stream('api/events', 'events')
      strictEqual(stream.status, 200, `GET /api/events: expected 200, got ${stream.status}`)
      ok(stream.type.startsWith('text/event-stream'), `GET /api/events: type ${stream.type}`)
      const first = await stream.next(() => true)
      strictEqual(first.event, 'hello', `GET /api/events: first event is ${first.event}`)
      const hello = JSON.parse(first.data) as { version?: unknown }
      ok(typeof hello.version === 'string', 'hello: version is not a string')
    },

    async write() {
      try {
        const reply = await write('write', source)
        const body = json(reply, 'POST /api/docs')
        ok(typeof body.seq === 'number', 'POST /api/docs: seq is not a number')
        ok(typeof body.id === 'string', 'POST /api/docs: id is not a string')
        // Before the status check: a stored document is what the later cases read.
        posted = { seq: body.seq, id: body.id }
        expectStatus(reply, 201, 'POST /api/docs')
        ok(typeof body.url === 'string', 'POST /api/docs: url is not a string')
        ok(typeof body.clients === 'number', 'POST /api/docs: clients is not a number')
        ok(stream !== undefined, `no event stream from "${CONTRACT_CASES[2]}"`)
        ok(body.clients >= 1, `POST /api/docs: clients is ${body.clients} with a stream open`)
        const event = await stream.next(
          ({ event, data }) => event === 'doc' && eventJson(data).seq === body.seq,
        )
        const header = eventJson(event.data)
        expectHeader(header, 'doc event')
        strictEqual(header.id, body.id, 'doc event: id differs from the write reply')
        strictEqual(header.title, title, 'doc event: title differs')
      } finally {
        stream?.close()
        stream = undefined
      }
    },

    async read() {
      const { id } = stored()
      const reply = await client.fetch(`api/docs/${encodeURIComponent(id)}`, 'read')
      expectStatus(reply, 200, 'GET /api/docs/<id>')
      const type = typeOf(reply.headers)
      ok(type.startsWith(MEDIA_TYPE) || type.startsWith('application/json'), `type ${type}`)
      const canonical = validateText(source).document as unknown as Record<string, unknown>
      deepStrictEqual(
        withoutTime(json(reply, 'GET /api/docs/<id>')),
        withoutTime(canonical),
        'GET /api/docs/<id>: not the canonical document',
      )
    },

    async list() {
      const { seq, id } = stored()
      const page = await client.fetch(`api/docs?after=${seq - 1}&limit=1`, 'list')
      expectStatus(page, 200, 'GET /api/docs')
      const docs = json(page, 'GET /api/docs').docs
      ok(Array.isArray(docs), 'GET /api/docs: docs is not an array')
      strictEqual(docs.length, 1, `GET /api/docs?limit=1: ${docs.length} headers`)
      expectHeader(docs[0], 'GET /api/docs')
      deepStrictEqual(
        [docs[0].seq, docs[0].id, docs[0].title],
        [seq, id, title],
        'GET /api/docs: not the stored header',
      )
      const later = await client.fetch(`api/docs?after=${seq}`, 'list')
      expectStatus(later, 200, 'GET /api/docs')
      const after = json(later, 'GET /api/docs').docs as { seq: number }[]
      ok(
        Array.isArray(after) && after.every((header) => header.seq > seq),
        'GET /api/docs: after is not exclusive',
      )
    },

    async standalone() {
      const { id } = stored()
      const reply = await client.fetch(`docs/${encodeURIComponent(id)}.html`, 'standalone')
      expectStatus(reply, 200, 'GET /docs/<id>.html')
      ok(typeOf(reply.headers).startsWith('text/html'), 'GET /docs/<id>.html: not HTML')
      ok(reply.text.includes(`type="${MEDIA_TYPE}"`), 'GET /docs/<id>.html: no embedded document')
      ok(reply.text.includes(title), 'GET /docs/<id>.html: not this document')
    },

    async invalid() {
      const reply = await write('invalid', "{body: [{type: 'stats'}], density: 7}")
      expectStatus(reply, 422, 'POST /api/docs (invalid)')
      const body = json(reply, 'POST /api/docs (invalid)')
      strictEqual(body.ok, false, 'POST /api/docs (invalid): ok is not false')
      const diagnostics = body.diagnostics as { severity?: unknown; code?: unknown }[]
      ok(Array.isArray(diagnostics), 'POST /api/docs (invalid): no diagnostics')
      ok(
        diagnostics.some((d) => d.severity === 'error' && typeof d.code === 'string'),
        'POST /api/docs (invalid): no error diagnostic',
      )
    },

    async auth() {
      await storesNothing('auth', 'POST /api/docs without the token', async () => {
        for (const [label, headers] of [
          ['no token', {}],
          ['a wrong token', { authorization: `Bearer ${target.token}x` }],
        ] as const) {
          const reply = await write('auth', source, headers)
          expectStatus(reply, 401, `POST /api/docs with ${label}`)
        }
      })
    },

    async size() {
      await storesNothing('size', 'POST /api/docs over 256 KiB', async () => {
        const padding = 'x'.repeat(LIMITS.inputBytes)
        const reply = await write('size', `{title: '${padding}', body: []}`)
        expectStatus(reply, 413, 'POST /api/docs over 256 KiB')
      })
    },

    async miss() {
      const unknown = `0-vui-contract-${randomBytes(4).toString('hex')}`
      for (const path of [`api/docs/${unknown}`, 'no-such-route', `docs/${unknown}.html`]) {
        const reply = await client.fetch(path, 'miss')
        expectStatus(reply, 404, `GET /${path}`)
      }
    },

    async host() {
      for (const path of ['/health', 'api/docs']) {
        const port = client.url(path).port
        const host = port === '' ? FOREIGN_HOST : `${FOREIGN_HOST}:${port}`
        const reply = await client.fetch(path, 'host', { host })
        ok(
          reply.status >= 400 && reply.status < 500,
          `GET ${path} with Host ${host}: expected a 4xx, got ${reply.status}`,
        )
      }
    },
  }

  return SLUGS.map((slug, index) => {
    const name = CONTRACT_CASES[index] as string
    if (slug === 'auth' && target.token === undefined) {
      return { name: `${name}${SKIPPED}`, run: async () => undefined }
    }
    if (slug === 'events' || slug === 'write') return { name, run: runs[slug] }
    // A host that runs cases one by one may skip the write, which closes the stream.
    return {
      name,
      run: () => {
        stream?.close()
        stream = undefined
        return runs[slug]()
      },
    }
  })
}

/** Every case, in order; one failure does not stop the rest. Never throws. */
export async function runContract(target: ContractTarget): Promise<ContractResult[]> {
  const results: ContractResult[] = []
  for (const { name, run } of contractCases(target)) {
    try {
      await run()
      results.push(name.endsWith(SKIPPED) ? { name, ok: true, skipped: true } : { name, ok: true })
    } catch (error) {
      results.push({
        name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
