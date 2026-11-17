import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORCA_THEME_TOKENS } from '../../packages/ui-spec/src/host/orca.js'
import {
  CONTRACT,
  compareConstants,
  compareTokenSets,
  helpFindings,
  skillTokens,
} from '../lib/orca-contract.mjs'
import { repoRoot, run } from './helpers.js'

const SKILL = readFileSync(`${repoRoot}scripts/test/fixtures/orca/SKILL.md`, 'utf8')
const SKILL_PATH = 'resources/native-chat-visuals/skills/orca-chat-visuals/SKILL.md'
const DIRECTIVE = 'src/shared/native-chat/visuals/native-chat-visual-directive.ts'

/** An Orca checkout as far as the check reads it: the vendored sources and the skill excerpt. */
function orcaTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'vui-orca-'))
  cpSync(`${repoRoot}e2e/harness/orca/src`, join(root, 'src'), { recursive: true })
  mkdirSync(join(root, SKILL_PATH, '..'), { recursive: true })
  writeFileSync(join(root, SKILL_PATH), SKILL)
  return root
}

describe('CONTRACT', () => {
  it('names the ten constants e2e/orca-chat.spec.ts compares', () => {
    expect(CONTRACT).toHaveLength(10)
    expect(CONTRACT.map(([ours]) => ours)).toContain('ORCA_THEME_TOKENS')
  })
})

describe('compareConstants', () => {
  const ours = { ORCA_FILE_MAX: 128, ORCA_CDN_ORIGINS: ['a', 'b'] }
  const pairs: [string, string][] = [
    ['ORCA_FILE_MAX', 'NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH'],
    ['ORCA_CDN_ORIGINS', 'NATIVE_CHAT_VISUAL_CDN_ORIGINS'],
  ]

  it('finds nothing when every value agrees', () => {
    const theirs = {
      NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH: 128,
      NATIVE_CHAT_VISUAL_CDN_ORIGINS: ['a', 'b'],
    }
    expect(compareConstants(ours, theirs, pairs)).toEqual([])
  })

  it('names both sides of a changed value', () => {
    const theirs = {
      NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH: 96,
      NATIVE_CHAT_VISUAL_CDN_ORIGINS: ['b', 'a'],
    }
    const findings = compareConstants(ours, theirs, pairs)
    expect(findings).toHaveLength(2)
    expect(findings[0]).toBe('ORCA_FILE_MAX is 128, Orca NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH is 96')
  })

  it('reports a constant Orca renamed instead of passing undefined against undefined', () => {
    const findings = compareConstants({ ORCA_FILE_MAX: undefined }, {}, [
      pairs[0] as [string, string],
    ])
    expect(findings).toEqual(['NATIVE_CHAT_VISUAL_FILE_MAX_LENGTH: missing in Orca'])
  })
})

describe('skillTokens', () => {
  it('reads the token bullet, expanding the chart range', () => {
    expect(new Set(skillTokens(SKILL))).toEqual(new Set(ORCA_THEME_TOKENS))
  })

  it('is empty without the bullet', () => {
    expect(skillTokens('# nothing here')).toEqual([])
  })
})

describe('compareTokenSets', () => {
  it('ignores order and names what differs', () => {
    expect(compareTokenSets(['--a', '--b'], ['--b', '--a'])).toEqual([])
    expect(compareTokenSets(['--a', '--b'], ['--a', '--c'])).toEqual([
      'skill token list lacks --b',
      'skill token list adds --c',
    ])
  })

  it('treats an empty skill list as a finding', () => {
    expect(compareTokenSets(['--a'], [])).toEqual(['skill token list not found'])
  })
})

describe('helpFindings', () => {
  it('accepts help naming both flags', () => {
    expect(helpFindings('Usage: orca tab create [--url <url>] [--split <right|left>]')).toEqual([])
  })

  it('names a missing flag', () => {
    expect(helpFindings('Usage: orca tab create [--url <url>]')).toEqual([
      'orca tab create --help no longer lists --split',
    ])
  })
})

describe('check-orca-contract.mjs', () => {
  it('passes an Orca tree that matches', () => {
    const { code, out } = run('check-orca-contract.mjs', '--orca', orcaTree())
    expect(out).toContain('check-orca-contract: 10 constants and 27 skill tokens match')
    expect(code).toBe(0)
  })

  it('fails when Orca changes a limit', () => {
    const root = orcaTree()
    const file = join(root, DIRECTIVE)
    const source = readFileSync(file, 'utf8')
    expect(source).toContain('NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH = 120')
    writeFileSync(
      file,
      source.replace(
        'NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH = 120',
        'NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH = 100',
      ),
    )
    const { code, out } = run('check-orca-contract.mjs', '--orca', root)
    expect(out).toContain('ORCA_TITLE_MAX is 120, Orca NATIVE_CHAT_VISUAL_TITLE_MAX_LENGTH is 100')
    expect(code).toBe(1)
  })

  it('runs the help check through --orca-cli', () => {
    const fake = join(mkdtempSync(join(tmpdir(), 'vui-orca-cli-')), 'orca.mjs')
    writeFileSync(fake, "console.log('Usage: orca tab create [--url <url>]')\n")
    const { code, out } = run(
      'check-orca-contract.mjs',
      '--orca',
      orcaTree(),
      '--orca-cli',
      `${process.execPath} ${fake}`,
    )
    expect(out).toContain('no longer lists --split')
    expect(code).toBe(1)
  })

  it('still reads the layout before Orca moved the files into visuals/', () => {
    const root = orcaTree()
    const flat = join(root, 'src/shared/native-chat')
    // One level up, so a relative import loses a `../`, as it was before the move.
    for (const name of ['native-chat-visual-directive.ts', 'native-chat-visual-shell.ts']) {
      const moved = join(flat, 'visuals', name)
      writeFileSync(
        join(flat, name),
        readFileSync(moved, 'utf8').replaceAll("from '../../", "from '../"),
      )
      rmSync(moved)
    }
    const { code, out } = run('check-orca-contract.mjs', '--orca', root)
    expect(out).toContain('check-orca-contract: 10 constants and 27 skill tokens match')
    expect(code).toBe(0)
  })

  it('fails, naming the file, when Orca moves the sources again', () => {
    const root = orcaTree()
    const visuals = join(root, 'src/shared/native-chat/visuals')
    renameSync(join(visuals, 'native-chat-visual-directive.ts'), join(visuals, 'moved.ts'))
    const { code, out } = run('check-orca-contract.mjs', '--orca', root)
    expect(out).toContain('native-chat-visual-directive.ts is not where it was')
    expect(code).toBe(1)
  })

  it('refuses a missing checkout', () => {
    expect(run('check-orca-contract.mjs').code).toBe(2)
  })
})
