# Orca end-to-end checklist (§16, release check)

For the user, before each release. §16: "Real Orca desktop build, structured Claude chat, one visual per core component. Renders inline; links open via host; theme switch works." It cannot run in this project's WSL setup: Orca structured chat for Claude needs a native local host (`wslDistro === null`, §1), and Orca Chat UI does not work in WSL here. What was proved instead is the vendored Orca shell in Chromium (VD-063, VD-135); this checklist covers what that proof cannot.

Takes about 30 minutes. Record each step as pass, fail (with a screenshot), or not applicable, and the Orca version (Help → About).

## Setup

1. On **native Windows** (or macOS), not in WSL: install Node 22+ and Git. Clone the repo onto the native filesystem, then:
   ```powershell
   corepack enable
   pnpm install
   pnpm build
   # Until @vadd/ui-cli is on npm, put a `vui` on PATH that runs the built CLI
   # (what a global npm install would create). Any directory on PATH works:
   $bin = "$env:USERPROFILE\bin"; New-Item -ItemType Directory -Force $bin | Out-Null
   Set-Content "$bin\vui.cmd" "@node `"$PWD\packages\ui-cli\dist\bin.js`" %*"
   vui doctor
   ```
   On macOS: `pnpm install && pnpm build && ln -s "$PWD/packages/ui-cli/dist/bin.js" /usr/local/bin/vui && chmod +x packages/ui-cli/dist/bin.js && vui doctor`. Expect `vui doctor` to report no `fail`. After the npm publish, use `npm install -g @vadd/ui-cli` instead.
2. Install the skill for Claude Code: copy `skills/vadd-ui/SKILL.md` to `%USERPROFILE%\.claude\skills\vadd-ui\SKILL.md` (macOS: `~/.claude/skills/vadd-ui/SKILL.md`).
3. In Orca (desktop build, the release you will announce support for), open the repository as a workspace and start a **structured Claude chat** (Chat UI, not a terminal agent). Log in to Claude if asked.
4. In the chat, ask: "Run `vui doctor` and tell me what `orca-chat` says." Expect the `orca-chat` line to read `ok` with a path: `ORCA_CHAT_SCRATCH_DIR` is set and writable. If it says "not set", this is not structured chat; stop and fix the setup.

## One visual per core component

5. Paste each prompt below into the chat, one per reply. For each: the reply contains a `::orca-visual{…}` line that Orca turns into an inline visual; the visual matches the data; no raw HTML was written by hand (the agent ran `vui show`); light and dark both look right (step 7).

| # | Component | Prompt |
|---|---|---|
| 5.1 | `table` | "Latency per endpoint p50/p95 ms: /users 12/40, /orders 45/160, /search 70/310, /login 20/55. Show it." |
| 5.2 | `stats` | "This week: users 18,420 (+6.2%), conversion 3.4% (−0.3 pts), revenue $142,300 (+11%). Lay it out." |
| 5.3 | `checks` | "Test results: login passed 120 ms, refresh FAILED (expected 401, got 500), logout passed, timeout skipped. Summarize." |
| 5.4 | `plan` | "Release plan: freeze API done, migrate DB done, SDKs in progress, docs not started, rollout blocked. Show status." |
| 5.5 | `diff` | "PR changes: src/a.ts +42 −10, src/b.ts +18 −3, test/a.test.ts +88, docs/a.md +12 −4. Summarize." |
| 5.6 | `chart` (line, bar, donut) | "p95 for 10 days: 210, 205, 220, 198, 240, 260, 255, 230, 190, 185. Then errors by cause: timeout 412, pool 230, upstream 155. Chart both." |
| 5.7 | `kv` | "Staging config: region eu-central-1, replicas 3, image 2.4.0-rc.2, timeout 30 s. Present it." |
| 5.8 | `tree` | "Layout: services/billing/src/index.ts, src/handlers/charge.ts, test/charge.test.ts, Dockerfile. Show the tree." |
| 5.9 | `timeline` | "Incident: 09:02 alert, 09:11 bad deploy found, 09:14 rollback, 09:19 recovered. Timeline please." |
| 5.10 | `log` | "Log: INFO job started; WARN retry 2; WARN retry 3; ERROR upload failed; FATAL exiting. Show the important lines." |
| 5.11 | `code` | "Show this function with line 2 highlighted: `function key(r) {` / `return r.user` / `}`." |
| 5.12 | `decision` | "Pick a queue: Postgres (no new infra), Redis Streams (fast, more ops), SQS (managed, lock-in). We are on AWS. Recommend one." |
| 5.13 | `progress`, `list`, `callout` | "Backfill: users 1.24M of 3.1M, orders done. Lint: 3 errors, 2 warnings. Note: staging read-only 18:00–20:00 UTC. One visual." |
| 5.14 | `md`, `section`, `grid`, `tabs`, `card`, `divider` | "Compose one report with tabs for staging and production config, a grid of three region tiles, and a short markdown note." |

## Behaviour

6. **Links open via the host.** In 5.1, ask the agent to add a link column (`https://example.com/…`). Click a link: it opens through Orca (system browser or Orca's browser), not inside the frame. A `#section` link scrolls within the visual.
7. **Theme switch.** Switch Orca between light and dark (Settings → Appearance) while visuals are on screen. Every visual restyles at once, with no reload and no flash of the other theme; tone colours and text stay readable in both.
8. **Height.** No visual has an inner scrollbar or is cut off; a long table (ask for 60 rows) is paged or folded, not clipped at 2000 px.
9. **Copy and folds** (VD-122, Safari/WebKit first copy): in Orca mobile or Safari, if available, open a folded code block or the Viewer feed's "Copy spec" on a folded entry and copy once. Record whether the first click copies or says "Copy failed".
10. **Fallback without the CLI** (§12.2 step 6): temporarily make `vui` unavailable (rename `vui.cmd`, or `npm uninstall -g @vadd/ui-cli`), ask for 5.2 again. The agent writes the CDN template into the scratch folder and pastes the directive. **This needs `@vadd/ui@1` on npm** (jsDelivr serves it from there); before the first publish the script cannot load, so the visual cannot render. Reinstall afterwards.

## Unverified items from VD-135 (record each explicitly)

11. **Transcript file read and mounting:** the inline visual in step 5 comes from Orca reading the file in `ORCA_CHAT_SCRATCH_DIR` and mounting it: pass if every visual in step 5 rendered.
12. **Directive during streaming:** watch a reply stream in. The visual appears once the directive line is complete; a half-streamed line never shows as broken text or a broken frame.
13. **Electron frame registration:** open Orca's developer tools (if available) on a visual: no CSP violation and no "frame not registered" error in the console.
14. **WebViews:** repeat steps 5.1, 5.6 and 7 on the other desktop OS (macOS if you ran Windows, or the reverse), and on Orca mobile if you support it.
15. **Real jsDelivr:** after publishing, open `https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js` and `…/dist/vui-ext.min.js`: each returns its bundle (check that it is the version you published, for example in the response headers), and step 10 renders.

## Result

Record: Orca version, OS, date, the pass/fail per step, and screenshots of any failure. Any fail in steps 5–8 or 11–13 blocks the release (§16); step 10 and 15 block only after the npm publish.
