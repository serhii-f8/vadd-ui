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
import type { DocHeader } from './doc-header.js'

export type { DocHeader } from './doc-header.js'

/** §4.1 retention: the newest 500 documents or 50 MiB, whichever is smaller. */
export const MAX_DOCS = 500
export const MAX_BYTES = 50 * 1024 * 1024

const SLUG_LENGTH = 48
const OWNER_ONLY_FILE = 0o600
const OWNER_ONLY_DIR = 0o700
const TEMPORARY_SUFFIX = '.tmp'
const STORED_NAME = /^(\d+)-(.*)\.vui\.json$/
/** Beside a document stored with `--name`, so `--replace` finds it after a restart. */
const NAME_SUFFIX = '.name'

interface Entry {
  header: DocHeader
  file: string
  bytes: number
  name?: string
}

export interface DocStoreOptions {
  now?: () => number
  /** Told the file name of anything skipped, and never its contents (§15.1). */
  warn?: (line: string) => void
}

const NOT_IN_SLUG = /[^a-z0-9]+/g
const TRAILING_DASHES = /-+$/
const STARTS_WELL = /^[a-z0-9]/
const FALLBACK_PREFIX = 'v-'

const cut = (slug: string) => slug.slice(0, SLUG_LENGTH).replace(TRAILING_DASHES, '')

/**
 * §11.5 as VD-133 reads it, and the one slug for Viewer ids and file names (VD-159). It never
 * holds a `.`, so it is safe in a path and a URL, and Orca's device check sees `<slug>-<hex4>`.
 */
export function slugify(text: string): string {
  const slug = cut(text.toLowerCase().replace(NOT_IN_SLUG, '-'))
  return STARTS_WELL.test(slug) ? slug : cut(`${FALLBACK_PREFIX}${slug}`)
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

/** Temporary file, then rename. `time` becomes the file time, which `createdAt` is read from. */
function writeAtomic(file: string, text: string, time: Date): void {
  const temporary = `${file}${TEMPORARY_SUFFIX}`
  try {
    writeFileSync(temporary, text, { mode: OWNER_ONLY_FILE })
    utimesSync(temporary, time, time)
    renameSync(temporary, file)
  } catch (error) {
    // A full disk answers 507 (VD-160) and the Viewer goes on: the partial file must not stay.
    try {
      rmSync(temporary, { force: true })
    } catch {
      // Best effort: the next start removes it (`#load`).
    }
    throw error
  }
}

function readName(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
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

  /** `name`, from `vui show --name`, is what a later `replace` finds the entry by. */
  add(document: VuiDocument, name?: string): DocHeader {
    const seq = this.#lastSeq + 1
    const id = `${seq}-${slugify(stringOr(document.title) ?? '')}`
    const file = join(this.#dir, `${id}${FILE_EXTENSION}`)
    const text = JSON.stringify(document)
    const created = new Date(this.#now())
    writeAtomic(file, text, created)
    if (name !== undefined) {
      try {
        writeAtomic(`${join(this.#dir, id)}${NAME_SUFFIX}`, name, created)
      } catch (error) {
        rmSync(file, { force: true })
        throw error
      }
    }
    this.#lastSeq = seq
    const header = headerOf(document, seq, id, created.toISOString())
    this.#index({
      header,
      file,
      bytes: Buffer.byteLength(text),
      ...(name === undefined ? {} : { name }),
    })
    this.#evict()
    return header
  }

  /**
   * `--replace`: the newest entry named `name` takes `document` in place, keeping its seq and
   * id, with the time of this write. `undefined` when no entry has that name.
   */
  replace(name: string, document: VuiDocument): DocHeader | undefined {
    const entry = this.#entries.findLast((candidate) => candidate.name === name)
    if (entry === undefined) return undefined
    const text = JSON.stringify(document)
    const created = new Date(this.#now())
    writeAtomic(entry.file, text, created)
    const { seq, id } = entry.header
    entry.header = headerOf(document, seq, id, created.toISOString())
    this.#bytes += Buffer.byteLength(text) - entry.bytes
    entry.bytes = Buffer.byteLength(text)
    this.#evict()
    return entry.header
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
    const header = headerOf(document, seq, id, mtime.toISOString())
    const named = readName(`${join(this.#dir, id)}${NAME_SUFFIX}`)
    this.#index({ header, file, bytes: size, ...(named === undefined ? {} : { name: named }) })
  }

  #evict(): void {
    while (this.#entries.length > MAX_DOCS || this.#bytes > MAX_BYTES) {
      const oldest = this.#entries.shift() as Entry
      this.#byId.delete(oldest.header.id)
      this.#bytes -= oldest.bytes
      rmSync(oldest.file, { force: true })
      if (oldest.name !== undefined) {
        rmSync(`${join(this.#dir, oldest.header.id)}${NAME_SUFFIX}`, { force: true })
      }
    }
  }
}
