import { describe, expect, it } from 'vitest'
import { COMPONENT_TYPES, type JsonValue, validate } from '../../src/index.js'
import {
  FIELDS,
  fastestMs,
  fuzzCount,
  fuzzDocument,
  fuzzMode,
  fuzzSeed,
  fuzzText,
  rng,
} from './generator.js'

const SEED = 20_261_110
const CASES = 2_000

/** Every `type` value anywhere in a case. */
function typesIn(value: unknown, found: Set<unknown>): Set<unknown> {
  if (Array.isArray(value)) for (const item of value) typesIn(item, found)
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'type') found.add(item)
      typesIn(item, found)
    }
  }
  return found
}

describe('the fuzz generator', () => {
  it('rng is mulberry32: seeded, in [0, 1), and repeatable', () => {
    const a = rng(1)
    const b = rng(1)
    const draws = Array.from({ length: 100 }, () => a())
    expect(draws).toEqual(Array.from({ length: 100 }, () => b()))
    expect(draws.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(rng(2)()).not.toBe(draws[0])
  })

  it('gives the same case for the same (seed, index)', () => {
    for (let index = 0; index < 200; index++) {
      expect(fuzzDocument(SEED, index)).toEqual(fuzzDocument(SEED, index))
      expect(fuzzText(SEED, index)).toBe(fuzzText(SEED, index))
    }
    expect(fuzzDocument(SEED, 1)).not.toEqual(fuzzDocument(SEED + 1, 1))
    // Seed and index once met by XOR: (1, 2047), (2, 2050) and (3, 2049) were one case.
    const met = [fuzzText(1, 2_047), fuzzText(2, 2_050), fuzzText(3, 2_049)]
    expect(new Set(met).size).toBe(3)
  })

  it('has a field table for every component type', () => {
    for (const type of COMPONENT_TYPES) expect(FIELDS, type).toHaveProperty(type)
    expect(Object.keys(FIELDS).sort()).toEqual([...COMPONENT_TYPES].sort())
  })

  it(`reaches every type, both modes, and valid and invalid documents over ${CASES} cases`, () => {
    const types = new Set<unknown>()
    const modes = new Set<string>()
    const verdicts = new Set<boolean>()
    const texts = new Set<string>()
    for (let index = 0; index < CASES; index++) {
      const document = fuzzDocument(SEED, index)
      typesIn(document, types)
      modes.add(fuzzMode(SEED, index))
      verdicts.add(validate(document as JsonValue).ok)
      const text = fuzzText(SEED, index)
      texts.add(text.startsWith('﻿') ? 'bom' : text.includes('\u0000') ? 'nul' : 'plain')
    }
    for (const type of COMPONENT_TYPES) expect(types, type).toContain(type)
    expect([...modes].sort()).toEqual(['mutated', 'structured'])
    expect([...verdicts].sort()).toEqual([false, true])
    expect([...texts].sort()).toEqual(['bom', 'nul', 'plain'])
  })

  it('times a slow case again and keeps the fastest run (VD-087)', async () => {
    let calls = 0
    const again = () => {
      calls++
    }
    expect(await fastestMs(100, 2_000, again)).toBe(100)
    expect(calls).toBe(0)
    expect(await fastestMs(3_000, 2_000, again)).toBeLessThan(2_000)
    expect(calls).toBe(1)
  })

  it('reads its run size and seed from the environment', () => {
    const saved = { cases: process.env.VUI_FUZZ_CASES, seed: process.env.VUI_FUZZ_SEED }
    try {
      delete process.env.VUI_FUZZ_CASES
      delete process.env.VUI_FUZZ_SEED
      expect(fuzzCount(7)).toBe(7)
      expect(fuzzSeed(9)).toBe(9)
      process.env.VUI_FUZZ_CASES = '100000'
      process.env.VUI_FUZZ_SEED = '42'
      expect(fuzzCount(7)).toBe(100_000)
      expect(fuzzSeed(9)).toBe(42)
      process.env.VUI_FUZZ_CASES = 'many'
      expect(() => fuzzCount(7)).toThrow(/VUI_FUZZ_CASES/)
    } finally {
      for (const [key, value] of [
        ['VUI_FUZZ_CASES', saved.cases],
        ['VUI_FUZZ_SEED', saved.seed],
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
