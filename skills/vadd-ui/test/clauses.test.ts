import { describe, expect, it } from 'vitest'
import { CLAUSES, missingClauses, unclaimed, wording } from './clauses.js'
import { normalize, readSkill, readSpec, specSection, withoutCrossReferences } from './helpers.js'

const spec = readSpec()
const required = ['### 12.2 Required behavior', '### 12.3 Rules embedded in the skill']
const contract = [...required, "### 12.4 Coexistence with Orca's built-in skill"]
  .map((heading) => specSection(spec, heading))
  .join('\n')

describe('the clause table', () => {
  it('quotes the spec word for word', () => {
    const stripped = normalize(withoutCrossReferences(contract))
    for (const { id, spec: quote } of CLAUSES) {
      if (quote) expect(stripped, id).toContain(normalize(quote))
    }
  })

  it('leaves no sentence of §12.2 to §12.4 unclaimed', () => {
    expect(unclaimed(contract)).toBe('')
  })

  it('notices a clause dropped from the table', () => {
    expect(unclaimed(contract, CLAUSES.slice(1))).toContain('Do not pick the host')
  })

  it('has distinct ids', () => {
    expect(new Set(CLAUSES.map(({ id }) => id)).size).toBe(CLAUSES.length)
  })
})

describe('SKILL.md', () => {
  const skill = readSkill()

  it('holds every clause', () => {
    expect(missingClauses(skill)).toEqual([])
  })

  it.each(CLAUSES.map((clause) => [clause.id, clause] as const))(
    'fails when %s is deleted',
    (id, clause) => {
      const mutant = normalize(skill).replaceAll(wording(clause), '')
      expect(missingClauses(mutant)).toEqual([id])
    },
  )

  it('fails when a clause is weakened by one word', () => {
    const mutant = normalize(skill).replace('retry once', 'retry twice')
    expect(missingClauses(mutant)).toEqual(['12.2.4 retry'])
  })
})
