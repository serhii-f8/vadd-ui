import { LIMITS } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { layoutFlow } from '../src/flow/layout.js'

const where = (layout: ReturnType<typeof layoutFlow>) =>
  Object.fromEntries(layout.nodes.map(({ id, layer, row }) => [id, [layer, row]]))

describe('layoutFlow (§6.5, VD-185)', () => {
  it('puts a chain in consecutive layers', () => {
    const layout = layoutFlow(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    )
    expect(where(layout)).toEqual({ a: [0, 0], b: [1, 0], c: [2, 0] })
    expect(layout.layers).toBe(3)
    expect(layout.rows).toBe(1)
  })

  it('layers a diamond by its longest path', () => {
    const layout = layoutFlow(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
        ['a', 'd'],
      ],
    )
    const at = where(layout)
    expect(at.a?.[0]).toBe(0)
    expect([at.b?.[0], at.c?.[0]]).toEqual([1, 1])
    expect(at.d?.[0]).toBe(2)
    expect(layout.rows).toBe(2)
  })

  it('reads labels and statuses, and keeps the first of a repeated id', () => {
    const layout = layoutFlow(
      [{ id: 'a', label: 'Build', status: 'ok' }, 'b', { id: 'a', label: 'Again' }, 7, {}],
      [],
    )
    expect(layout.nodes.map(({ id, label, status }) => [id, label, status])).toEqual([
      ['a', 'Build', 'ok'],
      ['b', 'b', undefined],
    ])
  })

  it('terminates on a cycle and marks one back edge', () => {
    const layout = layoutFlow(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
    )
    expect(layout.edges.map(({ back }) => back)).toEqual([false, false, true])
    expect(where(layout)).toEqual({ a: [0, 0], b: [1, 0], c: [2, 0] })
  })

  it('marks a self-loop as a back edge', () => {
    const layout = layoutFlow(['a'], [['a', 'a', 'retry']])
    expect(layout.edges).toEqual([{ from: 0, to: 0, label: 'retry', back: true }])
  })

  it('adds a node for an undeclared end, up to the limit', () => {
    const layout = layoutFlow(['a'], [['a', 'z']])
    expect(layout.nodes[1]).toMatchObject({ id: 'z', label: 'z', implicit: true, layer: 1 })
    const full = Array.from({ length: LIMITS.flowNodes }, (_, index) => `n${index}`)
    const capped = layoutFlow(full, [
      ['n0', 'extra'],
      ['n0', 'n1'],
    ])
    expect(capped.nodes).toHaveLength(LIMITS.flowNodes)
    expect(capped.edges).toEqual([{ from: 0, to: 1, label: '', back: false }])
  })

  it('skips edges that are not pairs of ids', () => {
    const layout = layoutFlow(['a', 'b'], [['a'], 'a-b', ['a', 3], ['a', 'b', 5], null])
    expect(layout.edges).toEqual([{ from: 0, to: 1, label: '', back: false }])
  })

  it('orders a layer by its parents, so edges do not cross needlessly', () => {
    // b's child is listed first and c's second, but they swap under their parents' order.
    const layout = layoutFlow(
      ['a', 'b', 'c', 'y', 'x'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['c', 'y'],
        ['b', 'x'],
      ],
    )
    const at = where(layout)
    expect(at.x?.[1]).toBe(at.b?.[1])
    expect(at.y?.[1]).toBe(at.c?.[1])
  })

  it('is deterministic', () => {
    const nodes = Array.from({ length: 30 }, (_, index) => `n${index}`)
    const edges = nodes.slice(1).map((id, index) => [nodes[(index * 7) % (index + 1)] ?? '', id])
    expect(layoutFlow(nodes, edges)).toEqual(layoutFlow(nodes, edges))
  })

  it('handles an empty graph', () => {
    expect(layoutFlow([], [])).toEqual({ nodes: [], edges: [], layers: 0, rows: 0 })
  })
})
