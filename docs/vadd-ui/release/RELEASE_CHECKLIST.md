# Release checklist (vadd-ui 1.0.0)

Ordered steps for the user. Everything a machine could do here is done and recorded in the other files of this folder; what is left needs a remote, credentials, other hosts or a decision. Nothing has been pushed or published (VD-003, VD-010).

## 0. State at hand-over (2026-11-15, task 21)

- `pnpm gate` green on this WSL host (counts in the task 21 report in `PROGRESS.md`).
- §16.1: two cells run for real and pass (`HOST_MATRIX.md`); the rest are CI jobs (written, never run) or manual steps.
- Publish configuration in place and checked by `scripts/check-publish.mjs` in `pnpm check`; `pnpm pack` of `@vadd/ui` holds `dist/vui.min.js` and `dist/vui-ext.min.js` (VD-182) with `workspace:*` rewritten.
- Open release-gate deviations, for the spec owner (not re-scoped here):
  - **§14.2 ratio budgets unmet**: spec vs markdown worst 1.582 (≤ 1.2), spec vs hand-written HTML worst 0.425 (≤ 0.2); offline estimator (VD-155, VD-157, VD-165).
  - **§16 agent eval first-show validity 97.0%** against 98% (32 of 33; one run of 40 prompts; `AGENT_EVAL.md`).
  - **VD-129**: the first show in Orca exceeds §16.1's 1 s while Orca creates the pane (1.6–3.4 s here); warm delivery 67–78 ms.
  - **§17.4 Chromium 110** lacks `color-mix()`, which §8.1 requires; full fidelity needs Chromium 111 (VD-177, `RUNTIME_SUPPORT.md`).
- Bundles: `vui.min.js` 37.9 KiB gzip of the 38 KiB budget (§9.5), unchanged by task 22; about 100 bytes of headroom. The §6 `ext` tier ships in `vui-ext.min.js` (core plus ext, 123.5 KiB min, 42.6 KiB gzip, budget 132/45 KiB), embedded only for documents that use `compare`, `flow` or a `scatter` chart (VD-182).

## 1. Repository and CI

1. Create the remote repository and push `main`.
2. Add `repository` to the root and every `packages/*/package.json` (npm provenance needs it to match the GitHub repository), for example `"repository": {"type": "git", "url": "git+https://github.com/<org>/vadd-ui.git", "directory": "packages/ui"}`. The release workflow refuses to publish without it.
3. Let `CI` run once on `main`. Expected first-run work, which this machine could not show:
   - `gate` (ubuntu-latest): pixel baselines come from WSL fonts (VD-064). If `e2e/visual.spec.ts` fails on pixels only, run the **Snapshots** workflow (Linux only), review the uploaded `screenshots-ubuntu-latest` artifact against the old images, and commit it.
   - `portable` (Windows, macOS): runs the gate with `VUI_PIXELS=skip`. Fix any POSIX-only assumption a test makes on Windows (file modes, process groups, signals) as a normal task.
   - Perf (VD-171): off the baseline's CPU the check holds only the §9.5 limits and says so. To gate regressions on CI hardware too, run `node scripts/check-perf-budgets.mjs --update` once on that runner (a dispatch job or a self-hosted runner), commit the new `scripts/perf-baseline.json` and `scripts/perf-reference.vui.min.js`, and keep the runner type fixed.
   - `wsl-nat`: skipped until the repository variable `WSL2_RUNNER` names a Windows runner with WSL 2 (nested virtualization; a larger or self-hosted runner). Set it, or record the NAT cell as manual (`HOST_MATRIX.md` step B).
   - `engines`: Firefox and WebKit smoke; ran here (16/16), expected green.
4. Let **Scheduled** run once by hand (`workflow_dispatch`): `orca-contract` must pass (it passed here against Orca `main` 1b79875 and `orca-ide` 1.4.259); `fuzz` must pass (§16, 100,000 cases; VD-166 explains why the per-commit gate runs 2,000).

## 2. Release checks (§16, §16.1)

5. **Orca end-to-end**: `ORCA_E2E_CHECKLIST.md`, on a native Windows or macOS Orca build in structured Claude chat.
6. **Manual §16.1 cells**: `HOST_MATRIX.md` steps A–F (native PowerShell in Orca, WSL NAT in Orca, Windows Terminal with `wslview`/`explorer.exe`, macOS in Orca, SSH, devcontainer), including the native-Windows checks in step A (`.cmd`, `start`, PowerShell UTF-16 pipe, closed stdin, `EACCES` port).
7. **Agent eval**: `node scripts/agent-eval/run.mjs` (needs a Claude Code login; about 4 minutes and 40 agent runs). Gate: ≥ 98% valid on first show, 100% after one retry, 0 hand-written HTML. Decide whether to change `SKILL.md` first (`AGENT_EVAL.md`, follow-ups).
8. **Token count with a real key** (VD-149, VD-157): `ANTHROPIC_API_KEY=… node packages/ui-cli/dist/bin.js bench` (the bundled corpus; add `--json` for the full report). This machine has no key. It replaces the offline estimate, checks VD-149's framing assumption (`count(".") − 1`), and may move the §14.2 ratios.
9. Run the §16.1 scenario in your own Orca once more: `node scripts/host-scenario.mjs --surface orca`.

## 3. Version and publish

10. Decide the release version. §17.2: the package major equals the format major, so the first release is `1.0.0`. Set it in the root and all eight `package.json` files (`scripts/check-versions.mjs` holds them equal), rebuild, run `pnpm gate`, and commit. The version is stamped into every CLI-produced file's `meta.version` and the generator tag (§17.2); several tests use the string `0.0.0` (in `ui-viewer` and `ui-cli`); any that pin the real version will fail here and need the new one.
11. Tag `v1.0.0` and push the tag.
12. npm: an organization or user owning the `@vadd` scope, with **2FA required for publishing** (§15.1). Create an automation token (or configure npm trusted publishing for the repository) and store it as the `NPM_TOKEN` secret in a GitHub environment named `npm`, with required reviewers.
13. Run the **Release** workflow by hand on the tag. It checks the tag against the version, requires `repository`, runs `pnpm gate`, then `pnpm -r publish --access public` with provenance (`id-token: write`, `NPM_CONFIG_PROVENANCE`).
14. Verify: the package page on npmjs.com shows the provenance badge for each package; `https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js` serves the bundle (§10.3; the CDN path promised for all of 1.x, §17.2), and so does `…/dist/vui-ext.min.js` (VD-182); then `ORCA_E2E_CHECKLIST.md` steps 10 and 15.

## 4. Known gaps carried into 1.0

- §10.2's hand-written CDN template has no `lang` or `<title>`; the CLI's `--cdn` file adds both (VD-168). An agent writing the template by hand still produces a page axe flags.
- Firefox 115 prints four-digit `pl-PL` money without a group separator (VD-043, VD-177).
- After `vui viewer stop` or an idle exit, the next show opens a new pane beside the dead one (VD-125).
- A Windows `EACCES` port ends the Viewer's port search (VD-118).
- A CDN-mode page written by hand that loads `vui.min.js` for a document with `compare`, `flow` or `scatter` shows §9.3 placeholders for those nodes; the skill and `vui render --cdn` use `vui-ext.min.js` instead (VD-182).
