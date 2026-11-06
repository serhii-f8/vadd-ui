import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VuiDocument } from '@vadd/ui-spec'
import { describe, expect, it, vi } from 'vitest'
import { DocStore, MAX_BYTES, MAX_DOCS, slugify } from '../src/store.js'

function temp(): string {
  return mkdtempSync(join(tmpdir(), 'vui-store-'))
}

function doc(title?: unknown, extra: object = {}): VuiDocument {
  return { vui: 1, title, body: [], ...extra } as unknown as VuiDocument
}

const names = (dir: string) => readdirSync(join(dir, 'docs')).sort()

describe('slugify (§11.5)', () => {
  it.each([
    ['Test run — auth module', 'test-run-auth-module'],
    ['  Hello,   World!', 'v--hello-world-'],
    ['UPPER_case.9', 'upper-case-9'],
    ['', 'v-'],
    ['Звіт', 'v--'],
    ['a'.repeat(60), 'a'.repeat(48)],
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

  it('keeps documents owner-only, in an owner-only directory', () => {
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
    expect(header).toMatchObject({ id: '1-v-', title: null, cwd: null, branch: null })
    const typed = new DocStore(temp()).add(doc(undefined, { meta: { cwd: 1, branch: {} } }))
    expect(typed).toMatchObject({ title: null, cwd: null, branch: null })
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
    writeFileSync(join(dir, 'docs/1-a.vui.json.tmp'), 'x')
    const warn = vi.fn()
    const store = new DocStore(dir, { warn })
    expect(store.size).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'docs/notes.txt'))).toBe(true)
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
})
