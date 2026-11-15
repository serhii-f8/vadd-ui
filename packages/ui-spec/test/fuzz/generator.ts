// A structure-aware fuzzer's case generator (§16 "Fuzzing"). A test helper: nothing here ships.
// Every case is a pure function of `(seed, index)`, so a failure is reproduced from those two.

import {
  COMPONENT_TYPES,
  type ComponentType,
  FORMAT_NAMES,
  type JsonValue,
  MAX_ISSUES,
  parse,
  STATUSES,
  setOwn,
  TONES,
} from '../../src/index.js'
import { validCases } from '../corpus/cases.js'

/** mulberry32: small, fast, and good enough to spread cases. */
export function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** The random source of one case, with what the whole case shares. */
export class Rand {
  /** Nodes left to build, so recursion stays bounded. */
  budget = 60
  /** How often a field gets a hostile value instead of a right-typed one. */
  hostile = 0
  /** Nesting may go past §13.4's 12 up to here. */
  maxDepth = 4
  /** Array items left in the whole case, so nested arrays cannot multiply. */
  room = 3_000

  constructor(readonly next: () => number) {}

  int(below: number): number {
    return Math.floor(this.next() * below)
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T
  }

  /** Mostly small, sometimes many, rarely about 2,000. */
  count(small = 4): number {
    const roll = this.next()
    const wanted =
      roll < 0.1
        ? 0
        : roll < 0.92
          ? 1 + this.int(small)
          : roll < 0.985
            ? 5 + this.int(60)
            : 500 + this.int(1_500)
    const granted = Math.max(0, Math.min(wanted, this.room))
    this.room -= granted
    return granted
  }
}

export type Gen = (r: Rand, depth: number) => unknown

// The value pool

const ESC = String.fromCharCode(0x1b)
const NUL = String.fromCharCode(0)

const HOSTILE_NUMBERS: readonly number[] = [
  1e308,
  -1e308,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  5e-324,
  -5e-324,
  -0,
  0,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  2 ** 31,
  -(2 ** 31),
  1e21,
  1e-7,
  0.1,
  -1,
  1.5,
  999_999_999_999,
]

const HOSTILE_STRINGS: readonly string[] = [
  '',
  ' ',
  'a',
  '\n\n',
  '\t',
  '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 😀👩‍👩‍👧 \u{10ffff}',
  '\ud800 lone surrogate',
  'مرحبا بالعالم עברית',
  '\u202eevil\u202c \u200f\u200e',
  `${NUL}${String.fromCharCode(7)}${ESC}[31mred${ESC}[0m\r\b`,
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  'javascript:alert(1)',
  '[x](javascript:alert(1))',
  '[x](data:text/html,<b>x</b>)',
  '**bold** *it* `code` ~~s~~ :ok: :fail: [l](https://example.com)',
  '**unclosed *nest `tick [a](b',
  '# h1\n### h3\n- a\n  - b\n> quote\n```js\nx\n```',
  '__proto__',
  'constructor',
  'toString',
  'NaN',
  'Infinity',
  'undefined',
  '-0',
  '1e308',
  '2026-11-05T10:00:00Z',
  '2026-13-45T99:99:99Z',
  '0000-01-01',
  'pct:0',
  'money:EUR',
  'money:XXXX',
  'date:full',
  'num:99',
  'Status:status',
  'Time:ms',
  'a:b:c',
  ':',
  '%s%n%x',
  '$' + '{x}{{x}}',
  '../../etc/passwd',
  'C:\\Windows\\system32',
  'ERROR boom\nWARN careful\nINFO fine\nDEBUG noise',
  '@@ -1,2 +1,3 @@\n-old\n+new\n context',
]

function longString(r: Rand): string {
  const unit = r.pick(['x', 'ab ', '😀', 'م', '\n', '**b** '])
  const length = r.pick([2_001, 5_000, 20_001])
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length)
}

function protoObject(r: Rand, depth: number): Record<string, unknown> {
  const object: Record<string, unknown> = {}
  setOwn(object as never, '__proto__', poolValue(r, depth + 1) as JsonValue)
  if (r.chance(0.5)) setOwn(object as never, 'constructor', { prototype: { polluted: true } })
  return object
}

/** Any value at all, most of them wrong for the field they land in. */
export function poolValue(r: Rand, depth = 0): unknown {
  const roll = r.int(depth > 3 ? 6 : 10)
  switch (roll) {
    case 0:
      return r.pick(HOSTILE_NUMBERS)
    case 1:
      return r.pick(HOSTILE_STRINGS)
    case 2:
      return r.pick([true, false, null])
    case 3:
      return r.chance(0.2) ? longString(r) : r.pick(HOSTILE_STRINGS)
    case 4:
      return r.pick(HOSTILE_NUMBERS) * (r.chance(0.5) ? 1 : r.int(1_000))
    case 5:
      return r.pick([[], {}, [null], [[]], [{}]])
    case 6:
      return Array.from({ length: r.count() }, () => poolValue(r, depth + 1))
    case 7:
      return protoObject(r, depth)
    case 8:
      return { type: r.pick(COMPONENT_TYPES), x: poolValue(r, depth + 1) }
    default:
      return Object.fromEntries(
        Array.from({ length: r.count(3) }, () => [
          r.pick(HOSTILE_STRINGS),
          poolValue(r, depth + 1),
        ]),
      )
  }
}

// Right-typed generators. Each one, through `field`, sometimes yields a pool value instead.

const field =
  (gen: Gen): Gen =>
  (r, depth) =>
    r.chance(r.hostile) ? poolValue(r, depth) : gen(r, depth)

const oneOf =
  <T>(items: readonly T[]): Gen =>
  (r) =>
    r.pick(items)

const NAMES = ['login', 'refresh', 'p95', 'build', 'api', 'Alpha', 'β', 'cache', 'a', 'b', 'c']

const name: Gen = (r) => (r.chance(0.85) ? r.pick(NAMES) : r.pick(HOSTILE_STRINGS))
const inline: Gen = (r) =>
  r.chance(0.6) ? `${r.pick(NAMES)} **${r.pick(NAMES)}** :ok:` : r.pick(HOSTILE_STRINGS)
const text: Gen = (r) => (r.chance(0.1) ? longString(r) : (inline(r, 0) as string))
const bool: Gen = (r) => r.chance(0.5)
const status = oneOf(STATUSES)
const tone = oneOf(TONES)
const format: Gen = (r) =>
  r.chance(0.7) ? r.pick(FORMAT_NAMES) : `${r.pick(FORMAT_NAMES)}:${r.pick(['0', '2', 'EUR', 'x'])}`

const number: Gen = (r) => {
  const roll = r.next()
  if (roll < 0.5) return r.int(1_000)
  if (roll < 0.8) return Math.round(r.next() * 2_000 - 1_000) / 10
  return r.pick(HOSTILE_NUMBERS)
}
const index: Gen = (r) => (r.chance(0.8) ? r.int(4) : r.pick([-1, 1.5, 99, 2 ** 31]))
const positive: Gen = (r) => (r.chance(0.8) ? 1 + r.int(50) : r.pick([0, -3, 1.5, 1e9]))

const arrayOf =
  (gen: Gen, small = 4): Gen =>
  (r, depth) =>
    Array.from({ length: r.count(small) }, () => gen(r, depth + 1))

const object =
  (fields: Record<string, Gen>, required: readonly string[] = []): Gen =>
  (r, depth) => {
    const result: Record<string, unknown> = {}
    for (const [key, gen] of Object.entries(fields)) {
      if (required.includes(key) ? r.chance(0.95) : r.chance(0.5)) result[key] = gen(r, depth)
    }
    if (r.chance(r.hostile / 2)) result[r.pick(HOSTILE_STRINGS)] = poolValue(r, depth)
    return result
  }

/** A node, or a string standing for an `md` node (§5.3 rule 3). */
export function node(r: Rand, depth: number): unknown {
  r.budget--
  if (r.chance(0.05)) return r.pick(HOSTILE_STRINGS)
  const type = r.chance(r.hostile / 4)
    ? r.pick(['Table', 'nope', '', 'stack ', 'constructor'])
    : r.pick(COMPONENT_TYPES)
  const table = Object.hasOwn(FIELDS, type) ? FIELDS[type as ComponentType] : {}
  const result: Record<string, unknown> = { type }
  for (const [key, gen] of Object.entries({ ...COMMON, ...table })) {
    const own = Object.hasOwn(table, key)
    if (r.chance(own ? 0.85 : 0.15)) result[key] = gen(r, depth)
  }
  return result
}

/** Children, deeper by one, until the budget or the depth runs out. */
const children: Gen = (r, depth) => {
  if (depth >= r.maxDepth || r.budget <= 0) return []
  if (r.chance(0.08)) return node(r, depth + 1)
  return Array.from({ length: Math.min(r.count(3), 40) }, () => node(r, depth + 1))
}

const COMMON: Record<string, Gen> = {
  id: field(name),
  title: field(inline),
  note: field(inline),
  tone: field(tone),
  span: field((r) => (r.chance(0.8) ? 1 + r.int(12) : r.pick([0, 13, 1.5]))),
  fold: field(oneOf(['open', 'closed'])),
}

const column: Gen = (r) =>
  r.chance(0.4)
    ? `${r.pick(NAMES)}${r.chance(0.5) ? `:${r.pick(FORMAT_NAMES)}` : ''}`
    : object({
        key: field(name),
        label: field(name),
        format: field(format),
        align: field(oneOf(['left', 'right', 'center'])),
        cell: field(oneOf(['text', 'bar', 'badge', 'code'])),
        width: field(oneOf(['auto', 'narrow', 'wide'])),
        wrap: field(bool),
        tones: field((r) => ({ [r.pick(NAMES)]: r.pick(TONES), ok: 'ok' })),
      })(r, 0)

const scalar: Gen = (r) => {
  const roll = r.int(5)
  if (roll === 0) return name(r, 0)
  if (roll === 1) return r.pick(STATUSES)
  if (roll === 2) return r.chance(0.5) ? null : r.chance(0.5)
  return number(r, 0)
}

const row: Gen = (r, depth) => {
  if (r.chance(0.2)) return Object.fromEntries(NAMES.slice(0, 3).map((key) => [key, scalar(r, 0)]))
  const cells: unknown[] = Array.from({ length: 1 + r.int(5) }, () => field(scalar)(r, depth))
  if (r.chance(0.15)) cells.push({ tone: r.pick(TONES), note: inline(r, 0) })
  return cells
}

const series: Gen = (r, depth) =>
  Object.fromEntries(
    Array.from({ length: r.chance(0.9) ? 1 + r.int(4) : 13 }, (_, at) => [
      r.chance(0.9) ? `s${at}` : r.pick(HOSTILE_STRINGS),
      arrayOf(field(number), 8)(r, depth),
    ]),
  )

const planItem: Gen = (r, depth) =>
  object(
    {
      text: field(inline),
      status: field(status),
      note: field(inline),
      children: (rr, d) => (d < rr.maxDepth ? arrayOf(planItem, 2)(rr, d + 1) : []),
    },
    ['text', 'status'],
  )(r, depth)

const treeItem: Gen = (r, depth) =>
  object(
    {
      name: field(name),
      status: field(status),
      note: field(inline),
      children: (rr, d) => (d < rr.maxDepth ? arrayOf(treeItem, 2)(rr, d + 1) : []),
    },
    ['name'],
  )(r, depth)

/** One field table per component type (§6), so the fuzzer reaches every one of them. */
export const FIELDS: Record<ComponentType, Record<string, Gen>> = {
  stack: { children, gap: field(oneOf(['sm', 'md', 'lg'])) },
  grid: { children, cols: field((r) => (r.chance(0.8) ? 1 + r.int(6) : r.pick([0, 7, 2.5]))) },
  section: { title: field(inline), children },
  card: { children },
  tabs: {
    tabs: field((r, depth) =>
      Array.from({ length: r.count(3) }, () =>
        object({ label: field(name), children: (rr, d) => children(rr, d) }, ['label'])(r, depth),
      ),
    ),
    active: field(index),
  },
  divider: { label: field(name) },
  md: { text: field(text) },
  callout: { text: field(inline), tone: field(tone) },
  code: {
    text: field(text),
    lang: field(oneOf(['ts', 'js', 'diff', 'sh', ''])),
    lines: field((r) => (r.chance(0.8) ? true : r.pick([false, 1]))),
    mark: field(arrayOf(positive)),
    maxLines: field(positive),
  },
  table: {
    columns: field(arrayOf(column, 5)),
    rows: field(arrayOf(row, 6)),
    sort: field((r) => [index(r, 0), r.pick(['asc', 'desc', 'up'])]),
    pageSize: field(positive),
    totals: field(arrayOf(scalar)),
    group: field(index),
    sticky: field(bool),
  },
  kv: {
    pairs: field((r) =>
      r.chance(0.5)
        ? Object.fromEntries(NAMES.slice(0, 1 + r.int(5)).map((key) => [key, scalar(r, 0)]))
        : Array.from({ length: r.count() }, () =>
            r.chance(0.5) ? [name(r, 0), scalar(r, 0)] : [name(r, 0), scalar(r, 0), format(r, 0)],
          ),
    ),
    cols: field((r) => (r.chance(0.8) ? 1 + r.int(3) : r.pick([0, 4]))),
  },
  stats: {
    items: field(
      arrayOf((r, depth) =>
        r.chance(0.3)
          ? // VD-164's positional item, `null` for an absent position.
            [name, scalar, format, number, format, tone]
              .slice(0, 1 + r.int(6))
              .map((gen) => (r.chance(0.15) ? null : field(gen)(r, depth)))
          : object(
              {
                label: field(name),
                value: field(scalar),
                format: field(format),
                delta: field(number),
                deltaFormat: field(format),
                tone: field(tone),
                spark: field(arrayOf(field(number), 12)),
              },
              ['label', 'value'],
            )(r, depth),
      ),
    ),
  },
  list: {
    items: field(
      arrayOf((r, depth) =>
        r.chance(0.5)
          ? inline(r, depth)
          : object({ text: field(inline), status: field(status), note: field(inline) }, ['text'])(
              r,
              depth,
            ),
      ),
    ),
    ordered: field(bool),
  },
  progress: {
    value: field(number),
    max: field(number),
    label: field(name),
    segments: field(
      arrayOf(
        object({ value: field(number), tone: field(tone), label: field(name) }, [
          'value',
          'tone',
          'label',
        ]),
      ),
    ),
  },
  compare: {
    options: field(arrayOf(name)),
    criteria: field(
      arrayOf(
        object(
          {
            label: field(name),
            values: field(arrayOf(field(scalar))),
            format: field(format),
            better: field(oneOf(['high', 'low'])),
          },
          ['label', 'values'],
        ),
      ),
    ),
    pick: field(index),
  },
  chart: {
    kind: field(oneOf(['bar', 'hbar', 'stacked', 'line', 'area', 'donut', 'spark', 'scatter'])),
    x: field((r, depth) =>
      r.chance(0.3) ? arrayOf(field(number), 8)(r, depth) : arrayOf(field(name), 8)(r, depth),
    ),
    series: field(series),
    values: field(arrayOf(field(number), 12)),
    points: field(
      arrayOf(
        (r) =>
          r.chance(0.7) ? [number(r, 0), number(r, 0)] : [number(r, 0), number(r, 0), name(r, 0)],
        12,
      ),
    ),
    yFormat: field(format),
    xFormat: field(format),
    stackTotal: field(oneOf([true, true, true, false])),
    height: field(oneOf(['sm', 'md', 'lg'])),
    legend: field(oneOf(['auto', 'none'])),
    refLines: field(
      arrayOf(
        object({ y: field(number), label: field(name), tone: field(tone) }, ['y', 'label', 'tone']),
        2,
      ),
    ),
  },
  checks: {
    items: field(
      arrayOf(
        object(
          {
            name: field(name),
            status: field(status),
            cmd: field(name),
            ms: field(number),
            output: field(text),
          },
          ['name', 'status'],
        ),
      ),
    ),
  },
  plan: { items: field(arrayOf(planItem)) },
  diff: {
    files: field(
      arrayOf((r) => {
        const file: unknown[] = [`src/${name(r, 0)}.ts`, positive(r, 0), index(r, 0)]
        if (r.chance(0.5)) file.push(r.pick(['A', 'M', 'D', 'R', 'X']))
        return file
      }),
    ),
    hunks: field((r) => ({
      'src/a.ts': r.pick(HOSTILE_STRINGS),
      'src/login.ts': '@@ -1 +1 @@\n-a\n+b',
    })),
  },
  tree: {
    items: field(arrayOf(treeItem)),
    paths: field(arrayOf((r) => `${name(r, 0)}/${name(r, 0)}/${name(r, 0)}.ts`)),
  },
  timeline: {
    items: field(
      arrayOf(
        object(
          {
            at: field(oneOf(['2026-11-05T09:00:00Z', 'yesterday', '10:00', '2026-11-05'])),
            text: field(inline),
            status: field(status),
          },
          ['at', 'text'],
        ),
      ),
    ),
  },
  decision: {
    question: field(name),
    context: field(inline),
    options: field(
      arrayOf(
        object(
          {
            label: field(name),
            pros: field(arrayOf(name)),
            cons: field(arrayOf(name)),
            effort: field(oneOf(['XS', 'S', 'M', 'L', 'XL'])),
            reversible: field(bool),
            risk: field(oneOf(['low', 'med', 'high'])),
            verify: field(inline),
          },
          ['label'],
        ),
      ),
    ),
    pick: field(index),
  },
  log: { text: field(text), maxLines: field(positive) },
  flow: {
    nodes: field(
      arrayOf(
        (r) =>
          r.chance(0.5)
            ? r.pick(NAMES.slice(0, 5))
            : { id: r.pick(NAMES.slice(0, 5)), label: name(r, 0), status: status(r, 0) },
        6,
      ),
    ),
    edges: field(
      arrayOf((r) => {
        const edge: unknown[] = [r.pick(NAMES.slice(0, 5)), r.pick(NAMES.slice(0, 5))]
        if (r.chance(0.3)) edge.push(name(r, 0))
        return edge
      }, 6),
    ),
  },
}

const LOCALES = ['en-US', 'de-DE', 'ar-EG', 'ja-JP', 'fr', 'en-US-u-nu-arab', 'xx', '!!', '']

function structured(r: Rand): unknown {
  r.maxDepth = r.chance(0.1) ? 13 + r.int(3) : 1 + r.int(5)
  if (r.maxDepth > 12) r.budget = 30
  const body = Array.from({ length: 1 + r.int(5) }, () => node(r, 1))
  const shape = r.int(10)
  if (shape === 0) return body
  if (shape === 1) return body[0]
  const document: Record<string, unknown> = { vui: r.chance(0.95) ? 1 : poolValue(r), body }
  if (r.chance(0.5)) document.title = field(name)(r, 0)
  if (r.chance(0.3)) document.subtitle = field(inline)(r, 0)
  if (r.chance(0.3)) document.density = field(oneOf(['compact', 'comfortable']))(r, 0)
  if (r.chance(0.3)) document.locale = r.pick(LOCALES)
  if (r.chance(0.3)) document.generatedAt = field(oneOf(['2026-11-05T10:00:00Z', 'now']))(r, 0)
  if (r.chance(0.2)) document.meta = poolValue(r)
  return document
}

// The mutated mode

type Container = Record<string, unknown> | unknown[]

/** Every place a value sits, as its container and key. */
function places(root: unknown): [Container, string | number][] {
  const found: [Container, string | number][] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item, at) => {
        found.push([value, at])
        visit(item)
      })
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        found.push([value as Record<string, unknown>, key])
        visit((value as Record<string, unknown>)[key])
      }
    }
  }
  visit(root)
  return found
}

const get = ([owner, key]: [Container, string | number]) =>
  (owner as Record<string | number, unknown>)[key]

function put([owner, key]: [Container, string | number], value: unknown): void {
  if (Array.isArray(owner)) owner[key as number] = value
  else setOwn(owner as never, key as string, value as JsonValue)
}

const SEEDS: unknown[] = validCases.map((item) => {
  if (item.input !== undefined) return item.input
  const parsed = parse(item.text as string)
  if (!parsed.ok) throw new Error(`corpus case ${item.name} does not parse`)
  return parsed.value
})

const GROWTH_LIMIT = 5_000

function mutate(r: Rand, root: unknown): unknown {
  const holder: unknown[] = [structuredClone(root)]
  const times = 1 + r.int(6)
  for (let done = 0; done < times; done++) {
    const all = places(holder)
    if (all.length === 0) break
    const place = r.pick(all)
    const value = get(place)
    // Past this size, only the operations that cannot grow the case.
    switch (all.length > GROWTH_LIMIT ? r.int(2) : r.int(8)) {
      case 0:
        if (Array.isArray(place[0])) place[0].splice(place[1] as number, 1)
        else delete place[0][place[1] as string]
        break
      case 1:
        put(place, poolValue(r))
        break
      case 2:
        if (Array.isArray(value)) {
          put(place, r.chance(0.5) ? [] : [...value, ...structuredClone(value)])
        } else put(place, [])
        break
      case 3:
        put(place, [value])
        break
      case 4: {
        const typed = all.filter(([owner, key]) => key === 'type' && !Array.isArray(owner))
        if (typed.length > 0) {
          put(r.pick(typed), r.chance(0.7) ? r.pick(COMPONENT_TYPES) : r.pick(HOSTILE_STRINGS))
        }
        break
      }
      case 5:
        put(place, { type: r.pick(['stack', 'card', 'section']), title: 'n', children: [value] })
        break
      case 6: {
        const other = r.pick(all)
        const otherValue = get(other)
        put(place, structuredClone(otherValue))
        put(other, structuredClone(value))
        break
      }
      default:
        put(place, structuredClone(r.pick(SEEDS)))
    }
  }
  // A dropped root leaves nothing, which JSON spells as `null`.
  return holder.length === 0 ? null : holder[0]
}

/** murmur3's finalizer: every input bit reaches every output bit. */
function mix(value: number): number {
  let hash = value >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}

/** Spreads `(seed, index)` over the generator's state space. Seeds are mixed before indexes
 * join them, so nearby pairs such as (1, 2047) and (2, 2050) do not meet. */
function caseSeed(seed: number, index: number): number {
  return mix(mix(seed ^ 0x9e3779b9) + Math.imul(index, 0x27d4eb2f))
}

function caseRand(seed: number, index: number): Rand {
  const r = new Rand(rng(caseSeed(seed, index)))
  r.hostile = r.pick([0, 0, 0.03, 0.1, 0.3])
  return r
}

/** Which mode builds case `index`: half structured, half mutated corpus documents. */
export function fuzzMode(seed: number, index: number): 'structured' | 'mutated' {
  return caseRand(seed, index).chance(0.5) ? 'structured' : 'mutated'
}

/** One case for a renderer: a structured document or a mutated corpus one. */
export function fuzzDocument(seed: number, index: number): unknown {
  const r = caseRand(seed, index)
  return r.chance(0.5) ? structured(r) : mutate(r, r.pick(SEEDS))
}

/** A node that fills `inspect`'s issue record (VD-066): one unknown field per issue. */
export function issuePad(): Record<string, unknown> {
  const pad: Record<string, unknown> = { type: 'divider' }
  for (let index = 0; index < MAX_ISSUES; index += 1) pad[`f${index}`] = 1
  return pad
}

/**
 * A structured document at the highest hostility behind `issuePad`, so nothing checks or drops
 * its fields and each component meets them as written (VD-187).
 */
export function fuzzUnchecked(seed: number, index: number): unknown {
  const r = caseRand(seed ^ 0x2545f491, index)
  r.hostile = 0.3
  const built = structured(r) as { body?: unknown }
  // `structured` may give a whole document, a bare body or one node (§5.3).
  const whole =
    built !== null && typeof built === 'object' && !Array.isArray(built) && 'body' in built
  const document = whole ? built : { vui: 1, body: built }
  const body = Array.isArray(document.body) ? document.body : [document.body]
  document.body = [issuePad(), ...body]
  return document
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Relaxed JSON (§5.1): unquoted keys, single quotes, trailing commas, comments. */
function relaxed(r: Rand, value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const strict = JSON.stringify(value) ?? 'null'
    if (typeof value !== 'string' || !r.chance(0.3)) return strict
    return `'${strict.slice(1, -1).replaceAll("'", "\\'").replaceAll('\\"', '"')}'`
  }
  const comma = r.chance(0.3) ? ',' : ''
  const comment = r.chance(0.1) ? (r.chance(0.5) ? '/* c */' : '// c\n') : ''
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${comment}${value.map((item) => relaxed(r, item)).join(',')}${comma}]`
  }
  const entries = Object.entries(value).map(([key, item]) => {
    const label = IDENTIFIER.test(key) && r.chance(0.7) ? key : JSON.stringify(key)
    return `${label}:${relaxed(r, item)}`
  })
  if (entries.length === 0) return '{}'
  return `{${comment}${entries.join(',')}${comma}}`
}

const DAMAGE = ['"', "'", '[', ']', '{', '}', ',', ':', NUL, '\\', '/*', '\ud800']

function damage(r: Rand, source: string): string {
  let text = source
  const times = 1 + r.int(3)
  for (let done = 0; done < times; done++) {
    const at = r.int(text.length + 1)
    const roll = r.int(4)
    if (roll === 0) text = text.slice(0, at)
    else if (roll === 1) text = `\ufeff${text}`
    else text = `${text.slice(0, at)}${r.pick(DAMAGE)}${text.slice(at)}`
  }
  return text
}

/** One case for the CLI: a `fuzzDocument` as strict JSON, relaxed JSON, or damaged text. */
export function fuzzText(seed: number, index: number): string {
  const document = fuzzDocument(seed, index)
  const r = new Rand(rng(caseSeed(seed ^ 0x5bd1e995, index)))
  const roll = r.int(10)
  const source =
    roll < 4
      ? (JSON.stringify(document, null, r.chance(0.3) ? 2 : 0) ?? 'null')
      : relaxed(r, document)
  return r.chance(0.3) ? damage(r, source) : source
}

function fromEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer from 0 to ${max}`)
  }
  return value
}

/** `VUI_FUZZ_CASES`, or `fallback`. */
export function fuzzCount(fallback: number): number {
  return fromEnv('VUI_FUZZ_CASES', fallback)
}

/** `VUI_FUZZ_BIN_CASES`, or `fallback`: the real-binary sample. */
export function fuzzBinCount(fallback: number): number {
  return fromEnv('VUI_FUZZ_BIN_CASES', fallback)
}

/**
 * `VUI_FUZZ_SEED`, or `fallback`. A seed is 32 bits (mulberry32's state), so a larger one is
 * refused rather than silently read as its low 32 bits, which would repeat another seed's run.
 */
export function fuzzSeed(fallback: number): number {
  return fromEnv('VUI_FUZZ_SEED', fallback, 0xffff_ffff)
}

/** The first 2,000 chars of a case, for a failure message. */
export function excerpt(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  return text.slice(0, 2_000)
}

/**
 * VD-087: one wall-time read under a loaded machine is not the code's cost. A case that took
 * `first` ms, over `budget`, runs again up to `runs - 1` times; the fastest run is its time.
 */
export async function fastestMs(
  first: number,
  budget: number,
  again: () => unknown,
  runs = 5,
): Promise<number> {
  let fastest = first
  for (let run = 1; run < runs && fastest > budget; run++) {
    const started = performance.now()
    await again()
    fastest = Math.min(fastest, performance.now() - started)
  }
  return fastest
}
