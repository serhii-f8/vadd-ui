# Agent eval (§16)

§16: "40 prompts with structured answers run through Claude Code with the skill installed, in an Orca-like environment with `ORCA_CHAT_SCRATCH_DIR` set. Gate: ≥ 98% valid on first `vui show`; 100% valid after one retry; 0 hand-written HTML for catalog content."

## Harness

```sh
pnpm build
node scripts/agent-eval/run.mjs                      # all 40, with the skill (about 4 min at --parallel 4)
node scripts/agent-eval/run.mjs --no-skill --only a,b # baseline without the skill
# flags: --model opus (default) --parallel 3 --timeout-ms 300000 --out <dir>
```

- `scripts/agent-eval/prompts.json`: 40 prompts, each a realistic request carrying structured data (test results, benchmarks, metrics, plans, PR changes, time series, shares, comparisons, decisions, configs, trees, incidents, logs, progress, findings, snippets, announcements, dashboards, reports). None mentions `vui`; the skill has to decide. Every core content component is some prompt's main shape.
- Per prompt, a throwaway git project with `.claude/skills/vadd-ui/SKILL.md` (omitted with `--no-skill`), a `vui` first on `PATH` that runs the built CLI unchanged and logs each call (`scripts/agent-eval/vui-shim.mjs`), `ORCA_CHAT_SCRATCH_DIR` set to an empty folder, and a fresh `XDG_STATE_HOME`. `ORCA_*` and `VUI_*` from the caller are removed, so no Orca pane opens.
- `claude -p <prompt> --output-format stream-json --verbose --model <m> --setting-sources project --strict-mcp-config --dangerously-skip-permissions`: the user's settings, plugins and MCP servers stay out (the init event lists no MCP servers and only Claude Code's built-in plugins and skills). It uses Claude Code's own login, which exists on this machine, so no API key is needed.
- Scoring (`scripts/agent-eval/lib.mjs`, 15 unit tests): first `vui show` exit 0; a valid show within the first two shows; hand-written HTML = any `.html` in the scratch folder or project that the CLI did not write, or a Write/Edit/Bash tool call carrying HTML markup other than a `vui` command; the reply carries the `::orca-visual` line of the last successful show (§12.2 step 5). Validity is judged over the runs that called `vui show` (VD-178); runs that answered in markdown are counted and read separately. A run that did not finish (`claude` exit not 0, or killed at the timeout) is counted as unfinished and fails the gate, so an outage cannot pass as markdown answers; all 50 runs below exited 0.

## Results, 2026-11-15

Claude Code 2.1.325, model `opus` (Claude Opus 5.5), skill at `skills/vadd-ui/SKILL.md` as merged in task 20.

### With the skill: 40 prompts

| Measure | Result | §16 gate | Verdict |
|---|---|---|---|
| Runs that showed a visual | 33 / 40 (82.5%) | — | see below |
| Valid on first `vui show` | 32 / 33 (97.0%) | ≥ 98% | **not met** (one case) |
| Valid after one retry | 33 / 33 (100%) | 100% | met |
| Hand-written HTML | 0 | 0 | met |
| Directive line in the reply | 33 / 33 | (§12.2 step 5) | met |

Median 17 s per prompt; 695 s of agent time in all.

- **The one invalid first show** (`rollout-status`): the agent wrote a JavaScript call inside the document, `['ap-south', 0, 1, 1, {tone: 'warn'}, 'wait'].filter(x => …)`. The CLI answered exit 2 with `error: line 16, column 53: unexpected "."; expected "," or "]"`, and the second show was valid. The format and the CLI behaved as designed; the agent treated relaxed JSON as JavaScript.
- **7 runs answered in markdown** instead of showing a visual. §12.2 step 2 says to use one for "≥ 4 rows of tabular data, ≥ 3 metrics, verification or test results, a multi-step plan with status, a change summary over ≥ 3 files, a time series, or a decision between options":
  - Misses against §12.2: `sprint-summary` (5 metrics, answered as a bullet list) and `on-call-schedule` (4 rows, answered as a markdown table).
  - Outside §12.2's list, so the skill decided as written: `repo-tree` (a file tree), `log-excerpt` (log lines), `code-review-findings` (a findings list), `warning-note` (an announcement), `snippet-fix` (one code block; the agent loaded the skill and judged a code block better).
- Once an agent showed again after a valid show, to clear a `warn` diagnostic (`weekly-metrics`); the reply carried the newer line.

### Baseline without the skill: 10 prompts (VD-139)

The `writing-skills` baseline: the same harness with no skill, on 10 prompts that §12.2 says need a visual (`test-run-auth`, `bench-endpoints`, `weekly-metrics`, `release-plan`, `pr-change-summary`, `latency-trend`, `db-choice`, `coverage-by-package`, `deploy-checklist`, `verification-report`).

- 0 / 10 used `vui`, though it was on `PATH`.
- 9 answered with markdown tables and lists.
- 1 (`latency-trend`) loaded Claude Code's built-in `dataviz` skill, hand-wrote `latency-trend.html` (an SVG chart page) and screenshotted it with headless Chrome: 49 s, against 23 s with the skill.

With the skill, the same 10 prompts all showed a visual, all valid on the first show.

## Verdict and follow-ups

- §16's agent-eval gate is **not met** on this run: 97.0% first-show validity against 98%, by one case in 33. The retry and HTML gates are met. One run of 40 prompts is a small sample (one case moves the rate by 3 points); rerun before release (`RELEASE_CHECKLIST.md`).
- Not fixed here, deliberately: tuning `SKILL.md` to this one failure would fit the eval rather than the agent. Candidate skill changes for the spec owner, measured by rerunning this eval: one line that the document is data, not code ("no expressions, comments or function calls"), about 12 tokens of the 95 left under §14.2's 1,800; and naming "≥ 3 metrics" and "≥ 4 rows" more prominently, for the two decide misses.
- The eval does not run in CI: it needs a Claude login and costs model usage. It is a release check (`RELEASE_CHECKLIST.md`).
