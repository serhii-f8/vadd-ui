import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { offlineCounter } from '../src/bench/tokens.js'

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

describe('offline counter (VD-136, VD-148)', () => {
  it('describes itself', async () => {
    const counter = await offlineCounter()
    expect(counter.describe).toEqual({
      kind: 'offline',
      tokenizer: 'js-tiktoken 1.0.21 cl100k_base',
      method: 'max(cl100k × 1.3, chars × 1.3 / 3.5)',
    })
  })

  it('takes the larger of the two estimates', async () => {
    const counter = await offlineCounter()
    const dense = counter.estimate("{a:'b',c:[1,2],d:{e:'f'}}".repeat(40))
    const plain = counter.estimate('the quick brown fox jumps over the lazy dog '.repeat(40))
    expect(dense.estimate).toBe(dense.fromCl100k)
    expect(plain.estimate).toBe(plain.fromChars)
    expect(dense.fromCl100k).toBe(Math.ceil(dense.cl100k * 1.3))
    expect(plain.fromChars).toBe(Math.ceil((plain.chars * 1.3) / 3.5))
  })

  it('counts code points, not UTF-16 units', async () => {
    expect((await offlineCounter()).estimate('😀😀').chars).toBe(2)
  })

  it('counts as it estimates', async () => {
    const counter = await offlineCounter()
    expect(await counter.count('')).toBe(0)
    expect(await counter.count('hello world')).toBe(counter.estimate('hello world').estimate)
  })

  it('is loaded only by bench, never by the commands every run imports', () => {
    for (const file of ['run.ts', 'commands.ts', 'index.ts', 'args.ts']) {
      expect(source(file)).not.toContain('js-tiktoken')
    }
    expect(source('bench/tokens.ts')).toMatch(/await import\('js-tiktoken\/lite'\)/)
  })
})
