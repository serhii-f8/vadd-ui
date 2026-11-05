// @vitest-environment node
// esbuild refuses to start under jsdom, whose `TextEncoder` output is a foreign Uint8Array.
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { stylesheet } from '../src/css/index.js'

const srcDir = fileURLToPath(new URL('../src', import.meta.url))

const sources = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => extname(file) === '.ts')
  .map((file) => ({
    file,
    code: transformSync(readFileSync(join(srcDir, file), 'utf8'), {
      loader: 'ts',
      minifySyntax: true,
      legalComments: 'none',
    }).code,
  }))

const BANNED: [string, RegExp][] = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['cookie', /\bcookie\b/i],
  ['postMessage', /\bpostMessage\b/],
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['Worker', /\bWorker\b/],
  ['import()', /\bimport\s*\(/],
  ['Math.random', /\bMath\.random\b/],
  ['Date.now', /\bDate\.now\b/],
  ['new Date', /\bnew Date\b/],
  ['matchMedia', /\bmatchMedia\b/],
  ['getComputedStyle', /\bgetComputedStyle\b/],
  ['style property', /\.style\b/],
  ['window.open', /\bwindow\.open\b/],
]

describe('source constraints', () => {
  it('finds the sources', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  it.each(BANNED)('uses no %s', (_, pattern) => {
    expect(sources.filter(({ code }) => pattern.test(code)).map(({ file }) => file)).toEqual([])
  })

  it('reads a clock only in the watchdog (VD-008)', () => {
    const clocks = sources.filter(({ code }) => /\bperformance\b/.test(code))
    expect(clocks.map(({ file }) => file)).toEqual(['watchdog.ts'])
  })
})

describe('stylesheet constraints', () => {
  it('uses no viewport units', () => {
    expect(stylesheet).not.toMatch(/[\d.](?:[dsl]?v[hwib]|vmin|vmax)\b/)
  })

  it('uses no fixed position', () => {
    expect(stylesheet).not.toMatch(/position:\s*fixed/)
  })

  it('loads nothing', () => {
    expect(stylesheet).not.toMatch(/url\(|@import|@font-face/)
  })

  it('keeps every animation at or under 150 ms', () => {
    const durations = [...stylesheet.matchAll(/(?:animation|transition)[^;}]*?([\d.]+)(ms|s)\b/g)]
    expect(durations.length).toBeGreaterThan(0)
    for (const [, value, unit] of durations) {
      expect(Number(value) * (unit === 's' ? 1_000 : 1)).toBeLessThanOrEqual(150)
    }
  })

  it('turns motion off under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: ?reduce\)\{(.*?\})\}/.exec(stylesheet)?.[1]
    expect(block).toContain('animation:none')
    expect(block).toContain('transition:none')
  })

  it('never styles outside the renderer root', () => {
    const selectors = stylesheet
      .replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})*\}/g, '')
      .replace(/@media [^{]+\{/g, '')
      .matchAll(/(?:^|\})([^{}]+)\{/g)
    for (const [, selector] of selectors) expect(selector).toMatch(/\.vui-/)
  })

  it('adds no outer margin or background to the root (§8.3)', () => {
    const start = stylesheet.indexOf('.vui-root{')
    const rules = stylesheet.slice(start).match(/\.vui-root\{[^}]*\}/g) ?? []
    for (const rule of rules) expect(rule).not.toMatch(/(?:^|[{;])(?:margin|background)\b/)
  })
})
