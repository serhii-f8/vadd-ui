import type { JsonValue, VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it, vi } from 'vitest'
import { invalidCases, noticeCases, validCases } from '../../ui-spec/test/corpus/cases.js'
import { render } from '../src/index.js'
import { createRenderer } from '../src/renderer.js'
import { target, testRegistry } from './helpers.js'

const serialize = (element: HTMLElement) => new XMLSerializer().serializeToString(element)
const corpus = [...validCases, ...invalidCases, ...noticeCases]
const inputOf = (source: { text?: string; input?: JsonValue }) =>
  (source.text ?? source.input) as string | VuiDocument

describe('determinism (§9.3)', () => {
  const now = new Date('2026-11-05T00:00:00Z')

  it.each(corpus.map((item) => [item.name, item] as const))('%s', (_, item) => {
    const render2 = createRenderer(testRegistry)
    const first = target()
    const second = target()
    render2(inputOf(item), first, { now })
    render2(inputOf(item), second, { now })
    expect(serialize(first)).toBe(serialize(second))
  })

  // The ext tier through the real catalog (VD-182): layout and drawing are pure too.
  const extCases = validCases.filter((item) => /^(compare|flow|chart scatter)\b/.test(item.name))

  it('has ext cases in the corpus', () => {
    expect(extCases.length).toBeGreaterThanOrEqual(15)
  })

  it.each(extCases.map((item) => [item.name, item] as const))('ext: %s', (_, item) => {
    const first = target()
    const second = target()
    render(inputOf(item), first, { now })
    render(inputOf(item), second, { now })
    expect(serialize(first)).toBe(serialize(second))
    expect(first.querySelector('.vui-card-placeholder, .vui-card-error')).toBeNull()
  })

  it('needs neither Math.random nor Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    render(inputOf(validCases[0] as (typeof validCases)[number]), target(), { now })
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
    random.mockRestore()
    clock.mockRestore()
  })

  it('gives the same DOM after update as after a first render', () => {
    const [one, two] = validCases
    const direct = target()
    const updated = target()
    const render2 = createRenderer(testRegistry)
    render2(inputOf(two as (typeof validCases)[number]), direct, { now })
    render2(inputOf(one as (typeof validCases)[number]), updated, { now }).update(
      inputOf(two as (typeof validCases)[number]),
    )
    expect(serialize(updated)).toBe(serialize(direct))
  })
})

describe('corpus', () => {
  it.each(corpus.map((item) => [item.name, item] as const))('never throws: %s', (_, item) => {
    const box = target()
    expect(() => render(inputOf(item), box)).not.toThrow()
    // `mount` catches everything, so isolation shows only in what was drawn.
    expect(box.textContent).not.toContain('could not be rendered')
  })
})
