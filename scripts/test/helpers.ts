import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Runs a check script the way the gate does and returns its exit code and combined output. */
export function run(script: string, ...args: string[]): { code: number | null; out: string } {
  const result = spawnSync(process.execPath, [`${repoRoot}scripts/${script}`, ...args], {
    encoding: 'utf8',
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

/** Copies every manifest and tsconfig the checks read into a temporary tree. */
export function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'vui-workspace-'))
  const files = readdirSync(repoRoot).filter((name) => /^(package|tsconfig\..*)\.json$/.test(name))
  for (const dir of [...readdirSync(`${repoRoot}packages`).map((name) => `packages/${name}`)]) {
    files.push(`${dir}/package.json`, `${dir}/tsconfig.json`)
  }
  files.push('skills/vadd-ui/package.json')
  for (const file of files) cpSync(`${repoRoot}${file}`, join(root, file))
  return root
}

/** Rewrites one JSON file in a temporary tree. */
export function editJson(
  root: string,
  file: string,
  change: (json: Record<string, unknown>) => void,
): void {
  const path = join(root, file)
  const json = JSON.parse(readFileSync(path, 'utf8'))
  change(json)
  writeFileSync(path, JSON.stringify(json))
}
