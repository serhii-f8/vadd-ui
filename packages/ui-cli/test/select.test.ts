import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ParsedArgs } from '../src/args.js'
import { selectHost } from '../src/host/select.js'
import { fakeSystem, tempDir } from './helpers.js'

const parsed = (flags: ParsedArgs['flags'] = {}): ParsedArgs => ({
  command: 'show',
  positional: [],
  flags,
})

describe('selectHost (§4.0)', () => {
  it('is the Viewer by default', () => {
    expect(selectHost(parsed(), fakeSystem())).toEqual({ name: 'viewer', explicit: false })
  })

  it('takes orca-chat when the scratch dir is writable', () => {
    const system = fakeSystem({ env: { ORCA_CHAT_SCRATCH_DIR: tempDir() } })
    expect(selectHost(parsed(), system)).toEqual({ name: 'orca-chat', explicit: false })
  })

  it('reads auto as no choice', () => {
    const system = fakeSystem({ env: { ORCA_CHAT_SCRATCH_DIR: tempDir() } })
    expect(selectHost(parsed({ host: 'auto' }), system).name).toBe('orca-chat')
  })

  it('passes over a missing scratch dir', () => {
    const system = fakeSystem({ env: { ORCA_CHAT_SCRATCH_DIR: join(tempDir(), 'no') } })
    expect(selectHost(parsed(), system).name).toBe('viewer')
  })

  it('passes over a read-only scratch dir', () => {
    const dir = tempDir()
    chmodSync(dir, 0o500)
    const system = fakeSystem({ env: { ORCA_CHAT_SCRATCH_DIR: dir } })
    expect(selectHost(parsed(), system).name).toBe('viewer')
    chmodSync(dir, 0o700)
  })

  it('lets --host win over the scratch dir', () => {
    const system = fakeSystem({ env: { ORCA_CHAT_SCRATCH_DIR: tempDir() } })
    expect(selectHost(parsed({ host: 'viewer' }), system)).toEqual({
      name: 'viewer',
      explicit: true,
    })
  })

  it('takes file with --dir', () => {
    expect(selectHost(parsed({ host: 'file', dir: 'd' }), fakeSystem())).toEqual({
      name: 'file',
      explicit: true,
    })
  })

  it.each([
    ['a bad host', { host: 'nope' }],
    ['file without --dir', { host: 'file' }],
    ['--dir without file', { dir: 'd' }],
  ])('refuses %s as usage', (_name, flags) => {
    expect(() => selectHost(parsed(flags), fakeSystem())).toThrow(
      expect.objectContaining({ exit: 2 }),
    )
  })
})
