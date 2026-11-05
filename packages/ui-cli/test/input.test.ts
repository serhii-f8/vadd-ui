import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readInput } from '../src/input.js'
import type { Io } from '../src/io.js'
import { CliError } from '../src/outcome.js'
import { tempDir, tempFile } from './helpers.js'

const stdin = (chunks: Buffer[], tty = false) =>
  Object.assign(Readable.from(chunks), { isTTY: tty }) as Io['stdin']

async function failure(run: () => Promise<unknown>): Promise<CliError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(CliError)
    return error as CliError
  }
  throw new Error('no failure')
}

describe('readInput', () => {
  it('reads a file', async () => {
    const path = tempFile('a.json', 'héllo')
    expect(await readInput(path, stdin([]), 100)).toEqual({ text: 'héllo', tooLarge: false })
  })

  it('reads stdin for - and for no file', async () => {
    const chunks = [Buffer.from('a'), Buffer.from('b')]
    expect((await readInput('-', stdin(chunks), 100)).text).toBe('ab')
    expect((await readInput(undefined, stdin(chunks), 100)).text).toBe('ab')
  })

  it('joins a character split across chunks', async () => {
    const bytes = Buffer.from('é')
    const chunks = [bytes.subarray(0, 1), bytes.subarray(1)]
    expect((await readInput('-', stdin(chunks), 100)).text).toBe('é')
  })

  it('reads an input of exactly the limit', async () => {
    const path = tempFile('a', 'x'.repeat(10))
    expect(await readInput(path, stdin([]), 10)).toEqual({ text: 'x'.repeat(10), tooLarge: false })
  })

  it('stops one byte past the limit', async () => {
    const path = tempFile('a', 'x'.repeat(11))
    expect(await readInput(path, stdin([]), 10)).toEqual({ text: '', tooLarge: true })
  })

  it('stops reading stdin past the limit', async () => {
    let produced = 0
    const endless = new Readable({
      read() {
        produced++
        this.push(Buffer.alloc(1024))
      },
    })
    const result = await readInput('-', Object.assign(endless, { isTTY: false }), 4096)
    expect(result.tooLarge).toBe(true)
    expect(produced).toBeLessThan(64)
  })

  it('counts bytes, not characters', async () => {
    const path = tempFile('a', 'é'.repeat(6))
    expect((await readInput(path, stdin([]), 11)).tooLarge).toBe(true)
    expect((await readInput(path, stdin([]), 12)).tooLarge).toBe(false)
  })

  it.each([[undefined], ['-']])('refuses a terminal for %j, rather than hang', async (source) => {
    const error = await failure(() => readInput(source, stdin([], true), 100))
    expect(error.exit).toBe(2)
    expect(error.code).toBe('usage')
  })

  it('reads a named file with a terminal on stdin', async () => {
    const path = tempFile('a', 'x')
    expect((await readInput(path, stdin([], true), 100)).text).toBe('x')
  })

  it('reports a missing file as I/O', async () => {
    const error = await failure(() => readInput('/nonexistent/x', stdin([]), 100))
    expect(error.exit).toBe(5)
    expect(error.code).toBe('io')
    expect(error.message).toContain('ENOENT')
    expect(error.message).toContain('/nonexistent/x')
  })

  it('reports a directory as I/O', async () => {
    const error = await failure(() => readInput(tempDir(), stdin([]), 100))
    expect(error.exit).toBe(5)
    expect(error.message).toContain('EISDIR')
  })

  it('reports a failing stdin as I/O', async () => {
    const broken = new Readable({
      read() {
        this.destroy(Object.assign(new Error('boom'), { code: 'EIO' }))
      },
    })
    const error = await failure(() => readInput('-', Object.assign(broken, { isTTY: false }), 100))
    expect(error.exit).toBe(5)
    expect(error.message).toContain('EIO')
  })
})
