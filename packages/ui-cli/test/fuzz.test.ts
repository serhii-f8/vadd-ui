import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  excerpt,
  fastestMs,
  fuzzCount,
  fuzzSeed,
  fuzzText,
} from '../../ui-spec/test/fuzz/generator.js'
import { EXIT } from '../src/outcome.js'
import { vui } from './helpers.js'

// §16 "Fuzzing": the CLI never crashes, and exits 0 to 5 only. `pnpm fuzz` runs the long version.
const CASES = fuzzCount(2_000)
const BIN_CASES = Number(process.env.VUI_FUZZ_BIN_CASES ?? 20)
const SEED = fuzzSeed(process.env.VUI_FUZZ_FRESH === '1' ? Date.now() >>> 0 : 20_261_111)
const CASE_MS = 2_000

const root = fileURLToPath(new URL('../../..', import.meta.url))
const BIN = join(root, 'packages/ui-cli/dist/bin.js')

/** Each case runs one of these, in turn, so every command sees every mode. */
const COMMANDS: readonly string[][] = [
  ['validate'],
  ['validate', '--strict', '--json'],
  ['render', '--format', 'md'],
  ['render', '--format', 'text'],
  ['render', '--format', 'html'],
  ['render', '--format', 'md', '--json'],
  ['render', '--format', 'html', '--json'],
]

/** `run`'s catch-all, which is a crash in disguise, as it prints it and as `--json` says it. */
const INTERNAL = /^vui: internal error/m
const INTERNAL_JSON = /^\{"ok":false,"error":\{"code":"internal"/
/** A line of a Node stack trace. */
const STACK = /^ {4}at /m

const isExit = (exit: number | null) =>
  Number.isInteger(exit) && (exit as number) >= 0 && (exit as number) <= 5

function report(index: number, argv: readonly string[], problem: string, text: string): string {
  return (
    `seed ${SEED}, index ${index} (VUI_FUZZ_SEED=${SEED}), vui ${argv.join(' ')}:\n${problem}\n` +
    `stdin: ${excerpt(text)}`
  )
}

/** What is wrong with one in-process run, or nothing. */
async function inProcess(argv: string[], text: string): Promise<string | undefined> {
  try {
    const stdin = Readable.from([Buffer.from(text)])
    const { exit, stdout, stderr } = await vui(argv, { stdin })
    if (!isExit(exit)) return `exit ${exit}`
    // Stdin and stdout only, so there is no I/O to fail: a 5 is a failure in disguise.
    if (exit === EXIT.io) return `exit 5: ${stderr.slice(0, 500)}${stdout.slice(0, 500)}`
    if (INTERNAL.test(stderr) || INTERNAL_JSON.test(stdout)) {
      return `internal error: ${stderr.slice(0, 500)}${stdout.slice(0, 500)}`
    }
    if (STACK.test(stderr)) return `a stack trace on stderr: ${stderr.slice(0, 500)}`
    return undefined
  } catch (error) {
    return `run rejected: ${error instanceof Error ? error.stack : error}`
  }
}

describe('the CLI under fuzzing', () => {
  it(`${CASES} cases from seed ${SEED} in process exit 0 to 5 and never crash`, async () => {
    for (let index = 0; index < CASES; index++) {
      const text = fuzzText(SEED, index)
      const argv = COMMANDS[index % COMMANDS.length] as string[]
      const started = performance.now()
      let problem = await inProcess(argv, text)
      const once = performance.now() - started
      if (problem === undefined && once > CASE_MS) {
        const ms = await fastestMs(once, CASE_MS, () => inProcess(argv, text))
        if (ms > CASE_MS) problem = `took ${Math.round(ms)} ms at best, over ${CASE_MS}`
      }
      if (problem !== undefined) expect.fail(report(index, argv, problem, text))
    }
  }, 600_000)

  const binary = existsSync(BIN)
  it.skipIf(!binary)(
    `${BIN_CASES} cases from seed ${SEED} through the real binary${binary ? '' : ' (skipped: no dist/bin.js, run pnpm build)'}`,
    async () => {
      const failures: string[] = []
      const queue = Array.from({ length: BIN_CASES }, (_, at) => at)
      const worker = async () => {
        for (let index = queue.shift(); index !== undefined; index = queue.shift()) {
          const text = fuzzText(SEED, index)
          const { status, signal, stderr } = await spawnBin(['validate'], text)
          let problem: string | undefined
          if (signal !== null) problem = `killed by ${signal}`
          else if (!isExit(status)) problem = `status ${status}`
          else if (INTERNAL.test(stderr)) problem = `internal error: ${stderr.slice(0, 500)}`
          else if (STACK.test(stderr)) problem = `a stack trace on stderr: ${stderr.slice(0, 500)}`
          if (problem !== undefined) failures.push(report(index, ['validate'], problem, text))
        }
      }
      await Promise.all(Array.from({ length: Math.min(availableParallelism(), 8) }, worker))
      expect(failures.slice(0, 3).join('\n\n')).toBe('')
    },
    600_000,
  )
})

interface Exited {
  status: number | null
  signal: NodeJS.Signals | null
  stderr: string
}

function spawnBin(argv: string[], stdin: string): Promise<Exited> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...argv], { cwd: tmpdir() })
    let stderr = ''
    child.stdout.resume()
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.on('error', reject)
    child.on('close', (status, signal) => resolve({ status, signal, stderr }))
  })
}

if (!existsSync(BIN)) {
  // Visible in the run's output, so a skipped sample is never mistaken for a passed one.
  console.warn(`fuzz: ${BIN} is missing, so the real-binary sample is skipped; run pnpm build`)
}
