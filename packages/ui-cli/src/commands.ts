import { version } from '@vadd/ui'
import { type Diagnostic, type JsonValue, LIMITS, parse } from '@vadd/ui-spec'
import {
  CATALOG,
  type CatalogEntry,
  type CatalogField,
  COMMON_FIELDS,
  findComponent,
  suggest,
} from '@vadd/ui-spec/catalog'
import type { ParsedArgs } from './args.js'
import { findDocuments, locate } from './extract.js'
import { type Input, readInput } from './input.js'
import type { Io } from './io.js'
import { CliError, EXIT, type Outcome, usageError } from './outcome.js'
import { FORMATS, OUTPUT_LIMIT, type OutputFormat, renderOutput, writeOutput } from './output.js'
import { exitCodeOf, inputTooLarge, prepare } from './pipeline.js'
import { formatDiagnostics, safe, safeJson } from './print.js'

const USAGE = `vui: show a VUI document, or render it without a host

vui show [file|-] [--title T] [--name N] [--host auto|viewer|orca-chat|file] [--dir D] [--no-open]
vui viewer start|stop|status|open|url [--bind A]
vui doctor
vui render [file|-] --format html|md|text [--out F] [--cdn]
vui validate [file|-] [--strict]
vui catalog [component]
vui schema
vui extract [file.html|-]
vui bench [dir]

Stdin is read when the file is - or omitted. --json works on every command.
Exit codes: 0 ok, 1 invalid, 2 parse or usage, 3 limit, 4 no host, 5 I/O.
`

const STDOUT = '-'
const LISTED_DOCUMENTS = 5

const COMPONENT_NAMES: readonly string[] = CATALOG.map(({ name }) => name)

async function readDocument(parsed: ParsedArgs, io: Io): Promise<Input> {
  return readInput(parsed.positional[0], io.stdin, LIMITS.inputBytes)
}

function formatOf(parsed: ParsedArgs): OutputFormat {
  const format = parsed.flags.format
  if (FORMATS.includes(format as OutputFormat)) return format as OutputFormat
  throw usageError(`--format must be one of ${FORMATS.join('|')}`)
}

export function refused(diagnostics: Diagnostic[], print: 'stdout' | 'stderr'): Outcome {
  return {
    exit: exitCodeOf(diagnostics),
    [print]: formatDiagnostics(diagnostics),
    json: { diagnostics },
  }
}

/** §11.4, for anything that would write this many bytes. */
export function outputTooLarge(bytes: number, diagnostics: Diagnostic[]): Outcome {
  const message = `output is ${bytes} bytes; the limit is ${OUTPUT_LIMIT}`
  return {
    exit: EXIT.limit,
    stderr: `${formatDiagnostics(diagnostics)}error: ${message}\n`,
    json: { diagnostics, error: { code: 'limit-output-size', message } },
  }
}

export async function render(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const format = formatOf(parsed)
  const cdn = parsed.flags.cdn === true
  if (cdn && format !== 'html') throw usageError('--cdn only applies to --format html')
  const input = await readDocument(parsed, io)
  if (input.tooLarge) return refused([inputTooLarge()], 'stderr')
  const { diagnostics, document } = prepare(input.text, io.now())
  if (document === undefined) return refused(diagnostics, 'stderr')

  const output = renderOutput(document, { format, cdn, readBundle: io.readBundle })
  const warnings = formatDiagnostics(diagnostics)
  const bytes = Buffer.byteLength(output)
  if (bytes > OUTPUT_LIMIT) return outputTooLarge(bytes, diagnostics)
  const out = parsed.flags.out
  if (typeof out !== 'string' || out === STDOUT) {
    return {
      exit: EXIT.ok,
      stdout: output,
      stderr: warnings,
      json: { format, diagnostics, output },
    }
  }
  writeOutput(out, output)
  return {
    exit: EXIT.ok,
    stdout: `vui: wrote ${safe(out)} (${bytes} bytes)\n`,
    stderr: warnings,
    json: { format, diagnostics, out, bytes },
  }
}

export async function validate(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const strict = parsed.flags.strict === true
  const input = await readDocument(parsed, io)
  const { diagnostics } = input.tooLarge
    ? { diagnostics: [inputTooLarge()] }
    : prepare(input.text, io.now())
  return {
    exit: exitCodeOf(diagnostics, strict),
    stdout: formatDiagnostics(diagnostics, { info: strict }),
    json: { diagnostics },
  }
}

/** VD-153: no indent. `cl100k_base` spends a token on each one, and the headers already group. */
function fieldLine({ name, type, required, default: value, kinds }: CatalogField): string {
  const presence = required ? ', required' : value === undefined ? '' : `, default ${value}`
  const scope = kinds === undefined ? '' : ` (${kinds.join('|')})`
  return `${name}: ${type}${presence}${scope}\n`
}

function entryText(entry: CatalogEntry): string {
  const shapes = entry.shapes.map(({ name, fields }) => {
    return `${name}:\n${fields.map(fieldLine).join('')}`
  })
  return [
    `${entry.name}: ${entry.summary}\n`,
    `fields:\n${entry.fields.map(fieldLine).join('')}`,
    ...shapes,
    `common: ${COMMON_FIELDS.join(', ')}\n`,
    `example: ${JSON.stringify(entry.example)}\n`,
  ].join('')
}

function unknownComponent(name: string): CliError {
  const near = suggest(name.slice(0, 40), COMPONENT_NAMES)
  const hint = near === undefined ? '' : ` (did you mean "${near}"?)`
  return usageError(`unknown component ${JSON.stringify(name.slice(0, 60))}${hint}`)
}

export function catalog(parsed: ParsedArgs): Outcome {
  const name = parsed.positional[0]
  if (name === undefined) {
    const width = Math.max(...COMPONENT_NAMES.map((item) => item.length))
    const lines = CATALOG.map((entry) => `${entry.name.padEnd(width)}  ${entry.summary}\n`)
    const components = CATALOG.map(({ name: item, group, summary }) => {
      return { name: item, group, summary }
    })
    return { exit: EXIT.ok, stdout: lines.join(''), json: { components } }
  }
  const entry = findComponent(name)
  if (entry === undefined) throw unknownComponent(name)
  return { exit: EXIT.ok, stdout: entryText(entry), json: { component: entry } }
}

/** Exactly what `vui catalog <name>` prints, which §14.2 budgets. */
export function catalogText(name: string): string {
  const entry = findComponent(name)
  if (entry === undefined) throw unknownComponent(name)
  return entryText(entry)
}

export function schema(io: Io): Outcome {
  let text: string
  try {
    text = io.readSchema()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(EXIT.io, 'io', `cannot read the schema: ${reason}`)
  }
  return { exit: EXIT.ok, stdout: text, json: { schema: JSON.parse(text) } }
}

function embeddedText(html: string): { text: string; offset: number } {
  const documents = findDocuments(html)
  const [first] = documents
  if (first === undefined) throw new CliError(EXIT.parse, 'no-document', 'no embedded document')
  if (documents.length === 1) return first
  // §10.1 makes the file the single source of truth, so a pick here would lose content.
  const listed = documents.slice(0, LISTED_DOCUMENTS)
  const lines = listed.map(({ offset }) => locate(html, offset).line).join(', ')
  const rest = documents.length - listed.length
  const more = rest === 0 ? '' : ` and ${rest} more`
  const count = `${documents.length} embedded documents`
  const message = `${count}, at lines ${lines}${more}; a visual file holds one`
  throw new CliError(EXIT.parse, 'several-documents', message)
}

function parsedDocument(html: string): JsonValue {
  const { text, offset } = embeddedText(html)
  const parsed = parse(text)
  if (parsed.ok) return parsed.value
  const { code, message, offset: inner } = parsed.error
  const { line, column } = locate(html, offset + inner)
  const located = `line ${line}, column ${column}: ${message}`
  if (code === 'too-deep') throw new CliError(EXIT.limit, 'limit-depth', located)
  throw new CliError(EXIT.parse, 'parse-error', located)
}

export async function extract(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const input = await readInput(parsed.positional[0], io.stdin, OUTPUT_LIMIT)
  if (input.tooLarge) {
    const message = `file is over the limit of ${OUTPUT_LIMIT} bytes`
    throw new CliError(EXIT.limit, 'limit-file-size', message)
  }
  const document = parsedDocument(input.text)
  return { exit: EXIT.ok, stdout: `${safeJson(document)}\n`, json: { document } }
}

export function help(): Outcome {
  return { exit: EXIT.ok, stdout: USAGE, json: { usage: USAGE } }
}

export function versionOutcome(): Outcome {
  return { exit: EXIT.ok, stdout: `${version}\n`, json: { version } }
}
