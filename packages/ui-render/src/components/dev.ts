import {
  cleanText,
  itemsFromPaths,
  type JsonObject,
  type JsonValue,
  type PlanItem,
  planCounts,
  tailLines,
} from '@vadd/ui-spec'
import type { Component, NodeContext } from '../context.js'
import { type Child, el } from '../el.js'
import { badgeOf } from './data.js'
import { field, lineCount, nodeList, objects, text } from './fields.js'

const CHECK_OUTPUT_LINES = 20

function note(item: JsonObject, context: NodeContext): HTMLElement | null {
  const value = text(item, 'note')
  return value === '' ? null : el('p', { class: 'vui-note' }, context.inline(value))
}

const pre = (content: Child) => el('pre', { class: 'vui-code-pre vui-codeblock' }, content)

function checkOutput(item: JsonObject, index: number, context: NodeContext): HTMLElement[] {
  const output = cleanText(text(item, 'output'))
  if (output === '') return []
  const { earlier, last } = tailLines(output, CHECK_OUTPUT_LINES)
  const before =
    earlier.length === 0
      ? []
      : context.fold(
          `earlier${index}`,
          lineCount(earlier.length, 'earlier'),
          pre(earlier.join('\n')),
          false,
        )
  return context.fold(`output${index}`, 'Output', [...before, pre(last.join('\n'))], false)
}

export const checks: Component = {
  render(node, context) {
    const rows = objects(nodeList(node, 'items')).map(({ item, index }) => {
      const cmd = text(item, 'cmd')
      const ms = field(item, 'ms')
      return el('li', {}, [
        el('div', { class: 'vui-row' }, [
          badgeOf(item),
          text(item, 'name'),
          cmd === '' ? null : el('code', { class: 'vui-code' }, cmd),
          typeof ms === 'number'
            ? el(
                'span',
                { class: 'vui-row-end' },
                context.format(ms, 'ms', `${context.pointer}/items/${index}/ms`).text,
              )
            : null,
        ]),
        ...checkOutput(item, index, context),
      ])
    })
    return el('ul', { class: 'vui-rows' }, rows)
  },
}

/** A list that nests, for the items of `plan` and `tree`. */
function rows(
  items: JsonValue[],
  context: NodeContext,
  label: (item: JsonObject) => Child[],
  className: string,
): HTMLElement {
  context.checkpoint()
  const entries = objects(items).map(({ item }) => {
    const children = nodeList(item, 'children')
    return el('li', {}, [
      el('div', { class: 'vui-row' }, [badgeOf(item), el('span', {}, label(item))]),
      note(item, context),
      children.length === 0 ? null : rows(children, context, label, 'vui-rows'),
    ])
  })
  return el('ul', { class: className }, entries)
}

export const plan: Component = {
  render(node, context) {
    const items = nodeList(node, 'items')
    const [done, total] = planCounts(items as unknown as PlanItem[])
    return [
      el('p', { class: 'vui-note vui-plan-head' }, `${done}/${total} done`),
      rows(items, context, (item) => context.inline(text(item, 'text')), 'vui-rows'),
    ]
  },
}

export const tree: Component = {
  render(node, context) {
    const items = field(node, 'items')
    const paths = nodeList(node, 'paths').filter((path) => typeof path === 'string')
    return rows(
      (Array.isArray(items) ? items : itemsFromPaths(paths)) as JsonValue[],
      context,
      (item) => [text(item, 'name')],
      'vui-rows vui-tree',
    )
  },
}

const ISO_TIME = /^\d{4}-\d\d/

export const timeline: Component = {
  render(node, context) {
    const entries = objects(nodeList(node, 'items')).map(({ item, index }) => {
      const at = text(item, 'at')
      const pointer = `${context.pointer}/items/${index}/at`
      return el('li', {}, [
        el(
          'span',
          { class: 'vui-time' },
          ISO_TIME.test(at) ? context.format(at, 'date:datetime', pointer).text : at,
        ),
        el('div', { class: 'vui-row' }, [
          badgeOf(item),
          el('span', {}, context.inline(text(item, 'text'))),
        ]),
      ])
    })
    return el('ol', { class: 'vui-rows vui-timeline' }, entries)
  },
}
