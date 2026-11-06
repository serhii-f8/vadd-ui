import { describe, expect, it } from 'vitest'
import { createTab, gotoTab, listTabs, resolveOrca } from '../src/host/orca.js'
import { fakeSystem } from './helpers.js'

describe('resolveOrca (VD-011)', () => {
  const files = { '/bin/orca-ide': '', '/bin/orca': '', '/opt/named': '' }

  it('takes ORCA_CLI_COMMAND first', () => {
    const env = { PATH: '/bin', ORCA_CLI_COMMAND: 'orca-ide' }
    expect(resolveOrca(fakeSystem({ env, files }))).toBe('/bin/orca-ide')
  })

  it('takes a path in ORCA_CLI_COMMAND', () => {
    const env = { PATH: '/bin', ORCA_CLI_COMMAND: '/opt/named' }
    expect(resolveOrca(fakeSystem({ env, files }))).toBe('/opt/named')
  })

  it('goes on when ORCA_CLI_COMMAND does not exist', () => {
    const env = { PATH: '/bin', ORCA_CLI_COMMAND: 'nope' }
    expect(resolveOrca(fakeSystem({ env, files }))).toBe('/bin/orca-ide')
  })

  it('takes orca-ide without the variable', () => {
    expect(resolveOrca(fakeSystem({ env: { PATH: '/bin' }, files }))).toBe('/bin/orca-ide')
  })

  it('never runs bare orca outside an Orca terminal, since that can be a screen reader', () => {
    const system = fakeSystem({ env: { PATH: '/usr/bin' }, files: { '/usr/bin/orca': '' } })
    expect(resolveOrca(system)).toBeUndefined()
  })

  it('takes bare orca inside an Orca terminal', () => {
    const env = { PATH: '/usr/bin', ORCA_TERMINAL_HANDLE: 't' }
    const system = fakeSystem({ env, files: { '/usr/bin/orca': '' } })
    expect(resolveOrca(system)).toBe('/usr/bin/orca')
  })

  it('finds nothing with no PATH', () => {
    expect(resolveOrca(fakeSystem({ env: {} }))).toBeUndefined()
  })

  it('reads a Windows PATH with PATHEXT', () => {
    const env = { PATH: 'C:\\a;C:\\b', PATHEXT: '.EXE;.CMD' }
    const files = { 'C:\\b\\orca-ide.CMD': '' }
    const system = fakeSystem({ env, files, platform: 'win32', pathJoin: (a, b) => `${a}\\${b}` })
    expect(resolveOrca(system)).toBe('C:\\b\\orca-ide.CMD')
  })
})

describe('createTab', () => {
  const reply = (stdout: string, ok = true) => fakeSystem({ exec: () => ({ ok, stdout }) })

  it('runs the §4.1 command and returns the page', async () => {
    const calls: unknown[] = []
    const system = fakeSystem({
      exec: (file, args) => {
        calls.push([file, ...args])
        return { ok: true, stdout: '{"ok":true,"result":{"browserPageId":"p1"}}' }
      },
    })
    expect(await createTab(system, 'orca', 'http://localhost:1/v/t/')).toEqual({ pageId: 'p1' })
    const url = 'http://localhost:1/v/t/'
    expect(calls).toEqual([['orca', 'tab', 'create', '--url', url, '--split', 'right', '--json']])
  })

  it('reports error.code', async () => {
    const system = reply('{"ok":false,"error":{"code":"no_runtime"}}', false)
    expect(await createTab(system, 'orca', 'u')).toEqual({ failure: 'no_runtime' })
  })

  it('reports a reply that is not JSON', async () => {
    expect(await createTab(reply('oops'), 'orca', 'u')).toEqual({ failure: 'bad-reply' })
  })

  it('reports ok without a page', async () => {
    expect(await createTab(reply('{"ok":true,"result":{}}'), 'orca', 'u')).toEqual({
      failure: 'bad-reply',
    })
  })

  it('reports a timeout', async () => {
    const system = fakeSystem({ exec: () => ({ ok: false, timedOut: true }) })
    expect(await createTab(system, 'orca', 'u')).toEqual({ failure: 'timeout' })
  })

  it('reports a command that cannot run', async () => {
    expect(await createTab(fakeSystem(), 'orca', 'u')).toEqual({ failure: 'missing' })
  })
})

describe('listTabs', () => {
  it('gives pages and URLs', async () => {
    const tabs = [{ browserPageId: 'p', url: 'u', title: 't' }]
    const stdout = JSON.stringify({ ok: true, result: { tabs } })
    const system = fakeSystem({ exec: () => ({ ok: true, stdout }) })
    expect(await listTabs(system, 'orca')).toEqual([{ browserPageId: 'p', url: 'u' }])
  })

  it('gives nothing on a failure or a strange shape', async () => {
    expect(await listTabs(fakeSystem(), 'orca')).toBeUndefined()
    const odd = fakeSystem({ exec: () => ({ ok: true, stdout: '{"ok":true,"result":{}}' }) })
    expect(await listTabs(odd, 'orca')).toBeUndefined()
  })

  it('skips a tab it cannot read', async () => {
    const stdout = JSON.stringify({ ok: true, result: { tabs: [{}, null] } })
    const system = fakeSystem({ exec: () => ({ ok: true, stdout }) })
    expect(await listTabs(system, 'orca')).toEqual([])
  })
})

describe('gotoTab', () => {
  it('moves the page', async () => {
    const calls: string[][] = []
    const system = fakeSystem({
      exec: (_file, args) => {
        calls.push([...args])
        return { ok: true, stdout: '{"ok":true,"result":{}}' }
      },
    })
    expect(await gotoTab(system, 'orca', 'p', 'u')).toBe(true)
    expect(calls[0]).toEqual(['goto', '--page', 'p', '--url', 'u', '--json'])
  })

  it('is false for a closed page', async () => {
    const stdout = '{"ok":false,"error":{"code":"browser_tab_not_found"}}'
    const system = fakeSystem({ exec: () => ({ ok: false, stdout }) })
    expect(await gotoTab(system, 'orca', 'p', 'u')).toBe(false)
  })
})
