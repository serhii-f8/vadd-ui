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

export interface ApiEnv {
  key: string
  baseUrl?: string
  model?: string
}

function apiError(reason: string): CliError {
  return new CliError(EXIT.io, 'token-api', `token counting API: ${reason}`)
}

export function apiCounter(env: ApiEnv, fetchImpl: typeof fetch = fetch): Counter {
  const model = env.model || DEFAULT_MODEL
  const url = `${(env.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/messages/count_tokens`

  async function raw(text: string): Promise<number> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'x-api-key': env.key,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      // A fetch error names the cause and the URL, never the headers.
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
      throw apiError(cause instanceof Error ? cause.message : String(cause))
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
