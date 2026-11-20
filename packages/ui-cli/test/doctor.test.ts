import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { type AddressInfo, createServer as createNetServer, type Socket } from 'node:net'
import { join, posix } from 'node:path'
import { stateDirOf, workspaceHash } from '@vadd/ui-viewer'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_READONLY_DIRS } from '../../ui-viewer/test/platform.js'
import type { ExecResult, System } from '../src/system.js'
import { fakeSystem, stateHome, tempDir, ViewerFarm, vui, vuiJson } from './helpers.js'

interface Check {
  name: string
  status: string
  detail: string
  fix?: string
}

let farm: ViewerFarm | undefined

afterEach(async () => {
  await farm?.stopAll()
  farm = undefined
})

async function checks(system: System) {
  const { exit, json } = await vuiJson(['doctor'], { system })
  const list = json.checks as Check[]
  return { exit, list, of: (name: string) => list.find((check) => check.name === name) as Check }
}

const WSL = { WSL_DISTRO_NAME: 'Ubuntu-22.04' }
const POWERSHELL_PATH = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

/** WSL with a fake Windows. `reach` answers the §11.1 PowerShell command. */
function wsl(mode: string, reach: Partial<ExecResult>, env: NodeJS.ProcessEnv = {}): System {
  return fakeSystem({
    cwd: tempDir(),
    env: { ...WSL, ...stateHome(), ...env },
    exec: (file) => {
      if (file === 'wslinfo') return { ok: true, stdout: `${mode}\n` }
      if (file === 'powershell.exe') return reach
      return { ok: false, missing: true }
    },
  })
}

describe('vui doctor', () => {
  it('reports every §11.1 check on a plain machine, with no failure', async () => {
    const system = fakeSystem({ cwd: tempDir(), env: { ...stateHome() } })
    const { exit, list } = await checks(system)
    expect(exit).toBe(0)
    expect(list.map(({ name }) => name)).toEqual([
      'node',
      'environment',
      'orca-cli',
      'orca-chat',
      'state',
      'viewer',
    ])
  })

  it('prints one line per check, and a fix under a failure', async () => {
    const file = join(tempDir(), 'file')
    writeFileSync(file, '')
    const system = fakeSystem({ cwd: tempDir(), env: { ...stateHome(file) } })
    const { exit, stdout, stderr } = await vui(['doctor'], { system })
    expect(exit).toBe(4)
    expect(stderr).toMatch(/^ok {3}node: /m)
    expect(stderr).toMatch(/^fail {1}state: .*\n {5}fix: /m)
    expect(stderr).toMatch(/^info {1}orca-cli: /m)
    expect(stdout).toBe('vui: doctor: 6 checks, 1 failure\n')
  })

  it('prints each check as it finishes, before the slow ones end', async () => {
    const lines: string[] = []
    let atProbe = ''
    const base = wsl('mirrored', { ok: true, stdout: '200\r\n' })
    const system: System = {
      ...base,
      exec: (file, args, options) => {
        if (file === 'powershell.exe') atProbe = lines.join('')
        return base.exec(file, args, options)
      },
    }
    const { run } = await import('../src/run.js')
    await run(['doctor'], {
      stdin: process.stdin,
      stdout: () => undefined,
      stderr: (text) => lines.push(text),
      now: () => new Date(),
      readBundle: () => '',
      readSchema: () => '',
      system,
    })
    expect(atProbe).toMatch(/^ok {3}node: [^]*^info {1}viewer: /m)
    expect(atProbe).not.toContain('windows')
    expect(lines.join('')).toMatch(/^ok {3}windows: /m)
  })

  it('leaves no workspace folder behind for its write check (B14)', async () => {
    const workspace = tempDir()
    const env = { ...stateHome() }
    const { of } = await checks(fakeSystem({ cwd: workspace, env }))
    expect(of('state').status).toBe('ok')
    expect(existsSync(stateDirOf(workspaceHash(workspace), env))).toBe(false)
  })

  it('keeps a workspace folder that was there before', async () => {
    const workspace = tempDir()
    const env = { ...stateHome() }
    const dir = stateDirOf(workspaceHash(workspace), env)
    mkdirSync(dir, { recursive: true })
    await checks(fakeSystem({ cwd: workspace, env }))
    expect(existsSync(dir)).toBe(true)
  })

  it('fails an old Node', async () => {
    const system = {
      ...fakeSystem({ cwd: tempDir(), env: { ...stateHome() } }),
      nodeVersion: '18.19.0',
    }
    const { exit, of } = await checks(system)
    expect(exit).toBe(4)
    expect(of('node').status).toBe('fail')
    expect(of('node').fix).toContain('20')
  })

  it.each([
    ['ssh', { SSH_CONNECTION: 'a b c d' }, 'ssh -L'],
    ['wsl', WSL, 'Ubuntu-22.04'],
  ])('names the %s environment', async (kind, env, text) => {
    const system = fakeSystem({ cwd: tempDir(), env: { ...stateHome(), ...env } })
    const { of } = await checks(system)
    expect(of('environment').detail).toContain(kind)
    expect(of('environment').detail).toContain(text)
  })

  it('tells a container to publish the port', async () => {
    const env = { ...stateHome() }
    const system = fakeSystem({ cwd: tempDir(), env, files: { '/.dockerenv': '' } })
    expect((await checks(system)).of('environment').detail).toContain('--bind 0.0.0.0')
  })

  it('finds the Orca CLI', async () => {
    const env = { PATH: '/bin', ...stateHome() }
    const files = { '/bin/orca-ide': '' }
    const system = fakeSystem({ cwd: tempDir(), env, files, pathJoin: posix.join })
    const { of } = await checks(system)
    expect(of('orca-cli')).toMatchObject({ status: 'ok', detail: '/bin/orca-ide' })
  })

  it('accepts a writable scratch dir', async () => {
    const env = { ORCA_CHAT_SCRATCH_DIR: tempDir(), ...stateHome() }
    const { of } = await checks(fakeSystem({ cwd: tempDir(), env }))
    expect(of('orca-chat').status).toBe('ok')
  })

  it.skipIf(NO_READONLY_DIRS)('fails a scratch dir it cannot write', async () => {
    const dir = tempDir()
    chmodSync(dir, 0o500)
    const env = { ORCA_CHAT_SCRATCH_DIR: dir, ...stateHome() }
    const { of, exit } = await checks(fakeSystem({ cwd: tempDir(), env }))
    chmodSync(dir, 0o700)
    expect(exit).toBe(4)
    expect(of('orca-chat')).toMatchObject({ status: 'fail' })
    expect(of('orca-chat').fix).toBeDefined()
  })

  it('says a stopped Viewer starts by itself', async () => {
    const { of } = await checks(fakeSystem({ cwd: tempDir(), env: { ...stateHome() } }))
    expect(of('viewer')).toMatchObject({ status: 'info' })
    expect(of('viewer').detail).toContain('vui show')
  })

  it('reports a healthy Viewer', async () => {
    farm = new ViewerFarm({ ...stateHome() })
    const system = farm.system({ cwd: tempDir() })
    await vui(['viewer', 'start'], { system })
    const { of } = await checks(system)
    expect(of('viewer').status).toBe('ok')
    expect(of('viewer').detail).toMatch(/port \d+/)
  })

  it('fails a Viewer that does not answer', async () => {
    const workspace = tempDir()
    const env = { ...stateHome() }
    const dir = stateDirOf(workspaceHash(workspace), env)
    const sockets: Socket[] = []
    const server = createNetServer((socket) => sockets.push(socket))
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'viewer.json'), JSON.stringify({ pid: process.pid, port }))
    const { of, exit } = await checks(fakeSystem({ cwd: workspace, env }))
    for (const socket of sockets) socket.destroy()
    server.close()
    expect(exit).toBe(4)
    expect(of('viewer').fix).toContain('vui viewer stop')
  })

  it('warns about a Viewer of another version', async () => {
    farm = new ViewerFarm({ ...stateHome() })
    const system = farm.system({ cwd: tempDir() })
    await vui(['viewer', 'start'], { system })
    const { readViewerInfo, updateViewerInfo } = await import('@vadd/ui-viewer')
    const [viewer] = farm.viewers
    const dir = viewer?.stateDir as string
    updateViewerInfo(dir, readViewerInfo(dir)?.pid as number, { version: '0.0.1-old' })
    const { of, exit } = await checks(system)
    expect(exit).toBe(0)
    expect(of('viewer')).toMatchObject({ status: 'warn' })
    expect(of('viewer').fix).toContain('vui viewer stop')
  })
})

describe('--quick', () => {
  it('skips the Windows probe and says so', async () => {
    let probed = false
    const base = wsl('mirrored', { ok: true, stdout: '200\r\n' })
    const system: System = {
      ...base,
      exec: (file, args, options) => {
        if (file.includes('powershell')) probed = true
        return base.exec(file, args, options)
      },
    }
    const { exit, json } = await vuiJson(['doctor', '--quick'], { system })
    expect(exit).toBe(0)
    expect(probed).toBe(false)
    expect((json.checks as Check[]).at(-1)).toEqual({
      name: 'windows',
      status: 'skipped',
      detail: 'skipped by --quick',
    })
  })

  it('changes nothing outside WSL', async () => {
    const system = fakeSystem({ cwd: tempDir(), env: { ...stateHome() } })
    const { json } = await vuiJson(['doctor', '--quick'], { system })
    expect((json.checks as Check[]).map(({ name }) => name)).not.toContain('windows')
  })
})

describe('reachability from Windows', () => {
  it('passes under mirrored networking', async () => {
    const { of, exit } = await checks(wsl('mirrored', { ok: true, stdout: '200\r\n' }))
    expect(exit).toBe(0)
    expect(of('windows')).toMatchObject({ status: 'ok' })
    expect(of('windows').detail).toContain('mirrored')
  })

  it('gives PowerShell long enough, since Windows tries ::1 first and takes 21 s here', async () => {
    let timeoutMs = 0
    const base = wsl('mirrored', { ok: true, stdout: '200\r\n' })
    const system: System = {
      ...base,
      exec: (file, args, options) => {
        if (file === 'powershell.exe') timeoutMs = options?.timeoutMs ?? 0
        return base.exec(file, args, options)
      },
    }
    await checks(system)
    expect(timeoutMs).toBeGreaterThanOrEqual(45_000)
  })

  it('says how long it took', async () => {
    const { of } = await checks(wsl('mirrored', { ok: true, stdout: '200\r\n' }))
    expect(of('windows').detail).toMatch(/, \d+ s\)$/)
  })

  it('passes under NAT (fake: this machine is mirrored)', async () => {
    const { of } = await checks(wsl('nat', { ok: true, stdout: '200\r\n' }))
    expect(of('windows')).toMatchObject({ status: 'ok' })
    expect(of('windows').detail).toContain('nat')
  })

  it('gives the forwarding fix under NAT', async () => {
    const { of, exit } = await checks(wsl('nat', { ok: false, stderr: 'refused' }))
    expect(exit).toBe(4)
    expect(of('windows').status).toBe('fail')
    expect(of('windows').fix).toContain('localhostForwarding')
  })

  it('gives the firewall fix under mirrored', async () => {
    const { of } = await checks(wsl('mirrored', { ok: false, stderr: 'refused' }))
    expect(of('windows').fix).toContain('Set-NetFirewallHyperVVMSetting')
  })

  it('gives both fixes when the mode is unknown', async () => {
    const { of } = await checks(wsl('', { ok: false }))
    expect(of('windows').fix).toContain('localhostForwarding')
    expect(of('windows').fix).toContain('Set-NetFirewallHyperVVMSetting')
  })

  it('fails on a status that is not 200', async () => {
    const { of } = await checks(wsl('mirrored', { ok: true, stdout: '404\r\n' }))
    expect(of('windows').status).toBe('fail')
  })

  it('fails on a timeout', async () => {
    const { of } = await checks(wsl('nat', { ok: false, timedOut: true }))
    expect(of('windows').status).toBe('fail')
  })

  it('reaches powershell.exe by path when Windows is off PATH', async () => {
    const seen: string[] = []
    const system = fakeSystem({
      cwd: tempDir(),
      env: { ...WSL, ...stateHome() },
      exec: (file) => {
        seen.push(file)
        return file === POWERSHELL_PATH ? { ok: true, stdout: '200\r\n' } : { missing: true }
      },
    })
    const { of } = await checks(system)
    expect(of('windows').status).toBe('ok')
    expect(seen).toContain(POWERSHELL_PATH)
  })

  it('warns when PowerShell cannot be found, which proves nothing', async () => {
    const system = fakeSystem({ cwd: tempDir(), env: { ...WSL, ...stateHome() } })
    const { of, exit } = await checks(system)
    expect(exit).toBe(0)
    expect(of('windows').status).toBe('warn')
    expect(of('windows').fix).toBeDefined()
  })

  it('probes a throwaway server that really answers, with no Viewer running', async () => {
    let answered = 0
    const system = fakeSystem({
      cwd: tempDir(),
      env: { ...WSL, ...stateHome() },
      exec: (file, args) => {
        if (file !== 'powershell.exe') return { missing: true }
        const url = /http:\/\/localhost:\d+\/health/.exec(args.join(' '))?.[0] as string
        answered = Number(new URL(url).port)
        return { ok: true, stdout: '200\r\n' }
      },
    })
    const { of } = await checks(system)
    expect(answered).toBeGreaterThan(0)
    expect(of('windows').detail).toContain('test port')
  })

  it('probes the running Viewer on its port', async () => {
    farm = new ViewerFarm({ ...WSL, ...stateHome() })
    let command = ''
    const system = farm.system({
      cwd: tempDir(),
      exec: (file, args) => {
        if (file !== 'powershell.exe') return { missing: true }
        command = args.join(' ')
        return { ok: true, stdout: '200\r\n' }
      },
    })
    const { json } = await vuiJson(['viewer', 'start'], { system })
    await checks(system)
    expect(command).toBe(
      `-NoProfile -Command (Invoke-WebRequest -UseBasicParsing http://localhost:${json.port}/health).StatusCode`,
    )
  })

  it('is not checked outside WSL', async () => {
    const system = fakeSystem({ cwd: tempDir(), env: { ...stateHome() } })
    expect((await checks(system)).list.some(({ name }) => name === 'windows')).toBe(false)
  })
})

describe('doctor with VUI_VIEWER_URL', () => {
  it('reads the endpoint health', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200).end('{"ok":true,"version":"1.2.3"}')
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    const env = { VUI_VIEWER_URL: `http://127.0.0.1:${port}/v/x`, ...stateHome() }
    const { of } = await checks(fakeSystem({ cwd: tempDir(), env }))
    server.close()
    expect(of('viewer').status).toBe('ok')
    expect(of('viewer').detail).toContain('1.2.3')
  })

  it('fails an endpoint that does not answer', async () => {
    const env = { VUI_VIEWER_URL: 'http://127.0.0.1:9/v/x', ...stateHome() }
    const { of, exit } = await checks(fakeSystem({ cwd: tempDir(), env }))
    expect(exit).toBe(4)
    expect(of('viewer').fix).toContain('VUI_VIEWER_URL')
  })

  it('fails an invalid one without throwing', async () => {
    const env = { VUI_VIEWER_URL: 'nonsense', ...stateHome() }
    const { of } = await checks(fakeSystem({ cwd: tempDir(), env }))
    expect(of('viewer').status).toBe('fail')
  })
})
