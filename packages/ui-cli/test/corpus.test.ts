import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { COMPONENT_TYPES, type JsonValue, parse, validateText } from '@vadd/ui-spec'
import { describe, expect, it } from 'vitest'
import { type BenchCase, DEFAULT_CORPUS, readCorpus } from '../src/bench/corpus.js'
import { vuiJson } from './helpers.js'

// VD-151: the corpus `vui bench` measures, and what keeps its three encodings equal.

const cases = readCorpus(DEFAULT_CORPUS)

/** Fields whose strings are vocabulary, not content: every encoding spells them its own way. */
const VOCABULARY = new Set([
  'type',
  'kind',
  'status',
  'tone',
  'format',
  'yFormat',
  'xFormat',
  'deltaFormat',
  'align',
  'cell',
  'width',
  'legend',
  'height',
  'lang',
  'better',
  'effort',
  'risk',
  'gap',
  'id',
])

/** Every content string in a parsed document. */
function contentStrings(value: JsonValue, key = '', out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (VOCABULARY.has(key)) return out
    // A column's `Label:format` suffix is a format; a diff's A|M|D|R is vocabulary.
    if (key === 'columns') out.push(value.split(':')[0] as string)
    else if (!(key === 'files' && /^[AMDR]$/.test(value))) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    // A `kv` tuple's third element is a format, and a formatted value is spelled per encoding.
    if (key === 'pairs') {
      for (const pair of value) {
        if (!Array.isArray(pair)) continue
        if (typeof pair[0] === 'string') out.push(pair[0])
        if (pair.length < 3 && typeof pair[1] === 'string') out.push(pair[1])
      }
      return out
    }
    // Flow edges repeat node ids, except for their label.
    if (key === 'edges') {
      for (const edge of value)
        if (Array.isArray(edge) && typeof edge[2] === 'string') out.push(edge[2])
      return out
    }
    for (const item of value) {
      // A positional `stats` item holds a label and a value; the rest is vocabulary (VD-164).
      if (key === 'items' && Array.isArray(item) && typeof item[0] === 'string') {
        for (const text of item.slice(0, 2)) if (typeof text === 'string') out.push(text)
      } else contentStrings(item, key, out)
    }
    return out
  }
  if (value !== null && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      // Object keys of `pairs`, chart `series` and `hunks` are labels.
      if (key === 'pairs' || key === 'series' || key === 'hunks') out.push(name)
      contentStrings(item, name, out)
    }
  }
  return out
}

function types(value: JsonValue, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) types(item, out)
  else if (value !== null && typeof value === 'object') {
    if (typeof value.type === 'string') out.add(value.type)
    for (const item of Object.values(value)) types(item, out)
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }

/** Inline marks, block markers and status tokens removed; whitespace collapsed. */
function normalize(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/:[a-z]+:/g, ' ')
    .replace(/\*\*|`/g, '')
    .replace(/^[ \t]*(#{1,6}|>|[-*]|\d+\.)[ \t]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Inline elements join their neighbors; every other tag breaks the line. */
const INLINE = /<\/?(strong|b|em|i|code|span|a|small|time|mark)(\s[^>]*)?>/g

function htmlText(html: string): string {
  // `<title>` repeats the heading, so it must not stand in for the body.
  const body = html
    .replace(/<(style|script|title)[\s\S]*?<\/\1>/g, '\n')
    .replace(INLINE, '')
    .replace(/<[^>]+>/g, '\n')
  return body.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITIES[name] as string)
}

/** What a case's VUI says that a reader could check in the others, beyond its strings. */
function rowCounts(
  value: JsonValue,
  out = { table: 0, chart: 0 },
): { table: number; chart: number } {
  if (Array.isArray(value)) for (const item of value) rowCounts(item, out)
  else if (value !== null && typeof value === 'object') {
    if (value.type === 'table' && Array.isArray(value.rows)) out.table += value.rows.length
    if (value.type === 'chart' && Array.isArray(value.x)) out.chart += value.x.length
    for (const item of Object.values(value)) rowCounts(item, out)
  }
  return out
}

/** GFM body rows: table lines that are neither a header nor a delimiter row. */
function markdownRows(md: string): number {
  const lines = md.split('\n').filter((line) => line.trimStart().startsWith('|'))
  const delimiters = lines.filter((line) => /^[\s|:-]+$/.test(line)).length
  return lines.length - 2 * delimiters
}

function missing(item: BenchCase): { md: string[]; html: string[] } {
  const md = normalize(item.md)
  const html = normalize(htmlText(item.html))
  const strings = contentStrings(parsed(item)).map(normalize).filter(Boolean)
  return {
    md: strings.filter((text) => !md.includes(text)),
    html: strings.filter((text) => !html.includes(text)),
  }
}

const parsed = (item: BenchCase): JsonValue => {
  const result = parse(item.vui)
  if (!result.ok) throw new Error(`${item.name}: ${result.error.message}`)
  return result.value
}

describe('the corpus (§14.3)', () => {
  it('has at least 20 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20)
  })

  it('covers every component in ui-spec', () => {
    const covered = new Set(cases.flatMap((item) => [...types(parsed(item))]))
    expect(COMPONENT_TYPES.filter((type) => !covered.has(type))).toEqual([])
  })

  it.each(cases.map((item) => [item.name, item]))('%s validates with no diagnostics', (_, item) => {
    expect(validateText(item.vui).diagnostics).toEqual([])
  })

  it.each(cases.map((item) => [item.name, item]))('%s says the same in all three', (_, item) => {
    expect(contentStrings(parsed(item)).length).toBeGreaterThan(0)
    expect(missing(item)).toEqual({ md: [], html: [] })
  })

  it.each(cases.map((item) => [item.name, item]))('%s keeps every row and point', (_, item) => {
    const { table, chart } = rowCounts(parsed(item))
    // Numbers are written per encoding, so their rows are counted instead of their text.
    expect(markdownRows(item.md)).toBeGreaterThanOrEqual(table + chart)
    expect((item.html.match(/<tr[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(table)
  })

  it.each(cases.map((item) => [item.name, item]))('%s is HTML as Orca asks for it', (_, item) => {
    const { html } = item
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).not.toMatch(/100vh/)
    const tokens = [...html.matchAll(/var\(--[\w-]+(,[^)]*)?\)/g)]
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.filter(([, fallback]) => fallback === undefined).map(([text]) => text)).toEqual(
      [],
    )
    expect(html).not.toMatch(/\s(src|href)=["']?(https?:)?\/\//)
    expect(html).not.toMatch(/:root\s*\{[^}]*--(background|foreground|card|primary|chart-\d)\s*:/)
  })

  it.each(cases.map((item) => [item.name, item]))('%s writes markdown a model would', (_, item) => {
    const title = (parsed(item) as { title?: string }).title as string
    expect(item.md.startsWith(`## ${title}\n`)).toBe(true)
    expect(item.md).not.toMatch(/<[a-z][^>]*>/i)
  })

  it('catches a case that drops a string, a row or the body under its title', () => {
    const table = cases.find(({ name }) => name === 'table-test-durations') as BenchCase
    const noRow = table.md.replace(/^\| billing\/tax\.test\.ts .*\n/m, '')
    expect(missing({ ...table, md: noRow }).md).toEqual(['billing/tax.test.ts'])
    expect(markdownRows(noRow)).toBeLessThan(rowCounts(parsed(table)).table)
    const titleOnly = table.html.replace(/<h1>[^<]*<\/h1>/, '')
    expect(missing({ ...table, html: titleOnly }).html).toEqual(['Slowest test files'])
  })
})

describe('vui bench on the shipped corpus', () => {
  it('reads it by default', async () => {
    const { json } = await vuiJson(['bench'])
    expect((json.cases as unknown[]).length).toBe(cases.length)
  })

  it('runs from the built binary', () => {
    const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url))
    let stdout: string
    try {
      stdout = execFileSync(process.execPath, [bin, 'bench', '--json'], {
        env: { ...process.env, ANTHROPIC_API_KEY: '' },
        encoding: 'utf8',
      })
    } catch (error) {
      stdout = (error as { stdout: string }).stdout
    }
    const json = JSON.parse(stdout)
    expect(json.counter.kind).toBe('offline')
    expect(json.cases).toHaveLength(cases.length)
  })
})
