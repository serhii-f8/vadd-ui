import { describe, expect, it } from 'vitest'
import { isJsonObject, type JsonObject, type JsonValue, validate } from '../src/index.js'
import { invalidCases, noticeCases, validCases } from './corpus/cases.js'
import { expectAgreement, expectWellFormed, schema } from './helpers.js'

const CASES = 4_000
const WRONG: JsonValue[] = [5, -1, 1.5, 'x', 'nope', '', true, false, null, [], {}, [1], { a: 1 }]

/** Mulberry32, so a failure replays from its case number. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function collect(value: JsonValue, into: (JsonObject | JsonValue[])[]): void {
  if (Array.isArray(value)) {
    into.push(value)
    for (const item of value) collect(item, into)
  } else if (isJsonObject(value)) {
    into.push(value)
    for (const item of Object.values(value)) collect(item, into)
  }
}

function mutate(input: JsonValue, next: () => number): JsonValue {
  const copy = JSON.parse(JSON.stringify(input)) as JsonValue
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const containers: (JsonObject | JsonValue[])[] = []
    collect(copy, containers)
    const target = pick(containers)
    if (target === undefined) break
    const wrong = JSON.parse(JSON.stringify(pick(WRONG))) as JsonValue
    if (Array.isArray(target)) {
      if (target.length === 0 || next() < 0.3) target.push(wrong)
      else if (next() < 0.5) target.splice(Math.floor(next() * target.length), 1)
      else target[Math.floor(next() * target.length)] = wrong
    } else {
      const keys = Object.keys(target)
      const key = keys.length > 0 ? pick(keys) : 'added'
      if (next() < 0.3) delete target[key]
      else target[key] = wrong
    }
  }
  return copy
}

describe('schema and walker', () => {
  it('generates a draft 2020-12 schema', () => {
    expect(schema).toMatchObject({ $schema: 'https://json-schema.org/draft/2020-12/schema' })
  })

  it('agree on seeded mutations of the corpus', () => {
    const seeds = [...validCases, ...noticeCases, ...invalidCases]
      .map((item) => item.input)
      .filter((input): input is JsonValue => input !== undefined)
      .filter((input) => JSON.stringify(input).length < 4_000)
    expect(seeds.length).toBeGreaterThan(300)
    const next = random(20261104)
    for (let index = 0; index < CASES; index++) {
      const seed = seeds[Math.floor(next() * seeds.length)] as JsonValue
      const input = mutate(seed, next)
      const result = validate(input)
      try {
        expectWellFormed(result, input)
        expectAgreement(result)
      } catch (failure) {
        throw new Error(`case ${index}: ${JSON.stringify(input)}\n${failure}`)
      }
    }
  })
})
