# Document format

A vadd-ui document (a "VUI document", file extension `.vui`) is one JSON value that describes what to show. This page is the reference; `vui schema` prints the same rules as a JSON Schema.

## Syntax

Strict JSON always works. The parser also accepts a relaxed subset that is cheaper to write:

```js
{
  title: 'Unquoted keys',            // and comments
  body: ['single-quoted strings', {type: 'divider'},],   /* and trailing commas */
}
```

Not accepted: hex numbers, `Infinity`, `NaN`, multi-line string continuations. Parse errors report a line and a column.

## Envelope

```js
{
  vui: 1,
  title: 'Test run: auth module',
  subtitle: 'main @ 4f2c1a9',
  density: 'compact',
  locale: 'en-US',
  generatedAt: '2026-11-04T10:15:00Z',
  body: [ /* nodes */ ],
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `vui` | `1` | Format major version. |
| `title` | none | The heading of the visual, and its name in the Viewer feed. |
| `subtitle` | none | A muted line under the title. Inline text. |
| `density` | `compact` | `compact` or `comfortable` spacing. |
| `locale` | `en-US` | BCP 47 tag used for numbers, money and dates. |
| `generatedAt` | set by the CLI | The reference "now" for relative times, so a document renders the same tomorrow. |
| `body` | required | Nodes, drawn top to bottom. |
| `meta` | none | Ignored by the renderer. |

## Shorthands

These are expanded before validation, so they cost nothing at render time:

| You write | It means |
| --- | --- |
| `[ … ]` at the top level | `{body: [ … ]}` |
| `{type: 'table', … }` at the top level | `{body: [{type: 'table', … }]}` |
| `'some text'` where a node is expected | `{type: 'md', text: 'some text'}` |
| a single node for `children` or `items` | an array with that node |
| `columns: ['Test', 'Time:ms']` | two columns, the second with format `ms` |
| table `rows` as objects | positional rows, ordered by `columns` |

## Nodes

Every node has a `type` and may use these common fields:

| Field | Meaning |
| --- | --- |
| `id` | Target for in-document links (`[jump](#id)`) and diagnostics. |
| `title` | Heading of the node. |
| `note` | Muted caption under the node. |
| `tone` | Color intent of the frame or accent. |
| `span` | Column span, 1 to 12, inside a `grid`. |
| `fold` | `open` or `closed`: makes the node collapsible, with `title` as the toggle. |

Unknown fields are ignored and reported as `info`. An unknown `type` renders a visible placeholder. The 24 types are shown in the [component gallery](components.md); `vui catalog <type>` prints the fields of one.

## Inline text

Titles, notes, table cells, list items and similar fields accept a small markdown subset:

`**bold**` · `*italic*` · `` `code` `` · `[label](https://example.com)` · `~~strike~~` · status tokens such as `:ok:` and `:fail:`

A status token renders as an icon-and-label badge. Raw HTML is never interpreted; it shows up as the text it is.

## Statuses and tones

**Statuses** describe the state of a thing: `ok` `fail` `warn` `info` `run` `wait` `skip` `none`. Each has an icon and a label, so meaning never depends on color.

**Tones** describe intent for a frame, row or accent: `ok` `warn` `err` `info` `muted` `accent` `default`.

## Formats

Send raw values and name a format once per column, tile or axis. The renderer formats with `Intl` in the document's locale, and the text renderers produce the same strings.

| Format | Input | Output |
| --- | --- | --- |
| `text` | anything | the value, with inline markdown |
| `num` · `num:2` | number | `1,234.5` |
| `int` | number | `1,235` |
| `compact` | number | `12.3K`, `4.1M` |
| `pct` · `pct:0` | ratio 0 to 1 | `92.0%` |
| `pct100` | number 0 to 100 | `92.0%` |
| `delta` · `delta:pct` | number | `+4.2%`, toned by sign |
| `ms` | milliseconds | `340 ms`, `1.24 s`, `2m 05s` |
| `dur` | seconds | `45 s`, `3m 20s`, `1h 02m` |
| `bytes` · `bytes:si` | bytes | `1.4 MiB` |
| `money:USD` | number | `$1,234.50` (the currency code is required) |
| `date` · `date:long` · `date:time` · `date:datetime` | ISO 8601 or epoch ms | `Nov 4, 2026` |
| `rel` | ISO 8601 or epoch ms | `3 min ago`, relative to `generatedAt` |
| `status` | a status | icon and label badge |
| `code` | string | monospace, truncated over 60 characters |
| `path` | string | monospace, middle-truncated, basename emphasized |
| `link` | URL or `[label](url)` | an anchor; `http`, `https` and `mailto` only |
| `sha` · `sha:10` | string | `4f2c1a9` |

`null` or a missing value renders as a muted em dash. A value of the wrong type for its format renders as raw text and produces a `warn`; it never throws.

### Table cells

A column object can set `cell` to change how the formatted value is drawn:

```js
{type: 'table',
 columns: ['Endpoint', {key: 'hit', label: 'Cache hit', format: 'pct', cell: 'bar'}, 'p95:ms', 'Status:status'],
 sort: [2, 'desc'],
 rows: [
   ['POST /checkout', 0.12, 420, 'fail', {tone: 'err'}],
   ['GET /products', 0.93, 64, 'ok'],
 ]}
```

| `cell` | Draws |
| --- | --- |
| `text` | plain formatted text |
| `bar` | text plus an inline bar, scaled to the column maximum (or to 1 for `pct`) |
| `badge` | a tone-colored pill; map values to tones with `tones: {high: 'err', low: 'ok'}` |
| `code` | a monospace cell that copies on click |

A trailing object in a row (`{tone: 'err'}`, `{note: '…'}`) sets options for that row. Tables sort on header click, page at 25 rows by default, and accept `totals` and `group`.

## Diagnostics

Validation is strict in the CLI and lenient in the renderer: `vui` refuses to show an invalid document, while a renderer handed one anyway draws what it can and marks the rest.

```text
error /body/0: unknown type "tabel" (did you mean "table"?)
warn  /body/1/criteria/2/format: format money needs an ISO 4217 code
```

Each diagnostic has a severity (`error`, `warn`, `info`), a JSON Pointer path, a code and a message. `vui validate --strict` also fails on warnings; `--json` returns them as data.

## Limits

| Limit | Value |
| --- | --- |
| Input size | 256 KiB |
| Nesting depth | 12 |
| Nodes per document | 400 |
| Table rows | 5,000 |
| Table columns | 30 |
| Chart series | 12 |
| Chart points per series | 10,000 (downsampled for drawing) |
| String length | 20,000 characters in `code`, `log` and `md`; 2,000 elsewhere |
| `flow` nodes | 40 |

Over a limit, the CLI exits with code 3. A renderer truncates and shows a warning badge.

## Writing compact documents

- Use positional `rows` with string columns and suffix formats: `'Time:ms'`.
- Send raw numbers: ratios for `pct`, milliseconds for `ms`, ISO strings for dates. Never pre-format.
- Put related content in one document with `section`s, not several small ones.
- Use status tokens (`:ok:`) instead of emoji.
- Cut long logs to the lines that matter before putting them in `log` or a check's `output`.
- Never put secrets, tokens or environment dumps in a document.
