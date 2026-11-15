import { compareBest, compareWinner, isJsonObject, type JsonValue } from '@vadd/ui-spec'
import type { Component } from '../context.js'
import { el } from '../el.js'
import { field, nodeList, text } from './fields.js'
import { captionOf } from './table.js'

// §6.3 `compare` (VD-183): options are columns, criteria rows. The best value of a criterion
// with `better` is marked, and the winner's column is tinted: `pick`, or the computed one.

const DIRECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  high: ['↑', 'higher is better'],
  low: ['↓', 'lower is better'],
}

const hidden = (words: string) => el('span', { class: 'vui-sr-only' }, words)

export const compare: Component = {
  ownsTitle: true,
  render(node, context) {
    // No `String()` on a document value: an object's own `toString` may be data (VD-180).
    const options = nodeList(node, 'options').map((option) =>
      typeof option === 'string' || typeof option === 'number' ? String(option) : '',
    )
    const winner = compareWinner(node)
    const win = (index: number) => (index === winner ? 'vui-compare-win' : undefined)
    const head = el('tr', {}, [
      el('td', {}),
      ...options.map((option, index) =>
        el('th', { scope: 'col', class: win(index) }, [
          option,
          index === winner
            ? el('span', { class: 'vui-status vui-pick vui-tone-ok' }, [
                el('span', { 'aria-hidden': 'true' }, '✓'),
                'Pick',
              ])
            : null,
        ]),
      ),
    ])
    const rows = nodeList(node, 'criteria').map((criterion, row) => {
      context.checkpoint()
      const item = isJsonObject(criterion) ? criterion : {}
      const at = `${context.pointer}/criteria/${row}`
      const values = nodeList(item, 'values')
      const better = field(item, 'better')
      const best = compareBest(values, better, options.length)
      const format = field(item, 'format')
      const direction = typeof better === 'string' ? DIRECTIONS[better] : undefined
      return el('tr', {}, [
        el('th', { scope: 'row' }, [
          ...context.inline(text(item, 'label')),
          direction === undefined
            ? null
            : el('span', { class: 'vui-compare-dir' }, [` ${direction[0]}`, hidden(direction[1])]),
        ]),
        ...options.map((_, index) => {
          const value: JsonValue = values[index] ?? null
          const name = typeof format === 'string' ? format : undefined
          const classes = [best.has(index) ? 'vui-compare-best' : '', win(index) ?? ''].filter(
            Boolean,
          )
          return el('td', { class: classes.join(' ') || undefined }, [
            ...context.value(value, name, `${at}/values/${index}`),
            best.has(index) ? hidden(' best') : null,
          ])
        }),
      ])
    })
    return el(
      'div',
      { class: 'vui-table-box' },
      el('table', { class: 'vui-table vui-compare' }, [
        captionOf(node, context),
        el('thead', {}, head),
        el('tbody', {}, rows),
      ]),
    )
  },
}
