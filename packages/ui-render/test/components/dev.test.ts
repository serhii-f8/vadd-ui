import { afterEach, describe, expect, it, vi } from 'vitest'
import { show } from '../helpers.js'

const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)]
const texts = (box: Element, selector: string) => all(box, selector).map((item) => item.textContent)
const click = (box: Element, label: string) => {
  const button = all(box, 'button').find((item) => item.textContent?.includes(label))
  ;(button as HTMLButtonElement).click()
  return button as HTMLButtonElement
}

describe('checks', () => {
  const output = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n')

  it('shows status, name, command and time', () => {
    const items = [{ name: 'Types', status: 'ok', cmd: 'pnpm tsc', ms: 9100 }]
    const { box } = show([{ type: 'checks', items }])
    expect(box.querySelector('.vui-status')?.textContent).toContain('ok')
    expect(box.querySelector('li')?.textContent).toContain('Types')
    expect(box.querySelector('code')?.textContent).toBe('pnpm tsc')
    expect(box.querySelector('.vui-row-end')?.textContent).toBe('9.10 s')
  })

  it.each([undefined, '', '\n', ' \n '])('has no fold for output %j', (value) => {
    const item = { name: 'a', status: 'ok', ...(value === undefined ? {} : { output: value }) }
    const { box } = show([{ type: 'checks', items: [item] }])
    expect(box.querySelector('button')).toBeNull()
  })

  it('folds output, closed at the start', () => {
    const items = [{ name: 'a', status: 'fail', output: 'boom' }]
    const { box } = show([{ type: 'checks', items }])
    const toggle = box.querySelector('button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect((box.querySelector('.vui-fold-body') as HTMLElement).hidden).toBe(true)
    expect(box.querySelector('pre')?.textContent).toBe('boom')
  })

  it('strips ANSI from output', () => {
    const items = [{ name: 'a', status: 'fail', output: '\u001b[31mred\u001b[0m\r\nnext' }]
    const { box } = show([{ type: 'checks', items }])
    expect(box.querySelector('pre')?.textContent).toBe('red\nnext')
  })

  it('shows the last 20 lines, and folds the ones before', () => {
    const { box } = show([{ type: 'checks', items: [{ name: 'a', status: 'ok', output }] }])
    const blocks = all(box, 'pre')
    expect(blocks.map((item) => item.textContent?.split('\n').length)).toEqual([5, 20])
    expect(blocks[1]?.textContent?.startsWith('line 6\n')).toBe(true)
    expect(blocks[1]?.textContent?.endsWith('line 25')).toBe(true)
    const earlier = click(box, '5 earlier lines')
    expect(earlier.getAttribute('aria-expanded')).toBe('true')
    expect(blocks[0]?.textContent?.startsWith('line 1\n')).toBe(true)
  })

  it('has one fold at exactly 20 lines, and says one line in the singular', () => {
    const lines = (count: number) =>
      Array.from({ length: count }, (_, index) => `l${index}`).join('\n')
    const exact = show([
      { type: 'checks', items: [{ name: 'a', status: 'ok', output: lines(20) }] },
    ])
    expect(all(exact.box, 'button')).toHaveLength(1)
    const one = show([{ type: 'checks', items: [{ name: 'a', status: 'ok', output: lines(21) }] }])
    expect(texts(one.box, 'button')[1]).toContain('1 earlier line')
    expect(texts(one.box, 'button')[1]).not.toContain('lines')
  })

  it('names each output toggle after its check, and shows only Output', () => {
    const items = [
      { name: 'E2E', status: 'fail', output: 'x' },
      { name: 'Lint', status: 'ok', output: 'y' },
    ]
    const { box } = show([{ type: 'checks', items }])
    const toggles = all(box, 'button')
    // B12: one sr-only name with no space before the comma; the visible word is hidden from it.
    expect(toggles.map((item) => item.querySelector('.vui-sr-only')?.textContent)).toEqual([
      'Output, E2E',
      'Output, Lint',
    ])
    for (const toggle of toggles) {
      const shown = [...toggle.querySelectorAll('[aria-hidden="true"]')].map((n) => n.textContent)
      expect(shown).toEqual(['▸', 'Output'])
    }
  })

  it('keeps each fold of its own across an update', () => {
    const items = [
      { name: 'a', status: 'ok', output: 'x' },
      { name: 'b', status: 'ok', output: 'y' },
    ]
    const { box, handle } = show([{ id: 'c', type: 'checks', items }])
    all(box, 'button')[1]?.dispatchEvent(new MouseEvent('click'))
    handle.update({ vui: 1, body: [{ id: 'c', type: 'checks', items }] } as never)
    expect(all(box, 'button').map((item) => item.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
    ])
  })
})

describe('fold state follows the item, not its place', () => {
  const update = (handle: { update(document: never): void }, body: unknown[]) =>
    handle.update({ vui: 1, body } as never)
  const expanded = (box: Element) =>
    all(box, 'button').map((item) => item.getAttribute('aria-expanded'))

  it('in checks', () => {
    const lint = { name: 'lint', status: 'ok', output: 'x' }
    const e2e = { name: 'e2e', status: 'fail', output: 'y' }
    const { box, handle } = show([{ id: 'c', type: 'checks', items: [lint, e2e] }])
    click(box, 'Output')
    update(handle, [{ id: 'c', type: 'checks', items: [e2e, lint] }])
    expect(expanded(box)).toEqual(['false', 'true'])
  })

  it('in diff', () => {
    const hunks = { 'a.ts': '+a', 'b.ts': '+b' }
    const files = [
      ['a.ts', 1, 0],
      ['b.ts', 1, 0],
    ]
    const { box, handle } = show([{ id: 'd', type: 'diff', files, hunks }])
    click(box, 'b.ts')
    const more = { ...hunks, 'new.ts': '+n' }
    update(handle, [{ id: 'd', type: 'diff', files: [['new.ts', 1, 0], ...files], hunks: more }])
    expect(expanded(box)).toEqual(['false', 'false', 'true'])
  })
})

describe('plan', () => {
  const items = [
    { text: '**Add** table', status: 'ok', note: 'done `x`' },
    {
      text: 'Invalidate',
      status: 'run',
      children: [
        { text: 'First', status: 'ok' },
        { text: 'Second', status: 'wait' },
      ],
    },
  ]

  it('counts done over total in the header, children included', () => {
    const { box } = show([{ type: 'plan', title: 'Plan', items }])
    expect(box.querySelector('.vui-note')?.textContent).toBe('2/4 done')
  })

  it('survives children that are not items', () => {
    const { box } = show([{ type: 'plan', items: [{ text: 'a', status: 'ok', children: [null] }] }])
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(box.querySelector('.vui-note')?.textContent).toBe('1/1 done')
  })

  it('nests children', () => {
    const { box } = show([{ type: 'plan', items }])
    expect(all(box, 'ul ul > li')).toHaveLength(2)
    expect(box.querySelector('ul ul li')?.textContent).toContain('First')
  })

  it('draws text and note as inline text, with a status', () => {
    const { box } = show([{ type: 'plan', items }])
    expect(box.querySelector('li strong')?.textContent).toBe('Add')
    expect(box.querySelector('li .vui-note code')?.textContent).toBe('x')
    expect(all(box, '.vui-status')).toHaveLength(4)
  })
})

describe('tree', () => {
  it('takes items, nested, with a status and a note', () => {
    const items = [
      { name: '**src**', status: 'ok', note: 'new', children: [{ name: 'a.ts' }] },
      { name: 'b.ts' },
    ]
    const { box } = show([{ type: 'tree', items }])
    expect(box.querySelector('li')?.textContent).toContain('**src**')
    expect(box.querySelector('ul ul li')?.textContent).toBe('a.ts')
    expect(all(box, '.vui-status')).toHaveLength(1)
    expect(box.querySelector('.vui-note')?.textContent).toBe('new')
  })

  it('takes paths', () => {
    const { box } = show([{ type: 'tree', paths: ['src/a.ts', 'src/b.ts', 'c.ts'] }])
    expect(texts(box, 'ul ul li')).toEqual(['a.ts', 'b.ts'])
    expect(all(box, '.vui-tree > li')).toHaveLength(2)
  })

  it.each([[[]], [['x']], ['x']])('falls back to paths when items are %j', (items) => {
    const { box } = show([{ type: 'tree', items, paths: ['a/b'] }])
    expect(box.querySelector('ul ul li')?.textContent).toBe('b')
  })

  it('ignores paths past the cap that are not text', () => {
    const { box } = show([{ type: 'tree', paths: [7, 'a'] }])
    expect(box.querySelector('.vui-card-error')).toBeNull()
  })

  it('has no list inside a leaf', () => {
    const { box } = show([{ type: 'tree', paths: ['a'] }])
    expect(all(box, 'ul')).toHaveLength(1)
  })
})

describe('timeline', () => {
  const items = [
    { at: '2026-11-05T10:00:00Z', text: 'Started **now**', status: 'ok' },
    { at: 'Next week', text: 'Ships' },
  ]

  it('is an ordered list', () => {
    const { box } = show([{ type: 'timeline', items }])
    expect(all(box, 'ol > li')).toHaveLength(2)
  })

  it('formats an ISO time, and keeps a label as written, with no diagnostic', () => {
    const { box, handle } = show([{ type: 'timeline', items }])
    const [time, label] = texts(box, '.vui-time')
    expect(time).toContain('2026')
    expect(time).not.toContain('T10')
    expect(label).toBe('Next week')
    expect(handle.diagnostics).toEqual([])
  })

  it.each(['2026-11 sprint', '2026-11-05'])('keeps %s as written, with no diagnostic', (at) => {
    const { box, handle } = show([{ type: 'timeline', items: [{ at, text: 'x' }] }])
    expect(box.querySelector('.vui-time')?.textContent).toBe(at)
    expect(handle.diagnostics).toEqual([])
  })

  it('draws text inline, with an optional status', () => {
    const { box } = show([{ type: 'timeline', items }])
    expect(box.querySelector('li strong')?.textContent).toBe('now')
    expect(all(box, '.vui-status')).toHaveLength(1)
  })
})

describe('diff', () => {
  const files = [
    ['src/a.ts', 64, 12, 'M'],
    ['src/b.ts', 88, 0, 'A'],
    ['c.sql', 0, 3, 'D'],
    ['d.ts', 1, 1, 'R'],
    ['e.ts', 2, 2],
  ]

  it('shows each file with its counts', () => {
    const { box } = show([{ type: 'diff', files }])
    expect(texts(box, 'code')).toEqual(['src/a.ts', 'src/b.ts', 'c.sql', 'd.ts', 'e.ts'])
    expect(box.querySelector('li')?.textContent).toContain('+64')
    expect(box.querySelector('li')?.textContent).toContain('−12')
  })

  it('marks a change with a letter and a word', () => {
    const { box } = show([{ type: 'diff', files }])
    expect(texts(box, '.vui-diff-mark')).toEqual(['Mmodified', 'Aadded', 'Ddeleted', 'Rrenamed'])
    expect(box.querySelector('.vui-diff-mark.vui-tone-ok')?.textContent).toContain('A')
    expect(box.querySelector('.vui-diff-mark.vui-tone-err')?.textContent).toContain('D')
  })

  it('has no toggle without a hunk', () => {
    const { box } = show([{ type: 'diff', files }])
    expect(box.querySelector('button')).toBeNull()
  })

  const hunk = '@@ -1,2 +1,2 @@\n context\n-old\n-older\n+new'

  it('folds a hunk under its file, closed and not built', () => {
    const { box } = show([{ type: 'diff', files, hunks: { 'src/a.ts': hunk } }])
    const toggle = box.querySelector('button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.textContent).toContain('src/a.ts')
    expect(box.querySelector('pre')).toBeNull()
  })

  it('opens to the hunk, its text whole, with a tint per run of lines', () => {
    const { box } = show([{ type: 'diff', files, hunks: { 'src/a.ts': hunk } }])
    box.querySelector('button')?.click()
    expect(box.querySelector('pre')?.textContent).toBe(`${hunk}\n`)
    expect(texts(box, 'pre .vui-tone-err')).toEqual(['-old\n-older\n'])
    expect(texts(box, 'pre .vui-tone-ok')).toEqual(['+new\n'])
    expect(texts(box, 'pre .vui-tone-info')).toEqual(['@@ -1,2 +1,2 @@\n'])
  })

  it('does not take a file header for a change', () => {
    const { box } = show([{ type: 'diff', files: [], hunks: { x: '--- a/x\n+++ b/x\n+y' } }])
    box.querySelector('button')?.click()
    expect(texts(box, 'pre [class*="vui-tone-"]')).toEqual(['+y\n'])
  })

  it('keeps a hunk that no file names', () => {
    const { box } = show([{ type: 'diff', files: [], hunks: { 'z.ts': '+y' } }])
    expect(box.querySelector('button')?.textContent).toContain('z.ts')
  })

  it('remembers an open hunk across an update', () => {
    const body = [{ id: 'd', type: 'diff', files, hunks: { 'src/a.ts': hunk } }]
    const { box, handle } = show(body)
    box.querySelector('button')?.click()
    handle.update({ vui: 1, body } as never)
    expect(box.querySelector('pre')?.textContent).toBe(`${hunk}\n`)
  })

  it('cleans a colored hunk and drops its last newline', () => {
    const { box } = show([{ type: 'diff', files: [], hunks: { x: '\u001b[32m+y\u001b[m\r\n' } }])
    box.querySelector('button')?.click()
    expect(box.querySelector('pre')?.textContent).toBe('+y\n')
  })

  it('treats --- and +++ inside a hunk as changes', () => {
    const { box } = show([
      { type: 'diff', files: [], hunks: { x: '@@ x\n--- old\n+++i\n context' } },
    ])
    box.querySelector('button')?.click()
    expect(texts(box, 'pre .vui-tone-err')).toEqual(['--- old\n'])
    expect(texts(box, 'pre .vui-tone-ok')).toEqual(['+++i\n'])
  })

  it('has no toggle for an empty hunk', () => {
    const { box } = show([{ type: 'diff', files: [['a', 1, 1]], hunks: { a: ' \n' } }])
    expect(box.querySelector('button')).toBeNull()
  })

  it('ignores a change that only a prototype knows', () => {
    const { box } = show([{ type: 'diff', files: [['a', 1, 1, 'constructor']] }])
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(box.querySelector('.vui-diff-mark')).toBeNull()
  })

  // Fuzzer, seed 2, index 421: `hasOwn` read `["M"]` as `"M"`, and the array became a child.
  it('ignores a change that is not a string', () => {
    for (const change of [['M'], ['A'], 1, { M: 1 }]) {
      const { box } = show([{ type: 'diff', files: [['a', 1, 2, change]] }])
      expect(box.querySelector('.vui-card-error')).toBeNull()
      expect(box.querySelector('.vui-diff-mark')).toBeNull()
      expect(box.querySelector('code')?.textContent).toBe('a')
    }
  })

  it('reads no hunk from a prototype', () => {
    const { box } = show([{ type: 'diff', files: [['constructor', 1, 1]], hunks: {} }])
    expect(box.querySelector('button')).toBeNull()
  })
})

describe('log', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `l${i}`).join('\n')

  it.each([
    ['ERROR boom', 'err'],
    ['WARN careful', 'warn'],
    ['WARNING careful', 'warn'],
    ['INFO hello', 'info'],
    ['DEBUG detail', 'muted'],
    ['[ERROR] boom', 'err'],
    ['12:00:01 INFO hello', 'info'],
    ['2026-11-05T10:00:00.123Z ERROR boom', 'err'],
    ['FATAL out of memory', 'err'],
    ['2026-11-16T10:00:05Z CRITICAL giving up', 'err'],
    ['PANIC goroutine 1', 'err'],
  ])('finds the level of %s', (line, tone) => {
    const { box } = show([{ type: 'log', text: line }])
    expect(box.querySelector('pre span')?.className).toBe(`vui-tone-${tone}`)
  })

  it.each([
    'plain line',
    'error in lower case',
    'no ERROR at the start',
    'ERRORS: 0',
    '0 ERRORS, 0 warnings',
    'INFORMATION',
    'DEBUGGER attached',
  ])('leaves %s plain', (line) => {
    const { box } = show([{ type: 'log', text: line }])
    expect(box.querySelector('pre span')).toBeNull()
  })

  it('finds a level behind a color, and copies clean text', async () => {
    const written: string[] = []
    Object.assign(navigator, {
      clipboard: { writeText: async (value: string) => void written.push(value) },
    })
    const { box } = show([{ type: 'log', text: '\u001b[31mERROR\u001b[0m boom' }])
    expect(box.querySelector('pre .vui-tone-err')?.textContent).toBe('ERROR boom\n')
    click(box, 'Copy')
    await Promise.resolve()
    expect(written).toEqual(['ERROR boom'])
  })

  it('folds after 40 lines by default', () => {
    const { box } = show([{ type: 'log', text: lines(41) }])
    expect(box.querySelector('.vui-fold-toggle')?.textContent).toContain('1 more line')
    expect(all(box, 'pre')[0]?.textContent?.trimEnd().split('\n')).toHaveLength(40)
  })

  it('does not fold at exactly 40 lines', () => {
    const { box } = show([{ type: 'log', text: lines(40) }])
    expect(box.querySelector('.vui-fold-toggle')).toBeNull()
  })

  it('takes maxLines', () => {
    const { box } = show([{ type: 'log', text: lines(5), maxLines: 2 }])
    expect(box.querySelector('.vui-fold-toggle')?.textContent).toContain('3 more lines')
  })

  it('keeps blank lines', () => {
    const { box } = show([{ type: 'log', text: 'a\n\nERROR b\n\nc' }])
    expect(box.querySelector('pre')?.textContent).toBe('a\n\nERROR b\n\nc\n')
  })

  it('draws a run of plain or of one level as one node', () => {
    const text = `${'x\n'.repeat(9_000)}${'ERROR a\n'.repeat(100)}${'y\n'.repeat(100)}`
    const { box } = show([{ type: 'log', text, maxLines: 20_000 }])
    expect(box.querySelector('pre code')?.childNodes).toHaveLength(3)
  })
})

describe('decision', () => {
  const options = [
    {
      label: 'In-process LRU',
      pros: ['No infra', 'Fast'],
      cons: ['Per-pod'],
      effort: 'S',
      reversible: true,
    },
    {
      label: 'Redis',
      pros: ['Shared'],
      effort: 'M',
      reversible: false,
      risk: 'med',
      verify: 'p95 `< 80 ms`',
    },
  ]
  const decision = { type: 'decision', question: 'Cache **layer**?', pick: 1, options }

  it('shows the question as written, and context as inline text', () => {
    const { box } = show([{ ...decision, context: 'See **this**' }])
    expect(box.textContent).toContain('Cache **layer**?')
    expect(box.querySelector('strong')?.textContent).toBe('this')
  })

  it('draws no field list for an option with nothing in it (VD-190)', () => {
    const { box } = show([
      { type: 'decision', question: 'Q', options: [{ label: 'A', effort: 'S' }, { label: 'B' }] },
    ])
    expect(all(box, '.vui-options li')).toHaveLength(2)
    expect(all(box, '.vui-options dl')).toHaveLength(1)
  })

  it('draws one card per option, as a list', () => {
    const { box } = show([decision])
    expect(all(box, '.vui-options > li.vui-card')).toHaveLength(2)
    expect(texts(box, '.vui-card-title')).toEqual(['In-process LRU', 'Redis'])
  })

  it('lists the fields of an option in order', () => {
    const { box } = show([decision])
    expect(texts(all(box, '.vui-card')[0] as Element, 'dt')).toEqual([
      'Pros',
      'Cons',
      'Effort',
      'Reversible',
    ])
    expect(texts(all(box, '.vui-card')[1] as Element, 'dt')).toEqual([
      'Pros',
      'Effort',
      'Reversible',
      'Risk',
      'Verify',
    ])
    expect(texts(all(box, '.vui-card')[0] as Element, 'dd li')).toEqual([
      'No infra',
      'Fast',
      'Per-pod',
    ])
    expect(texts(all(box, '.vui-card')[1] as Element, 'dd')).toContain('no')
    expect(box.querySelector('dd code')?.textContent).toBe('< 80 ms')
  })

  it('marks the pick with words as well as a border', () => {
    const { box } = show([decision])
    const picked = box.querySelector('.vui-option-pick')
    expect(picked?.textContent).toContain('Redis')
    expect(picked?.textContent).toContain('Recommended')
    expect(all(box, '.vui-option-pick')).toHaveLength(1)
  })

  it('marks nothing without a pick, or with one out of range', () => {
    const { pick: _, ...none } = decision
    expect(show([none]).box.querySelector('.vui-option-pick')).toBeNull()
    expect(show([{ ...decision, pick: 9 }]).box.querySelector('.vui-option-pick')).toBeNull()
  })

  it('has no way to answer (D8)', () => {
    const { box } = show([decision])
    expect(box.querySelector('button, input, select, textarea, form, [tabindex]')).toBeNull()
  })

  it('keeps a card whose pros are not text', () => {
    const bad = [{ label: 'a', pros: [{ text: 'x' }, 'fine', 1] }]
    const { box } = show([{ type: 'decision', question: 'q', options: bad }])
    expect(box.querySelector('.vui-card-error')).toBeNull()
    expect(texts(box, 'dd li')).toEqual(['fine'])
  })

  it('sits in a box that a container query can measure', () => {
    const { box } = show([decision])
    expect(box.querySelector('.vui-grid-box > .vui-options')).not.toBeNull()
  })
})

describe('a list that takes too long', () => {
  afterEach(() => vi.restoreAllMocks())

  const many = Array.from({ length: 5 }, (_, index) => ({
    name: `n${index}`,
    text: `t${index}`,
    at: 'x',
    label: 'l',
    status: 'ok',
  }))

  it.each([
    ['checks', { items: many.map(({ name, status }) => ({ name, status })) }],
    ['plan', { items: many.map(({ text, status }) => ({ text, status })) }],
    ['tree', { items: many.map(({ name }) => ({ name })) }],
    ['timeline', { items: many.map(({ at, text }) => ({ at, text })) }],
    ['decision', { question: 'q', options: many.map(({ label }) => ({ label })) }],
    ['diff', { files: many.map(({ name }) => [name, 1, 1]) }],
  ])('stops %s at a checkpoint', (type, fields) => {
    // A second per reading: past the budget on the quarter-speed CI clock too (VD-231).
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      time += 1_000
      return time
    })
    const { box } = show([{ type, ...fields }])
    expect(box.querySelector('.vui-card-error')?.textContent).toContain('took longer')
  })
})
