# vadd-ui progress

Spec: docs/specs/vadd-ui-technical-spec.md · Updated: 2026-11-04T17:40:00Z · Mode: manual

## Summary
Done 0 / 22 · In progress: none · Blocked: none · Next: 01 — Monorepo scaffolding

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
| Existing workers | none |

## Tasks
| ID | Title | Spec § | Depends on | Status | Worktree | Dispatch | Design spec | Plan | Merged commit | Completed |
|----|-------|--------|------------|--------|----------|----------|-------------|------|---------------|-----------|
| 01 | Monorepo scaffolding | §3, §15.1, §16 | none | todo | | | | | | |
| 02 | ui-spec: parser, envelope, normalizer | §2, §5, §5.1, §5.2, §5.3 | 01 | todo | | | | | | |
| 03 | ui-spec: validator, diagnostics, limits, schema, conformance | §5.4, §6, §13.1, §16, §17.1, §19 | 02 | todo | | | | | | |
| 04 | ui-spec: value formats, inline text, status tokens | §5.5, §7, §16 | 03 | todo | | | | | | |
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
none yet
