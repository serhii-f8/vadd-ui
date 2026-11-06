import { readFileSync } from 'node:fs'
import { getEncoding } from 'js-tiktoken'

export const readSkill = (): string => readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')

export const readSpec = (): string =>
  readFileSync(new URL('../../../docs/specs/vadd-ui-technical-spec.md', import.meta.url), 'utf8')

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
/** §14.3 lets a budget regress 5%, so the gate leaves that much room below the budget. */
export const TOKEN_GATE = Math.floor(TOKEN_BUDGET * 0.95)
/** Anthropic glossary, read 2026-11-06: Claude 4.7 and later give about 30% more tokens. */
const NEW_TOKENIZER_FACTOR = 1.3
/** The same page: about 3.5 English characters per token on earlier models. */
const CHARS_PER_TOKEN = 3.5

const encoding = getEncoding('cl100k_base')

export interface TokenEstimate {
  cl100k: number
  chars: number
  fromCl100k: number
  fromChars: number
  estimate: number
}

/** VD-136: an estimate of real model tokens, not a count of them. */
export function estimateTokens(text: string): TokenEstimate {
  const cl100k = encoding.encode(text).length
  const chars = [...text].length
  const fromCl100k = Math.ceil(cl100k * NEW_TOKENIZER_FACTOR)
  const fromChars = Math.ceil((chars * NEW_TOKENIZER_FACTOR) / CHARS_PER_TOKEN)
  return { cl100k, chars, fromCl100k, fromChars, estimate: Math.max(fromCl100k, fromChars) }
}

export const withinTokenGate = (text: string): boolean =>
  estimateTokens(text).estimate <= TOKEN_GATE
