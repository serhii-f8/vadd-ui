import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExecResult, System } from '../src/system.js'
import { fakeSystem, tempDir, ViewerFarm, vui, vuiJson } from './helpers.js'

let farm: ViewerFarm | undefined

afterEach(async () => {
  await farm?.stopAll()
  farm = undefined
})

function setup(exec?: (file: string) => Partial<ExecResult>): System {
  farm = new ViewerFarm({ XDG_STATE_HOME: tempDir() })
  return farm.system({ cwd: tempDir(), ...(exec ? { exec } : {}) })
}

const viewer = (action: string[], system: System) => vui(['viewer', ...action], { system })
const viewerJson = (action: string[], system: System) => vuiJson(['viewer', ...action], { system })

describe('vui viewer', () => {
  it('needs an action it knows', async () => {
    const system = setup()
    expect((await viewer([], system)).exit).toBe(2)
    expect((await viewer(['restart'], system)).exit).toBe(2)
  })

  it('takes --bind only on start', async () => {
    expect((await viewer(['stop', '--bind', '0.0.0.0'], setup())).exit).toBe(2)
  })

  it('start starts, prints the URL, then reports the running one', async () => {
    const system = setup()
    const first = await viewer(['start'], system)
    expect(first.exit).toBe(0)
    expect(first.stdout).toMatch(/^vui: viewer started on port \d+\nvui: open http:\/\/localhost/)
    expect((await viewer(['start'], system)).stdout).toContain('viewer running on port')
    expect(farm?.spawns).toBe(1)
  })

  it('start passes --bind on', async () => {
    const seen: (readonly string[])[] = []
    const system = setup()
    const spy: System = {
      ...system,
      spawnViewer: (argv, fd, cwd) => {
        seen.push(argv)
        return system.spawnViewer(argv, fd, cwd)
      },
    }
    await viewer(['start', '--bind', '0.0.0.0'], spy)
    expect(seen[0]).toContain('0.0.0.0')
  })

  it('warns about 0.0.0.0 on the start it asked for (§15.3)', async () => {
    const { stderr } = await viewer(['start', '--bind', '0.0.0.0'], setup())
    expect(stderr).toMatch(/^vui: warning: .*0\.0\.0\.0.*other machines\n$/)
  })

  it('carries that warning in JSON', async () => {
    const { json } = await viewerJson(['start', '--bind', '0.0.0.0'], setup())
    expect(json.warnings).toHaveLength(1)
  })

  it('says --bind did nothing on a running Viewer', async () => {
    const system = setup()
    await viewer(['start'], system)
    const { stderr, exit } = await viewer(['start', '--bind', '0.0.0.0'], system)
    expect(exit).toBe(0)
    expect(stderr).toContain('--bind was ignored')
  })

  it('status follows the Viewer', async () => {
    const system = setup()
    expect((await viewer(['status'], system)).stdout).toBe('vui: no viewer running\n')
    expect((await viewerJson(['status'], system)).json.running).toBe(false)
    const { json } = await viewerJson(['start'], system)
    const status = await viewerJson(['status'], system)
    expect(status.exit).toBe(0)
    expect(status.json).toMatchObject({ running: true, port: json.port, url: json.url })
    expect((await viewer(['status'], system)).stdout).toMatch(/running on port \d+ \(pid \d+\)\n$/)
  })

  it('stop stops, and stopping nothing is fine', async () => {
    const system = setup()
    await viewer(['start'], system)
    const stopped = await viewer(['stop'], system)
    expect(stopped.exit).toBe(0)
    expect(stopped.stdout).toMatch(/^vui: viewer stopped \(pid \d+\)\n$/)
    const again = await viewer(['stop'], system)
    expect(again.exit).toBe(0)
    expect(again.stdout).toBe('vui: no viewer running\n')
    expect((await viewerJson(['stop'], system)).json).toMatchObject({ stopped: false })
  })

  it('url prints only the URL', async () => {
    const system = setup()
    const { json } = await viewerJson(['start'], system)
    expect((await viewer(['url'], system)).stdout).toBe(`${json.url}\n`)
  })

  it('url exits 4 with nothing running', async () => {
    const { exit, stderr } = await viewer(['url'], setup())
    expect(exit).toBe(4)
    expect(stderr).toContain('vui viewer start')
  })

  it('open starts a Viewer and opens the browser', async () => {
    const opened: string[] = []
    const system = setup((file) => {
      opened.push(file)
      return { ok: true }
    })
    const { exit, json } = await viewerJson(['open'], system)
    expect(exit).toBe(0)
    expect(json).toMatchObject({ opened: true, opener: 'xdg-open' })
    expect(opened).toEqual(['xdg-open'])
    expect((await viewer(['open'], system)).stdout).toMatch(/^vui: opened http/)
  })

  it('open falls back to printing the URL', async () => {
    const { exit, stdout } = await viewer(['open'], setup())
    expect(exit).toBe(0)
    expect(stdout).toMatch(/^vui: open http:\/\/localhost/)
  })
})

describe('with VUI_VIEWER_URL', () => {
  async function health(status: number) {
    const server = createServer((_req, res) => {
      res.writeHead(status).end('{"ok":true,"version":"9.9.9"}')
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    return server
  }

  const custom = (url: string) =>
    fakeSystem({ env: { VUI_VIEWER_URL: url }, cwd: tempDir(), exec: () => ({ ok: true }) })

  it.each(['start', 'stop'])('refuses %s', async (action) => {
    expect((await viewer([action], custom('http://x/v/a'))).exit).toBe(2)
  })

  it('url gives the endpoint', async () => {
    expect((await viewer(['url'], custom('http://x/v/a'))).stdout).toBe('http://x/v/a/\n')
  })

  it('open opens the endpoint', async () => {
    expect((await viewerJson(['open'], custom('http://x/v/a'))).json.opened).toBe(true)
  })

  it('status reads /health at the origin', async () => {
    const server = await health(200)
    const { port } = server.address() as AddressInfo
    const system = custom(`http://127.0.0.1:${port}/v/a`)
    expect((await viewerJson(['status'], system)).json).toMatchObject({
      running: true,
      version: '9.9.9',
    })
    server.close()
  })

  it('status reports a server that does not answer', async () => {
    const { json, exit } = await viewerJson(['status'], custom('http://127.0.0.1:9/v/a'))
    expect(exit).toBe(0)
    expect(json.running).toBe(false)
  })
})
