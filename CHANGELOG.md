# Changelog

All packages (`@vadd/ui`, `@vadd/ui-spec`, `@vadd/ui-render`, `@vadd/ui-text`, `@vadd/ui-react`, `@vadd/ui-viewer`, `@vadd/ui-cli`) share one version. The package major equals the format major.

## 1.0.0 — 2026-11-20

The first public release: a compact JSON-like UI document format (`vui: 1`) and a zero-dependency renderer for coding agents. It covers 24 components and 8 chart kinds, with one renderer for the local Viewer, Orca chat, standalone HTML, React and plain web pages. It includes the CLI (`vui show`, `render`, `validate`, `catalog`, `schema`, `extract`, `bench`, `doctor`) and an agent skill.

### Added since the release candidate (stability pass)

- `vui show --name N --replace` updates a named Viewer entry in place, live in the open feed.
- `vui catalog common` lists the shared node fields and their allowed values; `vui catalog formats` lists every format with its argument syntax.
- `vui doctor` prints each check as it finishes; `--quick` skips the slow Windows reachability probe.
- `vui validate` prints `ok` on success.
- Stat items take `better: 'high' | 'low'`, so a falling latency reads as good.
- Charts take `tones: {series: tone}` to color a series by meaning.
- `_italic_` works at word boundaries; `snake_case` stays literal.
- Text and markdown output keep chart data (values, or last/min/max per series).
- More hints: enum errors list their allowed values, a misnamed list says which name the component takes (`kv takes "pairs"`), and browser error cards show "did you mean".

### Fixed

- After `vui viewer stop`, the next `vui show` reuses the existing Orca pane instead of opening a second one.
- Loading `vui.min.js` and `vui-ext.min.js` on one page renders `compare`, `flow` and `scatter` whatever the order; the core bundle alone names the missing bundle.
- Scatter charts pad their axes and show point labels.
- Narrow frames: short formatted values no longer wrap; paths break at `/`, `.`, `_` or `-`.
- A document reports each problem once, so the Viewer and the CLI give the same count.
- A callout that starts with a status token no longer shows two icons.
- Flow edges leave room for their labels; a disclosure's accessible name has no stray space.
- `progress` with `segments` and no `max` scales to the segments' sum.
- The Viewer remembers the theme toggle across reloads.
- `--host file --dir` creates a missing folder; I/O errors are worded (`no such file`) instead of codes.
- Viewer routes answer `HEAD`.
- Tests no longer leave empty workspace folders in the user's state directory.

### Size

`vui.min.js` is 37.3 KiB gzip (budget 38 KiB) and `vui-ext.min.js` 41.8 KiB gzip (budget 45 KiB).
