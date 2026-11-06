import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runViewer } from '../src/main.js'
import { stateDirOf, workspaceHash } from '../src/paths.js'
import type { RunningViewer } from '../src/server.js'
import { freePort, tempDir } from './helpers.js'

let viewer: RunningViewer | undefined

afterEach(async () => {
  await viewer?.close()
  viewer = undefined
  vi.restoreAllMocks()
})

async function deps(warn = vi.fn()) {
  const VUI_PORT = String(await freePort())
  return { cwd: tempDir(), env: { XDG_STATE_HOME: tempDir(), VUI_PORT }, warn }
}

describe('runViewer', () => {
  it('starts on the workspace of its cwd and says where, without the token', async () => {
    const options = await deps()
    viewer = await runViewer([], options)
    const hash = workspaceHash(realpathSync(options.cwd))
    expect(existsSync(join(stateDirOf(hash, options.env), 'viewer.json'))).toBe(true)
    const line = options.warn.mock.calls[0]?.[0]
    expect(line).toContain(`port ${viewer.port}`)
    expect(line).not.toContain(viewer.readToken)
  })

  it('passes --bind', async () => {
    const options = await deps()
    viewer = await runViewer(['--bind', '0.0.0.0'], options)
    expect(viewer.address).toBe('0.0.0.0')
    expect(options.warn.mock.calls[0]?.[0]).toMatch(/warning/)
  })

  it('takes --workspace over its cwd', async () => {
    const options = await deps()
    const workspace = realpathSync(tempDir())
    viewer = await runViewer(['--workspace', workspace], options)
    const dir = stateDirOf(workspaceHash(workspace), options.env)
    expect(existsSync(join(dir, 'viewer.json'))).toBe(true)
  })

  it('refuses a flag it does not know', async () => {
    await expect(runViewer(['--nope'], await deps())).rejects.toThrow()
  })

  it.each(['SIGTERM', 'SIGINT'] as const)('closes on %s', async (signal) => {
    viewer = await runViewer([], await deps())
    process.emit(signal)
    await viewer.closed
  })
})
