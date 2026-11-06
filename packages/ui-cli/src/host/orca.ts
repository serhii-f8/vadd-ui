import type { System } from '../system.js'

const OPEN_TIMEOUT_MS = 10_000
const ORCA_VARIABLE = /^ORCA_/
const DEFAULT_PATHEXT = '.EXE;.CMD;.BAT'

export type TabResult = { pageId: string } | { failure: string }

export interface Tab {
  browserPageId: string
  url: string
}

function onPath(name: string, system: System): string | undefined {
  if (/[\\/]/.test(name)) return system.exists(name) ? name : undefined
  const windows = system.platform === 'win32'
  const directories = (system.env.PATH ?? '').split(windows ? ';' : ':').filter(Boolean)
  const suffixes = windows ? (system.env.PATHEXT ?? DEFAULT_PATHEXT).split(';') : ['']
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const path = system.pathJoin(directory, `${name}${suffix}`)
      if (system.exists(path)) return path
    }
  }
  return undefined
}

/**
 * VD-011. Bare `orca` only inside an Orca terminal: elsewhere on Linux it is usually the GNOME
 * screen reader, and `vui show` must not start speech.
 */
export function resolveOrca(system: System): string | undefined {
  const { ORCA_CLI_COMMAND: named } = system.env
  const found = (named ? onPath(named, system) : undefined) ?? onPath('orca-ide', system)
  if (found !== undefined) return found
  const inOrca = Object.keys(system.env).some((name) => ORCA_VARIABLE.test(name))
  return inOrca ? onPath('orca', system) : undefined
}

type Reply = { ok: true; result: Record<string, unknown> } | { ok: false; failure: string }

function parsed(stdout: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(stdout) as unknown
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** Orca's `--json` contract: branch on `ok` and `error.code`. */
async function call(system: System, orca: string, args: string[]): Promise<Reply> {
  const { stdout, timedOut, missing } = await system.exec(orca, [...args, '--json'], {
    timeoutMs: OPEN_TIMEOUT_MS,
  })
  if (timedOut) return { ok: false, failure: 'timeout' }
  if (missing) return { ok: false, failure: 'missing' }
  const reply = parsed(stdout)
  if (reply?.ok === true) {
    return { ok: true, result: (reply.result ?? {}) as Record<string, unknown> }
  }
  const code = (reply?.error as { code?: unknown } | undefined)?.code
  return { ok: false, failure: typeof code === 'string' ? code : 'bad-reply' }
}

/** §4.1. The one Orca call §17.3 counts as the Viewer's contract. */
export async function createTab(system: System, orca: string, url: string): Promise<TabResult> {
  const reply = await call(system, orca, ['tab', 'create', '--url', url, '--split', 'right'])
  if (!reply.ok) return { failure: reply.failure }
  const { browserPageId: pageId } = reply.result
  return typeof pageId === 'string' ? { pageId } : { failure: 'bad-reply' }
}

function isTab(tab: unknown): tab is Tab {
  const { browserPageId, url } = (tab ?? {}) as Partial<Tab>
  return typeof browserPageId === 'string' && typeof url === 'string'
}

/** The worktree's tabs, or `undefined` if Orca cannot say. */
export async function listTabs(system: System, orca: string): Promise<Tab[] | undefined> {
  const reply = await call(system, orca, ['tab', 'list'])
  if (!reply.ok || !Array.isArray(reply.result.tabs)) return undefined
  return reply.result.tabs.filter(isTab).map(({ browserPageId, url }) => ({ browserPageId, url }))
}

export async function gotoTab(
  system: System,
  orca: string,
  pageId: string,
  url: string,
): Promise<boolean> {
  return (await call(system, orca, ['goto', '--page', pageId, '--url', url])).ok
}
