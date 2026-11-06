import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandLine, realSystem, viewerEntry } from '../src/system.js'
import { tempDir, tempFile } from './helpers.js'

const NODE = process.execPath

describe('realSystem', () => {
  it('runs a command and gives back its output', async () => {
    const result = await realSystem.exec(NODE, ['-e', 'console.log("out");console.error("err")'])
    expect(result).toMatchObject({ ok: true, code: 0, missing: false, timedOut: false })
    expect(result.stdout).toBe('out\n')
    expect(result.stderr).toBe('err\n')
  })

  it('reports a failure by its code', async () => {
    const result = await realSystem.exec(NODE, ['-e', 'process.exit(3)'])
    expect(result).toMatchObject({ ok: false, code: 3, missing: false })
  })

  it('reports a missing executable', async () => {
    const result = await realSystem.exec(join(tempDir(), 'nope'), [])
    expect(result).toMatchObject({ ok: false, missing: true })
  })

  it('gives up on a command that never ends', async () => {
    const hang = ['-e', 'setInterval(() => {}, 1000)']
    const result = await realSystem.exec(NODE, hang, { timeoutMs: 100 })
    expect(result).toMatchObject({ ok: false, timedOut: true })
  })

  it('kills a command that ignores SIGTERM, so it cannot hold the CLI open', async () => {
    const stubborn = `process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)`
    const { stdout, timedOut } = await realSystem.exec(NODE, ['-e', stubborn], { timeoutMs: 400 })
    expect(timedOut).toBe(true)
    await new Promise((done) => setTimeout(done, 100))
    expect(() => process.kill(Number(stdout), 0)).toThrow()
  })

  it('spawns a process with its output in the given file', async () => {
    const log = join(tempDir(), 'log')
    const fd = openSync(log, 'a')
    const child = realSystem.spawnViewer(['-e', 'console.error("started")'], fd, tempDir())
    closeSync(fd)
    await child.exited
    expect(readFileSync(log, 'utf8')).toBe('started\n')
  })

  it('kills what it spawned', async () => {
    const fd = openSync(join(tempDir(), 'log'), 'a')
    const hang = ['-e', 'setInterval(() => {}, 1000)']
    const child = realSystem.spawnViewer(hang, fd, tempDir())
    closeSync(fd)
    child.kill()
    await child.exited
    expect(child.pid).toBeGreaterThan(0)
  })

  it('signals a process', async () => {
    const fd = openSync(join(tempDir(), 'log'), 'a')
    const hang = ['-e', 'setInterval(() => {}, 1000)']
    const child = realSystem.spawnViewer(hang, fd, tempDir())
    closeSync(fd)
    realSystem.kill(child.pid, 'SIGKILL')
    await child.exited
  })

  it('reads files, and nothing for a missing one', () => {
    const path = tempFile('a.txt', 'text')
    expect(realSystem.exists(path)).toBe(true)
    expect(realSystem.read(path)).toBe('text')
    expect(realSystem.exists(`${path}.no`)).toBe(false)
    expect(realSystem.read(`${path}.no`)).toBeUndefined()
  })

  it('sleeps', async () => {
    await expect(realSystem.sleep(1)).resolves.toBeUndefined()
  })
})

describe('viewerEntry', () => {
  it('is the built Viewer, beside its feed app', () => {
    expect(viewerEntry()).toMatch(/ui-viewer[/\\]dist[/\\]viewer\.js$/)
    expect(existsSync(viewerEntry().replace(/viewer\.js$/, 'app.js'))).toBe(true)
  })
})

describe('commandLine', () => {
  it('leaves an executable alone', () => {
    expect(commandLine('orca', ['a'], 'linux')).toEqual(['orca', ['a']])
    expect(commandLine('orca.exe', ['a'], 'win32')).toEqual(['orca.exe', ['a']])
  })

  it('runs a batch file on Windows through cmd', () => {
    expect(commandLine('C:\\o\\orca.cmd', ['a'], 'win32')).toEqual([
      'cmd.exe',
      ['/d', '/c', 'C:\\o\\orca.cmd', 'a'],
    ])
  })
})
