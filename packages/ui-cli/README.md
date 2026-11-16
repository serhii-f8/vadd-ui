# @vadd/ui-cli

The `vui` command: show a vadd-ui document as rich UI, or validate and render it without a host.

```sh
vui show --title "Release check" <<'EOF'
{body: [
  {type: 'stats', items: [['Tests', 142], ['Coverage', 0.874, 'pct']]},
  {type: 'checks', items: [{name: 'Unit', status: 'ok', ms: 21400}, {name: 'E2E', status: 'fail'}]},
]}
EOF
```

`vui show` picks the host by itself: the local Viewer in a terminal (native, WSL or SSH), or an inline visual in Orca chat.

## Commands

| Command | Does |
| --- | --- |
| `vui show [file\|-]` | Validate and show a document. `--title`, `--host auto\|viewer\|orca-chat\|file`, `--no-open`. |
| `vui viewer start\|stop\|status\|open\|url` | Manage the local Viewer. |
| `vui render [file\|-] --format html\|md\|text` | Render to a self-contained HTML file, markdown or plain text. `--out`, `--cdn`. |
| `vui validate [file\|-]` | Report diagnostics with JSON Pointer paths and hints. `--strict` fails on warnings. |
| `vui catalog [component]` | Print the components, or the fields and an example of one. |
| `vui schema` | Print the JSON Schema. |
| `vui extract [file.html\|-]` | Get the document back out of a rendered file. |
| `vui bench [dir]` | Measure token cost against markdown and hand-written HTML. |
| `vui doctor` | Explain the detected environment. |

Stdin is read when the file is `-` or omitted. `--json` works on every command.

Exit codes: `0` ok, `1` invalid, `2` parse or usage, `3` limit, `4` no host, `5` I/O.

Needs Node 20 or newer.

## More

Part of [vadd-ui](https://github.com/serhii-f8/vadd-ui): a compact UI document format and zero-dependency renderer for coding agents. See the [component gallery](https://github.com/serhii-f8/vadd-ui/blob/main/docs/components.md), the [document format](https://github.com/serhii-f8/vadd-ui/blob/main/docs/format.md) and the [embedding guide](https://github.com/serhii-f8/vadd-ui/blob/main/docs/embedding.md).

Apache-2.0
