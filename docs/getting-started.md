# Getting started

Ten minutes from a checkout to an agent that shows its results as UI.

## 1. Install

You need Node 22 or newer. The packages are not on npm yet, so build from source:

```sh
git clone https://github.com/serhii-f8/vadd-ui.git && cd vadd-ui
corepack enable && pnpm install && pnpm build
```

Put `vui` on your `PATH`. A small wrapper script works in every shell:

```sh
mkdir -p ~/bin
printf '#!/bin/sh\nexec node "%s/packages/ui-cli/dist/bin.js" "$@"\n' "$PWD" > ~/bin/vui
chmod +x ~/bin/vui
```

Check the setup:

```sh
vui doctor
```

`doctor` reports the Node version, the environment it detected (native, WSL, SSH, Orca) and whether a Viewer is running, one line per check as it finishes. In WSL it also asks Windows whether it can reach the Viewer, which can take 20 seconds; `vui doctor --quick` skips that probe.

## 2. Show your first document

```sh
vui show --title "Hello" <<'EOF'
{body: [
  {type: 'stats', items: [['Tests', 142], ['Coverage', 0.874, 'pct']]},
  {type: 'checks', items: [
    {name: 'Unit', status: 'ok', ms: 21400},
    {name: 'E2E', status: 'fail', output: 'a.spec.ts:88 expected 401'},
  ]},
]}
EOF
```

The first `show` starts the Viewer, a small local server bound to `127.0.0.1`, and opens it in your browser. Every later `show` appends to the same live feed. `vui` prints one line:

```text
vui: shown "Hello" (#1) in viewer
```

### Name an entry, then update it in place

`--name` gives a show a stable name. On the Viewer it names the feed entry; on the file and Orca chat hosts it becomes the file name (`<name>-<hex4>.html`). Add `--replace` to update the Viewer entry with that name instead of adding a new one: the same entry, with the new content, live in the open feed. That suits progress you report again and again:

```sh
vui show --name build --replace build-status.vui   # first time: adds the entry
vui show --name build --replace build-status.vui   # later: updates it in place
```

With no entry of that name yet, `--replace` adds one. The file and Orca chat hosts accept `--replace` and do nothing more with it.

Useful Viewer commands:

```sh
vui viewer url      # print the address
vui viewer open     # open it again
vui viewer status
vui viewer stop
```

## 3. Learn the format by asking

You do not need to memorize fields. The CLI carries the catalog:

```sh
vui catalog          # all 24 components, one line each
vui catalog table    # fields, types, defaults and an example for one
vui catalog common   # the fields every node takes (id, title, note, tone, span, fold) and their values
vui catalog formats  # every value format and its argument: money:USD, delta:pct, bytes:si, ...
vui schema           # the JSON Schema, for editors and other tools
```

A clean document prints `ok` (with the warning count, if any). When a document is wrong, `validate` says where and suggests a fix:

```console
$ vui validate report.vui
error /body/0: unknown type "tabel" (did you mean "table"?)
error /body/1/kind: "pie" is not a chart kind; use bar|hbar|stacked|donut|line|area|spark|scatter (did you mean "line"?)
```

Paths are JSON Pointers into the document. Exit codes are stable, so scripts and agents can branch on them:

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | invalid document |
| 2 | parse or usage error |
| 3 | a size limit was exceeded |
| 4 | no host available |
| 5 | I/O error |

Add `--json` to any command for machine-readable output.

## 4. Render without a host

```sh
vui render report.vui --format html --out report.html   # one self-contained file
vui render report.vui --format md                       # markdown
vui render report.vui --format text                     # aligned plain text
```

The HTML file contains the document and the renderer and needs no network. The text formats are what an agent falls back to when nothing can draw:

```text
Test run: auth module

- Passed: 142
- Failed: 1 ✗
- Coverage: 87.4% (+1.2%)

Test                          Status    Time
----------------------------  ------  ------
replayed token is rejected ✗  ✗ fail  1.21 s
refresh rotates the token     ✓ ok    340 ms
login sets the cookie         ✓ ok    120 ms
logout revokes the family     ✓ ok     95 ms
```

## 5. Teach your agent

The skill is one file. It tells the agent when a visual helps, how to call `vui show`, and what to do when a call fails.

For yourself, in every project:

```sh
mkdir -p ~/.claude/skills/vadd-ui
cp skills/vadd-ui/SKILL.md ~/.claude/skills/vadd-ui/
```

For one project:

```sh
mkdir -p .claude/skills/vadd-ui
cp /path/to/vadd-ui/skills/vadd-ui/SKILL.md .claude/skills/vadd-ui/
```

Claude Code picks it up at the next session start. From then on, ask for something with structure ("run the tests and summarize", "compare these three options", "what changed on this branch?") and the answer arrives in the Viewer, with one short line of prose in the chat.

The agent uses a visual when the reply has four or more table rows, three or more metrics, test or verification results, a plan with statuses, a change summary over three or more files, a time series, or a decision between options. A single fact or a short explanation stays as text.

## Next

- [Component gallery](components.md): every component with a document and a screenshot.
- [Document format](format.md): envelope, shorthands, formats, statuses and limits.
- [Embedding](embedding.md): the Viewer, Orca chat, standalone HTML, React and the JavaScript API.
