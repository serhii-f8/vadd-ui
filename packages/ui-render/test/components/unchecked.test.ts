import { type JsonValue, normalize, parse } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { validCases } from '../../../ui-spec/test/corpus/cases.js'
import { node, Rand, rng } from '../../../ui-spec/test/fuzz/generator.js'
import { badAttributes, hostile, showUnchecked } from '../helpers.js'

// VD-187: past `inspect`'s issue cap (VD-066) nothing drops a bad field, so every field a core
// component reads can hold any JSON value. These are the sites that coerced one before
// checking its type; `H` is an object whose own `toString` and `valueOf` are data.

const H = hostile
const failed = (handle: { diagnostics: { code: string; path: string }[] }) =>
  handle.diagnostics.filter(({ code }) => code === 'render-failed').map(({ path }) => path)

const bar = { type: 'chart', kind: 'bar', x: ['a', 'b'], series: { s: [1, 2] } }

describe('a core component past the issue cap', () => {
  it.each([
    ['an object', H()],
    ['an array', [H()]],
    ['a number', 7],
    ['an inherited key', 'constructor'],
    ['a prototype key', '__proto__'],
  ])('draws a chart whose height is %s at the default height', (_, height) => {
    const { box, handle } = showUnchecked([{ ...bar, height }])
    expect(failed(handle)).toEqual([])
    expect(box.querySelector('.vui-chart svg')?.getAttribute('height')).toBe('200')
  })

  it('still reads a good height past the cap', () => {
    const { box } = showUnchecked([{ ...bar, height: 'lg' }])
    expect(box.querySelector('.vui-chart svg')?.getAttribute('height')).toBe('300')
  })

  it.each([[H()], [[H()]], ['__proto__'], ['constructor'], ['pie']])(
    'renders a chart whose kind is %j, labelled as a chart',
    (kind) => {
      const { box, handle } = showUnchecked([{ ...bar, kind }])
      expect(failed(handle)).toEqual([])
      expect(box.querySelector('.vui-chart title')?.textContent).toBe('Chart')
      expect(box.querySelector('.vui-chart desc')?.textContent).toMatch(/^Chart, 1 series/)
    },
  )

  it.each([[H()], [[H()]]])('prints a kv key of %j', (key) => {
    const { box, handle } = showUnchecked([{ type: 'kv', pairs: [[key, 1]] }])
    expect(failed(handle)).toEqual([])
    expect(box.querySelector('.vui-kv dt')?.textContent).toContain('toString')
  })

  it.each([
    ['path', [H(), 1, 2]],
    ['path in an array', [[H()], 1, 2]],
    ['added', ['a.ts', H(), 2]],
    ['removed', ['a.ts', 1, [H()]]],
  ])('renders a diff file whose %s is hostile', (_, file) => {
    const { handle } = showUnchecked([{ type: 'diff', files: [file], hunks: { 'a.ts': '+x' } }])
    expect(failed(handle)).toEqual([])
  })

  it('still counts a good diff file past the cap', () => {
    const { box } = showUnchecked([{ type: 'diff', files: [['a.ts', 3, 1, 'M']] }])
    expect(box.querySelector('.vui-diff .vui-row-end')?.textContent).toBe('+3 −1')
  })

  it.each([[H()], [[H()]]])('renders a table column label of %j', (label) => {
    const { handle } = showUnchecked([
      { type: 'table', columns: [{ key: 'a', label }], rows: [[1]] },
    ])
    expect(failed(handle)).toEqual([])
  })

  it.each([[H()], [[H()]]])('sorts a table with a cell of %j', (cell) => {
    const { box, handle } = showUnchecked([
      {
        type: 'table',
        columns: [{ key: 'a', label: 'A' }],
        rows: [['b'], [cell, 'z'], ['a']],
        sort: [0, 'asc'],
      },
    ])
    expect(failed(handle)).toEqual([])
    expect(box.querySelectorAll('tbody tr')).toHaveLength(3)
  })
})

// The sweep behind VD-187: every place inside a sample of every core node, at any depth, holds
// in turn `H`, `[H]`, a string and `null`. Samples are the valid corpus's nodes plus generator
// nodes, which set each optional field most of the time.

type Place = [Record<string, unknown> | unknown[], string | number, string]

function places(root: unknown, at = ''): Place[] {
  const found: Place[] = []
  const entries: [string | number, unknown][] = Array.isArray(root)
    ? root.map((value, index) => [index, value])
    : root !== null && typeof root === 'object'
      ? Object.entries(root)
      : []
  for (const [key, value] of entries) {
    const pointer = `${at}/${key}`
    found.push([root as Place[0], key, pointer], ...places(value, pointer))
  }
  return found
}

function sampleNodes(): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value !== null && typeof value === 'object') {
      if (typeof (value as { type?: unknown }).type === 'string') nodes.push(value as never)
      Object.values(value).forEach(visit)
    }
  }
  for (const item of validCases) {
    const input = item.input ?? (parse(item.text as string) as { value: JsonValue }).value
    visit(normalize(input as JsonValue).document)
  }
  for (let seed = 1; seed <= SAMPLE_SEEDS; seed += 1) {
    const r = new Rand(rng(seed))
    r.maxDepth = 1
    visit(node(r, 1))
  }
  const seen = new Map<string, number>()
  return nodes.filter((sample) => {
    const key = `${sample.type}${typeof sample.kind === 'string' ? sample.kind : ''}`
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count < PER_KIND && places(sample).length < MAX_PLACES
  })
}

const SAMPLE_SEEDS = 800
const PER_KIND = 12
const MAX_PLACES = 120
/** Nodes per render with the pad, under §13.4's 400, so the body is never cut. */
const NODE_BUDGET = 390
const STAND_INS: [string, () => unknown][] = [
  ['H', H],
  ['[H]', () => [H()]],
  ['"x"', () => 'x'],
  ['null', () => null],
  ['"__proto__"', () => '__proto__'],
  ['"constructor"', () => 'constructor'],
  ['1e308', () => 1e308],
  ['true', () => true],
  ['{}', () => ({})],
]

/** About the nodes `case` holds: every object with a `type`, wherever it sits. */
function nodeCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + nodeCount(item), 0)
  if (value === null || typeof value !== 'object') return 0
  const own = typeof (value as { type?: unknown }).type === 'string' ? 1 : 0
  return Object.values(value).reduce((sum: number, item) => sum + nodeCount(item), own)
}

/** Consecutive runs of `cases` that should fit `NODE_BUDGET` with the pad. */
function batches(cases: unknown[]): [number, number][] {
  const runs: [number, number][] = []
  let start = 0
  let nodes = 1
  cases.forEach((item, index) => {
    const size = Math.max(nodeCount(item), 1)
    if (nodes + size > NODE_BUDGET && index > start) {
      runs.push([start, index])
      start = index
      nodes = 1
    }
    nodes += size
  })
  runs.push([start, cases.length])
  return runs
}

describe('every field of every core component, past the issue cap', () => {
  it('neither fails a node nor draws NaN', () => {
    const cases: unknown[] = []
    const labels: string[] = []
    for (const sample of sampleNodes()) {
      for (const [, , pointer] of places(sample)) {
        for (const [name, make] of STAND_INS) {
          const copy = structuredClone(sample)
          const [owner, key] = places(copy).find((place) => place[2] === pointer) as Place
          ;(owner as Record<string | number, unknown>)[key] = make()
          cases.push(copy)
          labels.push(`${sample.type} ${pointer} = ${name}`)
        }
      }
    }
    expect(cases.length).toBeGreaterThan(25_000)
    const problems: string[] = []
    let rendered = 0
    // A batch the node limit cuts is split, so each case renders whole exactly once.
    const pending = batches(cases)
    for (let run = pending.pop(); run !== undefined; run = pending.pop()) {
      const [start, end] = run
      const { box, handle } = showUnchecked(cases.slice(start, end))
      if (handle.diagnostics.some(({ code }) => code === 'limit-nodes')) {
        box.remove()
        const middle = Math.ceil((start + end) / 2)
        if (end - start === 1) problems.push(`${labels[start]} alone is over the node limit`)
        else pending.push([start, middle], [middle, end])
        continue
      }
      for (const path of failed(handle)) {
        problems.push(`render-failed: ${labels[start + Number(path.split('/')[2]) - 1]}`)
      }
      // One element per body entry, the pad first: a node or its error card.
      const drawn = [...box.querySelectorAll('.vui-doc > :is(.vui-node, .vui-card-error)')]
      if (drawn.length !== end - start + 1) {
        problems.push(`batch at ${start} drew ${drawn.length - 1} of ${end - start} cases`)
      }
      drawn.slice(1).forEach((element, index) => {
        for (const bad of badAttributes(element)) problems.push(`${labels[start + index]}: ${bad}`)
      })
      rendered += end - start
      box.remove()
    }
    expect(rendered).toBe(cases.length)
    expect(problems).toEqual([])
    // VD-199: alone it takes 25 s, about 50 s under coverage; a full parallel run on a busy host
    // needs more, and the timeout guards a hang, not speed.
  }, 180_000)
})
