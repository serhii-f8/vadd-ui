import { accessSync, constants, statSync } from 'node:fs'
import type { ParsedArgs } from '../args.js'
import { usageError } from '../outcome.js'
import type { System } from '../system.js'

export type HostName = 'viewer' | 'orca-chat' | 'file'

export interface HostChoice {
  name: HostName
  /** `--host` named it, so no other host may stand in. */
  explicit: boolean
}

const AUTO = 'auto'
const HOSTS: readonly string[] = ['viewer', 'orca-chat', 'file']

/** Search as well as write: creating an entry needs both. */
export function isWritableDirectory(path: string): boolean {
  try {
    accessSync(path, constants.W_OK | constants.X_OK)
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** §4.0, steps 1 to 3. */
export function selectHost(parsed: ParsedArgs, system: System): HostChoice {
  const { host = AUTO, dir } = parsed.flags
  if (host !== AUTO && !HOSTS.includes(host as string)) {
    throw usageError(`--host must be one of ${AUTO}|${HOSTS.join('|')}`)
  }
  if ((host === 'file') !== (dir !== undefined)) {
    throw usageError(host === 'file' ? '--host file needs --dir' : '--dir needs --host file')
  }
  if (host !== AUTO) return { name: host as HostName, explicit: true }
  const { ORCA_CHAT_SCRATCH_DIR: scratch } = system.env
  const chat = scratch !== undefined && scratch !== '' && isWritableDirectory(scratch)
  return { name: chat ? 'orca-chat' : 'viewer', explicit: false }
}
