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

## VD-013 — Line endings pinned to LF
- Date: 2026-11-04 · Task: bootstrap
- Context: the user's global `core.autocrlf=true` checked a test worktree out with CRLF. It changed the spec's bytes in that worktree and would make Biome reject the tree.
- Decision: add `.gitattributes` with `* text=auto eol=lf`, the same fix VADD uses.
- Alternatives: change the user's global git config.
- Rationale: repo-local, and it works for every worktree.
- Spec sections: none.

## VD-014 — Workers start terminal-first
- Date: 2026-11-04 · Task: bootstrap
- Context: `orchestration worker-start --worktree new-top-level --agent claude`, the command the bootstrap prescribes, failed twice with `agent_readiness: timeout`, including with a 180 s budget. Both terminals showed the launch line echoed with no shell prompt in front of it, then an empty prompt, so `claude` never ran. The same line sent to an already-ready shell started Claude in about 12 s. The cause is unconfirmed. `~/.bashrc` runs `sudo service docker start` on every shell start, which is a candidate, but it is NOPASSWD, so it is not a password prompt. The file is outside this repo and stays unchanged.
- Decision: create the worktree, create a terminal, wait for the shell prompt, launch Claude with Orca's own flags, wait for `tui-idle`, then attach with `worker-start --terminal`. The exact commands are in `CLAUDE.md`. `--spec-file` takes a `wslpath -w` path, because the CLI runs on Windows and the bridge rejects stdin.
- Alternatives: inline `--spec`, which depends on PowerShell quoting of a long multi-line brief; fallback mode for every task, which loses the fresh context per task.
- Rationale: a documented Orca path, proven end to end by a smoke worker.
- Spec sections: none.

## VD-015 — Permissions in `.claude/settings.json` are a backstop
- Date: 2026-11-04 · Task: bootstrap
- Context: the bootstrap asks for `defaultMode: acceptEdits`. Orca launches Claude with `--dangerously-skip-permissions` from the user's own setting, so a worker runs in bypass mode and the allow list has no effect. Rules cannot express "anything outside the repo", and a shell redirect is not an `Edit`.
- Decision: keep the settings as requested. Deny rules cover pushing, publishing, destructive `rm`, the spec, the VADD repo and sensitive paths by name. Keep the bypass launch, since it is the user's setting and matches unattended work.
- Alternatives: launch workers without bypass, which would stop on prompts.
- Rationale: the `git push` deny and the absence of a remote both guard the main risk. The spec's hash is checked at integration.
- Spec sections: none.

## VD-016 — "No runtime dependency" allows §3 workspace edges
- Date: 2026-11-04 · Task: 01
- Context: the task says a script fails on any runtime dependency in `ui-spec`, `ui-render` or `ui`, but §3 has `ui-render` depending on `ui-spec` and `ui` on both.
- Decision: `scripts/check-runtime-deps.mjs` allows exactly the §3 `workspace:*` edges in `dependencies` and fails on anything else, in `dependencies`, `peerDependencies`, `optionalDependencies` or `bundleDependencies`. It also holds every package's `@vadd/*` dependencies equal to §3.
- Alternatives: move workspace edges to `devDependencies`, which makes published `ui-render` unable to resolve `ui-spec`.
- Rationale: the rule protects against third-party code; §3 is the source of truth for the graph.
- Spec sections: §3.

## VD-017 — Banned-API lint runs on esbuild output and covers every browser-reaching package
- Date: 2026-11-04 · Task: 01
- Context: §15.1 needs a lint ban. Biome has no rule for most of the list, and a regex over raw source cannot separate comments from code. TypeScript 7 has no JS compiler API to walk an AST with.
- Decision: `scripts/check-forbidden-apis.mjs` passes each file through esbuild `transform` with `minifySyntax`, then applies regexes to the result, strings included. Scope is `src` of `ui-spec`, `ui-render`, `ui-text`, `ui`, `ui-viewer`, `ui-react`; `ui-cli` is Node-only and out. `Function` is banned with or without `new` (§15.1 says `Function`), and `dangerouslySetInnerHTML` is added because `ui-react` is in scope. There is no allowlist, so a string that merely contains a banned word fails. Task 11's bundle grep can reuse the exported `scanSource`.
- Alternatives: a Biome GritQL plugin; a hand-written comment stripper, which misreads regex literals.
- Rationale: smallest check that catches computed and concatenated access with no false hits from comments or types.
- Spec sections: §15.1, §16.

## VD-018 — Packages export `dist`; tests alias to `src`
- Date: 2026-11-04 · Task: 01
- Context: VADD's private packages point `exports` at `src/*.ts`. These packages are published (§10.3), so they must export compiled files.
- Decision: `exports` points at `dist` with `types`. `vitest.config.ts` aliases `@vadd/*` to `src/index.ts`, so tests need no build and never run stale output. `skills/vadd-ui` is a private workspace package named `@vadd/ui-skill`, so it shares the version (§17.2) and holds a test.
- Alternatives: a custom export condition; building before every test run.
- Rationale: one alias in one file. A later package subpath needs its own alias entry.
- Spec sections: §3, §10.3, §17.2.

## VD-019 — Compile targets
- Date: 2026-11-04 · Task: 01
- Context: §17.4 sets ES2020 for browsers and Node 20 for the CLI. `ui-spec` and `ui-text` run in both.
- Decision: `tsconfig.browser.json` targets ES2020 and serves `ui-spec`, `ui-render`, `ui-text`, `ui`, `ui-react`. `ui-spec` and `ui-text` narrow `lib` to ES2020, so DOM use does not compile. `tsconfig.node.json` targets ES2023, which Node 20 runs in full, and serves `ui-viewer` and `ui-cli`. `@types/node` stays on `^20` so newer APIs do not typecheck. esbuild targets `es2020` and `node20` live in `scripts/lib/targets.mjs`. The Viewer's browser app gets its own config in the task that writes it.
- Alternatives: `@types/node` at VADD's `^26`, which would hide use of APIs Node 20 lacks.
- Rationale: the compiler enforces the limits instead of review.
- Spec sections: §3, §17.4.

## VD-020 — Bundle-size check fails once the bundle is declared
- Date: 2026-11-04 · Task: 01
- Context: the check must report "no bundle yet" until task 11, but a check that passes on a missing file would hide a dropped build step afterwards.
- Decision: a missing `packages/ui/dist/vui.min.js` passes only while `packages/ui/package.json` `exports` does not mention `vui.min.js`. Task 11 must add that entry and build the bundle within `pnpm build`.
- Alternatives: flip the check by hand in task 11, which is easy to forget.
- Rationale: the spec's CDN path already needs the export entry.
- Spec sections: §9.5, §10.3.

## VD-021 — Playwright in the gate; Biome skips Markdown
- Date: 2026-11-04 · Task: 01
- Context: §16 runs browser tests with Playwright, so `pnpm gate` needs Chromium. Biome 2.6 also formats Markdown, which would rewrite the spec and these docs.
- Decision: `pnpm gate` runs `playwright test`; CI installs Chromium first, and a new machine needs `pnpm exec playwright install chromium`. Biome excludes `**/*.md`. Vitest stays on VADD's `^4.1.10` although 5.x exists (VD-005).
- Alternatives: keep Playwright outside the gate until task 06, which leaves it unproven.
- Rationale: every gate is real from the first task, and the spec's bytes stay untouched.
- Spec sections: §16.
