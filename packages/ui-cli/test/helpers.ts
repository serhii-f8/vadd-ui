import { appendFileSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { type RunningViewer, startViewer } from '@vadd/ui-viewer'
import type { Io } from '../src/io.js'
import { run } from '../src/run.js'
import { type ExecResult, realSystem, type System } from '../src/system.js'

export const NOW = new Date('2026-11-05T10:00:00.000Z')
export const BUNDLE = '/*bundle*/'
export const SCHEMA = '{"$id":"vui"}\n'

export interface Result {
  exit: number
  stdout: string
  stderr: string
}

export interface Options {
  stdin?: string | Buffer | Readable
  tty?: boolean
  bundle?: string | (() => string)
  schema?: () => string
  system?: System
}

export interface FakeSystem {
  env?: NodeJS.ProcessEnv
  cwd?: string
  platform?: NodeJS.Platform
  /** What exists on disk, by absolute path. */
  files?: Record<string, string>
  exec?: (file: string, args: readonly string[]) => Partial<ExecResult>
  spawnViewer?: System['spawnViewer']
  kill?: System['kill']
  /** `path.join`, for a test of another platform's paths. */
  pathJoin?: System['pathJoin']
  hex4?: System['hex4']
}

/** `exec` fails as a missing command, unless a test says what it does. */
export function fakeSystem(options: FakeSystem = {}): System {
  const files = options.files ?? {}
  const spawnViewer: System['spawnViewer'] = () => {
    throw new Error('this test starts no Viewer')
  }
  return {
    env: options.env ?? {},
    platform: options.platform ?? 'linux',
    cwd: () => options.cwd ?? tmpdir(),
    exec: async (file, args) => {
      const reply = options.exec?.(file, args) ?? { ok: false, missing: true }
      return {
        ok: false,
        code: reply.ok ? 0 : 1,
        stdout: '',
        stderr: '',
        missing: false,
        timedOut: false,
        ...reply,
      }
    },
    spawnViewer: options.spawnViewer ?? spawnViewer,
    kill: options.kill ?? (() => undefined),
    pathJoin: options.pathJoin ?? join,
    hex4: options.hex4 ?? realSystem.hex4,
    nodeVersion: '22.0.0',
    isAlive: () => false,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    exists: (path) => Object.hasOwn(files, path),
    read: (path) => files[path],
  }
}

/** A real Viewer in this process, standing in for the detached one. */
export class ViewerFarm {
  readonly viewers: RunningViewer[] = []
  spawns = 0

  constructor(readonly env: NodeJS.ProcessEnv) {}

  spawnViewer: System['spawnViewer'] = (argv) => {
    this.spawns++
    const workspace = argv[argv.indexOf('--workspace') + 1] as string
    const options = { workspace, env: this.env, ports: [0], feed: { html: 'h', script: 's' } }
    let finish: () => void
    const exited = new Promise<void>((done) => {
      finish = done
    })
    startViewer(options).then(
      (viewer) => {
        this.viewers.push(viewer)
        const line = `vui: Viewer listening on port ${viewer.port}\n`
        appendFileSync(join(viewer.stateDir, 'viewer.log'), line)
        void viewer.closed.then(finish)
      },
      () => finish(),
    )
    return { pid: 4242, exited, kill: () => undefined }
  }

  /** Dies at once, as `kill -9` does: `viewer.json` stays behind. */
  async crash(viewer: RunningViewer): Promise<void> {
    const dir = viewer.stateDir
    const file = readFileSync(join(dir, 'viewer.json'))
    await viewer.close()
    writeFileSync(join(dir, 'viewer.json'), file)
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.viewers.map((viewer) => viewer.close()))
  }

  system(options: FakeSystem = {}): System {
    return fakeSystem({
      env: this.env,
      spawnViewer: this.spawnViewer,
      kill: (_pid, signal) => {
        if (signal === 'SIGTERM') void Promise.all(this.viewers.map((one) => one.close()))
      },
      ...options,
    })
  }
}

function stdinOf(options: Options): Io['stdin'] {
  const source = options.stdin ?? ''
  const stream = source instanceof Readable ? source : Readable.from([Buffer.from(source)])
  return Object.assign(stream, { isTTY: options.tty === true })
}

/** The whole CLI in process, with a fixed clock and a short bundle. */
export async function vui(argv: string[], options: Options = {}): Promise<Result> {
  let stdout = ''
  let stderr = ''
  const bundle = options.bundle ?? BUNDLE
  const exit = await run(argv, {
    stdin: stdinOf(options),
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
    now: () => NOW,
    readBundle: typeof bundle === 'string' ? () => bundle : bundle,
    readSchema: options.schema ?? (() => SCHEMA),
    system: options.system ?? fakeSystem(),
  })
  return { exit, stdout, stderr }
}

/** `--json` must hold whatever happened: one value on stdout and nothing on stderr. */
export async function vuiJson(
  argv: string[],
  options: Options = {},
): Promise<{ exit: number; json: Record<string, unknown> }> {
  const { exit, stdout, stderr } = await vui([...argv, '--json'], options)
  if (stderr !== '') throw new Error(`stderr under --json: ${stderr}`)
  const json = JSON.parse(stdout) as Record<string, unknown>
  if (json.ok !== (exit === 0)) throw new Error(`ok disagrees with exit ${exit}: ${stdout}`)
  return { exit, json }
}

/** Real, since `workspaceOf` is: on macOS `tmpdir()` is under the `/var` → `/private/var` link. */
export function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vui-test-')))
}

/**
 * The state root for both platforms' rules (§4.1): Windows reads `LOCALAPPDATA`, the rest
 * `XDG_STATE_HOME`. A test that simulates Linux on a Windows host, or runs a real Viewer there,
 * finds the same directory either way.
 */
export function stateHome(dir = tempDir()): { XDG_STATE_HOME: string; LOCALAPPDATA: string } {
  return { XDG_STATE_HOME: dir, LOCALAPPDATA: dir }
}

export function tempFile(name: string, content: string | Buffer): string {
  const path = join(tempDir(), name)
  writeFileSync(path, content)
  return path
}
