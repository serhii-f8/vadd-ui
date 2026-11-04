# vadd-ui worker brief

You are a worker building one vadd-ui task in your own Orca worktree. The spec is `docs/specs/vadd-ui-technical-spec.md` (read the sections your task names; never edit it). Repo rules are in `CLAUDE.md`, the plan is in `docs/vadd-ui/TASKS.md`, and earlier decisions are in `docs/vadd-ui/DECISIONS.md`.

You decide everything yourself. Skills may tell you to ask your human partner: in this project, answer those questions yourself from the spec, the code and `DECISIONS.md`, and log the non-trivial answers. If you truly need the coordinator, use orchestration `ask` and end your turn. Never wait for the user.

Your dispatch preamble gives your Task and Dispatch ids and how to send `ask` and `worker_done`. Use `${ORCA_CLI_COMMAND:-orca}` for every Orca command, always with `--json`, and branch on `ok` and `error.code`. Do not commit or merge into `main`, and do not push or publish. Everything you do stays inside this worktree, apart from the vadd-ui state directory and tool caches.

## Steps

1. **Setup.** Orca created your worktree on a generated branch. Rename it to the branch in your task section with `git branch -m <name>`, and confirm it starts from current `main`. Run `pnpm install` and confirm the baseline is green with `pnpm gate` (task 01 has no baseline yet). Skip `superpowers:using-git-worktrees`: Orca already isolated you. Update the workspace comment at each step: `${ORCA_CLI_COMMAND:-orca} worktree set --worktree active --comment "<ID>: <step>" --json`.

2. **Design spec.** Use `superpowers:brainstorming` in autonomous mode. Answer every question yourself, and approve your own design after a self-review; there is no user gate here. Skip the visual companion. Save the design where the skill prescribes (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`). It must cite the spec sections and restate the acceptance criteria. Self-review: everything in scope is covered, nothing out of scope is added. Commit.

3. **Plan.** Use `superpowers:writing-plans` on the design spec: bite-sized, test-first steps with exact files and commands. Choose subagent-driven execution without asking. Commit.

4. **Implement.** Use `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) under `superpowers:test-driven-development`. Use `superpowers:systematic-debugging` for anything unclear. Commit in small steps with Conventional Commit messages.

5. **Verify.** Use `superpowers:verification-before-completion`. Paste real output for: the full-repo build, typecheck, lint and all tests (`pnpm gate`); every acceptance criterion; the applicable budgets. For UI work:
   - render in headless Playwright at widths 360, 720 and 1100 px, light and dark, and inspect the screenshots yourself;
   - serve the page on `127.0.0.1`, open it with `${ORCA_CLI_COMMAND:-orca} tab create --url http://localhost:<port> --split right --json`, and capture it with Orca's browser screenshot command (load it with `${ORCA_CLI_COMMAND:-orca} skills get orca-cli --reference references/browser.md`);
   - close the tab and stop the server afterwards.
   From task 15 on, also send your evidence through `vui show` wherever the feature exists.

6. **Review.** Use `superpowers:requesting-code-review` with a fresh subagent: give it the diff, the design spec and the relevant spec sections. Handle the findings with `superpowers:receiving-code-review`. Fix every critical or important one, and log rejected ones as decisions.

7. **Finish.** Rebase onto the latest `main` and rerun the full gate. Use `superpowers:finishing-a-development-branch` only to confirm the branch is clean; when it offers options, keep the branch as it is. The coordinator integrates.

8. **Report.** Send `worker_done` with: branch and head commit, links to the design spec and plan, gate results (counts, coverage, budgets), screenshot paths, decisions added (VD ids), and any follow-ups or deviations.

## Definition of done

- Every acceptance criterion is met with pasted evidence.
- `pnpm gate` is green across the monorepo.
- Tests were written first and meet the §16 coverage targets for the package.
- No `innerHTML`, `eval` or `new Function` in renderer packages; no new runtime dependencies in `ui-spec`, `ui-render` or `ui`.
- Applicable size, performance and token budgets are within limits.
- Design spec and plan are committed. Decisions are appended to `DECISIONS.md` with the next free VD number; the coordinator renumbers on conflict. Do not edit `PROGRESS.md`: the coordinator owns it.

## Decisions

Decide; never ask the user. Prefer, in order: what the spec says; the simplest option that meets the spec's budgets and gates; consistency with earlier decisions and the existing code; reversibility. Log every non-obvious choice before moving on, and mark departures from the spec as DEVIATION.

## Stopping

If something is physically impossible without the user (a missing credential, a GUI-only action, a paid service), or a permission prompt blocks you, say exactly what is needed in an `ask` to the coordinator, naming the exact permission rule where one applies, and end your turn. Report failures faithfully: never mark an unmet criterion as met.
