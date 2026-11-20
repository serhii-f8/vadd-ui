import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VuiDocument } from '@vadd/ui-spec'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocStore, MAX_BYTES, MAX_DOCS, slugify } from '../src/store.js'
import { NO_POSIX_MODES } from './platform.js'

// A full disk cannot be made on demand, so one armed call on the temporary file throws (the
// pattern of `ui-cli`'s file-host test). A failed write still leaves a partial file, as one does.
type Step = 'writeFileSync' | 'utimesSync' | 'renameSync'
const failure = vi.hoisted(() => ({ step: undefined as string | undefined }))
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const armed = (step: Step, path: unknown) => {
    if (failure.step !== step || !String(path).endsWith('.tmp')) return false
    failure.step = undefined
    return true
  }
  const full = () => Object.assign(new Error('no space left'), { code: 'ENOSPC' })
  return {
    ...real,
    writeFileSync: ((...args: Parameters<typeof real.writeFileSync>) => {
      if (!armed('writeFileSync', args[0])) return real.writeFileSync(...args)
      real.writeFileSync(args[0], 'partial', args[2])
      throw full()
    }) as typeof real.writeFileSync,
    utimesSync: ((...args: Parameters<typeof real.utimesSync>) => {
      if (armed('utimesSync', args[0])) throw full()
      return real.utimesSync(...args)
    }) as typeof real.utimesSync,
    renameSync: ((...args: Parameters<typeof real.renameSync>) => {
      if (armed('renameSync', args[0])) throw full()
      return real.renameSync(...args)
    }) as typeof real.renameSync,
  }
})

afterEach(() => {
  failure.step = undefined
})

function temp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vui-store-')))
}

function doc(title?: unknown, extra: object = {}): VuiDocument {
  return { vui: 1, title, body: [], ...extra } as unknown as VuiDocument
}

const names = (dir: string) => readdirSync(join(dir, 'docs')).sort()

describe('slugify (§11.5, VD-159)', () => {
  it.each([
    ['Test run — auth module', 'test-run-auth-module'],
    ['  Hello,   World!', 'v--hello-world'],
    ['UPPER_case.9', 'upper-case-9'],
    ['', 'v'],
    ['Тест', 'v'],
    ['Звіт', 'v'],
    ['!Hi', 'v--hi'],
    ['Release check', 'release-check'],
    ['a'.repeat(60), 'a'.repeat(48)],
    [`!${'a'.repeat(60)}`, `v--${'a'.repeat(45)}`],
  ])('%j', (text, slug) => {
    expect(slugify(text)).toBe(slug)
  })
})

describe('DocStore.add', () => {
  it('numbers from 1 and writes docs/<seq>-<slug>.vui.json', () => {
    const dir = temp()
    const store = new DocStore(dir)
    expect(store.add(doc('First one')).seq).toBe(1)
    const second = store.add(doc('Second'))
    expect(second.seq).toBe(2)
    expect(second.id).toBe('2-second')
    expect(names(dir)).toEqual(['1-first-one.vui.json', '2-second.vui.json'])
    expect(JSON.parse(readFileSync(join(dir, 'docs/2-second.vui.json'), 'utf8'))).toEqual(
      doc('Second'),
    )
  })

  it('gives a non-Latin title the id <seq>-v (VD-159)', () => {
    expect(new DocStore(temp()).add(doc('Звіт')).id).toBe('1-v')
  })

  it.skipIf(NO_POSIX_MODES)('keeps documents owner-only, in an owner-only directory', () => {
    const dir = join(temp(), 'nested/state')
    const store = new DocStore(dir)
    store.add(doc('x'))
    expect(statSync(join(dir, 'docs/1-x.vui.json')).mode & 0o777).toBe(0o600)
    expect(statSync(join(dir, 'docs')).mode & 0o777).toBe(0o700)
  })

  it('takes the header from the document and the clock', () => {
    const store = new DocStore(temp(), { now: () => Date.parse('2026-11-06T10:00:00.000Z') })
    const meta = { cwd: '/repo/pkg', branch: 'main' }
    expect(store.add(doc('T', { meta }))).toEqual({
      seq: 1,
      id: '1-t',
      title: 'T',
      createdAt: '2026-11-06T10:00:00.000Z',
      cwd: '/repo/pkg',
      branch: 'main',
    })
  })

  it('reads anything mistyped as null, with a valid id', () => {
    const header = new DocStore(temp()).add(doc(7, { meta: 'text' }))
    expect(header).toMatchObject({ id: '1-v', title: null, cwd: null, branch: null })
    const typed = new DocStore(temp()).add(doc(undefined, { meta: { cwd: 1, branch: {} } }))
    expect(typed).toMatchObject({ title: null, cwd: null, branch: null })
  })

  it('clips a long cwd or branch, since meta escapes the string limit', () => {
    const long = 'x'.repeat(250_000)
    const header = new DocStore(temp()).add(doc('T', { meta: { cwd: long, branch: long } }))
    expect(header.cwd).toHaveLength(2000)
    expect(header.branch).toHaveLength(2000)
  })

  it('gives a name only of safe characters to any title', () => {
    const header = new DocStore(temp()).add(doc('../../etc/passwd\0 Звіт'))
    expect(header.id).toMatch(/^\d+-[a-z0-9-]+$/)
  })

  it('leaves nothing behind and burns no number when a write fails', () => {
    const dir = temp()
    const store = new DocStore(dir)
    store.add(doc('a'))
    rmSync(join(dir, 'docs'), { recursive: true })
    expect(() => store.add(doc('b'))).toThrow()
    mkdirSync(join(dir, 'docs'))
    expect(store.add(doc('c')).seq).toBe(2)
    expect(store.after(0, 10).map(({ id }) => id)).toEqual(['1-a', '2-c'])
  })
})

describe('retention', () => {
  it('has the §4.1 limits', () => {
    expect(MAX_DOCS).toBe(500)
    expect(MAX_BYTES).toBe(50 * 1024 * 1024)
  })

  it('keeps the newest 500 documents', () => {
    const dir = temp()
    const store = new DocStore(dir)
    for (let i = 0; i < 502; i += 1) store.add(doc('n'))
    expect(store.size).toBe(500)
    expect(names(dir)).toHaveLength(500)
    expect(store.header('1-n')).toBeUndefined()
    expect(store.header('2-n')).toBeUndefined()
    expect(store.read('2-n')).toBeUndefined()
    expect(store.header('3-n')?.seq).toBe(3)
  })

  it('keeps at most 50 MiB, the smaller limit winning', () => {
    const dir = temp()
    const store = new DocStore(dir)
    const body = [{ type: 'code', text: 'x'.repeat(256 * 1024) }]
    for (let i = 0; i < 201; i += 1) store.add(doc('n', { body }))
    const total = names(dir).reduce((sum, name) => sum + statSync(join(dir, 'docs', name)).size, 0)
    expect(total).toBeLessThanOrEqual(MAX_BYTES)
    expect(store.size).toBe(199)
    expect(store.after(0, 1)[0]?.seq).toBe(3)
  })
})

describe('reading', () => {
  it('pages after a seq, ascending', () => {
    const store = new DocStore(temp())
    for (const title of ['a', 'b', 'c', 'd']) store.add(doc(title))
    expect(store.after(1, 2).map(({ seq }) => seq)).toEqual([2, 3])
    expect(store.after(4, 2)).toEqual([])
  })

  it('reads a document as stored', () => {
    const store = new DocStore(temp())
    const { id } = store.add(doc('a'))
    expect(JSON.parse(store.read(id) as string).title).toBe('a')
    expect(store.read('nope')).toBeUndefined()
  })

  it('answers undefined for a file removed behind its back', () => {
    const dir = temp()
    const store = new DocStore(dir)
    const { id } = store.add(doc('a'))
    rmSync(join(dir, 'docs', `${id}.vui.json`))
    expect(store.read(id)).toBeUndefined()
  })
})

describe('reload', () => {
  it('continues the numbering and keeps each header', () => {
    const dir = temp()
    const first = new DocStore(dir, { now: () => 1_000_000 })
    first.add(doc('a', { meta: { cwd: '/c', branch: 'b' } }))
    first.add(doc('b'))
    const again = new DocStore(dir)
    expect(again.after(0, 10)).toEqual(first.after(0, 10))
    expect(again.add(doc('c')).seq).toBe(3)
  })

  it('takes createdAt from the file time', () => {
    const dir = temp()
    new DocStore(dir).add(doc('a'))
    const when = new Date('2026-01-02T03:04:05.000Z')
    utimesSync(join(dir, 'docs/1-a.vui.json'), when, when)
    expect(new DocStore(dir).after(0, 1)[0]?.createdAt).toBe(when.toISOString())
  })

  it('orders by number, not by name', () => {
    const dir = temp()
    const first = new DocStore(dir)
    for (let i = 0; i < 11; i += 1) first.add(doc('n'))
    const seqs = new DocStore(dir).after(0, 20).map(({ seq }) => seq)
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('skips a corrupt file with a warning, and never reuses its number', () => {
    const dir = temp()
    new DocStore(dir).add(doc('a'))
    writeFileSync(join(dir, 'docs/7-x.vui.json'), '{not json')
    const warn = vi.fn()
    const store = new DocStore(dir, { warn })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('7-x.vui.json')
    expect(store.header('7-x')).toBeUndefined()
    expect(store.add(doc('b')).seq).toBe(8)
  })

  it('skips a file that is valid JSON but no document', () => {
    const dir = temp()
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/1-x.vui.json'), '[1]')
    const warn = vi.fn()
    expect(new DocStore(dir, { warn }).size).toBe(0)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('ignores files it does not own', () => {
    const dir = temp()
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/notes.txt'), 'x')
    const warn = vi.fn()
    const store = new DocStore(dir, { warn })
    expect(store.size).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'docs/notes.txt'))).toBe(true)
  })

  it('removes what a crash mid-write left', () => {
    const dir = temp()
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/1-a.vui.json.tmp'), 'partial')
    expect(new DocStore(dir).size).toBe(0)
    expect(names(dir)).toEqual([])
  })

  it('applies retention at load', () => {
    const dir = temp()
    const store = new DocStore(dir)
    for (let i = 0; i < 500; i += 1) store.add(doc('n'))
    writeFileSync(join(dir, 'docs/501-n.vui.json'), JSON.stringify(doc('n')))
    const again = new DocStore(dir)
    expect(again.size).toBe(500)
    expect(again.after(0, 1)[0]?.seq).toBe(2)
    expect(names(dir)).not.toContain('1-n.vui.json')
  })

  it.each(['writeFileSync', 'utimesSync', 'renameSync'] as const)(
    'removes its temporary file when %s fails, and rethrows (the 507 path)',
    (step) => {
      const dir = temp()
      const store = new DocStore(dir)
      store.add(doc('kept'))
      failure.step = step
      expect(() => store.add(doc('lost'))).toThrow('no space left')
      expect(failure.step).toBeUndefined()
      expect(names(dir)).toEqual(['1-kept.vui.json'])
      expect(store.size).toBe(1)
      expect(store.add(doc('next')).seq).toBe(2)
    },
  )
})

describe('named entries (--replace)', () => {
  it('keeps a name beside its document', () => {
    const dir = temp()
    const header = new DocStore(dir).add(doc('Build'), 'build')
    expect(readFileSync(join(dir, `docs/${header.id}.name`), 'utf8')).toBe('build')
    expect(names(dir)).toEqual(['1-build.name', '1-build.vui.json'])
  })

  it('replaces the newest entry of that name in place: same seq and id, new content', () => {
    const dir = temp()
    let clock = Date.parse('2026-11-20T10:00:00.000Z')
    const store = new DocStore(dir, { now: () => clock })
    store.add(doc('Build 1'), 'build')
    store.add(doc('Other'))
    clock += 60_000
    const header = store.replace('build', doc('Build 2'))
    expect(header).toMatchObject({ seq: 1, id: '1-build-1', title: 'Build 2' })
    expect(header?.createdAt).toBe('2026-11-20T10:01:00.000Z')
    expect(JSON.parse(store.read('1-build-1') ?? 'null')).toEqual(doc('Build 2'))
    expect(store.size).toBe(2)
    expect(store.after(0, 10).map(({ title }) => title)).toEqual(['Build 2', 'Other'])
  })

  it('finds a name again after a restart', () => {
    const dir = temp()
    new DocStore(dir).add(doc('Build 1'), 'build')
    const header = new DocStore(dir).replace('build', doc('Build 2'))
    expect(header?.seq).toBe(1)
    expect(new DocStore(dir).after(0, 10).map(({ title }) => title)).toEqual(['Build 2'])
  })

  it('has nothing to replace for a name never stored', () => {
    const store = new DocStore(temp())
    store.add(doc('Build'))
    expect(store.replace('build', doc('x'))).toBeUndefined()
  })

  it('counts the new size against retention', () => {
    const dir = temp()
    const store = new DocStore(dir)
    store.add(doc('a'), 'a')
    store.replace('a', doc('a', { body: ['x'.repeat(1000)] }))
    const total = names(dir)
      .filter((name) => name.endsWith('.vui.json'))
      .reduce((sum, name) => sum + statSync(join(dir, 'docs', name)).size, 0)
    expect(total).toBeGreaterThan(1000)
  })

  it('removes the name with an evicted document', () => {
    const dir = temp()
    const store = new DocStore(dir)
    store.add(doc('first'), 'first')
    for (let i = 0; i < MAX_DOCS; i++) store.add(doc('n'))
    expect(names(dir).some((name) => name.endsWith('.name'))).toBe(false)
    expect(store.replace('first', doc('x'))).toBeUndefined()
  })
})
