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
- Decision: `scripts/check-forbidden-apis.mjs` passes each file through esbuild `transform` with `minifySyntax`, then applies regexes to the result, strings included. Scope is `src` of `ui-spec`, `ui-render`, `ui-text`, `ui`, `ui-viewer`, `ui-react`; `ui-cli` is Node-only and out. Browser-reaching code must live in one of those `src` trees, or the §3 table in `scripts/lib/workspace.mjs` must gain it, so the Viewer's feed app belongs under `packages/ui-viewer/src`. `Function` is banned with or without `new` (§15.1 says `Function`), and five siblings of the §15.1 list are added because they reach the same outcome: `outerHTML`, `srcdoc`, `createContextualFragment`, `DOMParser`, and `setTimeout` or `setInterval` with a string literal. `dangerouslySetInnerHTML` is added because `ui-react` is in scope. There is no allowlist, so a string that merely contains a banned word fails. Task 11's bundle grep can reuse the exported `scanSource`.
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

## VD-022 — Parser grammar is strict JSON plus only what §5.1 lists — DEVIATION
- Date: 2026-11-04 · Task: 02
- Context: §5.1 calls the input a JSON5 subset and names what is added and what is refused, but JSON5 also allows `+1`, `.5`, `5.`, `\x41`, `\v`, raw tabs in strings, a BOM and extra whitespace. Separately, §5.1 says strict JSON is always valid, while `1e999` is valid JSON that becomes `Infinity`, which §5.1 refuses and strict canonical JSON cannot hold.
- Decision: accept strict JSON plus exactly the five relaxations named. `\'` is accepted in both quote styles, because a single-quoted string needs it and one escape table is simpler. Everything else in JSON5 is refused. DEVIATION: a number that overflows to infinity is a parse error, although `JSON.parse` accepts it. A single byte order mark at offset 0 is skipped and does not count towards the column, because it is an encoding artifact rather than syntax and Windows tools add it; any other U+FEFF is refused.
- Alternatives: accept all of JSON5 except the named refusals, which contradicts "exactly"; let `1e999` reach the canonical form, where `JSON.stringify` writes `null`.
- Rationale: the acceptance criterion says "exactly", and an overflow would otherwise silently change a value.
- Spec sections: §5.1.

## VD-023 — Parser nesting cap of 128
- Date: 2026-11-04 · Task: 02
- Context: a recursive parser given 256 KiB of `[` overflows the stack, and §16 fuzzing requires no crash. §13.4 caps depth at 12, but that is a validator `error` with a JSON Pointer, in task 03.
- Decision: `parse` fails with `code: 'too-deep'` past 128 levels, with line and column. The normalizer stops expanding at the same depth. Task 03 can map `too-deep` to the §13.4 limit (exit 3) rather than to exit 2.
- Alternatives: an iterative parser, which is more code for inputs that are invalid anyway; a cap of 12, which would give depth errors no pointer.
- Rationale: smallest total parser; the validator still reports every normal depth error.
- Spec sections: §5.1, §13.4, §16.

## VD-024 — What "every default explicit" covers
- Date: 2026-11-04 · Task: 02
- Context: §2 says the canonical form has every default explicit. Not every default is a value: `generatedAt` is stamped by the CLI, `grid.cols` is "auto by child count", numeric `align` depends on cell data, and §7 calls `text` the default format while §5.3 says a string column is exactly `{key, label}`.
- Decision: the normalizer writes the §5.2 defaults (`vui`, `density`, `locale`) and each §6 field with a stated concrete default: `callout.tone`, `code.maxLines`, `log.maxLines`, `progress.max`, `table.pageSize`, `table.sticky`. A default applies only to an absent key. Optional fields with default "none" stay absent, never `null`. `generatedAt` comes from `options.generatedAt` and is otherwise absent, because the package has no clock. `format` stays implicit.
- Alternatives: resolve `grid.cols` and `align` here, which moves layout into the normalizer and breaks idempotence if data changes; write `format: 'text'` everywhere, which contradicts §5.3 item 6.
- Rationale: follows the spec's literal wording where it gives a value, and keeps the package pure.
- Spec sections: §2, §5.2, §5.3, §6, §7.

## VD-025 — Path map records rewrites and resolves by longest prefix
- Date: 2026-11-04 · Task: 02
- Context: §13.2 requires pointers into the input as written, but task 03 validates the canonical form.
- Decision: `normalize` returns `paths.toInput(canonicalPointer)`. Only rewrites are stored, as absolute input pointers, and the longest recorded prefix is resolved with the remainder appended. Values with no input of their own, such as defaults, map to their parent. `dropped` lists input pointers of object-row keys that match no column, so task 03 can report them as `info`. Invariant, tested: every canonical pointer maps to a pointer that exists in the input.
- Alternatives: a full map of every pointer, which costs memory proportional to the document; source spans from the parser, which `render(object)` input could not provide.
- Rationale: small, works for object input, and task 03 only has to call one function.
- Spec sections: §13.2.

## VD-026 — Column suffix and object-row rules
- Date: 2026-11-04 · Task: 02
- Context: §5.3 items 5 and 6 leave open how colons in labels behave, which key an object row uses for `"Time:ms"`, and what `tone` or `note` keys in an object row mean, given that §6.6 defines row options only for array rows.
- Decision: split at the first colon whose remainder matches `[a-z][a-z0-9]*(:\S+)?`, otherwise the whole string is the label, so `"10:05"` and `"Note: see docs"` stay labels and an unknown format name still splits for task 03 to warn about. Keys of the first object row, when `columns` is missing, go through the same parser. A cell looks up the column's written spelling, then its `key`, own properties only. A missing cell is `null`. `tone` and `note` in an object row are ordinary data keys: only array rows have row options.
- Alternatives: split at the last colon, which breaks `"Cov:pct:0"`; treat `tone` and `note` as row options, which invents a feature and collides with real columns of those names.
- Rationale: keeps natural labels intact and stays inside §5.3. Conversion can still lose data: `columns: ['Name']` with rows `{name: 'a'}` gives `[[null]]`, and keys that appear only in later rows are not columns. Each such key is in `dropped`. Task 03 should report `dropped` as `warn`, since this is row data rather than an ignored option. Known limitation: integer-like keys come first in JS objects, so derived columns from `{Service: 'a', 2024: 1}` start with `2024`; explicit `columns` avoid it, and the skill should say so.
- Spec sections: §5.3, §6.6.

## VD-027 — Coverage provider added early
- Date: 2026-11-04 · Task: 02
- Context: this task needs a measured 95% line coverage, but the coverage gate belongs to task 04 and no provider is installed.
- Decision: add `@vitest/coverage-v8` as a root dev dependency on the same `^4.1.10` range as Vitest, and run it ad hoc. Task 04 wires it into `pnpm gate`.
- Alternatives: claim coverage from reading the tests.
- Rationale: a dev dependency does not touch the runtime-dependency rule, and the number has to be real.
- Spec sections: §16.

## VD-028 — Object-row expansion is capped at 250,000 cells
- Date: 2026-11-04 · Task: 02
- Context: object rows expand to `columns × rows` cells, and task 03 checks the §13.4 limits only after normalization. A 54 KB table of 5,000 columns and 5,000 `{}` rows took 13 s and then threw `Map maximum size exceeded` out of a function documented as total. §15.1 treats documents as untrusted.
- Decision: above `MAX_TABLE_CELLS` (250,000) `rows` stay unconverted, while `columns` still expand. The cap exceeds 30 × 5,000, so any table it stops already breaks a §13.4 limit and task 03 reports that. The renderer's over-limit truncation therefore has to tolerate object rows in such a table, or show an error card.
- Alternatives: 1,000,000 cells, which still costs about 200 MB; dropping path entries for missing cells, which leaves the cell allocation; checking §13.4 limits in the normalizer, which moves task 03's job here.
- Rationale: smallest change that keeps `normalize` total, with no effect on any table inside the limits.
- Spec sections: §13.4, §15.1, §16.

## VD-029 — Schema generator reads `types.ts` itself
- Date: 2026-11-04 · Task: 03
- Context: §13.1 generates the schema from the types. TypeScript 7.0.2 exports only `typescript/unstable/*`, with no stable compiler API. `ts-json-schema-generator` depends on `typescript@^5.9` and emits draft-07 (`definitions`, array-form `items`), which draft 2020-12 replaces with `$defs` and `prefixItems`.
- Decision: `scripts/lib/schema-gen.mjs` is a recursive-descent reader of the TypeScript subset `types.ts` uses: `const` arrays, `type`, `interface … extends`, unions, tuples with labels, `T[]`, `Record<string, T>`, `(typeof X)[number]`. Unsupported syntax throws with a line number, so the build fails rather than losing a type. Doc tags `@integer`, `@minimum`, `@maximum` on a type alias carry what TypeScript cannot say. `pnpm build` writes `packages/ui-spec/dist/vui.schema.json`, exported as `@vadd/ui-spec/schema.json`; `pnpm check` fails when it differs from a fresh generation.
- Alternatives: a second, old compiler under an npm alias plus a conversion pass from draft-07; `typescript/unstable/ast`, which may change in any release.
- Rationale: no new dependency tree, exact 2020-12 output, and `types.ts` already stays plain for this purpose.
- Spec sections: §13.1, §16.

## VD-030 — What "schema and walker agree" means
- Date: 2026-11-04 · Task: 03
- Context: §13.1 and §16 require agreement, but JSON Schema cannot say row arity, total node count or depth, and it has no notion of severity: an unknown enum is a `warn` here and a schema failure there.
- Decision: the schema describes the canonical types, closed on enums and open on fields. On every document within `MAX_NESTING`, the schema rejects exactly when the walker reports a code in `SCHEMA_CODES` (`unknown-type`, `missing-field`, `bad-type`, `bad-enum`, `bad-range`, `bad-version`), whatever the severity. Other codes are cross-field or size rules the schema does not attempt. Past `MAX_NESTING` a subtree is raw and the walker stops, so that case is excluded; text input cannot reach it.
- Alternatives: "no errors ⇔ schema valid", which would force the schema to accept any enum string and lose its value; a one-way implication, which a schema of `{}` satisfies.
- Rationale: a biconditional catches drift in both directions.
- Spec sections: §13.1, §16.

## VD-031 — Severity for optional fields, ranges and `kind`
- Date: 2026-11-04 · Task: 03
- Context: §13.3 makes a wrong type an `error` for a required field and says nothing of optional ones. It also says nothing of ranges such as `span` 1–12. The §11.3 example shows a bad `status`, a required field, as `warn`.
- Decision: a wrong type in an optional field or a field with a default is `warn`, since the field can be ignored; below a required field it is `error`. Nested values inherit from the nearest object field. A range or integer miss is `warn` (`bad-range`). A bad enum is `warn` everywhere, as in §11.3, except `chart.kind`, which has no safe default and selects the data shape, so it is `error`. `vui` other than 1 is an `error` (`bad-version`), because §17.1 supports only `vui` ≤ the renderer's major.
- Alternatives: `error` for every wrong type, which goes beyond §13.3 and blocks a document for a cosmetic field.
- Rationale: "safe default" is the §13.3 test for `warn`, and each of these has one.
- Spec sections: §5.4, §6, §13.3, §17.1.

## VD-032 — How the §13.4 limits count
- Date: 2026-11-04 · Task: 03
- Context: §13.4 gives numbers without units.
- Decision: input size is UTF-8 bytes of the text, 256 KiB = 262,144, checked before parsing. Depth counts a body node as 1 and adds 1 per nested node, or per `plan`/`tree` item level, reported once per branch at the first level past 12. Nodes are §5.4 nodes, including `md` from a bare string, not items. A `spark`'s `values` and a scatter's `points` count as one series. String length is UTF-16 units; 20,000 applies to `text` of `md`, `code`, `log`, and 2,000 to every other string the walker knows, read literally, so `checks.output` and `diff.hunks` values get 2,000. Object keys, `meta`, unknown fields and fields of unknown components are not counted. Size checks are in `validateText` only: `validate` takes a host value that `JSON.stringify` could overflow on. Parse `too-deep` reports `limit-depth` (VD-023). `limit-canonical-size` implements VD-012.
- Alternatives: count items as nodes, which would make a 500-item list illegal.
- Rationale: literal where §13.4 is literal, and otherwise the reading that leaves ordinary documents legal.
- Spec sections: §13.4, §11.4, §15.3.

## VD-033 — Unknown component: `error` here, placeholder in the renderer
- Date: 2026-11-04 · Task: 03
- Context: §13.3 makes an unknown `type` an `error`; §17.1 says an older renderer shows unknown components as placeholders, so "a document always renders".
- Decision: both hold, at different stages. `validate` reports `unknown-type` as `error`, which blocks the CLI, and still returns `document` with the node untouched and not walked. The renderer's error card is the §17.1 placeholder.
- Alternatives: a lenient mode on `validate`; the renderer does not need one, since it ignores `ok`.
- Rationale: smallest reading that satisfies both sections.
- Spec sections: §13.3, §17.1.

## VD-034 — Cross-field rules the spec implies
- Date: 2026-11-04 · Task: 03
- Context: §6 defines index fields and parallel lists without stating what happens when they disagree, and "items or path list" for `tree`.
- Decision: `warn`, because a default exists: an index past its list (`sort`, `group`, `pick`, `active`: `bad-index`); `totals`, `compare.values`, or a series whose length differs from its reference (`length-mismatch`); a flow edge to an undeclared node (`bad-ref`). `error`: a `tree` with neither `items` nor `paths` (`tree-source`), since nothing can render, and an object inside a row anywhere but last (`bad-cell`). A last element that is an object is always row options, so `[1, {tone: 'ok'}]` under two columns has one cell and fails `row-arity`. The same rule applies after shorthand 5, so an object as the last cell of an object row is reported as `row-arity` plus `unknown-field`, not as a bad cell.
- Alternatives: leave these to the renderer, which would hide an agent's mistake.
- Rationale: agents get told; lenient rendering is unaffected.
- Spec sections: §6, §6.6, §13.3.

## VD-035 — Corpus is a TypeScript module with a hand-written oracle; Ajv as a dev dependency
- Date: 2026-11-04 · Task: 03
- Context: §16 shares the corpus between validator, schema and renderers, and it needs 300 or more documents with expected results. Snapshots from the code under test would prove nothing.
- Decision: `packages/ui-spec/test/corpus/` holds compact tables that state each expected code, severity, path and default; `cases.ts` expands them to `validCases` and `invalidCases`. Later tasks import it. §19 examples stay as relaxed text, and a test compares them with the spec file. Ajv 8 (`ajv/dist/2020`) is a root dev dependency and checks the schema.
- Alternatives: 300 JSON file pairs, which are slower to review and can go stale; generated snapshots.
- Rationale: expected results come from the spec, not the implementation. Ajv never reaches a published package.
- Spec sections: §16.

## VD-036 — Diagnostic paths and messages
- Date: 2026-11-04 · Task: 03
- Context: §13.2 says paths point into the input, but a missing field has no value to point at, and parse errors have no pointer. VD-025's invariant is that every pointer exists in the input.
- Decision: `missing-field` points at the object that lacks the field. Parse errors use path `""` with line and column in the message, as `Diagnostic` has no such fields. Limits on the whole document use `""`. Quoted user values are clipped, and `makeDiagnostic` caps messages at 120. The `hint` holds "did you mean", and the CLI appends it as in §11.3.
- Alternatives: a pointer to the absent key, which would break the VD-025 invariant.
- Rationale: an agent can always resolve the path it receives.
- Spec sections: §11.3, §13.2.

## VD-037 — Suggestion ties go to the nearest length
- Date: 2026-11-04 · Task: 03
- Context: §11.3 shows `"tabel"` suggesting `"table"`, but `tabs`, listed earlier, is also at distance 2.
- Decision: the smallest distance wins; on a tie the candidate nearest in length wins, then list order.
- Alternatives: Damerau distance, which departs from the "Levenshtein" §11.3 names.
- Rationale: reproduces the spec's example with the spec's metric.
- Spec sections: §11.3.

## VD-038 — The cell cap is per document
- Date: 2026-11-04 · Task: 03
- Context: VD-028 capped expansion per table and said this kept `normalize` total. Review disproved it: 72 tables of 500 × 500 cells in 254 KB each stay under the cap, and together they threw `Map maximum size exceeded`.
- Decision: supersedes the per-table cap of VD-028. `MAX_TABLE_CELLS` is a running budget across the document, counting only cells from object rows. A table that would pass it keeps its object rows, and the validator reports `bad-type` on them. Its cells alone exceed `limit-canonical-size` in `validateText`.
- Alternatives: one path entry per row rather than per cell, which leaves the cell arrays in place; a lower cap per table, which only moves the threshold.
- Rationale: no deliverable document can reach the budget, since 250,000 cells need at least 1.25 MB of canonical JSON.
- Spec sections: §13.4, §15.1, §16.

## VD-039 — Diagnostic cap, and keys count as strings
- Date: 2026-11-04 · Task: 03
- Context: review showed a 256 KB document killing Node with out-of-memory: a 130,000-char series key and 42,000 bad points gave 42,000 paths of 130 KB each. VD-032 had left object keys uncounted, which is what allowed it. `try/catch` cannot stop this.
- Decision: amends VD-032. Keys of §6 maps (`series`, `hunks`, `tones`, `kv` objects) count towards `limit-string`, and the walker skips the value of an over-limit key. `validate` keeps 1,000 diagnostics plus the first of each limit code, so the exit code stays right, then one `too-many-diagnostics` with the count, at the worst severity it left out, so `ok` stays right. A repeat of the last code at the same path is dropped.
- Alternatives: only the key limit, which leaves a document of 200,000 small mistakes costing memory for nothing the CLI prints.
- Rationale: the CLI prints 20, so 1,000 loses nothing a reader would use.
- Spec sections: §11.3, §13.4, §15.1, §16.

## VD-040 — A tree needs a usable source; flow labels are required
- Date: 2026-11-04 · Task: 03
- Context: `{type: 'tree', items: ['src/a.ts']}`, a natural mix-up of `items` and `paths`, passed VD-034's check because the key existed, although nothing can render. Separately, task 02 typed `FlowNodeObject.label` as optional, while §6.5 writes `{id, label, status?}`, and the walker copied that.
- Decision: amends VD-034. `tree-source` fires unless `items` or `paths` is a list that is empty or holds at least one entry of its kind. `FlowNodeObject.label` is required, as written; a node with no label is the plain string form.
- Alternatives: keep `label` optional and log a DEVIATION, which the decision order rules out where the spec is clear.
- Rationale: the error means "nothing can render", so it has to follow that, not key presence.
- Spec sections: §6.5.

## VD-041 — Review findings declined, and a note for task 13
- Date: 2026-11-04 · Task: 03
- Context: the task review raised minor items that this task does not take.
- Decision: no column hint on `dropped-cell`, since `dropped` carries pointers only and the hint needs the table; a later task can extend it. §13.3's "ignored option" stays empty beyond unknown fields: nothing in §6 defines an option that a valid document can ignore, and rules such as `fold` without `title` would be invented. For task 13: `Diagnostic.path` must stay the exact pointer (§13.2), so a key with a line break or control character reaches `path` raw, and the CLI must escape `path` when printing. `message` and `hint` are already safe.
- Alternatives: escape `path` here, which stops it resolving in the input.
- Rationale: smallest honest scope; the renderer and CLI tasks own the rest.
- Spec sections: §11.3, §13.2, §13.3.

## VD-042 — Delta syntax: `delta[:base[:arg]][:better:low|high]`
- Date: 2026-11-04 · Task: 04
- Context: §7 gives `delta:pct` and says `better:low` inverts tones, but not how the two combine.
- Decision: a trailing `better:low` or `better:high` is stripped first and the rest is `base[:arg]`: `delta:better:low`, `delta:pct:better:low`, `delta:pct:2:better:low`, `delta:money:PLN:better:low`. Bases are the numeric formats; the default is `num`. A value that rounds to the base format of 0 has no sign and `muted` tone, because §7 defines tones only for gains and losses. The sign is a literal `+` or U+2212 in front of the base format of the absolute value, since §7 prints U+2212 where Intl prints a hyphen, and a base such as `ms` has no Intl sign to reuse.
- Alternatives: a comma (`delta:pct,better:low`), which adds a separator nothing else uses; a separate field, which the §6.6 column has no room for.
- Rationale: colon is §7's only separator, and it passes the VD-026 column suffix: `"p95:delta:ms:better:low"` works unchanged.
- Spec sections: §5.3, §7.

## VD-043 — Grouping is always on, and Intl spaces are kept
- Date: 2026-11-04 · Task: 04
- Context: §7 shows `1 234,50 zł`, but Intl prints `1234,50 zł` in `pl-PL`, whose minimum grouping is two digits. Intl also separates with NBSP (U+00A0) where the spec prints a space.
- Decision: pass `useGrouping: 'always'` to every number format, so a Polish column does not mix `1234` and `12 345`. Keep Intl's NBSP and U+202F; the spec's space is read as typography, and tests assert the exact code points.
- Alternatives: a locale table; normalizing spaces, which lets a value wrap mid-number.
- Rationale: Intl-only and stays aligned in columns. An engine without the string form coerces `'always'` to `true`, the default, so it never throws. Firefox 115, the §17.4 floor, may be such an engine (not tested in a browser; from memory the string form arrived in Firefox 116): there `pl-PL` would print `1234,50 zł`, the plain Intl output, and differ from the CLI until the floor moves.
- Spec sections: §7, §17.4.

## VD-044 — `ms` and `dur` take unit names from Intl parts
- Date: 2026-11-04 · Task: 04
- Context: Intl `short` gives `1.24 sec`, and `narrow` gives `1.24s`; §7 wants `1.24 s`. It also wants `2m 05s` and `1h 02m`, and defines no tiers.
- Decision: under 1 s, Intl `short` milliseconds, rounded. Under 60 s, number plus a space plus the `narrow` unit symbol from `formatToParts`, with 2 decimals for `ms` and 0 for `dur`. From 60 s, two `narrow` Intl units with the second padded to 2 digits and hours unbounded, so `pl-PL` gives `2 min 05 s` and `uk-UA` gives `2х 05с`. Thresholds apply to the rounded value.
- Alternatives: hard-coded `s` and `m`, which are not localized; `Intl.DurationFormat`, which is absent from Node 22 and outside §17.4.
- Rationale: reproduces every §7 example and stays locale-driven.
- Spec sections: §7.

## VD-045 — `bytes` with `iec` uses literal unit symbols
- Date: 2026-11-04 · Task: 04
- Context: Intl has `megabyte` but no `mebibyte`.
- Decision: `si` uses Intl `unit`, so `uk-UA` gives `1,5 МБ`. `iec` uses Intl digits with the literal symbols `B KiB MiB GiB TiB PiB`, in every locale, joined by a space as in Intl `unit` output. Bytes have 0 decimals, and larger units 1. A value that rounds up to the next unit moves to it.
- Alternatives: translating IEC prefixes by hand, which breaks the Intl-only rule.
- Rationale: IEC symbols are international; it is the one place a unit is not localized.
- Spec sections: §7.

## VD-046 — `rel` tiers and the English abbreviation dot
- Date: 2026-11-04 · Task: 04
- Context: Intl `short` prints `3 min. ago` in English, while §7 prints `3 min ago`. Polish and Ukrainian abbreviations need their dots. §7 sets no tiers, and §5.2 sets `generatedAt` as now.
- Decision: use `style: 'short'`, truncating to whole seconds, minutes, hours, days, months (30 days) and years (365 days), and print `now` under 1 s. Strip the abbreviation dot only for language `en`. With no usable `generatedAt`, print the absolute datetime and a `warn`; never read a clock. `numeric: 'always'`, because `yesterday` can be wrong by calendar day across truncation.
- Alternatives: `narrow` (`3m ago`), which does not match §7.
- Rationale: truncation cannot roll over to `60 min ago`, and the only non-Intl step is one punctuation fix that §7's example requires.
- Spec sections: §5.2, §7, §9.3.

## VD-047 — `date` is always UTC and strict ISO 8601
- Date: 2026-11-04 · Task: 04
- Context: §7 requires identical strings in the DOM and text renderers, yet Intl defaults to the machine's zone, and `Date.parse` accepts engine-specific forms: V8 reads `2026-02-31` as 3 March.
- Decision: format in UTC, printing `UTC` wherever a time is shown. Strings must match ISO 8601, a time without an offset is UTC, an offset must lie within ±14:00, and fields are round-tripped through `Date.UTC`, so an impossible date renders raw with a `warn`. `short` is the §7 example `Nov 4, 2026`.
- Alternatives: the viewer's zone, which breaks snapshots and differs between renderers.
- Rationale: the document has no zone field, and an explicit `UTC` label keeps it honest.
- Spec sections: §7, §9.3, §16.

## VD-048 — Value checks in the validator, and in-document links
- Date: 2026-11-04 · Task: 04
- Context: §13.3 makes a cell type mismatch a `warn`, and task 03 left that out. §15.1 lists three link schemes, while §4.2 and §5.4 also promise `#id` links. §7 does not cover a bad format arg.
- Decision: add `bad-value` and `bad-format-arg`, both `warn`. The walker reports `bad-format-arg` wherever a format is declared, and `bad-value` for table rows and totals, `kv` tuples, `stats` `value` and `delta`, and `compare` `values`. Chart data is left out: the number rule covers it, and an `x` label may be text. `#fragment` is accepted as a link because it has no scheme and leaves the document; relative URLs stay text. Inline text has no backslash escapes.
- Alternatives: warn only from the renderer, which the CLI would never print.
- Rationale: the CLI should warn exactly where the renderer falls back, so both call the same check.
- Spec sections: §4.2, §5.4, §5.5, §7, §13.3, §15.1.

## VD-049 — Review findings declined for task 04
- Date: 2026-11-04 · Task: 04
- Context: the task review raised items this task does not take.
- Decision: `T24:00:00` stays invalid, since `date` round-trips fields and no agent writes it. Markup delimiters inside a URL can still split a link, as in `*a [b](http://x/*y)*`: masking well-formed links for one rare input adds a second pass. `code` counts UTF-16 units and `path` counts code points, and `sha` may split a surrogate, which only a non-hex value can reach. `#fragment` is not a DEVIATION: §4.2 lists it beside the three schemes, and it has no scheme.
- Alternatives: fix each one; none changes what a real document shows.
- Rationale: smallest honest scope. All are reversible.
- Spec sections: §4.2, §5.5, §7, §15.1.

## VD-050 — A chart's caption follows a table right after it — DEVIATION
- Date: 2026-11-04 · Task: 05
- Context: §5.2 renders `body` top to bottom, and §19.3 puts the chart before the table, yet §19.5 prints the table first and the chart's caption last. The acceptance criterion requires §19.5.
- Decision: DEVIATION from §5.2, as §19.5 requires. A chart, or a run of charts, followed directly by a `table` sibling prints after that table. Everything else keeps document order, including a chart followed by anything else. It applies per child list. §19.5 is matched byte for byte against the spec file.
- Alternatives: move every chart to the end of its container, which reorders far more than the example needs and can put a caption under the wrong section; keep document order, which fails the criterion.
- Rationale: the narrowest rule that reproduces the example. A caption under the data it summarizes also reads naturally.
- Spec sections: §5.2, §19.3, §19.5.

## VD-051 — Text marks for status and tone
- Date: 2026-11-04 · Task: 05
- Context: §15.2 requires an icon and a label for every status, and §19.5 shows only ⚠, with no list of icons.
- Decision: status `ok ✓`, `fail ✗`, `warn ⚠`, `info ℹ`, `run ▶`, `wait …`, `skip ⊘`, `none` has no mark. Tone `ok ✓`, `warn ⚠`, `err ✗`, `info ℹ`; `muted`, `accent`, `default` have no mark. A status token or `status` cell prints mark and label, per §15.2; a list-like item with a `status` field prints the mark, since its text labels it. Row tones go in the first cell, after the value, as in §19.5.
- Alternatives: words only, which contradicts §19.5.
- Rationale: plain Unicode that survives terminals and PR comments. Task 09 or later may share these if the DOM wants the same glyphs.
- Spec sections: §15.2, §19.5.

## VD-052 — Text output has no interaction, so nothing is hidden
- Date: 2026-11-04 · Task: 05
- Context: §9.3 uses `pageSize`, `maxLines`, `fold` and `active` for height safety in a frame. A text host has no frame and no control to reveal the rest.
- Decision: print all rows, all lines, every tab and every folded node. `sort` still applies, since §19.5 applies it. `checks.output` keeps its last 20 lines, because §6.5 states that as content, with `… N earlier lines` in front. Chart data is not printed; §19.5 prints a caption. A `compare` cell, a `bar` and a `delta` print their text only, with no drawing or tone mark.
- Alternatives: honor `pageSize`, which drops rows with no way to see them.
- Rationale: a degraded host should lose visuals, not data. §13.4 already bounds the size.
- Spec sections: §6.5, §9.3, §13.4, §19.5.

## VD-053 — How markdown output stays inert
- Date: 2026-11-04 · Task: 05
- Context: §5.5 and §15.1 say raw HTML renders as text and that the renderer loads no remote assets. Passing document text into markdown would break both, in any host that renders it. A check through `marked` and `markdown-it` found two escapes that hand-written tests missed: `![x](url)` becoming a live image, and a bare URL's autolink swallowing a backslash or a code span's opening backtick, which freed the `<b>` after it.
- Decision: text is escaped in one place, `markdown.ts`. `<` before a tag start and `&` before an entity become `&lt;` and `&amp;`, not backslash escapes, so no tag can start even if an autolink runs over the text. A bare URL gets no autolink (`http\://`, `www\.`): §5.5 has none, and §5.5 links stay live. A `!` before a link is escaped. Link targets percent-encode `( ) | \ < >`. Inline text is flattened to one line, and line-start syntax is escaped. Fences are longer than any backtick run inside. Adjacent lists alternate markers (`-`, `*`; `1.`, `1)`), or GFM merges them. Before anything is escaped, a walk over the whole document removes ANSI sequences and C0/C1 controls except tab and newline, from values and object keys, in both formats, because §15.1 treats documents as hostile and `vui render` prints to a terminal. It must come first: the task review showed that cleaning finished output let `<\0script>` turn into a live tag after the escaper had passed it. An OSC with no terminator ends with its line, so it cannot delete what follows.
- Alternatives: fenced or HTML-escaped output, which is unreadable; relying on the host's sanitizer, which plain markdown viewers do not have.
- Rationale: only markup the serializer writes is live. Checked outside the repo with 40,000 fuzzed and 400 fixed documents, with control characters in the fuzz alphabet, through `marked`, `markdown-it` and `cmark-gfm`: no tag, image or unsafe scheme. That is evidence, not proof, and the check is not part of `pnpm gate`, since those parsers are not dependencies.
- Spec sections: §5.5, §15.1.

## VD-054 — What the `md` node accepts in text output
- Date: 2026-11-04 · Task: 05
- Context: §6.2 lists the block subset of `md` without detail, and a text renderer must not pass the source through (VD-053).
- Decision: parse lines into blocks. Only `###` and `####` are headings; `#`, `##`, `#####` and deeper stay text, as §6.2 reads. Blockquotes do not nest, and their text is paragraphs. Lists nest by indent and ordered lists renumber from 1, because the first marker of a list sets its kind. When indentation steps back to a level between two others, the item joins the existing child list, so no item is lost. An indented line under an item joins it. A blank line between items does not end a list. An open fence closes at the end of the text. A backtick fence may have no backtick after it, as in CommonMark, so a one-line ```` ```a``` ```` is a paragraph. Tables, rules, HTML and task-list syntax stay text. Soft-wrapped lines join with a space. Task 07 should follow the same reading so that hosts agree; it cannot import this, since `ui-render` does not depend on `ui-text` (§3).
- Alternatives: clamp `#` and `##` to h3, friendlier but not what §6.2 says, and easy to add later in both renderers.
- Rationale: literal subset, one line-based pass, and linear on hostile input.
- Spec sections: §3, §6.2.

## VD-055 — Sort order and default alignment
- Date: 2026-11-04 · Task: 05
- Context: §6.6 gives `sort` and "numbers default right" and leaves the rest open. §19.5 needs both.
- Decision: sort raw values, not display strings. Numbers compare numerically and strings with `Intl.Collator` for the document locale; a string in default format compares by its inline-free text. In a mixed column numbers come before strings, reversed by `desc`. Empty cells stay last in both directions. The sort is stable, and a `sort` past the last column is ignored. A column is right-aligned when it has a numeric format (`num int compact pct pct100 delta ms dur bytes money`), or has no format and every non-empty cell is a number. Task 08 should match this rule; both live in `packages/ui-text/src/table.ts` and could move to `ui-spec`.
- Alternatives: move the helpers to `ui-spec` now, which adds a public API for a second caller that does not exist yet.
- Rationale: smallest change here, and written down so the DOM can agree.
- Spec sections: §6.6, §19.5.

## VD-056 — `tree.paths` nesting is capped at the §13.4 depth
- Date: 2026-11-04 · Task: 05
- Context: `paths` is a flat string list, so §13.4 sees no depth in it, and VD-032 counts depth by items. Splitting on `/` created it here: review measured a 242 KiB valid document giving 123 MB of output in 25 s, and a 1 KiB one overflowing the stack.
- Decision: split into at most 12 levels, and print what is left of the path as one segment (`12/13/14/15`). Task 11's DOM `tree` should do the same.
- Alternatives: reject deep paths in the validator, which refuses a real path for what is only a display problem; pass an indent prefix down, which leaves a stack overflow.
- Rationale: nothing is hidden, and output stays proportional to input.
- Spec sections: §6.5, §13.4, §15.1.

## VD-057 — Review findings declined for task 05
- Date: 2026-11-04 · Task: 05
- Context: the task review set these aside for a ruling.
- Decision: bidi controls such as U+202E pass through: §15.1 lists no such threat, and stripping them is a one-line change in `clean.ts` if it does. `@mentions` and `#123` stay live, and so does email autolinking, which cannot run over a code span: a PR comment author may want them, and task 13 can add a flag. `code` and `path` print `formatValue`'s truncated string, because §7 requires identical strings; this is the one exception to VD-052. `#id` links have no anchor in markdown, since no HTML is written. An unknown component prints one line, without §9.3's folded JSON, which is written for the DOM. Plain table width counts code points, so CJK and emoji can misalign. `**a.**b` is bold to `parseInline` and not to GFM flanking rules, a gap in `ui-spec`.
- Alternatives: fix each; none changes what a normal document shows.
- Rationale: smallest honest scope. All are reversible.
- Spec sections: §5.5, §7, §9.3, §15.1.

## VD-058 — `.light` and an emptied class mean light — DEVIATION
- Date: 2026-11-05 · Task: 06
- Context: §8.1 applies dark fallbacks under `prefers-color-scheme: dark` "when no `.dark` class exists". Orca's shell writes `<html class="light">`, and its live toggle only flips `.dark`, so a frame that started dark and switched to light has `class=""`. Host tokens hide this for most colors, but `--vui-ok`, `--vui-warn` and `--vui-info` have no host source. On a dark OS they would stay in their dark values on a white Orca card.
- Decision: the OS rule is `:root:where(:not(.dark):not(.light):not([class=""])) .vui-root`. A page with no `class`, or with unrelated classes, still follows the OS. `.vui-root.vui-root.vui-root[data-vui-theme=…]` repeats the class because a single class loses to `:root.dark .vui-root`, which VD-007 says it must beat.
- Alternatives: `light-dark()`, which needs Chromium 123 and so breaks the §17.4 floor; reading `color-scheme` in script, which §8.2 rules out.
- Rationale: one selector, no script, and a side benefit for the Viewer, whose toggle leaves the same empty class.
- Spec sections: §8.1, §8.2.

## VD-059 — Tone text is derived, because two §8.1 tones miss 4.5:1 — DEVIATION
- Date: 2026-11-05 · Task: 06
- Context: the task wants tokens that match §8.1 exactly, and tones at 4.5:1 against `--vui-surface`. On white, `#16a34a` is 3.30:1 and `#d97706` is 3.19:1, so both cannot hold for those values as text.
- Decision: §8.1 tokens stay exact and remain the fill colors. New `--vui-{ok,warn,err,info}-text` tokens are `color-mix(in srgb, var(--vui-tone) 70%, var(--vui-surface-fg))`, and all tone-colored text uses them. 70% is the one share that passes on the surface and on the 12% tint, in both schemes, with fallback tokens and with Orca's own. Lowest ratio: 4.69:1 (`warn` on its tint, light). A `muted` pill draws `--vui-surface-fg`, because muted text on its own tint is only 4.09:1.
- Alternatives: darken the two tokens, which breaks "match exactly"; per-scheme overrides, which do not follow host themes.
- Rationale: both requirements hold, and the text color still tracks the host.
- Spec sections: §8.1, §15.2.

## VD-060 — What the renderer does with each diagnostic
- Date: 2026-11-05 · Task: 06
- Context: §13.3 says an `error` makes an error card, §9.3 says invalid fields are dropped and rendering is lenient, and §13.4 says the browser truncates. Diagnostics carry input pointers and a cap of 1,000, and a renderer walks the canonical tree.
- Decision: `ui-spec` gains `inspect()`, which `validate` wraps. It adds `paths` and `issues`, each problem with its canonical pointer, past the 1,000 cap on diagnostics (bounded by VD-066). Then: a limit truncates in place and shows as `warn`; a `warn` of `bad-type`, `bad-enum` or `bad-range` deletes that object key, so a component with a default must apply it itself (`maxLines` can be absent after this); any other `error` goes to the deepest node containing its pointer, which becomes an error card; `unknown-type` stays a placeholder (VD-033). An array item is never removed by a drop, since that would renumber its neighbours. A document-level error such as `bad-version` shows in diagnostics and still renders (§17.1). Input over 256 KiB still parses, with a `warn`, up to 1 MiB (VD-066).
- Alternatives: reverse-mapping input pointers, which is ambiguous for shorthands; a second validator pass in the renderer.
- Rationale: one rule per severity, and no second copy of the §6 field rules.
- Spec sections: §9.3, §13.2–13.4, §17.1.

## VD-061 — The registry is a parameter, not global state
- Date: 2026-11-05 · Task: 06
- Context: tasks 07 to 10 add components, and tests need fixture components. A mutable global registry would let page script replace a component, and it would leak between tests.
- Decision: `createRenderer(registry, clock?)` builds a `render`. `components/index.ts` holds the built-in `COMPONENTS` map, and the public `render` is built from it at import. `createRenderer` stays out of the package's `index.ts`, so §9.1 stays the public surface; tests and the harness import it by path.
- Alternatives: `registerComponent()` on the public API.
- Rationale: §9.1 lists no registration API.
- Spec sections: §9.1.

## VD-062 — Host objects are copied down to JSON before `normalize`
- Date: 2026-11-05 · Task: 06
- Context: task 02 left this to `render(object)`. `JSON.parse` never yields cycles, getters, proxies or shared subtrees, and `normalize` is total only over JSON.
- Decision: `sanitize` follows `JSON.stringify` for functions, symbols and `undefined`. A `Date` becomes ISO text. Cycles, `NaN`, infinities and `bigint` become `null` with a `warn`. A throwing getter or proxy drops that value. Depth stops at the parser's cap of 128 with `limit-depth`. A budget of 500,000 values stops shared-subtree bombs with `limit-input-size`. `toJSON` is not called. Warnings stop at 20. The copy also means `prepare` can cut it in place without touching host data.
- Alternatives: `JSON.parse(JSON.stringify(x))`, which throws on cycles and `bigint`, and hangs on a shared-subtree bomb.
- Rationale: total and bounded, with a diagnostic for what changed.
- Spec sections: §9.3, §15.1.

## VD-063 — The Orca shell is vendored, and runs in a real sandboxed iframe
- Date: 2026-11-05 · Task: 06
- Context: VD-009 says to read the constants from `stablyai/orca` and check them against the installed 1.4.248. A copied CSP string in a test page would prove little: the shell's sandbox, base element, height bootstrap and message checks all matter. `host/orca.ts` is task 16.
- Decision: `e2e/harness/orca/` holds `native-chat-visual-shell.ts` and its token list byte for byte, at a commit named in its README (MIT). The host page uses `NativeChatVisualFrame.tsx`'s attributes (`sandbox="allow-scripts"`, `referrerPolicy="no-referrer"`) and calls Orca's own `buildNativeChatVisualDocument`, clamp and theme message. Theme values come from Orca's `main.css`. The installed app's bundle has the same CSP directives and the same `connect-src 'none'`; its skill file is older than `main`, which adds token guidance only. Vendored files keep their extensionless import, so `e2e/` has its own `tsconfig.json` with `bundler` resolution, and `pnpm typecheck` runs it. Task 16 can drop the vendoring only if the harness keeps running Orca's real bootstrap.
- Alternatives: fetch at test time, which breaks offline CI; retype the shell, which can drift.
- Rationale: the code under test is Orca's own. §17.3's scheduled job can diff these files too.
- Spec sections: §4.2, §16, §17.3.

## VD-064 — Baselines are one platform's, and watchdog time is a node's own
- Date: 2026-11-05 · Task: 06
- Context: `toHaveScreenshot` adds the platform to file names by default, and text rendering differs by OS, while CI and development both run Linux Chromium (VD-010). Separately, VD-008 sets a budget per component, and a parent's elapsed time includes its children.
- Decision: baselines live in `e2e/__screenshots__/` with no platform suffix, at `maxDiffPixelRatio: 0.001` and a per-pixel `threshold` of 0.1. They are from this WSL machine, so a CI runner with other fonts will need a one-time regeneration with `--update-snapshots=all`. The default mode skips differences inside the tolerance. The watchdog charges a component its own time only, so ten 50 ms children do not fail their parent. There is no total document budget: §13.4 limits bound the node count, and a total would fail innocent nodes.
- Rationale: §16 names one browser. Own time blames the node at fault.
- Spec sections: §9.3, §15.1, §16.

## VD-065 — Smaller calls in the core
- Date: 2026-11-05 · Task: 06
- Context: the spec leaves these open.
- Decision: `render` adds `.vui-root` to `target` if it is missing, and `destroy` removes it only if `render` added it, so the boot script's element works too. `render` does not inject CSS (§9.2 gives that to the boot script); `stylesheet` is exported. A `fold` with no `title` is ignored, since the title is the toggle. A repeated `id` gets no second DOM `id` and keeps state by path. Node state keys include the type, so another component at the same path starts fresh. Headings are `h2` for the visual and `h3` to `h6` by titled ancestors. `el()` throws on a banned tag or attribute and the node guard shows a card; a banned `href` is dropped silently, since it can come from a document. `<img>` is not on the tag list: nothing in §6 needs it and it can load remote content. SVG is task 09's addition. Status icons match VD-051, and `none` gets `○` because §15.2 wants an icon on every status. A standalone page with a dark OS and a white background is left for task 11, since §8.3 bars the renderer from setting one.
- Rationale: simplest choices that meet the spec.
- Spec sections: §5.4, §8.3, §9.2, §9.3, §15.1, §15.2.

## VD-066 — Task 06 review: hard ceiling, plain fold titles, declined findings
- Date: 2026-11-05 · Task: 06
- Context: a fresh review found no critical defects, 4 important and 9 minor ones, each reproduced. Fixed: a bad `span` on an unknown node took down the whole document; memory blew up on long pointers; an error stayed on a key that was already cut; links nested in fold toggles. Also fixed: over-long keys with string values, ids held by discarded subtrees, ignored `children` spending the node budget, invalid locales reaching components, non-Element targets, typed arrays, error cards losing their `span`, and a corpus test that could not see an isolation failure.
- Decision: text over 1 MiB (`MAX_TEXT_BYTES`, 4 × §13.4) is refused with a document error card, an `error` of `limit-input-size`. This is a DEVIATION from "the renderer truncates": nothing can be truncated before it is parsed, and a 20 MB document exhausted the heap. Hosts already cap at 256 and 512 KiB, so only a direct `render` call can reach it. `issues` keeps at most 20,000 non-limit entries (`MAX_ISSUES`) plus every limit, because each entry holds a pointer of the document's choosing. Past the cap a field is not dropped and a node may not get its error card, so components must stay tolerant, and the node guard still catches them. A fold title in the node wrapper renders as plain text, because a link inside a button is invalid HTML and also toggles the fold. `ctx.fold` labels carry the same rule. An invalid `locale` falls back to `en-US` in the context, since a later `localeCompare` would throw.
- Declined, for later tasks: after a column or flow cut, `sort`, `group`, trailing row options and flow edges can refer to removed items. VD-055 already ignores a `sort` past the last column, and tasks 08 and 22 must guard the same way. `tone` on the node wrapper draws nothing yet, because §5.4 leaves "frame or accent" to each component (task 07). `#737373` on `--vui-muted` is 4.34:1, but only on an `aria-hidden` icon.
- Note for the coordinator: §17.4 sets Chromium 110 and requires `color-mix()`, and as far as is known `color-mix()` arrived in Chromium 111 (not tested here). §8.1 mandates it, so at that floor tone tints and `--vui-*-text` would not resolve.
- Rationale: fix what breaks isolation, memory or validity now, and keep component behavior in the component's own task.
- Spec sections: §5.4, §9.3, §13.4, §15.2, §17.4.

## VD-067 — The `md` parser moves to `ui-spec`
- Date: 2026-11-05 · Task: 07
- Context: VD-054 defines what `md` accepts, task 05 asks hosts to agree, and §3 gives `ui-render` no edge to `ui-text`.
- Decision: `parseMd(text): MdBlock[]` moves to `ui-spec` with its behavior unchanged, and returns raw inline strings, so each host parses them with its own context. `ui-text`'s `mdBlocks` maps that tree to serializer blocks. Its snapshots and tests pass unchanged, which is the proof nothing moved.
- Alternatives: a second copy in `ui-render`, which can drift; a new shared package, which §3 does not list.
- Rationale: both hosts run one reader. VD-055 held back such a move for want of a second caller; here there is one. `ui-spec` gains a public export, and the parser touches no DOM.
- Spec sections: §3, §6.2.

## VD-068 — What `tone` draws on a node
- Date: 2026-11-05 · Task: 07
- Context: §5.4 says "frame or accent", leaving it open. §15.2 forbids conveying tone by color alone.
- Decision: the frame draws it, so every component has a tone with no code of its own. Any tone but `default` draws a 3 px inline-start bar. `ok`, `warn`, `err` and `info` also draw a mark in the gutter: VD-051's glyph, `aria-hidden`, plus a visually hidden word (`ok`, `warning`, `error`, `info`). `muted`, `accent` and `default` mean nothing, so no mark, as in VD-051. `card` makes the bar its whole border, and `callout` adds a 12% tint. Lines use a new `--vui-tone-line`, because `--vui-accent` is a background and vanishes as a line: it is `--vui-primary` for `accent`. `Component.tone` gives a default the frame applies when the node has none, since a drop can remove `callout`'s `info` (VD-060). Later components may override the bar in CSS through `[data-vui-type]`.
- Alternatives: leave it per component, which repeats code and lets a component forget; a mark from CSS `content`, whose alt-text syntax is past the §17.4 floors.
- Rationale: one rule, and no tone rests on color alone.
- Spec sections: §5.4, §8.1, §15.2.

## VD-069 — `grid` collapses by its own width, and spans clamp
- Date: 2026-11-05 · Task: 07
- Context: §6.1 and §8.4 say "under 480 px" without saying of what. §5.4 gives `span` 1–12 while `cols` stops at 6, and does not say what a span past the columns means. §6.1 says "auto by child count" and gives no table.
- Decision: a `@container` query on a box around the grid, so the Viewer feed, a VADD sidebar and a nested grid collapse by the room they have. Under 480 px of that width there is one column and spans are off. A span is the number of columns, clamped to `cols` by rewriting the child's `data-vui-span`, since `grid-column: span 7` in three columns invents tracks. Auto: 1–3 children give that many columns, 4 gives 2, 5–6 give 3, more give 4, none gives 1. A bad `cols` goes auto.
- Alternatives: a media query, which is wrong in a narrow column of a wide window; reading `span` as twelfths, which `cols` rules out.
- Rationale: `@container` is inside every §17.4 floor. A grid in a wide window but a narrow cell now collapses, which is the point of the rule.
- Spec sections: §5.4, §6.1, §8.4, §17.4.

## VD-070 — `tabs`: every tab in the Tab order, and no element ids
- Date: 2026-11-05 · Task: 07
- Context: the ARIA practice is a roving `tabindex`, with `aria-controls` by id. §15.2 says tabs are buttons "keyboard reachable in DOM order". Generated ids collide when two renders share a page.
- Decision: native buttons with `role="tab"`, all in the Tab order, as §15.2 reads. Arrows, Home and End also move and select, since a screen reader announces a tablist. Panels are named by `aria-label`, so no id is needed. Every panel is built and the inactive ones are `hidden`, so diagnostics and ids do not depend on the open tab. The index lives in `state`; if it is gone after `update`, `active` applies, then 0. `label` is plain text: rules type it `string`, `ui-text` prints it as text, and a link cannot sit in a button. An empty list draws nothing.
- Alternatives: roving `tabindex`, which conflicts with §15.2; lazy panels, which would change diagnostics by tab.
- Rationale: the spec's wording wins, and the arrows cost little. A `#id` link into a hidden tab or a closed fold goes nowhere for now.
- Spec sections: §6.1, §9.3, §15.2.

## VD-071 — `code`: fold in place, wrap lines, and the copy chain
- Date: 2026-11-05 · Task: 07
- Context: §9.3 says `code` folds after `maxLines`, and gives the copy chain in prose. It does not say whether the first lines stay visible.
- Decision: the first `maxLines` lines stay, then a toggle "N more lines", then the rest, in DOM order. `mark` and line numbers count across the whole text. Lines wrap, so no sideways scroller needs focus. Without `lines` and `mark` the body is one text node, the fast path for 20,000 chars. A marked line is a `<mark>` with a tint and a bar. Numbers are `aria-hidden` and not selectable, and the fold toggle is not selectable either, so a selection copies code only. Copy: `navigator.clipboard.writeText` of the exact `text`; then open the fold, select and `execCommand('copy')`; then the button says `Select text to copy` and the selection stays. `Copied` goes back to `Copy` after 1.5 s. A fence in `md` uses this block with the defaults, for §9.3 height safety. One trailing newline is not a line, as in `ui-text`.
- Alternatives: fold the whole block, which hides even the first line; scroll sideways, which needs a focusable region.
- Rationale: in Orca's real sandboxed frame the chain ended in `Copied` with every line selected, so step 2 works there; the frame cannot use the clipboard API.
- Spec sections: §6.2, §9.3, §15.2.

## VD-072 — Smaller calls in the layout and text components
- Date: 2026-11-05 · Task: 07
- Context: the spec leaves these open.
- Decision: `stack` gaps are `--vui-space-2`, `-3` and `-4` for `sm`, `md` and `lg`, with `md` the default. In `md`, `###` takes the node's content level and `####` one deeper, capped at h6, so headings stay consistent under a title (§15.2, VD-065); `NodeContext` gains `level`. A `card`'s frame is its surface, so title and note sit inside. `divider` `label` is plain text, as in `ui-text`, on a `role="separator"` with `aria-label`. Code sits on `--vui-surface`, because `--vui-muted-fg` reaches only 4.34:1 on `--vui-muted`. Marked lines use `--vui-info`, which reads as a highlight and not a warning. A non-object tab is an `error`, so the node becomes a card; `tabs` only skips one past VD-066's cap.
- Rationale: simplest choices that meet the spec.
- Spec sections: §6.1, §6.2, §8.3, §15.2.

## VD-073 — Task 07 review: exact copy, list numbers, CRLF, target width, declined findings
- Date: 2026-11-05 · Task: 07
- Context: a fresh review found no critical defects and four important ones, each reproduced: copy through the selection lost blank lines while saying `Copied`; CRLF text broke `md`; an ordered list always started at 1, so numbered steps split by a fence restarted; a `grid` in a shrink-to-fit target collapsed to 0 px, because `container-type` gives its box no intrinsic width.
- Decision: `execCopy` writes the exact `text` in a one-shot `copy` listener; an e2e test confirms that inside Orca's sandboxed frame, blank lines and fold included. An empty line row holds a newline, so a reader's own selection keeps it. `parseMd` splits on `\r\n`, `\r` and `\n`. `MdList.start` keeps the first number when it is not 1, and `<ol start>` and both text outputs use it. This changes VD-054's "ordered lists renumber from 1": items still count up from the first marker, and later markers are ignored, so `3. a`, `5. b` prints 3 and 4. `.vui-root` is `box-sizing: border-box` and fills its containing block through `stretch` and its vendor forms, which keeps a target's margin and padding inside it, unlike `width: 100%`. Two minors were promoted, since each is one line: `mark` is a `Set`, because 50,000 marks turned a valid node into a budget card; tabs ignore arrows with Alt, Ctrl or Meta, which blocked browser Back.
- Host requirement: a target or parent sized to its content must not set that width itself. A target with an explicit `width: fit-content`, or inside a shrink-to-fit parent, leaves `grid` no width to measure. The stylesheet cannot win there, and tasks 16 to 18 hosts must give the target a width.
- Declined, as minors: a marked line in a closed fold gives no hint on the toggle. A copy rejection landing after `update` runs on the old DOM; it needs a slow rejection in that window. The toggle's focus ring is clipped by `overflow: hidden`. `###` and `####` share one size, and differ as `h3` and `h4`. A remembered tab index stays while out of range, so 3→2→3 tabs returns to it. A tone mark's glyph and word enter a reader's selection. A plain block's manual selection loses a blank line right at the fold; the copy button does not.
- Also not fixed: a plain standalone page has no background from the renderer (§8.3), so on a dark OS its light text sits on the browser's white. The Orca shell paints its own. The standalone and CDN templates of §4.3 and §10.2 should set one; this was seen in the Orca browser pane with a bare test page.
- Rationale: the four defects hit real input in real hosts. The rest change little for a reader, and all are reversible.
- Spec sections: §4.3, §6.1, §6.2, §8.3, §8.4, §9.3, §10.2.

## VD-074 — Bars are 101 constant rules, named by `data-vui-fill`
- Date: 2026-11-05 · Task: 08
- Context: §7 says the `style` attribute is never set from document values, and a bar's width is a document value. `<meter>` and `<progress>` cover one bar, not segments or spark columns, and need vendor pseudo-elements for each.
- Decision: every bar, segment and spark column carries `data-vui-fill="N"`, an integer from 0 to 100, and the stylesheet generates 101 rules that set `--vui-fill`. `.vui-fill` reads it as width and `.vui-spark-col` as height. A positive value never rounds to 0 and an unfinished one never to 100. Segments use largest remainder, so they add up to the rounded whole, and a positive segment keeps at least 1. Segments past `max` scale to their sum.
- Alternatives: `<meter>`/`<progress>`; CSSOM `style.setProperty`, which is still `style` from a document value and which the source constraints ban; SVG, which `el` does not have yet.
- Rationale: one mechanism for three uses, the loop costs bytes once, and no value reaches CSS: only a whole number the code computed.
- Spec sections: §6.3, §7, §15.1.

## VD-075 — Table reading moves to `ui-spec`
- Date: 2026-11-05 · Task: 08
- Context: VD-055 kept sort and alignment in `ui-text` until a second caller existed. Now one does, and VD-067 set the pattern.
- Decision: `parseRow`, `sortRows`, `alignOf`, `groupKey` and `badgeOf` are public in `ui-spec`, and `isNumericFormat` replaces `ui-text`'s copy of the numeric set. A row keeps its source `index`, so a cell's JSON Pointer stays true after a sort (task 04's carry-over). `badgeOf` adds what §7 calls "the status value": a `badge` cell holding a status word with no `status` format is a status, unless `tones` matches first. `ui-text` follows, so `ok` in such a cell now prints `✓ ok` there too. An object row left by VD-038 stays an empty row: reading it by key would expand the cells that cap refused, and `ui-text` has no column cut to bound it.
- Alternatives: copy the helpers, which can drift; reading object rows by key, which a safety test caught reopening VD-028.
- Rationale: both renderers run one reader, as §7 requires of formats.
- Spec sections: §3, §6.6, §7.

## VD-076 — Table semantics and controls
- Date: 2026-11-05 · Task: 08
- Context: §6.6 and §15.2 leave these open.
- Decision: the first column of a row is `<th scope="row">`, also in `tfoot`. Each run of a `group` is its own `<tbody>`, because `scope="rowgroup"` means the one it sits in; the column stays in the rows, as in text. A header click sorts ascending, a second flips it, and there is no unsorted third state. Every `th` has `aria-sort`, `none` when not sorted. Glyphs are `▲` and `▼`; the unsorted `↕` shows on hover and focus only. Sort and shown count live in node state, so they outlive `update`, and sorting keeps the shown count. "Show N more" adds `pageSize` rows and has `aria-expanded="false"`, as §15.2 lists it. When the last page lands the button hides, and focus moves to the first new row. Only `tbody` is replaced on repaint, since detaching `thead` drops a header's focus. `title` is a visible `<caption>`; under a fold the toggle shows it and the caption is visually hidden. A `caption` scrolls with a wide table, which is the table's own box doing its job. Group sub-headers and `pageSize` do not interact: only data rows count. A row's `note` goes in the first cell. Bars are left out of `totals` and group rows, since neither is on the column's scale. `row options` survive a column cut (`prepare.cutColumns`), and a `sort` or `group` past the cut is ignored (VD-066).
- Rationale: valid table markup, and focus never lands on the body.
- Spec sections: §6.6, §9.3, §13.4, §15.2.

## VD-077 — Cell details
- Date: 2026-11-05 · Task: 08
- Context: §7 says `bar` scales to the column maximum "or 1.0 for `pct`", and says little else.
- Decision: `pct100` scales to 100, its own 1.0. The column maximum reads all rows, not the page, so bars do not shift when paging. A negative value draws no fill. A bar's track is `aria-hidden`, because the text beside it says the same. A `badge` with a `tones` match carries VD-051's mark and the text. A value with no tone is a muted pill. `code` is a button holding `<code>`, copying the full value (`title`, when the display is cut) through the §9.3 chain, now in `copy.ts`. Feedback is `aria-label` plus a check mark, for 1.5 s. `null` shows the em dash in every cell type. `code` and `path` do not wrap in a table unless `wrap: true`, so a wide table scrolls instead of growing tall. Table text sets `overflow-wrap: normal`, or the root's `anywhere` would crush columns to fit.
- Rationale: simplest reading of §7 that stays honest to a reader.
- Spec sections: §7, §8.4.

## VD-078 — `stats.spark` draws columns, ahead of task 09's chart
- Date: 2026-11-05 · Task: 08
- Context: §6.3 lists `spark` on `stats` as core, and the `spark` chart arrives in task 09. Calling a missing component would show a placeholder inside every tile.
- Decision: a tile draws up to 40 columns through VD-074, sampled at the same stride as the text sparkline, with a flat series at mid height. It is `role="img"` with `aria-label` "Trend, N points, from A to B", always in `num`, since a `status` format would misread these numbers. Task 09 may swap it for the SVG chart.
- Alternatives: leave `spark` to task 09, which ships a core field dropped.
- Rationale: about ten lines, on a mechanism that already exists.
- Spec sections: §6.3, §6.4, §15.2.

## VD-079 — Smaller calls in `kv`, `stats`, `list` and `progress`
- Date: 2026-11-05 · Task: 08
- Context: the spec leaves these open.
- Decision: `kv` and `stats` are `<dl>`s with a `div` per entry. `kv` collapses with the same 480 px container rule as `grid`, and takes the same host requirement (VD-073). `stats` tiles use `auto-fit` columns of at least 9 em. A tile's `tone` follows VD-068. A status item in a `ul` drops its bullet, since the badge is its marker; in an `ol` it keeps the number. `progress` prints the text renderer's `V of M (P%)`. Its `aria-valuenow` is clamped to the range, and with `max` not positive it has no value and an empty fill. Each segment appears in a legend with a swatch, VD-051's mark where one exists, a label and a value, so no segment rests on color.
- Rationale: one string in both renderers, and no status rests on color (§15.2).
- Spec sections: §6.3, §15.2.

## VD-080 — Task 08 review: scroll containment, a capped pin, total repaints, declined findings
- Date: 2026-11-05 · Task: 08
- Context: a fresh review found no critical defects and three important ones, each reproduced. A `.vui-sr-only` word in a toned row or badge escaped `.vui-table-box`, which was not positioned, and grew the page by 1,300 px at 360 px width. A long pinned first column filled a 320 px box, so no other column could be reached. A bad `tones` value past the first page threw from a click handler, reaching the host.
- Decision: the box is `position: relative`. Under 480 px of box width the pinned column is capped at `max-width: 45cqi` with `overflow-wrap: break-word`, and its `code` wraps. The review's own option was to unpin there, which departs from §8.4; a cap keeps the §8.4 rule at every width. `anywhere` crushes the column, because it lowers min-content, and `break-word` does not. The box now has `container-type`, so a table takes VD-073's host requirement too: a target sized to its content leaves it no width. `badgeOf` checks `tones` against `TONES`, so a bad value is a neutral pill, in both renderers. A row that fails costs that row, with `Could not render this row`, since a repaint after mount has no node guard around it. Also fixed: a bad sort direction or a non-integer index; `tones` over a status now prints the same in text as in the DOM; a non-text row `note` in text; a link in a hidden caption took focus; nowrap reached right-aligned prose (it is now for numbers only); a cut `code` cell had no tooltip and a short label; stale copy feedback; a tone mark as a direct child of `dl > div`; `1 points`.
- Declined, as minors: a bad column format is reported once per shown cell, bounded by the page, because `build.report` keys on the path and the fix would add a special case. `delta: '+4'` and `max: 'abc'` still print in `ui-text`, which takes `normalize` output and predates this task. An empty string in a `badge` or `code` cell gives an empty pill, and §7's em dash covers only null and missing. A `caption` scrolls away with a wide table (VD-076). Sort and paging clicks were not run in the review's past-cap fuzz.
- Test changed from task 07: `code.test.ts` "takes a long mark list in its stride" rendered 5,000 rows, 150 to 167 ms of the 200 ms budget alone, and it failed `pnpm gate` here once more test files ran beside it. It now renders 1,500 rows with 500,000 marks that miss, which scans the whole list on a linear lookup and leaves the DOM's own cost far from the budget. A mutant with `Array.includes` still fails it, with the budget card.
- Rationale: an ordinary document must not break the page, and the §8.4 rule holds. All are reversible.
- Spec sections: §6.6, §7, §8.4, §9.3, §15.2.

## VD-081 — One chart engine, and what is left out for size
- Date: 2026-11-05 · Task: 09
- Context: 8.1 KiB gzip remained for charts, task 10 and the boot script, and §9.4 says little about many details.
- Decision: every kind reads into one `Model` (`chart/model.ts`) and draws through one cartesian path with swapped axes for `hbar`, plus a short donut branch and `sparkPath`. Each series is one `<path>`, so DOM size does not grow with points. Left out: a crosshair and point dots, keyboard access to the tooltip (the hidden table serves non-pointer readers), ranking in a donut fold, and a ring hit test (any point reads by angle). `scatter` stays a placeholder card until task 22.
- Alternatives: per-kind renderers, which cost about twice as much; `<rect>` per bar, which grows the DOM to 120,000 elements at the caps.
- Rationale: §9.5 is a hard gate; these extras are not in §9.4.
- Spec sections: §6.4, §9.4, §9.5, §15.2.

## VD-082 — Chart geometry
- Date: 2026-11-05 · Task: 09
- Context: §6.4 and §9.4 do not say how `x` maps to position, how a chart reads the width, or what bars do past 1,000 points.
- Decision: `line`, `area` and `spark` place numbers and ISO dates to scale when they strictly increase, otherwise evenly. Bars take equal bands. `render` draws at a constant 640 px, so the DOM is deterministic (§9.3) and a host with no `ResizeObserver` still gets a scaled drawing; the shared observer then redraws at the real width, rounded to a whole pixel. Zero width is ignored, so a hidden panel keeps its drawing. A failed redraw keeps the last one (VD-080). Bar kinds run LTTB over summed magnitudes, so one index list serves all series. `line` and `area` run it per series on their finite points. A point count is the longest series; a longer `x` is ignored and a missing label prints its 1-based index. The domain takes `refLines`, plus 0 for bars and `area` but not `line`. `stacked` piles negatives downward. With no `yFormat`, ticks use `num:N` for the step's decimals, so small ticks stay distinct, and values use `num`. Text is 11 px with width estimated from length, so nothing is measured. A category label is clipped to 16 characters on the axis, or 35% of the width on `hbar`, and is whole in the tooltip and table.
- Alternatives: index spacing for all, which misdraws irregular time series; measuring text, which needs an attached element.
- Rationale: simplest reading that does not misstate data and stays deterministic.
- Spec sections: §6.4, §9.3, §9.4.

## VD-083 — Chart colors and tooltip position use constants only
- Date: 2026-11-05 · Task: 09
- Context: §8.2 bars computed colors, §7 bars `style` from document values, and a tooltip must follow the pointer.
- Decision: `svg()` has its own allow-list with no `fill`, `stroke`, `style` or `href`, so a chart cannot hold a color. Twelve `[data-vui-series]` rules set `--vui-tone-line`: series 1 to 5 are `--vui-chart-N`, 6 to 10 mix the same tokens to 60%, and 11 and 12 to 35%, with `color-mix` to `transparent`. A repeat therefore works for marks and swatches alike. A donut wraps at 12. The tooltip uses VD-074's `data-vui-fill`, so it moves in whole percents of the box, and `data-vui-end` flips it past the middle. An HTML overlay takes the pointer, which also stops the native `<title>` tooltip.
- Alternatives: an SVG tooltip, which the 120 px height would clip; `style`, which is banned.
- Rationale: a theme switch needs no JavaScript (§8.2), and `style` stays unset.
- Spec sections: §6.4, §7, §8.2, §9.4.

## VD-084 — Field semantics and hidden data
- Date: 2026-11-05 · Task: 09
- Context: `stackTotal`, `legend`, `refLines` and the hidden table are only named in the spec.
- Decision: `stackTotal` applies to `stacked` only: a total above each labelled stack, a tooltip row and a `Total` column. `legend: auto` shows for 2 or more entries; a donut's entries are its categories. `refLines` draw on `bar`, `hbar`, `stacked`, `line` and `area`, dashed and labelled, not on `donut` or `spark`. `spark` ignores `height`, `legend` and `refLines`, and is 8 em wide. A donut past 12 categories keeps the first 11 and sums the rest as `Other`, in the tooltip and table too; its `<desc>` still counts the document's points. The hidden table has at most 200 rows at an even stride, and its caption says `1 row in N`: 10,000 × 12 cells would break §9.5. It sits in a `.vui-sr-only` wrapper with `top: 0`, because a table's box ignores `height`, and a static position added 1 px to the frame. In `<desc>`, a unit both ends share prints once (`120–480 ms`), so `5 ms–1m 30s` keeps both. Series values that are not numbers are refused by the walker; past VD-066's cap they are skipped and a line bridges them. `CHART_LABELS` moved to `ui-spec`, in its own file because the schema generator reads `types.ts`; `ui-text` output is unchanged.
- Rationale: the plainest reading of §6.4 that stays inside §9.5.
- Spec sections: §6.4, §9.4, §9.5, §15.2.

## VD-085 — `stats.spark` swaps to the chart's line
- Date: 2026-11-05 · Task: 09
- Context: VD-078 left this open.
- Decision: swap. A tile draws `sparkPath`, the same path as a `spark` chart, up to 1,000 points through LTTB, in place of 40 columns. `role`, `aria-label`, the tone color and mid-height for a flat series stay. It removes the sampling code and the column rule, and changes the six `stats` baselines.
- Alternatives: keep columns, which keeps two drawings of one thing.
- Rationale: less code, and a peak now survives sampling.
- Spec sections: §6.3, §6.4.

## VD-086 — Task 09 review: slivers, ticks, folds and small values
- Date: 2026-11-05 · Task: 09
- Context: a fresh review reproduced one critical defect, four important and six minor. A slice under 0.5% had a negative dash, which Chromium paints as a solid ring. Twelve significant digits collapsed ticks on a range such as 1700000000001 to 1700000000004, and `high === low` put NaN in every mark. A fold with a short `x` placed `Other` at `x.length`. A fold's `<desc>` range used the folded sum. `num` printed `0.001` as `0`.
- Decision: a slice keeps a dash of at least 0.2. Ticks round to the step's own decimals, and a list that is not strictly increasing and covering falls back to the domain's two ends, as a seeded 20,000-range sweep now checks. `Other` always takes slot 12, with index labels filling a short `x`, and the fold sums positives only, as a ring draws. `range` reads the document before the fold. With no `yFormat`, values use the ticks' decimals when those pass 2, and `num` otherwise; this refines VD-082. A shared tail prints once only if the rest of the low end has no letter, so `1m 05s–2m 05s` stays whole. Totals read the model's stack tops, so they hold past 1,000 points. An `hbar` refLine label in the start half anchors `start`. Tick text clips at 14 characters. `sparkPath` halves before subtracting, so a span past the double range stays finite.
- Declined: none of the findings. Two mutants that survived, negatives stacking upward and per-series bar indices, led to stronger tests.
- Rationale: a chart must not misstate data, even on rare input.
- Spec sections: §6.4, §9.3, §9.4, §15.2.

## VD-087 — The chart budget test reads the fastest of 7 runs
- Date: 2026-11-05 · Task: 09
- Context: a 5 × 1,000 chart renders in about 4 ms alone, but a median read 18.5 ms under a full `pnpm gate`, where tests run side by side, against the §9.5 limit of 25 ms. Two tests have already flaked this way (VD-080).
- Decision: the test asserts the fastest of 7 runs and prints the median too. The render itself is far from the limit, and contention is not the code's cost.
- Alternatives: a median, which flakes under load; a higher limit, which hides a real regression.
- Rationale: a budget test should fail on the code, not on the machine.
- Spec sections: §9.5, §16.


## VD-088 — A donut whose sum overflows is left to task 20
- Date: 2026-11-05 · Task: 09
- Context: a coordinator probe gave a `donut` 5,000 values of alternating 1e308 and -1e308 with matching `x`. The positive sum overflows to `Infinity`, `value / whole` in `chart/draw.ts` is `NaN`, and the ring's `stroke-dasharray` reads `NaN 100`. Nothing throws. No other kind and no other hostile document in the probe put `NaN`, `Infinity` or `undefined` in an attribute.
- Decision: merge task 09 as it is, and hand this to task 20, whose fuzzer covers the class. The sum must exceed about 1.8e308, which no ordinary document reaches, and 3.43 KiB gzip is left for tasks 10 and 11.
- Alternatives: reopen the worker now, which reruns a full cycle for input no real chart holds.
- Rationale: reversible, recorded with its repro, and the owner task already exists. This is a known defect, not a declined one.
- Spec sections: §6.4, §16.

## VD-089 — Size allotment for tasks 10 and 11
- Date: 2026-11-05 · Task: 10
- Context: §9.5 caps `vui.min.js` at 38 KiB gzip. After task 09 the `ui-render` entry is 34.57 KiB gzip, so 3.43 KiB remain for seven dev components and the boot script, and `check-bundle-size` stays idle until task 11.
- Decision: task 11 keeps 0.6 KiB gzip for §9.2's boot steps. Task 10 must end with the `ui-render` entry at or under 37.4 KiB gzip, measured by esbuild with `bundle`, `minify`, `format: esm`, `target: es2020`, then gzip level 9. Removing code to get there is in scope, provided behavior and baselines hold: `ui-spec`, shared helpers and CSS first. A feature named by the spec is not cut to fit. If the limit cannot be met that way, the worker asks the coordinator.
- Alternatives: leave the split to the worker, which is how task 09 overran its own target; property mangling now, which belongs to task 11's build and is held in reserve there.
- Rationale: §9.5 is a hard gate, and the overrun would otherwise surface only at task 11.
- Spec sections: §9.2, §9.5.

## VD-090 — Dev-component readers move to `ui-spec`, and a fold body can wait
- Date: 2026-11-05 · Task: 10
- Context: `ui-text` already read ANSI, last-N-lines, `paths`, plan counts and orphan hunks. §9.3 starts `diff` hunks folded, and `hunks` have no cap as a set: 256 KiB of two-character lines would build 128,000 spans for content nobody opened.
- Decision: `cleanText`, `tailLines`, `planCounts`, `itemsFromPaths` and `diffEntries` live in `ui-spec/src/dev-view.ts`, and `ui-text` output is unchanged. A `ctx.fold` body may be a function, built at the first open, or at render if the fold is remembered open. Hunks use it. Check output does not: it is capped at 2,000 chars. VD-056's depth cap now covers the DOM `tree`, as it asked.
- Alternatives: a copy per renderer, which VD-067 and VD-075 already ruled out; eager hunks with coalesced runs alone, which leaves the worst case to the watchdog.
- Rationale: one reader, and folded content costs nothing.
- Spec sections: §6.5, §9.3, §9.5, §13.4.

## VD-091 — What `checks` and `diff` show
- Date: 2026-11-05 · Task: 10
- Context: §6.5 says output "folds" and "last 20 lines shown"; §9.3 says outputs "start folded". A failing check's output could reasonably start open. §6.5 lists `A|M|D|R` with no words for them, and does not say how a hunk attaches to its file.
- Decision: every output starts closed, a failure too, as §9.3 says. Open, it shows the last 20 lines, with a nested closed fold `N earlier lines` above them: `ui-text` must drop them, but the DOM need not lose them. A file with a hunk makes its whole row the toggle. The mark is the letter with a tint and a hidden word (`added`, `modified`, `deleted`, `renamed`). Hunk lines tint by first character, and `---` and `+++` before the first `@@` are file headers, not changes. A hunk gets `cleanText` too, for `git diff --color`. An output or hunk that is only whitespace gets no fold. Fold state is keyed by check name and file path, not index, so a reorder or a new row keeps it on the same item; items with one name share a fold.
- Alternatives: open on failure, against §9.3; a separate `Show diff` button, which adds a control per file.
- Rationale: §9.3 is the stricter text, and the height rule it serves applies to failures as well.
- Spec sections: §6.5, §9.3, §15.2.

## VD-092 — `log` levels and `timeline` labels
- Date: 2026-11-05 · Task: 10
- Context: §6.5 says levels are "detected by `ERROR`, `WARN`, `INFO`, `DEBUG` prefixes", but real lines start with a time or a bracket. `at` is "ISO time or label", and `date:datetime` reports `bad-value` on a label.
- Decision: a level is one of the four words or `WARNING`, whole and case-sensitive, after anything that is not a letter, past a `T` or `Z` that a digit or space follows. `ERRORS: 0` and `INFORMATION` are not levels. A word after letters, as in `[main] ERROR`, is not detected, which is what "prefix" says. `log` runs `cleanText` first, or a colored level has no prefix; §6.5 names this only for `checks`, but `ui-text` already cleans every string. Lines stay in one `pre`; only runs of a level get an element, so 20,000 chars stay a small DOM. `DEBUG` is muted with no tint. `log` keeps `code`'s fold from VD-071: the first `maxLines` stay. An `at` starting `YYYY-MM-DDT` is formatted; anything else prints as written and reports nothing, so `2026-11 sprint` stays a label. A date with no time also prints as written, where `ui-text` still gives it midnight: the DOM shows no precision the document lacks, and `ui-text` stays unchanged.
- Alternatives: a row element per line, which is 10,000 elements at the cap; the tail visible instead of the head, which §9.3's "fold after `maxLines`" does not say.
- Rationale: matches real logs, stays linear on long lines, and the level word keeps meaning off color alone.
- Spec sections: §6.5, §9.3, §15.2.

## VD-093 — `decision` layout and fields
- Date: 2026-11-05 · Task: 10
- Context: §6.7 asks for side-by-side cards, stacked under 600 px, and does not say how many fit. `question` is not listed as inline text, while `context` and `verify` are.
- Decision: cards sit in a `.vui-grid-box`; columns are `auto-fit, minmax(12em, 1fr)`, and `@container (max-width: 599.98px)` gives one column, by the width of the node, per VD-069 and VD-073. Above 600 px, many options wrap into rows instead of shrinking. `question` is plain text, as in `ui-text`, drawn as a bold paragraph. Fields use `kv`'s layout in `ui-text`'s order, with the name column at least as wide as its word, so `Reversible` does not break in a narrow card. A `pros` or `cons` entry that is not text is skipped. The pick has a stronger border and a `✓ Recommended` label. Nothing in the card is a control (D8).
- Alternatives: `grid-auto-flow: column`, where six options make slivers at 600 px.
- Rationale: reuses `kv` and `card`, and the pick never rests on color alone.
- Spec sections: §6.7, §8.4, §15.2, §18 D8.

## VD-094 — Shape of the shared row list, and size result
- Date: 2026-11-05 · Task: 10
- Context: `.vui-list-status` pulls an item back by 1.5 em, which cancels nesting. §17.4 keeps Firefox 115, which has no `:has()`.
- Decision: `.vui-rows` is a new bullet-free list for `checks`, `plan`, `tree`, `timeline` and `diff`. Only `checks` rows wrap: elsewhere a status stays beside its text. Plain `diff` rows indent past the fold icon with `:has(button)`; without `:has()` they sit 1 em to the left, which is cosmetic. Size: the `ui-render` entry went from 34.58 to 36.87 KiB gzip, under VD-089's 37.4, with nothing removed.
- Alternatives: a per-row spacer element for the icon, which costs an element per file.
- Rationale: one rule set for five components.
- Spec sections: §6.5, §9.5, §17.4.

## VD-095 — Task 10 review: fixed findings, one behavior change, and what is left
- Date: 2026-11-05 · Task: 10
- Context: a fresh review found no critical defects, 5 important and 9 minor ones, each reproduced.
- Decision: all were fixed; those not covered by VD-091 to VD-094 follow. `hunks: null` had made `ui-text` fail, since a default parameter covers only `undefined`; it is back to no hunks. Blank context lines vanished because a `pre` shared `.vui-codeblock`'s flex, which drops whitespace-only text; such a `pre` is now a block. `tree` falls back to `paths` when `items` holds no objects, as the walker's `hasEntries` does. `change` is looked up with `hasOwn`. `planCounts` skips non-objects and non-array `children`, so a `plan` no longer fails on them: this is a logged change to `ui-text`'s count on invalid documents only, and the valid corpus is unchanged.
- Follow-up: `ui-text` still prints nothing for `tree` with `items: []` and good `paths`, since `ui-text` output stays as it was in this task. It wants the DOM's rule; left to the coordinator.
- Declined, with the reviewer: failed `checks` starting closed (VD-091); selecting a `diff` row copying the hidden word; repeated `Output` button names, for task 20's axe-core; `\x1b(B` leaving `(B`, which `cleanText` already did; long list components having no height fold, since §9.3 does not name them.
- Rationale: fix what misleads a reader or loses a node now.
- Spec sections: §6.5, §6.7, §9.3, §15.2.

## VD-096 — Routing task 10's open items
- Date: 2026-11-05 · Task: 10
- Context: the worker left three follow-ups, and a coordinator mutant showed `DEFAULT_LOG_LINES = 40` in `dev.ts` can change with no test failing. `normalize` fills `log.maxLines` first, so that fallback does not run on a normalized document; the mutant on `normalize.ts` fails the default test.
- Decision: `ui-text` prints nothing for a `tree` with `items: []` and good `paths`, where the DOM falls back to `paths`. This is a real gap between renderers on a valid document, and task 12 takes it as the first change it makes to text output. A date-only `timeline.at` printing midnight in `ui-text` goes with it, since VD-092 already prefers the DOM's reading. A `checks.output` over 2,000 chars is not a defect: §13.4 makes it invalid, the browser truncates by keeping the head, and "last 20 lines" holds for every valid document. Task 17's skill must tell agents to send the tail of a long output, since failures usually sit there. Task 11 checks whether the `DEFAULT_LOG_LINES` and `DEFAULT_MAX_LINES` fallbacks can go, because each byte counts there.
- Rationale: each item has an owner task, and none blocks the merge.
- Spec sections: §6.5, §7, §9.3, §9.5, §13.4.

## VD-097 — Shape of `@vadd/ui`: two bundles, one version source
- Date: 2026-11-05 · Task: 11
- Context: §3 names an IIFE and an ESM build; §9.2 wants a version; `tsc` output keeps bare workspace imports, which a browser cannot load, and a version literal would be a ninth place to bump.
- Decision: `scripts/build-bundle.mjs` runs after `tsc -b` in `pnpm build`. It writes `dist/vui.min.js` from `src/vui.ts` and `dist/index.js`, one minified ES module, from `src/index.ts`; `tsc` emits declarations only for this package. `"."` and `"./vui.min.js"` are the exports. The ESM build does nothing on import and exports `boot`: §3's "auto-mounts" is the IIFE's job, because the Viewer imports this module and a page that wants it can call `boot()`. `version` is `__VUI_VERSION__`, defined from `packages/ui/package.json`, which `check-versions` ties to the root. Vitest takes it through `oxc.define`, because a plain `define` becomes a global the workers do not see.
- Alternatives: a `version.ts` literal guarded by `check-versions`, which is one more edit per release; keeping `tsc`'s `index.js` and adding `vui.esm.js`, which ships two ESM files.
- Rationale: one source, one ESM file, and an ESM that works with no bundler.
- Spec sections: §3, §9.2, §10.3, §17.2.

## VD-098 — Boot: a `<head>` document mounts in `<body>` — DEVIATION
- Date: 2026-11-05 · Task: 11
- Context: §9.2 step 2 says "a sibling". The §10.2 template has no `<body>` tag, so the parser places its document script in `<head>`, and a sibling there is never displayed: the spec's own template would show a blank page.
- Decision: a document outside `<body>` mounts at the start of `<body>`, in document order, so it keeps source order with what follows it; any other stays a sibling. A `data-vui-mounted` attribute on the script makes `boot` safe to repeat, and because it lives in the DOM it also covers two copies of the bundle on a page. The stylesheet goes in before the first render and also with no document, since `window.VUI.render` needs it; both happen in one task, so no paint separates them. An existing `#vui-style` is left alone. `window.VUI` holds only `render` and `version`, as §9.2 lists, so `boot` is not on it. The one listener is a `once` `DOMContentLoaded`.
- Not done: a viewport meta. Both templates omit one, so a phone lays out at 980 px; `vui show` (task 13) writes its own HTML and can add it, and the CDN template is the spec's to change.
- Rationale: the template must render (§4.3), and everything else is §9.2 as written.
- Spec sections: §4.3, §9.2, §10.1, §10.2.

## VD-099 — A bare page gets its canvas from `pageCss`
- Date: 2026-11-05 · Task: 11
- Context: VD-073 left this open. `stylesheet` styles `.vui-root` only, so on a dark OS a page with no CSS has light text on a white canvas.
- Decision: `pageCss` in `ui-render` sets `color-scheme` and `background: var(--background, <--vui-bg>)` on the root, with the same theme reading as the tokens: `.dark`, `.light`, `class=""` and the OS. Only the boot script adds it, and only when `html` and `body` both compute to no background and no image, because any root background stops a `body` background from reaching the canvas, whatever its specificity (VD-102). A page whose own stylesheet arrives after boot still wins, since every selector is in `:where`. `stylesheet` stays free of it, because Viewer and React hosts own their pages.
- Alternatives: `color-scheme` alone, which leaves the UA's dark canvas instead of `--vui-bg`, nearly the same shade as `--vui-surface`.
- Rationale: both schemes now read correctly on a page with no stylesheet, and no host is overridden.
- Spec sections: §4.3, §8.1, §8.2, §10.2.

## VD-100 — `#id` links open what hides their target
- Date: 2026-11-05 · Task: 11
- Context: VD-070 left a `#id` link into a hidden tab or a closed fold going nowhere, for this task to fix or route.
- Decision: fixed in `ui-render`, so every host gets it. A fold and a tab panel register how they open (`opensWith`); a click on a `#…` link walks up from the target and opens each hidden ancestor through the component's own path, so state outlives `update`. The native jump then scrolls, and the URL updates. The listener is on the anchor. Node folds are eager; only row bodies are lazy, and those hold no ids. It cost about 0.5 KiB gzip.
- Not done: opening a page at `#id` does not reveal its target, since that takes load-time code or a `hashchange` listener, and VD-070 is about links. Inside a shadow root (`ui-react`) the reveal runs but the browser does not jump; task 19 owns that host.
- Rationale: the fix is small, sits with the components, and uses no global listener.
- Spec sections: §4.2, §5.4, §9.3, §15.2.

## VD-101 — Bundle gate and size result
- Date: 2026-11-05 · Task: 11
- Context: the acceptance item asks for the budget in `pnpm gate` and a grep of the bundle, and §10.1 inlines the bundle in a `<script>`.
- Decision: `check-forbidden-apis` runs over `dist/vui.min.js` and `dist/index.js` in `pnpm check`, with its rules unchanged; a named file that is missing fails. `check-bundle-size` also fails on `</script` in any case or `<!--`, because either breaks the inlined element. Coverage for `packages/ui/src` is held at 95% lines, the renderer's level. The result is in the task report. No reclaim was needed, so neither property mangling nor a `ui-spec` cut happened, and VD-089's reserve stays unspent. `DEFAULT_LOG_LINES` and `DEFAULT_MAX_LINES` stay (VD-096): a bad `maxLines` is dropped by `prepare` after normalize (VD-066), so the fallbacks run on real documents.
- Rationale: the checks read what ships, and the budget was met without a tradeoff.
- Spec sections: §9.5, §10.1, §15.1, §16.

## VD-102 — Task 11 review: fixed findings and declined ones
- Date: 2026-11-05 · Task: 11
- Context: a fresh review found no critical defects and two important ones, each reproduced. `pageCss` on the root stopped a host's `body` background from reaching the canvas. A `<head>` document landed after all later content, so with content between two documents the page came out reordered.
- Decision: both fixed, as VD-098 and VD-099 now read, each with a regression test. Also fixed: `reveal` tries the fragment as written before decoding it, as the browser does, so an id of `a%20b` is found. Test fixes: a vacuous check of the parse message, a request check that matched on suffix, and the Orca shell test now also runs an `#id` link and a live theme switch.
- Flake fixed: `charts.spec` "hovering shows the point" failed twice in about 35 runs here, once in a gate, on its opening `toBeHidden`. It failed in no arrangement consistently, and `bundle.spec` is not the cause: 0 of 10 failed with it. The chart sits at the frame's top-left and the pointer starts at (0, 0), so a pointer event there shows a tip, which is correct behavior. The failure's `data-vui-fill="0"` means `clientX` was exactly 0, on a hit box measured at (0, 0); a real move to (1, 1) shows the tip with fill 1. So the likely source is Chromium's synthetic move after layout, inferred from that state and not observed directly. The test now moves the pointer off the chart first. It predates this task.
- Declined: a `#id` link to a closed `section` itself jumps to its title and leaves it shut. The title is visible and the reader is one click away, while opening what a target contains would also change tabs. A host stylesheet loaded after boot and only setting `body` still sees `pageCss` block it; a stylesheet in `<head>` before the bundle is applied by then. `VUI.render` during parsing has no stylesheet until `DOMContentLoaded`, which is §9.2's order and corrects itself. Orca's outer transcript does not scroll to an `#id` target, because a sandboxed frame cannot scroll its parent and §9.3 bars `postMessage`.
- Rationale: the two defects hit ordinary pages. The rest are rare or cosmetic, and all are reversible.
- Spec sections: §4.3, §9.2, §10.2.

## VD-103 — CLI exit paths and `--json`
- Date: 2026-11-05 · Task: 12
- Context: §11.4 has no usage code, §16 allows only 0 to 5, and a document can break several rules at once.
- Decision: a usage error exits 2: an argument list that does not parse, which is also the Unix convention. A limit outranks a parse error, which outranks a validation error, because only the first says the document must shrink before anything else helps. `--strict` turns `warn` into exit 1 and shows `info`; `info` alone never changes the code. Anything unexpected is exit 5 with a one-line `vui: internal error`, never a stack. Every command returns one `Outcome`, and one place prints it, so `--json` holds on every path: `{ok, ...}` on stdout and nothing on stderr, with `ok` derived from the exit code. `vui schema --json` wraps the schema in the same envelope as the rest. `show`, `viewer`, `doctor` and `bench` are unknown commands until their tasks add them.
- Alternatives: a new exit 64, which §16 forbids; the raw schema under `--json`, which breaks "branch on `ok`".
- Rationale: agents branch on these, so each path has exactly one answer.
- Spec sections: §11, §11.4, §13.3, §16.

## VD-104 — Diagnostics printing
- Date: 2026-11-05 · Task: 12
- Context: §11.3 caps the output at 20 lines and §13.3 sends warnings to stderr, but `validate` exists to print diagnostics, and `ui-spec` itself stops at 1,000.
- Decision: errors sort before warnings before info, stably, so 20 warnings cannot hide an error. The count line reads `and N more`. `too-many-diagnostics` prints no line: its count joins N. `DiagnosticLog` keeps as much room again for errors, which is `ui-spec`'s one change here: past 1,000 warnings an error would otherwise exist only as a severity, and the CLI would exit 1 with nothing to fix (VD-039's cap is now 2,000 for errors). N may include hidden `info`, because the log counts what it drops and does not itemize it. A root diagnostic prints `error: message`, since an empty pointer has nothing to show. `validate` prints to stdout; `render` prints to stderr, so its stdout stays the output. `--json` gives the full list, `info` included. `validate` prints nothing on a clean document, as "diagnostics only" says.
- Rationale: a line limit is only safe if the worst lines survive it.
- Spec sections: §11.3, §13.2, §13.3.

## VD-105 — `extract` follows the tokenizer, and refuses several documents
- Date: 2026-11-05 · Task: 12
- Context: a document's text may spell `<script type='application/vui+json'>`, since JSON keeps single quotes, and a comment or `<template>` can hide one. §10.1 calls the file the single source of truth.
- Decision: `findDocuments` is a scanner over the HTML tokenizer's states: comments, bogus comments, quoted attributes, raw-text and RCDATA elements, and the script-data states with both escaped ones. It builds no DOM, and the rule is the boot script's selector, outside `template`. Several documents exit 2 and name their lines: a CLI file holds exactly one, and picking the first would lose content silently, while a selecting flag is not in the spec. None, or bad embedded text, also exit 2, with the line and column in the file; `too-deep` exits 3. Input over 500 KiB exits 3, since no CLI file is larger. `extract` takes stdin too, by the task's acceptance, though §11.1 writes `<file.html>`. `ui-spec`'s parser reads the text, so a relaxed document in a CDN file works, and no escape is ever undone by a text replacement.
- Not done: character references in a `type` attribute, and an SVG `script`. Both only change the answer on a hand-crafted file, to a clean exit 2 or a document the boot script also finds.
- Declined after review: foreign content is not tracked. Inside `<svg>`, `title` and `style` are not raw text and `<![CDATA[` is real, so a hand-crafted SVG can hide a document from `extract` or show it one the browser lacks. Tracking that needs tree construction, and a file the CLI writes has no `svg` outside its JSON.
- Rationale: a text search would be wrong on the CLI's own output, for a document that merely mentions a script tag.
- Spec sections: §10.1, §10.2, §11.1, §15.1.

## VD-106 — Stdin and closed pipes
- Date: 2026-11-05 · Task: 12
- Context: each must do something defined, and an agent's shell usually has a terminal on stdin.
- Decision: a TTY stdin is a usage error, for `-` as well as for no file, because waiting there hangs an agent forever. A closed stdin reaches Node as `/dev/null`, so it behaves as an empty one, which is a parse error at line 1, exit 2. Reading stops one byte past the limit, so a huge input costs no memory. `EPIPE` on stdout is the reader's choice: nothing is printed and the exit code stays what the command computed, so `vui validate bad | head` is still a failure of `validate`. Any other stdout error is exit 5. `bin` sets `process.exitCode` and never calls `process.exit`, so a large write drains. Input that is not valid UTF-8 exits 2, since U+FFFD in its place would alter a document silently, and a Latin-1 or UTF-16 file then fails with a clear message. A directory on stdin is exit 5, as it is by path. `--out -` means stdout.
- Rationale: nothing hangs, nothing prints a stack, and no result changes meaning because of who is reading.
- Spec sections: §11.1, §11.4, §16.

## VD-107 — What reaches a terminal
- Date: 2026-11-05 · Task: 12
- Context: `Diagnostic.path` is raw (VD-041), and `JSON.stringify` leaves C1 controls raw, where U+009B is a terminal's CSI.
- Decision: `safe` escapes `\p{Cc}`, `\p{Cf}`, `\p{Zl}` and `\p{Zp}` in every human line that holds input-derived text, including a bidi control, which would misreport a location. VD-057's pass-through covers rendered text, not locations. `safeJson` also writes U+007F to U+009F as `\uXXXX`, on `--json` and `extract`. The value is the same. U+2028 and U+2029 stay raw there, so `extract` prints exactly `JSON.stringify(canonical)` for any document without C1 controls. `render --format md|text` already passes `cleanValue`. HTML output can be stdout, so `embedJson` writes U+0080 to U+009F as JSON escapes too, and the value is the same.
- Declined after review: escaping `\p{Cf}`, `\p{Zl}` and `\p{Zp}` in `safeJson`. It would break byte equality for ordinary text, since every joined emoji holds U+200D, and VD-057 already rules bidi outside §15.1's threats. A C1 control differs: it acts on the terminal, where those only change how text looks.
- Rationale: an escape keeps the information and takes away the effect.
- Spec sections: §11.3, §13.2, §15.1.

## VD-108 — The visual file
- Date: 2026-11-05 · Task: 12
- Context: §10.1 fixes the layout, and §15.1 lists what to escape in the embedded JSON. `<title>` and the generator `<meta>` are HTML contexts.
- Decision: `</` becomes `<\/`, `<!--` becomes `<!--`, and the two separators become ` ` and ` `. All are JSON escapes, in one pass with a replacer function on serialized JSON, and everything else is plain concatenation, so `$&` is inert. `<title>` runs `cleanText` and then entity escaping, with `vadd-ui` when there is no title or a mistyped one, which only warns. `<html lang>` is the language subtag of `locale`, 2 or 3 letters, or else `en`: the default gives §10.1's literal `lang="en"`, and a Ukrainian document is not declared English (§15.2). `--cdn` writes §10.2's template, byte for byte. The 500 KiB limit applies to every `render` format, stdout included, measured on the final bytes, and it is separate from §13.4's 256 KiB on the document. `--out` does not create directories, so a missing one is exit 5, as §11.4 says.
- Rationale: each context gets its own escaping, and no value is ever read as a pattern.
- Spec sections: §10.1, §10.2, §11.4, §13.4, §15.1, §15.2.

## VD-109 — Stamping
- Date: 2026-11-05 · Task: 12
- Context: §17.2 says `meta` records which renderer was inlined. A document can carry its own `meta`, and the stamp adds bytes after `validateText` has measured.
- Decision: `prepare` is the one path from text to a stamped document, used by `validate` and `render`, so neither passes what the other refuses. `meta.generator` is `vadd-ui` and `meta.version` is `@vadd/ui`'s version. They replace a document's claim, and other keys stay. A `meta` that is not an object only warns, and is replaced, since a string would spread into characters. The stamped form is measured again against `LIMITS.inputBytes`, so an `extract` output always validates. `generatedAt` comes from an injected clock, which is `Io.now`, not a flag, and applies only to an absent key.
- Rationale: a stamp a document can forge records nothing.
- Spec sections: §5.2, §13.4, §17.2.

## VD-110 — `catalog` lives at `@vadd/ui-spec/catalog`
- Date: 2026-11-05 · Task: 12
- Context: the data belongs in `ui-spec`, and the bundle had 559 bytes of gzip margin.
- Decision: a second entry that `index.ts` does not import. Field names, types and presence come from `SHAPES` and defaults from `COMPONENT_DEFAULTS`, so they cannot drift. The group, the §6 purpose and a minimal example are written by hand, and a test validates each example with zero diagnostics. Unlike the schema, this entry shows sub-shapes such as `Column` flat, and tags chart fields with their kinds. `suggest` is exported from this entry too, so the CLI needs no second edit distance. In the bundle, the catalog adds 0 bytes.
- Rationale: an agent's reference must not cost a browser anything.
- Spec sections: §9.5, §11.1, §12.

## VD-111 — `ui-text` output changes from VD-096
- Date: 2026-11-05 · Task: 12
- Context: the two gaps between renderers VD-096 left for this task.
- Decision: `ui-text` now follows the DOM. A `tree` with no item in `items` prints `paths`, through a shared `treeSource`. A date-only `timeline.at` prints as written, through a shared `isIsoTime`. Six corpus snapshots changed, each from `Nov 4, 2026, 12:00 AM UTC` to `2026-11-04`. The readers cost 19 bytes of gzip.
- Rationale: two renderers, one reading.
- Spec sections: §6.5, §7.

## VD-112 — What identifies a stored document
- Date: 2026-11-06 · Task: 13
- Context: §4.1's header has `id`, `createdAt`, `cwd` and `branch`. None is in the §5.2 envelope, and the POST body is only a canonical document, so the spec leaves their source open.
- Decision: `id` is the file stem, `<seq>-<slug>`, assigned by the server. `createdAt` is the server's clock and is set as the file's mtime, so a restart reads the same value and the file stays a pure canonical document. `cwd` and `branch` are read from `meta.cwd` and `meta.branch`, which task 15 must write; a non-string gives `null`, as does a non-string `title`. `slugify` is §11.5 read literally, exported for task 15, so `Звіт` gives `v--`. A request's id only ever meets the in-memory index, never a path.
- Alternatives: `X-Vui-*` request headers for `cwd` and `branch`, which every custom endpoint would have to implement and which the §4.1 body text does not mention; a sidecar file, which adds to §4.1's list of contents.
- Rationale: §5.2 leaves `meta` open and the renderer ignores it, and one file holds all that must survive a restart.
- Spec sections: §4.1, §5.2, §11.5.

## VD-113 — SSE heartbeat is a comment
- Date: 2026-11-06 · Task: 13
- Context: §4.1 lists `doc`, `hello` and "heartbeat every 15 s", with backticks on the first two only.
- Decision: the heartbeat is the comment `: heartbeat`. `doc` carries `id: <seq>`, so the browser sends `Last-Event-ID` by itself. `hello` carries no `id`, and it comes first, then any replay, then live events. A non-numeric `Last-Event-ID` replays nothing. Replay is capped at 500, which retention also caps.
- Alternatives: a named `heartbeat` event, which needs a listener to do nothing.
- Rationale: `EventSource` ignores a comment and it still keeps the connection alive. Task 14 can add a staleness check from `error` events.
- Spec sections: §4.1.

## VD-114 — Rotated tokens and §16.1's reconnect — needs tasks 14 and 15
- Date: 2026-11-06 · Task: 13
- Context: §15.3 says tokens rotate on every start "so old URLs stop working". §16.1 says that after killing the Viewer and showing again, "the open page reconnects". An open page holds the old read token, so both cannot hold.
- Decision: this task follows §15.3, as its acceptance says, so an open page gets 404 after a restart. Task 14 should treat a 404 from `api/docs` or `api/events` as "this Viewer is gone", stop backing off and say so. Task 15's show then sees `clients: 0` and opens a fresh pane, which is how §16.1's cell gets a live page. That reading of §16.1 is theirs to confirm against a real pane.
- Alternatives: keep the read token across restarts, which breaks a stated §15.3 control and this task's acceptance.
- Rationale: the security control is explicit; the scenario is met by the pane the CLI opens.
- Spec sections: §15.3, §16.1.

## VD-115 — The visual file moves to `ui-viewer`
- Date: 2026-11-06 · Task: 13
- Context: `GET /docs/<id>.html` needs `inlineHtml`, which task 12 put in `ui-cli`, and §3 has `ui-cli` depending on `ui-viewer`, not the reverse.
- Decision: `html.ts` moves unchanged to `ui-viewer/src/visual-file.ts`, with its tests, `readBundle` and `GENERATOR`, and `ui-cli` imports them. `check-forbidden-apis` now scans the file, and it passes.
- Alternatives: injecting a renderer into the handler, which every host would have to repeat; a copy, which can drift on an escaping rule.
- Rationale: one escaper, on the side of the dependency edge that §3 allows.
- Spec sections: §3, §10.1.

## VD-116 — HTTP details the tables leave open
- Date: 2026-11-06 · Task: 13
- Context: §4.1 and §15.3 name the routes and limits, not most status codes or the list shape.
- Decision: a bad `Host` is 403 and comes before everything, `/health` and `/favicon.ico` included. Every miss is the same 404 body, `/v/<token>` without a slash included. A known path with a wrong method is 405 with `Allow`, only behind the token, so `OPTIONS` gets no CORS answer. POST: 201; 401 with `WWW-Authenticate`; 429 with `Retry-After: 1`; 413 by declared length or while reading; 400 for bytes that are not UTF-8; 422 `{ok: false, diagnostics}` for anything `validateText` refuses, unparsable text included. A refused request does not consume the rate budget unless it held the write token. Past 50 streams: 503 with `Retry-After`. `GET /api/docs` is `{docs: [...]}`, ascending, `after` exclusive and default 0, `limit` default 100, range 1–500, 400 otherwise. `GET /api/docs/<id>` is `application/vui+json`. Every response has `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`, because the URL holds a token. The server stores what `validateText` returns, so a relaxed body comes out canonical; `url` in the POST reply is the feed URL.
- Alternatives: 421 for a bad host; reading the health and favicon routes as exempt, which §4.1's "rejected" does not allow.
- Rationale: one predictable answer per failure, for task 15's CLI and task 18's contract suite.
- Spec sections: §4.1, §13, §15.3.

## VD-117 — Store and process details
- Date: 2026-11-06 · Task: 13
- Context: §4.1 fixes the store's shape but not how it fails or how a process starts.
- Decision: the store is synchronous, because at ≤ 20 writes/s of ≤ 256 KiB one tick keeps "number, write, index, evict" atomic with no queue. Files are written to a temp name and renamed, 0600 in 0700 directories. At load, a name that does not match is ignored, and an unreadable file is skipped with a warning naming it, though its number is never reused. Retention also runs at load. `bind` accepts `127.0.0.1` and `0.0.0.0` only. `VUI_PORT` is that port or a failure, with no fallback. `Host` stays loopback-only under `0.0.0.0`, so a published container port must keep its number (§15.3). `startViewer` refuses if `viewer.json` names a live pid whose `/health` reports this workspace, and otherwise replaces the file; close removes it if this pid still owns it. The entry is `@vadd/ui-viewer/viewer.js` with `--bind` and `--workspace`, for task 15 to spawn or wrap. All its output goes to stderr, so task 15 must point stderr at `viewer.log` too. A log line never holds a token or a document. Two starts in the same instant can still race, since §4.1's directory has no lock; task 15 owns starting. `Retry-After`, `workspaceOf` by walking up to `.git` without running git, and `ui-viewer`'s 95% coverage gate follow from this.
- Rationale: simple, and every failure leaves a state the next start can read.
- Spec sections: §4.1, §15.3.

## VD-118 — Task 13 review: fixed findings and declined ones
- Date: 2026-11-06 · Task: 13
- Context: a fresh review, with live probes and 30 source mutations, found no critical defect and no §15.3 hole. It reproduced four important defects: a failed `viewer.json` write left a listening process with no idle exit; a pipelined `GET /api/events` stayed counted after its socket died, since a queued response has no socket and never emits `close`; a 413 with unread body bytes could arrive as a reset; and the test suite failed about one run in fifteen, through that reset and through `freePort` handing back an ephemeral port another test could take.
- Decision: all fixed, with tests. `startViewer` closes the server if the write fails. The hub watches `req.socket`. `readBody` drains up to 1 MiB before answering 413, and past that the answer comes from the headers alone with `Connection: close`, where a reset is still possible; §11.4 has the CLI refuse such a document before posting. `freePort` picks below the ephemeral range. Also fixed from the minor list: the rate budget is spent when the body has arrived, so a held-open request cannot store outside its second; a clock stepping back no longer shuts the window; `cwd` and `branch` in a header are clipped to 2,000; a client over 1 MiB of unread output is dropped; `slugify` prefixes before trimming, so a slug is always ≤ 48 (§4.2); busy ports no longer pile up `listening` callbacks; a crash's `.tmp` file is removed at load; `readBody` rejects a body that a host already consumed, rather than hanging. Tests added for the state directory's mode, the `Content-Length` path, and a dead pid with a live `/health`. `RunningViewer.address` is now what the socket reports.
- For task 18: Fastify's default parser consumes the body, so hijack in `onRequest` or add a passthrough parser. Otherwise POST answers 500.
- For task 14: an `EventSource` replay and an `after=` fill can return the same document, so dedupe by `seq`. A first connection gets no replay, so open the stream before the first fetch.
- For task 15: match the readiness line `Viewer listening on port`, and treat stderr as free text.
- Declined: temp-plus-rename has no test, since only a crash shows the difference and the store is otherwise atomic within a tick. `idle.stop()` on close survives mutation, because the timer is unref'd and `close` is idempotent. A Windows-reserved port giving `EACCES` ends the port search instead of moving on; it needs a Windows host, so task 21 checks it.
- Rationale: the fixes are small and each failure was reproduced. The declined items cannot affect a user on the platforms this task runs on.
- Spec sections: §4.1, §4.2, §15.3.

## VD-119 — The feed app's packaging
- Date: 2026-11-06 · Task: 14
- Context: VD-019 left the browser app's config to this task. §3 gives `ui-viewer` an edge to `ui`, not `ui-render`.
- Decision: browser code lives in `packages/ui-viewer/src/app`, typed by `tsconfig.app.json` (browser target, `noEmit`, run by `pnpm typecheck`), and excluded from the package's Node config. It imports `render` and `stylesheet` from `@vadd/ui`. `build-bundle.mjs` bundles it to `dist/app.js` after `@vadd/ui`, and `pnpm check` scans that file. `DocHeader` moved to `doc-header.ts`, which imports nothing and which both configs compile. `placeholderFeed` is gone: `feedHtml` is a constant, and the handler reads `dist/app.js` on the first `GET /app.js`, so `GET /` never depends on the build.
- For task 15: `app.js` must stay beside `feed.js`. A CLI that re-bundles `viewer.js` has to copy it or pass `feed`.
- Rationale: one type, and a package table that still matches §3.
- Spec sections: §3, §4.1, §15.3, §17.4.

## VD-120 — The feed owns its reconnection
- Date: 2026-11-06 · Task: 14
- Context: §4.1 asks for backoff, and `EventSource` has none: it retries at its own pace, and not at all after a non-200. It also hides the status, which VD-114 needs.
- Decision: on `error` the app closes the source and reconnects itself after 1, 2, 4, 8, 16, then 30 s, reset by a completed fill. `Last-Event-ID` replay is therefore unused and `after=` is the only gap filler. `hello` starts every fill, which is stricter than VD-118's "open first": the hub writes it and registers the client in one tick. Only a fill moves `lastSeq` past a gap: a `doc` during a fill marks it dirty and the fill reads again, so a failed page leaves no hole. After a loss, one `GET api/docs?after=<lastSeq>&limit=1` tells the cases apart: 404 is gone and everything stops; anything else backs off.
- No answer at all keeps retrying at 30 s forever. The token cannot return after a restart, but a suspended machine looks the same and does return. Only a 404 proves the Viewer is gone, and a dead port costs one request every 30 s.
- Rationale: one path for every failure, and all of it testable with fakes.
- Spec sections: §4.1, §15.3, §16.1.

## VD-121 — Feed details §4.1 leaves open
- Date: 2026-11-06 · Task: 14
- Context: a store holds up to 500 documents, the entry and the document each have a title, and `:root` cannot match in a shadow root.
- Decision: a batch opens only its last 10 entries, and older ones arrive folded and read their document on the first open; a live document always opens. The shadow stylesheet hides the document's `.vui-title`, and a header left empty, since the entry prints the title; a browser without `:has` only keeps a small gap. `<body>` is a `.vui-root`, so the chrome reads the §8.1 tokens and no palette is copied. The theme is written on every root by script, because the OS rule cannot reach a shadow root (VD-007). Outside links open in a new tab through `linkHandler`, since the feed has no way back. `#id` links scroll inside their shadow root, which closes the gap VD-100 left for this host, and prevent the default, which would only change the URL. Following is pinned after each entry and each document, never from a resize, so unfolding inside a document does not jump the page.
- Not done: a reader's scroll that lands in the same frame as a new document can be pinned back once, since the `scroll` event comes a frame later. The page keeps entries for documents that retention has evicted; opening one says it could not be loaded. No cap on entries in a long-open page. No "jump to latest" control.
- Rationale: the first load stays fast, and each choice is reversible.
- Spec sections: §4.1, §8.1, §8.2, §9.3.

## VD-122 — Task 14 review: fixed findings and declined ones
- Date: 2026-11-06 · Task: 14
- Context: a fresh review, with real Chromium runs and 48 source mutations, found no critical defect and no XSS or navigation path. It reported five important findings: a pinned table cell painted over the sticky bar; keyboard focus could land fully under the bar; "Live" outlasted a stopped Viewer and a read that never ended stopped the machine; a copy result and a load failure were not exposed to assistive technology; several tests could not fail.
- Decision: all fixed, each with a test seen failing first, and the CSS tests also by removing the rule. Each body has `isolation: isolate`. `<html>` has `scroll-padding-top` from the bar's measured height, kept current on `resize` and on a status change, which also replaces `scroll-margin-top` for `#id` targets and so covers a wrapped bar. Every read gives up after 10 s. While live, a probe runs every 30 s, which amends VD-113's "staleness check from `error` events", since a stopped process raises none. The cost is one loopback request per tab per 30 s, and a probe is not a client, so it does not affect idle shutdown beyond what the open stream already does. `.feed-note` has `role="alert"`; the copy button has `aria-live="polite"`, as a code block's does. Stale-source, fallback, `drawn` and probe tests were rewritten so a mutant fails them.
- Minors fixed: `.feed-status` has no default margin; the status is not rewritten for an unchanged state, so a live region does not repeat each retry; the copy label's timer is cleared on a second click; the failure note goes when an entry folds; a reader opening an old entry no longer pins a following page.
- Declined, as minors: "Copy failed" replaces §9.3's "Select text to copy", because the feed's copy holds a document that is not on screen as text, so there is nothing to select (DEVIATION). A first copy of a folded document runs after a network read, which can lose user activation; Chromium allows about 5 s, and Safari may refuse it (not tested; only Chromium is installed), which shows "Copy failed", and a second click works since the text is then kept. A connection dying right after every fill retries at 1 s, which on loopback costs nothing. "No visuals yet" stays beside a gone status, which is still true. A failure note stays after a copy succeeded, until the entry is folded. Backoff is not jittered: one reader, one server.
- For task 15: each tab holds one stream, and HTTP/1.1 allows six connections per host, so a seventh feed tab waits on "Connecting…" and can stall reads in the others. Opening one pane per Viewer, as §4.1 has it, stays clear of this.
- Rationale: the fixes close AA gaps and an honesty gap in the status; the declined items are rare, cosmetic or free on loopback.
- Spec sections: §4.1, §9.3, §15.2.

## VD-123 — Host routing and `show`'s flags
- Date: 2026-11-06 · Task: 15
- Context: §4.0 names three hosts and task 16 builds two. §11.1 lists `--name` and `--no-open` without saying what they do on the Viewer, and §11.2 has no line for an untitled document.
- Decision: `selectHost` is §4.0 in full, and `show.ts` holds a partial adapter table that task 16 fills. Until then an explicit `--host orca-chat` or `--host file` exits 4, and `auto` that selected `orca-chat` goes on to the Viewer, which is §4.0's next step. `--host file` needs `--dir` and `--dir` needs `file`, exit 2. Validation runs before any host is touched, so exits 1 and 2 start nothing, and neither does a limit on the document or its stamped form. `--title` replaces the title before the size check; a title over `LIMITS.string` is only caught by the Viewer's 422, which exits 3 after a Viewer has started. `--name` is §11.5's file name, so the Viewer host accepts and ignores it. `--no-open` reads as "without Orca": no pane, and the URL line if it is due. An untitled document prints `vui: shown untitled (#3) in viewer`. `meta.cwd` and `meta.branch` go only through the Viewer adapter, so `render` output and task 16's files hold no local path. They replace a document's claim as VD-109 does, and a branch that cannot be read removes the key. The branch is read from `.git` without running git, as `workspaceOf` does, and a detached head gives 12 hex characters. A POST goes to `127.0.0.1`, not `localhost`, since the Viewer binds no `::1` (VD-128).
- Not done: `/docs/<id>.html`, "for saving or sharing", embeds `meta.cwd`, so a shared file shows a local path. §4.1's header needs it stored, and the feed is local.
- Rationale: the seam costs one table, and task 16 changes no routing.
- Spec sections: §4.0, §4.1, §5.2, §11.1, §11.2, §11.5.

## VD-124 — `viewer.lock`, and how a Viewer starts
- Date: 2026-11-06 · Task: 15
- Context: VD-117 left the two-starts race to this task. Two Viewers on one state directory would number documents separately and overwrite each other's files, so converging afterwards is too late: only one may ever start.
- Decision: `viewer.lock` is created with `wx` and holds the pid. Its holder starts the Viewer; everyone else polls `liveViewer` every 25 ms for up to 10 s. A lock is stale when its pid is dead, or after 15 s, since a pid can be reused. The holder checks again after taking it. The file is transient and adds to §4.1's list of contents only while a start runs. The CLI spawns `@vadd/ui-viewer/viewer.js` as resolved from the package, so `app.js` stays beside `feed.js` (VD-119), detached, with stdout and stderr appended to `viewer.log` (0600). Readiness is the VD-118 line in what this start wrote, then `liveViewer`. A child that exits fails at once with the log's last line, and 10 s without readiness kills it. An unusable state directory exits 5 (§11.4), and every other start failure exits 4 with the cause. A connection refused on POST goes round `ensureViewer` once. `stop` signals only a pid `/health` has proved: SIGTERM, 3 s, SIGKILL, then the file goes if it remains. Stopping nothing is exit 0. `open` starts a Viewer if needed; `url` does not, and exits 4.
- Not done: two processes taking over one stale lock in the same instant can both start. It needs a holder crashing mid-start and then two shows within a millisecond, and Node has no `flock`. A Viewer stopped with `SIGSTOP` fails `/health`, so the next show starts a second one on the same directory, and `stop` cannot prove the old pid to kill it.
- Rationale: 5 simultaneous real `vui show` calls give one `Viewer listening` line and 5 distinct numbers, on 5 runs of 5.
- Spec sections: §4.1, §11.4.

## VD-125 — One pane, and VD-114 confirmed
- Date: 2026-11-06 · Task: 15
- Context: a page takes a moment to connect, so a second show right after the first sees `clients: 0` and §4.1 read literally opens a second pane, which §16.1 and VD-122 forbid. VD-114 asked this task to check §16.1's "the open page reconnects" against a real restart.
- Decision: `viewer.json` also holds `browserPageId` and `urlShown`, both written by the CLI through `updateViewerInfo`, which writes only if the file still names that pid. On `clients: 0` a show takes the lock without waiting; if it is held, another show is doing this. With a known pane it runs `tab list`: a tab at this Viewer's URL is kept, so `clients: 0` with a loading pane opens nothing. A tab at the killed Viewer's URL is moved with `goto`. Anything else, or a failed list, runs `tab create`. A tab the reader took to another URL is left alone. A failed call is one stderr warning and the URL line, and delivery stands (§17.3). The URL line prints when no pane exists, nobody is connected and `urlShown` is unset, so once per start. **Amended by VD-141:** `urlShown` is gone, and the line prints on every such show.
- **VD-114, real run on 2026-11-06, Orca 1.4.248, WSL mirrored:** after `kill -9` the old page reports "This Viewer has stopped", and the old URL stays dead (§15.3). The next `vui show` took 2.1 to 4.5 s, on two runs, kept the same `browserPageId`, moved it to the new URL, and the page came up `live` with all 9 documents; the next show saw `clients: 1`; `tab list` still showed one tab. This meets §16.1 more faithfully than VD-114's "a fresh pane": the open pane comes back, and tokens still rotate, because the CLI that can read `viewer.json` tells it where to go. It works because `viewer.json` survives a kill.
- Not done: after `vui viewer stop` or an idle exit the file is gone, so the pane id is too, and the next show opens a new pane beside the dead one. A dead page stops its traffic (VD-120), so VD-122's limit is not at risk. A system browser has no `goto`, so there the old page stays stopped and the new URL line is the way back: task 21's outside-Orca cells should read §16.1 that way.
- Rationale: no new state file, and §15.3 keeps its meaning.
- Spec sections: §4.1, §15.3, §16.1, §17.3.

## VD-126 — Custom endpoint
- Date: 2026-11-06 · Task: 15
- Context: §4.1 and §4.4 give `VUI_VIEWER_URL` and `VUI_VIEWER_TOKEN` one sentence each, and all routes sit under the token prefix.
- Decision: `VUI_VIEWER_URL` is the base with any prefix, so POST goes to `<base>/api/docs`. The bearer header is sent only when the token is set. `/health` is read at the origin, as §4.1 has it. A URL that is not http or https exits 4. No Viewer starts and no state is written. No pane opens, since a page id has no `viewer.json` to live in and the VADD dashboard is its own surface; `clients: 0` prints the reply's URL each time, for the same reason. `viewer start` and `stop` exit 2, since there is no process, and `status`, `url` and `open` use the endpoint.
- Rationale: the smallest reading that lets task 18's server take the place of the Viewer.
- Spec sections: §4.1, §4.4.

## VD-127 — Doctor
- Date: 2026-11-06 · Task: 15
- Context: §11.1 lists what `doctor` reports, not its statuses or exit code, and the Windows check needs a port when no Viewer runs.
- Decision: each check is `ok`, `info`, `warn` or `fail`, one line each, with `fix:` under anything that has one. Any `fail` exits 4. Orca being absent is `info`, since the URL line works. A Viewer that is not running is `info`, and `doctor` does not start one: the Windows check aims at a throwaway loopback server instead, so it runs either way. No PowerShell found is `warn`, because it proves nothing. The check is the same under NAT and mirrored; `wslinfo --networking-mode` only picks the fix: `localhostForwarding` under NAT, the Hyper-V firewall rule under mirrored, both when unknown. `/mnt/c/Windows/...` is tried after `PATH`, for `powershell.exe` and `explorer.exe`, because this machine keeps Windows off `PATH`. `explorer.exe` exits 1 on success, so a launch counts. SSH opens nothing and prints the URL (§4.0).
- Tested: the NAT cell cannot run here, so it is tested with fakes only. `vui viewer open` has not been run against a real browser, since it would open one on the user's desktop; it has fakes and task 21's release check. Native Windows paths (`.cmd` through `cmd.exe`, `start`) are fakes too.
- Rationale: `doctor` must answer on a machine where nothing has run yet.
- Spec sections: §4.1, §11.1, §16.1.

## VD-128 — Windows reaches `localhost` slowly on mirrored networking
- Date: 2026-11-06 · Task: 15
- Context: the first real `doctor` run reported a failure after 20 s. By hand, the same command printed `200`, in 21.3 s, twice, while PowerShell itself starts in 0.4 s. `Invoke-WebRequest http://localhost` tries `::1` first, nothing listens there since §15.3 binds `127.0.0.1` only, and the connection takes about 21 s to give up before it falls back.
- Decision: the §11.1 command stays as written, the timeout is 45 s, and the line says how long it took. `doctor` takes about 21 s here. Chromium does not suffer: the Orca pane falls back at once, as the measured delivery shows.
- Alternatives: binding `::1` too, which §15.3 forbids; probing `127.0.0.1`, which would pass where `localhost` fails, and that is what the check exists to find.
- Rationale: the reachability answer is right, and a slow answer beats a wrong one.
- Spec sections: §4.1, §11.1, §15.3.

## VD-129 — What "≤ 1 s" measures — DEVIATION on the first pane
- Date: 2026-11-06 · Task: 15
- Context: §16.1 asks that a document appears in the pane within 1 s, and `orca tab create` alone takes 0.9 to 1.9 s here.
- Decision: the budget holds for an open pane, which is the case the CLI controls. Measured on a real Orca pane, WSL mirrored, with the two clocks synchronized to 2 ms and a `MutationObserver` in the feed: 66 to 88 ms from the CLI's spawn to visible, over two runs of seven shows. The first show of a Viewer, with no pane yet, read its document 1,046 to 1,068 ms after the CLI started: the CLI and the Viewer take about 170 ms and the rest is Orca creating the pane. That one is over budget, and only Orca can change it. Task 21 should report both numbers per cell.
- Rationale: nothing in the CLI can shorten a call to another process, and the spec's first-run path goes through that call.
- Spec sections: §9.5, §16.1, §17.3.

## VD-130 — Task 15 review: fixed findings and declined ones
- Date: 2026-11-06 · Task: 15
- Context: a fresh review, with real processes and stubs, found no critical defect and five important ones, four of them reproduced by the reviewer and all reproduced here by a failing test.
- Decision: all fixed, each with a test seen failing first. This amends VD-124 and VD-125. (1) `showPane` could hold one lock past its staleness, a release could then remove another show's lock, and a pane call could block a start: the pane now has its own `pane.lock`, staleness is 45 s, past three Orca calls, and a lock holds a random owner that release checks. (2) A command ignoring SIGTERM held the CLI open past `exec`'s timeout: it now gets SIGKILL and `unref`. (3) A state directory turning unwritable after the POST exited 5 for a stored document, and a retry stored it twice: everything after the POST now ends in a warning. (4) A Viewer stalled past `/health`'s 1 s read as dead, so a show started a second one on the same directory and `stop` orphaned the first: `viewerState` now tells `stalled`, a timeout, from `none`, a refused port. A show waits 5 s, then exits 4 and names `vui viewer stop`. `status` and `doctor` report it. `stop` uses SIGKILL, since a stopped process runs no SIGTERM handler. This replaces VD-124's "Not done" on `SIGSTOP`; run for real with `kill -STOP`. (5) The §15.3 warning for `--bind 0.0.0.0` reached only `viewer.log`: it now goes to stderr and to `warnings` in JSON, and `--bind` on a running Viewer says it was ignored.
- Two more found while fixing. A stalled state signals a pid `/health` has not proved, so `stop` reads `/proc/<pid>/cmdline` where it exists and leaves a process that is not `viewer.js` alone; on macOS and Windows the file stands. `stop` returned when the port closed, with the process still exiting, which failed a test under load and could overlap a new start on the store: it now waits for the pid.
- `startViewer` still refuses only a proved `/health` (VD-117), since a hung stranger on the port looks like a stall. The CLI is what starts a Viewer, so the guard lives there, and `viewer.js` run by hand over a stalled Viewer can still share its directory.
- Deferred, as minors: a `--title` over the limit starts a Viewer before its exit 3. A custom endpoint's malformed 422 exits 5 rather than 4. An unwritable `docs/` reaches the CLI as a 500, so exit 4 and not §11.4's 5; a task 20 hardening item. A POST timeout goes round once, so a very slow Viewer can store a document twice. After `--no-open` printed the URL, a later Orca failure prints none (closed by VD-141). `previous` lives only in the show that starts the Viewer, so a kill followed by `vui viewer start` or a `--no-open` show loses the pane, and the next show opens a second one.
- Rationale: the fixes close a duplicate delivery, a hang and a split state directory. The minors cost a line of output or an extra pane.
- Spec sections: §4.1, §11.4, §15.3, §17.3.

## VD-131 — The Orca contract: where it lives and what it was read from
- Date: 2026-11-06 · Task: 16
- Context: VD-009 places `host/orca.ts`, §17.3 pins it to a version, and the bundle has 528 bytes of margin.
- Decision: `@vadd/ui-spec/host/orca`, a second entry as in VD-110, which `index.ts` does not import. In the bundle it adds 0 bytes. It is pinned to tag `v1.4.248` (`c2f3bb6`), the installed Orca. `native-chat-visual-directive.ts` and the token file are the same at the tag, at `main` (`1ee8df1`) and at the vendored commit (`afac091`). The shell differs only in guest-theme code, and nothing pinned moved. `native-chat-visual-directive.ts` is now vendored too, so `e2e/orca-chat.spec.ts` compares every constant and runs Orca's real parser. The module holds a port of the parser for unit tests, and the e2e suite runs the two side by side on 20,000 fuzzed lines. `e2e/tsconfig.json` drops `noUncheckedIndexedAccess`: the vendored file indexes a match and cannot change.
- Rationale: a constant compared with its source cannot drift unseen, and §17.3's scheduled job can diff the same files.
- Spec sections: §4.2, §9.5, §17.3.

## VD-132 — The directive title
- Date: 2026-11-06 · Task: 16
- Context: §4.2 bans quotes, backslashes and control characters. Orca's grammar accepts `{` and `}` inside a quoted value, and measures in UTF-16 units.
- Decision: `directiveTitle` is the only way document text reaches the line. It runs `cleanText`, drops format characters and lone surrogates, and turns `"`, `\`, braces and whitespace runs into one space. It cuts at 120 units without splitting a pair, then trims. Braces go although Orca allows them: with none, a title cannot spell `::orca-visual{`. A title with nothing left omits the attribute, which Orca reads as optional. An untitled or mistyped-title document has no title attribute and is named `v-<hex4>.html`. `<title>` in the file keeps the original text with its own escaping.
- Alternatives: keep braces, which relies on every reader honoring quotes.
- Rationale: `stdout` is pasted verbatim, so the line must be safe whoever reads it.
- Spec sections: §4.2, §11.2, §15.1.

## VD-133 — File hosts: details §11 leaves open
- Date: 2026-11-06 · Task: 16
- Context: §11.2 has no output for `--host file`, §11.5 does not say what follows a trailing `-` or an empty slug, and §11.4 does not separate an unset variable from an unusable folder.
- Decision: `--host file` prints `vui: wrote <path> (<n> bytes)`, as `render --out` does. Slug: lowercased, each run outside `[a-z0-9]` becomes `-`, cut to 48, trailing `-` dropped, `v-` prefixed when it does not start alphanumeric, cut and dropped again. So `Тест` gives `v` and `!Hi` gives `v--hi`, the second literal to §11.5. Explicit `--host orca-chat` with the variable unset or empty exits 4; a folder that is missing or not writable exits 5, as `--dir` does; folders are never created. `auto` still goes to the Viewer on an unusable folder (§4.0). Files are written with `wx`, so a collision retries (16 tries, then exit 5) and a planted symlink is not followed. A failed write removes its own file. `meta.cwd` and `meta.branch` are removed from files, even when the document claims them (VD-123). `--json` has `host`, `file`, `path`, `bytes`, `title`, `viewer`, `diagnostics`, and `directive` on `orca-chat`.
- `--title` over `LIMITS.string` now exits 3 in `prepare`, before any host. A file host has no 422 to catch it, so a file could hold what `vui validate` refuses. This closes VD-130's deferred minor.
- Rationale: each case keeps to §11.4's meanings, and `wx` is the one call that is atomic.
- Spec sections: §4.0, §4.2, §11.2, §11.4, §11.5.

## VD-134 — "A running Viewer"
- Date: 2026-11-06 · Task: 16
- Context: §3 says the document is also posted to the Viewer "if one is already running", for `orca-chat`. The task's acceptance line sits under files generally.
- Decision: running means `findViewer` proves one for this workspace through `/health`, or `VUI_VIEWER_URL` is set, since that is the Viewer the user configured. Nothing starts and no pane opens. Both file hosts post, because the reason (the feed stays complete) holds for both. The file goes first. The copy gets `viewerOverrides`, so it carries `cwd` and `branch` and the file does not. After the file exists every failure (unreachable, 401, 413, 422, 5xx, a bad `VUI_VIEWER_URL`) is one `vui: warning:` line and exit 0, and `--json` reports it in `viewer.state` (`none`, `posted`, `failed`). A Viewer that is not running is silent. A file over 500 KiB exits 3 and posts nothing, as nothing was delivered. A hung Viewer delays the line by the 5 s POST timeout. The worst case is an endpoint that answers `429` just inside that timeout each time: 3 POSTs and 2 sleeps, measured at 16.5 s. A stopped local Viewer fails `/health` in about 1 s and counts as not running, so the feed misses that document silently. A folder needs `W_OK` and `X_OK` to count as writable.
- Rationale: §17.3's "delivery still succeeds" holds, and the agent's line is never lost to a courtesy.
- Spec sections: §3, §4.0, §11.2, §17.3.

## VD-135 — What the Orca shell proof covers
- Date: 2026-11-06 · Task: 16
- Context: Orca Chat UI and `::orca-visual` do not work in WSL on this machine.
- Decision: the proof is the vendored shell, in Chromium: real `vui show` files through Orca's own `buildNativeChatVisualDocument`, in a real sandboxed iframe, at 360, 720 and 1100 px, light and dark, and lines read by Orca's own parser. `render --cdn` runs through it with the CDN URL routed to the local bundle, so jsDelivr itself is not exercised, and `@vadd/ui@1` is not on npm yet. Unverified for task 21: the real transcript's file read and mounting, the directive during streaming, Electron's frame registration, and macOS and Windows WebViews.
- Rationale: stated so that a passing suite is not read as a checked chat.
- Spec sections: §4.2, §16, §16.1.

## VD-136 — What "≤ 1,800 tokens" is measured with
- Date: 2026-11-06 · Task: 17
- Context: §14.2 caps `SKILL.md` at 1,800 tokens and §14.3 wants Anthropic's counting API, or a pinned offline tokenizer when no key exists. No key exists here, and Anthropic's tokenizer is not public. Anthropic's glossary, read on 2026-11-06, says Claude 4.7 and later give about 30% more tokens than earlier models, on which a token is about 3.5 English characters. So a plain `cl100k_base` count would under-report on the models that read this file.
- Decision: the whole file, frontmatter included, gets the larger of two estimates: `cl100k_base` tokens × 1.3 (`js-tiktoken` 1.0.21, pinned exact, dev only, in `skills/vadd-ui`) and characters × 1.3 / 3.5. The first sees how dense JSON is; the second rests on the published figures alone. The gate is ≤ 1,710, a local choice of 5% under the budget, taking the size of §14.3's regression allowance but not its meaning. `skill.test.ts` fails above it, shown on an over-budget text. Measured on 2026-11-06: estimate 1,706, from 1,312 `cl100k_base` tokens (× 1.3 = 1,706) and 4,572 characters (× 1.3 / 3.5 = 1,699). That leaves 4 tokens of slack, so any addition to the skill needs a cut.
- Relation to real tokens: this is an estimate, not a count. Nothing here measured a real model. The ×1.3 on `cl100k_base` assumes earlier Claude models tokenize about like `cl100k_base`, which is unproven, and 3.5 is a figure for English prose, so it reads low on JSON. The 5% is the only margin beyond the published factor, so a real count could land above 1,800 if `cl100k_base` under-reports earlier models by more than that.
- Follow-up: task 19 owns §14 and its API path. It should run `SKILL.md` through the counting API when a key exists, and move this gate to a real count. `js-tiktoken` is available for its offline path.
- Rationale: the budget stays a test now, and it uses the larger of two estimates instead of the plain count. The plain `cl100k_base` count, 1,312, is well under budget; the 1.3 factor is what makes it tight.
- Spec sections: §12.1, §14.2, §14.3.

## VD-137 — The skill's wording and its additions to §12
- Date: 2026-11-06 · Task: 17
- Context: §12.2 and §12.3 are already written as instructions, and §12.2 leaves some real cases open. The budget leaves little room.
- Decision: spec sentences stay word for word, so a test can hold them exactly; only a sentence about the skill changes ("Never branch on…"), and `(section N)` references go. Added, each with a clause in the test: "paste it verbatim" (§11.2); the `vui: open <url>` line goes to the user, who may never see tool output (§11.2, VD-125); exit 3 cuts the data and retries once, exit 5 answers in markdown (§11.4; §12.2.4 names neither); `</` is written `<\/` in the hand-written template (§10.1); file names and titles obey §4.2; the tail of long output (VD-096); explicit `columns` for year-like keys (VD-026).
- Not said, for budget: stderr warnings, since exit 0 already leads to behavior 5; that a bare array is a document; that input is relaxed JSON, which the example shows. An unquoted `2024:` key is a parse error, so VD-026's reordering needs a quoted key; the rule is worded for both.
- Rationale: an agent reading exit 3 or `vui: open` with no instruction would stall or drop the only way to the page.
- Spec sections: §4.2, §10.1, §11.2, §11.4, §12.2, §12.3.

## VD-138 — One example is the cheat-sheet; the fallback is the one environment read
- Date: 2026-11-06 · Task: 17
- Context: §12.1 wants a component cheat-sheet, and every example must validate. §12.2.1 forbids branching on Orca mode, while §12.2.6 reads `ORCA_CHAT_SCRATCH_DIR`. §10.2's template holds a `{ … document … }` placeholder, which is not a document.
- Decision: one `vui show` heredoc shows 9 types in one valid document, and a list names the rest, so a per-component list is not needed. The list of statuses, tones and formats must equal `STATUSES`, `TONES` and `FORMAT_NAMES` exactly. §12.2.6 is not a host choice: it answers a missing CLI, and `vui show` is not there to decide. The test allows the variable in that one sentence. The template in the skill holds a small real document where §10.2 has the placeholder; its first two lines match §10.2 byte for byte.
- Rationale: the same document teaches and proves, and costs the fewest tokens.
- Spec sections: §10.2, §12.1, §12.2.

## VD-139 — `writing-skills` baseline runs are left to task 21
- Date: 2026-11-06 · Task: 17
- Context: `superpowers:writing-skills` asks for agents run without and with the skill. Its frontmatter advice ("Use when…", no summary of what it does) also conflicts with §12.1's exact text.
- Decision: §12.1's text stands, since the spec comes first. Baseline runs are task 21's agent eval (§16, 40 prompts); this task does one live check that Claude Code finds and follows the installed skill, in a temporary project. The worker preamble also rules out helper agents unless the task asks.
- Rationale: a few samples here would not prove what the eval proves, and §16 already owns it.
- Spec sections: §12.1, §16.

## VD-140 — Review rulings, and a Viewer gap for a later task
- Date: 2026-11-06 · Task: 17
- Context: the review found two test gaps and one real gap for the reader.
- Decision: host neutrality now also holds every conditional sentence to a closed list of conditions on `vui`'s outcome, because a ban list of words misses a branch written in other words. The §12.4 clause now carries its subject, since `The built-in skill takes precedence` passed before. `cli-contract.test.ts` reads output prefixes and exits 1 to 5 from the CLI itself.
- Not fixed here, for the coordinator: `vui: open <url>` prints once per Viewer start (VD-125), and a Viewer outlives a session (§4.1). So a new session in the same workspace, or a closed tab, prints only `vui: shown` with no connected page and no pane. The skill then says the visual is on screen and tells the agent not to repeat the data, and the user has neither the data nor a link. The sentence is §12.2.5 word for word, so the fix belongs in the CLI: print `vui: open` whenever `clients === 0` and no pane opened. That changes §11.2's "first show", so it needs its own decision and task. No skill change is needed once it lands. **Fixed by VD-141.**
- Rejected for budget (4 tokens of slack): the rest of §4.2's name rule in the skill (first character, `.html` ending, no `..`, ≤ 128, device names, title ≤ 120) and `<!--` escaping in the CDN template. Both apply only to the hand-written fallback, and the first fails visibly at `parseDirectiveLine` and the second as a "Could not read this document" card.
- Spec sections: §4.1, §4.2, §10.1, §11.2, §12.2, §12.4.

## VD-141 — `vui: open` prints whenever the reader has no way in — DEVIATION
- Date: 2026-11-06 · Task: 17 (follow-up fix)
- Context: VD-140. §11.2 prints the URL on "the first show after a Viewer start", and §4.1 "once per Viewer start". A Viewer outlives a session (§4.1), so a new session in the same workspace, or a closed tab, printed only `vui: shown` with no page connected and no pane, and the skill then tells the agent not to repeat the data.
- Decision (coordinator's ruling): **DEVIATION from §11.2 and §4.1.** On the local Viewer host, `vui: open <url>` prints on every show where `clients` is 0 and the pane state is `none`. `urlShown` leaves `viewer.json`, since nothing else read it. "First" was never a proxy for "the reader has a way in". The line stays out when a pane exists or is on its way: `opened`, `moved`, `kept` (VD-125's loading pane) and `busy` (another show holds the lock and is opening the pane). stdout stays one line plus that line, `--json` is unchanged, and a custom endpoint keeps VD-126.
- `--no-open`: same rule, so the URL prints each time nobody is connected, even with a `browserPageId` on record. The flag skips Orca, and only `tab list` can tell a loading pane from a closed one, so a recorded id proves nothing. Treating it as a pane would bring VD-140's defect back; the cost of printing is one line when a pane is in fact loading.
- A failed Orca call and SSH: same rule, state `none`, so the URL prints each time, and a failure keeps its one stderr warning. This closes VD-130's minor "After `--no-open` printed the URL, a later Orca failure prints none".
- Known limits, accepted as minors. `--no-open` prints beside a pane that is in fact loading, and so does a failed `tab list` followed by a failed `tab create`: nothing proved a pane, so the line errs toward a way in. A `busy` show trusts the lock's holder: if that holder's Orca call fails, the holder prints the line to its own stdout, or only in its JSON under `--json`, and the busy show's session gets no link. It needs two shows at once and a failing Orca, and printing on `busy` would print beside a pane on its way, which the ruling forbids. Pre-existing, deferred to task 20: when `record` throws after `tab create` succeeded (the state directory turned unwritable mid-show), the state reads `none`, so the URL prints beside a real pane and the warning says no pane opened.
- `SKILL.md` is unchanged: "If a `vui: open <url>` line follows, give the user that URL" already covers it.
- Rationale: a repeated line costs an agent a few tokens; a missing one leaves the user with no data and no link.
- Spec sections: §4.1, §11.2, §17.3.

## VD-142 — The one-pane test's stub lists what it created
- Date: 2026-11-06 · Task: 17 (coordinator, at integration)
- Context: the gate on merged `main` at 8f1fecd failed once on `opens one pane for five simultaneous shows`: 2 `tab create` calls, where 1 was expected. The stub always answered `tab list` with no tabs. The test dates from task 15, so VD-141 did not cause this. The two gates before it passed, and the file passed 6 of 6 alone.
- Cause, reproduced with the real `dist/bin.js` under CPU load, 30 rounds each: when a slower show takes `pane.lock` after the first released it, it reads the recorded id and lists tabs. The old stub said none, which gave `tab create > tab list > tab create` in 1 of 30. A stub that lists what it created gave `tab create > tab list` in 6 of 30 and never a second create. The CLI was right, and it did what `kept` exists for.
- Decision: the stub remembers its tabs, as Orca does. This is a test fix by the coordinator, because it was on a red `main`, and it changes no product code. The test still has teeth: with `pane.lock` removed from `showPane` and rebuilt, it failed 3 of 3 with 5 `tab create` calls.
- Limit: the stub's `tab list` is consistent as soon as `tab create` returns. Real Orca was seen listing the tab in the task 15 and coordinator pane runs, but not in this exact race, so a real Orca that lags here could still open a second pane.
- Rationale: a test that fails for its own fake teaches people to ignore it, and rerunning until green would have hidden a real-looking one-pane failure.
- Spec sections: §4.1, §16.1.

## VD-143 — Two Reacts: React 18 in a private fixture package
- Date: 2026-11-07 · Task: 18
- Context: the acceptance asks for `<VuiView>` tested on React 18 and on the current React, and React must be a peer of `@vadd/ui-react`. A pnpm alias beside React 19 in `ui-react` (`react-dom-18: npm:react-dom@18.3.1`) resolved the aliased DOM's peer to the React 19 next to it (`react-dom@18.3.1_react@19.3.1`), and an `overrides` entry (`"react-dom@18>react"`) does not reach peers.
- Decision: `react` and `react-dom` are `peerDependencies` `>=18` of `@vadd/ui-react`, with React 19.3.1 (the current release) and `@types/react` 19 as dev dependencies. React 18.3.1 and its DOM live in a private workspace package, `packages/ui-react/react18` (`@vadd/ui-react-react18`, listed in `pnpm-workspace.yaml`, never built or published), where pnpm pairs them (`react-dom@18.3.1_react@18.3.1`). Vitest runs `packages/ui-react/test/**` twice: in `jsdom` on React 19, and in a new `jsdom-react18` project whose aliases point `react` and `react-dom` at the fixture's copies. Each project names its major in `VUI_REACT_MAJOR`, and `react-version.test.ts` fails if the running React differs, so a broken alias cannot test React 19 twice. Tests use `react-dom/client` and `act` directly; Testing Library's own `react-dom` import would escape the alias. The e2e page is bundled twice with esbuild the same way. `check-versions` walks `packages/*` only, so the fixture is outside it, and `check-runtime-deps` sees only peers in `ui-react`.
- Alternatives: two copies of the tests; an aliased package in `ui-react` (does not pair); testing React 18 only in the browser.
- Rationale: one set of tests, each React with its own DOM, and a guard against the setup silently degrading.
- Spec sections: §4.4, §17.4.

## VD-144 — The contract suite: `@vadd/ui-viewer/contract`, no test runner
- Date: 2026-11-07 · Task: 18
- Context: the acceptance asks `@vadd/ui-viewer` to export a contract suite for the §4.1 HTTP interface that an outside project (VADD) can import, and leaves its form open.
- Decision: a subpath export, `@vadd/ui-viewer/contract`, built with the package. It uses only `node:http`, `node:https` and `node:assert/strict`, so Vitest, `node:test` or a script can run it. `contractCases({ base, token?, timeoutMs? })` returns 12 named cases in run order, which share the stored document and must run sequentially; `runContract` runs them all and returns `{name, ok, skipped?, error?}[]` without throwing; `CONTRACT_CASES` lists the names. `base` is what `VUI_VIEWER_URL` holds and `token` what `VUI_VIEWER_TOKEN` holds, as VD-126 reads them. Each request carries `X-Vui-Contract: <case>`, so a host's log shows which case asked. It checks only what §4.1 states and what the CLI reads (VD-116, VD-126): `/health` at the origin; the feed is HTML; the stream opens with `hello`; a relaxed-JSON write is 201 `{seq, id, url, clients}`, counts the open stream and is announced as `doc`; it reads back canonical (compared without `generatedAt`); the list pages with `after` exclusive; the standalone page embeds it; an invalid body is 422 with an `error` diagnostic; no or a wrong bearer is 401 and stores nothing; over 256 KiB is 413 and stores nothing; misses are 404; a foreign `Host` is a 4xx on `/health` and under `base`. Without `token`, the auth case is reported as skipped. Not checked: 429, 503, 405, exact bodies, extra headers, which are task 13's tests and would make a correct host fail on details. It stores one document per run, so it must run against a test instance.
- Tested: green against `createViewerHandler` on `node:http` and on Fastify, and against an outside npm project that installed the packed tarballs. Nine broken servers, each the real handler wrapped to break one thing, fail exactly the case aimed at it.
- Rationale: VADD can adopt it in one loop over `it`, and nothing in it ties a host to vadd-ui's choices where §4.1 is silent.
- Spec sections: §4.1, §4.4, §15.3.

## VD-145 — `<VuiView>`: exact props, theme by attribute, host tokens inherit
- Date: 2026-11-07 · Task: 18
- Context: §4.4 gives the props and the shadow root. The stylesheet's `:root.dark` and OS rules cannot match inside a shadow root (as the feed found, VD-007), and §4.4 says VADD maps its theme to the same token names.
- Decision: the props are exactly `doc`, `theme` (default `auto`) and `onDiagnostics`; a host wraps it for layout. `VuiDocument` and `Diagnostic` reach `ui-react` as type-only re-exports from `@vadd/ui-render`, its only §3 edge, and `ui-react` re-exports them. It renders `<div data-vui-view>`, reuses an existing shadow root (so StrictMode's second mount does not throw), puts `stylesheet` plus `:host{display:block}` and a target in it, and calls `render`. A new `doc` by identity calls `update`; `onDiagnostics` is read from a ref and called after the first render and each update; unmount destroys and empties the root. `#fragment` clicks scroll within the shadow root, as the feed does. `useLayoutEffect`, since VADD is a client-only Vite app. The scheme is always written as `data-vui-theme` on the root: an explicit theme as given; `auto` from `<html>`: `.dark` is dark, `.light` is light, `class=""` is light, and otherwise the OS, watched with a `MutationObserver` and `matchMedia`, with no re-render. Host tokens inherit through the shadow boundary and still win, so `theme` picks the scheme for the fallbacks and the local tone tokens only. VADD's `index.css` already declares §8.1's source names.
- Found in the Orca pane: Windows here prefers dark, and the first `auto` followed the OS when `<html>` had `class=""`, which is what VADD's `ThemeProvider` leaves in light mode. That put dark tone colors on VADD's light cards. `class=""` now means light, as the stylesheet's own rule has it (VD-058), with a unit test and a Chromium test under an emulated dark OS.
- Alternatives: cutting host tokens when `theme` is explicit, which would drop VADD's palette whenever VADD pins a theme; `adoptedStyleSheets`, which jsdom lacks.
- Rationale: VADD's theme reaches the visual with no configuration, and the scheme agrees with VADD's in every state its ThemeProvider produces.
- Spec sections: §4.4, §8.1, §8.2, §9.1.

## VD-146 — The Fastify host lives in `ui-cli`'s tests and mounts in `onRequest`
- Date: 2026-11-07 · Task: 18
- Context: the acceptance asks for a Fastify server on `127.0.0.1` that mounts the handler, passes the contract suite, and receives `vui show` through `VUI_VIEWER_URL`.
- Decision: `fastify` 5 (as VADD's `^5.12.1`) is a dev dependency of `@vadd/ui-cli`, whose tests can also run the real `vui` binary; it is no runtime dependency of anything. `packages/ui-cli/test/fastify/host.ts` builds what VADD will: its own route (`/api/projects`), a `DocStore` in a temp directory, and `createViewerHandler` for `/health` and `/v/*` in a route-level `onRequest` hook that calls `reply.hijack()` and passes `req.raw` and `reply.raw`. `onRequest` runs before Fastify's body parser; with the call moved into the route handler, the parser had already read the POST and the contract suite failed on the write case, so the handler needed no change. `fastify-host.test.ts` runs the suite, then the real `vui show` with `VUI_VIEWER_URL` and `VUI_VIEWER_TOKEN`: exit 0, the shown line, VD-126's `vui: open` line with the host's feed URL at `clients: 0`, the document in the list, `clients: 1` and a `doc` event with a stream open, exit 4 on a wrong token, and `vui viewer status` through the endpoint. It also imports `@vadd/ui-viewer/contract` from the built package in a separate Node process.
- Rationale: the dependency stays out of every shipped package, and the test exercises both sides of the contract VADD will implement.
- Spec sections: §4.1, §4.4.

## VD-147 — Task 18 review: fixed findings and declined ones
- Date: 2026-11-07 · Task: 18
- Context: a fresh review found no critical defect. It checked every VADD file and line in `VADD_INTEGRATION.md` against `a8b5cc2` and found them accurate, and it confirmed the React 18 project runs React 18. It reproduced one important defect: against a list that ignores `after`, the refused-write checks of the contract suite looped forever (638 list calls in 8 s), so `runContract`, promised to always return, hung.
- Fixed, each with a test seen failing first: (1) the newest-seq walk fails with "after is not honoured" when a page does not move past the seq it was asked after, so the suite reports the list, auth and size cases and ends. (2) A `doc` event whose data is not JSON threw inside the stream's `data` listener, which would end the process; the event matcher now catches it and fails the write case. (3) The stream from the events case was closed only by the write case, so a host running cases one by one could leak it; every later case now closes it first. (4) `<VuiView>` passed no `linkHandler`, so an `http(s)` link in a visual replaced the whole dashboard tab; it now opens a new tab with `noopener,noreferrer`, as the feed does. §4.4 fixes the props, so this is internal. (5) The React 18 project's glob now matches `.tsx` too. (6) Doc: the token file is `join(vaddHome(), 'vui.json')`; the test snippet closes its app and imports only what it uses; the `vui` card goes inside `CardFrame` so Low Energy Mode collapses it; the theme section says other classes on `<html>` mean "follow the OS"; HTTPS needs a certificate Node already trusts.
- Declined: an option for a self-signed TLS certificate in the contract target, since VADD is plain HTTP on loopback (§4.4) and the limit is documented; removing `react-dom` from the peers, since a host cannot mount `<VuiView>` without it and the pair says which DOM major is supported. Left as the reviewer did: whether Tailwind v4 emits `--font-sans` on `:root` in VADD's build, which only a VADD build can show.
- Spec sections: §4.1, §4.4, §9.3.

## VD-148 — One offline estimator, in `ui-cli`, loaded lazily
- Date: 2026-11-10 · Task: 19
- Context: VD-136's estimate lived in the skill's tests, and `vui bench` must measure `SKILL.md`, the catalog and the corpus the same way. The tokenizer must stay out of `ui-spec`, `ui-render` and `ui`.
- Decision: `packages/ui-cli/src/bench/tokens.ts` holds VD-136's estimate unchanged: the larger of `cl100k_base` × 1.3 and code points × 1.3 ÷ 3.5, rounded up. `js-tiktoken` 1.0.21, pinned exact, moves from the skill's dev dependencies to `@vadd/ui-cli`'s `dependencies`, since `vui bench` ships there. It is pure JavaScript (one dependency, `base64-js`). `offlineCounter()` imports `js-tiktoken/lite` and the `cl100k_base` ranks with dynamic `import()` once, so no other command loads them, and a test fails if `run.ts`, `commands.ts`, `index.ts` or `args.ts` name the package. The skill's tests import `offlineCounter` from `@vadd/ui-cli`. The VD-136 gate of 1,710 in `skill.test.ts` stays.
- Alternatives: an optional dependency, which an install could drop and turn `vui bench` into an error; bundling the ranks into `dist`, which adds about 1 MB to every install for no gain over a normal dependency.
- Rationale: one implementation, so the three measurements cannot drift, and the cost falls only on the command that needs it.
- Spec sections: §3, §11, §14.3.

## VD-149 — The token-counting API path
- Date: 2026-11-10 · Task: 19
- Context: §14.3 wants the Anthropic API when a key is configured. No key exists on this machine, and the CLI takes no third-party runtime dependency for an HTTP call.
- Decision: a non-empty `ANTHROPIC_API_KEY` selects the API; an unset or empty one selects the offline estimate. Each text goes as one user message to `POST {ANTHROPIC_BASE_URL or https://api.anthropic.com}/v1/messages/count_tokens` with `x-api-key`, `anthropic-version: 2023-06-01` and `{model, messages}`, by Node's `fetch` with a 30 s timeout. The model is `VUI_BENCH_MODEL` or `claude-opus-5-5`. The framing the endpoint adds is learned once per run as count(`"."`) − 1, assuming `.` is one token, and subtracted, floored at 0. The key goes into that header only. A network error, a non-2xx status or a body without a numeric `input_tokens` is exit 5, `token counting API: HTTP 401` and the like. The server's body is never echoed, since it could quote the key, and there is no fallback to the offline counter, because the report must say which counter ran. Tests run against a `node:http` stub on 127.0.0.1 and check the key is absent from every message, stack and JSON output.
- Not verified: a real API run, for lack of a key. The `-1` framing assumption is untested against the real endpoint.
- Rationale: the API path is real, small and tested, and the gate stays offline (VD-154).
- Spec sections: §3, §11.4, §14.3.

## VD-150 — What each §14.2 budget counts
- Date: 2026-11-10 · Task: 19
- Context: §14.2 names "command line + envelope" and "template + envelope" without fixing them, and does not say whether the two ratios are per visual or over a corpus.
- Decision: `fixed.show` is ``vui show --title "" <<'EOF'`` + `{body: [` + `]}` + `EOF`, each on its own line: the skill's behavior 4 with no title text and no body. `fixed.cdn` is the skill's three-line CDN template with the same empty document; its first two lines are §10.2's byte for byte, and a test compares them with `SKILL.md`. Title text and body content count in the cases. The `::orca-visual{…}` line is not in either phrase, and hand-written HTML needs the same line, so it is not gated. It is reported: `info.directive` (20), and `info.showOrcaChat`, the command line, envelope and line together (42). That is the per-visual cost an agent pays on the `orca-chat` host, over 30. Reading "on any host" as including it would make `fixed.show` unmet too; this task follows the parenthetical's own words and leaves that reading to the coordinator. `ratio.md` is checked on cases whose markdown holds a GFM delimiter row, since §14.2 says "a GitHub-flavored markdown table". It is the worst such case, with the corpus total reported beside it. `ratio.html` is the worst case. Per case, so that no case hides behind the others. Ratios are rounded to three decimals.
- Rationale: each definition comes from the spec's words or the skill's actual text, and the scope of `ratio.md` is mechanical, not chosen by result.
- Spec sections: §10.2, §12.2, §14.2.

## VD-151 — The corpus, and how its three encodings stay equal
- Date: 2026-11-10 · Task: 19
- Context: §14.3 wants ≥ 20 cases covering every core component, each three ways, with HTML "in the style Orca's built-in skill produces".
- Decision: 24 cases in `packages/ui-cli/corpus/<case>/doc.{vui,md,html}`, shipped in the package's `files` and read by `vui bench` with no argument. One case is led by each component in `COMPONENT_TYPES`, and the layout cases mix components as replies do (two follow §19.1 and §19.2). VUI is written as `SKILL.md` teaches: relaxed JSON, cheat-sheet layout, no presentation fields (a first draft's `gap` and `cols` were removed as §14.1 rule 1), no redundant `sort` on rows already in order. Markdown is what a model writes without vadd-ui: a `## title`, formatted values, tables for tables, lists, fences, emoji statuses, nothing restated. HTML follows Orca's installed `orca-chat-visuals` SKILL.md (1.4.248): one file, inline `<style>`, every token with a fallback (`var(--border,#e5e5e5)`), no `100vh`, inline SVG for charts, no external URL, no token redefined on `:root`. It is a compact competent page. Real model output tends to be larger, so the reference errs against VUI. `corpus.test.ts` holds: ≥ 20 cases; every component appears as a `type` somewhere, so a new component without a case fails; every case validates with no diagnostics; every content string of the VUI (not vocabulary such as `type`, `status`, formats, ids) appears in the markdown and in the HTML text after removing marks, tags and entities; the HTML rules above. Numbers are written per encoding and were checked by hand. Biome ignores the corpus, so a formatter never changes what is measured.
- Also checked, after review: every table row and chart point in the VUI has a GFM body row in the markdown, and every table row a `<tr>` in the HTML; `<title>` is removed before the HTML is compared, so it cannot stand in for the heading. A mutation test drops a row and a heading and sees both caught.
- Limits: numbers are not compared as text, only by row count; a short string such as `ok` matches anywhere. Two slips the review found by hand were fixed (`stats` wrote "−0.2 pp" where the renderer and HTML say "−0.2%", and dropped the ok mark on "Error rate"; `chart` added a sentence neither other encoding had).
- Rationale: the checks make it hard for an encoding to look cheaper by saying less, without claiming more than they test.
- Spec sections: §6, §14.1, §14.3, §4.2.

## VD-152 — `vui bench`: output, exit codes, where `SKILL.md` is found
- Date: 2026-11-10 · Task: 19
- Context: §11.1 gives `vui bench [dir]` and nothing else, and VD-103 wants one `Outcome` with `--json` on every path.
- Decision: no flags. Line 1 names the case count and the counter, then one line per budget (`ok`/`fail`, value, limit, the worst case), one summary line for the 24 catalog budgets plus a line for any that fails, and two `info` lines (directive, corpus totals). `--json` has `counter`, `cases`, `metrics`, `budgets`, `info` and `skillPath`. Exit 0 when every budget holds; 1 when one does not, or a case does not validate (each error line is prefixed with the case); 5 when the folder, a case file or the API fails, or the folder holds no case. `SKILL.md` is read from the monorepo's `skills/vadd-ui/` beside the CLI, then `.claude/skills/vadd-ui/` under the working directory, then under the home directory. With none, `skill` is "not measured", which is not a failure for an installed CLI; the gate's baseline requires the metric. `catalog.<type>` measures `catalogText(type)`, the exact stdout of `vui catalog <type>`.
- Rationale: an agent reads the first line and the `fail` lines; everything else is in `--json`.
- Spec sections: §11.1, §11.4, §12.1, §14.2.

## VD-153 — Catalog field lines lose their indent
- Date: 2026-11-10 · Task: 19
- Context: measured before any change, `vui catalog table` and `vui catalog chart` estimated 306 tokens each, over §14.2's 300. `cl100k_base` spends one token on each two-space indent, 17 of them in `table`.
- Decision: field lines are printed without indent; the `fields:` header and shape headers such as `Column:` still group them. A blank line before `common:` keeps it and `example:` from reading as fields of the last shape (review). Now `table` 284 and `chart` 286; the rest are at most 180 (`decision`). Relaxed-JSON examples were measured and cost more tokens (316 for `table`), so the example stays JSON.
- Rationale: the fix is at the cause and keeps every field.
- Spec sections: §11.1, §14.2.

## VD-154 — The 5% gate and its baseline
- Date: 2026-11-10 · Task: 19
- Context: §14.3 and §16's Budgets row want CI to fail on a regression over 5% against main.
- Review addition: a metric more than 5% *below* its baseline also fails, asking for `--update`, so an improvement cannot become unrecorded room to regress.
- Decision: `scripts/token-baseline.json` holds the counter, all 29 metrics and an `unmet` list. `scripts/check-token-budgets.mjs`, last in `pnpm check`, runs the built `vui bench --json` with `ANTHROPIC_API_KEY` removed. It fails when: the counter differs from the baseline's; a metric is missing on either side; a metric is more than 5% above its baseline (all metrics are smaller-is-better; exactly 5% passes); a budget is missed and not in `unmet`; or a budget in `unmet` is now met, so the file stays true. Intentional change: `node scripts/check-token-budgets.mjs --update` rewrites the file from the current run, and a miss not already listed must be named with `--accept-unmet <name,...>`. The diff shows in review, and the commit says why. `scripts/lib/token-baseline.mjs` holds the comparison; tests show +6% fails and +4% passes, on tokens and on ratios, and run the script on recorded results through `--result`. Biome ignores the baseline, which the script writes.
- Rationale: a miss can only enter the baseline by name, and any drift of more than 5% fails, accepted miss or not.
- Spec sections: §14.3, §16.

## VD-155 — Two ratio budgets are measured and not met — DEVIATION
- Date: 2026-11-10 · Task: 19
- Context: with honest encodings (VD-151), offline estimate, 24 cases.
- Measured: `fixed.show` 23 ≤ 30; `fixed.cdn` 65 ≤ 70; `skill` 1,706 ≤ 1,800; `catalog` at most 286 ≤ 300; these hold. `ratio.md` worst 2.007 (`stats-weekly-metrics`) over 9 table cases, against 1.2: met by the real tables (`table` 1.009, `chart` 1.053, `diff` 1.057), missed by key-value shapes rendered as tables (`stats` 2.007, `compare` 1.582, `grid` 1.486, `kv` 1.374, `card` 1.386, `tabs` 1.291); the corpus total over all 24 cases is 1.423. `ratio.html` worst 0.425 (`stack-release-notes`), against 0.2: only `chart` (0.147) and `flow` (0.19) are under; the corpus total is 0.255.
- Cause: a positional table row costs about 0.21 of a plain `<tr><td>` row, so any row-heavy table tends to that ratio whatever the envelope; short prose cases have little HTML around them. Objects with full-word keys (`{label:, value:, format:, delta:, deltaFormat:}`, decision D3) cost about twice a markdown table row. Neither is a defect of the catalog, the skill or the defaults that this task could fix without changing the format: the HTML is already compact, and padding it, or tuning the VUI past what the skill teaches, is ruled out.
- Decision: both are reported as unmet in `vui bench` (exit 1) and listed in the baseline's `unmet`, so `pnpm gate` stays green yet fails on any 5% drift of them or on any new miss. This is a deviation from §14.2's release gates, for the coordinator and the spec owner. A met budget needs a format change (for example a positional form for `stats`/`kv` items), a different reading of the budget (§14.2 against a typical, larger model page), or a real-model measurement through the API, none of which is this task's to decide.
- Spec sections: §14.1, §14.2, §14.3, §18 (D3).

## VD-156 — Task 19 review: fixed findings and declined ones
- Date: 2026-11-10 · Task: 19
- Context: a fresh review found no critical defect, and six important ones.
- Fixed, each with a test seen failing first: (1) the API key could reach stderr inside `fetch`'s own error, for a key holding a control character (`Headers.append: "sk-…\nX" is an invalid header value`); the key is now checked against `^[\x21-\x7e]+$` before any request, every error reason is scrubbed of it, and `redirect: 'error'` stops a redirect carrying it. (2) The baseline never tightened; a fall over 5% now fails too (VD-154). (3) The corpus check compared strings only; row and point counts and the `<title>` exclusion are added, two hand slips fixed, and VD-151's claim reworded. (5) A 429 or 529 is retried up to three times, honouring `retry-after` capped at 10 s. Minor: an unmeasured budget prints `n/a`, not `ok`; GFM tables are detected as GFM writes them (`|-|-|`, one column, nothing inside fences); hidden folders are not cases; a blank line before `common:` in the catalog; the `chart` markdown lost a sentence the others lacked.
- Not changed: (4) `fixed.show` keeps §14.2's parenthetical, "command line + envelope"; the `orca-chat` total (42, over 30) is now on its own line and in `--json`, and VD-150 hands the other reading to the coordinator. (6) VD-155's two unmet budgets are this task's honest result, not a code issue. `offlineCounter` stays exported from `@vadd/ui-cli`'s main entry: a subpath needs an exports entry and a Vitest alias for one test import, and the function is harmless to expose. Whole-token string matching in the corpus check is not added; row counts cover the case the review gave.
- Spec sections: §14.2, §14.3, §16.

## VD-157 — Coordinator ruling on task 19's open budget questions — DEVIATION (open)
- Date: 2026-11-10 · Task: 19 (coordinator)
- Context: task 19 met its measurement acceptance, but two §14.2 release gates are not met with honest encodings (VD-155), and VD-150 left the `orca-chat` reading of `fixed.show` open.
- Decision, `fixed.show`: VD-150's reading stands. The `::orca-visual` line is host framing that hand-written HTML pays as well, so it is not "command line + envelope". `info.showOrcaChat` (42) stays reported.
- Decision, VD-155: merge task 19 as delivered. The worker's scope for `ratio.md` (every case whose markdown is a GFM table) and per-case worst values stay; reading `ratio.md` as the `table` case alone, or `ratio.html` as a corpus total, would pass or narrow the gate by choosing a reading from the result, and is declined. Both misses stay in the baseline's `unmet`, so drift and new misses still fail the gate. Closing them is added to task 20 (its "budgets" scope): try format-level fixes at the cause, chiefly a positional form for `stats` and `kv` items, measured through `vui bench`; anything still unmet after task 20 is listed as an open release-gate DEVIATION in the final summary, not hidden.
- Pending the user (release checks, not blockers): one `vui bench` run with a real `ANTHROPIC_API_KEY`, which also checks VD-149's framing assumption; the ratios may move under a real Claude count.
- Spec sections: §14.2, §14.3.

## VD-158 — The watchdog mark test reads the best of 5 renders
- Date: 2026-11-10 · Task: 20
- Context: "takes a long mark list in its stride" (`code.test.ts`) renders 1,500 lines against 500,000 marks and expects no `.vui-card-error`. On a loaded machine one render can trip the render watchdog even with a constant-time lookup.
- Decision: render the same document up to 5 times and pass on the first render without an error card (still exactly one `mark`). A linear lookup trips the watchdog on every render, so the mutant (an array and `.includes`) still fails. The same task adds `removes its own file when a write fails` (a `node:fs` write that leaves a file and throws `ENOSPC`; the file is gone, exit 5) and a `safe` test for the warning line. No production seam was added: the file test wraps `writeFileSync` with `vi.mock`.
- Rationale: VD-087's fastest-of-N pattern, applied to a pass/fail watchdog instead of a time.
- Spec sections: §16.

## VD-159 — One slug function; VD-133's rules win
- Date: 2026-11-10 · Task: 20
- Context: `slugify` (Viewer store ids, VD-112) and `slugOf` (file names, VD-133) differed: the viewer cut after prefixing and kept a trailing `-`, so `Звіт` gave `v--` and an untitled document `1-v-`. §11.5 is silent on both.
- Decision: `slugify` in `@vadd/ui-viewer` takes VD-133's rules: lowercase, each run outside `[a-z0-9]` becomes `-`, cut to 48, trailing `-` dropped, `v-` prefixed when it does not start alphanumeric, cut and dropped again. `@vadd/ui-cli` imports it and `slugOf` is deleted (nothing else used it). Viewer ids for non-Latin or untitled documents change: `Звіт` gives `1-v`, no title gives `1-v`. Ids are opaque, and files already stored as `1-v--...` keep their stem as id. Changed expectations: `store.test.ts` slug table (`'  Hello,   World!'` now `v--hello-world`, `''` now `v`, `Звіт` now `v`), the mistyped-title header id `1-v-` to `1-v`, and `show.test.ts` file names `1-v-.vui.json` to `1-v.vui.json` (two places). No e2e expectation held the old form.
- Alternatives: keep two functions; rejected, they had already diverged.
- Rationale: one function cannot drift, and VD-133's form is the stricter one.
- Spec sections: §11.5.
