import { normalize, withoutCrossReferences } from './helpers.js'

/**
 * `spec` is a quote from §12, checked against the spec file. `skill` is the skill's wording,
 * given only where a sentence cannot stand as written. A clause with no `spec` comes from
 * `source`: another section or a decision whose rule the skill must carry.
 */
export interface Clause {
  id: string
  spec?: string
  skill?: string
  source?: string
}

export const CLAUSES: readonly Clause[] = [
  { id: '12.2.1 host', spec: 'Do not pick the host. `vui show` chooses it.' },
  {
    id: '12.2.1 no branch',
    spec: 'The skill never branches on WSL, SSH or Orca mode.',
    skill: 'Never branch on WSL, SSH or Orca mode.',
  },
  {
    id: '12.2.2 use',
    spec: 'Decide. Use a visual when the reply contains any of: ≥ 4 rows of tabular data, ≥ 3 metrics, verification or test results, a multi-step plan with status, a change summary over ≥ 3 files, a time series, or a decision between options.',
  },
  {
    id: '12.2.2 skip',
    spec: 'Do not use one for a single fact, a short answer or prose explanation.',
  },
  {
    id: '12.2.3 one document',
    spec: 'Compose. Put related content in one document with sections rather than several visuals.',
  },
  {
    id: '12.2.3 prose',
    spec: 'Keep surrounding prose to the conclusion and what the user should do; do not repeat the data in text.',
  },
  { id: '12.2.4 run', spec: `Emit. Run \`vui show --title "…" <<'EOF' … EOF\`.` },
  { id: '12.2.4 retry', spec: 'On exit 1 or 2, fix the reported paths and retry once.' },
  { id: '12.2.4 give up', spec: 'On a second failure or exit 4, answer in markdown.' },
  {
    id: '12.2.5 directive',
    spec: 'Reference. If stdout is a `::orca-visual{…}` line, put it on its own line in the reply, outside code blocks.',
    skill:
      'Reference. If stdout is a `::orca-visual{…}` line, paste it verbatim: put it on its own line in the reply, outside code blocks.',
  },
  {
    id: '12.2.5 shown',
    spec: 'If it starts with `vui: shown`, the visual is already on screen: mention it in at most one short clause ("results are in the viewer").',
  },
  {
    id: '12.2.6 fallback',
    spec: 'Fallback without the CLI. If `vui` is not installed and `ORCA_CHAT_SCRATCH_DIR` is set, write the CDN template to a new file in the scratch folder and reference it.',
    skill:
      'Fallback without the CLI. If `vui` is not installed and `ORCA_CHAT_SCRATCH_DIR` is set, write the CDN template below to a new file in the scratch folder and reference it.',
  },
  { id: '12.2.6 otherwise', spec: 'Otherwise answer in markdown.' },
  {
    id: '12.2.7 look up',
    spec: "Look up, don't guess. For a component not in the cheat-sheet, or unsure fields, run `vui catalog <type>` first.",
  },
  {
    id: '12.3 no html',
    spec: 'Never write HTML, CSS or JavaScript for content the catalog covers.',
  },
  {
    id: '12.3 rows',
    spec: 'Use positional `rows` with string columns and suffix formats (`"Time:ms"`); set formats per column, never pre-format numbers into strings.',
  },
  {
    id: '12.3 raw values',
    spec: 'Use raw values: ratios for `pct`, milliseconds for `ms`, ISO strings for dates.',
  },
  { id: '12.3 status tokens', spec: 'Use status tokens (`:ok:`, `:fail:`) instead of emoji.' },
  {
    id: '12.3 truncate',
    spec: 'Truncate long logs to the relevant lines before putting them in `log` or `checks.output`.',
  },
  {
    id: '12.3 secrets',
    spec: 'Never include secrets, tokens or environment dumps in a document.',
  },
  { id: '12.3 count', spec: 'At most 8 visuals per reply; normally 1.' },
  {
    id: '12.4 orca skill',
    spec: 'Orca injects its own `orca-chat-visuals` skill, which tells the agent to write full HTML pages.',
  },
  { id: '12.4 precedence', spec: 'takes precedence for any content the catalog covers' },
  {
    id: '12.4 raw html',
    spec: 'raw HTML via `orca-chat-visuals` is only for visuals outside the catalog (for example custom illustrations or mockups)',
  },
  {
    id: 'VD-096 tail',
    source: 'VD-096',
    skill: 'Send the tail of long output: failures usually sit there.',
  },
  {
    id: 'VD-026 columns',
    source: 'VD-026',
    skill:
      'Give explicit `columns` for year-like keys: integer-like keys come first in object rows.',
  },
  {
    id: '11.2 url line',
    source: '§11.2',
    skill: 'If a `vui: open <url>` line follows, give the user that URL.',
  },
  {
    id: '11.4 limit',
    source: '§11.4',
    skill: 'On exit 3, cut the data and retry once. On exit 5, answer in markdown.',
  },
  {
    id: '10.1 escape',
    source: '§10.1',
    skill: 'Inside the template, write `</` as `<\\/`.',
  },
  {
    id: '4.2 file name',
    source: '§4.2',
    skill: 'File names use only `A-Za-z0-9._-`; titles have no quotes or backslashes.',
  },
]

/** What the spec's §12 wording joins clauses with, and states about the skill. */
export const CONNECTIVES: readonly string[] = [
  'The vadd-ui skill states explicitly that it',
  'and that',
]

export const wording = (clause: Clause): string =>
  normalize(clause.skill ?? withoutCrossReferences(clause.spec ?? ''))

/** The ids of the clauses the text does not hold word for word. */
export function missingClauses(text: string, clauses: readonly Clause[] = CLAUSES): string[] {
  const held = normalize(text)
  return clauses.filter((clause) => !held.includes(wording(clause))).map((clause) => clause.id)
}

/** The spec's §12.2 to §12.4 text with every quoted clause taken out, for what is left over. */
export function unclaimed(specText: string, clauses: readonly Clause[] = CLAUSES): string {
  let rest = normalize(withoutCrossReferences(specText))
  const quotes = clauses.flatMap((clause) => (clause.spec ? [normalize(clause.spec)] : []))
  for (const quote of [...quotes].sort((a, b) => b.length - a.length)) {
    rest = rest.replaceAll(quote, ' ')
  }
  for (const connective of CONNECTIVES) rest = rest.replaceAll(connective, ' ')
  return rest
    .replace(/[\d]+\.(?=\s)/g, ' ')
    .replace(/[\s,.-]+/g, ' ')
    .trim()
}
