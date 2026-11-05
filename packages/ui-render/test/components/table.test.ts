import { afterEach, describe, expect, it, vi } from 'vitest'
import { table as table_ } from '../../src/components/table.js'
import { show } from '../helpers.js'

const all = (box: Element, selector: string) => [...box.querySelectorAll(selector)] as HTMLElement[]
const table = (fields: object) => show([{ type: 'table', ...fields }])
const firstColumn = (box: Element) =>
  all(box, 'tbody tr:not(.vui-group)').map(
    (row) => row.querySelector('th, td')?.textContent as string,
  )
const header = (box: Element, index: number) => all(box, 'thead th')[index] as HTMLElement
const clickHeader = (box: Element, index: number) =>
  (header(box, index).querySelector('button') as HTMLButtonElement).click()
const numbers = (count: number) => Array.from({ length: count }, (_, index) => [index])

const DEMO = {
  columns: ['Test', 'Status:status', 'Time:ms'],
  rows: [
    ['login', 'ok', 120],
    ['refresh', 'fail', 340],
    ['alpha', 'run', 20],
  ],
}

describe('table structure', () => {
  it('is a real table with scoped headers', () => {
    const { box } = table(DEMO)
    expect(all(box, 'thead th[scope="col"]')).toHaveLength(3)
    expect(all(box, 'tbody th[scope="row"]')).toHaveLength(3)
    expect(all(box, 'tbody td')).toHaveLength(6)
  })

  it('takes its caption from the title', () => {
    const { box } = table({ ...DEMO, title: 'A *run*' })
    expect(box.querySelector('table > caption em')?.textContent).toBe('run')
    expect(all(box, '.vui-node-title')).toHaveLength(0)
  })

  it('has no caption without a title', () => {
    expect(table(DEMO).box.querySelector('caption')).toBeNull()
  })

  it('keeps a caption for assistive tech when the frame draws a fold', () => {
    const { box } = table({ ...DEMO, title: 'Runs', fold: 'open' })
    expect(box.querySelector('caption.vui-sr-only')?.textContent).toBe('Runs')
    expect(box.querySelector('.vui-fold-toggle')?.textContent).toContain('Runs')
  })

  it('keeps links out of a hidden caption', () => {
    const { box } = table({ ...DEMO, title: '[Runs](https://example.test/)', fold: 'open' })
    expect(box.querySelector('caption')?.textContent).toBe('Runs')
    expect(box.querySelector('caption a')).toBeNull()
  })

  it('draws the note under the table', () => {
    expect(table({ ...DEMO, note: 'n' }).box.querySelector('.vui-note')?.textContent).toBe('n')
  })

  it('formats cells', () => {
    const { box } = table(DEMO)
    expect(all(box, 'tbody tr')[0]?.textContent).toContain('120 ms')
    expect(box.querySelector('tbody .vui-status-label')?.textContent).toBe('ok')
  })

  it('shows an em dash for a null and for a missing cell', () => {
    const { box } = table({ columns: ['A', 'B'], rows: [[null, 1], { A: 1 }] })
    expect(all(box, 'tbody th')[0]?.textContent).toBe('—')
    expect(all(box, 'tbody td')[0]?.textContent).toBe('1')
    expect(all(box, 'tbody td')[1]?.textContent).toBe('—')
  })

  it('renders a table with no rows', () => {
    const { box } = table({ columns: ['A'], rows: [] })
    expect(all(box, 'thead th')).toHaveLength(1)
    expect(box.querySelector('.vui-show-more')).toBeNull()
  })

  it('shows the title of a table with no columns', () => {
    const { box } = table({ title: 'Empty', rows: [] })
    expect(box.querySelector('table')).toBeNull()
    expect(box.textContent).toContain('Empty')
  })

  it('draws nothing more for an untitled table with no columns', () => {
    expect(table({ rows: [] }).box.querySelector('.vui-card-error')).toBeNull()
  })

  it('does not repeat a fold title on a table with no columns', () => {
    const { box } = table({ title: 'Empty', fold: 'open', rows: [] })
    expect(all(box, '.vui-node-title')).toHaveLength(1)
  })

  it('applies align, width and wrap to the column', () => {
    const { box } = table({
      columns: [
        { key: 'a', label: 'A', align: 'center', width: 'wide', wrap: true },
        { key: 'b', label: 'B', width: 'narrow', wrap: false },
        { key: 'c', label: 'C', width: 'auto' },
      ],
      rows: [['x', 'y', 'z']],
    })
    const [a, b, c] = all(box, 'tbody tr > *') as [HTMLElement, HTMLElement, HTMLElement]
    expect(a.className).toContain('vui-align-center')
    expect(a.className).toContain('vui-width-wide')
    expect(a.className).toContain('vui-wrap')
    expect(b.className).toContain('vui-width-narrow')
    expect(b.className).toContain('vui-nowrap')
    expect(c.className).not.toContain('vui-width')
    expect(header(box, 0).className).toContain('vui-align-center')
  })

  it('keeps numbers on one line, but not right-aligned prose', () => {
    const { box } = table({
      columns: ['N:int', 'O:int', { key: 'p', label: 'P', align: 'right' }],
      rows: [[1, 2, 'prose']],
    })
    const cells = all(box, 'tbody td')
    expect(cells[0]?.className).toContain('vui-nowrap')
    expect(cells[1]?.className).not.toContain('vui-nowrap')
  })

  it('lets wrap beat the rule for numbers', () => {
    const { box } = table({
      columns: [{ key: 'n', label: 'N', format: 'int', wrap: true }],
      rows: [[1]],
    })
    expect(box.querySelector('tbody th')?.className).not.toContain('vui-nowrap')
  })

  it('right-aligns numbers as VD-055 says', () => {
    const { box } = table(DEMO)
    expect(header(box, 2).className).toContain('vui-align-right')
    expect(header(box, 0).className).toContain('vui-align-left')
    expect(all(box, 'tbody td')[1]?.className).toContain('vui-align-right')
  })
})

describe('table sort', () => {
  it('applies the initial sort', () => {
    const { box } = table({ ...DEMO, sort: [2, 'desc'] })
    expect(firstColumn(box)).toEqual(['refresh', 'login', 'alpha'])
    expect(header(box, 2).getAttribute('aria-sort')).toBe('descending')
  })

  it('marks every other header as not sorted', () => {
    const { box } = table({ ...DEMO, sort: [2, 'asc'] })
    expect(header(box, 0).getAttribute('aria-sort')).toBe('none')
    expect(header(box, 2).getAttribute('aria-sort')).toBe('ascending')
  })

  it('keeps document order with no sort', () => {
    expect(firstColumn(table(DEMO).box)).toEqual(['login', 'refresh', 'alpha'])
  })

  it('sorts ascending on the first click', () => {
    const { box } = table(DEMO)
    clickHeader(box, 0)
    expect(firstColumn(box)).toEqual(['alpha', 'login', 'refresh'])
    expect(header(box, 0).getAttribute('aria-sort')).toBe('ascending')
  })

  it('flips on the second click', () => {
    const { box } = table(DEMO)
    clickHeader(box, 0)
    clickHeader(box, 0)
    expect(firstColumn(box)).toEqual(['refresh', 'login', 'alpha'])
    expect(header(box, 0).getAttribute('aria-sort')).toBe('descending')
  })

  it('starts ascending on a new column', () => {
    const { box } = table({ ...DEMO, sort: [0, 'desc'] })
    clickHeader(box, 2)
    expect(firstColumn(box)).toEqual(['alpha', 'login', 'refresh'])
    expect(header(box, 0).getAttribute('aria-sort')).toBe('none')
  })

  it('shows direction without color', () => {
    const { box } = table(DEMO)
    clickHeader(box, 0)
    expect(header(box, 0).querySelector('.vui-sort-icon')?.textContent).toBe('▲')
    clickHeader(box, 0)
    expect(header(box, 0).querySelector('.vui-sort-icon')?.textContent).toBe('▼')
  })

  it('keeps the sorted header button, so focus stays', () => {
    const { box } = table(DEMO)
    const button = header(box, 0).querySelector('button') as HTMLButtonElement
    button.focus()
    button.click()
    expect(document.activeElement).toBe(button)
  })

  it('remembers the sort across update', () => {
    const { box, handle } = table(DEMO)
    clickHeader(box, 0)
    handle.update({ vui: 1, body: [{ type: 'table', ...DEMO }] } as never)
    expect(firstColumn(box)[0]).toBe('alpha')
  })

  it('leaves a bad direction one click from descending', () => {
    const { box } = table({ ...DEMO, sort: [0, 'up'] })
    expect(header(box, 0).getAttribute('aria-sort')).toBe('ascending')
    clickHeader(box, 0)
    expect(header(box, 0).getAttribute('aria-sort')).toBe('descending')
  })

  it('ignores a sort past the last column', () => {
    const { box } = table({ ...DEMO, sort: [9, 'asc'] })
    expect(firstColumn(box)[0]).toBe('login')
    expect(box.querySelector('[aria-sort="ascending"]')).toBeNull()
  })

  it('reports an issue at the source row, not the sorted one', () => {
    const { box, handle } = table({
      columns: ['At:rel', 'N'],
      rows: [
        ['2026-01-01T00:00:00Z', 2],
        ['2026-01-02T00:00:00Z', 1],
      ],
      sort: [1, 'asc'],
    })
    expect(firstColumn(box)).toHaveLength(2)
    const paths = handle.diagnostics.map(({ path }) => path)
    expect(paths).toContain('/body/0/rows/1/0')
    expect(paths).toContain('/body/0/rows/0/0')
  })
})

describe('table paging', () => {
  const more = (box: Element) => box.querySelector('.vui-show-more') as HTMLButtonElement

  it('defaults to 25 rows', () => {
    const { box } = table({ columns: ['N'], rows: numbers(30) })
    expect(firstColumn(box)).toHaveLength(25)
    expect(more(box).textContent).toBe('Show 5 more')
  })

  it('shows pageSize rows', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4 })
    expect(firstColumn(box)).toHaveLength(4)
    expect(more(box).textContent).toBe('Show 4 more')
  })

  it('is a button that states it is collapsed', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4 })
    expect(more(box).getAttribute('aria-expanded')).toBe('false')
    expect(more(box).type).toBe('button')
  })

  it('has no control when everything fits', () => {
    const { box } = table({ columns: ['N'], rows: numbers(4), pageSize: 4 })
    expect(more(box)).toBeNull()
  })

  it('adds a page per click and counts down', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4 })
    more(box).click()
    expect(firstColumn(box)).toHaveLength(8)
    expect(more(box).textContent).toBe('Show 2 more')
  })

  it('removes the control at the end and moves focus to the first new row', () => {
    const { box } = table({ columns: ['N'], rows: numbers(6), pageSize: 4 })
    more(box).focus()
    more(box).click()
    expect(firstColumn(box)).toHaveLength(6)
    expect(more(box).hidden).toBe(true)
    expect(document.activeElement).toBe(all(box, 'tbody tr')[4])
  })

  it('keeps focus on the control while it stays', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4 })
    const button = more(box)
    button.focus()
    button.click()
    expect(document.activeElement).toBe(button)
  })

  it('keeps the shown count through a sort', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4 })
    more(box).click()
    clickHeader(box, 0)
    clickHeader(box, 0)
    expect(firstColumn(box)).toHaveLength(8)
    expect(firstColumn(box)[0]).toBe('9')
  })

  it('pages after sorting all rows, not only the shown ones', () => {
    const { box } = table({ columns: ['N'], rows: numbers(10), pageSize: 4, sort: [0, 'desc'] })
    expect(firstColumn(box)[0]).toBe('9')
  })

  it('remembers the shown count across update', () => {
    const fields = { columns: ['N'], rows: numbers(10), pageSize: 4 }
    const { box, handle } = table(fields)
    more(box).click()
    handle.update({ vui: 1, body: [{ type: 'table', ...fields }] } as never)
    expect(firstColumn(box)).toHaveLength(8)
  })

  it('falls back to 25 when pageSize is dropped', () => {
    const { box } = table({ columns: ['N'], rows: numbers(30), pageSize: -1 })
    expect(firstColumn(box)).toHaveLength(25)
  })
})

describe('table totals', () => {
  it('draws a footer, formatted like the columns', () => {
    const { box } = table({ ...DEMO, totals: ['Total', null, 480] })
    const cells = all(box, 'tfoot tr > *')
    expect(cells.map((cell) => cell.textContent)).toEqual(['Total', '—', '480 ms'])
    expect(cells[0]?.getAttribute('scope')).toBe('row')
  })

  it('has no footer without totals', () => {
    expect(table(DEMO).box.querySelector('tfoot')).toBeNull()
  })

  it('draws no bar in a footer', () => {
    const { box } = table({
      columns: [{ key: 'a', label: 'A', cell: 'bar', format: 'int' }],
      rows: [[1]],
      totals: [5],
    })
    expect(box.querySelector('tfoot .vui-track')).toBeNull()
  })

  it('stays after the rows when sorting', () => {
    const { box } = table({ ...DEMO, totals: ['Total', null, 1] })
    clickHeader(box, 0)
    expect(box.querySelector('table')?.lastElementChild?.tagName).toBe('TFOOT')
  })
})

describe('table group', () => {
  const GROUPED = {
    columns: ['Area', 'Test'],
    rows: [
      ['api', 'a'],
      ['api', 'b'],
      ['ui', 'c'],
      ['api', 'd'],
    ],
    group: 0,
  }

  it('starts a tbody with a sub-header at each change', () => {
    const { box } = table(GROUPED)
    const headers = all(box, 'tbody > tr.vui-group > th[scope="rowgroup"]')
    expect(headers.map((cell) => cell.textContent)).toEqual(['api', 'ui', 'api'])
    expect(headers[0]?.getAttribute('colspan')).toBe('2')
    expect(all(box, 'tbody')).toHaveLength(3)
  })

  it('counts rows, not sub-headers, against the page', () => {
    const { box } = table({ ...GROUPED, pageSize: 3 })
    expect(all(box, 'tbody tr:not(.vui-group)')).toHaveLength(3)
  })

  it('regroups after a sort', () => {
    const { box } = table(GROUPED)
    clickHeader(box, 0)
    expect(all(box, '.vui-group')).toHaveLength(2)
  })

  it('groups empty cells together', () => {
    const { box } = table({
      ...GROUPED,
      rows: [
        [null, 'a'],
        [null, 'b'],
      ],
    })
    expect(all(box, '.vui-group')).toHaveLength(1)
  })

  it('ignores a group past the last column', () => {
    const { box } = table({ ...GROUPED, group: 7 })
    expect(all(box, '.vui-group')).toHaveLength(0)
    expect(all(box, 'tbody')).toHaveLength(1)
  })
})

describe('table sticky and pin', () => {
  const scroller = (box: Element) => box.querySelector('.vui-table-box') as HTMLElement

  it('is sticky past 15 rows by default', () => {
    expect(scroller(table({ columns: ['N'], rows: numbers(16) }).box).className).toContain(
      'vui-table-sticky',
    )
  })

  it('is not sticky at 15 rows', () => {
    expect(scroller(table({ columns: ['N'], rows: numbers(15) }).box).className).not.toContain(
      'vui-table-sticky',
    )
  })

  it('takes sticky from the document', () => {
    const on = table({ columns: ['N'], rows: numbers(1), sticky: true })
    const off = table({ columns: ['N'], rows: numbers(20), sticky: false })
    expect(scroller(on.box).className).toContain('vui-table-sticky')
    expect(scroller(off.box).className).not.toContain('vui-table-sticky')
  })

  it('applies the default itself when sticky is dropped', () => {
    const { box } = table({ columns: ['N'], rows: numbers(20), sticky: 'yes' })
    expect(scroller(box).className).toContain('vui-table-sticky')
  })

  const columns = (count: number) => Array.from({ length: count }, (_, index) => `C${index}`)

  it('pins the first column over 4 columns', () => {
    const { box } = table({ columns: columns(5), rows: [] })
    expect(box.querySelector('table')?.className).toContain('vui-table-pinned')
  })

  it('does not pin at 4 columns', () => {
    const { box } = table({ columns: columns(4), rows: [] })
    expect(box.querySelector('table')?.className).not.toContain('vui-table-pinned')
  })
})

describe('table row options', () => {
  const row = (options: object) => table({ columns: ['A', 'B'], rows: [['x', 1, options]] }).box

  it('takes a tone on the row, with a word and a glyph', () => {
    const box = row({ tone: 'warn' })
    expect(box.querySelector('tbody tr')?.className).toContain('vui-tone-warn')
    expect(box.querySelector('tbody th .vui-sr-only')?.textContent).toBe('warning')
  })

  it('takes a tone with no mark', () => {
    const box = row({ tone: 'muted' })
    expect(box.querySelector('tbody tr')?.className).toContain('vui-tone-muted')
    expect(box.querySelector('tbody .vui-sr-only')).toBeNull()
  })

  it('takes a note in the first cell', () => {
    expect(row({ note: '*why*' }).querySelector('tbody th .vui-row-note em')?.textContent).toBe(
      'why',
    )
  })

  it('is not a cell', () => {
    expect(all(row({ note: 'n' }), 'tbody tr > *')).toHaveLength(2)
  })
})

describe('table cells', () => {
  const bars = (box: Element) =>
    all(box, 'tbody .vui-fill').map((bar) => bar.getAttribute('data-vui-fill'))
  const barTable = (format: string | undefined, values: unknown[]) =>
    table({
      columns: [{ key: 'a', label: 'A', cell: 'bar', ...(format ? { format } : {}) }],
      rows: values.map((value) => [value]),
    })

  it('scales a bar to the column maximum', () => {
    expect(bars(barTable('int', [50, 100, 25]).box)).toEqual(['50', '100', '25'])
  })

  it('scales a bar to 1.0 for pct', () => {
    expect(bars(barTable('pct:0', [0.5, 0.25]).box)).toEqual(['50', '25'])
  })

  it('scales a bar to 100 for pct100', () => {
    expect(bars(barTable('pct100', [50]).box)).toEqual(['50'])
  })

  it('takes the column maximum from rows off the page', () => {
    const { box } = table({
      columns: [{ key: 'a', label: 'A', cell: 'bar' }],
      rows: [[50], [100]],
      pageSize: 1,
    })
    expect(bars(box)).toEqual(['50'])
  })

  it('keeps the value text next to the bar', () => {
    expect(barTable('int', [5]).box.querySelector('tbody th')?.textContent).toBe('5')
  })

  it('hides the bar from assistive tech, since the text says it', () => {
    const track = barTable('int', [5]).box.querySelector('.vui-track')
    expect(track?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws no bar for a null or a string', () => {
    expect(bars(barTable(undefined, [null, 'x']).box)).toEqual([])
  })

  it('fills nothing for a negative value', () => {
    expect(bars(barTable('int', [-5, 10]).box)).toEqual(['0', '100'])
  })

  it('never sets a style attribute', () => {
    expect(barTable('int', [5, 9]).box.querySelector('[style]')).toBeNull()
  })

  const badge = (column: object, value: unknown) =>
    table({ columns: [{ key: 'a', label: 'A', cell: 'badge', ...column }], rows: [[value]] }).box

  it('draws a badge from a status format', () => {
    const box = badge({ format: 'status' }, 'fail')
    expect(box.querySelector('.vui-status.vui-tone-err .vui-status-label')?.textContent).toBe(
      'fail',
    )
  })

  it('draws a badge from a status word', () => {
    expect(badge({}, 'ok').querySelector('.vui-status-icon')?.textContent).toBe('✓')
  })

  it('draws a badge from tones, with a mark and the text', () => {
    const box = badge({ tones: { high: 'err' } }, 'high')
    const pill = box.querySelector('.vui-status.vui-tone-err') as HTMLElement
    expect(pill.textContent).toContain('high')
    expect(pill.querySelector('.vui-sr-only')?.textContent).toBe('error')
  })

  it('draws a neutral pill for a value with no tone', () => {
    expect(badge({}, 'other').querySelector('.vui-status.vui-tone-muted')?.textContent).toBe(
      'other',
    )
  })

  it('draws an em dash, not a pill, for null', () => {
    const box = badge({}, null)
    expect(box.querySelector('.vui-status')).toBeNull()
    expect(box.querySelector('tbody th')?.textContent).toBe('—')
  })

  describe('code', () => {
    const write = vi.fn(() => Promise.resolve())
    const flush = () => new Promise((resolve) => setTimeout(resolve))
    const original = navigator.clipboard

    afterEach(() => {
      vi.useRealTimers()
      Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
      write.mockClear()
    })

    const allow = () =>
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: write },
        configurable: true,
      })
    const deny = () =>
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })

    const cell = (value: unknown, format?: string) =>
      table({
        columns: [{ key: 'a', label: 'A', cell: 'code', ...(format ? { format } : {}) }],
        rows: [[value]],
      }).box
    const button = (box: Element) => box.querySelector('.vui-cell-copy') as HTMLButtonElement

    it('is a button holding code', () => {
      const box = cell('abc')
      expect(button(box).querySelector('code')?.textContent).toBe('abc')
      expect(button(box).getAttribute('aria-label')).toBe('Copy abc')
    })

    it('names and titles a cut value in full', () => {
      const long = 'x'.repeat(100)
      const box = cell(long, 'code')
      expect(button(box).title).toBe(long)
      expect(button(box).getAttribute('aria-label')).toBe(`Copy ${long}`)
    })

    it('clears a success when a later click fails, and a failure when a later one lands', async () => {
      allow()
      const box = cell('abc')
      button(box).click()
      await flush()
      deny()
      button(box).click()
      await flush()
      expect(button(box).className).not.toContain('vui-copied')
      allow()
      button(box).click()
      await flush()
      expect(button(box).title).toBe('')
      expect(button(box).getAttribute('aria-label')).toBe('Copied')
    })

    it('copies on click and says so', async () => {
      allow()
      const box = cell('abc')
      button(box).click()
      await flush()
      expect(write).toHaveBeenCalledWith('abc')
      expect(button(box).getAttribute('aria-label')).toBe('Copied')
      expect(button(box).className).toContain('vui-copied')
    })

    it('copies the whole value when the display is cut', async () => {
      allow()
      const long = 'x'.repeat(100)
      button(cell(long, 'code')).click()
      await flush()
      expect(write).toHaveBeenCalledWith(long)
    })

    it('goes back after a moment', async () => {
      allow()
      const box = cell('abc')
      button(box).click()
      await flush()
      vi.useFakeTimers()
      button(box).click()
      await vi.advanceTimersByTimeAsync(2000)
      expect(button(box).getAttribute('aria-label')).toBe('Copy abc')
      expect(button(box).className).not.toContain('vui-copied')
    })

    it('asks the reader to select when copying is denied', async () => {
      deny()
      const box = cell('abc')
      button(box).click()
      await flush()
      expect(button(box).getAttribute('aria-label')).toBe('Select text to copy')
      expect(button(box).title).toBe('Select text to copy')
    })

    it('leaves no timer running after destroy', async () => {
      allow()
      vi.useFakeTimers()
      const { box, handle } = table({
        columns: [{ key: 'a', label: 'A', cell: 'code' }],
        rows: [['abc']],
      })
      const element = button(box)
      element.click()
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(1)
      handle.destroy()
      expect(vi.getTimerCount()).toBe(0)
      expect(element.className).toContain('vui-copied')
    })

    it('draws an em dash, not a button, for null', () => {
      const box = cell(null)
      expect(button(box)).toBeNull()
      expect(box.querySelector('tbody th')?.textContent).toBe('—')
    })
  })
})

describe('table tolerance', () => {
  it('reads an object row left by the cell cap as an empty row', () => {
    const { box } = table({ columns: ['A'], rows: [] })
    expect(box.querySelector('.vui-card-error')).toBeNull()
  })

  it('draws a bad tones value as a neutral pill, so no page can throw', () => {
    const { box } = table({
      columns: [{ key: 'a', label: 'A', cell: 'badge', tones: { high: 'purple' } }],
      rows: [['high']],
    })
    expect(box.querySelector('tbody .vui-status.vui-tone-muted')).not.toBeNull()
  })

  it('costs one row, not the table, when a row fails', () => {
    const context = {
      pointer: '',
      locale: 'en-US',
      state: new Map(),
      checkpoint: () => {},
      onDestroy: () => {},
      value(value: unknown) {
        if (value === 'boom') throw new Error('fixture')
        return [document.createTextNode(String(value))]
      },
    } as never
    const node = {
      columns: [{ key: 'a', label: 'A' }],
      rows: [['ok'], ['boom'], ['fine']],
    }
    const [box] = [table_.render(node, context) as HTMLElement]
    expect(firstColumn(box)).toEqual(['ok', 'Could not render this row', 'fine'])
  })

  it('renders a row past the cut with its options', () => {
    const columns = Array.from({ length: 32 }, (_, index) => `C${index}`)
    const cells = Array.from({ length: 32 }, (_, index) => index)
    const { box } = table({ columns, rows: [[...cells, { tone: 'err' }]] })
    expect(all(box, 'tbody tr > *')).toHaveLength(30)
    expect(box.querySelector('tbody tr')?.className).toContain('vui-tone-err')
  })

  it('ignores a sort and a group left past a cut', () => {
    const columns = Array.from({ length: 32 }, (_, index) => `C${index}`)
    const { box } = table({ columns, rows: [], sort: [31, 'asc'], group: 31 })
    expect(all(box, 'thead th')).toHaveLength(30)
    expect(box.querySelector('[aria-sort="ascending"]')).toBeNull()
  })
})
