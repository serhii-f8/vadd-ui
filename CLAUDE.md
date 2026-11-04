# vadd-ui — project rules

vadd-ui is a compact declarative UI document format plus a zero-dependency renderer: agents write a small JSON spec, and it renders as rich UI in a local Viewer, Orca chat, a plain browser or VADD web. Claude Code with the Superpowers skills builds it end to end inside the Orca IDE. Spec, the single source of truth: `docs/specs/vadd-ui-technical-spec.md`. Never edit it; where it is ambiguous or wrong, decide and log in `docs/vadd-ui/DECISIONS.md`.

Files: plan and coverage in `docs/vadd-ui/TASKS.md`, status in `PROGRESS.md`, worker instructions in `docs/vadd-ui/WORKER_BRIEF.md`.

## Environment facts

- Orca runs on Windows; agents run in Orca terminals inside WSL 2 (distro named `Ubuntu-22.04`, running Ubuntu 24.04.4). Orca Chat UI and `::orca-visual` do not work in WSL. Never rely on them while building.
- Use `${ORCA_CLI_COMMAND:-orca}` for every Orca command (`orca-ide` here), always with `--json`, and branch on `ok` and `error.code`. Below, `ORCA` means that executable. Guides: `ORCA skills get orca-cli`, `ORCA skills get orchestration`, and references only when a gate needs them (`--reference references/<file>.md`).
- `ORCA tab create --url http://localhost:<port> --split right --json` opens Orca's browser pane on a server listening on `127.0.0.1` in WSL. Use it for every visual check.
- WSL networking here is `mirrored`, not the default NAT. The NAT cell of spec §16.1 cannot be checked on this machine as configured.
- `pnpm` works only inside this repo, through the `packageManager` pin (VD-005). Outside it, the corepack shim crashes.
- Plugin authoring and skill-sharing commands refuse to run from forwarded WSL shells; vadd-ui needs neither.
- This repo stands alone and has no remote (VD-003, VD-010). The real VADD monorepo is `/var/www/html/vadd`: read it for conventions, never change it.
- Keep the repo on the WSL filesystem, never under `/mnt/c`.

## Roles and autonomy

- **Coordinator** (the session started in the repo root on `main`). Owns the plan, this file, `PROGRESS.md`, `DECISIONS.md`, integration into `main`, and talking to the user. Writes no feature code, except in fallback mode.
- **Workers.** One fresh Claude Code agent per task, started through Orca orchestration, each in its own worktree. A worker runs the whole Superpowers pipeline for exactly one task and reports evidence.
- The user's only role is to start work. Coordinator and workers make every product, design and engineering decision. Never ask the user to choose, approve or confirm.
- Stop for the user only when something is physically impossible without them: a missing credential, a GUI-only action, a paid service. Then mark the task `blocked`, state the exact action needed, and offer the next eligible task.

## User commands

- `start`, `next`, `continue`: run one task through the Coordinator Loop, then ask before the next.
- `autopilot` or `autopilot <N>`: run tasks back to back without asking, until all are done, N are done, a task is blocked, or the user says `stop`.
- `stop`: finish the current step safely and halt.
- `status`: summarize `PROGRESS.md`; change nothing.
- `redo <ID>`: reset the task to `todo` and run it. `skip <ID>`: mark it `skipped` and log why.

## Session start ritual

Read `CLAUDE.md`, `PROGRESS.md`, `docs/vadd-ui/DECISIONS.md`. Check `ORCA orchestration worker-list --json` for live workers. Resume any `in_progress` task from its recorded step. Never redo finished work.

## Coordinator Loop

1. **Orient.** Run the ritual. Pick the lowest-ID `todo` task whose dependencies are `done`. Mark it `in_progress`, log `selected`.
2. **Dispatch.** Write `WORKER_BRIEF.md` plus a task section to a scratch file. The task section holds: ID, title, the task text from `TASKS.md`, dependencies already merged, the branch name `vadd-ui/<ID>-<slug>`, and relevant VD ids. Then run:
   ```text
   ORCA orchestration worker-start --worktree new-top-level --base-branch main --name vui-<ID>-<slug> --agent claude --task-title "<ID> <title>" --spec-file <file> --json
   ```
   Record the worktree id and dispatch id in `PROGRESS.md`. Label the workspace: `ORCA worktree set --worktree <id> --display-name "vui <ID> <title>" --comment "dispatched" --json`. If `worker-start` fails, do not rerun it: read `failedStage` and load `references/recovery-and-cleanup.md`. Then end your turn; Orca wakes you. Never poll.
3. **Questions.** On a `question`, answer with `ORCA orchestration reply --id <message_id> --body "<answer>"`, derived from the spec, `DECISIONS.md` and the code, and log it as a decision. Forward only "physically impossible" items to the user. End your turn.
4. **On `worker_done`.** Read the report. If evidence is missing or contradictory, use `ORCA orchestration send --to dispatch:<id> --subject "gap" --body "<what is missing>"` and end your turn. On an `escalation`, steer with `send`, or retry per the recovery reference, at most twice; then use fallback mode. Silence alone proves nothing.
5. **Integrate.** On `main`: `git merge --no-ff vadd-ui/<ID>-<slug>`. The branch is local, so no fetch is needed. Rerun the full gate: `pnpm install`, `pnpm gate`, plus the task's budget checks. If red, send the failure to the worker, or fix trivial conflicts yourself and log them. Never leave `main` red.
6. **Record.** Mark the task `done` in `PROGRESS.md` with links (design spec, plan, merge commit) and a completed-task report with evidence. Renumber worker decisions if needed. Commit `docs(vadd-ui): complete <ID>`. Clean up: `ORCA worktree set --worktree <id> --workspace-status completed --json`, release the worker with `ORCA orchestration worker-release --dispatch <id> --json` if `worker-list` calls for it, remove the worktree with `ORCA worktree rm --worktree <id> --json` once merged, delete the branch.
7. **Hand back.**
   - Manual mode: a short report (built, evidence, notable decisions, deferrals), ending with exactly `Ready to start task <next ID> — <title>?` Then stop.
   - Autopilot: append the report to `PROGRESS.md` and continue with step 1 unless a stop condition applies.
   - After the last task: run the complete §16 gate suite on `main`, write the final summary (coverage, budgets achieved, release checks pending the user, such as the Orca end-to-end check and npm publish), and stop.

## Fallback mode

If orchestration is unavailable or a task's worker fails twice, run that task in this session with the same worker protocol, without `using-git-worktrees`: create the worktree with `ORCA worktree create --name vui-<ID>-<slug> --no-parent --json` and work in it. Log the fallback.

## Worker protocol (summary)

Full text: `docs/vadd-ui/WORKER_BRIEF.md`. Setup, design spec with `superpowers:brainstorming` (autonomous), plan with `superpowers:writing-plans`, implement with `superpowers:subagent-driven-development` under `superpowers:test-driven-development`, verify with `superpowers:verification-before-completion` (real output, Playwright and Orca pane for UI), fresh-subagent review, rebase and rerun the gate, report `worker_done`.

## Definition of done (every task)

- Every acceptance criterion is met with pasted evidence.
- `main` is green after the merge: build, typecheck, lint, all tests across the monorepo (`pnpm gate`).
- Tests are written first and meet the §16 coverage targets for the package.
- No `innerHTML`, `eval` or `new Function` in renderer packages; no new runtime dependencies in `ui-spec`, `ui-render` or `ui`.
- Applicable size, performance and token budgets are within limits.
- Design spec, plan, `PROGRESS.md` and `DECISIONS.md` are committed; the worktree is removed after merge.

## Decisions

Decide; never ask the user. Prefer, in order: what the spec says; the simplest option that meets the spec's budgets and gates; consistency with earlier decisions and the existing code; reversibility. Log every non-obvious choice before moving on, and mark departures from the spec as DEVIATION.

## Git policy

- Branch `vadd-ui/<ID>-<slug>` per task in its own Orca worktree.
- `--no-ff` merges into `main`, by the coordinator only.
- Never push or publish unless the user explicitly says so.
- Conventional Commits, as in VADD.
