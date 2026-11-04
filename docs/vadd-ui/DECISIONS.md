# vadd-ui decisions

Append-only. Each entry: id, date, task, context, decision, alternatives, rationale, spec sections affected. Departures from the spec are marked DEVIATION. Workers append; the coordinator keeps ids unique at merge.

## VD-001 — Spec moved to the path the bootstrap names
- Date: 2026-11-04 · Task: bootstrap
- Context: the bootstrap prompt names `docs/specs/vadd-ui-technical-spec.md`; the file was at `docs/vadd-ui — Technical Specification.md`, untracked.
- Decision: move it, bytes unchanged. SHA-256 before and after: `248ad85a8218c101c90e5642ab20608672f4f0e388406b75b4c6d219fa35664f`.
- Alternatives: rewrite every reference to the old name; keep two copies.
- Rationale: one path, no spaces or em dash for tooling, and the content is not edited.
- Spec sections: none.

## VD-002 — `main` is the integration branch
- Date: 2026-11-04 · Task: bootstrap
- Context: the repo had one commit on `master` and no remote; the bootstrap requires `main`.
- Decision: rename `master` to `main` and set Orca's repo base ref to `main`.
- Alternatives: use `master` throughout.
- Rationale: matches the bootstrap and the VADD repo; costs nothing with no remote.
- Spec sections: none.

## VD-003 — vadd-ui is a standalone pnpm monorepo — DEVIATION
- Date: 2026-11-04 · Task: bootstrap
- Context: the spec (§3) and the bootstrap place the packages inside the existing VADD monorepo. This repository was empty. The real monorepo is a separate repository at `/var/www/html/vadd` (`serhii-f8/vadd`, `packages/{cli,core,server,web}`). The bootstrap also forbids touching paths outside this repository.
- Decision: build here as a standalone pnpm monorepo. Package names, layout and tooling match VADD, so the packages can move there later with little change.
- Alternatives: build inside `/var/www/html/vadd`, which is not the registered Orca repo, has a public remote and would break the outside-the-repo rule.
- Rationale: this is the repo the user registered in Orca and put the spec in. The move later is mechanical; the reverse would not be.
- Spec sections: §3, §4.4.

## VD-004 — VADD server wiring delivered as a contract, not a change to VADD — DEVIATION
- Date: 2026-11-04 · Task: bootstrap
- Context: §4.4 says the VADD Fastify server implements the Viewer HTTP interface, and the dashboard uses `@vadd/ui-react`. That code lives in the other repository (VD-003).
- Decision: task 18 ships `@vadd/ui-react`, a mountable Viewer request handler, an exported HTTP contract test suite, a Fastify test server that passes it, and `docs/vadd-ui/VADD_INTEGRATION.md`. Editing `/var/www/html/vadd` stays out of scope until the user asks.
- Alternatives: edit the VADD repo from a worker; drop §4.4.
- Rationale: proves the interface works against Fastify without touching a repository outside this project.
- Spec sections: §4.4.

## VD-005 — Tooling mirrors VADD
- Date: 2026-11-04 · Task: bootstrap
- Context: the corepack `pnpm` shim crashes on this machine: with no `packageManager` field it picks pnpm 12.4.2 and fails with `Cannot find module …/pnpm/12.4.2/bin/pnpm.cjs`.
- Decision: pin `"packageManager": "pnpm@11.9.0"` in the root `package.json` (the version VADD records), which makes `pnpm` work in this repo with no user action. Use Biome, Vitest, TypeScript `tsc -b`, esbuild, Conventional Commits, Apache-2.0, as VADD does. Development needs Node ≥ 22; shipped Node code targets Node 20 (§17.4).
- Alternatives: pnpm 10; fix corepack globally.
- Rationale: moving the packages later stays cheap; repo-local pin avoids changing the user's machine.
- Spec sections: §16 (Vitest, Playwright, as written).

## VD-006 — Feed app script served as a separate route — DEVIATION
- Date: 2026-11-04 · Task: bootstrap
- Context: §4.1 says `GET /` is a single HTML file with bundled JS and CSS. §15.3 fixes a CSP of `default-src 'self'; …` with no `script-src 'unsafe-inline'`, which blocks an inline script. `GET /docs/<id>.html` is a visual file with an inline script (§10.1), which that CSP also blocks.
- Decision: keep the §15.3 CSP for the feed exactly as written. Add `GET /app.js` under the token prefix for the bundled script. Serve `/docs/<id>.html` with its own CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'`.
- Alternatives: add a nonce or hash to the CSP, which changes the §15.3 string.
- Rationale: §15.3 is the security control, and "single file" is a packaging detail.
- Spec sections: §4.1, §15.3.

## VD-007 — Theme selection works in shadow roots and in both directions
- Date: 2026-11-04 · Task: bootstrap
- Context: §8.1 applies dark fallbacks under `:root.dark .vui-root`, and otherwise through `prefers-color-scheme` when no `.dark` class exists. Two defects follow. A selector in a shadow stylesheet cannot match `:root`, and the Viewer and `ui-react` use shadow roots. And a manual switch to light on a dark OS is impossible, because the absence of `.dark` means "follow the OS".
- Decision: keep both §8.1 selectors and add `.vui-root[data-vui-theme="dark"|"light"]`, which wins over both. Viewer and `ui-react` set this attribute on the root element in each shadow root.
- Alternatives: `:host-context()`, which Firefox and Safari do not support (§17.4).
- Rationale: additive, keeps Orca behavior unchanged, works in all supported engines.
- Spec sections: §8.1, §4.1 feed app, §4.4.

## VD-008 — Render watchdog is cooperative
- Date: 2026-11-04 · Task: bootstrap
- Context: §15.1 stops a component that exceeds 200 ms. §9.3 says rendering is synchronous and deterministic, with no `Date.now()`. Synchronous JavaScript cannot be preempted, and a time limit is not deterministic.
- Decision: components check `performance.now()` at loop checkpoints through a helper. On expiry the component aborts and shows an error card. This is the one permitted clock, and the determinism guarantee applies to renders that stay inside the budget.
- Alternatives: render in a worker, which Orca's CSP blocks (`worker-src`); drop the watchdog.
- Rationale: the only form that works under the CSP, and §13.4 limits already keep normal documents far from the budget.
- Spec sections: §9.3, §15.1.

## VD-009 — Orca contract source and module location
- Date: 2026-11-04 · Task: bootstrap
- Context: §17.3 places `host/orca.ts` without naming a package, and cites "section 4.1" for the Orca contract, which is §4.2. The Orca shell harness needs Orca's exact constants.
- Decision: the module is `packages/ui-spec/src/host/orca.ts`, shared by CLI and tests. Read the constants from `stablyai/orca` on GitHub (reachable on 2026-11-04), checking against the installed Orca 1.4.248 under `C:\Users\drser\AppData\Local\Programs\orca\resources` (`native-chat-visuals/skills/orca-chat-visuals/SKILL.md`, `app.asar`). Read the §17.3 reference as §4.2.
- Alternatives: place it in `ui-cli`, which the test harness would then have to import from.
- Rationale: `ui-spec` is the shared pure package.
- Spec sections: §4.2, §17.3.

## VD-010 — Local gate is binding; CI files are authored but unrun
- Date: 2026-11-04 · Task: bootstrap
- Context: §16 expects CI on every commit. This repository has no remote, and pushing is forbidden without the user's say.
- Decision: `pnpm gate` is the binding check for every task. GitHub workflows are written and validated for syntax only, and start running when the user adds a remote.
- Alternatives: create a GitHub repository, which needs the user's approval.
- Rationale: keeps every gate real today without publishing anything.
- Spec sections: §16, §16.1.

## VD-011 — Orca executable resolution — DEVIATION
- Date: 2026-11-04 · Task: bootstrap
- Context: §4.1 and §17.3 run `orca` if an executable is on `PATH`. Orca's own guide warns that on Linux outside Orca's terminals, bare `orca` normally resolves to the GNOME Orca screen reader and starts speech. Orca's managed WSL shells export `ORCA_CLI_COMMAND` (`orca-ide` here).
- Decision: `vui` resolves `ORCA_CLI_COMMAND`, then `orca-ide`, and uses bare `orca` only inside an Orca-managed terminal (any `ORCA_*` session variable set). Otherwise it treats Orca as absent and prints the URL.
- Alternatives: run bare `orca` as written.
- Rationale: `vui show` must not start a screen reader on a user's machine, and the fallback (printing the URL) already exists.
- Spec sections: §4.1, §17.3, §11.1 `doctor`.

## VD-012 — POST size limit applies to the canonical document
- Date: 2026-11-04 · Task: bootstrap
- Context: §13.4 limits input to 256 KiB and §15.3 limits the POST body to 256 KiB, but the canonical form can be larger than its relaxed input.
- Decision: keep both limits as written. A document whose canonical form exceeds the POST limit exits 3 with a message saying so.
- Alternatives: raise the POST limit, which changes a §15.3 control.
- Rationale: the simplest reading; the case is rare, because object rows shrink under normalization.
- Spec sections: §13.4, §15.3, §11.4.
