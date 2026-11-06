import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { version } from '@vadd/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stateDirOf, workspaceHash } from '../src/paths.js'
import {
  FIRST_PORT,
  IDLE_MS,
  IdleTimer,
  LAST_PORT,
  liveViewer,
  type RunningViewer,
  readViewerInfo,
  type StartOptions,
  startViewer,
  updateViewerInfo,
  ViewerRunningError,
  ViewerStartError,
} from '../src/server.js'
import { freePort, request, tempDir } from './helpers.js'

const running = new Set<RunningViewer>()
const blockers = new Set<Server>()

interface Fixture extends StartOptions {
  workspace: string
  env: NodeJS.ProcessEnv
  dir: string
}

function fixture(): Fixture {
  const env = { XDG_STATE_HOME: tempDir() }
  const workspace = tempDir()
  return { workspace, env, dir: stateDirOf(workspaceHash(workspace), env), ports: [0] }
}

async function start(options: StartOptions): Promise<RunningViewer> {
  const viewer = await startViewer(options)
  running.add(viewer)
  return viewer
}

async function occupy(port = 0): Promise<number> {
  const server = createServer()
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done))
  blockers.add(server)
  return (server.address() as AddressInfo).port
}

afterEach(async () => {
  await Promise.all([...running].map((viewer) => viewer.close()))
  running.clear()
  for (const server of blockers) server.close()
  blockers.clear()
})

describe('startViewer', () => {
  it('writes viewer.json as §4.1 lists it, mode 0600', async () => {
    const options = fixture()
    const viewer = await start(options)
    const file = join(options.dir, 'viewer.json')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      pid: process.pid,
      port: viewer.port,
      readToken: viewer.readToken,
      writeToken: viewer.writeToken,
      startedAt: expect.stringMatching(/^\d{4}-.*Z$/),
      version,
    })
    expect(readViewerInfo(options.dir)?.port).toBe(viewer.port)
  })

  it('keeps mode 0600 over an old, wider file', async () => {
    const options = fixture()
    await (await start(options)).close()
    const file = join(options.dir, 'viewer.json')
    writeFileSync(file, '{"pid":0}')
    chmodSync(file, 0o644)
    await start(options)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('keeps the state directory owner-only', async () => {
    const options = fixture()
    await start(options)
    expect(statSync(options.dir).mode & 0o777).toBe(0o700)
  })

  it('makes two 128-bit tokens, new on every start', async () => {
    const options = fixture()
    const first = await start(options)
    expect(first.readToken).toMatch(/^[0-9a-f]{32}$/)
    expect(first.writeToken).toMatch(/^[0-9a-f]{32}$/)
    expect(first.writeToken).not.toBe(first.readToken)
    await first.close()
    const second = await start(options)
    expect(second.readToken).not.toBe(first.readToken)
    expect(second.writeToken).not.toBe(first.writeToken)
  })

  it('prints a URL with the name localhost', async () => {
    const viewer = await start(fixture())
    expect(viewer.url).toBe(`http://localhost:${viewer.port}/v/${viewer.readToken}/`)
  })

  it('serves the workspace hash at /health', async () => {
    const options = fixture()
    const viewer = await start(options)
    const { workspaceHash: hash } = (
      await request(viewer.port, '/health', {
        headers: { host: `localhost:${viewer.port}` },
      })
    ).json()
    expect(hash).toBe(workspaceHash(options.workspace))
  })

  it('keeps documents across a restart', async () => {
    const options = fixture()
    const first = await start(options)
    const headers = {
      host: `localhost:${first.port}`,
      authorization: `Bearer ${first.writeToken}`,
    }
    const body = '{"title":"T","body":[]}'
    await request(first.port, `/v/${first.readToken}/api/docs`, { method: 'POST', headers, body })
    await first.close()
    const second = await start(options)
    const reply = await request(second.port, `/v/${second.readToken}/api/docs`, {
      headers: { host: `localhost:${second.port}` },
    })
    expect(reply.json().docs[0].id).toBe('1-t')
  })
})

describe('ports', () => {
  it('searches 47100–47199 by default', () => {
    expect(FIRST_PORT).toBe(47100)
    expect(LAST_PORT).toBe(47199)
  })

  it('moves past a busy port to the next', async () => {
    const busy = await occupy()
    const free = await freePort()
    const viewer = await start({ ...fixture(), ports: [busy, free] })
    expect(viewer.port).toBe(free)
  })

  it('moves past many busy ports without a warning from Node', async () => {
    const warned = vi.fn()
    process.on('warning', warned)
    const busy = await occupy()
    const viewer = await start({ ...fixture(), ports: [...Array(15).fill(busy), 0] })
    await new Promise((done) => setImmediate(done))
    process.off('warning', warned)
    expect(viewer.port).not.toBe(busy)
    expect(warned).not.toHaveBeenCalled()
  })

  it('fails when every port is taken', async () => {
    const busy = await occupy()
    await expect(startViewer({ ...fixture(), ports: [busy] })).rejects.toBeInstanceOf(
      ViewerStartError,
    )
  })

  it('uses VUI_PORT, and only that', async () => {
    const port = await freePort()
    const options = fixture()
    const viewer = await start({ ...options, env: { ...options.env, VUI_PORT: String(port) } })
    expect(viewer.port).toBe(port)
  })

  it('fails when VUI_PORT is taken, with no fallback', async () => {
    const options = fixture()
    const busy = await occupy()
    const env = { ...options.env, VUI_PORT: String(busy) }
    await expect(startViewer({ ...options, env })).rejects.toThrow(String(busy))
  })

  it.each(['abc', '0', '70000', '47100x', '-1'])('refuses VUI_PORT=%s', async (VUI_PORT) => {
    const options = fixture()
    const env = { ...options.env, VUI_PORT }
    await expect(startViewer({ ...options, env })).rejects.toBeInstanceOf(ViewerStartError)
  })

  it('ignores an empty VUI_PORT', async () => {
    const options = fixture()
    const viewer = await start({ ...options, env: { ...options.env, VUI_PORT: '' } })
    expect(viewer.port).toBeGreaterThan(0)
  })

  it('passes on a failure other than a busy port', async () => {
    await expect(startViewer({ ...fixture(), ports: [70_000] })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('bind', () => {
  it('binds 127.0.0.1 by default and warns about nothing', async () => {
    const warn = vi.fn()
    const viewer = await start({ ...fixture(), warn })
    expect(viewer.address).toBe('127.0.0.1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns on every start with 0.0.0.0', async () => {
    const warn = vi.fn()
    const options = { ...fixture(), bind: '0.0.0.0', warn }
    const viewer = await start(options)
    expect(viewer.address).toBe('0.0.0.0')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toMatch(/warning.*0\.0\.0\.0/)
    expect(warn.mock.calls[0]?.[0]).not.toContain(viewer.readToken)
    await viewer.close()
    await start(options)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('accepts no other address', async () => {
    await expect(startViewer({ ...fixture(), bind: '192.168.1.5' })).rejects.toBeInstanceOf(
      ViewerStartError,
    )
  })
})

describe('one Viewer per workspace', () => {
  it('refuses a second, naming the first', async () => {
    const options = fixture()
    const first = await start(options)
    const second = startViewer(options)
    await expect(second).rejects.toBeInstanceOf(ViewerRunningError)
    await expect(second).rejects.toMatchObject({ port: first.port, pid: process.pid })
    expect(
      (await request(first.port, '/health', { headers: { host: `localhost:${first.port}` } }))
        .status,
    ).toBe(200)
  })

  it('replaces a file whose process is gone', async () => {
    const options = fixture()
    await (await start(options)).close()
    writeFileSync(join(options.dir, 'viewer.json'), '{"pid":2147483646,"port":1}')
    await expect(start(options)).resolves.toBeDefined()
  })

  it('ignores a server that answers for a pid long gone', async () => {
    const options = fixture()
    const first = await start(options)
    writeFileSync(
      join(options.dir, 'viewer.json'),
      JSON.stringify({ pid: 2_147_483_646, port: first.port }),
    )
    await expect(start(options)).resolves.toBeDefined()
  })

  it('replaces a file whose live pid is something else', async () => {
    const options = fixture()
    await (await start(options)).close()
    const port = await occupy()
    writeFileSync(join(options.dir, 'viewer.json'), JSON.stringify({ pid: process.pid, port }))
    await expect(start(options)).resolves.toBeDefined()
  })

  it('replaces an unreadable file', async () => {
    const options = fixture()
    await (await start(options)).close()
    writeFileSync(join(options.dir, 'viewer.json'), 'garbage')
    await expect(start(options)).resolves.toBeDefined()
  })
})

describe('a failed start', () => {
  it('releases the port when viewer.json cannot be written', async () => {
    const options = fixture()
    const port = await freePort()
    mkdirSync(join(options.dir, `viewer.json.${process.pid}.tmp`), { recursive: true })
    await expect(startViewer({ ...options, ports: [port] })).rejects.toThrow()
    await expect(occupy(port)).resolves.toBe(port)
  })
})

describe('close', () => {
  it('removes viewer.json and stops answering', async () => {
    const options = fixture()
    const viewer = await start(options)
    await viewer.close()
    expect(existsSync(join(options.dir, 'viewer.json'))).toBe(false)
    await expect(request(viewer.port, '/health')).rejects.toThrow()
  })

  it('leaves a viewer.json that a newer Viewer owns', async () => {
    const options = fixture()
    const viewer = await start(options)
    const file = join(options.dir, 'viewer.json')
    writeFileSync(file, JSON.stringify({ pid: process.pid + 1, port: 1 }))
    await viewer.close()
    expect(existsSync(file)).toBe(true)
  })

  it('can be called twice, and settles closed', async () => {
    const viewer = await start(fixture())
    await Promise.all([viewer.close(), viewer.close()])
    await expect(viewer.closed).resolves.toBeUndefined()
  })
})

describe('IdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is four hours', () => {
    expect(IDLE_MS).toBe(4 * 60 * 60 * 1000)
  })

  it('fires after the delay with no clients and no documents', () => {
    const onIdle = vi.fn()
    new IdleTimer(IDLE_MS, onIdle).update(0)
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('never fires while a client is connected', () => {
    const onIdle = vi.fn()
    const timer = new IdleTimer(IDLE_MS, onIdle)
    timer.update(0)
    timer.update(1)
    vi.advanceTimersByTime(IDLE_MS * 3)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('starts over on a document and when the last client leaves', () => {
    const onIdle = vi.fn()
    const timer = new IdleTimer(IDLE_MS, onIdle)
    timer.update(0)
    vi.advanceTimersByTime(IDLE_MS - 1)
    timer.update(0)
    vi.advanceTimersByTime(IDLE_MS - 1)
    timer.update(1)
    timer.update(0)
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('stops', () => {
    const onIdle = vi.fn()
    const timer = new IdleTimer(IDLE_MS, onIdle)
    timer.update(0)
    timer.stop()
    vi.advanceTimersByTime(IDLE_MS)
    expect(onIdle).not.toHaveBeenCalled()
  })
})

describe('idle exit', () => {
  it('closes the Viewer', async () => {
    const options = fixture()
    const viewer = await start({ ...options, idleMs: 10 })
    await viewer.closed
    expect(existsSync(join(options.dir, 'viewer.json'))).toBe(false)
  })
})

describe('liveViewer', () => {
  it('finds the running Viewer of this workspace', async () => {
    const workspace = tempDir()
    const env = { XDG_STATE_HOME: tempDir(), VUI_PORT: String(await freePort()) }
    const viewer = await startViewer({ workspace, env })
    const hash = workspaceHash(workspace)
    expect((await liveViewer(viewer.stateDir, hash))?.port).toBe(viewer.port)
    expect(await liveViewer(viewer.stateDir, 'other')).toBeUndefined()
    await viewer.close()
    expect(await liveViewer(viewer.stateDir, hash)).toBeUndefined()
  })

  it.each([
    ['missing', undefined],
    ['corrupt', '{"pid":'],
    ['not numbers', '{"pid":"1","port":"2"}'],
    ['a dead pid', '{"pid":2147483646,"port":1}'],
  ])('reads %s as no Viewer', async (_name, text) => {
    const dir = tempDir()
    if (text !== undefined) writeFileSync(join(dir, 'viewer.json'), text)
    expect(await liveViewer(dir, 'hash')).toBeUndefined()
  })
})

describe('updateViewerInfo', () => {
  const base = { port: 1, readToken: 'r', writeToken: 'w', startedAt: 't', version: 'v' }

  it('merges into the file and keeps it owner-only', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'viewer.json'), JSON.stringify({ ...base, pid: 7 }))
    expect(updateViewerInfo(dir, 7, { browserPageId: 'page' })).toBe(true)
    expect(readViewerInfo(dir)).toMatchObject({ pid: 7, port: 1, browserPageId: 'page' })
    expect(statSync(join(dir, 'viewer.json')).mode & 0o777).toBe(0o600)
  })

  it('leaves the file of another Viewer alone', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'viewer.json'), JSON.stringify({ ...base, pid: 8 }))
    expect(updateViewerInfo(dir, 7, { urlShown: true })).toBe(false)
    expect(readViewerInfo(dir)?.urlShown).toBeUndefined()
  })
})
