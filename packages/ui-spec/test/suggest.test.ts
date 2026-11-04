import { describe, expect, it } from 'vitest'
import { levenshtein, suggest } from '../src/suggest.js'

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['', 'ab', 2],
    ['tabel', 'table', 2],
    ['tabl', 'table', 1],
    ['tablee', 'table', 1],
    ['kitten', 'sitting', 3],
  ])('%s to %s is %i', (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance)
    expect(levenshtein(b, a)).toBe(distance)
  })
})

describe('suggest', () => {
  it('finds the closest candidate within 2 edits', () => {
    expect(suggest('tabel', ['stack', 'table'])).toBe('table')
    expect(suggest('titel', ['tone', 'title'])).toBe('title')
  })

  it('offers nothing beyond 2 edits', () => {
    expect(suggest('passed', ['ok', 'fail', 'warn'])).toBeUndefined()
    expect(suggest('abcde', ['abfgh'])).toBeUndefined()
  })

  it('prefers the smaller distance, then list order', () => {
    expect(suggest('abc', ['abxy', 'abd'])).toBe('abd')
    expect(suggest('abc', ['abd', 'abe'])).toBe('abd')
  })

  it('breaks a tie towards the nearest length', () => {
    expect(suggest('tabel', ['tabs', 'table'])).toBe('table')
  })

  it('skips huge values without comparing them', () => {
    const started = performance.now()
    expect(suggest('x'.repeat(262_144), ['table'])).toBeUndefined()
    expect(performance.now() - started).toBeLessThan(50)
  })
})
