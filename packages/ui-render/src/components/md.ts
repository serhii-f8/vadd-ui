import { type MdBlock, type MdList, parseMd } from '@vadd/ui-spec'
import type { Component, NodeContext } from '../context.js'
import { el } from '../el.js'
import { codeBlock, fenceOptions } from './code.js'
import { text } from './fields.js'

const FIRST_MD_HEADING = 3

function listElement({ ordered, start, items }: MdList, context: NodeContext): HTMLElement {
  const entries = items.map((item) =>
    el('li', {}, [
      ...context.inline(item.text),
      item.children === undefined ? null : listElement(item.children, context),
    ]),
  )
  return el(ordered ? 'ol' : 'ul', { start }, entries)
}

function blockElement(block: MdBlock, index: number, context: NodeContext): HTMLElement {
  switch (block.kind) {
    case 'heading':
      return context.heading(block.text, context.level + block.level - FIRST_MD_HEADING)
    case 'paragraph':
      return el('p', {}, context.inline(block.text))
    case 'quote':
      return el(
        'blockquote',
        {},
        block.paragraphs.map((paragraph) => el('p', {}, context.inline(paragraph))),
      )
    case 'list':
      return listElement(block.list, context)
    case 'code':
      return codeBlock(context, fenceOptions(block.text, block.lang), `fence:${index}`)
  }
}

export const md: Component = {
  render(node, context) {
    const blocks = parseMd(text(node, 'text')).map((block, index) => {
      context.checkpoint()
      return blockElement(block, index, context)
    })
    return blocks.length === 0 ? [] : el('div', { class: 'vui-md' }, blocks)
  },
}

/** `title` and the tone come from the frame. */
export const callout: Component = {
  tone: 'info',
  render: (node, context) =>
    el('p', { class: 'vui-callout-text' }, context.inline(text(node, 'text'))),
}
