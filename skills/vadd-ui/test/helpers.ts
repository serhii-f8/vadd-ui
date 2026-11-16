import { existsSync, readFileSync } from 'node:fs'
import { offlineCounter, type TokenEstimate } from '@vadd/ui-cli'

export const readSkill = (): string => readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')

const SPEC = new URL('../../../docs/specs/vadd-ui-technical-spec.md', import.meta.url)

/** The spec is not in the public repository; tests that quote it run only where the file is. */
export const hasSpec: boolean = existsSync(SPEC)

export const readSpec = (): string => (hasSpec ? readFileSync(SPEC, 'utf8') : '')

export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) return { frontmatter: '', body: text }
  return { frontmatter: match[1] ?? '', body: text.slice(match[0].length) }
}

/** Line wrapping and bold are presentation, so neither can fail a clause. */
export function normalize(text: string): string {
  return text.replaceAll('**', '').replace(/\s+/g, ' ').trim()
}

/** From a heading to the next heading of level 2 or 3, heading line excluded. */
export function specSection(spec: string, heading: string): string {
  const start = spec.indexOf(`\n${heading}\n`)
  if (start < 0) throw new Error(`no section ${heading}`)
  const body = spec.slice(start + heading.length + 2)
  const end = body.search(/^#{2,3} /m)
  return end < 0 ? body : body.slice(0, end)
}

/** A `(section 4.0)` means nothing to an agent, so clauses are compared without it. */
export function withoutCrossReferences(text: string): string {
  return text.replace(/ \(section \d+(\.\d+)?\)/g, '')
}

const all = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] ?? '')

export const fences = (text: string): string[] => all(text, /^```\w*\n([\s\S]*?)^```$/gm)

/** The multi-line form only: behavior 4's inline `<<'EOF' … EOF` holds no document. */
export const heredocs = (text: string): string[] => all(text, /<<'EOF'\n([\s\S]*?)\nEOF$/gm)

export const vuiScripts = (text: string): string[] =>
  all(text, /<script type="application\/vui\+json">([\s\S]*?)<\/script>/g)

/** Written directives; behavior 5's `::orca-visual{…}` is only a pattern. */
export const directives = (text: string): string[] =>
  all(text, /(::orca-visual\{[^}`\n]*\})/g).filter((line) => line.includes('file='))

export const vuiCommands = (text: string): string[] => [
  ...new Set(all(text, /(?<![\w./+-])vui ([a-z][a-z-]*)/g)),
]

export const flags = (text: string): string[] => [...new Set(all(text, /(--[a-z][a-z-]*)/g))]

/** The comma list after a bold label, such as `**Tones:** ok, warn`. */
export function labelled(body: string, label: string): string[] {
  const match = new RegExp(`\\*\\*${label}:\\*\\* (.+)`).exec(body)
  return (match?.[1] ?? '').replace(/\.$/, '').split(', ').filter(Boolean)
}

export const TOKEN_BUDGET = 1800
/** VD-136: a local margin, since the estimate is not a count. Sized like §14.3's 5%. */
export const TOKEN_GATE = Math.floor(TOKEN_BUDGET * 0.95)
/** VD-148: the same estimator `vui bench` uses, loaded once for every test file. */
const counter = await offlineCounter()

export type { TokenEstimate }

/** VD-136: an estimate of real model tokens, not a count of them. */
export const estimateTokens = (text: string): TokenEstimate => counter.estimate(text)

export const withinTokenGate = (text: string): boolean =>
  estimateTokens(text).estimate <= TOKEN_GATE
