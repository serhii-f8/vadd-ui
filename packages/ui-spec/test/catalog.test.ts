import { describe, expect, it } from 'vitest'
import { CATALOG, COMMON_FIELDS, findComponent, nearestComponent } from '../src/catalog.js'
import { COMPONENT_TYPES, type JsonValue, validate } from '../src/index.js'
import { CHART_SHAPES, NODE_SHAPES, SHAPES } from '../src/rules.js'

const entry = (name: string) => {
  const found = findComponent(name)
  if (found === undefined) throw new Error(`no ${name}`)
  return found
}
const field = (component: string, name: string) => {
  const found = entry(component).fields.find((item) => item.name === name)
  if (found === undefined) throw new Error(`no ${component}.${name}`)
  return found
}

describe('catalog', () => {
  it('lists the 24 components in spec order', () => {
    expect(CATALOG.map((item) => item.name)).toEqual([...COMPONENT_TYPES])
  })

  it.each(CATALOG.map((item) => [item.name, item] as const))(
    '%s has a purpose and an example that validates clean',
    (name, item) => {
      expect(item.summary.length).toBeGreaterThan(5)
      expect(item.summary).not.toContain('\n')
      const { ok, diagnostics } = validate(item.example as unknown as JsonValue)
      expect(diagnostics).toEqual([])
      expect(ok).toBe(true)
      expect((item.example as { type: string }).type).toBe(name)
    },
  )

  it.each([...NODE_SHAPES].map(([name, shape]) => [name, shape] as const))(
    '%s lists the fields of its shape',
    (name, shape) => {
      const own = Object.keys(SHAPES[shape]?.fields ?? {}).filter(
        (key) => key !== 'type' && !COMMON_FIELDS.includes(key),
      )
      const listed = entry(name).fields.map((item) => item.name)
      for (const key of own) expect(listed).toContain(key)
    },
  )

  it('marks a required field', () => {
    expect(field('stack', 'children')).toMatchObject({ required: true, type: 'node[]' })
    expect(field('stack', 'gap')).toMatchObject({ required: false, type: 'sm|md|lg' })
  })

  it('states stated defaults from the normalizer', () => {
    expect(field('code', 'maxLines').default).toBe('30')
    expect(field('log', 'maxLines').default).toBe('40')
    expect(field('callout', 'tone').default).toBe('info')
    expect(field('progress', 'max').default).toBe('100')
    expect(field('table', 'pageSize').default).toBe('25')
  })

  it('states computed defaults', () => {
    expect(field('grid', 'cols').default).toBe('auto by child count')
    expect(field('table', 'sticky').default).toBe('true when rows > 15')
  })

  it('keeps a common field that a component redefines', () => {
    expect(field('section', 'title').required).toBe(true)
    expect(field('callout', 'tone').required).toBe(false)
    expect(entry('stack').fields.some((item) => item.name === 'title')).toBe(false)
  })

  it('describes numbers, ranges and unions', () => {
    expect(field('grid', 'cols').type).toBe('integer 1-6')
    expect(field('tabs', 'active').type).toBe('integer ≥0')
    expect(field('progress', 'value').type).toBe('number')
    expect(field('kv', 'pairs').type).toBe('[string, scalar, format?][] or {key: scalar}')
    expect(field('code', 'lines').type).toBe('true')
    expect(field('diff', 'hunks').type).toBe('{key: string}')
    expect(field('table', 'columns').type).toBe('Column[]')
    expect(field('plan', 'items').type).toBe('PlanItem[]')
    expect(field('table', 'sort').type).toBe('[integer ≥0, asc|desc]')
  })

  it('names the sub-shapes a component uses, without nesting them twice', () => {
    expect(entry('table').shapes.map((shape) => shape.name)).toEqual(['Column', 'RowOptions'])
    expect(entry('plan').shapes.map((shape) => shape.name)).toEqual(['PlanItem'])
    expect(entry('stack').shapes).toEqual([])
    expect(entry('tabs').shapes[0]?.fields.map((item) => item.name)).toEqual(['label', 'children'])
  })

  it('tags chart fields with their kinds', () => {
    const fields = entry('chart').fields
    expect(fields.find((item) => item.name === 'kind')).toMatchObject({
      required: true,
      type: [...CHART_SHAPES.keys()].join('|'),
    })
    expect(fields.find((item) => item.name === 'values')?.kinds).toEqual(['spark'])
    expect(fields.find((item) => item.name === 'points')?.kinds).toEqual(['scatter'])
    expect(fields.find((item) => item.name === 'yFormat')?.kinds).toBeUndefined()
    const xTypes = fields.filter((item) => item.name === 'x')
    expect(xTypes.map((item) => item.kinds)).toEqual([
      ['bar', 'hbar', 'stacked', 'donut'],
      ['line', 'area'],
    ])
    expect(entry('chart').shapes.map((shape) => shape.name)).toEqual(['RefLine'])
  })

  it('finds nothing for an unknown or inherited name', () => {
    expect(findComponent('tabel')).toBeUndefined()
    expect(findComponent('constructor')).toBeUndefined()
  })

  it('suggests the nearest name', () => {
    expect(nearestComponent('tabel')).toBe('table')
    expect(nearestComponent('zzzzzzzz')).toBeUndefined()
  })
})
