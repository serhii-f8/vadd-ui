// §16.1's scenario, the parts that need no Orca and no browser: clock offset, the URL line,
// pane counting, the verdict and the environment each surface runs `vui` in.

import { delimiter, join } from 'node:path'

/** §16.1: "appears in the pane within 1 s". */
export const BUDGET_MS = 1000

/**
 * NTP-style offset of a remote clock: remote minus the local midpoint, from the sample with
 * the shortest round trip; the uncertainty is half that round trip.
 *
 * @param {{before: number, remote: number, after: number}[]} samples
 * @returns {{offset: number, uncertainty: number}}
 */
export function estimateOffset(samples) {
  if (samples.length === 0) throw new Error('no clock samples')
  const best = samples.reduce((a, b) => (b.after - b.before < a.after - a.before ? b : a))
  const midpoint = (best.before + best.after) / 2
  return { offset: best.remote - midpoint, uncertainty: (best.after - best.before) / 2 }
}

/**
 * The Viewer URL from the CLI's `vui: open <url>` line.
 *
 * @param {string} output
 * @returns {string | undefined}
 */
export function parseUrlLine(output) {
  const match = /^vui: open (https?:\/\/\S+?\/v\/[^/\s]+\/)/m.exec(output)
  return match?.[1]
}

/**
 * Page ids of the tabs open on the Viewer's origin.
 *
 * @param {{browserPageId: string, url: string}[]} tabs
 * @param {string} origin
 * @returns {string[]}
 */
export function viewerTabs(tabs, origin) {
  return tabs
    .filter(({ url }) => {
      try {
        return new URL(url).origin === origin
      } catch {
        return false
      }
    })
    .map(({ browserPageId }) => browserPageId)
}

/**
 * @typedef {object} Report
 * @property {'orca' | 'browser'} surface
 * @property {number | null} coldMs first show, no Viewer and no pane yet
 * @property {number | null} warmMs a show with the pane open
 * @property {{afterFirst: number, afterSecond: number, afterRestart: number}} panes
 * @property {boolean} titlesInOrder
 * @property {{newPid: boolean, pageShowsDoc: boolean, clientsAfter: number}} restart
 * @property {string[]} doctorFailures
 * @property {boolean | null} listedAfterCreate VD-142, Orca only
 */

/**
 * @param {Report} report
 * @returns {{ok: boolean, failures: string[], known: string[]}}
 */
export function verdict(report) {
  /** @type {string[]} */
  const failures = []
  /** @type {string[]} */
  const known = []
  const { surface, coldMs, warmMs, panes, restart } = report
  if (coldMs === null) failures.push('cold: not measured')
  else if (coldMs > BUDGET_MS) {
    if (surface === 'orca') {
      known.push(`cold ${Math.round(coldMs)} ms > 1 s: Orca creating the pane (VD-129)`)
    } else failures.push(`cold: ${Math.round(coldMs)} ms > 1 s`)
  }
  if (warmMs === null) failures.push('warm: not measured')
  else if (warmMs > BUDGET_MS) failures.push(`warm: ${Math.round(warmMs)} ms > 1 s`)
  for (const [step, count] of Object.entries(panes)) {
    if (count !== 1) failures.push(`pane count ${step}: ${count}, expected 1`)
  }
  if (!report.titlesInOrder) failures.push('feed: titles missing or out of order')
  if (!restart.newPid) failures.push('restart: the Viewer did not restart')
  if (!restart.pageShowsDoc) failures.push('restart: the open page did not reconnect')
  if (restart.clientsAfter < 1) failures.push('restart: no client connected afterwards')
  for (const failure of report.doctorFailures) failures.push(`doctor: ${failure}`)
  if (report.listedAfterCreate === false) failures.push('tab list: new pane not listed (VD-142)')
  return { ok: failures.length === 0, failures, known }
}

/**
 * The environment `vui` runs in: its own state directory, no `VUI_*` overrides, and for the
 * browser surface no trace of Orca, so the CLI behaves as in a terminal outside Orca.
 *
 * @param {NodeJS.ProcessEnv} base
 * @param {string} dir
 * @param {'orca' | 'browser'} surface
 * @param {(dir: string) => boolean} [hasOrca] whether a PATH entry holds an Orca CLI
 * @param {string} [separator] `path.delimiter` of the host
 * @returns {NodeJS.ProcessEnv}
 */
export function workspaceEnv(base, dir, surface, hasOrca = () => false, separator = delimiter) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {}
  for (const [name, value] of Object.entries(base)) {
    if (name.startsWith('VUI_')) continue
    if (surface === 'browser' && name.startsWith('ORCA_')) continue
    env[name] = value
  }
  // Windows spells it `Path`, and a copied environment is no longer case-insensitive.
  const pathName = Object.keys(base).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'
  if (surface === 'browser') {
    env[pathName] = (base[pathName] ?? '')
      .split(separator)
      .filter((entry) => entry && !hasOrca(entry))
      .join(separator)
  }
  env.XDG_STATE_HOME = join(dir, 'state')
  // Native Windows keeps the state under %LOCALAPPDATA% (§4.1).
  if ('LOCALAPPDATA' in base) env.LOCALAPPDATA = join(dir, 'state')
  return env
}
