import { readdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import { type Io, run } from '@vadd/ui-cli'
import { FORMAT_NAMES, STATUSES, TONES, validateText } from '@vadd/ui-spec'
import { CATALOG } from '@vadd/ui-spec/catalog'
import { parseDirectiveLine } from '@vadd/ui-spec/host/orca'
import { describe, expect, it } from 'vitest'
import { CLAUSES, wording } from './clauses.js'
import {
  directives,
  estimateTokens,
  fences,
  flags,
  heredocs,
  labelled,
  normalize,
  readSkill,
  readSpec,
  specSection,
  splitFrontmatter,
  TOKEN_BUDGET,
  TOKEN_GATE,
  vuiCommands,
  vuiScripts,
  withinTokenGate,
} from './helpers.js'

const skill = readSkill()
const { frontmatter, body } = splitFrontmatter(skill)
const spec = readSpec()

async function vuiHelp(): Promise<string> {
  let stdout = ''
  const io = {
    stdin: Readable.from([]),
    stdout: (text: string) => {
      stdout += text
    },
    stderr: () => {},
  } as unknown as Io
  expect(await run(['--help'], io)).toBe(0)
  return stdout
}

describe('§12.1 structure', () => {
  it('has the exact frontmatter', () => {
    const block = /```yaml\n([\s\S]*?)\n```/.exec(specSection(spec, '### 12.1 Structure'))
    expect(frontmatter).toBe(block?.[1])
  })

  it('has no reference folder', () => {
    expect(readdirSync(new URL('..', import.meta.url))).not.toContain('reference')
  })

  it('keeps the §12.1 parts in order', () => {
    expect([...body.matchAll(/^## (.+)$/gm)].map((match) => match[1])).toEqual([
      'Procedure',
      'Cheat-sheet',
      'Rules',
      'CDN template',
      'Precedence',
    ])
  })

  it('stands alone, so that copying the one file is enough', () => {
    expect(body).not.toMatch(/\]\(\.{0,2}\/|reference\//)
  })
})

describe('§14.2 size', () => {
  it(`stays under ${TOKEN_GATE} estimated tokens`, () => {
    expect(estimateTokens(skill).estimate).toBeLessThanOrEqual(TOKEN_GATE)
    expect(withinTokenGate(skill)).toBe(true)
  })

  it('keeps the headroom below the §14.2 budget', () => {
    expect(TOKEN_GATE).toBeLessThan(TOKEN_BUDGET)
  })

  it('fails a text over budget', () => {
    expect(withinTokenGate(`${skill}\n${'one more line of rules\n'.repeat(120)}`)).toBe(false)
  })

  it('counts by the larger estimate', () => {
    const json = "{a:'b',c:[1,2],d:{e:'f'}}".repeat(40)
    const prose = 'the quick brown fox jumps over the lazy dog '.repeat(40)
    const dense = estimateTokens(json)
    const plain = estimateTokens(prose)
    expect(dense.estimate).toBe(dense.fromCl100k)
    expect(plain.estimate).toBe(plain.fromChars)
  })
})

describe('examples', () => {
  const documents = [...heredocs(skill), ...vuiScripts(skill)]

  it('has a shell example and a CDN example', () => {
    expect(heredocs(skill).length).toBeGreaterThan(0)
    expect(vuiScripts(skill).length).toBeGreaterThan(0)
  })

  it('leaves no fence holding something the document checks cannot see', () => {
    const seen = fences(skill).map((fence) => heredocs(fence).length + vuiScripts(fence).length)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((count) => count > 0)).toBe(true)
  })

  it.each(documents.map((document) => [document.slice(0, 40), document] as const))(
    'validates clean: %s',
    (_, document) => {
      const { ok, diagnostics } = validateText(document)
      expect(diagnostics).toEqual([])
      expect(ok).toBe(true)
    },
  )

  it.each(['delta: -3', "format: 'pct'", "status: 'ok', ms:", "status: 'fail', output:"])(
    'teaches %s',
    (field) => {
      expect(heredocs(skill).join('\n')).toContain(field)
    },
  )

  it('catches a bad document', () => {
    const broken = (heredocs(skill)[0] ?? '').replace("'table'", "'tabel'")
    expect(validateText(broken).ok).toBe(false)
  })

  it('writes directives Orca can parse', () => {
    const lines = directives(skill)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(parseDirectiveLine(line), line).not.toBeNull()
  })

  it('keeps the fixed lines of the §10.2 template', () => {
    const template = /```html\n([\s\S]*?)\n```/.exec(specSection(spec, '### 10.2 CDN template'))
    const [doctype, script, opening] = (template?.[1] ?? '').split('\n')
    const fence = fences(skill).find((text) => text.includes('<!doctype')) ?? ''
    const lines = fence.trimEnd().split('\n')
    expect(lines.length).toBe(3)
    expect(lines[0]).toBe(doctype)
    expect(lines[1]).toBe(script)
    expect(lines[2]?.startsWith((opening ?? '').split('{')[0] ?? '-')).toBe(true)
    expect(lines[2]?.endsWith('</script>')).toBe(true)
  })
})

describe('the cheat-sheet follows the code', () => {
  const inExample = [
    ...heredocs(skill)
      .join('\n')
      .matchAll(/type: '([a-z]+)'/g),
  ].map((match) => match[1])
  const others = labelled(body, 'Other types')

  it('names every catalog type', () => {
    expect([...new Set([...inExample, ...others])].sort()).toEqual(
      CATALOG.map(({ name }) => name).sort(),
    )
  })

  it('does not list a type twice', () => {
    expect(others.filter((type) => inExample.includes(type))).toEqual([])
  })

  it('lists exactly the statuses, tones and formats', () => {
    expect(labelled(body, 'Statuses').sort()).toEqual([...STATUSES].sort())
    expect(labelled(body, 'Tones').sort()).toEqual([...TONES].sort())
    expect(labelled(body, 'Formats').sort()).toEqual([...FORMAT_NAMES].sort())
  })

  it('tells the truth about year-like keys', () => {
    const derived = validateText("[{type: 'table', rows: [{Service: 'a', '2024': 1}]}]")
    const explicit = validateText(
      "[{type: 'table', columns: ['Service', '2024'], rows: [{Service: 'a', '2024': 1}]}]",
    )
    const firstColumn = (result: typeof derived) =>
      JSON.stringify(result.document).match(/"columns":\[\{"key":"([^"]+)"/)?.[1]
    expect(firstColumn(derived)).toBe('2024')
    expect(firstColumn(explicit)).toBe('Service')
  })
})

describe('commands', () => {
  it('names only commands in --help', async () => {
    const help = await vuiHelp()
    const known = vuiCommands(help)
    expect(vuiCommands(skill).length).toBeGreaterThan(0)
    expect(vuiCommands(skill).filter((name) => !known.includes(name))).toEqual([])
  })

  it('names only flags in --help', async () => {
    const known = flags(await vuiHelp())
    expect(flags(skill).length).toBeGreaterThan(0)
    expect(flags(skill).filter((flag) => !known.includes(flag))).toEqual([])
  })

  it('catches a command that does not exist', async () => {
    const known = vuiCommands(await vuiHelp())
    expect(known).toContain('catalog')
    expect(known).not.toContain('publish')
    expect(vuiCommands('run `vui publish` now')).toEqual(['publish'])
  })
})

const HOST_SENTENCES = [
  '12.2.1 no branch',
  '12.2.6 fallback',
  '12.4 orca skill',
  '12.4 raw html',
].map((id) => wording(CLAUSES.find((clause) => clause.id === id) ?? { id }))

const HOST_TERMS =
  /\b(wsl|ssh|orca|tmux|localhost|container|devcontainer|windows|linux|macos|uname|hostname|printenv)\b|127\.0\.0\.1|_DISTRO|[A-Z]+_[A-Z_]+|\$[A-Z]|--host|--dir|--no-open|vui viewer|vui doctor/i

/** The sentences the spec requires are allowed; anything else about a host is a branch. */
function hostTerms(text: string): string[] {
  let rest = normalize(text)
  for (const sentence of HOST_SENTENCES) rest = rest.replaceAll(sentence, ' ')
  rest = rest.replaceAll('::orca-visual', ' ').replaceAll("Orca's built-in skill", ' ')
  return [...rest.matchAll(new RegExp(HOST_TERMS, 'gi'))].map((match) => match[0])
}

describe('host neutrality', () => {
  it('never branches on WSL, SSH or Orca mode', () => {
    expect(hostTerms(body)).toEqual([])
  })

  it.each([
    'If you are in WSL, open the URL by hand.',
    'Over SSH, forward the port first.',
    'In Orca chat, paste the line.',
    'Run `vui viewer open` to see it.',
    'Pass `--host viewer` when unsure.',
    'Check `WSL_DISTRO_NAME` first.',
    'Use `$ORCA_CHAT_SCRATCH_DIR` to pick the folder.',
  ])('catches %s', (sentence) => {
    expect(hostTerms(`${body}\n${sentence}`).length).toBeGreaterThan(0)
  })

  it('reads the scratch variable only to find a fallback for a missing CLI', () => {
    const uses = normalize(body).split('ORCA_CHAT_SCRATCH_DIR').length - 1
    expect(uses).toBe(1)
  })
})
