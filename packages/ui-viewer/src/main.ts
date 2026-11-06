import { parseArgs } from 'node:util'
import { workspaceOf } from './paths.js'
import { type RunningViewer, startViewer } from './server.js'

export interface RunDeps {
  cwd?: string
  env?: NodeJS.ProcessEnv
  warn?: (line: string) => void
}

const SIGNALS = ['SIGTERM', 'SIGINT'] as const

/** The Viewer process: `viewer.js [--bind <address>] [--workspace <path>]`. */
export async function runViewer(argv: string[], deps: RunDeps = {}): Promise<RunningViewer> {
  const { cwd = process.cwd(), env = process.env } = deps
  const warn = deps.warn ?? ((line) => process.stderr.write(`${line}\n`))
  const { values } = parseArgs({
    args: argv,
    options: { bind: { type: 'string' }, workspace: { type: 'string' } },
  })
  const workspace = workspaceOf(values.workspace ?? cwd)
  const viewer = await startViewer({ workspace, bind: values.bind, env, warn })
  for (const signal of SIGNALS) process.once(signal, () => void viewer.close())
  // One line for the log, without the URL, which holds the read token.
  warn(`vui: Viewer listening on port ${viewer.port}`)
  return viewer
}
