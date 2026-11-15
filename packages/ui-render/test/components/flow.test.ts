import { describe, expect, it } from 'vitest'
import { show, showExt } from '../helpers.js'

const flow = (fields: Record<string, unknown> = {}) =>
  showExt([
    {
      type: 'flow',
      nodes: [
        { id: 'build', label: 'Build the bundle', status: 'ok' },
        { id: 'test', label: 'Test', status: 'fail' },
        'ship',
      ],
      edges: [
        ['build', 'test'],
        ['test', 'ship', 'green'],
      ],
      ...fields,
    },
  ])
const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) => all(box, selector).map((n) => n.textContent)

describe('flow (§6.5)', () => {
  it('draws one box per node, in an image with a title and a description', () => {
    const { box, handle } = flow({ title: 'Release' })
    expect(handle.diagnostics).toEqual([])
    expect(box.querySelector('.vui-card-placeholder')).toBeNull()
    const image = box.querySelector('svg') as SVGElement
    expect(image.getAttribute('role')).toBe('img')
    expect(texts(box, 'svg > title')).toEqual(['Release'])
    expect(texts(box, 'svg > desc')).toEqual(['Flow, 3 nodes, 2 edges'])
    expect(all(box, 'path.vui-flow-node')).toHaveLength(3)
  })

  it('lays the boxes out left to right by layer', () => {
    const { box } = flow()
    const xs = all(box, 'g.vui-flow-box').map((g) =>
      Number(/translate\(([\d.]+)/.exec(g.getAttribute('transform') ?? '')?.[1]),
    )
    expect(xs[0]).toBeLessThan(xs[1] as number)
    expect(xs[1]).toBeLessThan(xs[2] as number)
  })

  it('clips a long label and keeps the whole one in a title', () => {
    const label = 'A very long step name that will not fit'
    const { box } = flow({ nodes: [{ id: 'a', label }], edges: [] })
    const shown = box.querySelector('.vui-flow-label') as SVGTextElement
    expect([...(shown.textContent ?? '')].length).toBeLessThanOrEqual(22)
    expect(box.querySelector('g.vui-flow-box > title')?.textContent).toBe(label)
  })

  it('shows a status by tone and by glyph', () => {
    const { box } = flow()
    const boxes = all(box, 'g.vui-flow-box')
    expect(boxes[0]?.getAttribute('class')).toContain('vui-tone-ok')
    expect(boxes[1]?.getAttribute('class')).toContain('vui-tone-err')
    expect(boxes[0]?.querySelector('.vui-flow-label')?.textContent?.startsWith('✓ ')).toBe(true)
  })

  it('draws the edges, their arrowheads and labels, with no ids', () => {
    const { box } = flow()
    expect(all(box, 'path.vui-flow-edge')).toHaveLength(2)
    expect(box.querySelector('path.vui-flow-arrows')?.getAttribute('d')?.match(/M/g)).toHaveLength(
      2,
    )
    expect(texts(box, '.vui-flow-edge-label text')).toEqual(['green'])
    expect(box.querySelector('svg [id]')).toBeNull()
  })

  it('draws a cycle with a back edge and a dashed undeclared node', () => {
    const { box, handle } = flow({
      nodes: ['a', 'b'],
      edges: [
        ['a', 'b'],
        ['b', 'a'],
        ['b', 'z'],
      ],
    })
    expect(handle.diagnostics.some((d) => d.code === 'bad-ref')).toBe(true)
    expect(all(box, 'path.vui-flow-back')).toHaveLength(1)
    expect(all(box, 'g.vui-flow-implicit')).toHaveLength(1)
  })

  it('lists nodes and their edges for a screen reader', () => {
    const { box } = flow()
    expect(texts(box, '.vui-sr-only > ul > li')).toEqual([
      'Build the bundle (ok) → Test',
      'Test (fail) → ship (green)',
      'ship',
    ])
  })

  it('finds its size from the layout, so wide graphs scroll inside the node', () => {
    const { box } = flow()
    const image = box.querySelector('svg') as SVGElement
    const [, , width, height] = (image.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect(image.getAttribute('width')).toBe(String(width))
    expect(image.getAttribute('height')).toBe(String(height))
    expect(box.querySelector('.vui-flow')?.classList.contains('vui-flow')).toBe(true)
  })

  it('says so when there is nothing to draw', () => {
    const { box } = flow({ nodes: [], edges: [] })
    expect(box.querySelector('svg')).toBeNull()
    expect(box.textContent).toContain('No nodes')
  })

  it('is a placeholder in the core build', () => {
    const { box } = show([{ type: 'flow', nodes: ['a'], edges: [] }])
    expect(box.querySelector('.vui-card-placeholder')).not.toBeNull()
  })
})
