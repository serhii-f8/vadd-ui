import { envelope, type ValidCase } from './types.js'

// The documents of the spec, as written there. A test compares each `text` with the spec
// file. Each `canonical` is written by hand from §5.2, §5.3 and VD-024.

export const example191 = `{
  title: 'Objective #14 — refresh-token rotation',
  subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
  body: [
    {type: 'stats', items: [
      {label: 'Checks', value: '5/6', tone: 'warn'},
      {label: 'Tests', value: 142, delta: -3, deltaFormat: 'delta'},
      {label: 'Coverage', value: 0.874, format: 'pct', delta: 0.012, deltaFormat: 'delta:pct'},
      {label: 'Duration', value: 48200, format: 'ms'},
    ]},
    {type: 'checks', items: [
      {name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100},
      {name: 'Unit tests', status: 'ok', cmd: 'pnpm vitest run', ms: 21400},
      {name: 'E2E', status: 'fail', cmd: 'pnpm e2e', ms: 17700,
       output: 'auth.spec.ts:88  expected 401, got 200'},
    ]},
    {type: 'callout', tone: 'warn', text: 'E2E fails on expired-token replay. Rotation is not invalidating the old token.'},
  ],
}`

export const example192 = `[
  {type: 'grid', children: [
    {type: 'plan', title: 'Plan', items: [
      {text: 'Add rotation table', status: 'ok'},
      {text: 'Invalidate on refresh', status: 'run'},
      {text: 'Replay protection test', status: 'wait'},
    ]},
    {type: 'diff', title: 'Changes', files: [
      ['src/auth/refresh.ts', 64, 12, 'M'],
      ['src/auth/rotation.repo.ts', 88, 0, 'A'],
      ['migrations/0042_token_rotation.sql', 21, 0, 'A'],
    ]},
  ]},
]`

export const example193 = `{
  title: 'Catalog query latency',
  body: [
    {type: 'chart', kind: 'line', yFormat: 'ms',
     x: ['10:00','10:05','10:10','10:15','10:20'],
     series: {p50: [42,40,45,41,39], p95: [120,180,95,88,84]},
     refLines: [{y: 100, label: 'SLO', tone: 'err'}]},
    {type: 'table', columns: ['Query', 'Calls:int', 'p95:ms', 'Hit rate:pct'],
     rows: [['listProducts', 18420, 84, 0.93], ['getVariant', 9310, 61, 0.88], ['searchSku', 2204, 212, 0.41, {tone: 'warn'}]],
     sort: [2, 'desc']},
  ],
}`

export const example66 = `{"type":"table","columns":["Test","Status:status","Time:ms",{"key":"cov","label":"Coverage","format":"pct:0","cell":"bar"}],
 "rows":[["login","ok",120,0.92],["refresh","fail",340,0.71]]}`

export const example67 = `{"type":"decision","question":"Cache layer for catalog queries?","pick":1,
 "options":[{"label":"In-process LRU","pros":["No infra"],"cons":["Per-pod"],"effort":"S","reversible":true},
            {"label":"Redis","pros":["Shared"],"cons":["New dependency"],"effort":"M","reversible":true,"verify":"p95 < 80 ms in bench"}]}`

export const example52 = `{
  "vui": 1,
  "title": "Test run — auth module",
  "subtitle": "main @ 4f2c1a9",
  "density": "compact",
  "locale": "en-US",
  "generatedAt": "2026-11-04T10:15:00Z",
  "body": [ /* nodes */ ]
}`

export const exampleCases: ValidCase[] = [
  {
    name: '§19.1 verification report',
    text: example191,
    canonical: envelope(
      [
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
      {
        title: 'Objective #14 — refresh-token rotation',
        subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
      },
    ),
  },
  {
    name: '§19.2 change summary with a plan',
    text: example192,
    canonical: envelope([
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
    ]),
  },
  {
    name: '§19.3 benchmark table with a chart',
    text: example193,
    canonical: envelope(
      [
        {
          type: 'chart',
          kind: 'line',
          yFormat: 'ms',
          x: ['10:00', '10:05', '10:10', '10:15', '10:20'],
          series: { p50: [42, 40, 45, 41, 39], p95: [120, 180, 95, 88, 84] },
          refLines: [{ y: 100, label: 'SLO', tone: 'err' }],
        },
        {
          type: 'table',
          columns: [
            { key: 'Query', label: 'Query' },
            { key: 'Calls', label: 'Calls', format: 'int' },
            { key: 'p95', label: 'p95', format: 'ms' },
            { key: 'Hit rate', label: 'Hit rate', format: 'pct' },
          ],
          rows: [
            ['listProducts', 18420, 84, 0.93],
            ['getVariant', 9310, 61, 0.88],
            ['searchSku', 2204, 212, 0.41, { tone: 'warn' }],
          ],
          sort: [2, 'desc'],
          pageSize: 25,
          sticky: false,
        },
      ],
      { title: 'Catalog query latency' },
    ),
  },
  {
    name: '§6.6 table',
    text: example66,
    canonical: envelope([
      {
        type: 'table',
        columns: [
          { key: 'Test', label: 'Test' },
          { key: 'Status', label: 'Status', format: 'status' },
          { key: 'Time', label: 'Time', format: 'ms' },
          { key: 'cov', label: 'Coverage', format: 'pct:0', cell: 'bar' },
        ],
        rows: [
          ['login', 'ok', 120, 0.92],
          ['refresh', 'fail', 340, 0.71],
        ],
        pageSize: 25,
        sticky: false,
      },
    ]),
  },
  {
    name: '§6.7 decision',
    text: example67,
    canonical: envelope([
      {
        type: 'decision',
        question: 'Cache layer for catalog queries?',
        pick: 1,
        options: [
          {
            label: 'In-process LRU',
            pros: ['No infra'],
            cons: ['Per-pod'],
            effort: 'S',
            reversible: true,
          },
          {
            label: 'Redis',
            pros: ['Shared'],
            cons: ['New dependency'],
            effort: 'M',
            reversible: true,
            verify: 'p95 < 80 ms in bench',
          },
        ],
      },
    ]),
  },
  {
    name: '§5.2 envelope',
    text: example52,
    canonical: envelope([], {
      title: 'Test run — auth module',
      subtitle: 'main @ 4f2c1a9',
      generatedAt: '2026-11-04T10:15:00Z',
    }),
  },
]
