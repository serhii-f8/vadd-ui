import { LIMITS } from '@vadd/ui-spec'
import type { ParsedArgs } from './args.js'
import { refused } from './commands.js'
import { type HostChoice, type HostName, selectHost } from './host/select.js'
import { readInput } from './input.js'
import type { Io } from './io.js'
import { noHost, type Outcome } from './outcome.js'
import { inputTooLarge, type Overrides, prepare } from './pipeline.js'
import type { System } from './system.js'
import { type Delivery, deliverToViewer, viewerOverrides } from './viewer/deliver.js'

interface Adapter {
  /** What this host adds to a document before the size check. */
  overrides: (system: System) => Overrides
  deliver: (delivery: Delivery) => Promise<Outcome>
}

const VIEWER: Adapter = { overrides: viewerOverrides, deliver: deliverToViewer }

/** Task 16 adds `orca-chat` and `file` here. */
const ADAPTERS: Partial<Record<HostName, Adapter>> = { viewer: VIEWER }

function adapterFor({ name, explicit }: HostChoice): Adapter {
  const adapter = ADAPTERS[name]
  if (adapter !== undefined) return adapter
  if (explicit) throw noHost(`host ${name} is not available in this version`)
  // §4.0: the next host in the order, which is the Viewer.
  return VIEWER
}

/** Validate, then deliver. Exits 1 to 3 therefore touch no host. */
export async function show(parsed: ParsedArgs, io: Io): Promise<Outcome> {
  const { system } = io
  const adapter = adapterFor(selectHost(parsed, system))
  const input = await readInput(parsed.positional[0], io.stdin, LIMITS.inputBytes)
  if (input.tooLarge) return refused([inputTooLarge()], 'stderr')
  const { title } = parsed.flags
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
    system,
  })
}
