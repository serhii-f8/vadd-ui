import { randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import {
  isAlive,
  liveViewer,
  readViewerInfo,
  retireViewerInfo,
  stateDirOf,
  type ViewerInfo,
  viewerState,
  viewerUrl,
  workspaceHash,
  workspaceOf,
} from '@vadd/ui-viewer'
import { ioReason } from '../io-error.js'
import { CliError, EXIT, noHost } from '../outcome.js'
import { type System, viewerEntry } from '../system.js'

const START_LOCK = 'viewer.lock'
export const PANE_LOCK = 'pane.lock'
const LOG_FILE = 'viewer.log'
/** VD-118. */
const READY_LINE = 'Viewer listening on port'
const OWNER_ONLY_FILE = 0o600
const OWNER_ONLY_DIR = 0o700
const VIEWER_COMMAND = 'viewer.js'
const POLL_MS = 25
const OWNER_BYTES = 8
const START_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 3_000
/** How long a Viewer that takes connections and gives no answer may take to come back. */
const STALL_WAIT_MS = 5_000
/** Past three Orca calls of 10 s. A pid can be reused, so a live one does not prove a lock. */
const LOCK_STALE_MS = 45_000

export interface Place {
  workspace: string
  hash: string
  stateDir: string
}

/** A pane the Viewer before this one had open, which this show can bring back. */
export interface PreviousPane {
  pageId: string
  url: string
}

export interface Running {
  info: ViewerInfo
  url: string
  place: Place
  started: boolean
  previous?: PreviousPane
}

export interface EnsureOptions {
  bind?: string
  timeoutMs?: number
}

function ioError(what: string, error: unknown): CliError {
  return new CliError(EXIT.io, 'io', `cannot use ${what}: ${ioReason(error)}`)
}

export function placeOf(system: System): Place {
  try {
    const workspace = workspaceOf(system.cwd())
    const hash = workspaceHash(workspace)
    return { workspace, hash, stateDir: stateDirOf(hash, system.env, system.platform) }
  } catch (error) {
    throw ioError('the working directory', error)
  }
}

function isStale(path: string): boolean {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8'), 10)
    if (pid > 0 && !isAlive(pid)) return true
    return Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS
  } catch {
    return true
  }
}

function acquire(path: string, owner: string): boolean {
  try {
    const fd = openSync(path, 'wx', OWNER_ONLY_FILE)
    writeSync(fd, owner)
    closeSync(fd)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/** Only its owner removes a lock, since a holder that lost it would free someone else's. */
function releaseIfOwned(path: string, owner: string): void {
  try {
    if (readFileSync(path, 'utf8') === owner) rmSync(path, { force: true })
  } catch {
    // Already gone.
  }
}

/**
 * A mutex in the state directory, one for starting a Viewer and one for opening its pane. Apart,
 * so a slow Orca cannot hold up a start. Gives back the release, or `undefined` while another
 * process holds it.
 */
export function tryLock(stateDir: string, name = START_LOCK): (() => void) | undefined {
  const path = join(stateDir, name)
  const owner = `${process.pid} ${randomBytes(OWNER_BYTES).toString('hex')}`
  if (!acquire(path, owner)) {
    if (!isStale(path)) return undefined
    rmSync(path, { force: true })
    if (!acquire(path, owner)) return undefined
  }
  return () => releaseIfOwned(path, owner)
}

function running(info: ViewerInfo, place: Place, started = false): Running {
  return { info, url: viewerUrl(info.port, info.readToken), place, started }
}

export async function findViewer(system: System): Promise<Running | undefined> {
  const place = placeOf(system)
  const info = await liveViewer(place.stateDir, place.hash)
  return info === undefined ? undefined : running(info, place)
}

function previousPane(stateDir: string): PreviousPane | undefined {
  const { browserPageId: pageId, port, readToken } = readViewerInfo(stateDir) ?? {}
  if (typeof pageId !== 'string' || typeof port !== 'number') return undefined
  if (typeof readToken !== 'string') return undefined
  return { pageId, url: viewerUrl(port, readToken) }
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** Only what this start wrote, since the log outlives a Viewer. */
function logSince(path: string, offset: number): string {
  try {
    return readFileSync(path).subarray(offset).toString('utf8')
  } catch {
    return ''
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? ''
}

/** §4.1: detached, in its own process group, with stdout and stderr in the log (VD-117). */
async function start(system: System, place: Place, options: EnsureOptions): Promise<Running> {
  const { stateDir, workspace } = place
  const { bind, timeoutMs = START_TIMEOUT_MS } = options
  const previous = previousPane(stateDir)
  const log = join(stateDir, LOG_FILE)
  const offset = sizeOf(log)
  const fd = openSync(log, 'a', OWNER_ONLY_FILE)
  const argv = [viewerEntry(), '--workspace', workspace]
  if (bind !== undefined) argv.push('--bind', bind)
  const child = system.spawnViewer(argv, fd, workspace)
  closeSync(fd)

  let exited = false
  void child.exited.then(() => {
    exited = true
  })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const output = logSince(log, offset)
    if (exited || output.includes(READY_LINE)) {
      // An exit can be the loser of a race with `viewer.js` started by hand.
      const info = await liveViewer(stateDir, place.hash)
      if (info !== undefined) return { ...running(info, place, true), previous }
      if (exited) throw noHost(`the Viewer exited: ${lastLine(output) || 'no output'}`)
    }
    await system.sleep(POLL_MS)
  }
  child.kill()
  throw noHost(`the Viewer did not start in ${timeoutMs} ms`)
}

function stalled(pid: number): CliError {
  return noHost(`the Viewer (pid ${pid}) is not answering; run vui viewer stop`)
}

/** The running Viewer, or a new one. Only the lock's holder starts one (VD-124). */
export async function ensureViewer(system: System, options: EnsureOptions = {}): Promise<Running> {
  const place = placeOf(system)
  const { stateDir, hash } = place
  try {
    mkdirSync(stateDir, { recursive: true, mode: OWNER_ONLY_DIR })
  } catch (error) {
    throw ioError('the state directory', error)
  }
  const deadline = Date.now() + (options.timeoutMs ?? START_TIMEOUT_MS)
  const stallDeadline = Date.now() + (options.timeoutMs ?? STALL_WAIT_MS)
  for (;;) {
    const found = await viewerState(stateDir, hash)
    if (found.state === 'live') return running(found.info, place)
    if (found.state === 'stalled') {
      // A second Viewer would number documents in the same directory, so this one must clear.
      if (Date.now() > stallDeadline) throw stalled(found.info.pid)
      await system.sleep(POLL_MS)
      continue
    }
    let release: (() => void) | undefined
    try {
      release = tryLock(stateDir)
    } catch (error) {
      throw ioError('the state directory', error)
    }
    if (release !== undefined) {
      try {
        // The last holder may have finished between the check and the lock.
        const again = await viewerState(stateDir, hash)
        if (again.state === 'live') return running(again.info, place)
        if (again.state === 'none') return await start(system, place, options)
      } catch (error) {
        if (error instanceof CliError) throw error
        throw ioError('the state directory', error)
      } finally {
        release()
      }
    }
    if (Date.now() > deadline) throw noHost('another vui is still starting the Viewer')
    await system.sleep(POLL_MS)
  }
}

function send(system: System, pid: number, signal: NodeJS.Signals): void {
  try {
    system.kill(pid, signal)
  } catch (error) {
    // It went between the check and the signal, which is what was asked for.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

export interface Stopped {
  stopped: boolean
  pid?: number
}

/** The pid and not only the port, or a start right after this could share the store. */
async function gone(
  system: System,
  place: Place,
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const live = await liveViewer(place.stateDir, place.hash)
    if (live === undefined && !system.isAlive(pid)) return true
    await system.sleep(POLL_MS)
  }
  return false
}

/** Where `/proc` exists it can overrule a stale file. Elsewhere the file stands. */
function isStranger(system: System, pid: number): boolean {
  const command = system.read(`/proc/${pid}/cmdline`)
  return command !== undefined && !command.includes(VIEWER_COMMAND)
}

/**
 * A signal goes only to a pid `/health` has proved, or one that holds the port and gives no
 * answer, since a stale file can name a stranger. A stopped process runs no SIGTERM handler.
 */
export async function stopViewer(
  system: System,
  options: { timeoutMs?: number } = {},
): Promise<Stopped> {
  const place = placeOf(system)
  const { state, info } = await viewerState(place.stateDir, place.hash)
  // B1: a stale file becomes a retired record, so its pane id survives for the next start.
  if (info === undefined) {
    retireViewerInfo(place.stateDir)
    return { stopped: false }
  }
  const { pid } = info
  if (state === 'stalled') {
    if (isStranger(system, pid)) {
      retireViewerInfo(place.stateDir, pid)
      return { stopped: false }
    }
    send(system, pid, 'SIGKILL')
  } else {
    send(system, pid, 'SIGTERM')
    const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS
    if (!(await gone(system, place, pid, timeoutMs))) send(system, pid, 'SIGKILL')
  }
  // Windows has no SIGTERM handler, and SIGKILL runs none, so the file can remain.
  retireViewerInfo(place.stateDir, pid)
  return { stopped: true, pid }
}
