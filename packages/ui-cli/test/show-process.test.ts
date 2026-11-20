import { spawn } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stateDirOf, workspaceHash } from '@vadd/ui-viewer'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_POSIX_MODES, NO_PROC, NO_READONLY_DIRS } from '../../ui-viewer/test/platform.js'
import { stateHome, tempDir } from './helpers.js'

// The real `dist/bin.js` and a real detached Viewer, which `pnpm gate` builds first.

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url))
const DOC = '{"title":"T","body":["hello"]}'

interface Workspace {
  cwd: string
  env: NodeJS.ProcessEnv
  dir: string
}

const open = new Set<Workspace>()

/** Without Orca: from an Orca terminal, `orca-ide` on `PATH` would open real panes. */
function cleanEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const entries = Object.entries(process.env).filter(([name]) => !name.startsWith('ORCA_'))
  return { ...Object.fromEntries(entries), PATH: dirname(process.execPath), ...extra }
}

function workspace(extra: NodeJS.ProcessEnv = {}): Workspace {
  const cwd = tempDir()
  const env = cleanEnv({ ...stateHome(), ...extra })
  const place = { cwd, env, dir: stateDirOf(workspaceHash(cwd), env) }
  open.add(place)
  return place
}

interface Result {
  exit: number | null
  stdout: string
  stderr: string
}

function vui({ cwd, env }: Workspace, argv: string[], stdin = ''): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...argv], { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      stderr += text
    })
    child.stdin.end(stdin)
    child.on('error', reject)
    child.on('close', (exit) => resolve({ exit, stdout, stderr }))
  })
}

const info = ({ dir }: Workspace) => JSON.parse(readFileSync(join(dir, 'viewer.json'), 'utf8'))

const log = ({ dir }: Workspace) => readFileSync(join(dir, 'viewer.log'), 'utf8')

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  await Promise.all([...open].map((place) => vui(place, ['viewer', 'stop'])))
  open.clear()
})

describe('dist/bin.js show', () => {
  it('leaves a detached Viewer behind and logs its stderr', async () => {
    const place = workspace()
    const { exit, stdout, stderr } = await vui(place, ['show'], DOC)
    expect(exit).toBe(0)
    expect(stderr).toBe('')
    expect(stdout.split('\n')[0]).toBe('vui: shown "T" (#1) in viewer')
    expect(stdout).toMatch(/\nvui: open http:\/\/localhost:\d+\/v\/[0-9a-f]{32}\/\n$/)
    const { pid } = info(place)
    expect(alive(pid)).toBe(true)
    if (!NO_PROC) {
      // Field 5 of /proc/<pid>/stat is the process group, past the name in parentheses.
      const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.split(' ') ?? []
      expect(Number(fields[2])).toBe(pid)
    }
    expect(log(place)).toContain('Viewer listening on port')
    expect(log(place)).not.toContain(info(place).readToken)
    if (!NO_POSIX_MODES) expect(statMode(join(place.dir, 'viewer.log'))).toBe(0o600)
  })

  it('reuses it', async () => {
    const place = workspace()
    await vui(place, ['show'], DOC)
    const { pid } = info(place)
    expect((await vui(place, ['show'], DOC)).stdout.split('\n')[0]).toBe(
      'vui: shown "T" (#2) in viewer',
    )
    expect(info(place).pid).toBe(pid)
  })

  // VD-141: each `vui` here is a new process, as a new session's would be.
  it('gives a new session the URL on a running Viewer, and not while a reader is connected', async () => {
    const place = workspace()
    await vui(place, ['show'], DOC)
    const { pid, port, readToken } = info(place)
    const URL_LINE = `vui: open http://localhost:${port}/v/${readToken}/\n`
    expect((await vui(place, ['show'], DOC)).stdout).toBe(
      `vui: shown "T" (#2) in viewer\n${URL_LINE}`,
    )

    const reader = new AbortController()
    const events = `http://127.0.0.1:${port}/v/${readToken}/api/events`
    await fetch(events, { signal: reader.signal })
    expect((await vui(place, ['show'], DOC)).stdout).toBe('vui: shown "T" (#3) in viewer\n')
    expect(info(place).pid).toBe(pid)
    expect(info(place)).not.toHaveProperty('urlShown')
  })

  it('restarts a killed Viewer, and the feed goes on', async () => {
    const place = workspace()
    await vui(place, ['show'], DOC)
    const { pid, readToken } = info(place)
    process.kill(pid, 'SIGKILL')
    const { exit, stdout } = await vui(place, ['show'], DOC)
    expect(exit).toBe(0)
    expect(stdout.split('\n')[0]).toBe('vui: shown "T" (#2) in viewer')
    expect(stdout).toContain('vui: open ')
    expect(info(place).pid).not.toBe(pid)
    expect(info(place).readToken).not.toBe(readToken)
  })

  // VD-160: a Viewer whose `docs/` cannot be written answers 507, and `vui show` exits 5.
  it.skipIf(NO_READONLY_DIRS)('exits 5 when the Viewer cannot write docs/', async () => {
    const place = workspace()
    expect((await vui(place, ['show'], DOC)).exit).toBe(0)
    const docs = join(place.dir, 'docs')
    chmodSync(docs, 0o500)
    try {
      const { exit, stderr } = await vui(place, ['show'], DOC)
      expect(exit).toBe(5)
      expect(stderr).toContain('the Viewer cannot store documents')
    } finally {
      chmodSync(docs, 0o700)
    }
  })

  it('ends five simultaneous shows with one Viewer and five documents', async () => {
    const place = workspace()
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => vui(place, ['show'], DOC)))
    expect(results.map(({ exit }) => exit)).toEqual([0, 0, 0, 0, 0])
    const seqs = results.map(({ stdout }) => /#(\d+)/.exec(stdout)?.[1])
    expect(new Set(seqs).size).toBe(5)
    expect(log(place).match(/Viewer listening on port/g)).toHaveLength(1)
    expect(existsSync(join(place.dir, 'viewer.lock'))).toBe(false)
  })

  it('exits 4 and names the cause when the port is taken by a bad VUI_PORT', async () => {
    const place = workspace({ VUI_PORT: 'nope' })
    const { exit, stdout, stderr } = await vui(place, ['show'], DOC)
    expect(exit).toBe(4)
    expect(stdout).toBe('')
    expect(stderr).toContain('VUI_PORT is not a port')
    expect(stderr).toContain('vui doctor')
  })

  it('opens one pane for five simultaneous shows, through a stub Orca', async () => {
    const { stub, calls } = orcaStub()
    const place = workspace({ ORCA_CLI_COMMAND: stub })
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => vui(place, ['show'], DOC)))
    expect(results.every(({ exit }) => exit === 0)).toBe(true)
    const created = readFileSync(calls, 'utf8').match(/^tab create/gm)
    expect(created).toHaveLength(1)
    expect(info(place).browserPageId).toBe('page-1')
  })

  it('moves the pane to a restarted Viewer, and the next show keeps it', async () => {
    const { stub, calls } = orcaStub()
    const place = workspace({ ORCA_CLI_COMMAND: stub })
    expect(await json(place)).toMatchObject({ pane: 'opened', browserPageId: 'page-1' })
    process.kill(info(place).pid, 'SIGKILL')
    expect(await json(place)).toMatchObject({ pane: 'moved', browserPageId: 'page-1' })
    expect(await json(place)).toMatchObject({ pane: 'kept', browserPageId: 'page-1' })
    const log = readFileSync(calls, 'utf8')
    expect(log.match(/^tab create/gm)).toHaveLength(1)
    expect(log.match(/^goto --page page-1 /gm)).toHaveLength(1)
  })

  it('moves the pane after a graceful vui viewer stop, and status reads stopped (B1)', async () => {
    const { stub, calls } = orcaStub()
    const place = workspace({ ORCA_CLI_COMMAND: stub })
    expect(await json(place)).toMatchObject({ pane: 'opened', browserPageId: 'page-1' })
    expect((await vui(place, ['viewer', 'stop'])).exit).toBe(0)
    expect(info(place)).toMatchObject({ browserPageId: 'page-1' })
    expect(info(place).pid).toBeUndefined()
    expect((await vui(place, ['viewer', 'status'])).stdout).toBe('vui: no viewer running\n')
    expect((await vui(place, ['viewer', 'stop'])).stdout).toBe('vui: no viewer running\n')
    expect(await json(place)).toMatchObject({ pane: 'moved', browserPageId: 'page-1' })
    expect(await json(place)).toMatchObject({ pane: 'kept', browserPageId: 'page-1' })
    const log = readFileSync(calls, 'utf8')
    expect(log.match(/^tab create/gm)).toHaveLength(1)
    expect(log.match(/^goto --page page-1 /gm)).toHaveLength(1)
  })
})

/** `vui show --json`'s object. */
async function json(place: Workspace): Promise<Record<string, unknown>> {
  const { exit, stdout } = await vui(place, ['show', '--json'], DOC)
  expect(exit).toBe(0)
  return JSON.parse(stdout) as Record<string, unknown>
}

/**
 * A stub `orca` that answers as Orca does from what it has done (VD-142, VD-163): `tab create`
 * opens a numbered tab, `tab list` lists them, and `goto` moves one and answers `{ok: true}`, or
 * fails for a page it never opened.
 */
function orcaStub(): { stub: string; calls: string } {
  const dir = tempDir()
  const calls = join(dir, 'calls')
  const tabs = join(dir, 'tabs')
  const script = join(dir, 'orca-stub.cjs')
  writeFileSync(
    script,
    `const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(calls)}, args.join(' ') + '\\n')
const tabs = ${JSON.stringify(tabs)}
const known = existsSync(tabs) ? JSON.parse(readFileSync(tabs, 'utf8')) : []
const url = args[args.indexOf('--url') + 1]
if (args[0] === 'goto') {
  const tab = known.find((one) => one.browserPageId === args[args.indexOf('--page') + 1])
  if (tab !== undefined) {
    tab.url = url
    writeFileSync(tabs, JSON.stringify(known))
  }
  console.log(JSON.stringify(tab === undefined ? { ok: false } : { ok: true }))
  process.exit(tab === undefined ? 1 : 0)
}
if (args[1] !== 'list') {
  known.push({ browserPageId: 'page-' + (known.length + 1), url })
  writeFileSync(tabs, JSON.stringify(known))
}
const result = args[1] === 'list' ? { tabs: known } : known[known.length - 1]
console.log(JSON.stringify({ ok: true, result }))
`,
  )
  return { stub: launcher(dir, script), calls }
}

describe('dist/bin.js viewer', () => {
  it('start, status, url, stop', async () => {
    const place = workspace()
    expect((await vui(place, ['viewer', 'status'])).stdout).toBe('vui: no viewer running\n')
    expect((await vui(place, ['viewer', 'start'])).stdout).toContain('viewer started')
    const { pid, port, readToken } = info(place)
    expect((await vui(place, ['viewer', 'status'])).stdout).toContain(`port ${port}`)
    expect((await vui(place, ['viewer', 'url'])).stdout).toBe(
      `http://localhost:${port}/v/${readToken}/\n`,
    )
    expect((await vui(place, ['viewer', 'stop'])).exit).toBe(0)
    expect(alive(pid)).toBe(false)
    expect(existsSync(join(place.dir, 'viewer.json'))).toBe(false)
  })

  it('serves the built feed app, so app.js is where the Viewer looks', async () => {
    const place = workspace()
    await vui(place, ['viewer', 'start'])
    const { port, readToken } = info(place)
    const reply = await fetch(`http://127.0.0.1:${port}/v/${readToken}/app.js`)
    expect(reply.status).toBe(200)
    expect((await reply.text()).length).toBeGreaterThan(1000)
  })
})

function statMode(path: string): number {
  return statSync(path).mode & 0o777
}

/**
 * An executable that runs `script` with this Node: a `#!` file on POSIX, and on Windows a
 * `.cmd`, the form Orca's own launcher can take there, which `vui` runs through `cmd.exe`.
 */
function launcher(dir: string, script: string): string {
  if (process.platform === 'win32') {
    const cmd = join(dir, 'orca-stub.cmd')
    writeFileSync(cmd, `@"${process.execPath}" "${script}" %*\r\n`)
    return cmd
  }
  const stub = join(dir, 'orca-stub')
  writeFileSync(stub, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
  chmodSync(stub, 0o755)
  return stub
}
