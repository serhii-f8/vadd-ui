// VD-150: what each §14.2 budget counts. Title text and body content are content, so they
// count in the cases and not here.

/** "Command line + envelope": the skill's `vui show` heredoc with no title and no body. */
export const FIXED_SHOW = `vui show --title "" <<'EOF'\n{body: [\n]}\nEOF\n`

/** "Template + envelope": the skill's CDN template (§10.2) with the same empty document. */
export const FIXED_CDN =
  '<!doctype html><meta charset="utf-8">\n' +
  '<script src="https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js"></script>\n' +
  '<script type="application/vui+json">{body: [\n]}</script>\n'

/** Pasted on the `orca-chat` host. Hand-written HTML needs it too, so it is reported only. */
export const DIRECTIVE = '::orca-visual{file="report-7c1e.html"}\n'

/** §14.2, without the per-component catalog budget. */
export const LIMITS = {
  'fixed.show': 30,
  'fixed.cdn': 70,
  'ratio.md': 1.2,
  'ratio.html': 0.2,
  skill: 1800,
} as const

export const CATALOG_LIMIT = 300

/** A GFM delimiter row: at least two cells of dashes, colons allowed, pipes between. */
const DELIMITER_ROW = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m

export function hasGfmTable(markdown: string): boolean {
  return DELIMITER_ROW.test(markdown)
}

export interface Budget {
  name: string
  /** `null` when there was nothing to measure. */
  value: number | null
  limit: number
  ok: boolean
}

/** Three decimals: enough to see a 5% move on a 0.2 ratio. */
export const ratio = (part: number, whole: number): number =>
  Math.round((part / Math.max(whole, 1)) * 1000) / 1000

export function budget(name: string, value: number | null, limit: number): Budget {
  return { name, value, limit, ok: value === null || value <= limit }
}
