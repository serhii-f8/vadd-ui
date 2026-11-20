import type { Diagnostic, VuiDocument } from '@vadd/ui-spec'
import { CliError, EXIT, noHost } from '../outcome.js'
import type { System } from '../system.js'

const POST_TIMEOUT_MS = 5_000
const HEALTH_TIMEOUT_MS = 2_000
/** VD-116: `Retry-After: 1`. */
const RETRY_MS = 1_000
const RETRIES = 2
const CREATED = 201
const TOO_LARGE = 413
const INVALID = 422
const BUSY = 429
const INSUFFICIENT_STORAGE = 507
const UNAUTHORIZED = 401

/** The §4.1 HTTP interface somewhere: `<base>/api/docs`. */
export interface Target {
  base: string
  token?: string
}

export type Posted =
  | { kind: 'delivered'; seq: number; id: string; url: string; clients: number; replaced?: true }
  | { kind: 'refused'; diagnostics: Diagnostic[] }
  | { kind: 'unreachable' }

/** §4.1 and §4.4. `undefined` when the variable is unset. */
export function customEndpoint(env: NodeJS.ProcessEnv): Target | undefined {
  const { VUI_VIEWER_URL: url, VUI_VIEWER_TOKEN: token } = env
  if (!url) return undefined
  let parsed: URL | undefined
  try {
    parsed = new URL(url)
  } catch {
    parsed = undefined
  }
  if (parsed?.protocol !== 'http:' && parsed?.protocol !== 'https:') {
    throw noHost('VUI_VIEWER_URL is not an http or https URL')
  }
  const base = url.replace(/\/+$/, '')
  return token ? { base, token } : { base }
}

export interface Health {
  version?: string
}

/** `/health` sits at the origin, with no token (§4.1), whatever prefix `base` has. */
export async function healthOf(target: Target): Promise<Health | undefined> {
  try {
    const url = `${new URL(target.base).origin}/health`
    const reply = await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    if (!reply.ok) return undefined
    const { version } = (await reply.json()) as { version?: unknown }
    return typeof version === 'string' ? { version } : {}
  } catch {
    return undefined
  }
}

async function send(target: Target, body: string, query: string): Promise<Response | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (target.token !== undefined) headers.Authorization = `Bearer ${target.token}`
  try {
    const signal = AbortSignal.timeout(POST_TIMEOUT_MS)
    const url = `${target.base}/api/docs${query}`
    return await fetch(url, { method: 'POST', headers, body, signal })
  } catch {
    return undefined
  }
}

async function bodyOf(reply: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await reply.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function delivered(body: Record<string, unknown>, target: Target): Posted {
  const { seq, id, url, clients, replaced } = body
  if (typeof seq !== 'number' || typeof id !== 'string') {
    throw noHost('the Viewer gave a reply this CLI cannot read')
  }
  return {
    kind: 'delivered',
    seq,
    id,
    url: typeof url === 'string' ? url : `${target.base}/`,
    clients: typeof clients === 'number' ? clients : 0,
    ...(replaced === true ? { replaced: true as const } : {}),
  }
}

/** One document to `target`, and every answer VD-116 can give. No message holds a token. */
export async function postDocument(
  target: Target,
  document: VuiDocument,
  system: System,
  /** `namingQuery`'s, or none. */
  query = '',
): Promise<Posted> {
  const body = JSON.stringify(document)
  for (let attempt = 0; ; attempt++) {
    const reply = await send(target, body, query)
    if (reply === undefined) return { kind: 'unreachable' }
    if (reply.status === BUSY && attempt < RETRIES) {
      await system.sleep(RETRY_MS)
      continue
    }
    if (reply.status === CREATED) return delivered(await bodyOf(reply), target)
    if (reply.status === INVALID) {
      const { diagnostics } = await bodyOf(reply)
      return { kind: 'refused', diagnostics: (diagnostics ?? []) as Diagnostic[] }
    }
    if (reply.status === TOO_LARGE) {
      throw new CliError(
        EXIT.limit,
        'limit-input-size',
        'the Viewer refused the document as too large',
      )
    }
    if (reply.status === INSUFFICIENT_STORAGE) {
      // VD-160: the Viewer is up and its disk is not, so this is an I/O failure, not "no host".
      throw new CliError(EXIT.io, 'io', 'the Viewer cannot store documents')
    }
    if (reply.status === UNAUTHORIZED) throw noHost('the Viewer refused the write token')
    if (reply.status === BUSY) throw noHost('the Viewer is refusing writes for now')
    throw noHost(`the Viewer answered ${reply.status}`)
  }
}
