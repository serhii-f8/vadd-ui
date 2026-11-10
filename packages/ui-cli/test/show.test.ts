import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { readViewerInfo, stateDirOf, workspaceHash } from '@vadd/ui-viewer'
import { afterEach, describe, expect, it } from 'vitest'
import type { System } from '../src/system.js'
import { type FakeSystem, fakeSystem, tempDir, ViewerFarm, vui, vuiJson } from './helpers.js'

const DOC = '{"title":"Test run","body":["hello"]}'
const OPEN = /^vui: open http:\/\/localhost:\d+\/v\/[0-9a-f]{32}\/$/

let farm: ViewerFarm | undefined
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await farm?.stopAll()
  farm = undefined
  for (const server of servers.splice(0)) server.close()
})

interface Fixture {
  farm: ViewerFarm
  system: System
  dir: string
  workspace: string
  calls: string[][]
}

interface OrcaScript {
  /**
   * Replies by subcommand. A missing one answers as Orca does from what this stub has done: `tab
   * create` opens a numbered tab, `tab list` lists the open tabs, `tab goto` moves one (VD-163).
   */
  create?: () => FakeReply
  list?: () => FakeReply
  goto?: () => FakeReply
}

type FakeReply = { ok: boolean; stdout?: string; timedOut?: boolean }

const created = (page = 'page-1'): FakeReply => ({
  ok: true,
  stdout: JSON.stringify({ ok: true, result: { browserPageId: page } }),
})

function tabs(...list: { browserPageId: string; url: string }[]): FakeReply {
  return { ok: true, stdout: JSON.stringify({ ok: true, result: { tabs: list } }) }
}

function setup(options: { orca?: OrcaScript; env?: NodeJS.ProcessEnv } = {}): Fixture {
  const workspace = tempDir()
  const env: NodeJS.ProcessEnv = { XDG_STATE_HOME: tempDir(), ...options.env }
  const calls: string[][] = []
  const script = options.orca
  const fake: FakeSystem = { cwd: workspace }
  if (script !== undefined) {
    env.PATH = '/bin'
    fake.files = { '/bin/orca-ide': '' }
    const open: { browserPageId: string; url: string }[] = []
    fake.exec = (_file, args) => {
      calls.push([...args])
      if (args[0] === 'goto') {
        const moved = script.goto?.()
        if (moved !== undefined) return moved
        const tab = open.find((one) => one.browserPageId === args[args.indexOf('--page') + 1])
        if (tab === undefined) return { ok: false, stdout: '{"ok":false}' }
        tab.url = args[args.indexOf('--url') + 1] as string
        return { ok: true, stdout: '{"ok":true}' }
      }
      if (args[1] === 'list') return script.list?.() ?? tabs(...open)
      const reply = script.create?.() ?? created(`page-${open.length + 1}`)
      const id = JSON.parse(reply.stdout ?? '{}')?.result?.browserPageId
      if (reply.ok && typeof id === 'string')
        open.push({ browserPageId: id, url: args[args.indexOf('--url') + 1] as string })
      return reply
    }
  }
  farm = new ViewerFarm(env)
  const dir = stateDirOf(workspaceHash(workspace), env)
  return { farm, system: farm.system(fake), workspace, dir, calls }
}

const show = (fixture: Fixture, argv: string[] = [], stdin = DOC) =>
  vui(['show', ...argv], { stdin, system: fixture.system })

const showJson = (fixture: Fixture, argv: string[] = [], stdin = DOC) =>
  vuiJson(['show', ...argv], { stdin, system: fixture.system })

function connect(fixture: Fixture): Promise<() => void> {
  const info = readViewerInfo(fixture.dir)
  const url = `http://127.0.0.1:${info?.port}/v/${info?.readToken}/api/events`
  const abort = new AbortController()
  return fetch(url, { signal: abort.signal }).then(() => () => abort.abort())
}

describe('vui show, without Orca', () => {
  it('prints the one line, then the URL line, on the first show', async () => {
    const fixture = setup()
    const { exit, stdout, stderr } = await show(fixture)
    const lines = stdout.trimEnd().split('\n')
    expect(exit).toBe(0)
    expect(stderr).toBe('')
    expect(lines[0]).toBe('vui: shown "Test run" (#1) in viewer')
    expect(lines[1]).toMatch(OPEN)
    expect(lines).toHaveLength(2)
  })

  // VD-141: a Viewer outlives a session, so the show before this one proves nothing.
  it('prints the URL on every show nobody can see', async () => {
    const fixture = setup()
    await show(fixture)
    const { stdout } = await show(fixture)
    const lines = stdout.trimEnd().split('\n')
    expect(lines[0]).toBe('vui: shown "Test run" (#2) in viewer')
    expect(lines[1]).toMatch(OPEN)
    expect(lines).toHaveLength(2)
    expect(fixture.farm.spawns).toBe(1)
  })

  it('keeps no record of having printed it', async () => {
    const fixture = setup()
    await show(fixture)
    expect(readViewerInfo(fixture.dir)).not.toHaveProperty('urlShown')
  })

  it('prints the URL again after a Viewer start', async () => {
    const fixture = setup()
    await show(fixture)
    await fixture.farm.crash(fixture.farm.viewers[0] as (typeof fixture.farm.viewers)[0])
    const { stdout } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('does not print the URL to a connected reader', async () => {
    const fixture = setup()
    await vui(['viewer', 'start'], { system: fixture.system })
    const disconnect = await connect(fixture)
    const { stdout } = await show(fixture)
    disconnect()
    expect(stdout).toBe('vui: shown "Test run" (#1) in viewer\n')
  })

  it('prints the URL once the reader has closed the page', async () => {
    const fixture = setup()
    await vui(['viewer', 'start'], { system: fixture.system })
    const disconnect = await connect(fixture)
    await show(fixture)
    disconnect()
    await expect.poll(async () => (await showJson(fixture)).json.clients).toBe(0)
    const { stdout } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('names an untitled document', async () => {
    const { stdout } = await show(setup(), [], '{"body":["x"]}')
    expect(stdout.split('\n')[0]).toBe('vui: shown untitled (#1) in viewer')
  })

  it('escapes a title for the terminal', async () => {
    const { stdout } = await show(setup(), [], '{"title":"a\\u001b[2Jb","body":["x"]}')
    expect(stdout).not.toContain('\u001b')
  })

  it('applies --title', async () => {
    const fixture = setup()
    const { stdout } = await show(fixture, ['--title', 'Other'])
    expect(stdout.split('\n')[0]).toBe('vui: shown "Other" (#1) in viewer')
  })

  it('accepts --name, which only names files', async () => {
    const { exit } = await show(setup(), ['--name', 'n'])
    expect(exit).toBe(0)
  })

  it('reads a file', async () => {
    const fixture = setup()
    const path = join(fixture.workspace, 'doc.vui')
    writeFileSync(path, DOC)
    expect((await vui(['show', path], { system: fixture.system })).exit).toBe(0)
  })

  it('stores meta.cwd and meta.branch', async () => {
    const fixture = setup()
    mkdirSync(join(fixture.workspace, '.git'))
    writeFileSync(join(fixture.workspace, '.git', 'HEAD'), 'ref: refs/heads/feat\n')
    await show(fixture, [], '{"meta":{"branch":"forged"},"body":["x"]}')
    const docs = join(fixture.dir, 'docs')
    const stored = readFileSync(join(docs, '1-v.vui.json'), 'utf8')
    expect(JSON.parse(stored).meta).toMatchObject({ cwd: fixture.workspace, branch: 'feat' })
  })

  it('removes a claimed branch outside git', async () => {
    const fixture = setup()
    await show(fixture, [], '{"meta":{"branch":"forged"},"body":["x"]}')
    const stored = readFileSync(join(fixture.dir, 'docs', '1-v.vui.json'), 'utf8')
    expect(JSON.parse(stored).meta).not.toHaveProperty('branch')
  })

  it('prints warnings on stderr and still delivers', async () => {
    const doc = '{"body":[{"type":"checks","items":[{"name":"n","status":"passed"}]}]}'
    const { exit, stderr } = await show(setup(), [], doc)
    expect(exit).toBe(0)
    expect(stderr).toContain('warn')
  })

  it('answers in JSON', async () => {
    const { exit, json } = await showJson(setup())
    expect(exit).toBe(0)
    expect(json).toMatchObject({
      ok: true,
      host: 'viewer',
      seq: 1,
      id: '1-test-run',
      title: 'Test run',
      clients: 0,
      pane: 'none',
      diagnostics: [],
    })
    expect(json.url).toMatch(/^http:\/\/localhost:/)
  })
})

describe('what stops a show before delivery', () => {
  it.each([
    ['invalid', '{"body":[{"type":"tabel"}]}', 1],
    ['unparsable', '{', 2],
    ['too large', 'x'.repeat(300_000), 3],
  ])('%s exits with its code and starts nothing', async (_name, text, code) => {
    const fixture = setup()
    const { exit, stdout, stderr } = await show(fixture, [], text)
    expect(exit).toBe(code)
    expect(stdout).toBe('')
    expect(stderr).not.toBe('')
    expect(fixture.farm.spawns).toBe(0)
  })

  it('refuses a bad host before reading anything', async () => {
    expect((await show(setup(), ['--host', 'x'])).exit).toBe(2)
  })

  it('exits 3 when --title makes the document too large', async () => {
    const fixture = setup()
    const { exit } = await show(fixture, ['--title', 't'.repeat(300_000)])
    expect(exit).toBe(3)
  })
})

describe('no usable host', () => {
  it('exits 4 and names the cause when the Viewer cannot start', async () => {
    const fixture = setup()
    const dead: System = {
      ...fixture.system,
      spawnViewer: () => {
        writeFileSync(join(fixture.dir, 'viewer.log'), 'vui: viewer: no free port among 1–2\n')
        return { pid: 1, exited: Promise.resolve(), kill: () => {} }
      },
    }
    const { exit, stderr } = await vui(['show'], { stdin: DOC, system: dead })
    expect(exit).toBe(4)
    expect(stderr).toContain('no free port')
    expect(stderr).toContain('vui doctor')
  })

  it('exits 5 when the state directory cannot be made', async () => {
    const file = join(tempDir(), 'file')
    writeFileSync(file, '')
    const system = fakeSystem({ cwd: tempDir(), env: { XDG_STATE_HOME: file } })
    expect((await vui(['show'], { stdin: DOC, system })).exit).toBe(5)
  })
})

describe('a Viewer that dies under a show', () => {
  it('restarts it when the POST finds it gone', async () => {
    const fixture = setup()
    await show(fixture)
    const [first] = fixture.farm.viewers
    // Alive for discovery, gone for the POST: the port closes once `/health` has answered.
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/docs') && init?.method === 'POST') {
        globalThis.fetch = original
        await fixture.farm.crash(first as NonNullable<typeof first>)
      }
      return original(input, init)
    }
    const { exit, stdout } = await show(fixture)
    globalThis.fetch = original
    expect(exit).toBe(0)
    expect(stdout.split('\n')[0]).toContain('(#2)')
    expect(fixture.farm.spawns).toBe(2)
  })
})

describe('a failure after the document is stored', () => {
  it('is a warning, with no pane, since a retry would store it twice', async () => {
    const fixture = setup({ orca: {} })
    await vui(['viewer', 'start'], { system: fixture.system })
    chmodSync(fixture.dir, 0o500)
    const { exit, stdout, stderr } = await show(fixture)
    chmodSync(fixture.dir, 0o700)
    expect(exit).toBe(0)
    expect(stdout.split('\n')[0]).toBe('vui: shown "Test run" (#1) in viewer')
    expect(stderr).toMatch(/^vui: warning: Orca did not open a pane \(state-not-writable\)\n$/)
  })

  // VD-163: the pane exists once `tab create` answered, whatever happens to the record of it.
  it('is a warning about the record, not a failed pane, when the id cannot be saved', async () => {
    let fixture: Fixture | undefined
    fixture = setup({
      orca: {
        create: () => {
          chmodSync((fixture as Fixture).dir, 0o500)
          return created()
        },
      },
    })
    await vui(['viewer', 'start'], { system: fixture.system })
    const { exit, stdout, stderr } = await show(fixture)
    chmodSync(fixture.dir, 0o700)
    expect(exit).toBe(0)
    expect(stdout).toBe('vui: shown "Test run" (#1) in viewer\n')
    expect(stderr).toBe(
      'vui: warning: the Orca pane opened but could not be remembered; the next show may open another\n',
    )
    expect(readViewerInfo(fixture.dir)?.browserPageId).toBeUndefined()
  })

  it('reports that pane as opened under --json', async () => {
    let fixture: Fixture | undefined
    fixture = setup({
      orca: {
        create: () => {
          chmodSync((fixture as Fixture).dir, 0o500)
          return created()
        },
      },
    })
    await vui(['viewer', 'start'], { system: fixture.system })
    const { json } = await showJson(fixture)
    chmodSync(fixture.dir, 0o700)
    expect(json).toMatchObject({ pane: 'opened', browserPageId: 'page-1' })
    expect(json).not.toHaveProperty('paneFailure')
  })

  it('still prints the URL without Orca', async () => {
    const fixture = setup()
    await vui(['viewer', 'start'], { system: fixture.system })
    chmodSync(fixture.dir, 0o500)
    const { exit, stdout } = await show(fixture)
    chmodSync(fixture.dir, 0o700)
    expect(exit).toBe(0)
    expect(stdout).toMatch(/\nvui: open http/)
  })
})

describe('the Orca pane', () => {
  it('opens once, records the page and prints no URL', async () => {
    const fixture = setup({ orca: {} })
    const { stdout } = await show(fixture)
    expect(stdout).toBe('vui: shown "Test run" (#1) in viewer\n')
    expect(fixture.calls.map((call) => call[1])).toEqual(['create'])
    expect(readViewerInfo(fixture.dir)?.browserPageId).toBe('page-1')
  })

  it('reports the pane under --json', async () => {
    const { json } = await showJson(setup({ orca: {} }))
    expect(json).toMatchObject({ pane: 'opened', browserPageId: 'page-1' })
  })

  it('does not open a pane for a connected client', async () => {
    const fixture = setup({ orca: {} })
    await vui(['viewer', 'start'], { system: fixture.system })
    const disconnect = await connect(fixture)
    const { json } = await showJson(fixture)
    disconnect()
    expect(json.pane).toBe('none')
    expect(fixture.calls).toEqual([])
  })

  it('keeps a pane that has not connected yet', async () => {
    const orca: OrcaScript = {}
    const fixture = setup({ orca })
    await show(fixture)
    const { url } = (await showJson(fixture)).json as { url: string }
    orca.list = () => tabs({ browserPageId: 'page-1', url })
    fixture.calls.length = 0
    const { json } = await showJson(fixture)
    expect(json.pane).toBe('kept')
    expect(fixture.calls.map((call) => call[1])).toEqual(['list'])
  })

  it('prints no URL for a pane that is still loading', async () => {
    const orca: OrcaScript = {}
    const fixture = setup({ orca })
    const { url } = (await showJson(fixture)).json as { url: string }
    orca.list = () => tabs({ browserPageId: 'page-1', url })
    const { stdout } = await show(fixture)
    expect(stdout).toBe('vui: shown "Test run" (#2) in viewer\n')
  })

  // VD-163: the stub lists what it opened, so a second show finds the first one's pane.
  it('keeps the pane the last show opened, and opens no second', async () => {
    const fixture = setup({ orca: {} })
    await show(fixture)
    const { json } = await showJson(fixture)
    expect(json).toMatchObject({ pane: 'kept', browserPageId: 'page-1' })
    expect(fixture.calls.map((call) => call[1])).toEqual(['create', 'list'])
  })

  it('prints no URL for the pane it reopens after a tab was closed', async () => {
    const fixture = setup({ orca: { create: () => created('page-2'), list: () => tabs() } })
    await show(fixture)
    const { stdout } = await show(fixture)
    expect(stdout).toBe('vui: shown "Test run" (#2) in viewer\n')
    expect(readViewerInfo(fixture.dir)?.browserPageId).toBe('page-2')
  })

  it('opens another when the pane was closed', async () => {
    const fixture = setup({ orca: { create: () => created('page-2'), list: () => tabs() } })
    await show(fixture)
    await show(fixture)
    expect(readViewerInfo(fixture.dir)?.browserPageId).toBe('page-2')
    expect(fixture.calls.map((call) => call[1])).toEqual(['create', 'list', 'create'])
  })

  it('leaves a pane the reader took elsewhere, and opens one', async () => {
    const orca: OrcaScript = { list: () => tabs({ browserPageId: 'page-1', url: 'http://x/' }) }
    const fixture = setup({ orca })
    await show(fixture)
    fixture.calls.length = 0
    await show(fixture)
    expect(fixture.calls.map((call) => call[1])).toEqual(['list', 'create'])
  })

  it('opens one when the list fails', async () => {
    const fixture = setup({ orca: { list: () => ({ ok: false }) } })
    await show(fixture)
    fixture.calls.length = 0
    const { exit } = await show(fixture)
    expect(exit).toBe(0)
    expect(fixture.calls.map((call) => call[1])).toEqual(['list', 'create'])
  })

  it('moves the pane of a killed Viewer to the new URL (VD-114)', async () => {
    const orca: OrcaScript = {}
    const fixture = setup({ orca })
    const first = (await showJson(fixture)).json as { url: string }
    orca.list = () => tabs({ browserPageId: 'page-1', url: first.url })
    await fixture.farm.crash(fixture.farm.viewers[0] as (typeof fixture.farm.viewers)[0])
    fixture.calls.length = 0
    const { json } = await showJson(fixture)
    expect(json).toMatchObject({ pane: 'moved', browserPageId: 'page-1' })
    expect(json.url).not.toBe(first.url)
    expect(fixture.calls[1]).toEqual(['goto', '--page', 'page-1', '--url', json.url, '--json'])
    expect(readViewerInfo(fixture.dir)?.browserPageId).toBe('page-1')
  })

  it('prints no URL for a pane it moved', async () => {
    const orca: OrcaScript = {}
    const fixture = setup({ orca })
    const first = (await showJson(fixture)).json as { url: string }
    orca.list = () => tabs({ browserPageId: 'page-1', url: first.url })
    await fixture.farm.crash(fixture.farm.viewers[0] as (typeof fixture.farm.viewers)[0])
    const { stdout } = await show(fixture)
    expect(stdout).toBe('vui: shown "Test run" (#2) in viewer\n')
  })

  it('opens a new pane when the old one will not move', async () => {
    const orca: OrcaScript = { goto: () => ({ ok: false, stdout: '{"ok":false}' }) }
    const fixture = setup({ orca })
    const first = (await showJson(fixture)).json as { url: string }
    orca.list = () => tabs({ browserPageId: 'page-1', url: first.url })
    await fixture.farm.crash(fixture.farm.viewers[0] as (typeof fixture.farm.viewers)[0])
    const { json } = await showJson(fixture)
    expect(json.pane).toBe('opened')
  })

  it('leaves opening to the show that holds the lock', async () => {
    const fixture = setup({ orca: {} })
    await vui(['viewer', 'start'], { system: fixture.system })
    writeFileSync(join(fixture.dir, 'pane.lock'), String(process.pid))
    const { stdout, exit } = await show(fixture)
    expect(exit).toBe(0)
    expect(stdout).toBe('vui: shown "Test run" (#1) in viewer\n')
    expect(fixture.calls).toEqual([])
  })

  it('starts a killed Viewer while another show holds the pane lock', async () => {
    const fixture = setup({ orca: {} })
    await show(fixture)
    await fixture.farm.crash(fixture.farm.viewers[0] as (typeof fixture.farm.viewers)[0])
    writeFileSync(join(fixture.dir, 'pane.lock'), String(process.pid))
    expect((await show(fixture)).exit).toBe(0)
  })

  it('--no-open skips Orca and prints the URL', async () => {
    const fixture = setup({ orca: {} })
    const { stdout } = await show(fixture, ['--no-open'])
    expect(fixture.calls).toEqual([])
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('--no-open prints the URL each time', async () => {
    const fixture = setup({ orca: {} })
    await show(fixture, ['--no-open'])
    const { stdout } = await show(fixture, ['--no-open'])
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  // VD-141: only `tab list` can tell a recorded pane from a closed one, and this flag skips Orca.
  it('--no-open prints the URL over a recorded pane, without asking Orca', async () => {
    const fixture = setup({ orca: {} })
    await show(fixture)
    await show(fixture, ['--no-open'])
    fixture.calls.length = 0
    const { stdout } = await show(fixture, ['--no-open'])
    expect(fixture.calls).toEqual([])
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('does not open a pane over SSH (§4.0)', async () => {
    const fixture = setup({ orca: {}, env: { SSH_CONNECTION: 'a b c d' } })
    const { stdout } = await show(fixture)
    expect(fixture.calls).toEqual([])
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('prints the URL on every show over SSH', async () => {
    const fixture = setup({ orca: {}, env: { SSH_CONNECTION: 'a b c d' } })
    await show(fixture)
    const { stdout } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
  })

  it('prints the URL on every failed Orca call', async () => {
    const fixture = setup({ orca: { create: () => ({ ok: false }) } })
    await show(fixture)
    const { stdout, stderr } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
    expect(stderr).toMatch(/^vui: warning: Orca did not open a pane \([a-z-]+\)\n$/)
  })

  it('prints the URL when a recorded pane cannot be listed or replaced', async () => {
    const orca: OrcaScript = {}
    const fixture = setup({ orca })
    await show(fixture)
    orca.list = () => ({ ok: false })
    orca.create = () => ({ ok: false })
    const { stdout, stderr } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
    expect(stderr).toContain('Orca did not open a pane')
  })

  // VD-130's minor, closed by VD-141.
  it('prints the URL when Orca fails after --no-open printed it', async () => {
    const fixture = setup({ orca: { create: () => ({ ok: false }) } })
    await show(fixture, ['--no-open'])
    const { stdout, stderr } = await show(fixture)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
    expect(stderr).toContain('Orca did not open a pane')
  })

  it.each<[string, FakeReply]>([
    ['ok: false', { ok: false, stdout: '{"ok":false,"error":{"code":"boom"}}' }],
    ['a reply that is not JSON', { ok: true, stdout: 'hello' }],
    ['a timeout', { ok: false, timedOut: true }],
  ])('still delivers on %s, with the URL and one warning', async (_name, reply) => {
    const fixture = setup({ orca: { create: () => reply } })
    const { exit, stdout, stderr } = await show(fixture)
    expect(exit).toBe(0)
    expect(stdout.trimEnd().split('\n')[1]).toMatch(OPEN)
    expect(stderr).toMatch(/^vui: warning: Orca did not open a pane \([a-z-]+\)\n$/)
  })
})

interface Stub {
  url: string
  requests: { url?: string; authorization?: string; body: string }[]
}

async function stub(answer: (req: IncomingMessage, res: ServerResponse) => void): Promise<Stub> {
  const requests: Stub['requests'] = []
  const server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8').on('data', (text: string) => {
      body += text
    })
    req.on('end', () => {
      requests.push({ url: req.url, authorization: req.headers.authorization, body })
      answer(req, res)
    })
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}/v/abc`, requests }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

const custom = (url: string, token?: string) => {
  const env: NodeJS.ProcessEnv = { VUI_VIEWER_URL: url, XDG_STATE_HOME: tempDir() }
  if (token !== undefined) env.VUI_VIEWER_TOKEN = token
  return fakeSystem({ env, cwd: tempDir() })
}

const REPLY = { seq: 7, id: '7-t', url: 'http://vadd/feed', clients: 2 }

describe('VUI_VIEWER_URL and VUI_VIEWER_TOKEN', () => {
  it('posts to the endpoint with the bearer token and starts nothing', async () => {
    const server = await stub((_req, res) => json(res, 201, REPLY))
    const system = custom(`${server.url}/`, 'secret')
    const { exit, stdout } = await vui(['show'], { stdin: DOC, system })
    expect(exit).toBe(0)
    expect(stdout).toBe('vui: shown "Test run" (#7) in viewer\n')
    expect(server.requests[0]).toMatchObject({
      url: '/v/abc/api/docs',
      authorization: 'Bearer secret',
    })
    expect(JSON.parse(server.requests[0]?.body ?? '').title).toBe('Test run')
    expect(existsSync(join(system.env.XDG_STATE_HOME as string, 'vadd-ui'))).toBe(false)
  })

  it('sends no Authorization without a token', async () => {
    const server = await stub((_req, res) => json(res, 201, REPLY))
    await vui(['show'], { stdin: DOC, system: custom(server.url) })
    expect(server.requests[0]?.authorization).toBeUndefined()
  })

  it('prints the URL when nobody is connected', async () => {
    const server = await stub((_req, res) => json(res, 201, { ...REPLY, clients: 0 }))
    const { stdout } = await vui(['show'], { stdin: DOC, system: custom(server.url) })
    expect(stdout.trimEnd().split('\n')[1]).toBe('vui: open http://vadd/feed')
  })

  it('exits 4 on a URL that is not http', async () => {
    const { exit, stderr } = await vui(['show'], { stdin: DOC, system: custom('ftp://x') })
    expect(exit).toBe(4)
    expect(stderr).toContain('VUI_VIEWER_URL')
  })

  it('exits 4 on nonsense', async () => {
    expect((await vui(['show'], { stdin: DOC, system: custom('::') })).exit).toBe(4)
  })

  it('exits 4 when it cannot be reached', async () => {
    const system = custom('http://127.0.0.1:9/v/x', 'secret')
    const { exit, stderr } = await vui(['show'], { stdin: DOC, system })
    expect(exit).toBe(4)
    expect(stderr).not.toContain('secret')
  })

  it.each<[string, number, unknown, number]>([
    ['401', 401, { ok: false }, 4],
    ['500', 500, {}, 4],
    ['507 (VD-160)', 507, { ok: false, error: 'storage' }, 5],
    ['413', 413, { ok: false, error: 'too-large' }, 3],
    ['422 with no diagnostics', 422, { ok: false }, 1],
    ['a reply with no seq', 201, { id: 'x' }, 4],
  ])('maps %s', async (_name, status, body, code) => {
    const server = await stub((_req, res) => json(res, status, body))
    const { exit } = await vui(['show'], { stdin: DOC, system: custom(server.url) })
    expect(exit).toBe(code)
  })

  it('prints the diagnostics of a 422', async () => {
    const diagnostics = [{ severity: 'error', path: '/x', code: 'bad-value', message: 'no' }]
    const server = await stub((_req, res) => json(res, 422, { ok: false, diagnostics }))
    const { exit, stderr } = await vui(['show'], { stdin: DOC, system: custom(server.url) })
    expect(exit).toBe(1)
    expect(stderr).toContain('/x: no')
  })

  it('retries a 429', async () => {
    let tries = 0
    const server = await stub((_req, res) => {
      tries++
      if (tries === 1) json(res, 429, { ok: false })
      else json(res, 201, REPLY)
    })
    const system = { ...custom(server.url), sleep: async () => {} }
    expect((await vui(['show'], { stdin: DOC, system })).exit).toBe(0)
    expect(tries).toBe(2)
  })

  it('stops retrying a 429', async () => {
    const server = await stub((_req, res) => json(res, 429, { ok: false }))
    const system = { ...custom(server.url), sleep: async () => {} }
    expect((await vui(['show'], { stdin: DOC, system })).exit).toBe(4)
    expect(server.requests).toHaveLength(3)
  })
})
