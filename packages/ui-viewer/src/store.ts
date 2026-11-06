import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  FILE_EXTENSION,
  isJsonObject,
  type JsonValue,
  LIMITS,
  type VuiDocument,
} from '@vadd/ui-spec'

/** §4.1 retention: the newest 500 documents or 50 MiB, whichever is smaller. */
export const MAX_DOCS = 500
export const MAX_BYTES = 50 * 1024 * 1024

const SLUG_LENGTH = 48
const OWNER_ONLY_FILE = 0o600
const OWNER_ONLY_DIR = 0o700
const TEMPORARY_SUFFIX = '.tmp'
const STORED_NAME = /^(\d+)-(.*)\.vui\.json$/

/** §4.1 (`GET /api/docs`). `id` is the file stem and everything else comes from VD-112. */
export interface DocHeader {
  seq: number
  id: string
  title: string | null
  createdAt: string
  cwd: string | null
  branch: string | null
}

interface Entry {
  header: DocHeader
  file: string
  bytes: number
}

export interface DocStoreOptions {
  now?: () => number
  /** Told the file name of anything skipped, and never its contents (§15.1). */
  warn?: (line: string) => void
}

/** §11.5. The result is safe in a path and a URL whatever the title holds. */
export function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (/^[a-z0-9]/.test(slug) ? slug : `v-${slug}`).slice(0, SLUG_LENGTH)
}

function stringOr(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function headerOf(document: VuiDocument, seq: number, id: string, createdAt: string): DocHeader {
  // A mistyped `meta` is only a `warn` (§13.3), so it reaches here as anything.
  const meta = isJsonObject(document.meta as JsonValue | undefined) ? document.meta : undefined
  return {
    seq,
    id,
    title: stringOr(document.title),
    createdAt,
    // `meta` escapes §13.4's string limit, and each header goes to every client.
    cwd: stringOr(meta?.cwd)?.slice(0, LIMITS.string) ?? null,
    branch: stringOr(meta?.branch)?.slice(0, LIMITS.string) ?? null,
  }
}

/**
 * The documents on disk and an index of them. Synchronous on purpose: at ≤ 20 writes/s of
 * ≤ 256 KiB, one tick makes "number, write, index, evict" atomic with no queue. A caller's
 * id only ever meets this index, so no request text reaches a path (§15.3 Surface).
 */
export class DocStore {
  readonly #dir: string
  readonly #now: () => number
  readonly #warn: (line: string) => void
  readonly #byId = new Map<string, Entry>()
  /** Ascending by seq, which is also age. */
  readonly #entries: Entry[] = []
  #bytes = 0
  #lastSeq = 0

  constructor(stateDir: string, options: DocStoreOptions = {}) {
    this.#dir = join(stateDir, 'docs')
    this.#now = options.now ?? Date.now
    this.#warn = options.warn ?? (() => undefined)
    mkdirSync(this.#dir, { recursive: true, mode: OWNER_ONLY_DIR })
    this.#load()
    this.#evict()
  }

  get size(): number {
    return this.#entries.length
  }

  add(document: VuiDocument): DocHeader {
    const seq = this.#lastSeq + 1
    const id = `${seq}-${slugify(stringOr(document.title) ?? '')}`
    const file = join(this.#dir, `${id}${FILE_EXTENSION}`)
    const temporary = `${file}${TEMPORARY_SUFFIX}`
    const text = JSON.stringify(document)
    const created = new Date(this.#now())
    writeFileSync(temporary, text, { mode: OWNER_ONLY_FILE })
    // The file time is `createdAt` after a restart, so it must be this value exactly.
    utimesSync(temporary, created, created)
    renameSync(temporary, file)
    this.#lastSeq = seq
    const header = headerOf(document, seq, id, created.toISOString())
    this.#index({ header, file, bytes: Buffer.byteLength(text) })
    this.#evict()
    return header
  }

  /** Headers with a higher seq, oldest first. */
  after(seq: number, limit: number): DocHeader[] {
    const start = this.#entries.findIndex(({ header }) => header.seq > seq)
    if (start < 0) return []
    return this.#entries.slice(start, start + limit).map(({ header }) => header)
  }

  header(id: string): DocHeader | undefined {
    return this.#byId.get(id)?.header
  }

  read(id: string): string | undefined {
    const entry = this.#byId.get(id)
    if (entry === undefined) return undefined
    try {
      return readFileSync(entry.file, 'utf8')
    } catch {
      return undefined
    }
  }

  #index(entry: Entry): void {
    this.#entries.push(entry)
    this.#byId.set(entry.header.id, entry)
    this.#bytes += entry.bytes
  }

  #load(): void {
    const names = readdirSync(this.#dir)
    // What a crash mid-write left behind, which retention would never see.
    for (const name of names) {
      if (name.endsWith(TEMPORARY_SUFFIX)) rmSync(join(this.#dir, name), { force: true })
    }
    const stored = names
      .map((name) => ({ name, match: STORED_NAME.exec(name) }))
      .flatMap(({ name, match }) => (match ? [{ name, seq: Number(match[1]) }] : []))
      .sort((a, b) => a.seq - b.seq)
    for (const { name, seq } of stored) {
      this.#lastSeq = Math.max(this.#lastSeq, seq)
      try {
        this.#loadOne(name, seq)
      } catch {
        this.#warn(`vui: viewer skipped unreadable document ${name}`)
      }
    }
  }

  #loadOne(name: string, seq: number): void {
    const file = join(this.#dir, name)
    const value = JSON.parse(readFileSync(file, 'utf8')) as JsonValue
    if (!isJsonObject(value)) throw new Error('not a document')
    const { mtime, size } = statSync(file)
    const id = name.slice(0, -FILE_EXTENSION.length)
    const document = value as unknown as VuiDocument
    this.#index({ header: headerOf(document, seq, id, mtime.toISOString()), file, bytes: size })
  }

  #evict(): void {
    while (this.#entries.length > MAX_DOCS || this.#bytes > MAX_BYTES) {
      const oldest = this.#entries.shift() as Entry
      this.#byId.delete(oldest.header.id)
      this.#bytes -= oldest.bytes
      rmSync(oldest.file, { force: true })
    }
  }
}
