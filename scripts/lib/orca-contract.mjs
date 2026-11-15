// §17.3: the constants `packages/ui-spec/src/host/orca.ts` pins, against an Orca checkout.
// The same ten pairs `e2e/orca-chat.spec.ts` compares with the vendored copies.

import { isDeepStrictEqual } from 'node:util'

/** `[our constant, Orca's constant]`. */
export const CONTRACT = /** @type {const} */ ([
  ['ORCA_DIRECTIVE_MARKER', 'NATIVE_CHAT_VISUAL_DIRECTIVE_MARKER'],
  ['ORCA_DIRECTIVE_MAX_LINE', 'NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH'],
  ['ORCA_FILE_MAX', 'NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH'],
  ['ORCA_TITLE_MAX', 'NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH'],
  ['ORCA_VISUALS_PER_REPLY', 'NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE'],
  ['ORCA_FILE_MAX_BYTES', 'NATIVE_CHAT_VISUAL_MAX_BYTES'],
  ['ORCA_FRAME_MIN_HEIGHT', 'NATIVE_CHAT_VISUAL_MIN_HEIGHT'],
  ['ORCA_FRAME_MAX_HEIGHT', 'NATIVE_CHAT_VISUAL_MAX_HEIGHT'],
  ['ORCA_CDN_ORIGINS', 'NATIVE_CHAT_VISUAL_CDN_ORIGINS'],
  ['ORCA_THEME_TOKENS', 'NATIVE_CHAT_VISUAL_THEME_TOKENS'],
])

/** @param {unknown} value */
const show = (value) => JSON.stringify(value)

/**
 * @param {Record<string, unknown>} ours
 * @param {Record<string, unknown>} theirs
 * @param {ReadonlyArray<readonly [string, string]>} [pairs]
 * @returns {string[]}
 */
export function compareConstants(ours, theirs, pairs = CONTRACT) {
  /** @type {string[]} */
  const findings = []
  for (const [mine, orca] of pairs) {
    if (!(orca in theirs) || theirs[orca] === undefined) findings.push(`${orca}: missing in Orca`)
    else if (!(mine in ours) || ours[mine] === undefined) findings.push(`${mine}: missing here`)
    else if (!isDeepStrictEqual(ours[mine], theirs[orca])) {
      findings.push(`${mine} is ${show(ours[mine])}, Orca ${orca} is ${show(theirs[orca])}`)
    }
  }
  return findings
}

/**
 * The tokens Orca's built-in skill lists in its "Exposed tokens" bullet, with
 * `` `--chart-1` through `--chart-5` `` expanded.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function skillTokens(markdown) {
  const match = /^- Exposed tokens:([\s\S]*?)(?=\n\S|\n\s*\n|(?![\s\S]))/m.exec(markdown)
  if (!match) return []
  const text = match[1] ?? ''
  const tokens = [...text.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1] ?? '')
  for (const range of text.matchAll(/`--([a-z-]+)(\d+)` through `--\1(\d+)`/g)) {
    const [, stem, from, to] = range
    for (let n = Number(from) + 1; n < Number(to); n += 1) tokens.push(`--${stem}${n}`)
  }
  return tokens
}

/**
 * @param {readonly string[]} ours
 * @param {readonly string[]} skill
 * @returns {string[]}
 */
export function compareTokenSets(ours, skill) {
  if (skill.length === 0) return ['skill token list not found']
  const theirs = new Set(skill)
  const mine = new Set(ours)
  return [
    ...ours.filter((token) => !theirs.has(token)).map((token) => `skill token list lacks ${token}`),
    ...skill.filter((token) => !mine.has(token)).map((token) => `skill token list adds ${token}`),
  ]
}

/**
 * §17.3: the Viewer's one Orca call needs `--url` and `--split`.
 *
 * @param {string} help
 * @returns {string[]}
 */
export function helpFindings(help) {
  return ['--url', '--split']
    .filter((name) => !new RegExp(`${name}\\b`).test(help))
    .map((name) => `orca tab create --help no longer lists ${name}`)
}
