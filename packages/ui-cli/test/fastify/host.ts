import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createViewerHandler, DocStore, workspaceHash } from '@vadd/ui-viewer'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'

/**
 * What VADD's server does in `docs/vadd-ui/VADD_INTEGRATION.md` (VD-146), on real Fastify:
 * its own routes, plus the Viewer handler for `/health` and everything under `/v/`.
 */
export interface FastifyHost {
  /** `http://localhost:<port>`, the name the handler's `Host` check accepts. */
  origin: string
  /** What `VUI_VIEWER_URL` holds: `<origin>/v/<readToken>`. */
  base: string
  writeToken: string
  /** The address Fastify bound. */
  address: string
  close(): Promise<void>
}

const ALL_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const

export async function startFastifyHost(): Promise<FastifyHost> {
  const app = Fastify({ logger: false })
  const readToken = randomBytes(16).toString('hex')
  const writeToken = randomBytes(16).toString('hex')
  const dir = mkdtempSync(join(tmpdir(), 'vui-fastify-'))
  const viewer = createViewerHandler({
    store: new DocStore(join(dir, 'docs')),
    readToken,
    writeToken,
    // Read per request: the port is known only once `listen` has run.
    port: () => (app.server.address() as AddressInfo).port,
    workspaceHash: workspaceHash(dir),
  })

  // `onRequest` runs before Fastify parses a body, so the handler reads the raw stream, and
  // `hijack` tells Fastify the handler owns the response from here.
  const mount = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    viewer(request.raw, reply.raw)
  }
  const unreachable = async () => undefined

  app.get('/api/projects', async () => ({ projects: [] }))
  app.route({ method: [...ALL_METHODS], url: '/health', onRequest: mount, handler: unreachable })
  app.route({ method: [...ALL_METHODS], url: '/v/*', onRequest: mount, handler: unreachable })
  // Ends open event streams, which would otherwise hold `close` open.
  app.addHook('onClose', async () => viewer.close())

  await app.listen({ host: '127.0.0.1', port: 0 })
  const { address, port } = app.server.address() as AddressInfo
  const origin = `http://localhost:${port}`
  return {
    origin,
    base: `${origin}/v/${readToken}`,
    writeToken,
    address,
    close: () => app.close(),
  }
}
