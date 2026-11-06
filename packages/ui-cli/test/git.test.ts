import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchOf } from '../src/git.js'
import { tempDir } from './helpers.js'

function repo(head: string): string {
  const dir = tempDir()
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.git', 'HEAD'), head)
  return dir
}

describe('branchOf', () => {
  it('reads a branch', () => {
    expect(branchOf(repo('ref: refs/heads/vadd-ui/15-show\n'))).toBe('vadd-ui/15-show')
  })

  it('keeps a ref that is not a branch whole', () => {
    expect(branchOf(repo('ref: refs/remotes/x\n'))).toBe('refs/remotes/x')
  })

  it('gives twelve characters of a detached head', () => {
    expect(branchOf(repo(`${'a1'.repeat(20)}\n`))).toBe('a1'.repeat(6))
  })

  it('follows the .git file of a worktree', () => {
    const main = repo('ref: refs/heads/main\n')
    const linked = join(main, '.git', 'worktrees', 'w')
    mkdirSync(linked, { recursive: true })
    writeFileSync(join(linked, 'HEAD'), 'ref: refs/heads/feature\n')
    const worktree = tempDir()
    writeFileSync(join(worktree, '.git'), `gitdir: ${linked}\n`)
    expect(branchOf(worktree)).toBe('feature')
  })

  it('follows a relative gitdir', () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'store'))
    writeFileSync(join(dir, 'store', 'HEAD'), 'ref: refs/heads/rel\n')
    writeFileSync(join(dir, '.git'), 'gitdir: store\n')
    expect(branchOf(dir)).toBe('rel')
  })

  it('has no branch outside git, or with an unreadable HEAD', () => {
    expect(branchOf(tempDir())).toBeUndefined()
    expect(branchOf(repo('garbage\n'))).toBeUndefined()
  })
})
