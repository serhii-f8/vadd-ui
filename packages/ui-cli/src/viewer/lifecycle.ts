import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import {
  isAlive,
  liveViewer,
  readViewerInfo,
  stateDirOf,
  type ViewerInfo,
  viewerUrl,
  workspaceHash,
  workspaceOf,
} from '@vadd/ui-viewer'
import { CliError, EXIT, noHost } from '../outcome.js'
import { type System, viewerEntry } from '../system.js'

const INFO_FILE = 'viewer.json'
const LOCK_FILE = 'viewer.lock'
const LOG_FILE = 'viewer.log'
/** VD-118. */
const READY_LINE = 'Viewer listening on port'
const OWNER_ONLY_FILE = 0o600
const OWNER_ONLY_DIR = 0o700
const POLL_MS = 25
const START_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 3_000
/** Longer than any start. A pid can be reused, so a live one does not prove a lock is held. */
const LOCK_STALE_MS = 15_000

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
  const reason = (error as NodeJS.ErrnoException).code ?? String(error)
  return new CliError(EXIT.io, 'io', `cannot use ${what}: ${reason}`)
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
    const pid = Number(readFileSync(path, 'utf8'))
    if (pid > 0 && !isAlive(pid)) return true
    return Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS
  } catch {
    return true
  }
}

function acquire(path: string): boolean {
  try {
    const fd = openSync(path, 'wx', OWNER_ONLY_FILE)
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/**
 * The state directory's one mutex, for starting a Viewer and for opening its pane, each of
 * which must happen once. Gives back the release, or `undefined` while another process holds it.
 */
export function tryLock(stateDir: string): (() => void) | undefined {
  const path = join(stateDir, LOCK_FILE)
  if (!acquire(path)) {
    if (!isStale(path)) return undefined
    rmSync(path, { force: true })
    if (!acquire(path)) return undefined
  }
  return () => rmSync(path, { force: true })
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

/** The running Viewer, or a new one. Only the lock's holder starts one (VD-117). */
export async function ensureViewer(system: System, options: EnsureOptions = {}): Promise<Running> {
  const place = placeOf(system)
  const { stateDir, hash } = place
  try {
    mkdirSync(stateDir, { recursive: true, mode: OWNER_ONLY_DIR })
  } catch (error) {
    throw ioError('the state directory', error)
  }
  const deadline = Date.now() + (options.timeoutMs ?? START_TIMEOUT_MS)
  for (;;) {
    const found = await liveViewer(stateDir, hash)
    if (found !== undefined) return running(found, place)
    let release: (() => void) | undefined
    try {
      release = tryLock(stateDir)
    } catch (error) {
      throw ioError('the state directory', error)
    }
    if (release !== undefined) {
      try {
        // The last holder may have finished between the check and the lock.
        const again = await liveViewer(stateDir, hash)
        if (again !== undefined) return running(again, place)
        return await start(system, place, options)
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

async function gone(system: System, place: Place, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await liveViewer(place.stateDir, place.hash)) === undefined) return true
    await system.sleep(POLL_MS)
  }
  return false
}

/** Only a pid `/health` has proved gets a signal, since a stale file can name a stranger. */
export async function stopViewer(
  system: System,
  options: { timeoutMs?: number } = {},
): Promise<Stopped> {
  const place = placeOf(system)
  const info = join(place.stateDir, INFO_FILE)
  const live = await liveViewer(place.stateDir, place.hash)
  if (live === undefined) {
    rmSync(info, { force: true })
    return { stopped: false }
  }
  const { pid } = live
  send(system, pid, 'SIGTERM')
  if (!(await gone(system, place, options.timeoutMs ?? STOP_TIMEOUT_MS)))
    send(system, pid, 'SIGKILL')
  // Windows has no SIGTERM handler, and SIGKILL runs none, so the file can remain.
  if (readViewerInfo(place.stateDir)?.pid === pid) rmSync(info, { force: true })
  return { stopped: true, pid }
}
