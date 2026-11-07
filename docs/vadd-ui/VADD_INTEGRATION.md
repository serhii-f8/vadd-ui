# Wiring vadd-ui into VADD

Spec §4.4 has two halves. The VADD server answers the Viewer HTTP interface (§4.1), so `vui show` with `VUI_VIEWER_URL` posts to it. The VADD dashboard shows VUI documents with `<VuiView>`. VD-004 keeps `/var/www/html/vadd` untouched, so this file is the hand-off: each step names the VADD file it changes. Paths and line numbers are as of VADD `a8b5cc2` (`chore(release): 0.1.1`).

What this repository has already proved, so VADD does not have to:

- `packages/ui-cli/test/fastify/host.ts` is the server half on real Fastify 5. `packages/ui-cli/test/fastify-host.test.ts` runs the contract suite against it, and the real `vui` binary delivers to it through `VUI_VIEWER_URL`.
- `e2e/ui-react.spec.ts` is the dashboard half in Chromium, on React 19 and 18. A hostile dashboard stylesheet does not reach inside a `<VuiView>`, vadd-ui's stylesheet does not reach outside, and the theme follows VADD's `.dark` class with VADD's own tokens.
- An outside npm project installed from the packed tarballs (step 0) ran the contract suite green on Fastify and served the Viewer feed app.

## 0. Get the packages

VADD and vadd-ui share the `@vadd` scope, and the names do not clash: VADD has `@vadd/cli`, `core`, `server` and `web`, and vadd-ui has `@vadd/ui*`.

- After vadd-ui is published (a release step the user runs), add `@vadd/ui-viewer` to `packages/server` and `@vadd/ui-react` to `packages/web` like any other dependency.
- Until then, pack them. In vadd-ui, after `pnpm build`, run `pnpm pack --pack-destination <dir>` in each of `packages/ui-spec`, `ui-render`, `ui`, `ui-viewer` and `ui-react`. `pack` rewrites `workspace:*` to `0.0.0`, so the transitive `@vadd/ui-spec`, `@vadd/ui-render` and `@vadd/ui` need the tarballs too. In VADD's root `pnpm-workspace.yaml`, add:
  ```yaml
  overrides:
    "@vadd/ui-spec": "file:<dir>/vadd-ui-spec-0.0.0.tgz"
    "@vadd/ui-render": "file:<dir>/vadd-ui-render-0.0.0.tgz"
    "@vadd/ui": "file:<dir>/vadd-ui-0.0.0.tgz"
  ```
  Then run `pnpm add file:<dir>/vadd-ui-viewer-0.0.0.tgz` in `packages/server` and `pnpm add file:<dir>/vadd-ui-react-0.0.0.tgz` in `packages/web`.
- `@vadd/ui-react` has `react >=18` and `react-dom >=18` as peers. `packages/web` already has React 19.2.
- Neither package adds a runtime dependency to VADD beyond vadd-ui's own. The server half needs no Fastify plugin.

## 1. Server: mount the Viewer handler

`createViewerHandler` from `@vadd/ui-viewer` is a plain Node listener `(req, res)` that already implements all of §4.1 and §15.3: routes, the `Host` check, the read and write tokens, the 256 KiB and 20 writes/s limits, and SSE with a 15 s heartbeat. VADD gives it a store and tokens and mounts it.

1. **A file for it**, `packages/server/src/http/vui.ts`, exporting `registerVuiRoutes(app: FastifyInstance, opts: { port: number }): VuiAccess`. Build it like `startFastifyHost` in `packages/ui-cli/test/fastify/host.ts`:
   - `const store = new DocStore(join(vaddHome(), 'vui', 'docs'))`. `vaddHome()` in `packages/server/src/paths.ts:11` is `VADD_HOME` or `~/.vadd`, so tests that set `VADD_HOME` stay isolated, as that file asks. The store keeps §4.1's retention, at most 500 documents or 50 MiB.
   - Tokens: see step 2.
   - `createViewerHandler({ store, readToken, writeToken, port: () => opts.port, workspaceHash: workspaceHash(vaddHome()) })`. The `Host` check then accepts `localhost:4319`, `127.0.0.1:4319` and `[::1]:4319`, and nothing else.
   - Mount it for `/health` and `/v/*`, for every method, in a route-level **`onRequest`** hook that calls `reply.hijack()` and then `viewer(request.raw, reply.raw)`; give the route an empty `handler`. It has to be `onRequest`: in the route handler, Fastify's JSON parser has already read the POST body, and every write fails. `fastify-host.test.ts` proves the `onRequest` form works, and moving the call into the handler made the contract suite fail on the write case.
   - `app.addHook('onClose', async () => viewer.close())`, which ends open event streams so `app.close()` returns.
2. **Call it** from `buildApp` in `packages/server/src/http/app.ts:27`, after `registerFsRoutes(app)` on line 35. `buildApp` does not know the port; pass `PORT` from `packages/server/src/index.ts:14` through `AppDeps` as an optional `vuiPort`, and register only when it is set. Route tests that build an app without it are then unchanged.
3. **No clash with the SPA fallback.** `registerStaticWeb` in `packages/server/src/http/static.ts:13` answers unknown GETs outside `/api` with `index.html`. `/health` and `/v/*` are real routes, so the fallback never sees them. VADD has no `/health` route today.
4. **Bind.** `index.ts:60` already listens on `127.0.0.1:4319` only, as §15.3 requires. Keep it that way.

## 2. Server: tokens, VADD's own auth

VADD has no request auth today: anything on loopback can call `/api`. The handler's two tokens are therefore the auth. The **write token** guards `POST /v/<readToken>/api/docs`; the **read token** is the path prefix.

- **Keep them stable across restarts**, unlike the local Viewer, which rotates per start (§15.3). Agents get `VUI_VIEWER_TOKEN` in their environment when they start, and a token that rotated under a long-running agent would turn every `vui show` into exit 4. On first start, generate both with `randomBytes(16).toString('hex')` and write them to `~/.vadd/vui.json` with mode `0600`. Read them back afterwards. Deleting the file rotates them.
- **Give agents the endpoint.** VADD spawns its agents in `packages/server/src/agent/registry.ts:82` with `env: config.setupProfile().env`, which `acp-agent-port.ts:170` merges over `process.env`. Add `VUI_VIEWER_URL=http://localhost:4319/v/<readToken>` and `VUI_VIEWER_TOKEN=<writeToken>` to that `env`. Every `vui show` from a VADD agent then lands in VADD, and the skill (`skills/vadd-ui`) needs no change.
- **For a terminal outside VADD**, print the two `export` lines once at startup, after `index.ts:61`'s "listening" line, or offer them from `vadd` CLI.
- **Never send the write token to the browser.** The dashboard needs only the read prefix (step 4).

## 3. Server: what `vui show` then does

`VUI_VIEWER_URL` is the base, prefix included (VD-126). The CLI:

- posts the canonical document to `<base>/api/docs` with `Authorization: Bearer <VUI_VIEWER_TOKEN>`;
- reads `/health` at the origin for `vui viewer status` and `vui doctor`;
- starts no local Viewer, writes no state, and opens no Orca pane;
- prints `vui: open <url>` whenever the reply says `clients: 0`, where `url` is the handler's feed URL, `http://localhost:4319/v/<readToken>/`.

That URL already serves the Viewer feed app from `@vadd/ui-viewer`, so VADD has a working feed with no dashboard work at all. Steps 4 to 6 bring the documents into the dashboard itself.

## 4. Dashboard: reach the feed

1. **An endpoint for the prefix.** Add `GET /api/vui` in `packages/server/src/http/vui.ts`, returning `{ base: '/v/<readToken>' }`, relative, with no write token. The dashboard is same-origin with the server in the packaged build.
2. **Dev proxy.** `packages/web/vite.config.ts:14` proxies only `/api`. Add `/v`, **with `changeOrigin: true`** (the dashboard never needs `/health`):
   ```ts
   proxy: {
     '/api': 'http://127.0.0.1:4319',
     '/v': { target: 'http://127.0.0.1:4319', changeOrigin: true },
   }
   ```
   Without `changeOrigin`, Vite forwards `Host: 127.0.0.1:5319`, and the handler's §4.1 DNS-rebinding check answers 403. SSE passes through Vite's proxy unchanged.
3. **API helpers** in `packages/web/src/api.ts`, next to `listProjects` on line 265: `vuiBase()` from `/api/vui`; `listVuiDocs(after)` → `GET ${base}/api/docs?after=<seq>&limit=100`, which returns `{docs: [{seq, id, title, createdAt, cwd, branch}]}` in ascending order; `getVuiDoc(id)` → `GET ${base}/api/docs/<id>`, the canonical document. Live updates come from `new EventSource(`${base}/api/events`)`: a `hello` event, then `doc` events carrying one header each, with `id: <seq>`. On error, refill with `after=<lastSeq>`, as the feed app does (VD-120).

## 5. Dashboard: render with `<VuiView>`

```tsx
import { VuiView } from '@vadd/ui-react'

<VuiView doc={doc} onDiagnostics={(d) => { /* optional: log or badge */ }} />
```

- **Props** are exactly §4.4's: `doc` (a canonical `VuiDocument` or the raw relaxed-JSON text), `theme` (`'light' | 'dark' | 'auto'`, default `'auto'`), `onDiagnostics` (called after the first render and each new `doc`).
- **Isolation.** It renders one `<div data-vui-view>` with an open shadow root holding vadd-ui's stylesheet. Tailwind's preflight and VADD's component classes cannot reach inside, and vadd-ui's `.vui-*` rules cannot leak out. Lay it out by wrapping it: the host is `display: block` and takes the width it is given (320 to 1400 px, §8.4). It never uses viewport units, so it sits in any card or scroll area.
- **Where.** A feed page (`/vui`, a new route beside the others in `packages/web/src/main.tsx` and `NAV` in `src/app/nav.ts`) lists headers and renders each document in a `<VuiView>`, newest last. Under a decision or plan, the existing slot is `ArtifactBlock` (`src/cards/ArtifactBlock.tsx`), used in `src/routes/FocusView.tsx:321`; see step 6.
- **Updates.** A new `doc` re-renders in place and keeps folds and sort order (§9.1). Unmounting destroys the render. It is safe under `StrictMode`, which `main.tsx` uses.

### Theme

Nothing to configure:

- **Tokens.** CSS custom properties inherit into a shadow root. VADD's `packages/web/src/index.css` declares the shadcn names that §8.1 reads: `--background`, `--foreground`, `--card`, `--card-foreground`, `--muted`, `--muted-foreground`, `--border`, `--accent`, `--accent-foreground`, `--primary`, `--primary-foreground`, `--destructive`, `--chart-1` to `--chart-5`, `--radius` and `--font-sans`. Its `.dark` block redefines them. So "VADD maps its own theme to the same token names" is already true. A visual uses VADD's palette and Geist, and VADD's `@font-face` applies inside the shadow root. Only `--vui-ok`, `--vui-warn` and `--vui-info` are vadd-ui's own.
- **Scheme.** With `theme="auto"`, `<VuiView>` reads `<html>` the way `ThemeProvider.tsx:47` writes it: `.dark` means dark. The `class=""` that `classList.toggle('dark', false)` leaves means light, even on a dark OS. With no class at all, it follows the OS. It watches the class and the OS setting and switches with no re-render (§8.2).
- Pass `theme` only to pin a visual against the page. Host tokens still apply, so pinning `dark` on a light page gives dark status colors on VADD's light cards.

## 6. Events: one object in chat and dashboard

§4.4: "VADD's typed agent events (decisions, plans, evidence) can carry a VUI document as their payload". The smallest change that keeps VADD's discriminated unions exhaustive:

1. **A card kind.** In `packages/core/src/schemas/card.ts`, add `const VuiCard = z.object({ ...base, kind: z.literal('vui'), doc: z.record(z.unknown()) })`, with the `base` fields (`id`, `title`, `role`, line 18) every card shares, and add it to the union on line 69. `doc` stays opaque to zod.
2. **Validate on the server**, where an emission is ingested (`WorkflowRunner.ingest`, wired in `packages/server/src/index.ts`). Run `validate` from `@vadd/ui-spec` (add it to `packages/server` directly, as in step 0: pnpm does not expose a transitive dependency), and store the canonical `document` it returns. Reject on `error` diagnostics, as the Viewer's POST does with 422. The render is then the same in chat (Orca, via `vui show`) and in the dashboard, because both render the same canonical object.
3. **Render it** in `src/cards/ArtifactBlock.tsx`: a `case 'vui': return <VuiView key={card.id} doc={card.doc as VuiDocument} />` beside `case 'diagram'` on line 16. The `never` check there then compiles again.
4. **Optionally post it to the feed too**: after ingesting, `store.add(document)` plus the handler's broadcast, by POSTing to the handler in-process, so the dashboard feed holds every visual an objective produced.

`AgentEvent` in `packages/core/src/schemas/agent-event.ts` (`decision_needed` line 53, `plan` line 78, `evidence` line 103) can then carry cards, or an optional `vui` field with the same validation, if a decision needs a visual without an artifact.

## 7. Test it in VADD

The contract suite is exported for exactly this, and does not depend on a test runner (VD-144):

```ts
// packages/server/test/vui-contract.test.ts
import { contractCases } from '@vadd/ui-viewer/contract'
import { describe, it, beforeAll, afterAll } from 'vitest'

describe('VADD implements the Viewer HTTP interface', async () => {
  // buildApp with a temp VADD_HOME and vuiPort, then app.listen({ host: '127.0.0.1', port: 0 })
  const { base, writeToken } = await startTestServer()
  for (const check of contractCases({ base, token: writeToken })) it(check.name, check.run)
})
```

- `base` must use the host name `localhost` or `127.0.0.1` with the listening port, or the `Host` case is (rightly) refused. With `port: 0`, read the port after `listen` and give the handler `port: () => app.server.address().port`.
- The cases run in order and store one test document per run (the refused writes store nothing), so point it at a test instance, never at `~/.vadd`.
- `runContract(target)` returns `{name, ok, error?}[]` without throwing, for a script or a health check.
- End to end: start VADD, export the two variables from step 2, then `echo "{title: 'Hello VADD', body: ['It works']}" | vui show`. Expect `vui: shown "Hello VADD" (#1) in viewer`, then `vui: open http://localhost:4319/v/<readToken>/` while no page is connected, and the document in the dashboard feed.

## 8. What does not change

- The local Viewer stays the default host. VADD becomes the host only where `VUI_VIEWER_URL` is set, such as VADD's own agents.
- Orca chat (`ORCA_CHAT_SCRATCH_DIR`) still wins over both (§4.0). The CLI also mirrors to `VUI_VIEWER_URL` when it is set (VD-123), so VADD's feed stays complete.
- vadd-ui needs no change for any step above.

## 9. Checklist

- [ ] Packages installed (step 0); `pnpm -r build` in VADD passes.
- [ ] `vui.ts` mounted with `onRequest` and `hijack`; `~/.vadd/vui.json` holds stable tokens with mode `0600`.
- [ ] Agents get `VUI_VIEWER_URL` and `VUI_VIEWER_TOKEN`.
- [ ] `/api/vui` returns the read prefix only; Vite proxies `/v` with `changeOrigin`.
- [ ] `<VuiView>` renders in the feed page and in `ArtifactBlock`; `vui` cards validate on ingest.
- [ ] The contract suite passes in VADD's Vitest run; the end-to-end `vui show` lands in the dashboard.
