import type { ServerResponse } from 'node:http'
import type { DocHeader } from './store.js'

export const HEARTBEAT_MS = 15_000
export const MAX_CLIENTS = 50

// A comment: §4.1 names only `doc` and `hello`, and clients skip it (VD-113).
const HEARTBEAT = ': heartbeat\n\n'

export interface SseHubOptions {
  version: string
  /** Called with the new count whenever a client joins or leaves. */
  onChange?: (clients: number) => void
}

function docFrame(header: DocHeader): string {
  return `id: ${header.seq}\nevent: doc\ndata: ${JSON.stringify(header)}\n\n`
}

export class SseHub {
  readonly #version: string
  readonly #onChange: (clients: number) => void
  readonly #clients = new Set<ServerResponse>()
  #heartbeat: NodeJS.Timeout | undefined

  constructor({ version, onChange }: SseHubOptions) {
    this.#version = version
    this.#onChange = onChange ?? (() => undefined)
  }

  get count(): number {
    return this.#clients.size
  }

  /** False when full, with `res` untouched. `replay` goes out before anything live. */
  open(res: ServerResponse, replay: readonly DocHeader[]): boolean {
    if (this.count >= MAX_CLIENTS) return false
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`event: hello\ndata: ${JSON.stringify({ version: this.#version })}\n\n`)
    for (const header of replay) res.write(docFrame(header))
    res.on('close', () => this.#remove(res))
    this.#clients.add(res)
    this.#heartbeat ??= setInterval(() => this.#send(HEARTBEAT), HEARTBEAT_MS).unref()
    this.#onChange(this.count)
    return true
  }

  broadcast(header: DocHeader): void {
    this.#send(docFrame(header))
  }

  close(): void {
    for (const res of [...this.#clients]) {
      res.end()
      this.#remove(res)
    }
  }

  #send(frame: string): void {
    for (const res of this.#clients) res.write(frame)
  }

  #remove(res: ServerResponse): void {
    if (!this.#clients.delete(res)) return
    if (this.count === 0) {
      clearInterval(this.#heartbeat)
      this.#heartbeat = undefined
    }
    this.#onChange(this.count)
  }
}
