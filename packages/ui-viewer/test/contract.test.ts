import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { CONTRACT_CASES, type ContractTarget, contractCases, runContract } from '../src/contract.js'
import { createViewerHandler } from '../src/handler.js'
import { DocStore } from '../src/store.js'
import { FEED, HASH, READ, tempDir, WRITE } from './helpers.js'

type Wrap = (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  port: () => number,
) => (req: IncomingMessage, res: ServerResponse) => void

interface Host {
  target: ContractTarget
  clients: () => number
  close: () => Promise<void>
}

const open: Host[] = []

/** The real handler on `node:http`, optionally wrapped to break one thing. */
async function host(wrap: Wrap = (handler) => handler, tracked = true): Promise<Host> {
  let port = 0
  const handler = createViewerHandler({
    store: new DocStore(tempDir()),
    readToken: READ,
    writeToken: WRITE,
    port: () => port,
    workspaceHash: HASH,
    feed: FEED,
  })
  const server: Server = createServer(wrap(handler, () => port))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
  const served: Host = {
    clients: () => handler.clients(),
    // Short, so a case that waits for what a broken server never sends fails fast.
    target: { base: `http://localhost:${port}/v/${READ}`, token: WRITE, timeoutMs: 1000 },
    close: async () => {
      handler.close()
      server.closeAllConnections()
      await new Promise((done) => server.close(done))
    },
  }
  if (tracked) open.push(served)
  return served
}

afterEach(async () => {
  for (const served of open.splice(0)) await served.close()
})

async function failures(target: ContractTarget): Promise<string[]> {
  const results = await runContract(target)
  expect(results.map((result) => result.name)).toEqual(contractCases(target).map((c) => c.name))
  return results.filter((result) => !result.ok).map((result) => result.name)
}

describe('the contract suite against the real handler', async () => {
  // Shared by every case, which run in order, so it outlives `afterEach`.
  const served = await host(undefined, false)
  afterAll(() => served.close())
  for (const check of contractCases(served.target)) it(check.name, check.run)
})

describe('runContract', () => {
  it('passes every case on the real handler, with a trailing slash on base', async () => {
    const { target } = await host()
    const results = await runContract({ ...target, base: `${target.base}/` })
    expect(results.every((result) => result.ok)).toBe(true)
    expect(results.length).toBe(CONTRACT_CASES.length)
  })

  it('skips the auth case without a token, and then fails the write it cannot make', async () => {
    const { target } = await host()
    const results = await runContract({ base: target.base })
    const auth = results.find((result) => result.name.startsWith(CONTRACT_CASES[8]))
    expect(auth).toMatchObject({ ok: true, skipped: true })
    expect(auth?.name).toBe(`${CONTRACT_CASES[8]} (skipped: no token)`)
    expect(results.find((result) => result.name === CONTRACT_CASES[3])?.ok).toBe(false)
  })

  it('reports an unreachable server as failures, not a throw', async () => {
    const { target, close } = await host()
    await close()
    open.length = 0
    const results = await runContract({ ...target, timeoutMs: 500 })
    expect(results.every((result) => !result.ok)).toBe(true)
    expect(results[0]?.error).toMatch(/ECONNREFUSED|socket|closed|refused/i)
  })
})

describe('the suite catches a broken server', () => {
  it('fails the write case when POST answers 200', async () => {
    const { target } = await host((handler) => (req, res) => {
      const writeHead = res.writeHead.bind(res) as (status: number, ...rest: unknown[]) => unknown
      ;(res as { writeHead: unknown }).writeHead = (status: number, ...rest: unknown[]) =>
        writeHead(req.method === 'POST' && status === 201 ? 200 : status, ...rest)
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[3]])
  })

  it('fails the stream case when hello never comes', async () => {
    const { target } = await host((handler) => (req, res) => {
      const write = res.write.bind(res) as (chunk: unknown, ...rest: unknown[]) => boolean
      ;(res as { write: unknown }).write = (chunk: unknown, ...rest: unknown[]) =>
        // A comment in its place, so the headers still go out and the stream opens.
        write(String(chunk).startsWith('event: hello') ? ': no hello\n\n' : chunk, ...rest)
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[2]])
  })

  it('fails the auth case when any writer is let in', async () => {
    const { target } = await host((handler) => (req, res) => {
      req.headers.authorization = `Bearer ${WRITE}`
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[8]])
  })

  it('fails the host case when any Host is let in', async () => {
    const { target } = await host((handler, port) => (req, res) => {
      req.headers.host = `localhost:${port()}`
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[11]])
  })

  it('fails the list case when the list is a bare array', async () => {
    const { target } = await host((handler) => (req, res) => {
      if (req.method === 'GET' && req.url?.includes('/api/docs?') === true) {
        const end = res.end.bind(res) as (chunk?: unknown) => ServerResponse
        ;(res as { end: unknown }).end = (chunk?: unknown) =>
          end(typeof chunk === 'string' ? JSON.stringify(JSON.parse(chunk).docs) : chunk)
      }
      handler(req, res)
    })
    expect(await failures(target)).toContain(CONTRACT_CASES[5])
  })

  it('fails the read case when the stored document is not canonical', async () => {
    const { target } = await host((handler) => (req, res) => {
      if (req.headers['x-vui-contract'] === 'read') {
        const end = res.end.bind(res) as (chunk?: unknown) => ServerResponse
        ;(res as { end: unknown }).end = (chunk?: unknown) =>
          end(
            typeof chunk === 'string'
              ? JSON.stringify({ ...JSON.parse(chunk), density: 'x' })
              : chunk,
          )
      }
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[4]])
  })

  it('fails the size case when a large body is accepted', async () => {
    const { target } = await host((handler) => (req, res) => {
      if (req.method === 'POST' && Number(req.headers['content-length']) > 262_144) {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end('{"seq":99,"id":"99-x","url":"x","clients":0}')
        req.resume()
        return
      }
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[9]])
  })

  it('fails, and ends, against a list that ignores after', async () => {
    const { target } = await host((handler) => (req, res) => {
      if (req.url?.includes('/api/docs?') === true)
        req.url = req.url.replace(/after=\d+/, 'after=0')
      handler(req, res)
    })
    const failed = await failures(target)
    expect(failed).toEqual([CONTRACT_CASES[5], CONTRACT_CASES[8], CONTRACT_CASES[9]])
    const results = await runContract(target)
    expect(results.find((r) => r.name === CONTRACT_CASES[8])?.error).toMatch(
      /after is not honoured/,
    )
  })

  it('fails the write case, without crashing, when a doc event is not JSON', async () => {
    const { target } = await host((handler) => (req, res) => {
      const write = res.write.bind(res) as (chunk: unknown, ...rest: unknown[]) => boolean
      ;(res as { write: unknown }).write = (chunk: unknown, ...rest: unknown[]) =>
        write(String(chunk).includes('event: doc') ? 'event: doc\ndata: {nope\n\n' : chunk, ...rest)
      handler(req, res)
    })
    const results = await runContract(target)
    const write = results.find((r) => r.name === CONTRACT_CASES[3])
    expect(write?.ok).toBe(false)
    expect(write?.error).toMatch(/not JSON/)
  })

  it('closes the event stream when the write case is skipped', async () => {
    const { target, clients } = await host()
    const cases = contractCases(target)
    await (cases[2] as { run(): Promise<void> }).run()
    expect(clients()).toBe(1)
    // A host running cases one by one, without the write: the next case closes the stream.
    await (cases[10] as { run(): Promise<void> }).run()
    await expect.poll(clients).toBe(0)
  })

  it('fails the miss case when an unknown route answers 200', async () => {
    const { target } = await host((handler) => (req, res) => {
      if (req.url?.endsWith('/no-such-route') === true) {
        res.writeHead(200).end('ok')
        return
      }
      handler(req, res)
    })
    expect(await failures(target)).toEqual([CONTRACT_CASES[10]])
  })

  it('fails health, feed, standalone and invalid cases when those routes break', async () => {
    const { target } = await host((handler) => (req, res) => {
      const slug = String(req.headers['x-vui-contract'])
      if (['health', 'feed', 'standalone', 'invalid'].includes(slug)) {
        res.writeHead(500).end()
        req.resume()
        return
      }
      handler(req, res)
    })
    expect(await failures(target)).toEqual([
      CONTRACT_CASES[0],
      CONTRACT_CASES[1],
      CONTRACT_CASES[6],
      CONTRACT_CASES[7],
    ])
  })
})
