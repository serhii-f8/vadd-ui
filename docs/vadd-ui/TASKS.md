# vadd-ui task plan

Source of truth: `docs/specs/vadd-ui-technical-spec.md` (never edited). Decisions: `docs/vadd-ui/DECISIONS.md`.

Every task leaves `main` green: `pnpm gate` (defined in task 01: build, typecheck, lint, all tests, budget checks). Every task carries the universal definition of done from `CLAUDE.md`. Visual tasks add their components to the Orca shell harness from task 06 at widths 360, 720 and 1100 px, light and dark.

Dependencies are listed per task and always point to a lower ID. `PROGRESS.md` carries them in its table.

## Tasks

### 01 — Monorepo scaffolding
Slug `scaffold`. Depends on: none. Spec: §3 packages, §15.1 lint control, §16 tooling and CI.
- Create the workspace (VD-003, VD-005): `packages/ui-spec`, `ui-render`, `ui-text`, `ui`, `ui-viewer`, `ui-cli`, `ui-react` and `skills/vadd-ui`, with the dependency graph in §3, shared `tsconfig.base.json`, project references, Vitest projects (node and jsdom), Biome, Playwright with Chromium, esbuild.
- Acceptance:
  - `pnpm gate` runs build, typecheck, lint, all tests and budget checks and passes with one placeholder test per package.
  - A lint check fails on `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` and `new Function` in renderer packages; a fixture proves it fires. Biome alone is not enough if it cannot express this: add a small script.
  - A script fails on any runtime dependency in `ui-spec`, `ui-render` or `ui`.
  - A bundle-size check script exists, reports "no bundle yet" until task 11 and enforces §9.5 afterwards.
  - The renderer packages compile to ES2020; Node code targets Node 20.
  - All packages share one version number; a check fails on drift.
  - `.github/workflows/ci.yml` runs the gate on every push and PR (VD-010).

### 02 — ui-spec: parser, envelope, normalizer
Slug `spec-parser`. Depends on: 01. Spec: §2, §5 intro, §5.1, §5.2, §5.3.
- TypeScript types for the canonical form (including all 24 components, Status, Tone), the relaxed-JSON parser, the normalizer. The normalizer keeps a canonical-to-input path map, because §13.2 requires diagnostics to point at the input as written.
- Acceptance:
  - The parser accepts exactly the JSON5 subset in §5.1, rejects hex, `Infinity`, `NaN` and multi-line continuations, and reports line and column.
  - All six shorthands of §5.3 and all envelope defaults of §5.2 are unit tested; canonical output is strict JSON with every default explicit.
  - No DOM and no I/O in the package.
  - Line coverage ≥ 95% on the new code.

### 03 — ui-spec: validator, diagnostics, limits, schema, conformance
Slug `spec-validator`. Depends on: 02. Spec: §5.4, §6 field rules, §13.1–13.4 (CLI limits), §16 conformance, §17.1, §19 examples as corpus.
- Hand-written walker for the common node fields and the field rules of all 24 components including `ext`, diagnostics with hints, JSON Schema (draft 2020-12) generated from the types at build time, conformance corpus harness.
- Acceptance:
  - `Diagnostic` matches §13.2; messages ≤ 120 chars; paths refer to the input before normalization.
  - Severity matches §13.3; unknown fields are `info`; every §13.4 limit is an `error` with a stable code that lets the CLI map it to exit 3.
  - Suggestions use Levenshtein ≤ 2 against types, fields and enum values.
  - Forward compatibility per §17.1: unknown component, field and enum behaviors tested.
  - Corpus has ≥ 150 valid and ≥ 150 invalid documents with expected canonical output and expected diagnostic codes, including all §19 examples; schema and walker agree on every case; a test proves the schema is regenerated from the types. Note: TypeScript 7 may lack the compiler API that schema generators need; log the solution as a decision.
  - Line coverage ≥ 95%.

### 04 — ui-spec: value formats, inline text, status tokens
Slug `spec-formats`. Depends on: 03. Spec: §5.5, §7 formats, §7 null and invalid values, §16 unit gate.
- Acceptance:
  - Every format in the §7 table is tested across `en-US`, `pl-PL`, `uk-UA`, with `Intl` only; the spec's example outputs are reproduced.
  - `delta` tone rules, including `better:low`; the combined syntax of a base format plus `better:low` is unspecified: decide and log it.
  - Null renders as an em dash in muted tone; wrong-type values render raw and add a `warn`; formats never throw.
  - Inline text is parsed to a token tree (never an HTML string); raw HTML stays text; all link schemes other than `http`, `https`, `mailto` stay text.
  - `rel` uses `generatedAt` as now, so output is deterministic.
  - Package coverage gate of 95% lines is enforced in `pnpm gate`.

### 05 — ui-text: markdown and text renderer
Slug `ui-text`. Depends on: 04. Spec: §4.5, §16 text renderer.
- Acceptance:
  - Renders every core and `ext` component to GitHub-flavored markdown and plain text.
  - Reproduces §19.5 for the §19.3 document, applying `sort` and row tones.
  - Snapshots match for the whole valid corpus.
  - Never logs document contents; never throws on corpus input.

### 06 — ui-render core
Slug `render-core`. Depends on: 04. Spec: §3 pipeline, §4.2 renderer constraints, §8.1–8.3, §8.4 general rules, §9.1, §9.3, §13.4 renderer truncation, §15.1 `el()`/links/no network/watchdog, §15.2 contrast and motion, §16 Orca shell harness.
- `el()` with attribute whitelist, the pipeline, `render()` and `RenderHandle`, per-component error isolation, placeholder and error cards, diagnostics badge and panel, fold state, `--vui-*` tokens and CSS, light and dark, the component registry, the visual-regression harness.
- Acceptance:
  - The `RenderOptions` and `RenderHandle` API matches §9.1; `update` keeps fold and sort state by node id.
  - Tokens match §8.1 exactly, declared on `.vui-root`, never on `:root`, with `var()` fallbacks; theme handling follows VD-007.
  - The Orca shell harness reproduces Orca's exact CSP, theme style element, `.dark` toggle and height bootstrap from the sources named in §4 (VD-009). Passing means: renders, no CSP violations, reported height equals content height ± 1 px, a live theme switch restyles without a re-render.
  - Determinism test: same document and `now` produce the same DOM.
  - A throwing component yields an inline error card for that node only; `render` never throws to the host.
  - Watchdog per VD-008: a component over 200 ms becomes an error card.
  - CI test: default tones reach 4.5:1 against `--vui-surface` in both schemes.
  - No viewport units, `position: fixed`, `localStorage`, cookies, `postMessage` or network calls; animation ≤ 150 ms and off under `prefers-reduced-motion`.
  - Pixel diff ≤ 0.1% enforced by the harness.

### 07 — Layout and text components
Slug `components-layout`. Depends on: 06. Spec: §6.1, §6.2, §8.4 grid, §15.2 folds and tabs.
- `stack`, `grid`, `section`, `card`, `tabs`, `divider`, `md`, `callout`, `code`.
- Acceptance:
  - `grid` collapses to one column under 480 px; `cols` and child-count auto work.
  - `md` covers the inline subset, h3–h4, lists, blockquote, fenced code, as nodes only.
  - `code`: copy with the §9.3 fallback chain, `lines`, `mark`, `maxLines` default 30 then fold.
  - Tabs and folds use `aria-selected`/`aria-expanded` and are keyboard reachable in DOM order.
  - Visual baselines for each component.

### 08 — Data components
Slug `components-data`. Depends on: 07. Spec: §6.3 core, §6.6, §7 cell types, §8.4 wide tables, §15.2 table semantics.
- `table`, `kv`, `stats`, `list`, `progress`.
- Acceptance:
  - All §6.6 table fields work: sort (header click, `aria-sort`), `pageSize` "Show N more", `totals`, `group`, `sticky` default, row options.
  - All four cell types; `bar` scaling per §7; `badge` via status or `tones`; the `style` attribute is never set from document values.
  - Real `<table>`, `<th scope>`, `<caption>`.
  - Wide tables scroll in their own container; first column sticky over 4 columns.
  - Status is never color alone: icon and label everywhere.
  - Visual baselines for each component.

### 09 — Charts
Slug `charts`. Depends on: 08. Spec: §6.4 core, §9.4, §15.2 chart accessibility.
- `bar`, `hbar`, `stacked`, `line`, `area`, `donut`, `spark`.
- Acceptance:
  - All colors resolve through `var()`; nothing reads computed colors; a live theme switch restyles without a re-render.
  - Nice 1-2-5 ticks, ≤ 6 y-ticks, x-label thinning.
  - Tooltip shows the x label and every series value through `yFormat`.
  - LTTB downsampling to 1,000 with tooltips on the nearest original point, unit tested.
  - One shared `ResizeObserver`.
  - `role="img"`, `<title>`, generated `<desc>` in the §15.2 wording, hidden data table.
  - `refLines`, `stackTotal`, `height`, `legend`, series-color repeat behave per §6.4.
  - Visual baselines for each kind.

### 10 — Dev-workflow components
Slug `components-dev`. Depends on: 09. Spec: §6.5 core, §6.7, §8.4 decision.
- `checks`, `plan`, `diff`, `tree`, `timeline`, `decision`, `log`.
- Acceptance:
  - `checks` strips ANSI, folds output, shows the last 20 lines.
  - `plan` header shows done/total, with nested children.
  - `diff` shows files, change markers and folded hunks.
  - `tree` accepts items or `paths`.
  - `log` highlights levels, `maxLines` default 40.
  - `decision` options sit side by side, stack under 600 px, mark the pick, and contain no answer control (D8).
  - §19.1 and §19.2 render in the harness.
  - Visual baselines for each component.

### 11 — @vadd/ui bundle and boot script
Slug `ui-bundle`. Depends on: 10. Spec: §4.3, §9.2, §9.5 size budget.
- Acceptance:
  - IIFE `dist/vui.min.js` and ESM build.
  - Boot behavior matches §9.2 steps 1–4, `window.VUI = { render, version }`, no global listeners beyond component needs.
  - A file opened through `file://` and through a static server renders correctly in both schemes.
  - `vui.min.js` including CSS ≤ 120 KiB minified and ≤ 38 KiB gzip, enforced in `pnpm gate`.
  - Bundle grep for banned constructs passes.

### 12 — CLI core
Slug `cli-core`. Depends on: 05, 11. Spec: §10 intro and table, §10.1, §11.1 (`render`, `validate`, `catalog`, `schema`, `extract`), §11.3, §11.4, §15.1 embed escaping, §17.2 `meta`.
- Acceptance:
  - Each command works with stdin and files, with `--json` on every command.
  - Diagnostics print as §11.3: ≤ 20 lines, then a count.
  - Exit codes match §11.4 for every path, tested.
  - `render --format html` writes the §10.1 layout; `</`, `<!--`, U+2028 and U+2029 are escaped; `vui extract` round-trips.
  - `catalog` covers all 24 components from data in `ui-spec`.
  - Files over 500 KiB exit 3; `meta.generator` and `meta.version` are stamped.
  - Node ≥ 20, no native dependencies.

### 13 — Viewer server
Slug `viewer-server`. Depends on: 11. Spec: §4.1 process model, state directory, network, URL and auth, HTTP interface, §15.3.
- Acceptance:
  - All routes in §4.1 plus the additions in VD-006; the request handler is exported so another server can mount it (VD-004).
  - State directory, `viewer.json` mode 0600, `docs/<seq>-<slug>.vui.json`, retention of 500 documents or 50 MiB.
  - Binds `127.0.0.1`, first free port in 47100–47199 or `VUI_PORT`; `--bind 0.0.0.0` warns on every start.
  - `Host` check, 404 outside the token prefix, bearer write token, no CORS, exact CSP.
  - SSE `doc`, `hello`, heartbeat every 15 s, `Last-Event-ID` support.
  - POST ≤ 256 KiB (VD-012), ≤ 20 writes/s, ≤ 50 SSE clients.
  - Idle exit after 4 h, tokens rotate on every start, `/favicon.ico` → 204.
  - One test per row of the §15.3 table.

### 14 — Viewer feed app
Slug `viewer-feed`. Depends on: 13. Spec: §4.1 feed app.
- Acceptance:
  - Newest at the bottom, auto-scroll unless the user scrolled up.
  - Each entry has title, time, branch, cwd, fold toggle, "open standalone", "copy spec".
  - Each document renders in its own shadow root.
  - SSE reconnects with backoff and fills gaps with `after=<lastSeq>`.
  - Theme follows `prefers-color-scheme`; a manual toggle lives in memory and works in both directions (VD-007).
  - Inline `data:` favicon; no CSP violations in Playwright.
  - Checked in the Orca browser pane against a live server.

### 15 — vui show, host routing, viewer lifecycle, doctor
Slug `vui-show`. Depends on: 12, 14. Spec: §3 Viewer data flow, §4.0, §4.1 opening the pane and custom endpoint, §11.1 (`show`, `viewer`, `doctor`, environment detection), §11.2 Viewer line, §16.1 scenario groundwork.
- Acceptance:
  - Host selection order from §4.0; exit 4 when no host is usable.
  - Detached Viewer start with own process group and log file; second show reuses it; killed Viewer restarts.
  - A document appears in the pane in ≤ 1 s, measured.
  - Pane opens only when `clients` is 0, with the fallback chain in §4.1 and §17.3; Orca executable resolved per VD-011; `browserPageId` recorded.
  - stdout is exactly one line as in §11.2, plus the URL line where specified.
  - `vui viewer start|stop|status|open|url`.
  - `vui doctor` reports the §11.1 checks, including the Windows reachability check in WSL, and a fix per failure. It works under both NAT and mirrored networking; this machine is mirrored.
  - `VUI_VIEWER_URL` and `VUI_VIEWER_TOKEN`.
- From this task on, workers report their own evidence through `vui show` where the feature exists.

### 16 — orca-chat adapter and file host
Slug `orca-chat`. Depends on: 15. Spec: §3 Orca chat data flow, §4.2 file and directive constraints, §10.2, §11.2 directive line, §11.5, §17.3 `host/orca.ts`.
- Acceptance:
  - `--host orca-chat`, `--host file --dir`, and auto-selection through `ORCA_CHAT_SCRATCH_DIR` when writable.
  - File names satisfy §4.2 and §11.5 under a property test; title sanitized for the directive.
  - Files over 500 KiB exit 3; document also posted to a running Viewer.
  - `vui render --cdn` writes the §10.2 template.
  - `packages/ui-spec/src/host/orca.ts` (VD-009) holds the directive grammar, file-name rule, size limits, CDN allowlist and token list, pinned to the Orca version read.
  - Generated files pass the Orca shell harness.

### 17 — Agent skill
Slug `agent-skill`. Depends on: 16. Spec: §12.1–12.4.
- Acceptance:
  - `skills/vadd-ui/SKILL.md` with the exact §12.1 frontmatter, ≤ 1,800 tokens measured.
  - All seven behaviors of §12.2, all rules of §12.3 and the precedence statement of §12.4 are present; a test checks each clause.
  - Install path documented for `~/.claude/skills/` and `.claude/skills/`.
  - The skill never branches on WSL, SSH or Orca mode.

### 18 — ui-react and the Viewer HTTP contract
Slug `ui-react`. Depends on: 11, 13. Spec: §4.4. See DEVIATION VD-004.
- Acceptance:
  - `<VuiView doc theme onDiagnostics />` per §4.4, mounted in a shadow root, React 18+, tested on 18 and on the current React.
  - `@vadd/ui-viewer` exports a contract test suite for the §4.1 HTTP interface and the mountable handler.
  - A Fastify test server on `127.0.0.1` mounts the handler, passes the contract suite, and `vui show` delivers to it through `VUI_VIEWER_URL`.
  - `docs/vadd-ui/VADD_INTEGRATION.md` lists the exact steps to wire `/var/www/html/vadd`; that repository stays untouched.

### 19 — vui bench, corpus, token budgets
Slug `bench`. Depends on: 17. Spec: §11.1 `bench`, §14.1–14.3.
- Acceptance:
  - ≥ 20 reference cases covering every core component, each with VUI, markdown and hand-written HTML encodings.
  - Token counts come from the Anthropic token-counting API when a key is configured, otherwise a pinned offline tokenizer with no native dependency; the report states which.
  - Every §14.2 budget is measured and met, including `vui catalog <type>` ≤ 300 tokens per component.
  - `pnpm gate` fails on a regression over 5% against a committed baseline.

### 20 — Hardening
Slug `hardening`. Depends on: 15, 18, 19. Spec: §9.5 timing and memory, §15.1 XSS corpus, §16 visual regression (full set), accessibility, fuzzing, security, budgets.
- Acceptance:
  - Structure-aware fuzzer at 100k cases per run: the renderer never throws to the host, the CLI exits only 0–5.
  - XSS payload corpus through every text field: no script executes; bundle grep clean.
  - axe-core over all visual-regression pages: zero serious or critical.
  - Visual regression covers every core component and all §19 examples at 360, 720, 1100 px, light and dark, pixel diff ≤ 0.1%.
  - Timing and memory budgets from §9.5 are measured in headless Chromium and gated with ≤ 5% regression. The hardware differs from the spec's reference laptop: record it.
  - §14.2 ratio budgets left unmet by task 19 (VD-155, VD-157): fix at the cause where the format allows it (for example a positional form for `stats` and `kv` items), remeasure with `vui bench`, update the baseline, and record whatever remains unmet as a DEVIATION. Never pad or re-scope the measurement.

### 21 — Host matrix and release preparation
Slug `release-prep`. Depends on: 20. Spec: §1 goals audit, §10.3, §15.1 CDN controls, §16 agent eval and Orca end-to-end, §16.1, §17.2, §17.3 contract job, §17.4.
- Acceptance:
  - Scenario script for §16.1, run for real on every cell this machine can reach (Windows 11, WSL 2, mirrored, terminal in Orca; Linux-style terminal outside Orca); all others listed with exact manual steps.
  - Windows, macOS and Linux CI jobs and the scheduled host-contract job written, including the `orca tab create --help` check.
  - Publish configuration with provenance, `@vadd/ui` `dist/vui.min.js` path; no publish.
  - Agent eval harness with 40 prompts per §16; runnable, run if it needs no credential the machine lacks, otherwise listed as a user action.
  - Orca end-to-end checklist written for the user.
  - Goals and non-goals audit with evidence links; runtime support statement per §17.4.

### 22 — ext components
Slug `components-ext`. Depends on: 21. Spec: §6.3 `compare`, §6.4 `scatter`, §6.5 `flow`.
- Acceptance:
  - `compare` highlights the winner, honoring `better`; `scatter` follows chart rules from §9.4; `flow` lays out ≤ 40 nodes in layers, with no dependency.
  - Text rendering, corpus, visual, axe and fuzz coverage extended.
  - All bundle and timing budgets still hold; if a budget cannot hold, `ext` ships in a separate lazily embedded build and the decision is logged.

### 23 — Core chart robustness
Slug `chart-robustness`. Depends on: 22. Spec: §9.3, §9.4, §16. Added by the coordinator after task 22 (follow-up of VD-180 and VD-184).
- Acceptance:
  - A core `chart` whose `height` is an object, array or other non-string (for example an object with a non-callable own `toString`) renders at the default height instead of throwing `render-failed`; tests are seen failing first.
  - No other spot in the core renderer coerces a document value with `String()`, template interpolation, `+` or arithmetic before checking its type; each one found is fixed the same way, or logged as safe with the reason.
  - `vui.min.js` stays within §9.5 (≤ 120 KiB minified, ≤ 38 KiB gzip; about 260 bytes of gzip headroom at the start).
  - The fuzz run covers the new cases, and `pnpm gate` is green.

### 24 — Design polish (renderer and Viewer)
Slug `design-polish`. Depends on: 23. Spec: §4.1, §6, §8.1, §9.4, §9.5, §15.2. Added by the coordinator after the 2026-11-16 Orca WSL end-to-end run and a design critique of its 18 visuals (VD-190).
- Acceptance:
  - Viewer entry chrome is compact: one meta line (time · branch · the workspace path shortened to its last two segments, full path in `title`), and Fold / Open standalone / Copy spec as one small right-aligned group on the title row that wraps below the title at 390 px. Content, not chrome, dominates a feed of 18 entries.
  - Bar charts cap bar width (no bar fills a whole band); a single-series bar chart with ≤ 12 bars labels each value, formatted with `yFormat`. Line charts with ≤ 30 points show point markers. §9.4 holds (ticks, tooltip, `<title>`/`<desc>`, hidden table), and output stays deterministic.
  - `log` styles `FATAL`, `CRITICAL` and `PANIC` lines as at least as strong as `ERROR` (§6 lists only four prefixes; log the decision).
  - Every status token renders the same pill shape, `run` and `wait` included.
  - A `stats` tile or `card` nested directly inside a `card` or `grid` tile drops its own border and background, so no double frames, and a tone shows once.
  - `decision` options with no pros, cons or meta do not reserve empty height.
  - Before/after screenshots in Orca's browser pane, light and dark, and at 390 px; axe clean in both themes; tone text still meets §15.2.
  - `vui.min.js` stays within §9.5 (≤ 38,912 B gzip by `gzip -9`, about 200 B of headroom at the start), so changes must be net neutral or trade bytes; `vui-ext.min.js` and the Viewer keep their checks. Visual snapshots updated on purpose, and `pnpm gate` is green.

### 25 — CI green on GitHub (Linux, macOS, Windows)
Slug `ci-green`. Depends on: 24. Spec: §16, §16.1, §17.4. Added by the coordinator after the first GitHub Actions runs of `.github/workflows/ci.yml` failed (VD-202). Run 43909607804 on commit 577584b: `gate` (ubuntu) 2 failures, `portable (macos-latest)` 42, `portable (windows-latest)` well over 100; `engines` passed.
- Acceptance:
  - `gate` (ubuntu): `ui-viewer/test/contract.test.ts` "reports an unreachable server as failures, not a throw" passes. On Node 22 a refused connection to `localhost` is an `AggregateError` with an empty `message`; the contract runner must report a useful error (the code, or the inner errors), so this is a product fix, not a test edit. `ui-render/test/components/unchecked.test.ts` "neither fails a node nor draws NaN" no longer times out on a GitHub runner (it took more than 180 s; VD-199): make it fast enough, or split it, without dropping coverage.
  - `portable (macos-latest)`: `os.tmpdir()` is under the `/var` → `/private/var` symlink, while `workspaceOf` returns real paths, so test fixtures disagree with the code (hash, state dir, `--workspace`). Fix fixtures to use real paths (for example `realpathSync` in `packages/ui-cli/test/helpers.ts` `tempDir`, and any other `mkdtempSync` site that compares paths), and fix any product path that misbehaves under the symlink. All failures of that job pass.
  - `portable (windows-latest)`: every failure is either fixed in the product (a real Windows bug, for example spawning or finding the detached Viewer, its liveness check, `/proc` reads, path joins with `/`, `.cmd`/`.exe` resolution of the Orca CLI) or the test is made portable. A test may skip on `win32` only where the behavior does not exist there (POSIX modes such as 0600/0700, `chmod` read-only directories, signals Windows lacks, `/proc`), with the reason in the skip and a decision logged. Tests that time out at 5 s because the Viewer never starts must be traced to the cause, not given a longer timeout, unless the cause is proven to be runner slowness.
  - The full failure lists are in the logs saved by the coordinator (paths in the dispatch). Every failing test in those logs is accounted for in the report: fixed, made portable, or skipped with a reason.
  - Nothing changes in the §9.5 bundle budgets (the core bundle has about 2 B of headroom); renderer packages keep their rules.
  - `pnpm gate` is green locally (WSL). The worker cannot run Windows or macOS, and must not push: it reports the commits, and the coordinator verifies on GitHub after the user pushes.

### 26 — Stability fixes: Viewer, CLI and skill
Slug `stability-cli`. Depends on: 25. Spec: §4.1, §11.1, §11.3, §11.4, §12.1, §16. Added by the coordinator from the 2026-11-20 stability assessment (VD-209). The full findings, with repro steps, are in `/var/www/html/vui-testbed/FINDINGS.md` (a test project with the 1.0.0 tarballs installed; reuse it for checks). Packages: `ui-cli`, `ui-viewer`, `skills/vadd-ui`, `docs/`. Do not touch `ui-spec`, `ui-render`, `ui-text` or `ui`: task 27 runs in parallel there.
- Acceptance:
  - **B1.** After a graceful `vui viewer stop`, the next `vui show` reuses the Orca pane: it moves the remembered tab to the new URL (`"pane":"moved"`) instead of opening a second one. Cause: `ui-viewer/src/server.ts:274` deletes `viewer.json`, which holds `browserPageId`, so `previousPane()` finds nothing. Keep the pane id across a graceful stop without making a stopped Viewer look alive to `status` or liveness checks. Covered by a test of the stop → show sequence. The crash path stays `moved`.
  - **B9.** The Viewer's theme toggle is remembered across reloads in `localStorage`, with every access in try/catch; with storage blocked, it falls back to the OS scheme. This is Viewer chrome, not the renderer, so §9.3's no-storage rule does not apply (log it).
  - **B10.** `vui show --host file --dir D` creates `D` (recursively) when it is missing. I/O errors print a sentence, not a bare code: `vui: cannot read nope.vui: no such file` rather than `ENOENT`. Same exit codes (5).
  - **B11.** Viewer routes that answer GET also answer HEAD, with the same status and headers and no body.
  - **B14.** Find why `~/.local/state/vadd-ui` collects empty workspace folders (104 on this machine, dated like test runs), and fix the leak at its source: tests must never write to the real state root. The Viewer or CLI must also not leave an empty workspace folder behind for a workspace that never stored a document. Do not delete the user's existing folders; report the count.
  - **Catalog.** `vui catalog common` lists the common node fields with their allowed values (`fold: open|closed`, …), and `vui catalog formats` lists every format with its argument syntax (`money:USD`, `delta:pct`, …), both with `--json`. `vui catalog <unknown>` suggests the closest name. The skill cheat-sheet points to both.
  - **`--name`.** `--name` is documented in `docs/` and the CLI README. New `--replace` (requires `--name`): on the Viewer host it updates the existing feed entry with that name in place (same entry, new content, live in the open feed) instead of adding a new one; with no such entry, it adds one. On the file and orca-chat hosts it is accepted and does nothing extra (state that in help). DEVIATION from §11.1; log it.
  - **Doctor.** `vui doctor` prints each check as it finishes (stderr in human mode, unchanged `--json`), so the about 20 s Windows reachability probe is not silent, and `--quick` skips that probe (reported as `skipped`).
  - **Validate.** A successful `vui validate` prints `ok` (with the warning count when there are warnings) in human mode; `--json` is unchanged.
  - **Skill and docs (B2 text).** The skill and `docs/embedding.md` say plainly that `vui-ext.min.js` replaces `vui.min.js` and must not be loaded alongside it. The skill notes that the CDN template works only after the npm release (pending the user).
  - Token budgets for the skill (§14.2) still pass. `pnpm gate` is green. Verify B1, B9 and `--replace` in the real Orca pane from `/var/www/html/vui-testbed`, after reinstalling the tarballs there.

### 27 — Stability fixes: renderer, formats and validator
Slug `stability-render`. Depends on: 25. Spec: §5.4, §5.5, §6.3, §6.4, §6.5, §7, §8.4, §9.2, §9.3, §9.5, §13.1, §16. Added by the coordinator from the 2026-11-20 stability assessment (VD-209). The findings, with repro documents (`docs/report.vui`, `docs/kitchen.vui`, `web/index.html`), are in `/var/www/html/vui-testbed/FINDINGS.md`. Packages: `ui-spec`, `ui-render`, `ui-text`, `ui`. Do not touch `ui-cli`, `ui-viewer` or `skills/`: task 26 runs in parallel there.
- Acceptance:
  - **Budget first.** `vui.min.js` is at 38.0 KiB gzip against the §9.5 limit of 38 KiB. Every byte added below must be paid for by savings in the core bundle (measure with `scripts/check-bundle-size.mjs` at each step). If an item cannot fit after a real effort, it may live only in `vui-ext.min.js` with the core degrading gracefully, logged as a decision. The budget never moves.
  - **B2.** Loading `vui.min.js` and `vui-ext.min.js` on one page renders ext components (`compare`, `flow`, `scatter`), whichever order the two scripts load in: the ext bundle wins, and each document renders once. With only the core bundle, an ext-only node shows a card naming the cause, such as "`scatter` charts need vui-ext.min.js", not "Unknown component: chart".
  - **B3.** Stat items take `better: 'high'|'low'` (object form; default `high`, as now), which flips the delta's tone. The positional form stays as it is. Validator, schema, catalog and text/md renderers know the field. DEVIATION; log it.
  - **B4.** Charts take `tones: {seriesKey: tone}`, which colors a series with a tone's color, as table columns already do. Validator, schema and catalog know it. DEVIATION; log it.
  - **B5.** Scatter: the scales pad their domain, so no point is clipped at an edge, and the label (third tuple element) is visible (on the point or in its tooltip and accessible table).
  - **B6.** In narrow frames (360–420 px), formatted short values (`date`, `rel`, `num`, `int`, `pct`, `ms`, `bytes`, `money`, `sha`, `status`) do not wrap, and `path`/`code` cells break at `/`, `.`, `_` or `-` boundaries, not mid-word. Rows keep one line where the content allows.
  - **B7.** A document yields one diagnostic per problem: the render-time per-value `money` warning (and any similar per-value repeat) is merged with the validator's, so the Viewer and the CLI report the same count.
  - **B8.** A callout whose text starts with a status token does not show the tone icon as well; the same applies in text and md output (no `✗ ✗ fail`).
  - **B12.** The check output toggle's accessible name is "Output, Playwright" (no space before the comma); `ui-render/src/components/dev.ts:66`.
  - **B13.** A flow edge with a label is long enough for the label, which no longer covers the arrow.
  - **Hints.** An unknown field gets a "did you mean" hint where one exists, and `items` on `kv` says "kv takes pairs". The `fold` type error lists `open|closed`, and every enum type error lists its allowed values. The browser error card for an unknown type shows the same "did you mean" hint as the CLI.
  - **Text output.** Text and md renderings of charts keep the data in a compact form (per series: last, min and max, or the values when there are ≤ 8 points), not just "Line chart: p50, p95 over Mon–Fri".
  - **Progress.** With `segments` and no `max`, `max` defaults to the sum of the segment values.
  - **Inline.** `_italic_` renders as italic at word boundaries (CommonMark flanking rules), while `snake_case_names` and `a_b` stay literal. DEVIATION from §5.5; log it.
  - Visual baselines updated only where the change is intended, each inspected. Renderer rules hold (no `innerHTML`, `eval` or `new Function`; no new dependencies). `pnpm gate` green, `pnpm fuzz` clean, §9.5 timings within limits. Check the repro documents in the real Orca pane after reinstalling the tarballs in `/var/www/html/vui-testbed`.

## Coverage (spec requirement → one task)

| Spec | Requirement | Task |
|---|---|---|
| §1 | Goals, non-goals, scope (audit with evidence) | 21 |
| §2 | Terminology, media type, Status and Tone enums | 02 |
| §3 | Packages, dependency graph, no native dependencies | 01 |
| §3 | Data flow: Viewer host | 15 |
| §3 | Data flow: Orca chat adapter | 16 |
| §3 | Renderer pipeline | 06 |
| §4 intro | Host-agnostic renderer | 06 |
| §4.0 | Host selection, environment table | 15 |
| §4.1 | Process model, state dir, network, URL and auth, verified path, HTTP interface | 13 |
| §4.1 | Feed app | 14 |
| §4.1 | Opening the pane, custom endpoint (client) | 15 |
| §4.2 | Renderer constraints: network, navigation, sizing, theme, storage | 06 |
| §4.2 | Adapter constraints: availability, location, name, size, directive, per-reply | 16 |
| §4.3 | Standalone browser | 11 |
| §4.4 | `<VuiView>`, Viewer interface on another server | 18 |
| §4.5 | Degraded hosts | 05 |
| §5 intro, §5.1–5.3 | Syntax, envelope, shorthands | 02 |
| §5.4 | Nodes and common fields | 03 |
| §5.5 | Inline text, status tokens | 04 |
| §6 intro | Field rules and tiers for all 24 components | 03 |
| §6.1, §6.2 | Layout and text rendering | 07 |
| §6.3 | Data rendering (core) | 08 |
| §6.3 | `compare` | 22 |
| §6.4 | Charts (core) | 09 |
| §6.4 | `scatter` | 22 |
| §6.5 | Dev workflow (core) | 10 |
| §6.5 | `flow` | 22 |
| §9.3, §9.4 | Core chart robustness on hostile field values (VD-180 follow-up) | 23 |
| §6.6 | Table | 08 |
| §6.7 | Decision | 10 |
| §7 | Format functions, null and invalid values | 04 |
| §7 | Cell types | 08 |
| §8 intro, §8.1–8.3 | Tokens, live theme, spacing and type | 06 |
| §8.4 | Width range, no viewport units or fixed position | 06 |
| §8.4 | Grid collapse | 07 |
| §8.4 | Wide tables | 08 |
| §8.4 | Decision stacking | 10 |
| §9 intro, §9.1, §9.3 | No framework or dependencies, ES2020, public API, rendering rules | 06 |
| §9.2 | Boot script | 11 |
| §9.4 | Chart runtime | 09 |
| §9.5 | Bundle size budget | 11 |
| §9.5 | Timing and memory budgets | 20 |
| §10 intro, §10.1 | Delivery modes, inline layout | 12 |
| §10.2 | CDN template | 16 |
| §10.3 | Publishing | 21 |
| §11 intro | Agent-readable output, `--json` on every command, Node ≥ 20 | 12 |
| §11.1 | `render`, `validate`, `catalog`, `schema`, `extract` | 12 |
| §11.1 | `show`, `viewer`, `doctor`, environment detection | 15 |
| §11.1 | `bench` | 19 |
| §11.2 | Viewer output line | 15 |
| §11.2 | Directive output line | 16 |
| §11.3, §11.4 | Diagnostics format, exit codes | 12 |
| §11.5 | File naming | 16 |
| §12 intro, §12.1–12.4 | Agent skill, installation | 17 |
| §13 intro, §13.1–13.3 | Strict validation, lenient rendering, source of truth, diagnostics, severities | 03 |
| §13.4 | Limits in CLI and validator | 03 |
| §13.4 | Truncation in the browser | 06 |
| §14 intro, §14.1–14.3 | Token rules, budgets, measurement | 19 |
| §15 (no intro text) | Covered by the rows below | 20 |
| §15.1 | Lint control | 01 |
| §15.1 | `el()`, attributes, links, no network, watchdog | 06 |
| §15.1 | JSON embed escaping | 12 |
| §15.1 | CDN supply-chain controls | 21 |
| §15.1 | XSS corpus, bundle grep gate | 20 |
| §15.2 | Contrast test, motion | 06 |
| §15.2 | Folds and tabs semantics | 07 |
| §15.2 | Table and list semantics, status never color alone | 08 |
| §15.2 | Chart accessibility | 09 |
| §15.2 | axe gate | 20 |
| §15.3 | Viewer hardening | 13 |
| §16 | CI on every commit, tooling | 01 |
| §16 | Unit gate for `ui-spec` | 04 |
| §16 | Conformance corpus | 03 |
| §16 | Text renderer snapshots | 05 |
| §16 | Orca shell harness | 06 |
| §16 | Visual regression full set, accessibility, fuzzing, security, budget gate | 20 |
| §16 | Agent eval, Orca end-to-end | 21 |
| §16.1 | Host and environment matrix | 21 |
| §17 intro | Three independent version tracks | 21 |
| §17.1 | Format compatibility | 03 |
| §17.2 | One version, semver, CDN promise | 21 |
| §17.2 | `meta` stamping | 12 |
| §17.3 | `host/orca.ts` | 16 |
| §17.3 | Scheduled contract job, Viewer dependency check | 21 |
| §17.4 | Runtime support | 21 |

§18 is a non-normative decision record. §19 examples enter the corpus in task 03 and the visual set in task 20.
