import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stateDirOf, workspaceHash, workspaceOf } from '../src/paths.js'

function temp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vui-paths-')))
}

describe('workspaceHash', () => {
  it('is the first 16 hex chars of the SHA-256 of the path', () => {
    const full = createHash('sha256').update('/a/b').digest('hex')
    expect(workspaceHash('/a/b')).toBe(full.slice(0, 16))
    expect(workspaceHash('/a/b')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('workspaceOf', () => {
  it('finds the git top level through a .git directory', () => {
    const top = temp()
    mkdirSync(join(top, '.git'))
    mkdirSync(join(top, 'a/b'), { recursive: true })
    expect(workspaceOf(join(top, 'a/b'))).toBe(top)
  })

  it('finds it through a .git file, as in a worktree', () => {
    const top = temp()
    writeFileSync(join(top, '.git'), 'gitdir: /elsewhere\n')
    mkdirSync(join(top, 'sub'))
    expect(workspaceOf(join(top, 'sub'))).toBe(top)
  })

  it('is the cwd itself outside git', () => {
    const dir = temp()
    expect(workspaceOf(dir)).toBe(dir)
  })

  it('resolves links, so one workspace has one hash', () => {
    const dir = temp()
    expect(workspaceOf(join(dir, '.'))).toBe(dir)
  })
})

describe('stateDirOf', () => {
  it('uses XDG_STATE_HOME', () => {
    expect(stateDirOf('abc', { XDG_STATE_HOME: '/state' }, 'linux')).toBe('/state/vadd-ui/abc')
  })

  it.each([
    ['unset', {}],
    ['empty', { XDG_STATE_HOME: '' }],
    ['relative, which XDG tells us to ignore', { XDG_STATE_HOME: 'state' }],
  ])('falls back to ~/.local/state when it is %s', (_, env) => {
    expect(stateDirOf('abc', env, 'darwin')).toBe(join(homedir(), '.local/state/vadd-ui/abc'))
  })

  it('uses LOCALAPPDATA on native Windows', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }
    expect(stateDirOf('abc', env, 'win32')).toBe('C:\\Users\\me\\AppData\\Local\\vadd-ui\\abc')
  })

  it('finds AppData under the home directory without LOCALAPPDATA', () => {
    const expected = win32.join(homedir(), 'AppData', 'Local', 'vadd-ui', 'abc')
    expect(stateDirOf('abc', {}, 'win32')).toBe(expected)
  })
})
