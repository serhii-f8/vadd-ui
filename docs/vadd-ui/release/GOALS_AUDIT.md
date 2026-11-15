# Goals and non-goals audit (§1)

Audit of §1 against the code on `main` plus task 21, written 2026-11-15. Verdicts: **met** (evidence in this repo, run here), **met here, open elsewhere** (run here; other hosts are CI or manual), **not met** (measured and missed; a deviation). VD numbers are in `docs/vadd-ui/DECISIONS.md`; tasks and their reports are in `PROGRESS.md`.

## Goals

### Works in every environment the agent runs in — met here, open elsewhere

"Native Windows, macOS and Linux, WSL 2, SSH hosts, containers; Orca terminal mode, Orca chat mode, and terminals outside Orca. The same command and document format everywhere."

- Same command and format everywhere: one CLI (`packages/ui-cli`), host chosen by `vui show` (§4.0, task 15), never by the skill (`skills/vadd-ui/SKILL.md`, §12.2 rule 1). Environment detection changes hints and the opener only (`packages/ui-cli/src/environment.ts`).
- Run for real (`HOST_MATRIX.md`): WSL 2 mirrored in Orca, pass, 3 runs (warm 67–78 ms; cold 1.6–1.9 s, Orca creating the pane, VD-129); Linux-style terminal outside Orca, pass, 3 runs (cold 181–199 ms, warm 72–74 ms).
- Orca chat mode: proved in the vendored Orca shell only (VD-063, VD-135, `e2e/orca-chat.spec.ts`); the real chat is `ORCA_E2E_CHECKLIST.md`.
- Native Windows, macOS, WSL NAT: CI jobs `portable` and `wsl-nat` are written and validated, never run (no remote, VD-010); manual steps A, B, D in `HOST_MATRIX.md`. SSH and containers: manual steps E and F.
- Open: everything in the last two bullets; Windows `EACCES` port search (VD-118).

### Token efficiency — not met (ratio budgets), DEVIATION

"A visual costs roughly as many tokens as the data it shows. Target: at least 5× fewer output tokens than equivalent hand-written HTML (§14)."

- Met: fixed overhead via `vui show` 23 ≤ 30 tokens, CDN 65 ≤ 70, `SKILL.md` 1,705 ≤ 1,800, `vui catalog <type>` at most 286 ≤ 300 (VD-165; `scripts/token-baseline.json`, gated by `scripts/check-token-budgets.mjs` in `pnpm check`).
- Not met: spec vs markdown worst case 1.582 against ≤ 1.2; spec vs hand-written HTML worst case 0.425 against ≤ 0.2 (VD-155, VD-157, VD-165). Corpus totals: 1.404 and 0.252. Counted with the offline estimator; a real Claude count needs an `ANTHROPIC_API_KEY`, which this machine lacks (VD-149, `RELEASE_CHECKLIST.md`).
- So the "5× fewer than HTML" target holds for the corpus as a whole (0.252 ≈ 4×) and for row-heavy content (`chart` 0.147), not per case. Open release-gate deviation for the spec owner.

### Native look — met

"Visuals follow the host theme without the agent writing CSS: live Orca tokens in Orca chat, an Orca-matched palette with light/dark in the Viewer."

- Tokens through `var()` with fallbacks, never redefined (§8.1, task 06); live theme switch restyles without re-render in the Orca shell harness (`e2e/orca-shell.spec.ts`, `e2e/visual.spec.ts` "a live theme switch lands on the other scheme, pixel for pixel").
- Viewer palette, light and dark, with a manual toggle (task 14; `e2e/viewer-feed.spec.ts`); standalone dark follows `prefers-color-scheme` (task 11; `e2e/bundle.spec.ts`; now also Firefox and WebKit, `e2e/engines.spec.ts`).
- Contrast: tone text derived to meet 4.5:1 (VD-059); axe-core zero serious/critical on every visual page (VD-167).
- Caveat: tints need `color-mix()`, absent in Chromium 110 (`RUNTIME_SUPPORT.md`, VD-177).

### Reliability — met for rendering; agent first-try rate measured below target

"Agents produce a valid spec on the first try in ≥ 98% of cases. Invalid input degrades visibly and never renders a blank frame."

- First try, measured by the §16 agent eval (`AGENT_EVAL.md`, 2026-11-15, Claude Code with Opus, 40 prompts): of the 33 runs that showed a visual, 32 were valid on the first `vui show` (97.0%) and 33 after one retry (100%); 0 hand-written HTML. **Below the 98% target by one case** (an agent put a JavaScript `.filter()` call inside the document; the CLI rejected it with a line and column, and the retry passed). 7 runs answered in markdown instead; 2 of those were cases §12.2 says should be visual. One run of 40 prompts; open for the spec owner and a skill follow-up.
- Never a blank frame: unknown components render placeholders (VD-033, §17.1); a component that throws becomes an error card (`packages/ui-render/src/build.ts`); render watchdog (VD-008); the fuzzer, 100,000 structure-aware cases (VD-166), checks that the renderer never throws, never draws `NaN`, and the CLI exits 0–5 only. Task 21's `pnpm fuzz` run found one case where a `spark` chart's unknown `x` made the chart throw (shown as an error card, so no blank frame, but a §16 finding); fixed in `packages/ui-render/src/chart/model.ts` with a regression test, and the seed replays clean.
- Strict CLI, lenient renderer (D9): diagnostics with JSON Pointer paths and hints (§13, tasks 03 and 12).

### One renderer everywhere — met

"Viewer, Orca chat, plain browser and VADD web share a single implementation."

- `@vadd/ui-render` is the only DOM renderer. The Viewer feed renders each document with it in a shadow root (task 14); visual files inline `vui.min.js`, which bundles it (tasks 11 and 12, VD-097, VD-115); `<VuiView>` mounts it in a shadow root (task 18, VD-145). Canonical form comes from `@vadd/ui-spec` everywhere (§3 pipeline).
- `scripts/check-runtime-deps.mjs` holds the §3 dependency graph in `pnpm check`.

## Non-goals

### Not a general web-app framework (no forms, no data submission, no persisted UI state) — held

- No form elements, no network: the XSS oracle fails on any `form`, `iframe`, `object` or `on*` attribute in rendered output, over 26 payloads in every text field (VD-169, `e2e/xss.spec.ts`); the renderer makes no requests (§15.1, task 06).
- No persisted state: no `localStorage`/`sessionStorage` in any package source (searched 2026-11-15: no hits); sort, folds and tabs live in memory (§4.2 storage row).

### Not a replacement for raw HTML visuals — held

- The skill says it takes precedence only for catalog content and leaves other visuals to Orca's `orca-chat-visuals` skill (§12.4, task 17, VD-137). The eval found 0 hand-written HTML for catalog content.

### Not an Orca plugin — held

- No `orca-plugin.json` anywhere in the repo; the Viewer is a loopback server beside the agent (D13); the only Orca dependency is `orca tab create --url … --split right --json`, with a URL-line fallback (§17.3), now checked daily against Orca's CLI help by `scripts/check-orca-contract.mjs` (`.github/workflows/scheduled.yml`).

### No syntax highlighting, maps, 3D or animation in v1 — held

- Catalog (`vui catalog`): 24 components, none of these (D10). `code` highlights marked lines only, not syntax (task 07).
- Motion: the fold icon's 120 ms transition is the only one, off under `prefers-reduced-motion` (`packages/ui-render/src/css/base.ts`; §15.2's ≤ 150 ms).

## Scope (§1 "Scope of this spec")

Every normative section has an owning task (`docs/vadd-ui/TASKS.md`, coverage table). Task 22 (`compare`, `scatter`, `flow` rendering) is still to come; until then those render as §9.3 placeholders.
