import { type ParsedArgs, parseArgs, wantsJson } from './args.js'
import { bench } from './bench/command.js'
import { catalog, extract, help, render, schema, validate, versionOutcome } from './commands.js'
import { doctor } from './doctor.js'
import type { Io } from './io.js'
import { CliError, EXIT, type ExitCode, type Outcome } from './outcome.js'
import { safe, safeJson } from './print.js'
import { show } from './show.js'
import { viewerCommand } from './viewer-command.js'

function dispatch(parsed: ParsedArgs, io: Io): Outcome | Promise<Outcome> {
  switch (parsed.command) {
    case 'show':
      return show(parsed, io)
    case 'viewer':
      return viewerCommand(parsed, io)
    case 'doctor':
      return doctor(io)
    case 'render':
      return render(parsed, io)
    case 'validate':
      return validate(parsed, io)
    case 'catalog':
      return catalog(parsed)
    case 'schema':
      return schema(io)
    case 'extract':
      return extract(parsed, io)
    case 'bench':
      return bench(parsed, io)
    case 'version':
      return versionOutcome()
    default:
      return help()
  }
}

/** §16 allows exit codes 0 to 5 and no crash, so anything thrown ends up as one of them. */
function failure(error: unknown): Outcome {
  const known = error instanceof CliError
  const code = known ? error.code : 'internal'
  const exit = known ? error.exit : EXIT.io
  const message = known ? error.message : `internal error: ${String(error)}`
  return { exit, stderr: `vui: ${safe(message)}\n`, json: { error: { code, message } } }
}

function print(outcome: Outcome, json: boolean, io: Io): void {
  if (json) {
    io.stdout(`${safeJson({ ok: outcome.exit === EXIT.ok, ...outcome.json })}\n`)
    return
  }
  if (outcome.stdout) io.stdout(outcome.stdout)
  if (outcome.stderr) io.stderr(outcome.stderr)
}

/** The whole CLI but for `process`. Resolves to the exit code and never rejects. */
export async function run(argv: readonly string[], io: Io): Promise<ExitCode> {
  let outcome: Outcome
  try {
    outcome = await dispatch(parseArgs(argv), io)
  } catch (error) {
    outcome = failure(error)
  }
  print(outcome, wantsJson(argv), io)
  return outcome.exit
}
