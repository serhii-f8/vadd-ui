import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { type AddressInfo, createConnection, createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

// The real `dist/viewer.js` in a real process.

const ENTRY = fileURLToPath(new URL('../../packages/ui-viewer/dist/viewer.js', import.meta.url))

export interface ViewerFile {
  port: number
  readToken: string
  writeToken: string
}

export interface LiveViewer {
  info: ViewerFile
  /** The feed URL, with the read token. */
  base: string
  child: ChildProcess
  state: string
  cwd: string
  stop: () => Promise<void>
}

interface LaunchOptions {
  state?: string
  cwd?: string
  port?: number
}

/** A port the OS calls free now, for a test that restarts a Viewer on one port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

export async function launchViewer(options: LaunchOptions = {}): Promise<LiveViewer> {
  const state = options.state ?? mkdtempSync(join(tmpdir(), 'vui-e2e-state-'))
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), 'vui-e2e-work-'))
  // Windows reads LOCALAPPDATA where the rest read XDG_STATE_HOME (§4.1).
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_STATE_HOME: state, LOCALAPPDATA: state }
  if (options.port === undefined) delete env.VUI_PORT
  else env.VUI_PORT = String(options.port)
  const child = spawn(process.execPath, [ENTRY], {
    cwd,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  await new Promise<void>((resolve, reject) => {
    let log = ''
    child.stderr?.setEncoding('utf8').on('data', (text: string) => {
      log += text
      if (text.includes('listening')) resolve()
    })
    child.once('exit', (code) => reject(new Error(`viewer exited with ${code}: ${log}`)))
  })
  const [hash] = readdirSync(join(state, 'vadd-ui'))
  const info = JSON.parse(
    readFileSync(join(state, 'vadd-ui', hash as string, 'viewer.json'), 'utf8'),
  ) as ViewerFile
  const stop = () =>
    new Promise<void>((resolve) => {
      // Gone already, by an exit or a signal (Windows ends it at once on SIGTERM).
      if (child.exitCode !== null || child.signalCode !== null) resolve()
      child.once('exit', () => resolve())
      child.kill('SIGTERM')
    })
  return {
    info,
    base: `http://localhost:${info.port}/v/${info.readToken}/`,
    child,
    state,
    cwd,
    stop,
  }
}

export interface DropProxy {
  /** The feed URL through the proxy. */
  base: string
  /** Cuts every connection and refuses new ones. */
  down: () => void
  up: () => void
  close: () => Promise<void>
}

/**
 * A browser going offline leaves an open stream alone, so a real cut needs a real socket.
 * The Viewer checks `Host` against its own port (§15.3), so the proxy rewrites it.
 */
export async function dropProxy(viewer: LiveViewer): Promise<DropProxy> {
  const sockets = new Set<Socket>()
  const viewerHost = `Host: localhost:${viewer.info.port}`
  let proxyHost = ''
  let refusing = false
  const server = createServer((client) => {
    if (refusing) {
      client.destroy()
      return
    }
    const upstream = createConnection(viewer.info.port, '127.0.0.1')
    for (const socket of [client, upstream]) {
      sockets.add(socket)
      socket.on('error', () => undefined)
      socket.on('close', () => {
        sockets.delete(socket)
        client.destroy()
        upstream.destroy()
      })
    }
    // Every chunk: a kept-alive connection carries several requests.
    client.on('data', (chunk) => {
      const text = chunk.toString('latin1')
      upstream.write(Buffer.from(text.replace(proxyHost, viewerHost), 'latin1'))
    })
    upstream.pipe(client)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  proxyHost = `Host: localhost:${port}`
  return {
    base: `http://localhost:${port}/v/${viewer.info.readToken}/`,
    down() {
      refusing = true
      for (const socket of sockets) socket.destroy()
    },
    up() {
      refusing = false
    },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
  }
}

export async function postDoc(viewer: LiveViewer, document: object): Promise<string> {
  const reply = await fetch(`${viewer.base}api/docs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${viewer.info.writeToken}` },
    body: JSON.stringify(document),
  })
  if (reply.status !== 201) throw new Error(`post failed: ${reply.status}`)
  return ((await reply.json()) as { id: string }).id
}

/** Everything a page must never do, gathered for one test. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('requestfailed', (item) => problems.push(`failed: ${item.url()}`))
  return problems
}
