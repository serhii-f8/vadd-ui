import { type ChildProcess, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { stateDirOf, workspaceHash } from '../src/paths.js'
import { freePort, request, tempDir } from './helpers.js'

// The real `dist/viewer.js`, which `pnpm gate` builds first, in a real process.

const ENTRY = fileURLToPath(new URL('../dist/viewer.js', import.meta.url))

const children = new Set<ChildProcess>()

afterEach(() => {
  for (const child of children) child.kill('SIGKILL')
  children.clear()
})

function launch(argv: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const child = spawn(process.execPath, [ENTRY, ...argv], { cwd, env: { ...process.env, ...env } })
  children.add(child)
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    stderr += text
  })
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve))
  const ready = new Promise<void>((resolve) => {
    child.stderr.on('data', () => {
      if (stderr.includes('listening')) resolve()
    })
  })
  return { child, exited, ready, stderr: () => stderr }
}

describe('dist/viewer.js', () => {
  it('serves, warns on 0.0.0.0, and exits 0 on SIGTERM', async () => {
    const cwd = tempDir()
    const port = await freePort()
    const env = { XDG_STATE_HOME: tempDir(), VUI_PORT: String(port) }
    const viewer = launch(['--bind', '0.0.0.0'], env, cwd)
    await viewer.ready
    expect(viewer.stderr()).toMatch(/warning.*0\.0\.0\.0/)
    const health = await request(port, '/health', { headers: { host: `localhost:${port}` } })
    expect(health.json().ok).toBe(true)
    const dir = stateDirOf(workspaceHash(cwd), env)
    expect(JSON.parse(readFileSync(join(dir, 'viewer.json'), 'utf8')).pid).toBe(viewer.child.pid)
    viewer.child.kill('SIGTERM')
    expect(await viewer.exited).toBe(0)
  })

  it('exits 1 with one line when it cannot start', async () => {
    const viewer = launch(['--bind', '10.0.0.1'], { XDG_STATE_HOME: tempDir() }, tempDir())
    expect(await viewer.exited).toBe(1)
    expect(viewer.stderr().trim().split('\n')).toHaveLength(1)
  })
})
