import {
  alignOf,
  badgeOf,
  type Column,
  type Formatted,
  groupKey,
  inlineToPlain,
  isJsonObject,
  type JsonValue,
  type ParsedRow,
  parseFormat,
  parseInline,
  parseRow,
  sortRows,
  type TableNode,
} from '@vadd/ui-spec'
import type { Component, NodeContext } from '../context.js'
import { copyText, select } from '../copy.js'
import { type Child, el } from '../el.js'
import { fillOf } from '../fill.js'
import { statusBadge, toneClass, toneMark, toneOf } from '../inline.js'
import { field, nodeList, text, whole } from './fields.js'

const DEFAULT_PAGE = 25
const STICKY_ROWS = 15
const PIN_COLUMNS = 4
const CHECK_EVERY = 256
const COPIED_MS = 1500
const SORT = 'sort'
const SHOWN = 'shown'
const SELECT_TEXT = 'Select text to copy'
const ROW_FAILED = 'Could not render this row'

type Sort = NonNullable<TableNode['sort']>

/** What every cell of a table needs. */
interface View {
  columns: Column[]
  classes: string[]
  /** What fills a bar in each `bar` column. */
  scales: Map<number, number>
  context: NodeContext
}

function barScale(column: Column, index: number, rows: ParsedRow[]): number {
  const name = typeof column.format === 'string' ? parseFormat(column.format).name : 'text'
  if (name === 'pct') return 1
  if (name === 'pct100') return 100
  let max = 0
  for (const { cells } of rows) {
    const value = cells[index]
    if (typeof value === 'number' && value > max) max = value
  }
  return max
}

function codeCell(formatted: Formatted, context: NodeContext): HTMLElement {
  const full = formatted.title ?? formatted.text
  const label = `Copy ${full}`
  const shown = el('code', { class: 'vui-code' }, formatted.text)
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    button.classList.remove('vui-copied')
    button.title = formatted.title ?? ''
    button.setAttribute('aria-label', label)
  }
  const click = async () => {
    clearTimeout(timer)
    reset()
    if (await copyText(full, () => select(shown, shown))) {
      button.classList.add('vui-copied')
      button.setAttribute('aria-label', 'Copied')
      timer = setTimeout(reset, COPIED_MS)
      context.onDestroy(() => clearTimeout(timer))
      return
    }
    button.title = SELECT_TEXT
    button.setAttribute('aria-label', SELECT_TEXT)
  }
  const button = el(
    'button',
    {
      class: 'vui-cell-copy',
      type: 'button',
      title: formatted.title,
      'aria-label': label,
      on: { click: () => void click() },
    },
    shown,
  )
  return button
}

function badge(column: Column, formatted: Formatted): HTMLElement {
  const { tone, status } = badgeOf(column, formatted)
  if (status !== undefined) return statusBadge(status)
  const shade = tone ?? 'muted'
  return el('span', { class: `vui-status ${toneClass(shade)}` }, [
    toneMark(shade, 'vui-status-icon'),
    el('span', { class: 'vui-status-label' }, formatted.text),
  ])
}

function barCell(value: JsonValue | undefined, content: Node[], scale: number): HTMLElement {
  const fill = el('span', { class: 'vui-fill', 'data-vui-fill': fillOf(value as number, scale) })
  return el('span', { class: 'vui-bar' }, [
    el('span', { class: 'vui-bar-value' }, content),
    el('span', { class: 'vui-track', 'aria-hidden': 'true' }, fill),
  ])
}

function content(
  value: JsonValue | undefined,
  index: number,
  at: string,
  view: View,
  bars: boolean,
): Child[] {
  const { columns, context, scales } = view
  const column = columns[index] as Column
  const shown = context.value(value, column.format, at)
  if (value === null || value === undefined) return shown
  if (column.cell === 'badge' || column.cell === 'code') {
    const formatted = context.format(value, column.format, at)
    return [column.cell === 'code' ? codeCell(formatted, context) : badge(column, formatted)]
  }
  const scale = scales.get(index)
  if (bars && scale !== undefined && typeof value === 'number') {
    return [barCell(value, shown, scale)]
  }
  return shown
}

function cellElement(index: number, children: Child[], view: View): HTMLElement {
  const attributes = { class: view.classes[index] }
  return index === 0
    ? el('th', { ...attributes, scope: 'row' }, children)
    : el('td', attributes, children)
}

function rowElement({ cells, options, index: source }: ParsedRow, view: View): HTMLElement {
  const { columns, context } = view
  const tone = toneOf(options.tone)
  const note = options.note
  const row = columns.map((_, index) => {
    const at = `${context.pointer}/rows/${source}/${index}`
    const children = content(cells[index], index, at, view, true)
    if (index !== 0) return cellElement(index, children, view)
    return cellElement(
      index,
      [
        tone === undefined ? null : toneMark(tone, `vui-mark ${toneClass(tone)}`),
        ...children,
        typeof note === 'string'
          ? el('span', { class: 'vui-row-note' }, context.inline(note))
          : null,
      ],
      view,
    )
  })
  return el('tr', tone === undefined ? {} : { class: `vui-row-toned ${toneClass(tone)}` }, row)
}

/** A row that fails costs one row: a page painted after mount has no node guard around it. */
function safeRow(row: ParsedRow, view: View): HTMLElement {
  try {
    return rowElement(row, view)
  } catch {
    const message = el('th', { scope: 'row', colspan: view.columns.length }, ROW_FAILED)
    return el('tr', {}, message)
  }
}

function groupRow(cell: JsonValue | undefined, source: number, index: number, view: View) {
  const at = `${view.context.pointer}/rows/${source}/${index}`
  const label = el('span', { class: 'vui-group-label' }, content(cell, index, at, view, false))
  const header = el('th', { scope: 'rowgroup', colspan: view.columns.length }, label)
  return el('tr', { class: 'vui-group' }, header)
}

/** One `tbody` per run of a group: `scope="rowgroup"` means the one it sits in. */
function bodies(rows: ParsedRow[], group: number | undefined, view: View) {
  const lists: Child[][] = [[]]
  const rowElements: HTMLElement[] = []
  let current: string | undefined
  rows.forEach((row, position) => {
    if (position % CHECK_EVERY === 0) view.context.checkpoint()
    if (group !== undefined) {
      const value = row.cells[group]
      const key = groupKey(value)
      if (key !== current) {
        if (current !== undefined) lists.push([])
        current = key
        lists[lists.length - 1]?.push(groupRow(value, row.index, group, view))
      }
    }
    const element = safeRow(row, view)
    rowElements.push(element)
    lists[lists.length - 1]?.push(element)
  })
  return { tbodies: lists.map((list) => el('tbody', {}, list)), rowElements }
}

function footer(totals: JsonValue[], view: View): HTMLElement {
  const { columns, context } = view
  const cells = columns.map((_, index) => {
    const at = `${context.pointer}/totals/${index}`
    return cellElement(index, content(totals[index], index, at, view, false), view)
  })
  return el('tfoot', {}, el('tr', {}, cells))
}

function classOf(column: Column, index: number, rows: ParsedRow[]): string {
  const { width, wrap } = column
  const align = alignOf(column, index, rows)
  const numbers = column.align === undefined && align === 'right'
  const sized = width === 'narrow' || width === 'wide' ? ` vui-width-${width}` : ''
  const wrapped = wrap === true ? ' vui-wrap' : wrap === false || numbers ? ' vui-nowrap' : ''
  return `vui-align-${align}${sized}${wrapped}`
}

function columnsOf(list: JsonValue[]): Column[] {
  return list.map((column) =>
    isJsonObject(column) ? (column as unknown as Column) : { key: '', label: '' },
  )
}

function ariaSort(sort: Sort | undefined, index: number): string {
  if (sort?.[0] !== index) return 'none'
  return sort[1] === 'desc' ? 'descending' : 'ascending'
}

function captionOf(node: Parameters<Component['render']>[0], context: NodeContext) {
  const title = text(node, 'title')
  if (title === '') return null
  // Under a fold it is hidden, and a link in it would still take focus.
  if (context.titleDrawn) {
    return el('caption', { class: 'vui-sr-only' }, inlineToPlain(parseInline(title)))
  }
  return el('caption', { class: 'vui-caption' }, context.inline(title))
}

export const table: Component = {
  ownsTitle: true,
  render(node, context) {
    const columns = columnsOf(nodeList(node, 'columns'))
    if (columns.length === 0) {
      const title = text(node, 'title')
      return title === '' || context.titleDrawn ? [] : context.heading(title)
    }
    const parsed = nodeList(node, 'rows').map((row, index) => parseRow(row, index, columns))
    const scales = new Map<number, number>()
    columns.forEach((column, index) => {
      if (column.cell === 'bar') scales.set(index, barScale(column, index, parsed))
    })
    const classes = columns.map((column, index) => classOf(column, index, parsed))
    const view: View = { columns, classes, scales, context }

    const asked = whole(node, 'pageSize')
    const pageSize = asked !== undefined && asked > 0 ? asked : DEFAULT_PAGE
    const stored = context.state.get(SORT) as Sort | undefined
    let sort = stored ?? (field(node, 'sort') as Sort | undefined)
    let shown = (context.state.get(SHOWN) as number | undefined) ?? pageSize
    let order = sortRows(parsed, columns, sort, context.locale)

    const groupAt = whole(node, 'group')
    const group = groupAt !== undefined && columns[groupAt] !== undefined ? groupAt : undefined
    const totals = field(node, 'totals')
    const foot = Array.isArray(totals) ? footer(totals, view) : null
    const caption = captionOf(node, context)

    let painted: HTMLElement[] = []
    const paint = () => {
      const { tbodies, rowElements } = bodies(order.slice(0, shown), group, view)
      // The head stays: taking it out, even for a moment, drops focus from its buttons.
      for (const old of painted) old.remove()
      head.after(...tbodies)
      painted = tbodies
      const left = order.length - shown
      more.hidden = left <= 0
      more.textContent = `Show ${Math.min(left, pageSize)} more`
      return rowElements
    }

    const headers = columns.map((column, index) => {
      const icon = el('span', { class: 'vui-sort-icon', 'aria-hidden': 'true' })
      const click = () => {
        const flip = ariaSort(sort, index) === 'ascending'
        sort = [index, flip ? 'desc' : 'asc']
        context.state.set(SORT, sort)
        order = sortRows(parsed, columns, sort, context.locale)
        marks()
        paint()
      }
      const attributes = { class: 'vui-sort', type: 'button', on: { click } }
      const button = el('button', attributes, [el('span', {}, column.label), icon])
      return { icon, cell: el('th', { class: classes[index], scope: 'col' }, button) }
    })
    const marks = () => {
      headers.forEach(({ icon, cell }, index) => {
        const state = ariaSort(sort, index)
        cell.setAttribute('aria-sort', state)
        icon.textContent = state === 'none' ? '↕' : state === 'ascending' ? '▲' : '▼'
      })
    }
    marks()
    const head = el(
      'thead',
      {},
      el(
        'tr',
        {},
        headers.map(({ cell }) => cell),
      ),
    )

    const showMore = () => {
      const first = shown
      shown += pageSize
      context.state.set(SHOWN, shown)
      const rows = paint()
      const target = rows[first]
      if (!more.hidden || target === undefined) return
      // The button is going away, and with it the reader's place.
      target.setAttribute('tabindex', '-1')
      target.focus()
    }
    const more = el('button', {
      class: 'vui-button vui-show-more',
      type: 'button',
      'aria-expanded': 'false',
      on: { click: showMore },
    })

    const pinned = columns.length > PIN_COLUMNS ? ' vui-table-pinned' : ''
    const element = el('table', { class: `vui-table${pinned}` }, [caption, head, foot])
    const sticky = field(node, 'sticky')
    const stuck = typeof sticky === 'boolean' ? sticky : parsed.length > STICKY_ROWS
    const box = el('div', { class: `vui-table-box${stuck ? ' vui-table-sticky' : ''}` }, element)
    paint()
    if (more.hidden) return box
    return [box, more]
  },
}
