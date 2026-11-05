import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Io } from '../src/io.js'
import { run } from '../src/run.js'

export const NOW = new Date('2026-11-05T10:00:00.000Z')
export const BUNDLE = '/*bundle*/'
export const SCHEMA = '{"$id":"vui"}\n'

export interface Result {
  exit: number
  stdout: string
  stderr: string
}

export interface Options {
  stdin?: string | Buffer | Readable
  tty?: boolean
  bundle?: string | (() => string)
  schema?: () => string
}

function stdinOf(options: Options): Io['stdin'] {
  const source = options.stdin ?? ''
  const stream = source instanceof Readable ? source : Readable.from([Buffer.from(source)])
  return Object.assign(stream, { isTTY: options.tty === true })
}

/** The whole CLI in process, with a fixed clock and a short bundle. */
export async function vui(argv: string[], options: Options = {}): Promise<Result> {
  let stdout = ''
  let stderr = ''
  const bundle = options.bundle ?? BUNDLE
  const exit = await run(argv, {
    stdin: stdinOf(options),
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
    now: () => NOW,
    readBundle: typeof bundle === 'string' ? () => bundle : bundle,
    readSchema: options.schema ?? (() => SCHEMA),
  })
  return { exit, stdout, stderr }
}

/** `--json` must hold whatever happened: one value on stdout and nothing on stderr. */
export async function vuiJson(
  argv: string[],
  options: Options = {},
): Promise<{ exit: number; json: Record<string, unknown> }> {
  const { exit, stdout, stderr } = await vui([...argv, '--json'], options)
  if (stderr !== '') throw new Error(`stderr under --json: ${stderr}`)
  const json = JSON.parse(stdout) as Record<string, unknown>
  if (json.ok !== (exit === 0)) throw new Error(`ok disagrees with exit ${exit}: ${stdout}`)
  return { exit, json }
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'vui-test-'))
}

export function tempFile(name: string, content: string | Buffer): string {
  const path = join(tempDir(), name)
  writeFileSync(path, content)
  return path
}
