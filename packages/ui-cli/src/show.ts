import { LIMITS } from '@vadd/ui-spec'
import type { ParsedArgs } from './args.js'
import { refused } from './commands.js'
import { deliverToChat, deliverToDirectory, fileOverrides } from './host/file.js'
import { type HostName, selectHost } from './host/select.js'
import { readInput } from './input.js'
import type { Io } from './io.js'
import { type Outcome, usageError } from './outcome.js'
import { inputTooLarge, type Overrides, prepare } from './pipeline.js'
import type { System } from './system.js'
import { type Delivery, deliverToViewer, viewerOverrides } from './viewer/deliver.js'

interface Adapter {
  /** What this host adds to a document before the size check. */
  overrides: (system: System) => Overrides
  deliver: (delivery: Delivery) => Promise<Outcome>
}

const ADAPTERS: Record<HostName, Adapter> = {
  viewer: { overrides: viewerOverrides, deliver: deliverToViewer },
  'orca-chat': { overrides: fileOverrides, deliver: deliverToChat },
  file: { overrides: fileOverrides, deliver: deliverToDirectory },
}

/** Validate, then deliver. Exits 1 to 3 therefore touch no host. */
export async function show(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const { system } = io
  const replace = parsed.flags.replace === true
  if (replace && parsed.flags.name === undefined) throw usageError('--replace needs --name')
  const adapter = ADAPTERS[selectHost(parsed, system).name]
  const input = await readInput(parsed.positional[0], io.stdin, LIMITS.inputBytes)
  if (input.tooLarge) return refused([inputTooLarge()], 'stderr')
  const { title, name, dir } = parsed.flags
  const overrides = {
    ...adapter.overrides(system),
    ...(typeof title === 'string' ? { title } : {}),
  }
  const { diagnostics, document } = prepare(input.text, io.now(), overrides)
  if (document === undefined) return refused(diagnostics, 'stderr')
  return adapter.deliver({
    document,
    diagnostics,
    noOpen: parsed.flags['no-open'] === true,
    replace,
    system,
    readBundle: io.readBundle,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof dir === 'string' ? { dir } : {}),
  })
}
