import { version } from '@vadd/ui'
import { viewerState, viewerUrl } from '@vadd/ui-viewer'
import type { ParsedArgs } from './args.js'
import { openBrowser } from './host/browser.js'
import type { Io } from './io.js'
import { EXIT, noHost, type Outcome, usageError } from './outcome.js'
import { safe } from './print.js'
import { customEndpoint, healthOf, type Target } from './viewer/client.js'
import { ensureViewer, findViewer, placeOf, stopViewer } from './viewer/lifecycle.js'

const ACTIONS: readonly string[] = ['start', 'stop', 'status', 'open', 'url']

function actionOf(parsed: ParsedArgs): string {
  const action = parsed.positional[0]
  if (action === undefined || !ACTIONS.includes(action)) {
    throw usageError(`vui viewer takes one of ${ACTIONS.join('|')}`)
  }
  if (parsed.flags.bind !== undefined && action !== 'start') {
    throw usageError('--bind only applies to vui viewer start')
  }
  return action
}

async function open(url: string, io: Io): Promise<Outcome> {
  const opener = await openBrowser(io.system, url)
  if (opener === undefined) {
    // A headless machine or an SSH session: the URL is still the way in.
    return {
      exit: EXIT.ok,
      stdout: `vui: open ${safe(url)}\n`,
      json: { url, opened: false },
    }
  }
  return {
    exit: EXIT.ok,
    stdout: `vui: opened ${safe(url)}\n`,
    json: { url, opened: true, opener },
  }
}

async function customStatus(target: Target): Promise<Outcome> {
  const health = await healthOf(target)
  if (health === undefined) {
    const stdout = 'vui: VUI_VIEWER_URL does not answer\n'
    return { exit: EXIT.ok, stdout, json: { running: false, custom: true } }
  }
  const stdout = `vui: VUI_VIEWER_URL answers (version ${safe(health.version ?? 'unknown')})\n`
  return { exit: EXIT.ok, stdout, json: { running: true, custom: true, ...health } }
}

function customAction(action: string, target: Target, io: Io): Outcome | Promise<Outcome> {
  const url = `${target.base}/`
  switch (action) {
    case 'open':
      return open(url, io)
    case 'url':
      return { exit: EXIT.ok, stdout: `${safe(url)}\n`, json: { url, custom: true } }
    case 'status':
      return customStatus(target)
    default:
      throw usageError(`VUI_VIEWER_URL is set, so there is no local Viewer to ${action}`)
  }
}

const EXPOSED = '0.0.0.0'

function bindWarnings(bind: unknown, started: boolean, port: number): string[] {
  if (bind === undefined) return []
  if (!started) return ['vui: warning: a Viewer is already running, so --bind was ignored']
  if (bind !== EXPOSED) return []
  // §15.3: its own warning stays in `viewer.log`, where nobody at this terminal sees it.
  return [`vui: warning: Viewer bound to ${EXPOSED}:${port}, reachable from other machines`]
}

async function start(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const { bind } = parsed.flags
  const options = typeof bind === 'string' ? { bind } : {}
  const { url, started, info } = await ensureViewer(io.system, options)
  const word = started ? 'started' : 'running'
  const warnings = bindWarnings(bind, started, info.port)
  return {
    exit: EXIT.ok,
    stdout: `vui: viewer ${word} on port ${info.port}\nvui: open ${url}\n`,
    stderr: warnings.map((line) => `${line}\n`).join(''),
    json: { started, running: true, url, port: info.port, pid: info.pid, warnings },
  }
}

async function stop(io: Io): Promise<Outcome> {
  const { stopped, pid } = await stopViewer(io.system)
  return {
    exit: EXIT.ok,
    stdout: stopped ? `vui: viewer stopped (pid ${pid})\n` : 'vui: no viewer running\n',
    json: { stopped, ...(pid === undefined ? {} : { pid }) },
  }
}

async function status(io: Io): Promise<Outcome> {
  const { stateDir, hash } = placeOf(io.system)
  const found = await viewerState(stateDir, hash)
  if (found.state === 'none') {
    return { exit: EXIT.ok, stdout: 'vui: no viewer running\n', json: { running: false } }
  }
  const { port, pid, startedAt, version: running, readToken } = found.info
  if (found.state === 'stalled') {
    const stdout = `vui: viewer on port ${port} (pid ${pid}) is not answering; run vui viewer stop\n`
    return { exit: EXIT.ok, stdout, json: { running: false, stalled: true, port, pid } }
  }
  const stale = running === version ? '' : ` (version ${safe(running)}, this CLI is ${version})`
  return {
    exit: EXIT.ok,
    stdout: `vui: viewer running on port ${port} (pid ${pid})${stale}\n`,
    json: {
      running: true,
      port,
      pid,
      startedAt,
      version: running,
      url: viewerUrl(port, readToken),
    },
  }
}

async function url(io: Io): Promise<Outcome> {
  const found = await findViewer(io.system)
  if (found === undefined) throw noHost('no Viewer is running; run vui viewer start')
  return { exit: EXIT.ok, stdout: `${found.url}\n`, json: { url: found.url } }
}

/** §11.1. `open` starts a Viewer if it must: a browser on nothing helps nobody. */
export function viewerCommand(parsed: ParsedArgs, io: Io): Outcome | Promise<Outcome> {
  const action = actionOf(parsed)
  const target = customEndpoint(io.system.env)
  if (target !== undefined) return customAction(action, target, io)
  switch (action) {
    case 'start':
      return start(parsed, io)
    case 'stop':
      return stop(io)
    case 'status':
      return status(io)
    case 'url':
      return url(io)
    default:
      return ensureViewer(io.system).then((viewer) => open(viewer.url, io))
  }
}
