#!/usr/bin/env node
// `vui` for the agent eval: runs the built CLI unchanged and appends what happened to
// $VUI_EVAL_LOG (argv, exit code, stdout, stdin size), so the run can be scored.

import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../../packages/ui-cli/dist/bin.js', import.meta.url))
const argv = process.argv.slice(2)
let input = ''
if (!process.stdin.isTTY) {
  try {
    input = readFileSync(0, 'utf8')
  } catch {
    input = ''
  }
}
const result = spawnSync(process.execPath, [BIN, ...argv], { input, encoding: 'utf8' })
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
const exit = result.status ?? 1
const log = process.env.VUI_EVAL_LOG
if (log) {
  const entry = { argv, exit, stdout: result.stdout ?? '', stdinBytes: Buffer.byteLength(input) }
  appendFileSync(log, `${JSON.stringify(entry)}\n`)
}
process.exit(exit)
