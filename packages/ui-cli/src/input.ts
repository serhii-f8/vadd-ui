import { createReadStream } from 'node:fs'
import type { Io } from './io.js'
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
  return { text: Buffer.concat(chunks).toString('utf8'), tooLarge: false }
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
    return await collect(fromStdin ? stdin : createReadStream(source), maxBytes)
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code ?? (error as Error).message
    const name = fromStdin ? 'stdin' : source
    throw new CliError(EXIT.io, 'io', `cannot read ${name}: ${reason}`)
  }
}
