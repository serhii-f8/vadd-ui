import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { type AddressInfo, createServer as createNetServer, type Socket } from 'node:net'
import { join } from 'node:path'
import { readViewerInfo, stateDirOf, updateViewerInfo, workspaceHash } from '@vadd/ui-viewer'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_POSIX_MODES } from '../../ui-viewer/test/platform.js'
import type { CliError } from '../src/outcome.js'
import type { SpawnedViewer, System } from '../src/system.js'
import { ensureViewer, findViewer, placeOf, stopViewer, tryLock } from '../src/viewer/lifecycle.js'
import { fakeSystem, stateHome, tempDir, ViewerFarm } from './helpers.js'

let farm: ViewerFarm | undefined

afterEach(async () => {
  await farm?.stopAll()
  farm = undefined
})

function setup(): { farm: ViewerFarm; system: System; dir: string; workspace: string } {
  const workspace = tempDir()
  const env = { ...stateHome() }
  farm = new ViewerFarm(env)
  const system = farm.system({ cwd: workspace })
  return { farm, system, workspace, dir: stateDirOf(workspaceHash(workspace), env) }
}

function failing(system: System, spawn: System['spawnViewer']): System {
  return { ...system, spawnViewer: spawn }
}

const idle = (): SpawnedViewer => ({ pid: 1, exited: new Promise(() => {}), kill: () => {} })

describe('placeOf', () => {
  it('is the workspace and its state directory', () => {
    const { system, workspace, dir } = setup()
    expect(placeOf(system)).toEqual({ workspace, hash: workspaceHash(workspace), stateDir: dir })
  })

  it('exits 5 for a cwd that is gone', () => {
    const system = fakeSystem({ cwd: join(tempDir(), 'gone') })
    expect(() => placeOf(system)).toThrow(expect.objectContaining({ exit: 5 }))
  })
})

describe('ensureViewer', () => {
  it('starts a Viewer, then reuses it', async () => {
    const { farm, system } = setup()
    const first = await ensureViewer(system)
    expect(first.started).toBe(true)
    expect(first.url).toBe(`http://localhost:${first.info.port}/v/${first.info.readToken}/`)
    const second = await ensureViewer(system)
    expect(second.started).toBe(false)
    expect(second.info.readToken).toBe(first.info.readToken)
    expect(farm.spawns).toBe(1)
  })

  it('starts one for two callers at once', async () => {
    const { farm, system } = setup()
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => ensureViewer(system)))
    expect(farm.spawns).toBe(1)
    expect(new Set(all.map(({ info }) => info.readToken)).size).toBe(1)
  })

  it('passes the workspace, and the bind address when given', async () => {
    const { system, workspace } = setup()
    const seen: (readonly string[])[] = []
    const spy = failing(system, (argv, fd, cwd) => {
      seen.push(argv)
      return system.spawnViewer(argv, fd, cwd)
    })
    await ensureViewer(spy, { bind: '127.0.0.1' })
    expect(seen[0]?.slice(1)).toEqual(['--workspace', workspace, '--bind', '127.0.0.1'])
  })

  it.skipIf(NO_POSIX_MODES)('gives the log 0600 in a 0700 directory', async () => {
    const { system, dir } = setup()
    await ensureViewer(system)
    expect(statSync(join(dir, 'viewer.log')).mode & 0o777).toBe(0o600)
    expect(statSync(dir).mode & 0o777).toBe(0o700)
  })

  it('restarts a killed Viewer and remembers its pane', async () => {
    const { farm, system, dir } = setup()
    const first = await ensureViewer(system)
    updateViewerInfo(dir, first.info.pid, { browserPageId: 'page-1' })
    await farm.crash(farm.viewers[0] as (typeof farm.viewers)[0])
    const second = await ensureViewer(system)
    expect(second.started).toBe(true)
    expect(second.previous).toEqual({ pageId: 'page-1', url: first.url })
    expect(second.info.readToken).not.toBe(first.info.readToken)
    expect(farm.spawns).toBe(2)
  })

  it('has no previous pane after a clean stop', async () => {
    const { system } = setup()
    await ensureViewer(system)
    await stopViewer(system)
    expect((await ensureViewer(system)).previous).toBeUndefined()
  })

  it('starts over a corrupt viewer.json', async () => {
    const { system, dir } = setup()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.json'), '{"pid":')
    expect((await ensureViewer(system)).started).toBe(true)
  })

  it('names the last line of the log when the Viewer exits early', async () => {
    const { system, dir } = setup()
    const crash = failing(system, () => {
      writeFileSync(join(dir, 'viewer.log'), 'one\nvui: viewer: no free port\n')
      return { pid: 1, exited: Promise.resolve(), kill: () => {} }
    })
    const error = await ensureViewer(crash).catch((reason: CliError) => reason)
    expect(error).toMatchObject({ exit: 4, code: 'no-host' })
    expect((error as CliError).message).toContain('no free port')
    expect((error as CliError).message).toContain('vui doctor')
    expect(existsSync(join(dir, 'viewer.lock'))).toBe(false)
  })

  it('reads only what this start wrote to the log', async () => {
    const { system, dir } = setup()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.log'), 'vui: Viewer listening on port 1\n')
    let killed = false
    const quiet = failing(system, () => ({
      ...idle(),
      kill: () => {
        killed = true
      },
    }))
    const error = await ensureViewer(quiet, { timeoutMs: 80 }).catch((reason) => reason)
    expect(error).toMatchObject({ exit: 4 })
    expect(killed).toBe(true)
  })

  it('takes a Viewer that won the port while this start failed', async () => {
    const { farm, system } = setup()
    const racing = failing(system, (argv, fd, cwd) => {
      const real = system.spawnViewer(argv, fd, cwd)
      return { ...real, exited: farm.viewers.length === 0 ? Promise.resolve() : real.exited }
    })
    const running = await ensureViewer(racing)
    expect(running.info.port).toBeGreaterThan(0)
  })

  it('waits for another start, which it finds done', async () => {
    const { farm, system, dir } = setup()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.lock'), String(process.pid))
    const waiting = ensureViewer(system)
    await system.sleep(60)
    expect(farm.spawns).toBe(0)
    rmSync(join(dir, 'viewer.lock'))
    expect((await waiting).started).toBe(true)
  })

  it('gives up on a lock that never clears', async () => {
    const { system, dir } = setup()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.lock'), String(process.pid))
    const error = await ensureViewer(system, { timeoutMs: 60 }).catch((reason) => reason)
    expect(error).toMatchObject({ exit: 4, code: 'no-host' })
  })

  it('exits 5 when the state directory cannot be written', async () => {
    const root = tempDir()
    chmodSync(root, 0o500)
    const workspace = tempDir()
    const system = fakeSystem({ cwd: workspace, env: { ...stateHome(root) } })
    const error = await ensureViewer(system).catch((reason) => reason)
    chmodSync(root, 0o700)
    expect(error).toMatchObject({ exit: 5, code: 'io' })
  })
})

/** Takes connections and never answers, as a stopped process's listener does. */
async function stalledViewer(dir: string): Promise<{ close: () => void }> {
  const sockets: Socket[] = []
  const server = createNetServer((socket) => sockets.push(socket))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'viewer.json'),
    JSON.stringify({ pid: process.pid, port, readToken: 'r', writeToken: 'w' }),
  )
  return {
    close: () => {
      for (const socket of sockets) socket.destroy()
      server.close()
    },
  }
}

describe('a Viewer that does not answer', () => {
  it('is not replaced: a second Viewer would share its state directory', async () => {
    const { farm, system, dir } = setup()
    const stalled = await stalledViewer(dir)
    const error = await ensureViewer(system, { timeoutMs: 50 }).catch((reason) => reason)
    stalled.close()
    expect(error).toMatchObject({ exit: 4, code: 'no-host' })
    expect((error as CliError).message).toContain('vui viewer stop')
    expect(farm.spawns).toBe(0)
    expect(existsSync(join(dir, 'viewer.json'))).toBe(true)
  })

  it('is killed by stop, and only then is its file removed', async () => {
    const { system, dir } = setup()
    const stalled = await stalledViewer(dir)
    const signals: string[] = []
    const watched: System = {
      ...system,
      kill: (_pid, signal) => {
        signals.push(signal)
      },
    }
    const stopped = await stopViewer(watched)
    stalled.close()
    expect(stopped).toEqual({ stopped: true, pid: process.pid })
    expect(signals).toEqual(['SIGKILL'])
    expect(readViewerInfo(dir)).toBeUndefined()
  })
})

describe('a stranger on the same pid and port', () => {
  it('gets no signal, where /proc can tell', async () => {
    const { system, dir } = setup()
    const stalled = await stalledViewer(dir)
    const signals: string[] = []
    const watched: System = {
      ...system,
      read: (path) => (path === `/proc/${process.pid}/cmdline` ? 'postgres\0-D\0/x' : undefined),
      kill: (_pid, signal) => {
        signals.push(signal)
      },
    }
    expect(await stopViewer(watched)).toEqual({ stopped: false })
    stalled.close()
    expect(signals).toEqual([])
    expect(readViewerInfo(dir)).toBeUndefined()
  })
})

describe('tryLock', () => {
  it('is exclusive until released', () => {
    const dir = tempDir()
    const release = tryLock(dir)
    expect(release).toBeDefined()
    expect(tryLock(dir)).toBeUndefined()
    release?.()
    expect(tryLock(dir)).toBeDefined()
  })

  it('takes over the lock of a dead process', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'viewer.lock'), '2147483646')
    expect(tryLock(dir)).toBeDefined()
    expect(readFileSync(join(dir, 'viewer.lock'), 'utf8')).toMatch(`${process.pid} `)
  })

  it('takes over an old lock even if its pid is alive, since a pid can be reused', () => {
    const dir = tempDir()
    const path = join(dir, 'viewer.lock')
    writeFileSync(path, String(process.pid))
    const old = new Date(Date.now() - 120_000)
    utimesSync(path, old, old)
    expect(tryLock(dir)).toBeDefined()
  })

  it('holds a live lock for as long as three Orca calls can take', () => {
    const dir = tempDir()
    const path = join(dir, 'viewer.lock')
    writeFileSync(path, String(process.pid))
    const held = new Date(Date.now() - 31_000)
    utimesSync(path, held, held)
    expect(tryLock(dir)).toBeUndefined()
  })

  it('does not remove a lock it lost', () => {
    const dir = tempDir()
    const path = join(dir, 'viewer.lock')
    const release = tryLock(dir)
    writeFileSync(path, 'another owner')
    release?.()
    expect(readFileSync(path, 'utf8')).toBe('another owner')
  })

  it('keeps the pane lock apart from the start lock', () => {
    const dir = tempDir()
    expect(tryLock(dir, 'pane.lock')).toBeDefined()
    expect(tryLock(dir)).toBeDefined()
  })

  it('leaves a fresh lock with no pid yet', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'viewer.lock'), '')
    expect(tryLock(dir)).toBeUndefined()
  })
})

describe('findViewer', () => {
  it('finds nothing with nothing running', async () => {
    const { system } = setup()
    expect(await findViewer(system)).toBeUndefined()
  })

  it('finds what ensureViewer started', async () => {
    const { system } = setup()
    const { url } = await ensureViewer(system)
    expect((await findViewer(system))?.url).toBe(url)
  })
})

describe('stopViewer', () => {
  it('stops a running Viewer', async () => {
    const { system, dir } = setup()
    const { info } = await ensureViewer(system)
    expect(await stopViewer(system)).toEqual({ stopped: true, pid: info.pid })
    expect(readViewerInfo(dir)).toBeUndefined()
  })

  it('waits for the process itself, which outlives its port', async () => {
    const { system } = setup()
    await ensureViewer(system)
    let checks = 0
    const exiting: System = {
      ...system,
      isAlive: () => {
        checks++
        return checks < 3
      },
    }
    await stopViewer(exiting)
    expect(checks).toBe(3)
  })

  it('reports nothing to stop', async () => {
    const { system } = setup()
    expect(await stopViewer(system)).toEqual({ stopped: false })
  })

  it('removes a stale file and signals nobody', async () => {
    const { system, dir } = setup()
    const signals: string[] = []
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.json'), '{"pid":2147483646,"port":1}')
    const watched = { ...system, kill: (_: number, signal: string) => void signals.push(signal) }
    expect(await stopViewer(watched)).toEqual({ stopped: false })
    expect(existsSync(join(dir, 'viewer.json'))).toBe(false)
    expect(signals).toEqual([])
  })

  it('kills a Viewer that ignores SIGTERM, and clears what it left', async () => {
    const { system, dir } = setup()
    await ensureViewer(system)
    const signals: string[] = []
    const deaf: System = {
      ...system,
      kill: (_pid, signal) => {
        signals.push(signal)
      },
    }
    await stopViewer(deaf, { timeoutMs: 60 })
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(readViewerInfo(dir)).toBeUndefined()
  })

  it('treats a process that has just gone as stopped', async () => {
    const { system } = setup()
    await ensureViewer(system)
    const gone: System = {
      ...system,
      kill: () => {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' })
      },
    }
    await expect(stopViewer(gone, { timeoutMs: 20 })).resolves.toMatchObject({ stopped: true })
  })
})
