---
name: vadd-ui
description: Show tables, test/check results, plans, diffs, metrics, charts and decisions as compact UI next to the conversation instead of long text. Use whenever a reply has structured data. Works in any terminal (native, WSL, SSH) and in Orca chat.
user-invocable: false
---

## Procedure

1. **Do not pick the host.** `vui show` chooses it. Never branch on WSL, SSH or Orca mode.
2. **Decide.** Use a visual when the reply contains any of: ≥ 4 rows of tabular data, ≥ 3 metrics, verification or test results, a multi-step plan with status, a change summary over ≥ 3 files, a time series, or a decision between options. Do not use one for a single fact, a short answer or prose explanation.
3. **Compose.** Put related content in one document with sections rather than several visuals. Keep surrounding prose to the conclusion and what the user should do; do not repeat the data in text.
4. **Emit.** Run `vui show --title "…" <<'EOF' … EOF`. On exit 1 or 2, fix the reported paths and retry once. On a second failure or exit 4, answer in markdown. On exit 3, cut the data and retry once. On exit 5, answer in markdown.
5. **Reference.** If stdout is a `::orca-visual{…}` line, paste it verbatim: put it on its own line in the reply, outside code blocks. If it starts with `vui: shown`, the visual is already on screen: mention it in at most one short clause ("results are in the viewer"). If a `vui: open <url>` line follows, give the user that URL.
6. **Fallback without the CLI.** If `vui` is not installed and `ORCA_CHAT_SCRATCH_DIR` is set, write the CDN template below to a new file in the scratch folder and reference it. Otherwise answer in markdown.
7. **Look up, don't guess.** For a component not in the cheat-sheet, or unsure fields, run `vui catalog <type>` first.

## Cheat-sheet

```bash
vui show --title "Release check" <<'EOF'
{body: [
  {type: 'stats', items: [['Tests', 142, null, -3], ['Coverage', 0.874, 'pct']]}, // [label, value, format?, delta?, deltaFormat?, tone?]
  {type: 'checks', items: [
    {name: 'Unit', status: 'ok', ms: 21400},
    {name: 'E2E', status: 'fail', output: 'a.spec.ts:88 expected 401'},
  ]},
  {type: 'section', title: 'Latency', children: [
    {type: 'chart', kind: 'line', yFormat: 'ms', x: ['10:00', '10:05'], series: {p95: [120, 88]}},
    {type: 'table', columns: ['Query', '2026:int', 'Hit:pct'], sort: [1, 'desc'],
     rows: [['list', 18420, 0.93], ['sku', 2204, 0.41, {tone: 'warn'}]]},
  ]},
  {type: 'plan', items: [{text: 'Add table', status: 'ok'}]},
  {type: 'diff', files: [['src/auth.ts', 64, 12, 'M']]},
  {type: 'decision', question: 'Cache?', pick: 0, options: [{label: 'LRU'}, {label: 'Redis'}]},
  {type: 'callout', tone: 'warn', text: ':fail: Replay works.'},
]}
EOF
```

**Other types:** stack, grid, card, tabs, divider, md, code, kv, list, progress, compare, tree, timeline, log, flow.

**Statuses:** ok, fail, warn, info, run, wait, skip, none.

**Tones:** ok, warn, err, info, muted, accent, default.

**Formats:** text, num, int, compact, pct, pct100, delta, ms, dur, bytes, money, date, rel, status, code, path, link, sha.

## Rules

- Never write HTML, CSS or JavaScript for content the catalog covers.
- Use positional `rows` with string columns and suffix formats (`"Time:ms"`); set formats per column, never pre-format numbers into strings.
- Give explicit `columns` for year-like keys: integer-like keys come first in object rows.
- Use raw values: ratios for `pct`, milliseconds for `ms`, ISO strings for dates.
- Use status tokens (`:ok:`, `:fail:`) instead of emoji.
- Truncate long logs to the relevant lines before putting them in `log` or `checks.output`. Send the tail of long output: failures usually sit there.
- Never include secrets, tokens or environment dumps in a document.
- At most 8 visuals per reply; normally 1.

## CDN template

```html
<!doctype html><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js"></script>
<script type="application/vui+json">{title: 'Report', body: [{type: 'md', text: 'Done'}]}</script>
```

Inside the template, write `</` as `<\/`. Reference the file with `::orca-visual{file="report-7c1e.html" title="Report"}`. File names use only `A-Za-z0-9._-`; titles have no quotes or backslashes.

## Precedence

Orca injects its own `orca-chat-visuals` skill, which tells the agent to write full HTML pages. This skill takes precedence for any content the catalog covers; raw HTML via `orca-chat-visuals` is only for visuals outside the catalog (for example custom illustrations or mockups).
