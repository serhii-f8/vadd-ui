import { describe, expect, it } from 'vitest'
import { openBrowser } from '../src/host/browser.js'
import type { ExecResult } from '../src/system.js'
import { fakeSystem } from './helpers.js'

const URL_ = 'http://localhost:1/v/t/'

function chain(answers: Record<string, Partial<ExecResult>>) {
  const tried: string[][] = []
  const exec = (file: string, args: readonly string[]) => {
    tried.push([file, ...args])
    return answers[file] ?? { ok: false, missing: true }
  }
  return { tried, exec }
}

describe('openBrowser (§4.1)', () => {
  const wsl = { WSL_DISTRO_NAME: 'Ubuntu' }

  it('uses wslview first in WSL', async () => {
    const { exec, tried } = chain({ wslview: { ok: true } })
    expect(await openBrowser(fakeSystem({ env: wsl, exec }), URL_)).toBe('wslview')
    expect(tried).toEqual([['wslview', URL_]])
  })

  it('counts explorer.exe exiting 1, which it does after opening a URL', async () => {
    const { exec } = chain({ 'explorer.exe': { ok: false, code: 1 } })
    expect(await openBrowser(fakeSystem({ env: wsl, exec }), URL_)).toBe('explorer.exe')
  })

  it('finds explorer.exe by path when Windows is off PATH', async () => {
    const { exec } = chain({ '/mnt/c/Windows/explorer.exe': { ok: false, code: 1 } })
    expect(await openBrowser(fakeSystem({ env: wsl, exec }), URL_)).toBe(
      '/mnt/c/Windows/explorer.exe',
    )
  })

  it('gives up with nothing left in WSL', async () => {
    const { exec, tried } = chain({})
    expect(await openBrowser(fakeSystem({ env: wsl, exec }), URL_)).toBeUndefined()
    expect(tried).toHaveLength(3)
  })

  it('does not count wslview failing', async () => {
    const { exec, tried } = chain({ wslview: { ok: false, code: 1 } })
    await openBrowser(fakeSystem({ env: wsl, exec }), URL_)
    expect(tried[1]?.[0]).toBe('explorer.exe')
  })

  it.each<[NodeJS.Platform, string[]]>([
    ['darwin', ['open', URL_]],
    ['linux', ['xdg-open', URL_]],
    ['win32', ['cmd.exe', '/d', '/c', 'start', '""', URL_]],
  ])('on %s runs %j', async (platform, command) => {
    const { exec, tried } = chain({ [command[0] as string]: { ok: true } })
    expect(await openBrowser(fakeSystem({ platform, exec }), URL_)).toBe(command[0])
    expect(tried).toEqual([command])
  })

  it('runs start through ComSpec on Windows', async () => {
    const shell = 'C:\\Windows\\system32\\cmd.exe'
    const { exec, tried } = chain({ [shell]: { ok: true } })
    const system = fakeSystem({ platform: 'win32', env: { ComSpec: shell }, exec })
    expect(await openBrowser(system, URL_)).toBe(shell)
    expect(tried).toEqual([[shell, '/d', '/c', 'start', '""', URL_]])
  })

  it('opens nothing over SSH', async () => {
    const { exec, tried } = chain({})
    const env = { SSH_CONNECTION: 'a b c d' }
    expect(await openBrowser(fakeSystem({ env, exec }), URL_)).toBeUndefined()
    expect(tried).toEqual([])
  })
})
