import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { isVisualFileName, ORCA_FILE_MAX_BYTES, parseDirectiveLine } from '@vadd/ui-spec/host/orca'
import { readViewerInfo, slugify, stateDirOf, workspaceHash } from '@vadd/ui-viewer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OUTPUT_LIMIT } from '../src/output.js'
import type { System } from '../src/system.js'
import {
  BUNDLE,
  type FakeSystem,
  fakeSystem,
  tempDir,
  ViewerFarm,
  vui,
  vuiJson,
} from './helpers.js'

// The only way past `wx` to a failing write on a real disk is a full one, so one test swaps the write.
const failure = vi.hoisted(() => ({ next: undefined as NodeJS.ErrnoException | undefined }))
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    writeFileSync: ((...args: Parameters<typeof real.writeFileSync>) => {
      const error = failure.next
      if (error === undefined) return real.writeFileSync(...args)
      failure.next = undefined
      real.writeFileSync(args[0], 'partial', args[2]) // the `wx` open succeeded and left a file
      throw error
    }) as typeof real.writeFileSync,
  }
})

const DOC = '{"title":"Test run — auth module","body":["hello"]}'

let farm: ViewerFarm | undefined
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await farm?.stopAll()
  farm = undefined
  for (const server of servers.splice(0)) server.close()
})

function system(env: NodeJS.ProcessEnv = {}, fake: FakeSystem = {}): System {
  return fakeSystem({
    cwd: tempDir(),
    env: { XDG_STATE_HOME: tempDir(), ...env },
    ...fake,
  })
}

const only = (dir: string) => {
  const names = readdirSync(dir)
  expect(names).toHaveLength(1)
  return names[0] as string
}

const visual = (dir: string) => readFileSync(join(dir, only(dir)), 'utf8')

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const PIECES = [
  'a',
  'Z',
  '9',
  '-',
  '_',
  '.',
  '..',
  ' ',
  '/',
  '\\',
  '"',
  "'",
  '{',
  '}',
  ':',
  '\n',
  '\r',
  '\t',
  '\0',
  '\u001b[31m',
  '\u0085',
  ' ',
  '‮',
  'é',
  'Ж',
  '😀',
  '\ud800',
  'con',
  'NUL',
  'com1',
  'lpt¹',
  'conin$',
  '::orca-visual{file="x.html"}',
  '<script>',
  '%2e',
  '$&',
]

function hostile(next: () => number): string {
  const length = Math.floor(next() * 24)
  let text = ''
  for (let index = 0; index < length; index += 1) {
    const piece = PIECES[Math.floor(next() * PIECES.length)] as string
    text += next() < 0.05 ? piece.repeat(40) : piece
  }
  return text
}

describe('slugify (§11.5)', () => {
  it.each([
    ['Test run — auth module', 'test-run-auth-module'],
    ['Catalog query latency', 'catalog-query-latency'],
    ['Hello!', 'hello'],
    ['!Hi', 'v--hi'],
    ['Тест', 'v'],
    ['', 'v'],
    ['con', 'con'],
    ['a.b..c', 'a-b-c'],
    ['Звіт', 'v'],
    ['a'.repeat(60), 'a'.repeat(48)],
  ])('%j becomes %j', (input, output) => {
    expect(slugify(input)).toBe(output)
  })

  it('stays within 48 characters', () => {
    expect(slugify('a'.repeat(100))).toBe('a'.repeat(48))
    expect(slugify(`-${'a'.repeat(100)}`)).toHaveLength(48)
    expect(slugify(`${'a'.repeat(47)} b`)).toBe('a'.repeat(47))
  })

  it('names a file Orca takes, for anything at all', () => {
    const next = random(16)
    for (let run = 0; run < 5_000; run += 1) {
      const slug = slugify(hostile(next))
      const hex = Math.floor(next() * 65536)
        .toString(16)
        .padStart(4, '0')
      const name = `${slug}-${hex}.html`
      expect(slug.length, name).toBeLessThanOrEqual(48)
      expect(slug, name).toMatch(/^[a-z0-9][a-z0-9-]*$/)
      expect(isVisualFileName(name), name).toBe(true)
    }
  })
})

describe('--host orca-chat', () => {
  it('writes the visual and prints exactly the directive', async () => {
    const dir = tempDir()
    const { exit, stdout, stderr } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    expect(exit).toBe(0)
    expect(stderr).toBe('')
    const file = only(dir)
    expect(file).toMatch(/^test-run-auth-module-[0-9a-f]{4}\.html$/)
    expect(stdout).toBe(`::orca-visual{file="${file}" title="Test run — auth module"}\n`)
    const html = visual(dir)
    expect(html.startsWith('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">')).toBe(
      true,
    )
    expect(html).toContain(`<script>${BUNDLE}</script>`)
    expect(html).toContain('<title>Test run — auth module</title>')
  })

  it('selects itself on auto when the folder is writable', async () => {
    const dir = tempDir()
    const { stdout } = await vui(['show'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    expect(stdout).toMatch(/^::orca-visual\{file="[^"]+" title="[^"]+"\}\n$/)
    expect(readdirSync(dir)).toHaveLength(1)
  })

  it('takes the name from --name, and --title for the line', async () => {
    const dir = tempDir()
    const { stdout } = await vui(['show', '--name', 'My Name', '--title', 'Other'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    const file = only(dir)
    expect(file).toMatch(/^my-name-[0-9a-f]{4}\.html$/)
    expect(stdout).toBe(`::orca-visual{file="${file}" title="Other"}\n`)
  })

  it('keeps a hostile title to one directive and one line', async () => {
    const dir = tempDir()
    const title = 'x"}\n::orca-visual{file="evil.html" title="y\u001b[2J\\'
    const { stdout } = await vui(['show'], {
      stdin: JSON.stringify({ title, body: ['hello'] }),
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    expect(stdout.endsWith('\n')).toBe(true)
    const lines = stdout.slice(0, -1).split('\n')
    expect(lines).toHaveLength(1)
    expect(stdout.match(/::orca-visual\{/g)).toHaveLength(1)
    expect(parseDirectiveLine(lines[0] as string)).toEqual({
      file: only(dir),
      title: 'x ::orca-visual file= evil.html title= y',
    })
  })

  it('has no title for an untitled document or a mistyped one', async () => {
    for (const stdin of ['{"body":["x"]}', '{"title":7,"body":["x"]}']) {
      const dir = tempDir()
      const { exit, stdout } = await vui(['show'], {
        stdin,
        system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
      })
      expect(exit).toBe(0)
      expect(stdout).toBe(`::orca-visual{file="${only(dir)}"}\n`)
      expect(only(dir)).toMatch(/^v-[0-9a-f]{4}\.html$/)
    }
  })

  it('keeps warnings on stderr, off the line', async () => {
    const dir = tempDir()
    const { stdout, stderr } = await vui(['show'], {
      stdin: '{"title":7,"body":["x"]}',
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    expect(stdout.split('\n')).toHaveLength(2)
    expect(stderr).toContain('title')
  })

  it('reports the delivery in JSON', async () => {
    const dir = tempDir()
    const { exit, json } = await vuiJson(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    const file = only(dir)
    expect(exit).toBe(0)
    expect(json).toMatchObject({
      ok: true,
      host: 'orca-chat',
      file,
      path: join(dir, file),
      title: 'Test run — auth module',
      directive: `::orca-visual{file="${file}" title="Test run — auth module"}`,
      viewer: { state: 'none' },
      diagnostics: [],
    })
    expect(json.bytes).toBe(Buffer.byteLength(visual(dir)))
  })

  it('exits 4 when the variable is unset, and names it', async () => {
    const { exit, stderr, stdout } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system(),
    })
    expect(exit).toBe(4)
    expect(stdout).toBe('')
    expect(stderr).toContain('ORCA_CHAT_SCRATCH_DIR')
    expect(stderr).toContain('vui doctor')
  })

  it('exits 5 for a missing folder, and does not make one', async () => {
    const dir = join(tempDir(), 'gone')
    const { exit } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir }),
    })
    expect(exit).toBe(5)
    expect(existsSync(dir)).toBe(false)
  })

  it('validates first: exits 1 and 2 write nothing', async () => {
    const dir = tempDir()
    const env = { ORCA_CHAT_SCRATCH_DIR: dir }
    expect((await vui(['show'], { stdin: '{', system: system(env) })).exit).toBe(2)
    expect(
      (await vui(['show'], { stdin: '{"body":[{"type":"nope"}]}', system: system(env) })).exit,
    ).toBe(1)
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('auto with a folder it cannot use', () => {
  it.each([
    [
      'writable but not searchable',
      () => {
        const dir = tempDir()
        chmodSync(dir, 0o200)
        return dir
      },
    ],
    ['missing', () => join(tempDir(), 'gone')],
    [
      'read-only',
      () => {
        const dir = tempDir()
        chmodSync(dir, 0o500)
        return dir
      },
    ],
    [
      'a file',
      () => {
        const file = join(tempDir(), 'f')
        writeFileSync(file, '')
        return file
      },
    ],
  ])('goes to the Viewer: %s', async (_name, make) => {
    const workspace = tempDir()
    const env = { XDG_STATE_HOME: tempDir(), ORCA_CHAT_SCRATCH_DIR: make() }
    farm = new ViewerFarm(env)
    const { exit, stdout } = await vui(['show'], {
      stdin: DOC,
      system: farm.system({ cwd: workspace }),
    })
    expect(exit).toBe(0)
    expect(stdout).toContain('in viewer')
  })
})

describe('--host file', () => {
  it('writes into --dir and says where', async () => {
    const dir = tempDir()
    const { exit, stdout } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system(),
    })
    expect(exit).toBe(0)
    const path = join(dir, only(dir))
    expect(stdout).toBe(`vui: wrote ${path} (${Buffer.byteLength(visual(dir))} bytes)\n`)
  })

  it('keeps a hostile --dir to one line', async () => {
    const parent = tempDir()
    const dir = join(parent, 'a\nb')
    mkdirSync(dir)
    const { stdout } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system(),
    })
    expect(stdout.split('\n')).toHaveLength(2)
    expect(stdout).toContain('a\\u000ab')
  })

  it('reports JSON with no directive', async () => {
    const dir = tempDir()
    const { json } = await vuiJson(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system(),
    })
    expect(json).toMatchObject({ ok: true, host: 'file', file: only(dir) })
    expect(json).not.toHaveProperty('directive')
  })

  it('wins over the scratch folder', async () => {
    const dir = tempDir()
    const scratch = tempDir()
    await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: scratch }),
    })
    expect(readdirSync(dir)).toHaveLength(1)
    expect(readdirSync(scratch)).toEqual([])
  })

  it.each([
    ['missing', () => join(tempDir(), 'gone')],
    [
      'a file',
      () => {
        const file = join(tempDir(), 'f')
        writeFileSync(file, '')
        return file
      },
    ],
    [
      'read-only',
      () => {
        const dir = tempDir()
        chmodSync(dir, 0o500)
        return dir
      },
    ],
  ])('exits 5: %s', async (_name, make) => {
    const { exit, json } = await vuiJson(['show', '--host', 'file', '--dir', make()], {
      stdin: DOC,
      system: system(),
    })
    expect(exit).toBe(5)
    expect(json).toMatchObject({ error: { code: 'io' } })
  })
})

describe('file names', () => {
  it('retries a collision with a new suffix', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'test-run-auth-module-aaaa.html'), 'mine')
    const suffixes = ['aaaa', 'bbbb']
    const { exit } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system({}, { hex4: () => suffixes.shift() as string }),
    })
    expect(exit).toBe(0)
    expect(readdirSync(dir).sort()).toEqual([
      'test-run-auth-module-aaaa.html',
      'test-run-auth-module-bbbb.html',
    ])
    expect(readFileSync(join(dir, 'test-run-auth-module-aaaa.html'), 'utf8')).toBe('mine')
  })

  it('removes its own file when a write fails', async () => {
    const dir = tempDir()
    failure.next = Object.assign(new Error('no space left'), { code: 'ENOSPC' })
    const { exit, stderr } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system(),
    })
    expect(failure.next).toBeUndefined()
    expect(exit).toBe(5)
    expect(stderr).toContain('ENOSPC')
    expect(readdirSync(dir)).toEqual([])
  })

  it('gives up with exit 5 and leaves what is there', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'test-run-auth-module-aaaa.html'), 'mine')
    const { exit, stderr } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system({}, { hex4: () => 'aaaa' }),
    })
    expect(exit).toBe(5)
    expect(stderr).toContain('free')
    expect(readdirSync(dir)).toHaveLength(1)
  })

  it('does not write through a planted symlink', async () => {
    const dir = tempDir()
    const target = join(tempDir(), 'target')
    writeFileSync(target, 'safe')
    symlinkSync(target, join(dir, 'test-run-auth-module-aaaa.html'))
    const suffixes = ['aaaa', 'bbbb']
    await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system({}, { hex4: () => suffixes.shift() as string }),
    })
    expect(readFileSync(target, 'utf8')).toBe('safe')
  })

  it('makes two files for two shows of one title', async () => {
    const dir = tempDir()
    for (let run = 0; run < 2; run += 1) {
      await vui(['show', '--host', 'file', '--dir', dir], { stdin: DOC, system: system() })
    }
    expect(new Set(readdirSync(dir)).size).toBe(2)
  })
})

describe('the file', () => {
  it('holds no local path, even one the document claims', async () => {
    const dir = tempDir()
    const stdin = JSON.stringify({ meta: { cwd: '/home/x', branch: 'b', keep: 1 }, body: ['x'] })
    await vui(['show', '--host', 'file', '--dir', dir], { stdin, system: system() })
    const { stdout } = await vui(['extract', join(dir, only(dir))])
    const document = JSON.parse(stdout) as { meta: Record<string, unknown> }
    expect(document.meta).toMatchObject({ keep: 1, generator: 'vadd-ui' })
    expect(document.meta).not.toHaveProperty('cwd')
    expect(document.meta).not.toHaveProperty('branch')
  })

  it('reads back through vui extract and validate', async () => {
    const dir = tempDir()
    await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: '{"title":"</script><!--","body":["</script>"]}',
      system: system(),
    })
    const extracted = await vui(['extract', join(dir, only(dir))])
    expect(extracted.exit).toBe(0)
    expect((await vui(['validate'], { stdin: extracted.stdout })).exit).toBe(0)
  })

  it('exits 3 over 500 KiB, writes nothing and posts nothing', async () => {
    const dir = tempDir()
    const posted: string[] = []
    const env = { VUI_VIEWER_URL: await endpoint(posted) }
    const options = { stdin: DOC, bundle: 'x'.repeat(OUTPUT_LIMIT), system: system(env) }
    const argv = ['show', '--host', 'file', '--dir', dir]
    const { exit, stdout, stderr } = await vui(argv, options)
    expect(exit).toBe(3)
    expect(stdout).toBe('')
    expect(stderr).toContain('limit')
    const { json } = await vuiJson(argv, options)
    expect(json).toMatchObject({ error: { code: 'limit-output-size' } })
    expect(readdirSync(dir)).toEqual([])
    expect(posted).toEqual([])
  })

  it('takes exactly 500 KiB', async () => {
    const dir = tempDir()
    const probe = tempDir()
    await vui(['show', '--host', 'file', '--dir', probe], { stdin: DOC, system: system() })
    const spare = OUTPUT_LIMIT - Buffer.byteLength(visual(probe))
    const bundle = BUNDLE + 'x'.repeat(spare)
    const { exit } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      bundle,
      system: system(),
    })
    expect(exit).toBe(0)
    expect(Buffer.byteLength(visual(dir))).toBe(OUTPUT_LIMIT)
  })

  it('stops short of Orca’s own limit', () => {
    expect(OUTPUT_LIMIT).toBeLessThan(ORCA_FILE_MAX_BYTES)
  })

  it('exits 5 with no bundle', async () => {
    const dir = tempDir()
    const { exit } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      bundle: () => {
        throw new Error('gone')
      },
      system: system(),
    })
    expect(exit).toBe(5)
    expect(readdirSync(dir)).toEqual([])
  })

  it('takes a --title at the field limit', async () => {
    const { exit } = await vui(
      ['show', '--host', 'file', '--dir', tempDir(), '--title', 't'.repeat(2_000)],
      { stdin: DOC, system: system() },
    )
    expect(exit).toBe(0)
  })

  it('refuses a --title over the field limit before any host', async () => {
    const dir = tempDir()
    const { exit, stderr } = await vui(
      ['show', '--host', 'file', '--dir', dir, '--title', 't'.repeat(2_001)],
      { stdin: DOC, system: system() },
    )
    expect(exit).toBe(3)
    expect(stderr).toContain('2000')
    expect(readdirSync(dir)).toEqual([])
  })
})

/** Answers as the §4.1 endpoint does, keeping each body. */
async function endpoint(
  bodies: string[],
  reply: (request: IncomingMessage, response: ServerResponse) => void = (_, response) => {
    response.writeHead(201, { 'Content-Type': 'application/json' })
    response.end('{"seq":3,"id":"doc-3","url":"http://x/#3","clients":0}')
  },
): Promise<string> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      bodies.push(Buffer.concat(chunks).toString('utf8'))
      reply(request, response)
    })
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('the post to a running Viewer', () => {
  function placed() {
    const workspace = tempDir()
    mkdirSync(join(workspace, '.git'))
    writeFileSync(join(workspace, '.git', 'HEAD'), 'ref: refs/heads/feature\n')
    const env = { XDG_STATE_HOME: tempDir() }
    farm = new ViewerFarm(env)
    return { workspace, stateDir: stateDirOf(workspaceHash(workspace), env), running: farm }
  }

  it('starts no Viewer when none runs, and says nothing', async () => {
    const { workspace, running, stateDir } = placed()
    const dir = tempDir()
    const { exit, stderr } = await vui(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: running.system({ cwd: workspace }),
    })
    expect(exit).toBe(0)
    expect(stderr).toBe('')
    expect(running.spawns).toBe(0)
    expect(readViewerInfo(stateDir)).toBeUndefined()
  })

  it('posts to a running one, with the path on the copy and not in the file', async () => {
    const { workspace, running, stateDir } = placed()
    const sys = running.system({ cwd: workspace })
    await vui(['viewer', 'start'], { system: sys })
    const dir = tempDir()
    const { exit, json } = await vuiJson(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: sys,
    })
    expect(exit).toBe(0)
    expect(json).toMatchObject({ viewer: { state: 'posted', seq: 1 } })
    expect(running.spawns).toBe(1)
    const stored = readdirSync(join(stateDir, 'docs'))
    expect(stored).toHaveLength(1)
    const copy = readFileSync(join(stateDir, 'docs', stored[0] as string), 'utf8')
    expect(copy).toContain(`"cwd":${JSON.stringify(workspace)}`)
    expect(copy).toContain('"branch":"feature"')
    expect(visual(dir)).not.toContain(workspace)
    expect(visual(dir)).not.toContain('"branch"')
  })

  it('opens no pane for it', async () => {
    const { workspace, running } = placed()
    const calls: string[] = []
    const sys = running.system({
      cwd: workspace,
      files: { '/bin/orca-ide': '' },
      exec: (_file, args) => {
        calls.push(args.join(' '))
        return { ok: true, stdout: '{"ok":true,"result":{}}' }
      },
    })
    sys.env.PATH = '/bin'
    await vui(['viewer', 'start'], { system: sys })
    await vui(['show', '--host', 'file', '--dir', tempDir()], { stdin: DOC, system: sys })
    expect(calls).toEqual([])
  })

  it('posts to VUI_VIEWER_URL when one is set', async () => {
    const bodies: string[] = []
    const url = await endpoint(bodies)
    const dir = tempDir()
    const { json } = await vuiJson(['show', '--host', 'file', '--dir', dir], {
      stdin: DOC,
      system: system({ VUI_VIEWER_URL: url }),
    })
    expect(bodies).toHaveLength(1)
    expect(JSON.parse(bodies[0] as string)).toMatchObject({ meta: { generator: 'vadd-ui' } })
    expect(json).toMatchObject({ viewer: { state: 'posted', seq: 3, id: 'doc-3' } })
  })

  const refusals: [string, number, string][] = [
    ['a refused write', 401, '{}'],
    ['a document too large', 413, '{}'],
    ['a validation refusal', 422, '{"diagnostics":[]}'],
    ['a server error', 500, '{}'],
  ]

  it.each(refusals)('warns on %s and leaves the file', async (_name, status, body) => {
    const url = await endpoint([], (_, response) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(body)
    })
    const dir = tempDir()
    const options = {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir, VUI_VIEWER_URL: url }),
    }
    const { exit, stdout, stderr } = await vui(['show', '--host', 'orca-chat'], options)
    expect(exit).toBe(0)
    expect(stdout).toMatch(/^::orca-visual\{/)
    expect(stderr.trim().split('\n')).toHaveLength(1)
    expect(stderr).toContain('vui: warning:')
    expect(readdirSync(dir)).toHaveLength(1)
    const { exit: code, json } = await vuiJson(['show', '--host', 'orca-chat'], options)
    expect(code).toBe(0)
    expect(json).toMatchObject({ viewer: { state: 'failed' } })
  })

  it.each([
    [201, 'null'],
    [422, 'null'],
    [201, '[]'],
    [201, '"text"'],
    [201, '<html>'],
  ])('warns on a %i with the body %s', async (status, body) => {
    const url = await endpoint([], (_, response) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(body)
    })
    const dir = tempDir()
    const { exit, stdout, stderr } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir, VUI_VIEWER_URL: url }),
    })
    expect(exit).toBe(0)
    expect(stdout).toBe(`::orca-visual{file="${only(dir)}" title="Test run — auth module"}\n`)
    expect(stderr).toContain('vui: warning:')
  })

  it('writes the file before it posts', async () => {
    const dir = tempDir()
    const seen: number[] = []
    const url = await endpoint([], (_, response) => {
      seen.push(readdirSync(dir).length)
      response.writeHead(201, { 'Content-Type': 'application/json' })
      response.end('{"seq":1,"id":"d"}')
    })
    await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir, VUI_VIEWER_URL: url }),
    })
    expect(seen).toEqual([1])
  })

  it('stays silent when the working directory is gone, as no Viewer can be proved', async () => {
    const dir = tempDir()
    const gone = system({ ORCA_CHAT_SCRATCH_DIR: dir })
    gone.cwd = () => {
      throw Object.assign(new Error('gone'), { code: 'ENOENT' })
    }
    const { exit, stderr } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: gone,
    })
    expect(exit).toBe(0)
    expect(stderr).toBe('')
    expect(readdirSync(dir)).toHaveLength(1)
  })

  it('warns when the endpoint does not answer', async () => {
    const url = await endpoint([])
    for (const server of servers.splice(0)) server.close()
    const dir = tempDir()
    const { exit, stdout, stderr } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir, VUI_VIEWER_URL: url }),
    })
    expect(exit).toBe(0)
    expect(stdout).toMatch(/^::orca-visual/)
    expect(stderr).toContain('vui: warning:')
  })

  it('warns on a VUI_VIEWER_URL that is not a URL', async () => {
    const dir = tempDir()
    const { exit, stderr } = await vui(['show', '--host', 'orca-chat'], {
      stdin: DOC,
      system: system({ ORCA_CHAT_SCRATCH_DIR: dir, VUI_VIEWER_URL: 'nope' }),
    })
    expect(exit).toBe(0)
    expect(stderr).toContain('vui: warning:')
    expect(readdirSync(dir)).toHaveLength(1)
  })
})
