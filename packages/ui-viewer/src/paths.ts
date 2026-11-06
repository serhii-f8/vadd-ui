import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, win32 } from 'node:path'

const HASH_LENGTH = 16
const APP_DIR = 'vadd-ui'

/** §4.1: the git top level of `cwd`, or `cwd` itself outside git. Real, so links agree. */
export function workspaceOf(cwd: string): string {
  const start = realpathSync(cwd)
  let dir = start
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

export function workspaceHash(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, HASH_LENGTH)
}

/** §4.1. A relative `XDG_STATE_HOME` is invalid by the XDG rule, so it counts as unset. */
export function stateDirOf(
  hash: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const root = env.LOCALAPPDATA || win32.join(homedir(), 'AppData', 'Local')
    return win32.join(root, APP_DIR, hash)
  }
  const { XDG_STATE_HOME: xdg } = env
  const root = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'state')
  return join(root, APP_DIR, hash)
}
