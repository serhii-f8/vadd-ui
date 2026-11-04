# vadd-ui progress

Spec: docs/specs/vadd-ui-technical-spec.md · Updated: 2026-11-04T20:49:12Z · Mode: manual

## Summary
Done 4 / 22 · In progress: none · Blocked: none · Next: 05 — ui-text: markdown and text renderer

## Environment
Recorded 2026-11-04 during bootstrap.

| Check | Result |
|---|---|
| Orca CLI | `orca-ide` 1.4.248 (`ORCA_CLI_COMMAND`); `orca` also resolves to the same version |
| Coordinator worktree | `28b6546a-7693-41f8-a180-476d9aaa0d09::\\wsl.localhost\Ubuntu-22.04\var\www\html\vadd-ui` |
| Repo id | `28b6546a-7693-41f8-a180-476d9aaa0d09`, base ref `main`, no remote |
| Host | WSL 2, distro `Ubuntu-22.04` (Ubuntu 24.04.4), kernel 6.6.87.2-microsoft-standard-WSL2 x86_64 |
| WSL networking | `networkingMode=mirrored` (not the spec's default NAT) |
| Node, git | v22.20.0, 2.43.0 |
| pnpm | 11.9.0 through the repo pin. Without the pin, the corepack shim crashes on 12.4.2 (VD-005) |
| Superpowers | All 10 listed skills are available in this session |
| Playwright | Chromium headless shell 156.0.8078.4 launched and rendered a page in WSL; no sudo needed. Tested from the scratchpad with playwright 1.64.1 |
| Orca sources | `stablyai/orca` reachable on GitHub; `resources/native-chat-visuals` and `app.asar` present in the installed app (VD-009) |
| Tools absent | `jq` is not installed; use Node for JSON |
| Worker smoke test | Passed on 2026-11-04 by the terminal-first route (VD-014): WSL path, spec hash intact, LF files, pnpm 11.9.0, `CLAUDE.md` auto-loaded, all 10 skills present, Agent tool present, no permission prompts, bypass mode |
| `worker-start --agent` | Fails at `agent_readiness: timeout`, twice; cause unconfirmed (VD-014) |
| Existing workers | none; smoke worktree removed |

## Tasks
| ID | Title | Spec § | Depends on | Status | Worktree | Dispatch | Design spec | Plan | Merged commit | Completed |
|----|-------|--------|------------|--------|----------|----------|-------------|------|---------------|-----------|
| 01 | Monorepo scaffolding | §3, §15.1, §16 | none | done | removed | ctx_5c58f32c1b79 | [design](docs/superpowers/specs/2026-11-04-monorepo-scaffold-design.md) | [plan](docs/superpowers/plans/2026-11-04-monorepo-scaffold.md) | 5205219 | 2026-11-04 |
| 02 | ui-spec: parser, envelope, normalizer | §2, §5, §5.1, §5.2, §5.3 | 01 | done | removed | ctx_2abe81f7d30f | [design](docs/superpowers/specs/2026-11-04-spec-parser-design.md) | [plan](docs/superpowers/plans/2026-11-04-spec-parser.md) | 8abe48f | 2026-11-04 |
| 03 | ui-spec: validator, diagnostics, limits, schema, conformance | §5.4, §6, §13.1, §16, §17.1, §19 | 02 | done | removed | ctx_16d884678f96 | [design](docs/superpowers/specs/2026-11-04-spec-validator-design.md) | [plan](docs/superpowers/plans/2026-11-04-spec-validator.md) | 4149910 | 2026-11-04 |
| 04 | ui-spec: value formats, inline text, status tokens | §5.5, §7, §16 | 03 | done | removed | ctx_81dd35dc6907 | [design](docs/superpowers/specs/2026-11-04-spec-formats-design.md) | [plan](docs/superpowers/plans/2026-11-04-spec-formats.md) | bcc143c | 2026-11-04 |
| 05 | ui-text: markdown and text renderer | §4.5, §16 | 04 | todo | | | | | | |
| 06 | ui-render core | §3, §4.2, §8.1, §8.4, §9.1, §9.3, §13.4, §15.1, §15.2, §16 | 04 | todo | | | | | | |
| 07 | Layout and text components | §6.1, §6.2, §8.4, §15.2 | 06 | todo | | | | | | |
| 08 | Data components | §6.3, §6.6, §7, §8.4, §15.2 | 07 | todo | | | | | | |
| 09 | Charts | §6.4, §9.4, §15.2 | 08 | todo | | | | | | |
| 10 | Dev-workflow components | §6.5, §6.7, §8.4 | 09 | todo | | | | | | |
| 11 | @vadd/ui bundle and boot script | §4.3, §9.2, §9.5 | 10 | todo | | | | | | |
| 12 | CLI core | §10, §10.1, §11.1, §11.3, §11.4, §15.1, §17.2 | 05, 11 | todo | | | | | | |
| 13 | Viewer server | §4.1, §15.3 | 11 | todo | | | | | | |
| 14 | Viewer feed app | §4.1 | 13 | todo | | | | | | |
| 15 | vui show, host routing, viewer lifecycle, doctor | §3, §4.0, §4.1, §11.1, §11.2, §16.1 | 12, 14 | todo | | | | | | |
| 16 | orca-chat adapter and file host | §3, §4.2, §10.2, §11.2, §11.5, §17.3 | 15 | todo | | | | | | |
| 17 | Agent skill | §12.1 | 16 | todo | | | | | | |
| 18 | ui-react and the Viewer HTTP contract | §4.4 | 11, 13 | todo | | | | | | |
| 19 | vui bench, corpus, token budgets | §11.1, §14.1 | 17 | todo | | | | | | |
| 20 | Hardening | §9.5, §15.1, §16 | 15, 18, 19 | todo | | | | | | |
| 21 | Host matrix and release preparation | §1, §10.3, §15.1, §16, §16.1, §17.2, §17.3, §17.4 | 20 | todo | | | | | | |
| 22 | ext components | §6.3, §6.4, §6.5 | 21 | todo | | | | | | |

## Current task log
none

## Completed task reports
### 01 — Monorepo scaffolding
- Built: pnpm workspace with 7 packages plus `skills/vadd-ui`, per the §3 dependency graph; shared TypeScript configs; Vitest, Playwright, Biome, esbuild; `pnpm gate`; banned-API, runtime-dependency, version, target and bundle-size checks; `.github/workflows/ci.yml`.
- Decisions: VD-016 to VD-021.
- Evidence (coordinator rerun on `main` at 5205219): `pnpm gate` exit 0. Vitest 14 files, 79 tests. Playwright 1 test. Banned-API check clean on 6 files. Runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. Spec hash unchanged.
- Review: fresh reviewer found no Critical issues; Important ones fixed.
- Incident: one permission prompt on a shell script with `rm`, in bypass mode. Not approved; the worker reran without it. The brief now forbids `rm` in scripts. The coordinator's guidance mail arrived after the worker had finished.
- Follow-ups: task 11 must declare `vui.min.js` in `@vadd/ui` exports (VD-020). `ci.yml` is unrun (VD-010), and `pnpm/action-setup@v4` with the pin is unverified. Six reviewer minors deferred: `--root` with no value falls back to the real repo; peerDependencies equality unchecked; odd message for string-valued `dependencies`; `lib` narrowing unasserted; reported line can point at a comment; `ci.yml` lacks a `permissions` block.

### 02 — ui-spec: parser, envelope, normalizer
- Built: canonical types (all 24 components, Status, Tone), relaxed-JSON parser, normalizer with envelope defaults and all six shorthands, canonical-to-input path map, §2 media type constants.
- Decisions: VD-022 to VD-028. VD-022 is a DEVIATION: a number that overflows, such as `1e999`, is a parse error.
- Evidence (coordinator rerun on `main` at 8abe48f): `pnpm gate` exit 0. Vitest 21 files, 425 tests. Playwright 1 test. Banned-API check clean on 13 files. Runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. `ui-spec` coverage: lines 100% (362/362), statements 99.52%. Spec hash unchanged.
- Worker evidence, not rerun: compile probes for `document`, `console`, `process`, `node:fs`, `fetch` each failed under the package tsconfig; 20,000-case parser fuzz; four path-map mutants killed; parse of 250 KiB 2.44 ms and normalize 5.42 ms, measured before the review fixes.
- Review: fresh reviewer found one Important issue, unbounded table expansion (a 54 KB document threw after 13 s). Fixed red to green (VD-028). Minors fixed.
- Follow-ups: task 03: `normalize` returns `{document, paths.toInput(), dropped}`; report `dropped` as warn (VD-026); map parse code too-deep to exit 3 (VD-023); the walker needs a depth guard, because subtrees past depth 128 come back raw; tables over the cap keep object rows, and §13.4 limits report them (VD-028). Task 04: wire the coverage gate (VD-027). Task 06: `render(object)` must sanitize host objects before `normalize`, which does not handle cycles or non-JSON values; over-limit truncation must tolerate unconverted object rows. Task 17: tell agents to give explicit columns with year-like keys (VD-026). `generatedAt` stays absent unless the CLI passes `options.generatedAt` (VD-024).
- Note: Superpowers `sdd-workspace` scripts have CRLF shebangs and do not run in WSL; the worker kept the ledger by hand.

### 03 — ui-spec: validator, diagnostics, limits, schema, conformance
- Built: `validate` and `validateText`, hand-written walker for common fields and all 24 components, §13.2 diagnostics, all §13.4 limits as stable `limit-*` codes with `isLimitCode`, Levenshtein hints, schema generator reading `types.ts` (`dist/vui.schema.json`, exported as `@vadd/ui-spec/schema.json`, checked by `pnpm check`), conformance corpus.
- Decisions: VD-029 to VD-041, no DEVIATION. VD-029: TypeScript 7 has no stable compiler API, so the generator is its own reader of the `types.ts` subset. VD-030 defines agreement: the schema rejects exactly when the walker reports a code in `SCHEMA_CODES`.
- Evidence (coordinator rerun on `main` at 4149910): `pnpm gate` exit 0. Vitest 29 files, 1,619 tests. Playwright 1 test. Banned-API check clean on 19 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. `ui-spec` coverage: lines 100% (779/779), statements 99.66%. Spec hash unchanged.
- Coordinator probes on the branch build: every §13.4 limit tested gives its `limit-*` code, except chart points, chart series and `flow` nodes, which were not probed; input size passes at 262,144 bytes and fails at 262,145; 12 nested stacks pass and 13 fail; the §11.3 examples and hex parse error match; hostile documents (long key, 192 KB of unknown nodes, dense flow, cycle through `validate`) ran in under 100 ms and under 30 MB of heap, with no message over 120 chars; a field added to `types.ts` makes `generate-schema --check` exit 1.
- Worker evidence, not rerun: corpus of 321 valid, 279 invalid and 423 notice cases, with §19.1-19.3 compared to the spec file (§19.4 and §19.5 hold no new document); schema and walker agree on every case with a document and on 4,000 seeded mutations.
- Review: fresh reviewer found two crash bugs and a 129 s flow check within 256 KiB. All fixed with tests. Those fixes were retested but not re-reviewed, and the long-key out-of-memory test never ran red locally, so the coordinator probes above stand in for both.
- Task 02 defects corrected here: the VD-028 cell cap is now per document (VD-038); `FlowNodeObject.label` is required, as §6.5 writes it (VD-040).
- Tooling changes accepted at merge: `ajv` as a root dev dependency (VD-035); `pnpm build` generates the schema and `pnpm check` verifies it.
- Follow-ups: tasks 05 and later can import `packages/ui-spec/test/corpus/cases.ts`. Task 04 still wires the coverage gate (VD-027). Task 12 (CLI) must escape `Diagnostic.path` when printing, since a key with a control character reaches it raw (VD-041; the worker's note named task 13, but task 12 owns the CLI output); it appends `hint` as in §11.3 and maps `isLimitCode` to exit 3. No column hint on `dropped-cell` yet (VD-041).

### 04 — ui-spec: value formats, inline text, status tokens
- Built: all 18 §7 formats in `formatValue` (pure, total, no clock), format parsing and `checkFormat`/`checkValue`, §5.5 inline parser to a token tree with status tokens and `safeHref`, validator warnings `bad-value` and `bad-format-arg`, and the 95% line coverage gate in `pnpm gate` through `test:coverage`.
- Decisions: VD-042 to VD-049, no DEVIATION. VD-042: `delta[:base[:arg]][:better:low|high]`. VD-043: grouping is always on, so `pl-PL` matches §7's `1 234,50 zł`; Intl's NBSP is kept. VD-047: `date` is always UTC and strict ISO 8601. VD-048: `#fragment` links are allowed, since §4.2 and §5.4 promise them and they have no scheme.
- Evidence (coordinator rerun on `main` at bcc143c): `pnpm gate` exit 0. Vitest 31 files, 1,936 tests. Playwright 1 test. Banned-API check clean on 22 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. `ui-spec` coverage: lines 100% (1176/1176), statements 99.63%, branches 99.32%. Spec hash unchanged.
- Coordinator probes on the merged build: every §7 example output reproduced, in the listed locale; `better:low` inverts tones; null gives em dash and muted; wrong types and bad args render raw with a `warn`; `rel` stable across calls in all three locales; `safeHref` refused `javascript:`, leading-space, control-char, `data:`, `vbscript:`, `file:`, `//`, relative and split-scheme URLs; seven 180,000-200,000-char adversarial `parseInline` inputs each ran in at most 25 ms.
- Test-first gap: the format tests in 5f996c7 were written first but never run red; the worker reported this. Coordinator compensated with six hand mutants of `format.ts` (tone inversion, ASCII minus, grouping, compact digits, `num` digits, null tone). All six were killed, with 2 to 19 tests failing each. This is a sample, not a full mutation run.
- Worker evidence, not rerun: coverage gate exits 1 at 77.22% with the format and inline tests excluded; `Date.now` spy never called by `rel`; 5,000 × 30 cells validate 53 ms, format 392 ms, measured before the review fixes.
- Review: fresh reviewer found 2 critical (a 10-char string hung `parseInline` until heap OOM; a 37.5 KB format string threw from `validateText`) and 3 important (quadratic path regex, unchecked `stats` delta, negative zero). All fixed. Declined items are in VD-049.
- Follow-ups: tasks 06 to 10: pass `generatedAt` as `FormatContext.now`, use the `Formatted` fields, and add a JSON Pointer to each `issues` entry. Task 12 (the worker's note named task 13): `bad-value` and `bad-format-arg` are `warn`, so no exit-code change. Task 21: check `pl-PL` money in Firefox 115; if `useGrouping: 'always'` is unsupported there it prints `1234,50 zł` and differs from the CLI (VD-043, from memory, untested).
- Note: execution was inline with `executing-plans`, not subagent-driven, because the dispatch preamble says no subagents unless asked.
