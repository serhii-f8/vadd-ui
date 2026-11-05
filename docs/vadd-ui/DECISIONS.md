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
