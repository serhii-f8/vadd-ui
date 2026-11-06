import { describe, expect, it } from 'vitest'
import { detectEnvironment, networkingMode } from '../src/environment.js'
import { fakeSystem } from './helpers.js'

describe('detectEnvironment', () => {
  it('is native with nothing to go on', () => {
    expect(detectEnvironment(fakeSystem())).toEqual({ kind: 'native' })
  })

  it('reads WSL from the interop file', () => {
    const system = fakeSystem({ files: { '/proc/sys/fs/binfmt_misc/WSLInterop': 'enabled' } })
    expect(detectEnvironment(system).kind).toBe('wsl')
  })

  it('reads WSL and the distro from WSL_DISTRO_NAME', () => {
    const system = fakeSystem({ env: { WSL_DISTRO_NAME: 'Ubuntu-22.04' } })
    expect(detectEnvironment(system)).toEqual({ kind: 'wsl', distro: 'Ubuntu-22.04' })
  })

  it('reads SSH from SSH_CONNECTION', () => {
    const system = fakeSystem({ env: { SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' } })
    expect(detectEnvironment(system).kind).toBe('ssh')
  })

  it('reads a container from /.dockerenv', () => {
    expect(detectEnvironment(fakeSystem({ files: { '/.dockerenv': '' } })).kind).toBe('container')
  })

  it.each(['docker', 'containerd', 'kubepods', 'podman', 'lxc'])(
    'reads a container from a %s cgroup',
    (runtime) => {
      const files = { '/proc/1/cgroup': `0::/${runtime}/abc\n` }
      expect(detectEnvironment(fakeSystem({ files })).kind).toBe('container')
    },
  )

  it('ignores a plain cgroup', () => {
    const files = { '/proc/1/cgroup': '0::/init.scope\n' }
    expect(detectEnvironment(fakeSystem({ files })).kind).toBe('native')
  })
})

describe('networkingMode', () => {
  it.each([
    ['nat\n', 'nat'],
    ['mirrored\n', 'mirrored'],
    ['virtioproxy\n', 'unknown'],
  ])('reads %j as %s', async (stdout, mode) => {
    const system = fakeSystem({ exec: () => ({ ok: true, stdout }) })
    expect(await networkingMode(system)).toBe(mode)
  })

  it('is unknown without wslinfo', async () => {
    const system = fakeSystem({ exec: () => ({ ok: false, missing: true }) })
    expect(await networkingMode(system)).toBe('unknown')
  })
})
