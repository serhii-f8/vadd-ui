import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Runs a check script the way the gate does and returns its exit code and combined output. */
export function run(script: string, ...args: string[]): { code: number | null; out: string } {
  const result = spawnSync(process.execPath, [`${repoRoot}scripts/${script}`, ...args], {
    encoding: 'utf8',
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}
