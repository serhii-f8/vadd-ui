import { describe, expect, it } from 'vitest'
import {
  COMPONENT_TYPES,
  type ComponentType,
  DENSITIES,
  STATUSES,
  TONES,
  type VuiDocument,
  type VuiNode,
} from '../src/types.js'

// One canonical node of every component. Compiling this is the test of the types.
const everyComponent: VuiNode[] = [
  { type: 'stack', children: [], gap: 'md' },
  { type: 'grid', children: [], cols: 2 },
  { type: 'section', title: 'S', children: [], fold: 'closed' },
  { type: 'card', children: [], tone: 'accent' },
  { type: 'tabs', tabs: [{ label: 'A', children: [] }], active: 0 },
  { type: 'divider', label: 'or' },
  { type: 'md', text: 'hi' },
  { type: 'callout', text: 'hi', tone: 'info' },
  { type: 'code', text: 'x', lang: 'ts', lines: true, mark: [1], maxLines: 30 },
  {
    type: 'table',
    columns: [{ key: 'a', label: 'A', format: 'pct:0', cell: 'bar', tones: { high: 'err' } }],
    rows: [[1], [2, { tone: 'warn', note: 'n' }]],
    sort: [0, 'desc'],
    pageSize: 25,
    totals: [null],
    group: 0,
    sticky: false,
  },
  { type: 'kv', pairs: [['k', 1, 'int']], cols: 2 },
  { type: 'kv', pairs: { k: 'v' } },
  { type: 'stats', items: [{ label: 'L', value: 1, delta: 1, tone: 'ok', spark: [1] }] },
  { type: 'list', items: ['x', { text: 'y', status: 'ok' }], ordered: true },
  { type: 'progress', value: 1, max: 100, segments: [{ value: 1, tone: 'ok', label: 'a' }] },
  {
    type: 'compare',
    options: ['a'],
    criteria: [{ label: 'c', values: [1], better: 'high' }],
    pick: 0,
  },
  { type: 'chart', kind: 'bar', x: ['a'], series: { s: [1] }, height: 'md', legend: 'auto' },
  { type: 'chart', kind: 'line', x: [1], series: { s: [1] }, refLines: [{ y: 1 }] },
  { type: 'chart', kind: 'donut', x: ['a'], series: { s: [1] } },
  { type: 'chart', kind: 'spark', values: [1] },
  { type: 'chart', kind: 'scatter', points: [[1, 2, 'p']] },
  { type: 'checks', items: [{ name: 'n', status: 'ok', cmd: 'c', ms: 1, output: 'o' }] },
  { type: 'plan', items: [{ text: 't', status: 'run', children: [{ text: 'u', status: 'ok' }] }] },
  { type: 'diff', files: [['a', 1, 0, 'A']], hunks: { a: '@@' } },
  { type: 'tree', items: [{ name: 'n', children: [{ name: 'm' }] }] },
  { type: 'tree', paths: ['a/b'] },
  { type: 'timeline', items: [{ at: '10:00', text: 't', status: 'ok' }] },
  {
    type: 'decision',
    question: 'q',
    options: [{ label: 'l', pros: ['p'], effort: 'S', reversible: true, risk: 'low', verify: 'v' }],
    pick: 0,
  },
  { type: 'log', text: 'x', maxLines: 40 },
  { type: 'flow', nodes: ['a', { id: 'b', status: 'ok' }], edges: [['a', 'b', 'l']] },
]

describe('canonical types', () => {
  it('lists the 24 components of §6', () => {
    expect(COMPONENT_TYPES).toHaveLength(24)
    expect(new Set(COMPONENT_TYPES).size).toBe(24)
  })

  it('has a canonical example of every component', () => {
    const seen = new Set<ComponentType>(everyComponent.map((node) => node.type))
    expect([...seen].sort()).toEqual([...COMPONENT_TYPES].sort())
  })

  it('matches the closed enums of §2 and §5.2', () => {
    expect(STATUSES).toEqual(['ok', 'fail', 'warn', 'info', 'run', 'wait', 'skip', 'none'])
    expect(TONES).toEqual(['ok', 'warn', 'err', 'info', 'muted', 'accent', 'default'])
    expect(DENSITIES).toEqual(['compact', 'comfortable'])
  })

  it('describes a canonical document', () => {
    const document: VuiDocument = {
      vui: 1,
      title: 'T',
      subtitle: 'S',
      density: 'compact',
      locale: 'en-US',
      generatedAt: '2026-11-04T10:15:00Z',
      body: everyComponent,
      meta: { generator: 'vui' },
    }
    expect(document.body).toHaveLength(everyComponent.length)
  })
})
