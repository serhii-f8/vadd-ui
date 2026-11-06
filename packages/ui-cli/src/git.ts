import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REF = /^ref: (.+)$/
const HASH = /^[0-9a-f]{40,64}$/
const GITDIR = /^gitdir: (.+)$/
const BRANCH_PREFIX = 'refs/heads/'
const SHORT_HASH = 12

function gitDirOf(workspace: string): string | undefined {
  const dot = join(workspace, '.git')
  if (statSync(dot).isDirectory()) return dot
  // A linked worktree holds a file naming its real directory.
  const target = GITDIR.exec(readFileSync(dot, 'utf8').trim())?.[1]
  return target === undefined ? undefined : resolve(workspace, target)
}

/** The branch, or a detached head's short hash, read as `workspaceOf` reads `.git`: no git. */
export function branchOf(workspace: string): string | undefined {
  try {
    const dir = gitDirOf(workspace)
    if (dir === undefined) return undefined
    const head = readFileSync(join(dir, 'HEAD'), 'utf8').trim()
    const ref = REF.exec(head)?.[1]
    if (ref !== undefined) {
      return ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : ref
    }
    return HASH.test(head) ? head.slice(0, SHORT_HASH) : undefined
  } catch {
    return undefined
  }
}
