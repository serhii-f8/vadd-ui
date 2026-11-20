import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { version } from '@vadd/ui'
import type { FeedAssets } from './feed.js'
import { createViewerHandler, viewerUrl } from './handler.js'
import { stateDirOf, workspaceHash } from './paths.js'
import { DocStore } from './store.js'

export const FIRST_PORT = 47100
export const LAST_PORT = 47199
export const IDLE_MS = 4 * 60 * 60 * 1000

const LOOPBACK = '127.0.0.1'
const ALL_INTERFACES = '0.0.0.0'
const TOKEN_BYTES = 16
const OWNER_ONLY_FILE = 0o600
const OWNER_ONLY_DIR = 0o700
const INFO_FILE = 'viewer.json'
const DOCS_DIR = 'docs'
const HEALTH_TIMEOUT_MS = 1000
const MAX_PORT = 65535

/**
 * `viewer.json` (§4.1). A stopped Viewer leaves a retired record (B1, VD-210): only `port`,
 * `readToken`, `browserPageId` and `stoppedAt`, so the next start can move its Orca pane. With
 * no `pid` it never reads as alive.
 */
export interface ViewerInfo {
  pid: number
  port: number
  readToken: string
  writeToken: string
  startedAt: string
  version: string
  /** The Orca pane showing this feed, written by the CLI (§4.1). */
  browserPageId?: string
  /** Only on a retired record. */
  stoppedAt?: string
}

/** What a retired record keeps. */
export type RetiredInfo = Pick<ViewerInfo, 'port' | 'readToken' | 'browserPageId' | 'stoppedAt'>

export interface StartOptions {
  /** The absolute workspace path (`workspaceOf`). */
  workspace: string
  /** `127.0.0.1`, the default, or `0.0.0.0` for containers (§15.3). */
  bind?: string
  env?: NodeJS.ProcessEnv
  /** Ports to try in order. `VUI_PORT` overrides it. */
  ports?: readonly number[]
  feed?: FeedAssets
  idleMs?: number
  warn?: (line: string) => void
}

export interface RunningViewer {
  url: string
  port: number
  address: string
  readToken: string
  writeToken: string
  stateDir: string
  close: () => Promise<void>
  /** Settles once the Viewer has stopped, for any reason. */
  closed: Promise<void>
}

/** A live Viewer already holds this workspace (§4.1: one per workspace). */
export class ViewerRunningError extends Error {
  readonly pid: number
  readonly port: number

  constructor(pid: number, port: number) {
    super(`a Viewer for this workspace is running on port ${port} (pid ${pid})`)
    this.name = 'ViewerRunningError'
    this.pid = pid
    this.port = port
  }
}

/** The Viewer cannot start with what it was given, or no port is free. */
export class ViewerStartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViewerStartError'
  }
}

/** Runs `onIdle` after `delayMs` with no client connected and no new document. */
export class IdleTimer {
  readonly #delayMs: number
  readonly #onIdle: () => void
  #timer: NodeJS.Timeout | undefined

  constructor(delayMs: number, onIdle: () => void) {
    this.#delayMs = delayMs
    this.#onIdle = onIdle
  }

  /** Each document and each client joining or leaving starts the wait over. */
  update(clients: number): void {
    this.stop()
    if (clients === 0) this.#timer = setTimeout(this.#onIdle, this.#delayMs).unref()
  }

  stop(): void {
    clearTimeout(this.#timer)
  }
}

export function readViewerInfo(stateDir: string): Partial<ViewerInfo> | undefined {
  try {
    return JSON.parse(readFileSync(join(stateDir, INFO_FILE), 'utf8')) as Partial<ViewerInfo>
  } catch {
    return undefined
  }
}

/** Rename, because a write would keep the mode of a file already there. */
function writeViewerInfo(stateDir: string, info: ViewerInfo | RetiredInfo): void {
  const file = join(stateDir, INFO_FILE)
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(info), { mode: OWNER_ONLY_FILE })
  renameSync(temporary, file)
}

/** Merges into the file of the Viewer `pid`. False if that is not whose file it is now. */
export function updateViewerInfo(
  stateDir: string,
  pid: number,
  patch: Partial<ViewerInfo>,
): boolean {
  const info = readViewerInfo(stateDir)
  if (info?.pid !== pid) return false
  writeViewerInfo(stateDir, { ...(info as ViewerInfo), ...patch })
  return true
}

/**
 * The end of a Viewer's file, by whoever sees it stop. Given `pid`, only that Viewer's file.
 * A pane id stays, in a record that cannot read as live (B1); with none the file goes. Then a
 * folder with nothing left in it goes too (B14): a workspace that stored nothing leaves nothing.
 */
export function retireViewerInfo(
  stateDir: string,
  pid?: number,
  options: { prune?: boolean } = {},
): void {
  const info = readViewerInfo(stateDir)
  if (pid !== undefined && info?.pid !== pid) return
  try {
    const { port, readToken, browserPageId } = info ?? {}
    if (
      typeof browserPageId === 'string' &&
      typeof port === 'number' &&
      typeof readToken === 'string'
    ) {
      const stoppedAt = info?.stoppedAt ?? new Date().toISOString()
      writeViewerInfo(stateDir, { port, readToken, browserPageId, stoppedAt })
      return
    }
    rmSync(join(stateDir, INFO_FILE), { force: true })
  } catch {
    // Not ours to change: the next start overwrites the file anyway.
    return
  }
  // Only the Viewer itself, as it stops: from another process a Viewer starting in this folder
  // could have its new, empty `docs/` taken away (VD-215).
  if (options.prune !== true) return
  // `docs/` first: the store makes it on open, and it is empty if nothing was stored.
  removeIfEmpty(join(stateDir, DOCS_DIR))
  removeIfEmpty(stateDir)
}

function removeIfEmpty(dir: string): void {
  try {
    rmdirSync(dir)
  } catch {
    // Not empty, or already gone.
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

type Health = 'serving' | 'stalled' | 'absent'

/**
 * The pid can be a stranger's by now, so only this workspace's `/health` proves it. A timeout
 * is a process that holds the port and does not answer, which a refused connection is not.
 */
async function healthOf(port: number, hash: string): Promise<Health> {
  try {
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    const reply = await fetch(`http://${LOOPBACK}:${port}/health`, { signal })
    const { workspaceHash: served } = (await reply.json()) as { workspaceHash?: unknown }
    return served === hash ? 'serving' : 'absent'
  } catch (error) {
    return (error as Error).name === 'TimeoutError' ? 'stalled' : 'absent'
  }
}

export type ViewerState =
  | { state: 'live' | 'stalled'; info: ViewerInfo }
  | { state: 'none'; info?: undefined }

/** What `viewer.json` names now. `stalled` still owns the state directory. */
export async function viewerState(stateDir: string, hash: string): Promise<ViewerState> {
  const info = readViewerInfo(stateDir)
  const { pid, port } = info ?? {}
  if (typeof pid !== 'number' || typeof port !== 'number' || !isAlive(pid)) return { state: 'none' }
  const health = await healthOf(port, hash)
  if (health === 'absent') return { state: 'none' }
  return { state: health === 'serving' ? 'live' : 'stalled', info: info as ViewerInfo }
}

/** `viewer.json`, if it names a live process serving this workspace. */
export async function liveViewer(stateDir: string, hash: string): Promise<ViewerInfo | undefined> {
  const { state, info } = await viewerState(stateDir, hash)
  return state === 'live' ? info : undefined
}

async function refuseIfRunning(stateDir: string, hash: string): Promise<void> {
  const live = await liveViewer(stateDir, hash)
  if (live !== undefined) throw new ViewerRunningError(live.pid, live.port)
}

function portsToTry(env: NodeJS.ProcessEnv, ports: readonly number[] | undefined): number[] {
  const { VUI_PORT: text } = env
  if (!text) {
    if (ports !== undefined) return [...ports]
    return Array.from({ length: LAST_PORT - FIRST_PORT + 1 }, (_, i) => FIRST_PORT + i)
  }
  const port = Number(text)
  if (!/^\d+$/.test(text) || port < 1 || port > MAX_PORT) {
    throw new ViewerStartError(`VUI_PORT is not a port: ${text}`)
  }
  return [port]
}

function listen(server: Server, port: number, address: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, address)
  })
}

async function listenOnFirst(server: Server, ports: number[], address: string): Promise<number> {
  for (const port of ports) {
    if (await listen(server, port, address)) return (server.address() as AddressInfo).port
  }
  throw new ViewerStartError(`no free port among ${ports[0]}–${ports.at(-1)}`)
}

/** §4.1 and §15.3: one workspace's Viewer, until `close` or four idle hours. */
export async function startViewer(options: StartOptions): Promise<RunningViewer> {
  const { workspace, bind = LOOPBACK, env = process.env, ports, feed } = options
  const { idleMs = IDLE_MS, warn = () => undefined } = options
  if (bind !== LOOPBACK && bind !== ALL_INTERFACES) {
    throw new ViewerStartError(`--bind takes ${LOOPBACK} or ${ALL_INTERFACES}, not ${bind}`)
  }
  const candidates = portsToTry(env, ports)
  const hash = workspaceHash(workspace)
  const stateDir = stateDirOf(hash, env)
  mkdirSync(stateDir, { recursive: true, mode: OWNER_ONLY_DIR })
  await refuseIfRunning(stateDir, hash)

  const readToken = randomBytes(TOKEN_BYTES).toString('hex')
  const writeToken = randomBytes(TOKEN_BYTES).toString('hex')
  const store = new DocStore(stateDir, { warn })
  let port = 0
  let close: () => Promise<void> = () => Promise.resolve()
  const idle = new IdleTimer(idleMs, () => void close())
  const handler = createViewerHandler({
    store,
    readToken,
    writeToken,
    port: () => port,
    workspaceHash: hash,
    feed,
    onActivity: (clients) => idle.update(clients),
  })
  const server = createServer(handler)
  port = await listenOnFirst(server, candidates, bind)

  const pid = process.pid
  const startedAt = new Date().toISOString()
  try {
    writeViewerInfo(stateDir, { pid, port, readToken, writeToken, startedAt, version })
  } catch (error) {
    // An open listener would keep this process alive with no file and no idle exit.
    await new Promise((resolve) => server.close(resolve))
    throw error
  }
  if (bind === ALL_INTERFACES) {
    warn(`vui: warning: Viewer bound to ${ALL_INTERFACES}:${port}, reachable from other machines`)
  }
  idle.update(0)

  let closing: Promise<void> | undefined
  close = () => {
    closing ??= new Promise((resolve) => {
      handler.close()
      idle.stop()
      server.close(() => resolve())
      server.closeAllConnections()
      // A newer Viewer may own the file by now, which `retireViewerInfo` leaves alone.
      retireViewerInfo(stateDir, pid, { prune: true })
    })
    return closing
  }
  let settled: () => void
  const closed = new Promise<void>((resolve) => {
    settled = resolve
  })
  server.on('close', () => settled())

  const url = viewerUrl(port, readToken)
  const { address } = server.address() as AddressInfo
  return { url, port, address, readToken, writeToken, stateDir, close, closed }
}
