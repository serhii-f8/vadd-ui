// §16 agent eval: scoring one Claude Code run, and the gate over all of them.

/** §16: "≥ 98% valid on first `vui show`; 100% valid after one retry; 0 hand-written HTML". */
export const GATE = { first: 0.98, retry: 1 }

/** Markup an agent writes when it hand-builds a visual (§12.3). */
const MARKUP = /<(?:!doctype|html|body|table|div|svg|style|script)\b/i
/** A shell command that only feeds a document to the CLI. */
const VUI_COMMAND = /(?:^|[|;&]\s*)vui\s/

/**
 * @typedef {{argv: string[], exit: number, stdout: string}} Call
 * @typedef {{path: string, content: string}} ToolWrite
 * @typedef {{showCalls: number, firstValid: boolean, validAfterRetry: boolean, handHtml: number, directivePasted: boolean | null}} Score
 */

/**
 * @param {{calls: Call[], htmlFiles: string[], shimFiles: string[], toolWrites: ToolWrite[], finalText: string}} run
 * @returns {Score}
 */
export function score({ calls, htmlFiles, shimFiles, toolWrites, finalText }) {
  const shows = calls.filter(({ argv }) => argv[0] === 'show')
  const [first, second] = shows
  const firstValid = first?.exit === 0
  const validAfterRetry = firstValid || second?.exit === 0
  const written = new Set(shimFiles)
  const strayFiles = htmlFiles.filter((name) => !written.has(name)).length
  const markup = toolWrites.filter(
    ({ path, content }) => MARKUP.test(content) && !(path === 'Bash' && VUI_COMMAND.test(content)),
  ).length
  // §12.2 step 5: the reply carries the line of the visual it ends with. An agent that shows
  // again (say, to clear a warning) replaces the earlier visual, so the latest line counts.
  const latest = shows
    .filter(({ exit }) => exit === 0)
    .flatMap(({ stdout }) => stdout.split('\n').filter((line) => line.startsWith('::orca-visual{')))
    .pop()
  const lines = finalText.split('\n').map((line) => line.trim())
  return {
    showCalls: shows.length,
    firstValid,
    validAfterRetry,
    handHtml: strayFiles + markup,
    directivePasted: latest === undefined ? null : lines.includes(latest),
  }
}

/**
 * @param {(Score & {id: string})[]} rows
 */
export function summarize(rows) {
  const n = rows.length
  const rate = (/** @type {(row: Score) => boolean} */ test) =>
    n === 0 ? 0 : rows.filter(test).length / n
  const firstValidRate = rate((row) => row.firstValid)
  const retryValidRate = rate((row) => row.validAfterRetry)
  const handHtmlTotal = rows.reduce((sum, row) => sum + row.handHtml, 0)
  const pasted = rows.filter((row) => row.directivePasted !== null)
  return {
    n,
    firstValidRate,
    retryValidRate,
    handHtmlTotal,
    directivePastedRate:
      pasted.length === 0
        ? null
        : pasted.filter((row) => row.directivePasted).length / pasted.length,
    gate: {
      first: firstValidRate >= GATE.first,
      retry: retryValidRate >= GATE.retry,
      html: handHtmlTotal === 0,
    },
  }
}

/**
 * Tool writes and the final reply from `claude -p --output-format stream-json --verbose`.
 *
 * @param {string} jsonl
 * @returns {{toolWrites: ToolWrite[], finalText: string}}
 */
export function parseStream(jsonl) {
  /** @type {ToolWrite[]} */
  const toolWrites = []
  let finalText = ''
  for (const line of jsonl.split('\n')) {
    /** @type {any} */
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event?.type === 'result' && typeof event.result === 'string') finalText = event.result
    if (event?.type !== 'assistant') continue
    for (const part of event.message?.content ?? []) {
      if (part?.type !== 'tool_use') continue
      const input = part.input ?? {}
      if (part.name === 'Bash')
        toolWrites.push({ path: 'Bash', content: String(input.command ?? '') })
      else if (part.name === 'Write')
        toolWrites.push({ path: String(input.file_path), content: String(input.content ?? '') })
      else if (part.name === 'Edit')
        toolWrites.push({ path: String(input.file_path), content: String(input.new_string ?? '') })
    }
  }
  return { toolWrites, finalText }
}
