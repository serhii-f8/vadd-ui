#!/usr/bin/env node
import { readBundle, readSchema } from './assets.js'
import { EXIT } from './outcome.js'
import { safe } from './print.js'
import { run } from './run.js'

// `vui … | head` closing the pipe is the reader's choice, so it does not change the result.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') return
  process.stderr.write(`vui: cannot write to stdout: ${safe(String(error.code))}\n`)
  process.exitCode = EXIT.io
})

// A closed stderr has nobody left to tell.
process.stderr.on('error', () => {})

// `exitCode`, never `exit()`, so a large write to a pipe still drains.
process.exitCode = await run(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  now: () => new Date(),
  readBundle,
  readSchema,
})
