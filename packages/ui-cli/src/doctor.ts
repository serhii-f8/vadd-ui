import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { version } from '@vadd/ui'
import { type ViewerInfo, type ViewerState, viewerState } from '@vadd/ui-viewer'
import { detectEnvironment, type Environment, networkingMode } from './environment.js'
import { resolveOrca } from './host/orca.js'
import { isWritableDirectory } from './host/select.js'
import type { Io } from './io.js'
import { ioReason } from './io-error.js'
import { CliError, EXIT, type Outcome } from './outcome.js'
import { safe } from './print.js'
import type { ExecResult, System } from './system.js'
import { customEndpoint, healthOf, type Target } from './viewer/client.js'
import { type Place, placeOf } from './viewer/lifecycle.js'

type Status = 'ok' | 'info' | 'warn' | 'fail'

export interface Check {
  name: string
  status: Status
  detail: string
  fix?: string
}

const MIN_NODE = 20
const STATUS_WIDTH = 5
const LOOPBACK = '127.0.0.1'
/** `localhost` tries `::1` first, where nothing listens (§15.3), which took 21 s on mirrored. */
const PROBE_TIMEOUT_MS = 45_000
const OK_STATUS = '200'
const POWERSHELLS = [
  'powershell.exe',
  // `appendWindowsPath=false` keeps Windows off PATH, and interop still works by path.
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
]
const NAT_FIX =
  'In %UserProfile%\\.wslconfig set localhostForwarding=true under [wsl2], then run wsl --shutdown.'
const MIRRORED_FIX =
  "Allow inbound WSL traffic: in an administrator PowerShell run Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow."

function nodeCheck({ nodeVersion }: System): Check {
  const detail = `v${nodeVersion}`
  if (Number.parseInt(nodeVersion, 10) >= MIN_NODE) return { name: 'node', status: 'ok', detail }
  return { name: 'node', status: 'fail', detail, fix: `Install Node ${MIN_NODE} or newer.` }
}

function environmentCheck({ kind, distro }: Environment): Check {
  const hints: Record<Environment['kind'], string> = {
    native: '',
    wsl: distro === undefined ? '' : ` (${distro})`,
    ssh: '; forward the port with ssh -L <port>:localhost:<port> to reach the Viewer',
    container: '; publish the port and run vui viewer start --bind 0.0.0.0',
  }
  return { name: 'environment', status: 'info', detail: `${kind}${hints[kind]}` }
}

function orcaCliCheck(system: System): Check {
  const orca = resolveOrca(system)
  if (orca !== undefined) return { name: 'orca-cli', status: 'ok', detail: orca }
  return { name: 'orca-cli', status: 'info', detail: 'not found; vui show prints the URL instead' }
}

function orcaChatCheck({ env }: System): Check {
  const name = 'orca-chat'
  const { ORCA_CHAT_SCRATCH_DIR: dir } = env
  if (!dir) return { name, status: 'info', detail: 'not set; the Viewer is the host' }
  if (isWritableDirectory(dir)) return { name, status: 'ok', detail: dir }
  const fix = 'Make ORCA_CHAT_SCRATCH_DIR a writable directory, or unset it.'
  return { name, status: 'fail', detail: `${dir} is not a writable directory`, fix }
}

function stateCheck({ stateDir }: Place): Check {
  const name = 'state'
  const existed = existsSync(stateDir)
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    const probe = join(stateDir, `doctor.${process.pid}.tmp`)
    writeFileSync(probe, '')
    rmSync(probe)
    // B14: a folder made only for this check would stay behind empty.
    if (!existed) rmdirSync(stateDir)
    return { name, status: 'ok', detail: stateDir }
  } catch (error) {
    const fix = 'Make the directory writable, or set XDG_STATE_HOME to one that is.'
    return { name, status: 'fail', detail: `${stateDir}: ${ioReason(error)}`, fix }
  }
}

function viewerCheck(found: ViewerState): Check {
  const name = 'viewer'
  if (found.state === 'stalled') {
    const detail = `pid ${found.info.pid} holds port ${found.info.port} and is not answering`
    return { name, status: 'fail', detail, fix: 'Run vui viewer stop.' }
  }
  const live = found.info
  if (live === undefined) {
    return { name, status: 'info', detail: 'not running; vui show starts it' }
  }
  const detail = `healthy on port ${live.port} (pid ${live.pid})`
  if (live.version === version) return { name, status: 'ok', detail }
  const fix = 'Run vui viewer stop; the next vui show starts this version.'
  return { name, status: 'warn', detail: `${detail}, version ${live.version}`, fix }
}

async function customViewerCheck(target: Target): Promise<Check> {
  const name = 'viewer'
  const health = await healthOf(target)
  if (health !== undefined) {
    const detail = `VUI_VIEWER_URL answers, version ${health.version ?? 'unknown'}`
    return { name, status: 'ok', detail }
  }
  const fix = 'Start that server, or unset VUI_VIEWER_URL to use a local Viewer.'
  return { name, status: 'fail', detail: 'VUI_VIEWER_URL does not answer', fix }
}

/** A real listener to aim at when no Viewer runs, so the check never depends on one. */
async function withThrowawayServer<T>(use: (port: number) => Promise<T>): Promise<T> {
  const server = createServer((_req, res) => res.writeHead(200).end('{"ok":true}'))
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve))
  try {
    return await use((server.address() as AddressInfo).port)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

/** §11.1's command. `undefined` when no PowerShell can be found. */
async function askWindows(system: System, port: number): Promise<ExecResult | undefined> {
  const url = `http://localhost:${port}/health`
  const command = `(Invoke-WebRequest -UseBasicParsing ${url}).StatusCode`
  for (const file of POWERSHELLS) {
    const options = { timeoutMs: PROBE_TIMEOUT_MS }
    const result = await system.exec(file, ['-NoProfile', '-Command', command], options)
    if (!result.missing) return result
  }
  return undefined
}

function reachabilityFix(mode: string): string {
  if (mode === 'nat') return NAT_FIX
  if (mode === 'mirrored') return MIRRORED_FIX
  return `Under NAT: ${NAT_FIX} Under mirrored networking: ${MIRRORED_FIX}`
}

/** One check for both modes: only the fix differs (§4.1). */
async function windowsCheck(system: System, live: ViewerInfo | undefined): Promise<Check> {
  const name = 'windows'
  const mode = await networkingMode(system)
  const reach = (port: number) => askWindows(system, port)
  const target = live === undefined ? 'a test port' : `port ${live.port}`
  const started = Date.now()
  const result = await (live === undefined ? withThrowawayServer(reach) : reach(live.port))
  const seconds = Math.round((Date.now() - started) / 1000)
  if (result === undefined) {
    const fix =
      'Enable WSL interop, or check by hand from Windows: curl http://localhost:<port>/health'
    return { name, status: 'warn', detail: 'powershell.exe not found, so this is unchecked', fix }
  }
  const networking = `${mode} networking, ${seconds} s`
  if (result.ok && result.stdout.trim() === OK_STATUS) {
    return { name, status: 'ok', detail: `Windows reaches ${target} (${networking})` }
  }
  const why = result.timedOut ? 'timed out' : `answered ${result.stdout.trim() || 'nothing'}`
  const detail = `Windows cannot reach ${target} (${networking}): ${why}`
  return { name, status: 'fail', detail, fix: reachabilityFix(mode) }
}

function customTarget(system: System): Target | Check | undefined {
  try {
    return customEndpoint(system.env)
  } catch (error) {
    const detail = error instanceof CliError ? error.message : String(error)
    const fix = 'Set VUI_VIEWER_URL to an http or https URL, or unset it.'
    return { name: 'viewer', status: 'fail', detail, fix }
  }
}

async function runChecks(system: System): Promise<Check[]> {
  const environment = detectEnvironment(system)
  const place = placeOf(system)
  const custom = customTarget(system)
  const found = await viewerState(place.stateDir, place.hash)
  const live = found.state === 'live' ? found.info : undefined
  let viewer: Check
  if (custom === undefined) viewer = viewerCheck(found)
  else if ('status' in custom) viewer = custom
  else viewer = await customViewerCheck(custom)
  const checks = [
    nodeCheck(system),
    environmentCheck(environment),
    orcaCliCheck(system),
    orcaChatCheck(system),
    stateCheck(place),
    viewer,
  ]
  if (environment.kind === 'wsl') checks.push(await windowsCheck(system, live))
  return checks
}

function lineOf({ name, status, detail, fix }: Check): string {
  const head = `${safe(`${status.padEnd(STATUS_WIDTH)}${name}: ${detail}`)}\n`
  return fix === undefined ? head : `${head}${' '.repeat(STATUS_WIDTH)}fix: ${safe(fix)}\n`
}

/** §11.1. Any `fail` exits 4: the host this machine would use may not work. */
export async function doctor(io: Io): Promise<Outcome> {
  const checks = await runChecks(io.system)
  const failures = checks.filter(({ status }) => status === 'fail').length
  return {
    exit: failures === 0 ? EXIT.ok : EXIT.noHost,
    stdout: checks.map(lineOf).join(''),
    json: { checks, failures },
  }
}
