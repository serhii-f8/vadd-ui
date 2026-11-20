import type { DocHeader } from '../doc-header.js'

const EVENTS = 'api/events'
const PAGE = 500
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]
const GONE = 404
const OK = 200
/** Past this a read has failed, or a stopped Viewer would stop the feed with it. */
const READ_MS = 10_000
/** `EventSource` cannot see the heartbeat (VD-113), so a live connection has to ask. */
const CHECK_MS = 30_000

export type Status = 'connecting' | 'live' | 'reconnecting' | 'gone'

/** The part of `EventSource` this uses. */
export interface SourceLike {
  addEventListener(type: string, listener: (event: { data: string }) => void): void
  close(): void
}

/** The part of a `fetch` reply this uses. */
interface ReplyLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface StreamOptions {
  open: (url: string) => SourceLike
  fetch: (url: string) => Promise<ReplyLike>
  onDocs: (headers: DocHeader[]) => void
  /** An entry already shown was replaced in place (`--replace`, VD-212). */
  onUpdate?: (header: DocHeader) => void
  onStatus: (status: Status) => void
}

function isHeader(value: unknown): value is DocHeader {
  if (typeof value !== 'object' || value === null) return false
  const { seq, id } = value as Partial<DocHeader>
  return typeof seq === 'number' && typeof id === 'string'
}

function pageOf(body: unknown): DocHeader[] | undefined {
  const docs = (body as { docs?: unknown } | null)?.docs
  return Array.isArray(docs) && docs.every(isHeader) ? docs : undefined
}

function parseHeader(data: string): DocHeader | undefined {
  try {
    const value: unknown = JSON.parse(data)
    return isHeader(value) ? value : undefined
  } catch {
    return undefined
  }
}

function timed<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), READ_MS)
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

/**
 * The feed's connection. `hello` starts every fill: the hub writes it and registers the
 * client in one tick, so whatever a fill's read misses reaches the stream (VD-118). A fill
 * alone moves `lastSeq` past a gap, and only in order, so a failure leaves no hole.
 */
export function startStream({ open, fetch, onDocs, onUpdate, onStatus }: StreamOptions): {
  close: () => void
} {
  let lastSeq = 0
  let source: SourceLike | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Names the current connection, so work begun for an older one stops. */
  let generation = 0
  let attempts = 0
  let filling = false
  let dirty = false

  const deliver = (headers: DocHeader[]): void => {
    const fresh = headers.filter(({ seq }) => seq > lastSeq)
    const last = fresh[fresh.length - 1]
    if (last === undefined) return
    lastSeq = last.seq
    onDocs(fresh)
  }

  const halt = (): void => {
    generation += 1
    filling = false
    source?.close()
    source = undefined
    clearTimeout(timer)
  }

  const gone = (): void => {
    halt()
    onStatus('gone')
  }

  const retry = (): void => {
    const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]
    attempts += 1
    timer = setTimeout(connect, delay)
  }

  /** `undefined` for no answer. An `EventSource` hides its status, so this is what shows it. */
  const probe = (): Promise<number | undefined> =>
    timed(fetch(`api/docs?after=${lastSeq}&limit=1`)).then(
      (reply) => reply.status,
      () => undefined,
    )

  const lost = async (): Promise<void> => {
    halt()
    onStatus('reconnecting')
    const mine = generation
    const status = await probe()
    if (mine !== generation) return
    if (status === GONE) gone()
    else retry()
  }

  const check = async (): Promise<void> => {
    const mine = generation
    const status = await probe()
    if (mine !== generation) return
    if (status === GONE) gone()
    else if (status === OK) timer = setTimeout(check, CHECK_MS)
    else void lost()
  }

  /** One read. `undefined` when the fill has to end, with that already dealt with. */
  const readPage = async (mine: number): Promise<DocHeader[] | undefined> => {
    let status: number | undefined
    let page: DocHeader[] | undefined
    try {
      const reply = await timed(fetch(`api/docs?after=${lastSeq}&limit=${PAGE}`))
      status = reply.status
      if (reply.ok) page = pageOf(await timed(reply.json()))
    } catch {
      // A failed read and an unreadable reply end the same way, below.
    }
    if (mine !== generation) return undefined
    if (page !== undefined) return page
    if (status === GONE) gone()
    else void lost()
    return undefined
  }

  const fill = async (): Promise<void> => {
    const mine = generation
    filling = true
    for (;;) {
      dirty = false
      const page = await readPage(mine)
      if (page === undefined) return
      deliver(page)
      if (page.length < PAGE && !dirty) break
    }
    filling = false
    attempts = 0
    onStatus('live')
    timer = setTimeout(check, CHECK_MS)
  }

  const onDoc = (data: string): void => {
    const header = parseHeader(data)
    if (header === undefined) return
    if (filling) dirty = true
    else deliver([header])
  }

  /** One past `lastSeq` is not shown yet, and the fill reads it with its new content. */
  const onUpdated = (data: string): void => {
    const header = parseHeader(data)
    if (header !== undefined && header.seq <= lastSeq) onUpdate?.(header)
  }

  function connect(): void {
    generation += 1
    const opened = generation
    const stream = open(EVENTS)
    source = stream
    stream.addEventListener('hello', () => {
      if (opened === generation) void fill()
    })
    stream.addEventListener('doc', ({ data }) => {
      if (opened === generation) onDoc(data)
    })
    stream.addEventListener('update', ({ data }) => {
      if (opened === generation) onUpdated(data)
    })
    // `EventSource` retries by itself with no backoff, and not at all after a non-200.
    stream.addEventListener('error', () => {
      if (opened === generation) void lost()
    })
  }

  onStatus('connecting')
  connect()
  return { close: halt }
}
