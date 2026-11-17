import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  estimateOffset,
  parseUrlLine,
  verdict,
  viewerTabs,
  workspaceEnv,
} from '../lib/host-scenario.mjs'

/** A report where every §16.1 check passed. */
function passing(surface: 'orca' | 'browser') {
  return {
    surface,
    coldMs: 300,
    warmMs: 80,
    panes: { afterFirst: 1, afterSecond: 1, afterRestart: 1 },
    titlesInOrder: true,
    restart: { newPid: true, pageShowsDoc: true, clientsAfter: 1 },
    doctorFailures: [] as string[],
    listedAfterCreate: surface === 'orca' ? true : null,
    clockSynced: surface === 'orca' ? true : null,
    oldPageStopped: surface === 'browser' ? true : null,
  }
}

describe('estimateOffset', () => {
  it('takes the sample with the shortest round trip', () => {
    const samples = [
      { before: 0, remote: 150, after: 100 },
      { before: 200, remote: 260, after: 220 },
    ]
    expect(estimateOffset(samples)).toEqual({ offset: 50, uncertainty: 10 })
  })

  it('refuses no samples', () => {
    expect(() => estimateOffset([])).toThrow(/no clock samples/)
  })
})

describe('parseUrlLine', () => {
  it('finds the Viewer URL in the CLI output', () => {
    const out = 'vui: open http://localhost:47123/v/0123456789abcdef0123456789abcdef/ to see it\n'
    expect(parseUrlLine(out)).toBe('http://localhost:47123/v/0123456789abcdef0123456789abcdef/')
  })

  it('is undefined when no URL line was printed', () => {
    expect(parseUrlLine('vui: shown "x" in the viewer\n')).toBeUndefined()
  })
})

describe('viewerTabs', () => {
  it('keeps only tabs on the Viewer origin', () => {
    const tabs = [
      { browserPageId: 'a', url: 'http://localhost:47123/v/t/' },
      { browserPageId: 'b', url: 'http://localhost:4000/' },
      { browserPageId: 'c', url: 'http://localhost:47123/v/other/' },
    ]
    expect(viewerTabs(tabs, 'http://localhost:47123')).toEqual(['a', 'c'])
  })
})

describe('verdict', () => {
  it('passes a clean run', () => {
    expect(verdict(passing('orca'))).toEqual({ ok: true, failures: [], known: [] })
  })

  it('fails a warm show over 1 s', () => {
    const { ok, failures } = verdict({ ...passing('browser'), warmMs: 1001 })
    expect(ok).toBe(false)
    expect(failures.join()).toMatch(/warm/)
  })

  it('records a cold show over 1 s in Orca as VD-129, not a failure', () => {
    const result = verdict({ ...passing('orca'), coldMs: 1100 })
    expect(result.ok).toBe(true)
    expect(result.known.join()).toMatch(/VD-129/)
  })

  it('fails a cold show over 1 s outside Orca', () => {
    expect(verdict({ ...passing('browser'), coldMs: 1100 }).ok).toBe(false)
  })

  it('fails a second pane', () => {
    const report = passing('orca')
    report.panes.afterSecond = 2
    expect(verdict(report).failures.join()).toMatch(/pane/)
  })

  it('fails a doctor failure, a lost restart, unordered titles and an unlisted tab', () => {
    const report = {
      ...passing('orca'),
      doctorFailures: ['viewer: down'],
      restart: { newPid: true, pageShowsDoc: false, clientsAfter: 0 },
      titlesInOrder: false,
      listedAfterCreate: false,
    }
    expect(verdict(report).failures).toHaveLength(5)
  })

  it('fails an Orca run whose clocks were not synchronized', () => {
    expect(verdict({ ...passing('orca'), clockSynced: false }).failures.join()).toMatch(/clock/)
  })

  it('fails a browser run whose old page never said the Viewer stopped (VD-125)', () => {
    expect(verdict({ ...passing('browser'), oldPageStopped: false }).failures.join()).toMatch(
      /stopped/,
    )
  })

  it('fails a missing measurement', () => {
    expect(verdict({ ...passing('browser'), warmMs: null }).ok).toBe(false)
  })
})

describe('workspaceEnv', () => {
  const base = {
    PATH: '/usr/bin:/opt/orca-ide/bin:/home/u/.local/bin',
    ORCA_CLI_COMMAND: 'orca-ide',
    ORCA_TERMINAL_HANDLE: 'h',
    VUI_PORT: '47000',
    HOME: '/home/u',
  }

  it('isolates state and drops VUI_ variables', () => {
    const env = workspaceEnv(base, '/tmp/w', 'orca')
    expect(env.XDG_STATE_HOME).toBe(join('/tmp/w', 'state'))
    expect(env.VUI_PORT).toBeUndefined()
    expect(env.ORCA_CLI_COMMAND).toBe('orca-ide')
  })

  it('hides Orca from the browser surface', () => {
    const env = workspaceEnv(
      base,
      '/tmp/w',
      'browser',
      (dir: string) => dir === '/opt/orca-ide/bin',
      ':',
    )
    expect(Object.keys(env).filter((name) => name.startsWith('ORCA_'))).toEqual([])
    expect(env.PATH).toBe('/usr/bin:/home/u/.local/bin')
    expect(env.HOME).toBe('/home/u')
  })

  it('reads a Windows Path with its own delimiter', () => {
    const windows = { Path: 'C:\\Windows;C:\\orca\\bin', ORCA_X: '1' }
    const env = workspaceEnv(
      windows,
      'C:\\w',
      'browser',
      (dir: string) => dir.endsWith('orca\\bin'),
      ';',
    )
    expect(env.Path).toBe('C:\\Windows')
    expect(env.PATH).toBeUndefined()
  })
})
