import { createReadStream, fstatSync } from 'node:fs'
import type { Io } from './io.js'
import { ioReason } from './io-error.js'
import { CliError, EXIT, usageError } from './outcome.js'

export interface Input {
  text: string
  /** Over `maxBytes`, so `text` is empty. Reading stopped, so size cannot cost memory. */
  tooLarge: boolean
}

const STDIN = '-'

async function collect(stream: AsyncIterable<unknown>, maxBytes: number): Promise<Input> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const bytes = chunk as Buffer
    total += bytes.length
    if (total > maxBytes) return { text: '', tooLarge: true }
    chunks.push(bytes)
  }
  return { text: decoded(Buffer.concat(chunks)), tooLarge: false }
}

/** Refuses rather than swap bytes for U+FFFD, which would alter a document with no word. */
function decoded(bytes: Buffer): string {
  const text = bytes.toString('utf8')
  if (Buffer.from(text, 'utf8').equals(bytes)) return text
  throw new CliError(EXIT.parse, 'parse-error', 'input is not valid UTF-8')
}

/** Node reads a directory on fd 0 as an empty stream, which would look like empty input. */
function refuseDirectory(stdin: Io['stdin']): void {
  if (stdin.fd !== undefined && fstatSync(stdin.fd).isDirectory()) {
    throw Object.assign(new Error('directory on stdin'), { code: 'EISDIR' })
  }
}

/**
 * A file, or stdin for `-` and for none. An agent's shell usually has a terminal on stdin,
 * where waiting for a document would hang forever, so a terminal is refused.
 */
export async function readInput(
  source: string | undefined,
  stdin: Io['stdin'],
  maxBytes: number,
): Promise<Input> {
  const fromStdin = source === undefined || source === STDIN
  if (fromStdin && stdin.isTTY === true) {
    throw usageError('no input: give a file, or pipe a document to stdin')
  }
  try {
    if (fromStdin) refuseDirectory(stdin)
    return await collect(fromStdin ? stdin : createReadStream(source), maxBytes)
  } catch (error) {
    if (error instanceof CliError) throw error
    const name = fromStdin ? 'stdin' : source
    throw new CliError(EXIT.io, 'io', `cannot read ${name}: ${ioReason(error)}`)
  }
}
