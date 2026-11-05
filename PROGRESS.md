# vadd-ui progress

Spec: docs/specs/vadd-ui-technical-spec.md · Updated: 2026-11-05T13:11:29Z · Mode: manual

## Summary
Done 8 / 22 · In progress: none · Blocked: none · Next: 09 — Charts

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
| 05 | ui-text: markdown and text renderer | §4.5, §16 | 04 | done | removed | ctx_7a145f940999 | [design](docs/superpowers/specs/2026-11-04-ui-text-design.md) | [plan](docs/superpowers/plans/2026-11-04-ui-text.md) | 8cf1641 | 2026-11-04 |
| 06 | ui-render core | §3, §4.2, §8.1, §8.4, §9.1, §9.3, §13.4, §15.1, §15.2, §16 | 04 | done | removed | ctx_c2e643a2dd6e | [design](docs/superpowers/specs/2026-11-05-render-core-design.md) | [plan](docs/superpowers/plans/2026-11-05-render-core.md) | b65c54d | 2026-11-05 |
| 07 | Layout and text components | §6.1, §6.2, §8.4, §15.2 | 06 | done | removed | ctx_1d7a5b7dd91d | [design](docs/superpowers/specs/2026-11-05-layout-text-components-design.md) | [plan](docs/superpowers/plans/2026-11-05-layout-text-components.md) | dc4b4d6 | 2026-11-05 |
| 08 | Data components | §6.3, §6.6, §7, §8.4, §15.2 | 07 | done | removed | ctx_075e7f415cf0 | [design](docs/superpowers/specs/2026-11-05-data-components-design.md) | [plan](docs/superpowers/plans/2026-11-05-data-components.md) | 2e55ec8 | 2026-11-05 |
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

### 05 — ui-text: markdown and text renderer
- Built: `renderMarkdown` and `renderPlain` for all 24 components and the `md` block subset, with one cleaning pass and one escaper so document text stays inert. Both are pure, silent and total.
- Decisions: VD-050 to VD-057. VD-050 is a DEVIATION from §5.2, applying to `ui-text` only: a chart directly followed by a `table` sibling prints after it, because §19.3 puts the chart first and §19.5 prints it last. VD-052: text output hides nothing, except `checks.output` (last 20 lines, §6.5) and the §7 truncation of `code` and `path`. VD-053: how markdown stays inert. VD-057: declined findings, including bidi controls passing through.
- Evidence (coordinator rerun on `main` at 8cf1641): `pnpm gate` exit 0. Vitest 35 files, 2,457 tests, including the §19.5 byte comparison against the spec file. Playwright 1 test. Banned-API check clean on 31 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. Coverage: lines 100% (1667/1667), statements 99.68%, branches 98.92%. Spec hash unchanged.
- Coordinator probes on the merged build: 40 hostile strings put in the fields of a 13-node document, 80 renders. No control character reached either format. Through `marked` and `markdown-it`, no live tag, image or unsafe scheme; the only two hits were my own pattern matching a safely encoded `%22onclick=` inside an `http` href. Five of the 13 nodes used wrong field names, printed `Could not render` and tested nothing, so `kv`, `diff`, `flow`, `timeline` and the `code` body are covered only by worker evidence. A 410 KB document rendered in 12 ms.
- Worker evidence, not rerun: 642 snapshots over 321 valid cases; all valid, notice and invalid corpus documents render with no throw and no logging; 37 hand mutants killed; 40,000 fuzzed plus 400 fixed documents through `marked`, `markdown-it` and `cmark-gfm` with no live tag, image or unsafe scheme. That fuzz is not part of the gate.
- Review: fresh reviewer found 1 Critical (control characters removed after escaping produced live HTML) and 6 Important issues, all fixed red to green. The fixes had no second review.
- Corrections to worker notes: VD-056's DOM `tree` is task 10, not task 11; VD-057's flag belongs to the CLI, task 12, not task 13.
- Follow-ups: task 07 follows VD-054 for `md`; task 08 follows VD-055 for sort and alignment; task 10 follows VD-056 for `tree.paths`. The DOM keeps §5.2 order, since VD-050 applies to text only. These helpers live in `ui-text`, which `ui-render` cannot import (§3).

### 06 — ui-render core
- Built: `el()`, `prepare` and `sanitize`, `createRenderer` with the §9.1 API, per-node isolation, the cooperative watchdog, placeholder and error cards, diagnostics badge and panel, fold state, §8.1 tokens and CSS, an empty `COMPONENTS` registry for tasks 07 to 10, and the Orca shell harness with Orca's vendored bootstrap in a sandboxed iframe. `ui-spec` gained `inspect()`, `MAX_ISSUES`, `clip`, `setOwn`, `isLocale` and the `render-failed` and `render-budget` codes.
- Decisions: VD-058 to VD-066, with three DEVIATIONs. VD-058: `.light` and `class=""` mean light on a dark OS. VD-059: new `--vui-*-text` tokens, because `#16a34a` and `#d97706` give only 3.30:1 and 3.19:1 on white; §8.1 tokens stay exact as fills. VD-066: text over 1 MiB is refused, not truncated.
- Evidence (coordinator rerun on `main` at b65c54d): `pnpm gate` exit 0. Vitest 46 files, 4,765 tests. Playwright 72 tests. Banned-API check clean on 46 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. Overall coverage: lines 99.9% (2171/2173), statements 99.4%, branches 98.27%. Spec hash unchanged.
- Coordinator probes on f1d5ec7: recomputed both contrast ratios above. Mutants: watchdog budget to 2,000,000 ms failed 5 tests; tone text share to 95% failed 3 tests; error card tint failed 12 visual tests; `--vui-warn`, which has no host source, failed 8 visual tests. Changing the fallback values of `--vui-border` and `--vui-err` failed no visual test, because the harness theme supplies `--border` and `--destructive`; pixel baselines therefore never exercise fallbacks on hostable tokens, and only `tokens.test.ts` covers them. Inspected the worker's Orca dark screenshot and one baseline (`cards-360-light`): isolation cards and diagnostics read correctly.
- Not checked by coordinator: §8.1 and §13.4 were not reread during integration, because the shell read was denied; token exactness rests on `tokens.test.ts`. Coordinator did not repeat the live Orca pane check.
- Worker evidence, not rerun: all 9 acceptance criteria tested; `ui-render` lines 99.6% (498/500); 9 of 9 mutants killed before the review fixes; real Orca pane heights 429 and 356; a 20-node update at about 0.3 ms with fixture components only. A sample of the 48 baselines was inspected, not all.
- Review: fresh reviewer found no Critical issues, 4 Important and 9 minor, each reproduced. Fixes and declines are in VD-066.
- Incidents: a transient `EAI_AGAIN` stopped the worker once, and `send` resumed it. A held cross-session message from a claude-mem observer (pid 6844) opened a prompt in the worker's terminal; the coordinator did not answer it, and the worker finished and reported anyway. The coordinator's note to the worker stayed undelivered, as the worker had already reported.
- Follow-ups: task 07 decides what `tone` draws on a node, and components must apply their own defaults, since `maxLines` can be absent after a drop. Tasks 08 and 22 guard `sort`, `group`, row options and flow edges left dangling by a cut. Task 11 owns a dark standalone page (§8.3) and should add pixel coverage with no host tokens. Task 16 may drop vendoring only if the harness still runs Orca's real bootstrap. Task 21: §17.4's Chromium 110 floor may predate `color-mix()`, which §8.1 mandates (from memory, untested). CI: baselines come from this WSL machine, so a runner with other fonts needs one regeneration with `--update-snapshots=all`.

### 07 — Layout and text components
- Built: `stack`, `grid`, `section`, `card`, `tabs`, `divider`, `md`, `callout`, `code`, with the §9.3 copy chain, and frame-level `tone`. `parseMd` moved to `ui-spec` as a public export, so both renderers share one reader.
- Decisions: VD-067 to VD-073, no DEVIATION. VD-068: `tone` draws a 3 px bar plus a mark and hidden word. VD-069: `grid` collapses by its own width through `@container`, and spans clamp to `cols`. VD-070: every tab is in the Tab order, as §15.2 reads, with arrows as well. VD-073 changes VD-054: an ordered list keeps its first number, so `ui-text` output changed for lists not starting at 1.
- Evidence (coordinator rerun on `main` at dc4b4d6): `pnpm gate` exit 0. Vitest 52 files, 5,213 tests. Playwright 145 tests. Banned-API check clean on 53 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. Coverage: lines 99.95% (2360/2361), statements 99.48%, branches 98.44%. Spec hash unchanged.
- Coordinator probes: `ui-render` entry through esbuild, min and es2020, is 73.5 KiB and 25.2 KiB gzip, with no boot script (§9.5 limits 120 and 38 KiB); `ui-spec` is 40.1 KiB of that. Mutants on 14c10af: `maxLines` default to 40 failed 2 tests; inverted `aria-selected` failed 7; grid breakpoint to 300 px failed 7 e2e tests. Inspected the worker's dark Orca pane screenshot: all nine components read correctly.
- Worker evidence, not rerun: grid measured at 479 and 480 px; copy in Orca's sandboxed frame in Playwright; 20-node mixed document median 0.8 ms in headless Chromium, before the review fixes; 54 new baselines plus 30 changed, because real `md` and `stack` replaced the fixtures.
- Gaps: the Orca pane capture is from ff9525f, before the review fixes. The copy path has not been tried in a real Orca chat, only in Orca's shell under Playwright.
- Review: fresh reviewer found no Critical issues and 4 Important, all fixed test-first: copy lost blank lines while saying `Copied`, CRLF broke `md`, ordered lists always restarted at 1, and `grid` collapsed to 0 px in a shrink-to-fit target. Declined minors are in VD-073.
- Incident: a held cross-session prompt from a claude-mem observer opened in the worker's terminal again. It was left unanswered, and the worker finished regardless.
- Follow-ups: tasks 08 to 10: watch bundle size, since 12.8 KiB gzip remains for 15 components and the boot script, and `check-bundle-size` stays idle until task 11. Tasks 16 to 18: hosts must give the target a width (VD-073). Task 11: `#id` links into hidden tabs and closed folds go nowhere (VD-070); the §4.3 and §10.2 templates must set a background. Task 16: try copy in a real Orca chat.

### 08 — Data components
- Built: `table` with all §6.6 fields and the four cell types, `kv`, `stats` with a column sparkline, `list`, `progress`. Bars use 101 constant CSS rules, so no document value reaches `style`. Table reading moved to `ui-spec` (`parseRow`, `sortRows`, `alignOf`, `groupKey`, `badgeOf`), and the copy chain moved to `copy.ts`.
- Decisions: VD-074 to VD-080, no DEVIATION. VD-075 and VD-080 change `ui-text` output for `badge` cells: a status word in a `badge` cell now prints `✓ ok`, and `tones` over a status prints as in the DOM. VD-078: `stats.spark` draws columns, which task 09 may swap for its chart. VD-080: a table takes VD-073's host width requirement.
- Evidence (coordinator rerun on `main` at 2e55ec8): `pnpm gate` exit 0, run twice in a row because a wall-clock test failed on the branch once. Vitest 56 files, 5,401 tests. Playwright 199 tests. Banned-API check clean on 59 files. Schema up to date; runtime deps, versions and targets pass. `check-bundle-size: no bundle yet`. Coverage: lines 99.96% (2667/2668), statements 99.51%, branches 98.43%. Spec hash unchanged.
- Coordinator probes: `ui-render` entry through esbuild is 90.0 KiB min and 29.9 KiB gzip, with no boot script. No `style` attribute or `.style` use in `ui-render/src`. Mutants on 061c45a: pin threshold failed 1 test; `aria-sort` stuck at `none` failed 5; row `th` scope failed 2; fill scale failed 9. Inspected the worker's Orca pane capture: tables, cell types, groups and the wide table read correctly. The blank band above a scrolled wide table is its caption scrolling away (VD-076).
- Worker evidence, not rerun: all six acceptance criteria tested; 36 inspected baselines; the 1,000 × 6 first page at 2.7 ms warm, against the reviewer's 18 to 20 ms.
- Review: fresh reviewer found no Critical issues and 3 Important, all fixed: a screen-reader word escaping the table box grew the page by 1,300 px, a long pinned column left no other column reachable at 320 px, and a bad `tones` value threw from a click handler to the host. Declined minors are in VD-080.
- Test changed: task 07's `code.test.ts` long-mark test ran at 150 to 167 ms of the 200 ms budget and failed once. It now renders 1,500 rows, and a mutant with `Array.includes` still fails it (worker evidence).
- Follow-ups: tasks 09 and 10: 8.1 KiB gzip remains for 10 core components and the boot script, so size is now the tightest constraint. Task 09: decide whether to replace VD-078's sparkline. Tasks 16 to 18: the host width requirement now covers `table` and `kv` as well as `grid`. Task 20 owns axe-core (TASKS line 217); it is not installed yet, so the §16 accessibility gate has not run on any component.
