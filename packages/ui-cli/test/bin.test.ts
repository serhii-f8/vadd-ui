import { execFile, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'
import { COMPONENT_TYPES, isLimitCode } from '@vadd/ui-spec'
import { beforeAll, describe, expect, it } from 'vitest'
import { invalidCases, noticeCases, validCases } from '../../ui-spec/test/corpus/cases.js'
import type { Source } from '../../ui-spec/test/corpus/types.js'

// The real `dist/bin.js`, which `pnpm gate` builds first, in real processes.

const root = fileURLToPath(new URL('../../..', import.meta.url))
const BIN = join(root, 'packages/ui-cli/dist/bin.js')
const run = promisify(execFile)
const CLEAN = '{"title":"T","body":["hello"]}'

interface Result {
  exit: number
  stdout: string
  stderr: string
}

async function vui(argv: string[], stdin?: string, cwd = tmpdir()): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...argv], { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      stderr += text
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
    child.on('error', reject)
    child.on('close', (exit) => resolve({ exit: exit ?? -1, stdout, stderr }))
  })
}

async function pool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }
  await Promise.all(Array.from({ length: availableParallelism() }, worker))
}

/** `sh -c` for what only a shell can arrange. POSIX only. */
function sh(script: string) {
  return spawnSync('sh', ['-c', script], { encoding: 'utf8', cwd: tmpdir() })
}

beforeAll(() => {
  if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run pnpm build`)
})

describe('the real bin', () => {
  it('has a shebang', () => {
    expect(readFileSync(BIN, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('renders with the real bundle and reads it back', async () => {
    const html = await vui(['render', '--format', 'html'], CLEAN)
    expect(html.exit).toBe(0)
    expect(Buffer.byteLength(html.stdout)).toBeGreaterThan(100_000)
    const extracted = await vui(['extract'], html.stdout)
    expect(extracted.exit).toBe(0)
    expect(JSON.parse(extracted.stdout)).toMatchObject({
      title: 'T',
      meta: { generator: 'vadd-ui' },
    })
  })

  it('prints the real schema', async () => {
    const { exit, stdout } = await vui(['schema'])
    expect(exit).toBe(0)
    expect(JSON.parse(stdout).$schema).toContain('2020-12')
  })

  it('stamps a real clock', async () => {
    const before = Date.now()
    const { stdout } = await vui(['render', '--format', 'html', '--cdn', '--json'], CLEAN)
    const { output } = JSON.parse(stdout) as { output: string }
    const stamp = /"generatedAt":"([^"]+)"/.exec(output)?.[1] as string
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before - 1)
    expect(Date.parse(stamp)).toBeLessThanOrEqual(Date.now())
  })

  it('takes a file by path', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vui-bin-')), 'doc.vui.json')
    writeFileSync(path, CLEAN)
    expect((await vui(['validate', path])).exit).toBe(0)
  })

  it('reports an unknown command as a usage error with no stack', async () => {
    const { exit, stderr } = await vui(['nope'])
    expect(exit).toBe(2)
    expect(stderr).not.toContain('    at ')
  })
})

describe('stdin', () => {
  it('treats an empty stdin as a parse error', async () => {
    const { exit, stdout } = await vui(['validate'], '')
    expect(exit).toBe(2)
    expect(stdout).toContain('line 1, column 1')
  })

  it.skipIf(process.platform === 'win32')('treats a closed stdin as empty', () => {
    const { status, stdout, stderr } = sh(`"${process.execPath}" "${BIN}" validate <&-`)
    expect(status).toBe(2)
    expect(stdout).toContain('line 1, column 1')
    expect(stderr).toBe('')
  })

  it.skipIf(process.platform === 'win32')('reports a directory on stdin as I/O', () => {
    const { status, stderr } = sh(`"${process.execPath}" "${BIN}" validate </`)
    expect(status).toBe(5)
    expect(stderr).toBe('vui: cannot read stdin: is a directory\n')
  })

  it('reads CRLF', async () => {
    const { exit, stdout } = await vui(
      ['render', '--format', 'text'],
      '{\r\n  "body": [\r\n    "hello"\r\n  ]\r\n}\r\n',
    )
    expect(exit).toBe(0)
    expect(stdout).toBe('hello\n')
  })

  it.skipIf(process.platform !== 'linux')('refuses a terminal rather than hang', () => {
    const command = `"${process.execPath}" "${BIN}" validate`
    const { status, stdout } = spawnSync('script', ['-qec', command, '/dev/null'], {
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(status).toBe(2)
    expect(stdout).toContain('no input')
  })
})

describe.skipIf(process.platform === 'win32')('a closed pipe', () => {
  const statusAndErrors = (argv: string, stdin: string, reader: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'vui-pipe-'))
    const input = join(dir, 'in')
    writeFileSync(input, stdin)
    // Plain sh has no `pipefail`, so the exit code goes through a file.
    const script =
      `{ "${process.execPath}" "${BIN}" ${argv} <"${input}" 2>"${dir}/err"; ` +
      `echo $? >"${dir}/code"; } | ${reader} >/dev/null`
    sh(script)
    return {
      code: Number(readFileSync(join(dir, 'code'), 'utf8')),
      stderr: readFileSync(join(dir, 'err'), 'utf8'),
    }
  }

  it('keeps a clean exit and prints no stack', () => {
    const { code, stderr } = statusAndErrors('render --format html', CLEAN, 'head -c 10')
    expect(code).toBe(0)
    expect(stderr).toBe('')
  })

  it('keeps a failure as a failure', () => {
    const lines = Array.from({ length: 30 }, () => ({ type: 'tabel' }))
    const stdin = JSON.stringify({ body: lines })
    const { code, stderr } = statusAndErrors('validate', stdin, 'true')
    expect(code).toBe(1)
    expect(stderr).toBe('')
  })

  it('stays quiet under --json too', () => {
    const { code, stderr } = statusAndErrors('catalog --json', '', 'head -c 1')
    expect(code).toBe(0)
    expect(stderr).toBe('')
  })
})

describe.skipIf(process.platform === 'win32')('a failing stdout', () => {
  it.skipIf(!existsSync('/dev/full'))('exits 5 on a full disk, with no stack', () => {
    const { status, stderr } = sh(`"${process.execPath}" "${BIN}" catalog >/dev/full`)
    expect(status).toBe(5)
    expect(stderr).toMatch(/^vui: cannot write to stdout: ENOSPC/)
    expect(stderr).not.toContain('    at ')
  })
})

describe('conformance corpus through the real bin', () => {
  const source = ({ text, input }: Source) => text ?? JSON.stringify(input)
  const LONG = 240_000

  it(
    'gives each valid document exit 0 and no diagnostic, then round-trips it',
    async () => {
      expect(validCases.length).toBeGreaterThanOrEqual(150)
      const failures: string[] = []
      await pool(validCases, async (item) => {
        const checked = await vui(['validate', '--json', '--strict'], source(item))
        const { diagnostics } = JSON.parse(checked.stdout) as { diagnostics: unknown[] }
        if (checked.exit !== 0 || diagnostics.length > 0) failures.push(`${item.name}: validate`)
        const html = await vui(['render', '--format', 'html'], source(item))
        const back = await vui(['extract', '--json'], html.stdout)
        const { document } = JSON.parse(back.stdout) as { document: Record<string, unknown> }
        const { generatedAt, meta, ...rest } = document
        const {
          generatedAt: _,
          meta: expectedMeta,
          ...wanted
        } = item.canonical as Record<string, unknown>
        expect(typeof generatedAt).toBe('string')
        expect(meta).toEqual({
          ...(expectedMeta as object),
          generator: 'vadd-ui',
          version: expect.any(String),
        })
        if (!isDeepStrictEqual(rest, wanted)) failures.push(`${item.name}: extract`)
        for (const format of ['md', 'text']) {
          const { exit, stderr } = await vui(['render', '--format', format], source(item))
          if (exit !== 0 || stderr !== '') failures.push(`${item.name}: ${format}`)
        }
      })
      expect(failures).toEqual([])
    },
    LONG,
  )

  it(
    'gives each invalid document its diagnostics and the right exit',
    async () => {
      expect(invalidCases.length).toBeGreaterThanOrEqual(150)
      const failures: string[] = []
      await pool(invalidCases, async (item) => {
        const { exit, stdout } = await vui(['validate', '--json'], source(item))
        const { diagnostics } = JSON.parse(stdout) as { diagnostics: { code: string }[] }
        const codes = diagnostics.map(({ code }) => code)
        const errors = item.diagnostics.filter(({ severity }) => severity === 'error')
        const wanted = errors.some(({ code }) => isLimitCode(code))
          ? 3
          : errors.some(({ code }) => code === 'parse-error')
            ? 2
            : 1
        if (exit !== wanted) failures.push(`${item.name}: exit ${exit}, wanted ${wanted}`)
        for (const { code } of item.diagnostics) {
          if (!codes.includes(code)) failures.push(`${item.name}: no ${code}`)
        }
        const rendered = await vui(['render', '--format', 'html'], source(item))
        if (rendered.exit !== wanted || rendered.stdout !== '') {
          failures.push(`${item.name}: render exit ${rendered.exit}`)
        }
      })
      expect(failures).toEqual([])
    },
    LONG,
  )

  it(
    'lets a notice through, and --strict stops only a warning',
    async () => {
      const failures: string[] = []
      await pool(noticeCases, async (item) => {
        const plain = await vui(['validate'], source(item))
        if (plain.exit !== 0) failures.push(`${item.name}: exit ${plain.exit}`)
        const strict = await vui(['validate', '--strict'], source(item))
        const warned = item.diagnostics.some(({ severity }) => severity === 'warn')
        if (strict.exit !== (warned ? 1 : 0)) failures.push(`${item.name}: strict ${strict.exit}`)
      })
      expect(failures).toEqual([])
    },
    LONG,
  )
})

describe('installed as a package, outside this repo', () => {
  const PACKAGES = ['ui-spec', 'ui', 'ui-text', 'ui-viewer', 'ui-cli']
  let home: string

  beforeAll(() => {
    // What a tarball holds: the manifest and `files`, and nothing of the workspace.
    home = mkdtempSync(join(tmpdir(), 'vui-install-'))
    for (const name of PACKAGES) {
      const from = join(root, 'packages', name)
      const to = join(home, 'node_modules/@vadd', name)
      mkdirSync(to, { recursive: true })
      cpSync(join(from, 'package.json'), join(to, 'package.json'))
      cpSync(join(from, 'dist'), join(to, 'dist'), { recursive: true })
    }
    mkdirSync(join(home, 'node_modules/.bin'))
    chmodSync(join(home, 'node_modules/@vadd/ui-cli/dist/bin.js'), 0o755)
  })

  const installed = (argv: string[], input?: string) =>
    run(process.execPath, [join(home, 'node_modules/@vadd/ui-cli/dist/bin.js'), ...argv], {
      cwd: home,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? '' },
    }).then(
      (done) => done,
      (error: unknown) => {
        throw new Error(`${String(error)} ${String(input)}`)
      },
    )

  it('finds the bundle through the export', async () => {
    const input = join(home, 'doc.vui.json')
    writeFileSync(input, CLEAN)
    const { stdout } = await installed(['render', input, '--format', 'html'])
    const bundle = readFileSync(join(root, 'packages/ui/dist/vui.min.js'), 'utf8')
    expect(stdout).toContain(`<script>${bundle}</script>`)
  })

  it('finds the schema and the catalog', async () => {
    expect(JSON.parse((await installed(['schema'])).stdout).$schema).toContain('2020-12')
    const { stdout } = await installed(['catalog'])
    expect(stdout.trimEnd().split('\n')).toHaveLength(COMPONENT_TYPES.length)
  })
})

describe('the browser bundle', () => {
  it('holds no catalog text', () => {
    const bundle = readFileSync(join(root, 'packages/ui/dist/vui.min.js'), 'utf8')
    expect(bundle).not.toContain('Vertical group')
    expect(bundle).not.toContain('Highlighted message')
  })
})
