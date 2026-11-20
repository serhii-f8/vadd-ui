import { suggest } from '@vadd/ui-spec/catalog'
import { usageError } from './outcome.js'

export type Command =
  | 'show'
  | 'viewer'
  | 'doctor'
  | 'render'
  | 'validate'
  | 'catalog'
  | 'schema'
  | 'extract'
  | 'bench'
  | 'help'
  | 'version'

export interface ParsedArgs {
  command: Command
  positional: string[]
  flags: Record<string, string | true>
}

interface CommandSpec {
  values: readonly string[]
  booleans: readonly string[]
  /** How many positional arguments it takes. */
  positional: number
}

const SPECS: Record<Exclude<Command, 'help' | 'version'>, CommandSpec> = {
  show: {
    values: ['title', 'name', 'host', 'dir'],
    booleans: ['no-open', 'replace'],
    positional: 1,
  },
  viewer: { values: ['bind'], booleans: [], positional: 1 },
  doctor: { values: [], booleans: ['quick'], positional: 0 },
  render: { values: ['format', 'out'], booleans: ['cdn'], positional: 1 },
  validate: { values: [], booleans: ['strict'], positional: 1 },
  catalog: { values: [], booleans: [], positional: 1 },
  schema: { values: [], booleans: [], positional: 0 },
  extract: { values: [], booleans: [], positional: 1 },
  bench: { values: [], booleans: [], positional: 1 },
}

const COMMANDS = Object.keys(SPECS)
const JSON_FLAG = '--json'
const END_OF_FLAGS = '--'
const HELP = new Set(['--help', '-h', 'help'])
const VERSION = new Set(['--version', '-v', 'version'])

const beforeEnd = (argv: readonly string[]): readonly string[] => {
  const end = argv.indexOf(END_OF_FLAGS)
  return end === -1 ? argv : argv.slice(0, end)
}

/** Read before parsing, so that a bad argument list still answers in JSON. */
export function wantsJson(argv: readonly string[]): boolean {
  return beforeEnd(argv).some((argument) => {
    return argument === JSON_FLAG || argument.startsWith(`${JSON_FLAG}=`)
  })
}

const isFlag = (argument: string) => argument.length > 1 && argument.startsWith('-')

const quoted = (text: string) => JSON.stringify(text.slice(0, 60))

function unknownCommand(name: string): Error {
  const near = suggest(name, COMMANDS)
  const hint = near === undefined ? '' : ` (did you mean "${near}"?)`
  return usageError(`unknown command ${quoted(name)}${hint}; see vui --help`)
}

function commandOf(first: string | undefined): keyof typeof SPECS {
  if (first === undefined) return failNoCommand()
  if (isFlag(first)) throw usageError(`expected a command before ${quoted(first)}`)
  if (!Object.hasOwn(SPECS, first)) throw unknownCommand(first)
  return first as keyof typeof SPECS
}

function failNoCommand(): never {
  throw usageError('no command given; see vui --help')
}

/** `--name` or `--name=value`, with what it reads as. */
function splitFlag(argument: string): { name: string; inline: string | undefined } {
  const equals = argument.indexOf('=')
  return equals === -1
    ? { name: argument.slice(2), inline: undefined }
    : { name: argument.slice(2, equals), inline: argument.slice(equals + 1) }
}

function parseFlags(command: keyof typeof SPECS, rest: string[]): ParsedArgs {
  const spec = SPECS[command]
  const parsed: ParsedArgs = { command, positional: [], flags: {} }
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index] as string
    if (argument === END_OF_FLAGS) {
      parsed.positional.push(...rest.slice(index + 1))
      break
    }
    if (!isFlag(argument)) {
      parsed.positional.push(argument)
      continue
    }
    const { name, inline } = argument.startsWith('--')
      ? splitFlag(argument)
      : { name: argument, inline: undefined }
    if (spec.booleans.includes(name)) {
      if (inline !== undefined) throw usageError(`--${name} takes no value`)
      parsed.flags[name] = true
    } else if (name === 'json') {
      if (inline !== undefined) throw usageError('--json takes no value')
    } else if (spec.values.includes(name)) {
      const value = inline ?? rest[index + 1]
      if (value === undefined || value === '' || (inline === undefined && isFlag(value))) {
        throw usageError(`--${name} needs a value`)
      }
      if (inline === undefined) index++
      parsed.flags[name] = value
    } else {
      throw usageError(`unknown flag ${quoted(argument)} for ${command}`)
    }
  }
  const extra = parsed.positional[spec.positional]
  if (extra !== undefined) throw usageError(`unexpected argument ${quoted(extra)}`)
  return parsed
}

/** Hand-written, since §3 gives the CLI no other dependency. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = beforeEnd(argv)
  const meta: ParsedArgs = { command: 'help', positional: [], flags: {} }
  if (flags.some((argument) => argument === '--help' || argument === '-h')) return meta
  const operands = argv.filter((argument, index) => argument !== JSON_FLAG || index >= flags.length)
  const [first, ...rest] = operands
  if (first !== undefined && HELP.has(first)) return meta
  if (first !== undefined && VERSION.has(first)) return { ...meta, command: 'version' }
  return parseFlags(commandOf(first), rest)
}
