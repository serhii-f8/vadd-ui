import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readSkill } from './helpers.js'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const blocks = [...readme.matchAll(/^```sh\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? '')

const scratch: string[] = []

function temporary(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vui-skill-'))
  scratch.push(dir)
  return dir
}

/** HOME and PROJECT are temporary, so no run can touch a real skills directory. */
function runBlock(block: string, env: { HOME: string; PROJECT: string }): void {
  execFileSync('sh', ['-eu', '-c', block], { cwd: repoRoot, env: { ...process.env, ...env } })
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true })
})

describe('install', () => {
  const personal = blocks.find((block) => block.includes('~/.claude/skills/'))
  const project = blocks.find((block) => block.includes('$PROJECT/.claude/skills/'))

  it('documents both places', () => {
    expect(personal).toBeDefined()
    expect(project).toBeDefined()
  })

  it('installs for the user', () => {
    const [HOME, PROJECT] = [temporary(), temporary()]
    runBlock(personal ?? 'false', { HOME, PROJECT })
    const installed = join(HOME, '.claude/skills/vadd-ui/SKILL.md')
    expect(readFileSync(installed, 'utf8')).toBe(readSkill())
    expect(existsSync(join(PROJECT, '.claude'))).toBe(false)
  })

  it('installs for a project', () => {
    const [HOME, PROJECT] = [temporary(), temporary()]
    runBlock(project ?? 'false', { HOME, PROJECT })
    const installed = join(PROJECT, '.claude/skills/vadd-ui/SKILL.md')
    expect(readFileSync(installed, 'utf8')).toBe(readSkill())
    expect(existsSync(join(HOME, '.claude'))).toBe(false)
  })
})
