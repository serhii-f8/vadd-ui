import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractCases, runContract } from '@vadd/ui-viewer/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type FastifyHost, startFastifyHost } from './fastify/host.js'

// VD-004 and VD-146: what VADD's server will do, on real Fastify, against the real `vui`.

const root = fileURLToPath(new URL('../../..', import.meta.url))
const BIN = join(root, 'packages/ui-cli/dist/bin.js')
const DOC = "{title: 'Shown through Fastify', body: [{type: 'callout', text: 'hello'}]}"

interface Result {
  exit: number
  stdout: string
  stderr: string
}

function vui(argv: string[], env: Record<string, string>, stdin?: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const { ORCA_CHAT_SCRATCH_DIR: _, ...inherited } = process.env
    const child = spawn(process.execPath, [BIN, ...argv], {
      cwd: tmpdir(),
      // No `orca` on PATH matters only to the local Viewer; a custom endpoint opens no pane.
      env: { ...inherited, ...env },
    })
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
    child.on('close', (exit) => resolve({ exit: exit ?? -1, stdout, stderr }))
  })
}

function get(url: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    request(url, { agent: false }, (incoming) => {
      let text = ''
      incoming.setEncoding('utf8').on('data', (chunk: string) => {
        text += chunk
      })
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, text }))
    })
      .on('error', reject)
      .end()
  })
}

/** Resolves with the stream's text once it holds `needle`. */
function waitForEvent(
  url: string,
  needle: string,
): { ready: Promise<void>; seen: Promise<string> } {
  let opened: () => void = () => undefined
  const ready = new Promise<void>((done) => {
    opened = done
  })
  const seen = new Promise<string>((resolve, reject) => {
    const outgoing = request(url, { agent: false }, (incoming) => {
      let text = ''
      incoming.setEncoding('utf8').on('data', (chunk: string) => {
        text += chunk
        if (text.includes('event: hello')) opened()
        if (text.includes(needle)) {
          outgoing.destroy()
          resolve(text)
        }
      })
    })
    outgoing.on('error', () => undefined)
    outgoing.setTimeout(10_000, () => {
      outgoing.destroy()
      reject(new Error(`no ${needle}`))
    })
    outgoing.end()
  })
  return { ready, seen }
}

let host: FastifyHost

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run pnpm build`)
  host = await startFastifyHost()
})

afterAll(() => host.close())

describe('a Fastify host on 127.0.0.1', () => {
  it('listens on loopback only', () => {
    expect(host.origin).toMatch(/^http:\/\/localhost:\d+$/)
    expect(host.address).toBe('127.0.0.1')
  })

  it('still answers its own routes beside the mount', async () => {
    const reply = await get(`${host.origin}/api/projects`)
    expect(reply).toEqual({ status: 200, text: '{"projects":[]}' })
  })

  it('passes the whole contract suite', async () => {
    const results = await runContract({ base: host.base, token: host.writeToken })
    expect(results.filter((result) => !result.ok)).toEqual([])
    expect(results.length).toBe(contractCases({ base: host.base, token: 'x' }).length)
  })
})

describe('vui show through VUI_VIEWER_URL', () => {
  it('delivers a document, prints the open line and reaches an open stream', async () => {
    const before = JSON.parse((await get(`${host.base}/api/docs?limit=500`)).text).docs.length
    const env = { VUI_VIEWER_URL: host.base, VUI_VIEWER_TOKEN: host.writeToken }
    const { exit, stdout, stderr } = await vui(['show'], env, DOC)
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: '' })
    const [shown, open] = stdout.trimEnd().split('\n')
    expect(shown).toMatch(/^vui: shown "Shown through Fastify" \(#\d+\) in viewer$/)
    // VD-126: no client connected, so the URL prints, and it is the host's feed URL.
    expect(open).toBe(`vui: open ${host.base}/`)
    const docs = JSON.parse((await get(`${host.base}/api/docs?limit=500`)).text).docs
    expect(docs.length).toBe(before + 1)
    expect(docs.at(-1).title).toBe('Shown through Fastify')

    const stream = waitForEvent(`${host.base}/api/events`, '"title":"Second show"')
    await stream.ready
    const second = await vui(['show', '--json'], env, "{title: 'Second show', body: ['x']}")
    expect(second.exit).toBe(0)
    expect(JSON.parse(second.stdout)).toMatchObject({ host: 'viewer', clients: 1, pane: 'none' })
    expect(await stream.seen).toContain('event: doc')
  })

  it('exits 4 when the host refuses the token', async () => {
    const env = { VUI_VIEWER_URL: host.base, VUI_VIEWER_TOKEN: `${host.writeToken}x` }
    const { exit, stdout } = await vui(['show'], env, DOC)
    expect(exit).toBe(4)
    expect(stdout).not.toContain(host.writeToken)
  })

  it('answers vui viewer status through the endpoint', async () => {
    const env = { VUI_VIEWER_URL: host.base, VUI_VIEWER_TOKEN: host.writeToken }
    const status = await vui(['viewer', 'status'], env)
    expect(status.exit).toBe(0)
    expect(status.stdout).toMatch(/^vui: VUI_VIEWER_URL answers \(version \d+\.\d+\.\d+\)/)
  })
})

describe('the published export', () => {
  it('resolves @vadd/ui-viewer/contract from the built package, as an outside project would', () => {
    const script =
      "import('@vadd/ui-viewer/contract').then((m) => console.log(typeof m.contractCases, typeof m.runContract, m.CONTRACT_CASES.length))"
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: join(root, 'packages/ui-cli'),
      encoding: 'utf8',
    })
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe('function function 12')
  })
})
