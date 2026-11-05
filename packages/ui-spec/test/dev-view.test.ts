import { describe, expect, it } from 'vitest'
import {
  cleanText,
  diffEntries,
  isIsoTime,
  itemsFromPaths,
  planCounts,
  tailLines,
  treeSource,
} from '../src/index.js'

describe('cleanText', () => {
  it('removes CSI and OSC sequences whole', () => {
    expect(cleanText('\u001b[1;31mred\u001b[0m')).toBe('red')
    expect(cleanText('a\u001b]0;title\u0007b')).toBe('ab')
    expect(cleanText('\u009b2Kx')).toBe('x')
  })

  it('ends an OSC with no terminator at its line', () => {
    expect(cleanText('tail \u001b]0;x\nnext')).toBe('tail \nnext')
  })

  it('turns CRLF and CR into newlines, and keeps tabs', () => {
    expect(cleanText('a\r\nb\rc\td')).toBe('a\nb\nc\td')
  })

  it('removes other controls', () => {
    expect(cleanText('a\u0000b\u007fc\u0085d')).toBe('abcd')
  })
})

describe('tailLines', () => {
  it('keeps everything that fits', () => {
    expect(tailLines('a\nb', 2)).toEqual({ earlier: [], last: ['a', 'b'] })
  })

  it('splits off what comes before the last lines', () => {
    expect(tailLines('a\nb\nc', 2)).toEqual({ earlier: ['a'], last: ['b', 'c'] })
  })

  it('does not count one trailing newline as a line', () => {
    expect(tailLines('a\nb\n', 2)).toEqual({ earlier: [], last: ['a', 'b'] })
  })
})

describe('planCounts', () => {
  it('counts ok items at every depth', () => {
    const items = [
      { text: 'a', status: 'ok' as const },
      {
        text: 'b',
        status: 'run' as const,
        children: [
          { text: 'c', status: 'ok' as const },
          { text: 'd', status: 'skip' as const },
        ],
      },
    ]
    expect(planCounts(items)).toEqual([2, 4])
  })
})

describe('planCounts with what the types do not promise', () => {
  it('skips what is not an item', () => {
    const items = [{ text: 'a', status: 'ok', children: [null, 'x'] }] as never
    expect(planCounts(items)).toEqual([1, 1])
  })
})

describe('itemsFromPaths', () => {
  it('merges shared folders, in order of first sight', () => {
    expect(itemsFromPaths(['src/a.ts', 'src/b.ts', 'README.md'])).toEqual([
      {
        name: 'src',
        children: [
          { name: 'a.ts', children: [] },
          { name: 'b.ts', children: [] },
        ],
      },
      { name: 'README.md', children: [] },
    ])
  })

  it('ignores empty segments', () => {
    expect(itemsFromPaths(['/a//b/'])).toEqual([
      { name: 'a', children: [{ name: 'b', children: [] }] },
    ])
  })

  it('caps nesting at the §13.4 depth (VD-056)', () => {
    let items = itemsFromPaths([Array.from({ length: 15 }, (_, i) => i + 1).join('/')])
    let depth = 0
    let last = ''
    while (items[0] !== undefined) {
      depth += 1
      last = items[0].name
      items = items[0].children ?? []
    }
    expect(depth).toBe(12)
    expect(last).toBe('12/13/14/15')
  })
})

describe('diffEntries', () => {
  it('reads each file, with its hunk', () => {
    const entries = diffEntries(
      [
        ['a.ts', 1, 2, 'M'],
        ['b.ts', 3, 0],
      ],
      { 'a.ts': '+x' },
    )
    expect(entries).toEqual([
      { path: 'a.ts', added: 1, removed: 2, change: 'M', hunk: '+x' },
      { path: 'b.ts', added: 3, removed: 0 },
    ])
  })

  it('keeps a hunk that no file names, after the files', () => {
    expect(diffEntries([['a.ts', 1, 2]], { 'z.ts': '-y' })).toEqual([
      { path: 'a.ts', added: 1, removed: 2 },
      { path: 'z.ts', hunk: '-y' },
    ])
  })

  it('takes null hunks as none', () => {
    expect(diffEntries([['a', 1, 2]], null as never)).toEqual([{ path: 'a', added: 1, removed: 2 }])
  })

  it('reads no inherited hunk', () => {
    expect(diffEntries([['constructor', 1, 2]], undefined)).toEqual([
      { path: 'constructor', added: 1, removed: 2 },
    ])
    expect(diffEntries([['constructor', 1, 2]], {})).toEqual([
      { path: 'constructor', added: 1, removed: 2 },
    ])
  })
})

describe('treeSource', () => {
  const paths = ['src/a.ts']
  const fromPaths = [{ name: 'src', children: [{ name: 'a.ts', children: [] }] }]

  it('prefers items that hold an object', () => {
    const items = [{ name: 'x' }]
    expect(treeSource(items, paths)).toEqual(items)
  })

  it('falls back to paths when items is empty', () => {
    expect(treeSource([], paths)).toEqual(fromPaths)
  })

  it('falls back to paths when items holds no object', () => {
    expect(treeSource(['x'], paths)).toEqual(fromPaths)
  })

  it('skips a path that is not a string', () => {
    expect(treeSource([], ['a', 7])).toEqual([{ name: 'a', children: [] }])
  })
})

describe('isIsoTime', () => {
  it('accepts a date with a time', () => {
    expect(isIsoTime('2026-11-05T10:00:00Z')).toBe(true)
  })

  it('leaves a date and a label as written', () => {
    expect(isIsoTime('2026-11-05')).toBe(false)
    expect(isIsoTime('2026-11 sprint')).toBe(false)
  })
})
