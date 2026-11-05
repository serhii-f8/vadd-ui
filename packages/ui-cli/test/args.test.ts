import { describe, expect, it } from 'vitest'
import { parseArgs, wantsJson } from '../src/args.js'
import { CliError } from '../src/outcome.js'

function usage(argv: string[]): string {
  try {
    parseArgs(argv)
  } catch (error) {
    expect(error).toBeInstanceOf(CliError)
    expect((error as CliError).exit).toBe(2)
    expect((error as CliError).code).toBe('usage')
    return (error as CliError).message
  }
  throw new Error('no usage error')
}

describe('parseArgs', () => {
  it('reads a command, a file and flags', () => {
    expect(parseArgs(['render', 'a.json', '--format', 'html', '--out', 'b', '--cdn'])).toEqual({
      command: 'render',
      positional: ['a.json'],
      flags: { format: 'html', out: 'b', cdn: true },
    })
  })

  it('reads --flag=value', () => {
    expect(parseArgs(['render', '--format=md']).flags).toEqual({ format: 'md' })
  })

  it('keeps an equals sign in a value', () => {
    expect(parseArgs(['render', '--format=md', '--out=a=b']).flags.out).toBe('a=b')
  })

  it('reads a flag before the file', () => {
    expect(parseArgs(['validate', '--strict', 'a']).positional).toEqual(['a'])
  })

  it('takes - as a file', () => {
    expect(parseArgs(['validate', '-']).positional).toEqual(['-'])
  })

  it('ends flags at --', () => {
    expect(parseArgs(['validate', '--', '--strict']).positional).toEqual(['--strict'])
    expect(parseArgs(['validate', '--', '--strict']).flags).toEqual({})
  })

  it('ignores --json anywhere before --', () => {
    expect(parseArgs(['--json', 'schema']).command).toBe('schema')
    expect(parseArgs(['schema', '--json']).flags).toEqual({})
  })

  it.each([[['--help']], [['-h']], [['help']], [['render', '--help']], [['nonsense', '-h']]])(
    'reads help from %j',
    (argv) => {
      expect(parseArgs(argv).command).toBe('help')
    },
  )

  it.each([[['--version']], [['-v']], [['version']]])('reads version from %j', (argv) => {
    expect(parseArgs(argv).command).toBe('version')
  })

  it('does not read help past --', () => {
    expect(parseArgs(['validate', '--', '-h']).command).toBe('validate')
  })

  it('refuses no command', () => {
    expect(usage([])).toContain('command')
    expect(usage(['--json'])).toContain('command')
  })

  it('refuses a flag where the command belongs', () => {
    expect(usage(['--strict', 'validate'])).toContain('--strict')
  })

  it('refuses an unknown command, with a suggestion', () => {
    expect(usage(['rendr'])).toContain('did you mean "render"?')
    expect(usage(['show'])).toContain('unknown command "show"')
  })

  it('refuses an inherited name', () => {
    expect(usage(['constructor'])).toContain('unknown command')
  })

  it('refuses an unknown flag', () => {
    expect(usage(['validate', '--nope'])).toContain('--nope')
    expect(usage(['validate', '-x'])).toContain('-x')
  })

  it('refuses a flag of another command', () => {
    expect(usage(['validate', '--format', 'md'])).toContain('--format')
    expect(usage(['schema', '--strict'])).toContain('--strict')
  })

  it('refuses a value flag with no value', () => {
    expect(usage(['render', '--format'])).toContain('--format')
    expect(usage(['render', '--format', '--out', 'a'])).toContain('--format')
    expect(usage(['render', '--format='])).toContain('--format')
  })

  it('refuses a value on a boolean flag', () => {
    expect(usage(['validate', '--strict=yes'])).toContain('--strict')
    expect(usage(['validate', '--json=yes'])).toContain('--json')
  })

  it('refuses extra arguments', () => {
    expect(usage(['validate', 'a', 'b'])).toContain('"b"')
    expect(usage(['schema', 'a'])).toContain('"a"')
    expect(usage(['catalog', 'a', 'b'])).toContain('"b"')
  })
})

describe('wantsJson', () => {
  it('finds the flag before --', () => {
    expect(wantsJson(['--json'])).toBe(true)
    expect(wantsJson(['render', '--bad', '--json'])).toBe(true)
    expect(wantsJson(['render', '--', '--json'])).toBe(false)
    expect(wantsJson(['render'])).toBe(false)
  })

  it('answers in JSON even for a bad --json', () => {
    expect(wantsJson(['validate', '--json=1'])).toBe(true)
  })
})
