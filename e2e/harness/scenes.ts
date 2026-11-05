import { TONES } from '../../packages/ui-spec/src/index.js'

// Every core component adds a scene here (tasks 07 to 10). Each runs in `visual.spec.ts` at
// each width and scheme, against a committed baseline.

export interface Scene {
  name: string
  input: unknown
  /** Fixes `rel` and any other now-relative output. */
  now?: string
  /** Default `hidden`, since fixture types are unknown to the validator. */
  diagnostics?: 'hidden' | 'badge' | 'panel'
  /** Opens every closed fold before the shot. */
  open?: boolean
}

export const WIDTHS = [360, 720, 1100] as const

const LONG_TOKEN = 'a-long-unbroken-token-'.repeat(12)

const callout = (text: string) => ({ type: 'callout', text })
const paragraph = { type: 'md', text: 'Some text in a paragraph, long enough to show how it sits.' }
const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    type: 'card',
    title: `Card ${index + 1}`,
    children: [],
  }))

const DAYS = Array.from(
  { length: 30 },
  (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`,
)
const wave = (scale: number, shift: number) =>
  DAYS.map((_, index) => Math.round(scale * (2 + Math.sin(index / 3 + shift))))
const QUARTERS = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026']
const SLO = { y: 100, label: 'SLO', tone: 'err' }

const CHECK_OUTPUT = Array.from({ length: 24 }, (_, index) =>
  index === 23
    ? '\u001b[31m✗ auth.spec.ts:88  expected 401, got 200\u001b[0m'
    : `\u001b[32m✓\u001b[0m auth.spec.ts:${index + 1}  passes`,
).join('\n')

const CHECKS = {
  type: 'checks',
  title: 'Verification',
  items: [
    { name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100 },
    { name: 'Lint', status: 'warn', cmd: 'pnpm lint', ms: 1240, output: '2 warnings' },
    { name: 'E2E', status: 'fail', cmd: 'pnpm e2e', ms: 17700, output: CHECK_OUTPUT },
    { name: 'Deploy preview', status: 'skip' },
    { name: `Long ${LONG_TOKEN}`, status: 'run', cmd: `pnpm ${LONG_TOKEN}`, ms: 90500 },
  ],
}

const DIFF = {
  type: 'diff',
  title: 'Changes',
  files: [
    ['src/auth/refresh.ts', 64, 12, 'M'],
    ['src/auth/rotation.repo.ts', 88, 0, 'A'],
    ['src/auth/legacy.ts', 0, 140, 'D'],
    ['src/auth/{old => new}/token.ts', 3, 3, 'R'],
    ['docs/auth.md', 5, 1],
    [`src/${LONG_TOKEN}.ts`, 1200, 34, 'M'],
  ],
  hunks: {
    'src/auth/refresh.ts':
      '--- a/src/auth/refresh.ts\n+++ b/src/auth/refresh.ts\n@@ -10,4 +10,5 @@ export function refresh() {\n   const token = read()\n-  return issue(token)\n+  const next = rotate(token)\n+  return issue(next)\n }',
    'src/auth/orphan.ts': '@@ -1 +1 @@\n-old\n+new',
  },
}

/** The core components of §6.5 and §6.7, then §19.1 and §19.2 as written. */
function devScenes(): Scene[] {
  return [
    { name: 'checks', input: [CHECKS] },
    { name: 'checks-open', input: [CHECKS], open: true },
    {
      name: 'plan',
      input: [
        {
          type: 'plan',
          title: 'Plan',
          items: [
            { text: 'Add **rotation** table', status: 'ok', note: 'Merged in `0042`' },
            {
              text: 'Invalidate on refresh',
              status: 'run',
              children: [
                { text: 'Write the failing test', status: 'ok' },
                {
                  text: 'Revoke the family',
                  status: 'wait',
                  children: [{ text: 'Backfill', status: 'none' }],
                },
              ],
            },
            { text: 'Replay protection test', status: 'fail' },
            { text: `Long ${LONG_TOKEN}`, status: 'skip' },
          ],
        },
      ],
    },
    { name: 'diff', input: [DIFF] },
    { name: 'diff-open', input: [DIFF], open: true },
    {
      name: 'tree',
      input: [
        {
          type: 'grid',
          children: [
            {
              type: 'tree',
              title: 'Items',
              items: [
                {
                  name: 'src',
                  status: 'ok',
                  children: [
                    {
                      name: 'auth',
                      note: 'Touched by **this** change',
                      children: [{ name: 'a.ts' }],
                    },
                    { name: 'index.ts', status: 'warn' },
                  ],
                },
                { name: 'README.md' },
              ],
            },
            {
              type: 'tree',
              title: 'Paths',
              paths: ['src/auth/refresh.ts', 'src/auth/repo.ts', 'src/index.ts', 'package.json'],
            },
          ],
        },
      ],
    },
    {
      name: 'timeline',
      input: [
        {
          type: 'timeline',
          title: 'Rollout',
          items: [
            { at: '2026-11-05T09:12:00Z', text: 'Canary **started**', status: 'ok' },
            { at: '2026-11-05T09:40:00Z', text: 'Error rate over budget', status: 'fail' },
            { at: '2026-11-05T10:05:00Z', text: 'Rolled back' },
            { at: 'Next week', text: 'Second attempt', status: 'wait' },
          ],
        },
      ],
    },
    {
      name: 'decision',
      input: [
        {
          type: 'decision',
          question: 'Cache layer for catalog queries?',
          context: 'p95 is **140 ms** against a budget of 80 ms.',
          pick: 1,
          options: [
            {
              label: 'In-process LRU',
              pros: ['No infra'],
              cons: ['Per-pod', 'Cold after a deploy'],
              effort: 'S',
              reversible: true,
            },
            {
              label: 'Redis',
              pros: ['Shared'],
              cons: ['New dependency'],
              effort: 'M',
              reversible: true,
              risk: 'med',
              verify: 'p95 < 80 ms in `bench`',
            },
            { label: 'Do nothing', risk: 'high', reversible: false },
          ],
        },
      ],
    },
    {
      name: 'log',
      input: [
        {
          type: 'log',
          title: 'Worker log',
          maxLines: 8,
          text: [
            '2026-11-05T09:12:00Z INFO worker started',
            '2026-11-05T09:12:01Z DEBUG loading config',
            'plain line with no level',
            '[WARN] token cache is cold',
            '',
            '\u001b[31mERROR\u001b[0m rotation failed: expected 401, got 200',
            'ERROR second failure right after the first',
            `INFO ${LONG_TOKEN}`,
            'INFO in the fold',
            'tail line',
          ].join('\n'),
        },
      ],
    },
    {
      name: 'example-19-1',
      input: {
        title: 'Objective #14 — refresh-token rotation',
        subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
        body: [
          {
            type: 'stats',
            items: [
              { label: 'Checks', value: '5/6', tone: 'warn' },
              { label: 'Tests', value: 142, delta: -3, deltaFormat: 'delta' },
              {
                label: 'Coverage',
                value: 0.874,
                format: 'pct',
                delta: 0.012,
                deltaFormat: 'delta:pct',
              },
              { label: 'Duration', value: 48200, format: 'ms' },
            ],
          },
          {
            type: 'checks',
            items: [
              { name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100 },
              { name: 'Unit tests', status: 'ok', cmd: 'pnpm vitest run', ms: 21400 },
              {
                name: 'E2E',
                status: 'fail',
                cmd: 'pnpm e2e',
                ms: 17700,
                output: 'auth.spec.ts:88  expected 401, got 200',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            text: 'E2E fails on expired-token replay. Rotation is not invalidating the old token.',
          },
        ],
      },
    },
    {
      name: 'example-19-2',
      input: [
        {
          type: 'grid',
          children: [
            {
              type: 'plan',
              title: 'Plan',
              items: [
                { text: 'Add rotation table', status: 'ok' },
                { text: 'Invalidate on refresh', status: 'run' },
                { text: 'Replay protection test', status: 'wait' },
              ],
            },
            {
              type: 'diff',
              title: 'Changes',
              files: [
                ['src/auth/refresh.ts', 64, 12, 'M'],
                ['src/auth/rotation.repo.ts', 88, 0, 'A'],
                ['migrations/0042_token_rotation.sql', 21, 0, 'A'],
              ],
            },
          ],
        },
      ],
    },
  ]
}

/** Each kind gets its own baselines; `chart-line` is §19.3's chart. */
function chartScenes(): Scene[] {
  const bar = {
    x: QUARTERS,
    series: { Web: [120, 180, 95, 88, 140, 210], Native: [80, 60, 110, 130, 90, 75] },
  }
  const kinds: [string, Record<string, unknown>][] = [
    ['bar', { title: 'Calls per quarter', yFormat: 'compact', refLines: [SLO], ...bar }],
    [
      'hbar',
      {
        title: 'Slowest queries',
        yFormat: 'ms',
        x: ['listProducts', 'getVariant', 'searchSku', 'a-very-long-query-name-for-the-axis'],
        series: { p95: [84, 61, 212, 1340] },
        refLines: [{ y: 500, label: 'Budget', tone: 'warn' }],
      },
    ],
    ['stacked', { title: 'Calls by client', stackTotal: true, height: 'lg', ...bar }],
    [
      'line',
      {
        title: 'Query latency',
        yFormat: 'ms',
        x: ['10:00', '10:05', '10:10', '10:15', '10:20'],
        series: { p50: [42, 40, 45, 41, 39], p95: [120, 180, 95, 88, 84] },
        refLines: [SLO],
      },
    ],
    [
      'area',
      {
        title: 'Traffic',
        yFormat: 'bytes',
        x: DAYS,
        series: { In: wave(4096, 0), Out: wave(2048, 2) },
      },
    ],
    [
      'donut',
      {
        title: 'Hit rate by store',
        x: ['Warsaw', 'Kyiv', 'Berlin', 'Lisbon', 'Oslo'],
        series: { Hits: [420, 310, 180, 90, 60] },
      },
    ],
    ['spark', { title: 'Trend', values: wave(10, 1) }],
  ]
  const scenes: Scene[] = kinds.map(([kind, fields]) => ({
    name: `chart-${kind}`,
    input: [{ type: 'chart', kind, ...fields }],
  }))
  const many = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`Series ${index + 1}`, wave(5 + index, index / 2)]),
  )
  const firstSix = Object.fromEntries(
    Object.entries(many).map(([name, values]) => [name, values.slice(0, 6)]),
  )
  scenes.push({
    name: 'chart-palette',
    input: [
      {
        type: 'chart',
        kind: 'line',
        title: 'Twelve series',
        height: 'sm',
        legend: 'none',
        x: DAYS,
        series: many,
      },
      { type: 'chart', kind: 'bar', title: 'Twelve series', x: DAYS.slice(0, 6), series: firstSix },
    ],
  })
  return scenes
}

export const SCENES: Scene[] = [
  {
    name: 'document',
    input: {
      title: 'Objective #14 — refresh-token rotation',
      subtitle: 'branch `vadd/obj-14` @ 4f2c1a9, :ok: ready',
      body: [
        {
          type: 'md',
          title: 'Summary',
          note: 'Measured on *main*.',
          text: '**Bold**, *italic*, `code`, ~~strike~~ and a [link](https://example.test/). :fail: :run:',
        },
        { type: 'md', title: 'Overflow', tone: 'warn', text: LONG_TOKEN },
      ],
    },
  },
  {
    name: 'comfortable',
    input: {
      title: 'Comfortable density',
      density: 'comfortable',
      body: [{ type: 'stack', title: 'Stack', children: ['First', 'Second'] }],
    },
  },
  { name: 'tones', input: [{ type: 'x-tones', title: 'Tones and statuses' }] },
  { name: 'values', input: [{ type: 'x-values', title: 'Formatted values' }] },
  {
    name: 'cards',
    input: [
      { type: 'hologram', depth: 3 },
      { type: 'md', id: 'broken' },
      { type: 'x-boom', title: 'A failing component' },
      { type: 'md', text: 'A healthy neighbor.', tone: 'neon' },
    ],
    diagnostics: 'panel',
  },
  {
    name: 'badge',
    input: [{ type: 'md', text: 'One warning.', tone: 'neon' }],
    diagnostics: 'badge',
  },
  { name: 'parse-error', input: "{title: 'Unclosed\nbody: [" },
  {
    name: 'folds',
    input: [
      { type: 'md', title: 'Closed fold', fold: 'closed', text: 'Hidden.' },
      { type: 'md', title: 'Open fold', fold: 'open', text: 'Shown.', note: 'With a note.' },
    ],
  },
  {
    name: 'stack',
    input: [
      { type: 'stack', title: 'Small gap', gap: 'sm', children: [callout('One'), callout('Two')] },
      { type: 'stack', title: 'Default gap', children: [callout('One'), callout('Two')] },
      { type: 'stack', title: 'Large gap', gap: 'lg', children: [callout('One'), callout('Two')] },
    ],
  },
  {
    name: 'grid',
    input: [
      { type: 'grid', title: 'Auto, three children', children: cards(3) },
      { type: 'grid', title: 'Auto, four children', children: cards(4) },
      { type: 'grid', title: 'Auto, seven children', children: cards(7) },
      {
        type: 'grid',
        title: 'Four columns with spans',
        cols: 4,
        children: [
          { type: 'card', title: 'Span 3', span: 3, children: [] },
          { type: 'card', title: 'One', children: [] },
          { type: 'card', title: 'Past the end', span: 12, children: [] },
        ],
      },
      {
        type: 'grid',
        title: 'Nested',
        cols: 2,
        children: [
          { type: 'grid', cols: 2, children: cards(2) },
          { type: 'card', title: 'Neighbor', children: [] },
        ],
      },
    ],
  },
  {
    name: 'section',
    input: [
      {
        type: 'section',
        title: 'Rollout',
        note: 'Updated by the agent.',
        children: [
          { type: 'md', text: 'A section holds **content**.' },
          {
            type: 'section',
            title: 'A nested section',
            children: [{ type: 'md', text: 'One level down.' }],
          },
        ],
      },
      { type: 'section', title: 'Closed', fold: 'closed', children: [callout('Hidden')] },
      { type: 'section', title: 'Open', fold: 'open', children: [callout('Shown')] },
    ],
  },
  {
    name: 'card',
    input: [
      { type: 'card', title: 'Plain card', note: 'With a note.', children: [paragraph] },
      ...TONES.map((tone) => ({
        type: 'card',
        title: `Tone ${tone}`,
        tone,
        children: [paragraph],
      })),
      { type: 'md', title: 'Tone on another node', tone: 'err', text: 'Any node has a bar.' },
      { type: 'md', title: 'Muted', tone: 'muted', text: 'A bar and no mark.' },
    ],
  },
  {
    name: 'tabs',
    input: [
      {
        type: 'tabs',
        title: 'First tab open',
        tabs: [
          { label: 'Summary', children: [paragraph] },
          { label: 'Details', children: [callout('Second panel')] },
          { label: 'A rather long tab label', children: [] },
        ],
      },
      {
        type: 'tabs',
        title: 'Starts on the second',
        active: 1,
        tabs: [
          { label: 'One', children: [paragraph] },
          { label: 'Two', children: [callout('Second panel')] },
        ],
      },
    ],
  },
  {
    name: 'divider',
    input: [
      paragraph,
      { type: 'divider' },
      paragraph,
      { type: 'divider', label: 'Earlier runs' },
      paragraph,
    ],
  },
  {
    name: 'md',
    input: [
      {
        type: 'md',
        text: [
          '### Heading three',
          'A paragraph with **bold**, *italic*, `code`, ~~strike~~, a [link](https://example.test/) and :warn: a status.',
          '#### Heading four',
          '- First\n- Second\n  1. Nested one\n  2. Nested two\n- Third',
          '> A quote keeps its *inline* text.\n>\n> And its paragraphs.',
          '```ts\nconst answer = 42\n```',
          'Not markup: <b>tags</b> and ## two hashes.',
        ].join('\n\n'),
      },
    ],
  },
  {
    name: 'callout',
    input: [
      callout('Info by default, with a [link](https://example.test/) and `code`.'),
      {
        type: 'callout',
        title: 'With a title',
        note: 'And a note.',
        tone: 'warn',
        text: 'Check the *rollout* first.',
      },
      ...TONES.map((tone) => ({ type: 'callout', tone, text: `Tone ${tone}.` })),
    ],
  },
  {
    name: 'code',
    input: [
      {
        type: 'code',
        title: 'Lines and marks',
        lang: 'ts',
        lines: true,
        mark: [2],
        text: 'const a = 1\nconst b = a + 1\n\nexport { a, b } // and a long comment that has to wrap on the narrowest width we support\n',
      },
      { type: 'code', text: 'plain text, no label' },
      { type: 'code', lang: 'log', maxLines: 3, text: 'l1\nl2\nl3\nl4\nl5' },
      { type: 'code', lines: true, mark: [2], text: LONG_TOKEN },
    ],
  },
  {
    name: 'table',
    input: {
      title: 'Catalog query latency',
      generatedAt: '2026-11-05T12:00:00Z',
      body: [
        {
          type: 'table',
          title: 'Queries, *slowest first*',
          columns: ['Query', 'Calls:int', 'p95:ms', 'Hit rate:pct'],
          rows: [
            ['listProducts', 18420, 84, 0.93],
            ['getVariant', 9310, 61, 0.88],
            ['searchSku', 2204, 212, 0.41, { tone: 'warn', note: 'Missing an index.' }],
          ],
          sort: [2, 'desc'],
          totals: ['All', 29934, null, null],
        },
        {
          type: 'table',
          title: 'All four cell types',
          columns: [
            'Test',
            'Status:status',
            { key: 'risk', label: 'Risk', cell: 'badge', tones: { high: 'err', low: 'ok' } },
            { key: 'cov', label: 'Coverage', format: 'pct:0', cell: 'bar' },
            { key: 'sha', label: 'Commit', cell: 'code' },
          ],
          rows: [
            ['login', 'ok', 'low', 0.92, '4f2c1a9'],
            ['refresh', 'fail', 'high', 0.71, 'b81e00d'],
            ['logout', 'run', 'none', null, null],
          ],
        },
        {
          type: 'table',
          columns: ['Area', 'Test', 'Time:ms'],
          group: 0,
          pageSize: 4,
          rows: [
            ['api', 'list', 120],
            ['api', 'create', 340],
            ['ui', 'render', 20],
            ['ui', 'sort', 18],
            ['ui', 'page', 22],
          ],
          note: 'Grouped, with a page of four rows.',
        },
      ],
    },
  },
  {
    name: 'table-wide',
    input: [
      {
        type: 'table',
        title: 'A wide table scrolls in its own box',
        columns: [
          'Package',
          'Lines:int',
          'Branches:pct:0',
          'Size:bytes',
          'Build:ms',
          'Owner',
          { key: 'path', label: 'Path', format: 'path' },
          'Updated:date',
        ],
        rows: Array.from({ length: 18 }, (_, index) => [
          `@vadd/package-${index}`,
          1200 + index * 73,
          0.5 + index / 40,
          20480 * (index + 1),
          80 + index * 7,
          'platform team',
          `packages/ui-render/src/components/file-${index}.ts`,
          '2026-11-05',
        ]),
        pageSize: 16,
      },
    ],
  },
  {
    name: 'kv',
    input: [
      {
        type: 'kv',
        title: 'Two columns',
        cols: 2,
        pairs: [
          ['Branch', 'vadd/obj-14', 'code'],
          ['Size', 1500000, 'bytes'],
          ['Status', 'ok', 'status'],
          ['Merged', '2026-11-04', 'date'],
          ['Reviewer', 'none'],
          ['Note', null],
        ],
      },
      { type: 'kv', title: 'An object, in one column', pairs: { Region: 'eu-west', Replicas: 3 } },
      {
        type: 'kv',
        title: 'Three columns',
        cols: 3,
        pairs: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
      },
    ],
  },
  {
    name: 'stats',
    input: [
      {
        type: 'stats',
        title: 'This week',
        items: [
          {
            label: 'Requests',
            value: 1284000,
            format: 'compact',
            delta: 0.042,
            deltaFormat: 'delta:pct',
          },
          {
            label: 'p95',
            value: 84,
            format: 'ms',
            delta: -12,
            deltaFormat: 'delta:ms:better:low',
            spark: [120, 110, 98, 104, 92, 88, 84],
          },
          { label: 'Errors', value: 41, tone: 'err', delta: 9, deltaFormat: 'delta:better:low' },
          { label: 'Hit rate', value: 0.93, format: 'pct', tone: 'ok', spark: [1, 1, 1] },
          { label: 'Backlog', value: 7, tone: 'muted' },
        ],
      },
    ],
  },
  {
    name: 'list',
    input: [
      {
        type: 'list',
        title: 'Bulleted',
        items: ['Plain text with `code`', '**Bold** and a [link](https://example.test/)'],
      },
      {
        type: 'list',
        title: 'With status',
        items: [
          { text: 'Build', status: 'ok' },
          { text: 'Tests', status: 'fail', note: '3 failed in `ui-render`.' },
          { text: 'Deploy', status: 'wait' },
          'A plain item among them',
        ],
      },
      {
        type: 'list',
        title: 'Numbered',
        ordered: true,
        items: [
          'First',
          { text: 'Second', status: 'run' },
          { text: 'Third', note: 'With a note.' },
        ],
      },
    ],
  },
  {
    name: 'progress',
    input: [
      { type: 'progress', value: 42, label: 'Migration' },
      { type: 'progress', value: 3, max: 4, tone: 'ok', label: 'Tasks' },
      { type: 'progress', value: 80 },
      {
        type: 'progress',
        value: 86,
        label: 'Test suite',
        segments: [
          { value: 70, tone: 'ok', label: 'Passed' },
          { value: 6, tone: 'warn', label: 'Flaky' },
          { value: 10, tone: 'err', label: 'Failed' },
          { value: 14, tone: 'muted', label: 'Skipped' },
        ],
      },
    ],
  },
  ...chartScenes(),
  ...devScenes(),
]
