import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const WRITES_PER_WINDOW = 20
const WINDOW_MS = 1000

/** §15.3 DNS rebinding: a loopback name with the bound port, and nothing else. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (host === undefined) return false
  const lower = host.toLowerCase()
  const colon = lower.lastIndexOf(':')
  return LOOPBACK_NAMES.has(lower.slice(0, colon)) && lower.slice(colon + 1) === String(port)
}

function digest(text: string): Buffer {
  return createHash('sha256').update(text).digest()
}

/** Constant time, and hashing first makes any two lengths comparable. */
export function tokensMatch(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected))
}

/** §15.3 Abuse: ≤ 20 writes in any one second. */
export class WriteLimiter {
  #times: number[] = []

  allow(now: number): boolean {
    // A clock that stepped back must not leave future times holding the window shut.
    this.#times = this.#times.filter((time) => time <= now && now - time < WINDOW_MS)
    if (this.#times.length >= WRITES_PER_WINDOW) return false
    this.#times.push(now)
    return true
  }
}

/**
 * The bytes of a request, or `too-large` if they pass `limit`, which keeps none past it. That
 * answer waits for the end of the body, or for `drain` bytes, whichever comes first.
 */
export function readBody(
  req: IncomingMessage,
  limit: number,
  drain: number,
): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    // A host's own parser may have taken the body, and no event would come.
    if (req.readableEnded) {
      reject(new Error('request body already read'))
      return
    }
    const chunks: Buffer[] = []
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > drain) resolve('too-large')
      else if (bytes <= limit) chunks.push(chunk)
    })
    req.on('end', () => resolve(bytes > limit ? 'too-large' : Buffer.concat(chunks)))
    req.on('error', reject)
    // Runs after `end` too, when this rejection is a no-op.
    req.on('close', () => reject(new Error('request closed early')))
  })
}
