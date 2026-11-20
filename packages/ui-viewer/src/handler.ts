import type { IncomingMessage, ServerResponse } from 'node:http'
import { version as packageVersion } from '@vadd/ui'
import {
  isJsonObject,
  type JsonValue,
  LIMITS,
  MEDIA_TYPE,
  usesExt,
  type VuiDocument,
  validateText,
} from '@vadd/ui-spec'
import { type FeedAssets, feedHtml, readFeedScript } from './feed.js'
import { isAllowedHost, readBody, tokensMatch, WriteLimiter } from './request.js'
import { SseHub } from './sse.js'
import type { DocHeader, DocStore } from './store.js'
import { GENERATOR_LABEL, inlineHtml, readBundle } from './visual-file.js'

/** §15.3, exactly. */
const FEED_CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"

/** VD-006, exactly. A visual file holds an inline script, which `FEED_CSP` would block. */
const STANDALONE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'"

/** Read past the limit up to here, so the client is reading when its 413 arrives, not reset. */
const DRAIN_BYTES = 1024 * 1024
const DEFAULT_PAGE = 100
const MAX_PAGE = 500
const PREFIX = /^\/v\/([^/]+)(\/.*)$/
const API_DOC = /^\/api\/docs\/([^/]+)$/
const STANDALONE = /^\/docs\/([^/]+)\.html$/
const DIGITS = /^\d+$/
const BEARER = /^Bearer (.+)$/i

const HTML = 'text/html; charset=utf-8'
const SCRIPT = 'text/javascript; charset=utf-8'
const JSON_TYPE = 'application/json'

export interface ViewerHandlerOptions {
  store: DocStore
  readToken: string
  writeToken: string
  /** The port the host listens on, for the `Host` check and `url`. A function, since a
   *  server that binds after building this handler learns its port later. */
  port: () => number
  workspaceHash: string
  /** Defaults to the feed app. */
  feed?: FeedAssets
  now?: () => number
  /** Called with the client count after each document and each client joining or leaving. */
  onActivity?: (clients: number) => void
}

/** A plain Node listener: `http.createServer(handler)`, or `reply.hijack()` in Fastify. */
export interface ViewerHandler {
  (req: IncomingMessage, res: ServerResponse): void
  clients: () => number
  /** Ends every event stream and stops the heartbeat. */
  close: () => void
}

interface Context {
  req: IncomingMessage
  res: ServerResponse
  query: URLSearchParams
}

type Action = (context: Context) => void | Promise<void>

/** The methods of a path. Anything else there is 405. */
type Route = Record<string, Action>

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string,
  headers: Record<string, string> = {},
): void {
  // Set here, so a HEAD (whose body Node drops) carries the same headers as its GET (B11).
  const length = String(Buffer.byteLength(body))
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': length, ...headers })
  res.end(body)
}

function sendJson(
  res: ServerResponse,
  status: number,
  value: unknown,
  headers?: Record<string, string>,
): void {
  send(res, status, JSON_TYPE, JSON.stringify(value), headers)
}

/** One body for every miss, so a wrong token and a wrong path look the same (§15.3). */
function notFound(res: ServerResponse): void {
  send(res, 404, 'text/plain', 'not found\n')
}

function refuse(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { ok: false, error })
}

/** A Node file-system error: it has a `code` and the `syscall` that failed. */
function isFsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'syscall' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  )
}

/** VD-123: the standalone file is shared, so it holds no local path (the feed copy keeps them). */
function withoutPaths(document: VuiDocument): VuiDocument {
  const { cwd: _cwd, branch: _branch, ...meta } = document.meta as Record<string, unknown>
  return { ...document, meta }
}

/** The value of a whole-number query field, its default when absent, `undefined` when bad. */
function numberParam(query: URLSearchParams, name: string, fallback: number): number | undefined {
  const text = query.get(name)
  if (text === null) return fallback
  return DIGITS.test(text) ? Number(text) : undefined
}

function decode(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

export function viewerUrl(port: number, readToken: string): string {
  return `http://localhost:${port}/v/${readToken}/`
}

/** §4.1's HTTP interface, with §15.3's controls and VD-006's additions, on any Node server. */
export function createViewerHandler(options: ViewerHandlerOptions): ViewerHandler {
  const { store, readToken, writeToken, port, workspaceHash } = options
  const { now = Date.now, onActivity } = options
  const html = options.feed?.html ?? feedHtml
  let script = options.feed?.script
  const hub = new SseHub({ version: packageVersion, onChange: onActivity })
  const limiter = new WriteLimiter()
  /** The core and the ext bundle (VD-182), each read on first use. */
  const bundles: (string | undefined)[] = []

  const isWriter = ({ headers }: IncomingMessage): boolean => {
    const token = BEARER.exec(headers.authorization ?? '')?.[1]
    return token !== undefined && tokensMatch(token, writeToken)
  }

  const listDocs: Action = ({ res, query }) => {
    const after = numberParam(query, 'after', 0)
    const limit = numberParam(query, 'limit', DEFAULT_PAGE)
    if (after === undefined || limit === undefined || limit < 1 || limit > MAX_PAGE) {
      refuse(res, 400, 'bad-query')
      return
    }
    sendJson(res, 200, { docs: store.after(after, limit) })
  }

  const events: Action = ({ req, res }) => {
    if (req.method === 'HEAD') {
      // The headers of a stream, and no client: a HEAD would never read one.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end()
      return
    }
    const last = req.headers['last-event-id']
    const replay = typeof last === 'string' && DIGITS.test(last) ? Number(last) : undefined
    const headers = replay === undefined ? [] : store.after(replay, MAX_PAGE)
    if (!hub.open(req, res, headers)) {
      res.setHeader('Retry-After', '5')
      refuse(res, 503, 'too-many-clients')
    }
  }

  const writeDoc: Action = async ({ req, res }) => {
    if (!isWriter(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' })
      return
    }
    const tooLarge = () => {
      sendJson(res, 413, { ok: false, error: 'too-large' }, { Connection: 'close' })
    }
    if (Number(req.headers['content-length']) > DRAIN_BYTES) {
      tooLarge()
      return
    }
    const bytes = await readBody(req, LIMITS.inputBytes, DRAIN_BYTES)
    if (bytes === 'too-large') {
      tooLarge()
      return
    }
    // Here, not at the headers, or a held-open request could spend an old second's budget.
    if (!limiter.allow(now())) {
      sendJson(res, 429, { ok: false, error: 'rate-limited' }, { 'Retry-After': '1' })
      return
    }
    const text = decode(bytes)
    if (text === undefined) {
      refuse(res, 400, 'not-utf-8')
      return
    }
    // The whole of §13, whose parser survives any nesting a 256 KiB body can hold.
    const generatedAt = new Date(now()).toISOString()
    const { ok, diagnostics, document } = validateText(text, { generatedAt })
    if (!ok || document === undefined) {
      sendJson(res, 422, { ok: false, diagnostics })
      return
    }
    let header: DocHeader
    try {
      header = store.add(document)
    } catch (error) {
      // VD-160: a failed write to `docs/` is the host's disk, not a bug; anything else stays a 500.
      if (!isFsError(error)) throw error
      sendJson(res, 507, { ok: false, error: 'storage' })
      return
    }
    hub.broadcast(header)
    onActivity?.(hub.count)
    const url = viewerUrl(port(), readToken)
    sendJson(res, 201, { seq: header.seq, id: header.id, url, clients: hub.count })
  }

  const routes: Record<string, Route> = {
    '/': {
      GET: ({ res }) => send(res, 200, HTML, html, { 'Content-Security-Policy': FEED_CSP }),
    },
    '/app.js': {
      GET: ({ res }) => {
        script ??= readFeedScript()
        send(res, 200, SCRIPT, script)
      },
    },
    '/api/docs': { GET: listDocs, POST: writeDoc },
    '/api/events': { GET: events },
  }

  const docRoute = (id: string): Route => ({
    GET: ({ res }) => {
      const text = store.read(id)
      if (text === undefined) notFound(res)
      else send(res, 200, MEDIA_TYPE, text)
    },
  })

  const standaloneRoute = (id: string): Route => ({
    GET: ({ res }) => {
      const text = store.read(id)
      if (text === undefined) {
        notFound(res)
        return
      }
      const stored = JSON.parse(text) as VuiDocument
      const ext = usesExt(stored)
      const bundle = bundles[Number(ext)] ?? readBundle(ext)
      bundles[Number(ext)] = bundle
      // A `meta` that is not an object is stored as sent, and has no path to strip: it goes as is.
      const shared = isJsonObject(stored.meta as JsonValue) ? withoutPaths(stored) : stored
      const file = inlineHtml(shared, {
        bundle,
        generator: GENERATOR_LABEL,
      })
      send(res, 200, HTML, file, { 'Content-Security-Policy': STANDALONE_CSP })
    },
  })

  const routeOf = (path: string): Route | undefined => {
    if (Object.hasOwn(routes, path)) return routes[path]
    const doc = API_DOC.exec(path)
    if (doc !== null) return docRoute(doc[1] as string)
    const standalone = STANDALONE.exec(path)
    return standalone === null ? undefined : standaloneRoute(standalone[1] as string)
  }

  const respond = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // The URL holds the read token.
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (!isAllowedHost(req.headers.host, port())) {
      refuse(res, 403, 'bad-host')
      return
    }
    const target = req.url ?? '/'
    const mark = target.indexOf('?')
    const path = mark < 0 ? target : target.slice(0, mark)
    // B11: HEAD runs the GET action, and Node sends no body for it.
    const method = req.method === 'HEAD' ? 'GET' : (req.method ?? '')
    if (method === 'GET' && path === '/favicon.ico') {
      res.writeHead(204).end()
      return
    }
    if (method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true, version: packageVersion, workspaceHash })
      return
    }
    const prefixed = PREFIX.exec(path)
    const route = prefixed?.[2] === undefined ? undefined : routeOf(prefixed[2])
    if (
      prefixed === null ||
      route === undefined ||
      !tokensMatch(prefixed[1] as string, readToken)
    ) {
      notFound(res)
      return
    }
    const action = Object.hasOwn(route, method) ? route[method] : undefined
    if (action === undefined) {
      const allowed = Object.keys(route).flatMap((name) =>
        name === 'GET' ? ['GET', 'HEAD'] : [name],
      )
      res.setHeader('Allow', allowed.join(', '))
      refuse(res, 405, 'method-not-allowed')
      return
    }
    const query = new URLSearchParams(mark < 0 ? '' : target.slice(mark + 1))
    await action({ req, res, query })
  }

  const handler = ((req, res) => {
    // Nothing a request does may end the process. A client that left has no reader anyway.
    respond(req, res).catch(() => {
      if (res.headersSent) res.destroy()
      else refuse(res, 500, 'internal')
    })
  }) as ViewerHandler
  handler.clients = () => hub.count
  handler.close = () => hub.close()
  return handler
}
