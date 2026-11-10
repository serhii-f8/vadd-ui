import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { version } from '@vadd/ui'
import { COMPONENT_TYPES, type JsonValue, LIMITS, validateText } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { OUTPUT_LIMIT } from '../src/output.js'
import { BUNDLE, NOW, SCHEMA, tempDir, tempFile, vui, vuiJson } from './helpers.js'

const CLEAN = '{"title":"T","body":[{"type":"md","text":"hello"}]}'
const WARN = '{"body":[{"type":"list","items":[{"text":"a","status":"passed"}]}]}'
const INFO = '{"body":[{"type":"md","text":"a","nope":1}]}'
const INVALID = '{"body":[{"type":"tabel"}]}'
const LIMIT = JSON.stringify({ body: Array.from({ length: 401 }, () => 'x') })
const canonical = (text: string) => {
  const { document } = validateText(text, { generatedAt: NOW.toISOString() })
  return { ...document, meta: { generator: 'vadd-ui', version } }
}

const FILES: [string, string][] = [
  ['clean', CLEAN],
  ['warnings', WARN],
]

describe('every command answers --json on every path', () => {
  it.each<[string, string[], string | undefined, number]>([
    ['render clean', ['render', '--format', 'md'], CLEAN, 0],
    ['render invalid', ['render', '--format', 'md'], INVALID, 1],
    ['render parse error', ['render', '--format', 'md'], '{', 2],
    ['render empty', ['render', '--format', 'md'], '', 2],
    ['render limit', ['render', '--format', 'html'], LIMIT, 3],
    ['render bad format', ['render', '--format', 'pdf'], CLEAN, 2],
    ['render no format', ['render'], CLEAN, 2],
    ['render missing file', ['render', '/nonexistent', '--format', 'md'], undefined, 5],
    ['validate clean', ['validate'], CLEAN, 0],
    ['validate warnings', ['validate'], WARN, 0],
    ['validate strict', ['validate', '--strict'], WARN, 1],
    ['validate invalid', ['validate'], INVALID, 1],
    ['validate parse error', ['validate'], '{', 2],
    ['validate limit', ['validate'], LIMIT, 3],
    ['validate missing file', ['validate', '/nonexistent'], undefined, 5],
    ['catalog', ['catalog'], undefined, 0],
    ['catalog component', ['catalog', 'table'], undefined, 0],
    ['catalog unknown', ['catalog', 'tabel'], undefined, 2],
    ['schema', ['schema'], undefined, 0],
    ['schema extra', ['schema', 'x'], undefined, 2],
    ['extract no document', ['extract'], '<html></html>', 2],
    ['extract missing file', ['extract', '/nonexistent'], undefined, 5],
    ['unknown command', ['nope'], undefined, 2],
    ['unknown flag', ['validate', '--nope'], CLEAN, 2],
    ['no command', [], undefined, 2],
    ['help', ['--help'], undefined, 0],
    ['version', ['--version'], undefined, 0],
  ])('%s', async (_, argv, stdin, exit) => {
    const options = stdin === undefined ? {} : { stdin }
    expect((await vuiJson(argv, options)).exit).toBe(exit)
    expect((await vui(argv, options)).exit).toBe(exit)
  })

  it('reports a failure in one shape', async () => {
    const { json } = await vuiJson(['nope'])
    expect(json).toEqual({
      ok: false,
      error: { code: 'usage', message: expect.stringContaining('nope') },
    })
  })

  it('answers in JSON for an unexpected throw, with no stack', async () => {
    const options = {
      bundle: () => {
        throw new TypeError('boom')
      },
    }
    const { exit, json } = await vuiJson(['render', '--format', 'html'], {
      ...options,
      stdin: CLEAN,
    })
    expect(exit).toBe(5)
    expect(json.error).toEqual({ code: 'io', message: expect.stringContaining('boom') })
    const human = await vui(['render', '--format', 'html'], { ...options, stdin: CLEAN })
    expect(human.stderr).toBe('vui: cannot read the renderer bundle: boom\n')
  })

  it('catches what no command expected', async () => {
    const human = await vui(['schema'], {
      schema: () => {
        throw 'odd'
      },
    })
    expect(human.exit).toBe(5)
    expect(human.stderr).toMatch(/^vui: /)
    expect(human.stderr).not.toContain('\n    at ')
  })
})

describe('render', () => {
  it.each(FILES)('reads a file: %s', async (_, text) => {
    const path = tempFile('doc.vui.json', text)
    const fromFile = await vui(['render', path, '--format', 'md'])
    const fromStdin = await vui(['render', '-', '--format', 'md'], { stdin: text })
    const omitted = await vui(['render', '--format', 'md'], { stdin: text })
    expect(fromFile.exit).toBe(0)
    expect(fromFile.stdout).toBe(fromStdin.stdout)
    expect(fromFile.stdout).toBe(omitted.stdout)
  })

  it('reads CRLF', async () => {
    const text = '{\r\n"body": [\r\n"hello"\r\n]\r\n}\r\n'
    expect((await vui(['render', '--format', 'text'], { stdin: text })).stdout).toBe('hello\n')
  })

  it('reads a BOM', async () => {
    const stdin = `\ufeff${CLEAN}`
    expect((await vui(['validate'], { stdin })).exit).toBe(0)
  })

  it('writes markdown and text', async () => {
    const md = await vui(['render', '--format', 'md'], { stdin: CLEAN })
    expect(md.stdout).toBe('### T\n\nhello\n')
    const text = await vui(['render', '--format', 'text'], { stdin: CLEAN })
    expect(text.stdout).toBe('T\n\nhello\n')
    expect(text.stderr).toBe('')
  })

  it('writes the §10.1 layout with the document stamped', async () => {
    const { stdout, stderr } = await vui(['render', '--format', 'html'], { stdin: CLEAN })
    expect(stderr).toBe('')
    expect(stdout).toContain(`<meta name="generator" content="vadd-ui ${version}">`)
    expect(stdout).toContain('<title>T</title>')
    expect(stdout).toContain(`<script>${BUNDLE}</script>`)
    expect(stdout).toContain(
      `<script type="application/vui+json">${JSON.stringify(canonical(CLEAN))}</script>`,
    )
  })

  it('writes §10.2, line for line', async () => {
    const { stdout } = await vui(['render', '--format', 'html', '--cdn'], { stdin: CLEAN })
    expect(stdout).toBe(
      [
        '<!doctype html><meta charset="utf-8">',
        '<script src="https://cdn.jsdelivr.net/npm/@vadd/ui@1/dist/vui.min.js"></script>',
        `<script type="application/vui+json">${JSON.stringify(canonical(CLEAN))}</script>`,
        '',
      ].join('\n'),
    )
  })

  it('writes the CDN template', async () => {
    const { stdout } = await vui(['render', '--format', 'html', '--cdn'], { stdin: CLEAN })
    expect(stdout).toContain('@vadd/ui@1/dist/vui.min.js')
    expect(stdout).not.toContain(BUNDLE)
    expect(stdout).toContain('"generator":"vadd-ui"')
  })

  it.each([['md'], ['text']])('refuses --cdn with %s', async (format) => {
    expect((await vui(['render', '--format', format, '--cdn'], { stdin: CLEAN })).exit).toBe(2)
  })

  it.each([
    ['title', '{"title":5,"body":[]}'],
    ['subtitle', '{"subtitle":5,"body":[]}'],
    ['locale', '{"locale":5,"body":[]}'],
    ['density', '{"density":7,"body":[]}'],
    ['generatedAt', '{"generatedAt":5,"body":[]}'],
    ['meta', '{"meta":"str","body":[]}'],
  ])('survives a mistyped %s, which only warns', async (_, stdin) => {
    for (const format of ['html', 'md', 'text']) {
      const { exit, stderr } = await vui(['render', '--format', format], { stdin })
      expect(exit).toBe(0)
      expect(stderr).toMatch(/^warn /)
    }
  })

  it('prints warnings to stderr and still writes', async () => {
    const { exit, stdout, stderr } = await vui(['render', '--format', 'text'], { stdin: WARN })
    expect(exit).toBe(0)
    expect(stdout).toContain('a')
    expect(stderr).toContain('warn  /body/0/items/0/status:')
  })

  it('writes nothing on an error', async () => {
    const out = join(tempDir(), 'x.html')
    const { exit, stdout, stderr } = await vui(['render', '--format', 'html', '--out', out], {
      stdin: INVALID,
    })
    expect(exit).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('error /body/0: unknown type "tabel" (did you mean "table"?)')
    expect(() => readFileSync(out)).toThrow()
  })

  it('writes to --out, and says so on one line', async () => {
    const out = join(tempDir(), 'x.md')
    const { exit, stdout } = await vui(['render', '--format', 'md', '--out', out], { stdin: CLEAN })
    expect(exit).toBe(0)
    expect(stdout).toBe(`vui: wrote ${out} (13 bytes)\n`)
    expect(readFileSync(out, 'utf8')).toBe('### T\n\nhello\n')
  })

  it('reports --out in JSON', async () => {
    const out = join(tempDir(), 'x.md')
    const { json } = await vuiJson(['render', '--format=md', `--out=${out}`], { stdin: CLEAN })
    expect(json).toEqual({ ok: true, format: 'md', diagnostics: [], out, bytes: 13 })
  })

  it('returns the output in JSON', async () => {
    const { json } = await vuiJson(['render', '--format', 'md'], { stdin: WARN })
    expect(json.output).toContain('a')
    expect((json.diagnostics as unknown[]).length).toBeGreaterThan(0)
  })

  it('reports an unwritable target as I/O', async () => {
    const out = join(tempDir(), 'missing', 'x.html')
    const result = await vui(['render', '--format', 'html', '--out', out], { stdin: CLEAN })
    expect(result.exit).toBe(5)
    expect(result.stderr).toContain('ENOENT')
    const { exit, json } = await vuiJson(['render', '--format', 'html', '--out', out], {
      stdin: CLEAN,
    })
    expect(exit).toBe(5)
    expect(json.error).toMatchObject({ code: 'io' })
  })

  it('reports a missing bundle as I/O', async () => {
    const bundle = () => {
      throw new Error('gone')
    }
    expect((await vui(['render', '--format', 'html'], { stdin: CLEAN, bundle })).exit).toBe(5)
  })

  it('needs no bundle for --cdn, md or text', async () => {
    const bundle = () => {
      throw new Error('gone')
    }
    const html = ['render', '--format', 'html', '--cdn']
    expect((await vui(html, { stdin: CLEAN, bundle })).exit).toBe(0)
    expect((await vui(['render', '--format', 'md'], { stdin: CLEAN, bundle })).exit).toBe(0)
  })

  it.each([
    ['inline', ['--format', 'html']],
    ['CDN', ['--format', 'html', '--cdn']],
  ])('keeps C1 controls off a terminal in %s HTML, with the value intact', async (_, flags) => {
    const stdin = JSON.stringify({ title: 'a\x9b2J', body: ['b\x90c\x85d\x9ce'] })
    const { stdout } = await vui(['render', ...flags], { stdin })
    expect(stdout).not.toMatch(/[\x80-\x9f]/)
    const back = await vui(['extract'], { stdin: stdout })
    expect(JSON.parse(back.stdout).title).toBe('a\x9b2J')
    expect(JSON.parse(back.stdout).body[0].text).toBe('b\x90c\x85d\x9ce')
  })

  it('takes --out - as stdout', async () => {
    const { stdout } = await vui(['render', '--format', 'md', '--out', '-'], { stdin: CLEAN })
    expect(stdout).toBe('### T\n\nhello\n')
  })

  it('strips terminal controls from text output', async () => {
    const stdin = JSON.stringify({ title: 'a\x1b[2J', body: ['b\x9bc\x07'] })
    const { stdout } = await vui(['render', '--format', 'text'], { stdin })
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
    expect(stdout).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/)
  })

  it('keeps bytes of a replacement pattern in the document and the bundle', async () => {
    const bundle = "/*$& $1 $` $'*/"
    const stdin = JSON.stringify({ title: 'x', body: ["$& $1 $` $'"] })
    const { stdout } = await vui(['render', '--format', 'html'], { stdin, bundle })
    expect(stdout).toContain(`<script>${bundle}</script>`)
    expect(stdout).toContain(`"text":"$& $1 $\` $'"`)
  })
})

describe('input limit, in bytes', () => {
  // The field limit is far below the input limit, so comments carry the size.
  const padded = (bytes: number, filler = 'x') => {
    const room = bytes - Buffer.byteLength(CLEAN) - 4
    const unit = Buffer.byteLength(filler)
    return `/*${filler.repeat(Math.floor(room / unit))}*/${CLEAN}`
  }

  it('builds fixtures of the size asked', () => {
    expect(Buffer.byteLength(padded(LIMITS.inputBytes))).toBeLessThanOrEqual(LIMITS.inputBytes)
  })

  it('takes exactly the limit', async () => {
    const stdin = `${padded(LIMITS.inputBytes)}\n\n\n\n`.slice(0, LIMITS.inputBytes)
    expect(Buffer.byteLength(stdin)).toBe(LIMITS.inputBytes)
    expect((await vui(['validate'], { stdin })).exit).toBe(0)
  })

  it('refuses one byte more', async () => {
    const stdin = `${padded(LIMITS.inputBytes)}\n\n\n\n\n`.slice(0, LIMITS.inputBytes + 1)
    const { exit, stdout } = await vui(['validate'], { stdin })
    expect(exit).toBe(3)
    expect(stdout).toContain('limit')
  })

  it('refuses bytes that are not UTF-8, rather than alter them', async () => {
    const stdin = Buffer.concat([
      Buffer.from('{"body":["a'),
      Buffer.from([0xff]),
      Buffer.from('b"]}'),
    ])
    const { exit, stdout, stderr } = await vui(['render', '--format', 'text'], { stdin })
    expect(exit).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toBe('vui: input is not valid UTF-8\n')
    const { json } = await vuiJson(['validate'], { stdin })
    expect(json.error).toMatchObject({ code: 'parse-error' })
  })

  it('counts a multi-byte input by bytes', async () => {
    const chars = Math.floor(LIMITS.inputBytes / 2) + 1
    const stdin = `/*${'é'.repeat(chars)}*/${CLEAN}`
    expect(stdin.length).toBeLessThan(LIMITS.inputBytes)
    expect((await vui(['validate'], { stdin })).exit).toBe(3)
  })

  it('reports it the same from a file and as JSON', async () => {
    const path = tempFile('big', 'x'.repeat(LIMITS.inputBytes + 1))
    const { exit, json } = await vuiJson(['render', path, '--format', 'md'])
    expect(exit).toBe(3)
    expect(json.diagnostics).toEqual([expect.objectContaining({ code: 'limit-input-size' })])
  })
})

describe('output limit, in bytes', () => {
  const room = async () => {
    const { stdout } = await vui(['render', '--format', 'html'], { stdin: CLEAN, bundle: '' })
    return OUTPUT_LIMIT - Buffer.byteLength(stdout)
  }

  it('is 500 KiB', () => {
    expect(OUTPUT_LIMIT).toBe(512_000)
  })

  it('takes exactly the limit', async () => {
    const bundle = 'x'.repeat(await room())
    const { exit, stdout } = await vui(['render', '--format', 'html'], { stdin: CLEAN, bundle })
    expect(exit).toBe(0)
    expect(Buffer.byteLength(stdout)).toBe(OUTPUT_LIMIT)
  })

  it('refuses one byte more, writing nothing', async () => {
    const bundle = 'x'.repeat((await room()) + 1)
    const out = join(tempDir(), 'x.html')
    const argv = ['render', '--format', 'html', '--out', out]
    const { exit, stdout, stderr } = await vui(argv, { stdin: CLEAN, bundle })
    expect(exit).toBe(3)
    expect(stdout).toBe('')
    expect(stderr).toContain('512001')
    expect(() => readFileSync(out)).toThrow()
    const json = await vuiJson(argv, { stdin: CLEAN, bundle })
    expect(json.exit).toBe(3)
    expect(json.json.error).toMatchObject({ code: 'limit-output-size' })
  })

  it('measures bytes, so a multi-byte bundle counts in full', async () => {
    const bundle = 'é'.repeat(Math.ceil((await room()) / 2) + 1)
    expect(bundle.length).toBeLessThan(OUTPUT_LIMIT)
    const { exit } = await vui(['render', '--format', 'html'], { stdin: CLEAN, bundle })
    expect(exit).toBe(3)
  })

  it('catches a legal document that only grows past the limit when escaped', async () => {
    const texts = Array.from({ length: 13 }, () => '<!--'.repeat(4_900))
    const stdin = JSON.stringify({ body: texts.map((text) => ({ type: 'md', text })) })
    expect(Buffer.byteLength(stdin)).toBeLessThan(LIMITS.inputBytes)
    const { exit } = await vui(['render', '--format', 'html'], { stdin })
    expect(exit).toBe(3)
  })

  it('limits every format, for what only the renderer grows', async () => {
    const columns = Array.from({ length: 30 }, (_, i) => `C${i}:bytes`)
    const rows = Array.from({ length: 3_900 }, () => Array.from({ length: 30 }, () => 1))
    const stdin = JSON.stringify({ body: [{ type: 'table', columns, rows }] })
    expect((await vui(['validate'], { stdin })).exit).toBe(0)
    expect((await vui(['render', '--format', 'md'], { stdin })).exit).toBe(3)
    expect((await vui(['render', '--format', 'text'], { stdin })).exit).toBe(3)
  })
})

describe('validate', () => {
  it('prints nothing for a clean document', async () => {
    expect(await vui(['validate'], { stdin: CLEAN })).toEqual({ exit: 0, stdout: '', stderr: '' })
  })

  it('reads a file', async () => {
    const path = tempFile('a.json', WARN)
    expect((await vui(['validate', path])).stdout).toContain('warn ')
  })

  it('prints diagnostics to stdout', async () => {
    const { stdout, stderr } = await vui(['validate'], { stdin: INVALID })
    expect(stdout).toBe('error /body/0: unknown type "tabel" (did you mean "table"?)\n')
    expect(stderr).toBe('')
  })

  it('prints a parse error with line and column', async () => {
    const { exit, stdout } = await vui(['validate'], { stdin: '{\n  "a" 1\n}' })
    expect(exit).toBe(2)
    expect(stdout).toMatch(/^error: line 2, column 7: /)
  })

  it('treats a warning as an error with --strict', async () => {
    expect((await vui(['validate', '--strict'], { stdin: WARN })).exit).toBe(1)
  })

  it('shows info only with --strict, and it never fails', async () => {
    expect((await vui(['validate'], { stdin: INFO })).stdout).toBe('')
    const strict = await vui(['validate', '--strict'], { stdin: INFO })
    expect(strict.exit).toBe(0)
    expect(strict.stdout).toContain('info  /body/0/nope:')
  })

  it('reads an empty input as a parse error', async () => {
    const { exit, stdout } = await vui(['validate'], { stdin: '' })
    expect(exit).toBe(2)
    expect(stdout).toMatch(/^error: line 1, column 1: /)
  })

  it('prints at most 20 lines and a count', async () => {
    const stdin = JSON.stringify({ body: Array.from({ length: 30 }, () => ({ type: 'tabel' })) })
    const lines = (await vui(['validate'], { stdin })).stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(21)
    expect(lines[20]).toBe('and 10 more')
  })

  it('keeps the count true past the cap in ui-spec', async () => {
    const stdin = JSON.stringify({
      body: Array.from({ length: 399 }, () => ({
        type: 'list',
        items: Array.from({ length: 10 }, () => ({ text: 'a', status: 'passed' })),
      })),
    })
    const lines = (await vui(['validate'], { stdin })).stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(21)
    expect(lines[20]).toBe('and 3970 more')
  })

  it('shows an error found after the cap filled with warnings', async () => {
    const rows = Array.from({ length: 1_500 }, () => ['x'])
    const table = { type: 'table', columns: ['A:ms'], rows }
    const stdin = JSON.stringify({ body: [table, { type: 'tabel' }] })
    const { exit, stdout } = await vui(['validate'], { stdin })
    expect(exit).toBe(1)
    expect(stdout.split('\n')[0]).toMatch(/^error \/body\/1: unknown type/)
    expect(stdout).toMatch(/^warn /m)
  })

  it('shows an error found after the cap filled with notices', async () => {
    const fields = Object.fromEntries(Array.from({ length: 1_300 }, (_, i) => [`k${i}`, 1]))
    const stdin = JSON.stringify({
      body: [{ type: 'md', text: 'a', ...fields }, { type: 'tabel' }],
    })
    const { exit, stdout } = await vui(['validate'], { stdin })
    expect(exit).toBe(1)
    expect(stdout).toBe('error /body/1: unknown type "tabel" (did you mean "table"?)\n')
  })

  it('gives the full list in JSON', async () => {
    const stdin = JSON.stringify({ body: Array.from({ length: 30 }, () => ({ type: 'tabel' })) })
    const { json } = await vuiJson(['validate'], { stdin })
    expect(json.diagnostics).toHaveLength(30)
  })

  it('escapes a key with control characters in the path', async () => {
    const stdin = JSON.stringify({ body: [{ type: 'md', text: 'a', 'k\n\x1b[2J': 1 }] })
    const { stdout } = await vui(['validate', '--strict'], { stdin })
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
    expect(stdout.trimEnd()).not.toMatch(/[\x00-\x1f]/)
    expect(stdout).toContain('k\\u000a\\u001b[2J')
  })

  it('keeps C1 out of JSON output as raw bytes', async () => {
    const stdin = JSON.stringify({ body: [{ type: 'md', text: 'a', 'k\x9b2J': 1 }] })
    const raw = await vui(['validate', '--json'], { stdin })
    expect(raw.stdout).not.toContain('\x9b')
    expect(JSON.parse(raw.stdout).diagnostics[0].path).toBe('/body/0/k\x9b2J')
  })
})

describe('catalog', () => {
  it('prints one line per component', async () => {
    const { stdout } = await vui(['catalog'])
    const lines = stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(24)
    expect(lines.map((line) => line.split(' ')[0])).toEqual([...COMPONENT_TYPES])
  })

  it.each(COMPONENT_TYPES.map((name) => [name]))('prints %s with an example', async (name) => {
    const { exit, stdout } = await vui(['catalog', name])
    expect(exit).toBe(0)
    expect(stdout).toContain('fields:')
    const example = stdout.split('example: ')[1] as string
    expect(validateText(example).diagnostics).toEqual([])
  })

  it('prints fields, defaults and sub-shapes', async () => {
    const { stdout } = await vui(['catalog', 'table'])
    expect(stdout).toContain('\ncolumns: Column[], required\n')
    expect(stdout).toContain('\npageSize: integer ≥1, default 25\n')
    expect(stdout).toContain('\nColumn:\nkey: string, required\n')
    expect(stdout).toContain('common: id, title, note, tone, span, fold')
  })

  it('tags chart fields by kind', async () => {
    const { stdout } = await vui(['catalog', 'chart'])
    expect(stdout).toContain('\nvalues: number[], required (spark)\n')
  })

  it('answers in JSON', async () => {
    const all = await vuiJson(['catalog'])
    expect(all.json.components).toHaveLength(24)
    const one = await vuiJson(['catalog', 'kv'])
    expect(one.json.component).toMatchObject({ name: 'kv' })
  })

  it('suggests a near name', async () => {
    const { exit, stderr } = await vui(['catalog', 'tabel'])
    expect(exit).toBe(2)
    expect(stderr).toBe('vui: unknown component "tabel" (did you mean "table"?)\n')
  })

  it('escapes a hostile file name in a failure', async () => {
    const { stderr } = await vui(['validate', '/nonexistent/a\x1b[2J\nb'])
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
    expect(stderr.trimEnd()).not.toMatch(/[\x00-\x1f]/)
  })

  it('escapes a hostile name', async () => {
    const { stderr } = await vui(['catalog', 'a\x1b[2J\nb'])
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
    expect(stderr.trimEnd()).not.toMatch(/[\x00-\x1f]/)
  })

  it('finds no inherited name', async () => {
    expect((await vui(['catalog', '__proto__'])).exit).toBe(2)
  })
})

describe('schema', () => {
  it('prints the schema as it is', async () => {
    expect(await vui(['schema'])).toEqual({ exit: 0, stdout: SCHEMA, stderr: '' })
  })

  it('wraps it in JSON', async () => {
    const { json } = await vuiJson(['schema'])
    expect(json).toEqual({ ok: true, schema: { $id: 'vui' } })
  })

  it('reports a missing schema as I/O', async () => {
    const schema = () => {
      throw new Error('gone')
    }
    expect(await vui(['schema'], { schema })).toMatchObject({ exit: 5 })
  })
})

describe('extract', () => {
  const rendered = async (input: JsonValue) => {
    const { stdout, exit } = await vui(['render', '--format', 'html'], {
      stdin: JSON.stringify(input),
    })
    expect(exit).toBe(0)
    return stdout
  }

  it('round-trips, from a file and from stdin', async () => {
    const html = await rendered({ title: 'T', body: ['hello'] })
    const path = tempFile('v.html', html)
    const expected = `${JSON.stringify(canonical('{"title":"T","body":["hello"]}'))}\n`
    expect((await vui(['extract', path])).stdout).toBe(expected)
    expect((await vui(['extract'], { stdin: html })).stdout).toBe(expected)
    expect((await vui(['extract', '-'], { stdin: html })).stdout).toBe(expected)
  })

  it('is deterministic with the injected clock', async () => {
    const html = await rendered({ body: [] })
    const { document } = (await vuiJson(['extract'], { stdin: html })).json as {
      document: { generatedAt: string }
    }
    expect(document.generatedAt).toBe(NOW.toISOString())
  })

  it.each([
    ['closing tags', '</script></SCRIPT></style>'],
    ['comment marks', '<!-- --> <!--'],
    ['an escaped close as text', '<\\/script>'],
    ['a backslash before a slash', 'C:\\/x'],
    ['separators', 'a\u2028b\u2029c'],
    ['separators as written text', '\\u2028 \\u2029 \\u003c!--'],
    ['replacement patterns', "$& $1 $` $'"],
    ['a script tag in single quotes', "<script type='application/vui+json'>x"],
    ['a double-escape trap', '<!--<script>'],
    ['non-ASCII', 'Тест — 😀'],
  ])('keeps %s byte for byte', async (_, text) => {
    const input = { title: text, subtitle: text, body: [text] }
    const html = await rendered(input)
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    const { exit, stdout } = await vui(['extract'], { stdin: html })
    expect(exit).toBe(0)
    expect(stdout).toBe(`${JSON.stringify(canonical(JSON.stringify(input)))}\n`)
  })

  it('reads a CDN file, and a relaxed document in one', async () => {
    const html = await vui(['render', '--format', 'html', '--cdn'], { stdin: CLEAN })
    expect((await vui(['extract'], { stdin: html.stdout })).exit).toBe(0)
    const relaxed = `<script type="application/vui+json">{body: ['a',],}</script>`
    expect((await vui(['extract'], { stdin: relaxed })).stdout).toBe('{"body":["a"]}\n')
  })

  it('writes a C1 control as an escape, keeping the value', async () => {
    const html = `<script type="application/vui+json">{"a":"\x9b2J"}</script>`
    const { stdout } = await vui(['extract'], { stdin: html })
    expect(stdout).toBe('{"a":"\\u009b2J"}\n')
  })

  it('keeps __proto__ as data', async () => {
    const html = `<script type="application/vui+json">{"__proto__":{"x":1}}</script>`
    const { stdout } = await vui(['extract'], { stdin: html })
    expect(stdout).toBe('{"__proto__":{"x":1}}\n')
    expect(({} as { x?: number }).x).toBeUndefined()
  })

  it('fails cleanly with no document', async () => {
    const { exit, stdout, stderr } = await vui(['extract'], { stdin: '<p>hi</p>' })
    expect(exit).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toBe('vui: no embedded document\n')
  })

  it('refuses several documents, naming their lines', async () => {
    const one = '<script type="application/vui+json">{}</script>'
    const { exit, stdout, stderr } = await vui(['extract'], { stdin: `${one}\n\n${one}` })
    expect(exit).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toContain('2 embedded documents, at lines 1, 3')
    expect((await vuiJson(['extract'], { stdin: `${one}${one}` })).json.error).toMatchObject({
      code: 'several-documents',
    })
  })

  it('reports bad embedded text where it sits in the file', async () => {
    const html =
      '<!doctype html>\n<body>\n<script type="application/vui+json">{\n  bad bad\n}</script>'
    const { exit, stderr } = await vui(['extract'], { stdin: html })
    expect(exit).toBe(2)
    expect(stderr).toMatch(/^vui: line 4, column \d+: /)
  })

  it('fails on an empty document', async () => {
    const { exit } = await vui(['extract'], {
      stdin: '<script type="application/vui+json"></script>',
    })
    expect(exit).toBe(2)
  })

  it('exits 3 on a document nested past the parser', async () => {
    const deep = `${'['.repeat(200)}${']'.repeat(200)}`
    const stdin = `<script type="application/vui+json">${deep}</script>`
    const { exit, json } = await vuiJson(['extract'], { stdin })
    expect(exit).toBe(3)
    expect(json.error).toMatchObject({ code: 'limit-depth' })
  })

  it('exits 3 on a file over 500 KiB', async () => {
    const path = tempFile('big.html', 'x'.repeat(OUTPUT_LIMIT + 1))
    const { exit, json } = await vuiJson(['extract', path])
    expect(exit).toBe(3)
    expect(json.error).toMatchObject({ code: 'limit-file-size' })
  })

  it('reads a file of exactly 500 KiB', async () => {
    const one = '<script type="application/vui+json">{}</script>'
    const path = tempFile('big.html', `${one}${' '.repeat(OUTPUT_LIMIT - one.length)}`)
    expect((await vui(['extract', path])).exit).toBe(0)
  })

  it('names only the first few documents of many', async () => {
    const one = '<script type="application/vui+json">{}</script>\n'
    const { exit, stderr } = await vui(['extract'], { stdin: one.repeat(500) })
    expect(exit).toBe(2)
    expect(stderr).toBe(
      'vui: 500 embedded documents, at lines 1, 2, 3, 4, 5 and 495 more; a visual file holds one\n',
    )
  })

  it('escapes a hostile message', async () => {
    const stdin = '<script type="application/vui+json">"\x1b[2J</script>'
    const { stderr } = await vui(['extract'], { stdin })
    expect(stderr).not.toContain('\x1b')
  })
})

describe('input from a stream', () => {
  it('stops on a terminal', async () => {
    const { exit, stderr } = await vui(['validate'], { tty: true })
    expect(exit).toBe(2)
    expect(stderr).toContain('no input')
  })

  it('reads a stream', async () => {
    const stdin = Readable.from([Buffer.from(CLEAN)])
    expect((await vui(['validate'], { stdin })).exit).toBe(0)
  })
})

describe('help and version', () => {
  it('prints usage, listing what exists', async () => {
    const { exit, stdout } = await vui(['--help'])
    expect(exit).toBe(0)
    const commands = ['show', 'viewer', 'doctor', 'render', 'validate', 'catalog', 'schema']
    for (const command of [...commands, 'extract']) {
      expect(stdout).toContain(`vui ${command}`)
    }
    expect(stdout).toContain('4 no host')
    expect(stdout).not.toContain('vui bench')
  })

  it('prints the version', async () => {
    expect((await vui(['--version'])).stdout).toBe(`${version}\n`)
    expect((await vuiJson(['--version'])).json.version).toBe(version)
  })
})
