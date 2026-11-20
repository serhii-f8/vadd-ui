import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { directiveLine } from '@vadd/ui-spec/host/orca'
import { slugify } from '@vadd/ui-viewer'
import { outputTooLarge } from '../commands.js'
import { ioReason } from '../io-error.js'
import { CliError, EXIT, noHost, type Outcome } from '../outcome.js'
import { OUTPUT_LIMIT, renderOutput } from '../output.js'
import type { Overrides } from '../pipeline.js'
import { formatDiagnostics, safe } from '../print.js'
import type { System } from '../system.js'
import { type Delivery, type Mirror, mirrorToViewer } from '../viewer/deliver.js'

const NAME_TRIES = 16

/** VD-123: a file holds no local path, not even one the document claims. */
export function fileOverrides(): Overrides {
  return { meta: { cwd: undefined, branch: undefined } }
}

interface Written {
  file: string
  path: string
}

/** Removes only its own file: `wx` got past `EEXIST`, so anything left there is this write's. */
function discard(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // The directive was never printed, so nothing will read what is left.
  }
}

/** `wx`: a collision fails instead of overwriting, and a planted symlink is not followed. */
function writeNew(dir: string, slug: string, text: string, system: System): Written {
  for (let attempt = 0; attempt < NAME_TRIES; attempt += 1) {
    const file = `${slug}-${system.hex4()}.html`
    const path = system.pathJoin(dir, file)
    try {
      writeFileSync(path, text, { flag: 'wx' })
      return { file, path }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      discard(path)
      throw new CliError(EXIT.io, 'io', `cannot write ${path}: ${ioReason(error)}`)
    }
  }
  throw new CliError(EXIT.io, 'io', `no free file name in ${dir} after ${NAME_TRIES} tries`)
}

function warningOf(mirror: Mirror): string {
  if (mirror.state !== 'failed') return ''
  return `${safe(`vui: warning: the Viewer did not take a copy (${mirror.reason})`)}\n`
}

interface Host {
  host: 'orca-chat' | 'file'
  dir: string
  /** The one line of stdout. */
  line: (written: Written, title: string, bytes: number) => string
  /** What `--json` adds. */
  extra: (line: string) => Record<string, unknown>
}

/** The file first, then the copy: §3's Viewer is a courtesy, and its failure only warns. */
async function deliverFile(delivery: Delivery, host: Host): Promise<Outcome> {
  const { document, diagnostics, name, readBundle, system } = delivery
  const output = renderOutput(document, { format: 'html', readBundle })
  const bytes = Buffer.byteLength(output)
  if (bytes > OUTPUT_LIMIT) return outputTooLarge(bytes, diagnostics)

  const title = typeof document.title === 'string' ? document.title : ''
  const written = writeNew(host.dir, slugify(name ?? title), output, system)
  const viewer = await mirrorToViewer(document, system)
  const line = host.line(written, title, bytes)
  return {
    exit: EXIT.ok,
    stdout: `${line}\n`,
    stderr: `${formatDiagnostics(diagnostics)}${warningOf(viewer)}`,
    json: {
      host: host.host,
      ...written,
      bytes,
      title: title === '' ? null : title,
      ...host.extra(line),
      viewer,
      diagnostics,
    },
  }
}

/** §4.2. The line is the agent's to paste, and all a document can put in it is a clean title. */
export function deliverToChat(delivery: Delivery): Promise<Outcome> {
  const { ORCA_CHAT_SCRATCH_DIR: dir } = delivery.system.env
  if (!dir) throw noHost('ORCA_CHAT_SCRATCH_DIR is not set')
  return deliverFile(delivery, {
    host: 'orca-chat',
    dir,
    line: ({ file }, title) => directiveLine({ file, title }),
    extra: (directive) => ({ directive }),
  })
}

/** B10: a missing `--dir` is made, parents and all, as `mkdir -p` would. */
function ensureDirectory(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    throw new CliError(EXIT.io, 'io', `cannot create ${dir}: ${ioReason(error)}`)
  }
}

/** `selectHost` has seen to it that `--dir` was given. */
export function deliverToDirectory(delivery: Delivery): Promise<Outcome> {
  const dir = delivery.dir as string
  ensureDirectory(dir)
  return deliverFile(delivery, {
    host: 'file',
    dir,
    line: ({ path }, _title, bytes) => safe(`vui: wrote ${path} (${bytes} bytes)`),
    extra: () => ({}),
  })
}
