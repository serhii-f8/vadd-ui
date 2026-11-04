import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('skills/vadd-ui placeholder', () => {
  it('carries the §12.1 frontmatter', () => {
    const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
    expect(skill.startsWith('---\n')).toBe(true)
    expect(skill).toContain('\nname: vadd-ui\n')
    expect(skill).toContain('\nuser-invocable: false\n')
  })
})
