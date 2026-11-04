import { COMPONENT_TYPES, normalize, parse, STATUSES, TONES } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'

describe('public API', () => {
  it('runs parse then normalize from the package entry', () => {
    const parsed = parse("[{type: 'md', text: 'hi',},]")
    if (!parsed.ok) throw new Error(parsed.error.message)
    const { document, paths } = normalize(parsed.value)
    expect(document.body).toEqual([{ type: 'md', text: 'hi' }])
    expect(paths.toInput('/body/0/text')).toBe('/0/text')
  })

  it('exports the enums', () => {
    expect(COMPONENT_TYPES).toHaveLength(24)
    expect(STATUSES).toContain('ok')
    expect(TONES).toContain('err')
  })
})
