import type { System } from './system.js'

export interface Environment {
  kind: 'native' | 'wsl' | 'ssh' | 'container'
  distro?: string
}

export type NetworkingMode = 'nat' | 'mirrored' | 'unknown'

const WSL_INTEROP = '/proc/sys/fs/binfmt_misc/WSLInterop'
const CONTAINER_RUNTIME = /docker|containerd|kubepods|podman|lxc/

/** §11.1. It only changes hints and how a browser opens, never the format or validation. */
export function detectEnvironment({ env, exists, read }: System): Environment {
  const { WSL_DISTRO_NAME: distro, SSH_CONNECTION: ssh } = env
  if (distro) return { kind: 'wsl', distro }
  if (exists(WSL_INTEROP)) return { kind: 'wsl' }
  if (ssh) return { kind: 'ssh' }
  if (exists('/.dockerenv') || CONTAINER_RUNTIME.test(read('/proc/1/cgroup') ?? '')) {
    return { kind: 'container' }
  }
  return { kind: 'native' }
}

/** For `doctor`'s fix only: the check itself is the same under both. */
export async function networkingMode(system: System): Promise<NetworkingMode> {
  const { stdout } = await system.exec('wslinfo', ['--networking-mode'])
  const mode = stdout.trim()
  return mode === 'nat' || mode === 'mirrored' ? mode : 'unknown'
}
