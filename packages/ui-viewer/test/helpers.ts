import { mkdtempSync } from 'node:fs'
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FeedAssets, feedHtml } from '../src/feed.js'
import { createViewerHandler, type ViewerHandler } from '../src/handler.js'
import { DocStore } from '../src/store.js'

export const READ = 'r'.repeat(32)
export const WRITE = 'w'.repeat(32)
export const HASH = '0123456789abcdef'
export const BEARER = { authorization: `Bearer ${WRITE}` }

/** Tests run from source, where the built `app.js` does not exist. */
export const FEED: FeedAssets = { html: feedHtml, script: 'feed()' }

/** A port that was free a moment ago, for tests that must name one. */
export async function freePort(): Promise<number> {
  for (;;) {
    // Below the ephemeral range, where another test's `listen(0)` cannot land on it.
    const port = 20_000 + Math.floor(Math.random() * 12_000)
    const server = createServer()
    const free = await new Promise<boolean>((done) => {
      server.once('error', () => done(false))
      server.listen(port, '127.0.0.1', () => done(true))
    })
    if (free) {
      await new Promise((done) => server.close(done))
      return port
    }
  }
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'vui-viewer-'))
}

export interface Reply {
  status: number
  headers: IncomingMessage['headers']
  text: string
  // biome-ignore lint/suspicious/noExplicitAny: each test knows the shape it asserts on.
  json: () => any
}

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
}

/** `node:http`, not `fetch`, which refuses to set the `Host` header these tests depend on. */
export function request(port: number, path: string, options: RequestOptions = {}): Promise<Reply> {
  const { method = 'GET', headers = {}, body } = options
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { host: '127.0.0.1', port, path, method, headers, agent: false },
      (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const { statusCode: status = 0, headers: replyHeaders } = incoming
          resolve({ status, headers: replyHeaders, text, json: () => JSON.parse(text) })
        })
      },
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

export interface Stream {
  text: () => string
  /** Resolves once the stream holds `needle`. */
  until: (needle: string) => Promise<void>
  status: number
  close: () => void
}

export function openStream(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, path, headers, agent: false })
    outgoing.on('response', (incoming) => {
      let text = ''
      const waiting = new Set<() => void>()
      incoming.setEncoding('utf8').on('data', (chunk: string) => {
        text += chunk
        for (const check of waiting) check()
      })
      incoming.on('error', () => undefined)
      resolve({
        text: () => text,
        status: incoming.statusCode ?? 0,
        close: () => outgoing.destroy(),
        until: (needle) =>
          new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`no "${needle}" in: ${text}`)), 2000)
            const check = () => {
              if (!text.includes(needle)) return
              clearTimeout(timer)
              waiting.delete(check)
              done()
            }
            waiting.add(check)
            check()
          }),
      })
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

export interface Served {
  port: number
  dir: string
  store: DocStore
  handler: ViewerHandler
  /** Under the token prefix. */
  get: (path: string, options?: RequestOptions) => Promise<Reply>
  post: (body: string | Buffer | object, headers?: Record<string, string>) => Promise<Reply>
  close: () => Promise<void>
}

type Overrides = Partial<Parameters<typeof createViewerHandler>[0]>

export async function serve(overrides: Overrides = {}): Promise<Served> {
  const dir = tempDir()
  const store = new DocStore(dir)
  let port = 0
  const handler = createViewerHandler({
    store,
    readToken: READ,
    writeToken: WRITE,
    port: () => port,
    workspaceHash: HASH,
    feed: FEED,
    ...overrides,
  })
  const server: Server = createServer(handler)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
  return {
    port,
    dir,
    store,
    handler,
    get: (path, options) => request(port, `/v/${READ}${path}`, options),
    post: (body, headers = BEARER) =>
      request(port, `/v/${READ}/api/docs`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body),
      }),
    close: () =>
      new Promise((done) => {
        handler.close()
        server.close(() => done())
        server.closeAllConnections()
      }),
  }
}
