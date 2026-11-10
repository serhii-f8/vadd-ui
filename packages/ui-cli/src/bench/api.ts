// VD-149: §14.3's token-counting API. Raw `fetch`, since the CLI takes no third-party
// dependency for this. The key goes into one header and nowhere else: no message built here
// holds it, and a failure never falls back to the offline counter, because the report must
// say which counter ran.
import { CliError, EXIT } from '../outcome.js'
import { type Counter, offlineCounter } from './tokens.js'

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MODEL = 'claude-opus-5-5'
const API_VERSION = '2023-06-01'
const TIMEOUT_MS = 30_000
/** Counted alone to learn the framing; assumed to be one token. */
const PROBE = '.'
/** Rate limited (429) or overloaded (529): tried again, up to this many times. */
const RETRIES = 3
const RETRY_STATUSES = new Set([429, 529])
const MAX_RETRY_DELAY_MS = 10_000
/** What `fetch` accepts in a header; anything else would be quoted back in its error. */
const HEADER_VALUE = /^[\x21-\x7e]+$/

export interface ApiEnv {
  key: string
  baseUrl?: string
  model?: string
  /** When the server sends no `retry-after`. Tests set 0. */
  retryDelayMs?: number
}

function apiError(reason: string): CliError {
  return new CliError(EXIT.io, 'token-api', `token counting API: ${reason}`)
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function retryDelay(response: Response, fallback: number): number {
  const seconds = Number(response.headers.get('retry-after'))
  const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : fallback
  return Math.min(ms, MAX_RETRY_DELAY_MS)
}

export function apiCounter(env: ApiEnv, fetchImpl: typeof fetch = fetch): Counter {
  const model = env.model || DEFAULT_MODEL
  const url = `${(env.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/messages/count_tokens`
  const fallbackDelay = env.retryDelayMs ?? 1000
  /** Belt and braces: no reason built here should hold the key, but none can. */
  const scrub = (reason: string) => reason.replaceAll(env.key, '***')

  async function post(text: string): Promise<Response> {
    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: {
          'x-api-key': env.key,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }] }),
        // A redirect would carry the key to wherever it points.
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
      throw apiError(scrub(cause instanceof Error ? cause.message : String(cause)))
    }
  }

  async function raw(text: string): Promise<number> {
    // `fetch` quotes a bad header value in its error, so the key is checked before it is sent.
    if (!HEADER_VALUE.test(env.key)) throw apiError('ANTHROPIC_API_KEY is not a valid header value')
    let response = await post(text)
    for (let retry = 0; retry < RETRIES && RETRY_STATUSES.has(response.status); retry++) {
      await sleep(retryDelay(response, fallbackDelay))
      response = await post(text)
    }
    // The body of a failure is not echoed: it is the server's text, and could quote the key.
    if (!response.ok) throw apiError(`HTTP ${response.status}`)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    const tokens = (body as { input_tokens?: unknown } | undefined)?.input_tokens
    if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
      throw apiError('the answer has no input_tokens')
    }
    return tokens
  }

  let framing: Promise<number> | undefined
  return {
    describe: { kind: 'api', model },
    async count(text: string): Promise<number> {
      if (text === '') return 0
      framing ??= raw(PROBE).then((tokens) => tokens - 1)
      const [overhead, tokens] = [await framing, await raw(text)]
      return Math.max(0, tokens - overhead)
    },
  }
}

/** §14.3: the API when a key is configured, the pinned offline estimate otherwise. */
export async function selectCounter(env: NodeJS.ProcessEnv): Promise<Counter> {
  const key = env.ANTHROPIC_API_KEY
  if (!key) return offlineCounter()
  return apiCounter({ key, baseUrl: env.ANTHROPIC_BASE_URL, model: env.VUI_BENCH_MODEL })
}
