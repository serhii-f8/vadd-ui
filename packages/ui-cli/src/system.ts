import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { isAlive } from '@vadd/ui-viewer'

const require = createRequire(import.meta.url)

const DEFAULT_TIMEOUT_MS = 10_000
const BATCH_FILE = /\.(cmd|bat)$/i

export interface ExecResult {
  /** Exit code 0. */
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  /** No such executable. */
  missing: boolean
  timedOut: boolean
}

export interface SpawnedViewer {
  pid: number
  exited: Promise<void>
  kill: () => void
}

/** The process and machine around the CLI, so a test can stand in for them. */
export interface System {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  /** Without the `v`. */
  nodeVersion: string
  cwd: () => string
  exec: (
    file: string,
    args: readonly string[],
    options?: { timeoutMs?: number },
  ) => Promise<ExecResult>
  /** Node on `argv`, in its own process group, with all output in `logFd`. */
  spawnViewer: (argv: readonly string[], logFd: number, cwd: string) => SpawnedViewer
  kill: (pid: number, signal: NodeJS.Signals) => void
  isAlive: (pid: number) => boolean
  sleep: (ms: number) => Promise<void>
  pathJoin: (directory: string, file: string) => string
  /** §11.5's random suffix. */
  hex4: () => string
  exists: (path: string) => boolean
  read: (path: string) => string | undefined
}

/** VD-119: the package's own file, so `app.js` stays beside it. */
export function viewerEntry(): string {
  return require.resolve('@vadd/ui-viewer/viewer.js')
}

/**
 * Windows' command interpreter by its full path, as Node's own `shell: true` finds it: a bare
 * `cmd.exe` is looked up on `PATH`, which need not hold System32.
 */
export function windowsShell(env: NodeJS.ProcessEnv): string {
  return env.ComSpec || 'cmd.exe'
}

/** Node refuses to spawn a batch file directly, and Orca's Windows launcher can be one. */
export function commandLine(
  file: string,
  args: readonly string[],
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = {},
): [string, string[]] {
  if (platform === 'win32' && BATCH_FILE.test(file)) {
    return [windowsShell(env), ['/d', '/c', file, ...args]]
  }
  return [file, [...args]]
}

function exec(
  file: string,
  args: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<ExecResult> {
  const [command, argv] = commandLine(file, args, process.platform, process.env)
  return new Promise((resolve) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const finish = (result: Pick<ExecResult, 'code' | 'missing' | 'timedOut'>) => {
      clearTimeout(timer)
      resolve({ ok: result.code === 0, stdout, stderr, ...result })
    }
    // A grandchild can hold the pipes open past the kill, so this does not wait for `close`.
    const timer = setTimeout(() => {
      // SIGKILL and `unref`: a command that ignores SIGTERM must not hold the CLI open.
      child.kill('SIGKILL')
      child.unref()
      child.stdout.destroy()
      child.stderr.destroy()
      finish({ code: null, missing: false, timedOut: true })
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      stderr += text
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({ code: null, missing: error.code === 'ENOENT', timedOut: false })
    })
    child.on('close', (code) => finish({ code, missing: false, timedOut: false }))
  })
}

function spawnViewer(argv: readonly string[], logFd: number, cwd: string): SpawnedViewer {
  const child = spawn(process.execPath, [...argv], {
    cwd,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  })
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    child.once('error', () => resolve())
  })
  child.unref()
  return { pid: child.pid ?? 0, exited, kill: () => void child.kill() }
}

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

export const realSystem: System = {
  env: process.env,
  platform: process.platform,
  nodeVersion: process.versions.node,
  cwd: () => process.cwd(),
  exec,
  spawnViewer,
  kill: (pid, signal) => void process.kill(pid, signal),
  isAlive,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pathJoin: join,
  hex4: () => randomBytes(2).toString('hex'),
  exists: existsSync,
  read,
}
