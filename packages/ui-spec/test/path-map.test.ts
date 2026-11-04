import { describe, expect, it } from 'vitest'
import { isJsonObject, type JsonValue } from '../src/json.js'
import { normalize } from '../src/normalize.js'
import { PathMapBuilder } from '../src/path-map.js'
import { joinPointer } from '../src/pointer.js'

describe('PathMap', () => {
  it('is the identity with no rewrites', () => {
    const paths = new PathMapBuilder().build()
    expect(paths.toInput('')).toBe('')
    expect(paths.toInput('/body/0/rows/1')).toBe('/body/0/rows/1')
  })

  it('appends the remainder to a rewritten prefix', () => {
    const builder = new PathMapBuilder()
    builder.set('/body', '')
    const paths = builder.build()
    expect(paths.toInput('/body')).toBe('')
    expect(paths.toInput('/body/2/rows/4')).toBe('/2/rows/4')
  })

  it('prefers the longest prefix', () => {
    const builder = new PathMapBuilder()
    builder.set('/body', '')
    builder.set('/body/0/children/0', '/0/children')
    const paths = builder.build()
    expect(paths.toInput('/body/0/children/0/title')).toBe('/0/children/title')
    expect(paths.toInput('/body/0/note')).toBe('/0/note')
  })

  it('matches whole segments only', () => {
    const builder = new PathMapBuilder()
    builder.set('/body/1', '/x')
    const paths = builder.build()
    expect(paths.toInput('/body/10')).toBe('/body/10')
  })

  it('rewrites the root pointer itself', () => {
    const builder = new PathMapBuilder()
    builder.set('', '/x')
    expect(builder.build().toInput('/a')).toBe('/x/a')
  })
})

describe('normalize paths', () => {
  it.each<[string, JsonValue, string, string]>([
    ['top-level array', ['a', { type: 'table', rows: [] }], '/body/1/rows/4', '/1/rows/4'],
    ['top-level array body', [], '/body', ''],
    ['top-level node', { type: 'md', text: 'x' }, '/body/0/text', '/text'],
    ['top-level node itself', { type: 'md', text: 'x' }, '/body/0', ''],
    ['top-level node body', { type: 'md', text: 'x' }, '/body', ''],
    ['string node text', { body: ['x'] }, '/body/0/text', '/body/0'],
    ['string node type', ['x'], '/body/0/type', '/0'],
    [
      'string child',
      [{ type: 'card', children: ['x'] }],
      '/body/0/children/0/text',
      '/0/children/0',
    ],
    [
      'single child',
      { body: [{ type: 'card', children: { type: 'md', title: 'T' } }] },
      '/body/0/children/0/title',
      '/body/0/children/title',
    ],
    [
      'single string child',
      { body: [{ type: 'stack', children: 'x' }] },
      '/body/0/children/0/text',
      '/body/0/children',
    ],
    [
      'nested single children',
      [{ type: 'stack', children: { type: 'card', children: 'x' } }],
      '/body/0/children/0/children/0/text',
      '/0/children/children',
    ],
    [
      'single item',
      { body: [{ type: 'checks', items: { name: 'n', status: 'bad' } }] },
      '/body/0/items/0/status',
      '/body/0/items/status',
    ],
    [
      'nested plan children',
      [{ type: 'plan', items: [{ text: 't', children: { text: 'u' } }] }],
      '/body/0/items/0/children/0/text',
      '/0/items/0/children/text',
    ],
    [
      'tab child',
      [{ type: 'tabs', tabs: [{ label: 'a', children: 'x' }] }],
      '/body/0/tabs/0/children/0/text',
      '/0/tabs/0/children',
    ],
    [
      'object-row cell',
      { body: [{ type: 'table', columns: ['Time:ms'], rows: [[1], { Time: 'x' }] }] },
      '/body/0/rows/1/0',
      '/body/0/rows/1/Time',
    ],
    [
      'object-row spelling',
      { body: [{ type: 'table', columns: ['Time:ms'], rows: [{ 'Time:ms': 'x' }] }] },
      '/body/0/rows/0/0',
      '/body/0/rows/0/Time:ms',
    ],
    [
      'key with a slash',
      { body: [{ type: 'table', rows: [{ 'a/b~c': 1 }] }] },
      '/body/0/rows/0/0',
      '/body/0/rows/0/a~1b~0c',
    ],
    [
      'missing cell',
      { body: [{ type: 'table', columns: ['a', 'b'], rows: [{ a: 1 }] }] },
      '/body/0/rows/0/1',
      '/body/0/rows/0',
    ],
    [
      'array row cell',
      [{ type: 'table', columns: ['a'], rows: [[1]] }],
      '/body/0/rows/0/0',
      '/0/rows/0/0',
    ],
    [
      'string column',
      { body: [{ type: 'table', columns: ['a', 'Time:ms'], rows: [] }] },
      '/body/0/columns/1/format',
      '/body/0/columns/1',
    ],
    [
      'object column',
      { body: [{ type: 'table', columns: [{ key: 'a', cell: 'x' }], rows: [] }] },
      '/body/0/columns/0/cell',
      '/body/0/columns/0/cell',
    ],
    [
      'derived columns',
      { body: [{ type: 'table', rows: [{ Time: 1 }] }] },
      '/body/0/columns',
      '/body/0',
    ],
    [
      'derived column',
      { body: [{ type: 'table', rows: [[], { Time: 1 }] }] },
      '/body/0/columns/0/label',
      '/body/0/rows/1/Time',
    ],
    ['density default', { body: [] }, '/density', ''],
    ['vui default', ['x'], '/vui', ''],
    ['component default', { body: [{ type: 'log', text: 'x' }] }, '/body/0/maxLines', '/body/0'],
    ['sticky default', [{ type: 'table', columns: [], rows: [] }], '/body/0/sticky', '/0'],
    ['unchanged path', { body: [{ type: 'md', text: 'x' }] }, '/body/0/text', '/body/0/text'],
  ])('maps %s', (_name, input, canonical, expected) => {
    expect(normalize(input).paths.toInput(canonical)).toBe(expected)
  })

  it('maps a stamped generatedAt to the root', () => {
    expect(normalize([], { generatedAt: 'x' }).paths.toInput('/generatedAt')).toBe('')
  })

  const corpus: JsonValue[] = [
    5,
    'x',
    null,
    [],
    {},
    ['a', 'b'],
    { type: 'md', text: 'x' },
    { title: 'T', extra: { a: [1] }, body: ['a', { type: 'log', text: 'x' }] },
    [
      { type: 'card', children: 'x' },
      { type: 'stack', children: { type: 'grid', children: ['y'] } },
    ],
    {
      type: 'tabs',
      tabs: [
        { label: 'a', children: 'x' },
        { label: 'b', children: ['y', 'z'] },
      ],
    },
    [{ type: 'plan', items: { text: 't', children: { text: 'u', children: [{ text: 'v' }] } } }],
    [{ type: 'tree', items: [{ name: 'a', children: { name: 'b' } }] }],
    [
      { type: 'list', items: 'a' },
      { type: 'stats', items: { label: 'l', value: 1 } },
    ],
    [{ type: 'table', columns: ['a', 'Time:ms', { key: 'c' }, 5], rows: [{ a: 1, c: 2 }, [1]] }],
    [{ type: 'table', rows: [[1], { 'x/y': 1, 'Time:ms': 2 }, { Time: 3, 'x/y': 4 }] }],
    { type: 'table', rows: [{ a: { nested: [1] } }] },
    [{ type: 'hologram', children: 'x' }, { type: 5 }, null],
  ]

  function pointers(value: JsonValue, base = ''): string[] {
    const children = Array.isArray(value)
      ? value.map((child, index): [string, JsonValue] => [joinPointer(base, index), child])
      : isJsonObject(value)
        ? Object.keys(value).map((key): [string, JsonValue] => [
            joinPointer(base, key),
            value[key] as JsonValue,
          ])
        : []
    return [base, ...children.flatMap(([pointer, child]) => pointers(child, pointer))]
  }

  it.each(corpus.map((input) => [JSON.stringify(input), input] as const))(
    'every canonical pointer of %s exists in the input',
    (_name, input) => {
      const { document, paths } = normalize(input)
      const known = new Set(pointers(input))
      for (const pointer of pointers(document as unknown as JsonValue)) {
        expect(known, `${pointer} → ${paths.toInput(pointer)}`).toContain(paths.toInput(pointer))
      }
    },
  )
})
