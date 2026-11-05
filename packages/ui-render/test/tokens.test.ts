import { describe, expect, it } from 'vitest'
import { stylesheet } from '../src/css/index.js'
import { pageCss, TOKENS, TONE_TEXT_SHARE } from '../src/css/tokens.js'

// §8.1, cell by cell: name, source, light, dark.
const SPEC: [string, string | null, string, string][] = [
  ['--vui-bg', '--background', '#ffffff', '#0a0a0a'],
  ['--vui-fg', '--foreground', '#171717', '#ededed'],
  ['--vui-surface', '--card', '#ffffff', '#141414'],
  ['--vui-surface-fg', '--card-foreground', '#171717', '#ededed'],
  ['--vui-muted', '--muted', '#f5f5f5', '#1f1f1f'],
  ['--vui-muted-fg', '--muted-foreground', '#737373', '#a3a3a3'],
  ['--vui-border', '--border', '#e5e5e5', '#2a2a2a'],
  ['--vui-accent', '--accent', '#f5f5f5', '#262626'],
  ['--vui-accent-fg', '--accent-foreground', '#171717', '#ededed'],
  ['--vui-primary', '--primary', '#171717', '#ededed'],
  ['--vui-primary-fg', '--primary-foreground', '#fafafa', '#171717'],
  ['--vui-err', '--destructive', '#dc2626', '#f87171'],
  ['--vui-ok', null, '#16a34a', '#4ade80'],
  ['--vui-warn', null, '#d97706', '#fbbf24'],
  ['--vui-info', null, '#2563eb', '#60a5fa'],
  ['--vui-chart-1', '--chart-1', '#2563eb', '#60a5fa'],
  ['--vui-chart-2', '--chart-2', '#16a34a', '#4ade80'],
  ['--vui-chart-3', '--chart-3', '#d97706', '#fbbf24'],
  ['--vui-chart-4', '--chart-4', '#9333ea', '#c084fc'],
  ['--vui-chart-5', '--chart-5', '#db2777', '#f472b6'],
  ['--vui-radius', '--radius', '8px', '8px'],
  ['--vui-font', '--font-sans', 'system-ui', 'system-ui'],
  ['--vui-mono', '--font-mono', 'ui-monospace', 'ui-monospace'],
]

const channel = (value: number) => {
  const unit = value / 255
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}
const rgb = (hex: string) =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
const luminance = ([r = 0, g = 0, b = 0]: number[]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a: number[], b: number[]) => {
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}
/** `color-mix(in srgb, a share, b)`. */
const mix = (a: number[], b: number[], share: number) =>
  a.map((value, index) => value * share + (b[index] ?? 0) * (1 - share))

const value = (name: string, scheme: 'light' | 'dark') => {
  const token = TOKENS.find((item) => item.name === name)
  return rgb(token?.[scheme] as string)
}

function ruleBody(selector: string): string {
  const start = stylesheet.indexOf(`${selector}{`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return stylesheet.slice(start, stylesheet.indexOf('}', start))
}

describe('§8.1 tokens', () => {
  it('match the table exactly', () => {
    expect(TOKENS.map(({ name, source, light, dark }) => [name, source, light, dark])).toEqual(SPEC)
  })

  it.each(SPEC)('%s reads its host token with a fallback', (name, source, light, dark) => {
    const expected = (fallback: string) =>
      source === null ? `${name}:${fallback};` : `${name}:var(${source},${fallback});`
    expect(ruleBody('.vui-root')).toContain(expected(light))
    expect(ruleBody(':root.dark .vui-root')).toContain(expected(dark))
  })

  it('declares every custom property under .vui-root, and never a host token', () => {
    for (const [, selector, body] of stylesheet.matchAll(/([^{}]+)\{([^{}]*--[^{}]*)\}/g)) {
      const declares = /(?:^|;)\s*--/.test(body as string)
      if (declares) expect(selector).toMatch(/\.vui-(?:root|tone-[a-z]+)/)
    }
    expect(stylesheet).not.toMatch(/(?:^|[;{])--(?!vui-)[a-z0-9-]+:/)
    expect(stylesheet).not.toMatch(/(?:^|\})\s*:root\s*\{/)
  })

  it('has the three scheme selectors of §8.1 and VD-007', () => {
    expect(stylesheet).toContain(':root.dark .vui-root{')
    expect(stylesheet).toMatch(/@media \(prefers-color-scheme: ?dark\)\{[^{]*\.vui-root\{/)
    expect(stylesheet).toContain('[data-vui-theme="dark"]{')
    expect(stylesheet).toContain('[data-vui-theme="light"]{')
  })

  it('treats .light and an emptied class as explicit light (VD-058)', () => {
    const media = /@media \(prefers-color-scheme: ?dark\)\{([^{]*)\{/.exec(stylesheet)?.[1]
    expect(media).toContain(':not(.dark)')
    expect(media).toContain(':not(.light)')
    expect(media).toContain(':not([class=""])')
  })

  it('derives tone backgrounds with color-mix', () => {
    expect(stylesheet).toContain('color-mix(in srgb,var(--vui-tone) 12%,var(--vui-surface))')
  })
})

describe('§15.2 contrast', () => {
  const tones: [string, string][] = [
    ['ok', '--vui-ok'],
    ['warn', '--vui-warn'],
    ['err', '--vui-err'],
    ['info', '--vui-info'],
  ]

  describe.each(['light', 'dark'] as const)('%s', (scheme) => {
    const surface = value('--vui-surface', scheme)
    const text = value('--vui-surface-fg', scheme)

    it.each(tones)('%s text reaches 4.5:1 on the surface and on its tint', (_, token) => {
      const tone = value(token, scheme)
      const ink = mix(tone, text, TONE_TEXT_SHARE)
      expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(ink, mix(tone, surface, 0.12))).toBeGreaterThanOrEqual(4.5)
    })

    it('muted, accent and default reach 4.5:1', () => {
      expect(contrast(value('--vui-muted-fg', scheme), surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(value('--vui-accent-fg', scheme), surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('declares the text tokens from the share the test used', () => {
    expect(ruleBody('.vui-root')).toContain(
      `--vui-ok-text:color-mix(in srgb,var(--vui-ok) ${TONE_TEXT_SHARE * 100}%,var(--vui-surface-fg));`,
    )
  })
})

describe('pageCss', () => {
  const selectors = [...pageCss.matchAll(/(?:^|[{}])([^{}@]+)\{/g)].map((match) => match[1])

  it('paints the canvas with --vui-bg in both schemes, under a host --background', () => {
    expect(pageCss).toContain('color-scheme:light;background:var(--background,#ffffff)')
    expect(pageCss).toContain('color-scheme:dark;background:var(--background,#0a0a0a)')
  })

  it('reads the theme the same way the tokens do', () => {
    expect(pageCss).toContain('.dark')
    expect(pageCss).toContain('@media (prefers-color-scheme: dark)')
    expect(pageCss).toContain(':not(.light):not([class=""])')
  })

  it('has zero specificity everywhere, so any host rule wins', () => {
    expect(selectors).toHaveLength(3)
    for (const selector of selectors) expect(selector).toMatch(/^:where\(.*\)$/)
  })

  it('stays out of the stylesheet, since only a bare page wants it', () => {
    expect(stylesheet).not.toContain(pageCss)
    expect(stylesheet).not.toContain('background:var(--background')
  })
})
