import type { Component, NodeContext } from '../context.js'
import { copyText, select } from '../copy.js'
import { el } from '../el.js'
import { lineCount, nodeList, text, whole } from './fields.js'

const DEFAULT_MAX_LINES = 30
const COPIED_MS = 1500
const CHECK_EVERY = 256

export interface CodeOptions {
  text: string
  /** A label only (§6.2). Empty for none. */
  lang: string
  lines: boolean
  /** Line numbers to highlight, from 1, across the whole text. */
  mark: ReadonlySet<number>
  maxLines: number
}

function row(line: string, number: number, options: CodeOptions): HTMLElement {
  const marked = options.mark.has(number)
  return el(
    marked ? 'mark' : 'span',
    { class: marked ? 'vui-code-line vui-code-marked' : 'vui-code-line' },
    [
      options.lines ? el('span', { class: 'vui-code-no', 'aria-hidden': 'true' }, number) : null,
      // Text, or a selection of a row with no newline of its own loses the blank line.
      el('span', { class: 'vui-code-text' }, line === '' ? '\n' : line),
    ],
  )
}

/** `lines` from line `first`. One text node when no line needs telling apart. */
function pre(lines: string[], first: number, options: CodeOptions, context: NodeContext) {
  const plain = !options.lines && options.mark.size === 0
  const content = plain
    ? lines.join('\n')
    : lines.map((line, index) => {
        if (index % CHECK_EVERY === 0) context.checkpoint()
        return row(line, first + index, options)
      })
  return el('pre', { class: 'vui-code-pre' }, el('code', { class: 'vui-code-body' }, content))
}

/** The §9.3 chain: clipboard, then selection with `execCommand`, then asking the reader. */
function copyButton(
  value: string,
  context: NodeContext,
  reveal: () => [HTMLElement, HTMLElement],
): HTMLElement {
  let timer: ReturnType<typeof setTimeout> | undefined
  const say = (label: string) => {
    clearTimeout(timer)
    button.textContent = label
  }
  const copied = () => {
    say('Copied')
    timer = setTimeout(() => say('Copy'), COPIED_MS)
  }
  const copy = async () => {
    if (await copyText(value, () => select(...reveal()))) copied()
    else say('Select text to copy')
  }
  const button = el(
    'button',
    {
      class: 'vui-button vui-code-copy',
      type: 'button',
      'aria-live': 'polite',
      on: { click: () => void copy() },
    },
    'Copy',
  )
  context.onDestroy(() => clearTimeout(timer))
  return button
}

/** The `code` block. `name` keeps the fold of one block apart from another's in `md`. */
export function codeBlock(context: NodeContext, options: CodeOptions, name: string): HTMLElement {
  const lines = options.text.replace(/\n$/, '').split('\n')
  const head = pre(lines.slice(0, options.maxLines), 1, options, context)
  const rest = lines.slice(options.maxLines)
  const tail = rest.length === 0 ? null : pre(rest, options.maxLines + 1, options, context)
  const fold = tail === null ? [] : context.fold(name, lineCount(rest.length, 'more'), tail, false)
  const [toggle] = fold
  const reveal = (): [HTMLElement, HTMLElement] => {
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
    return [head, tail ?? head]
  }
  const bar = el('div', { class: 'vui-code-bar' }, [
    options.lang === '' ? null : el('span', { class: 'vui-code-lang' }, options.lang),
    copyButton(options.text, context, reveal),
  ])
  return el('div', { class: 'vui-codeblock' }, [bar, head, ...fold])
}

export const code: Component = {
  render(node, context) {
    const maxLines = whole(node, 'maxLines')
    const options: CodeOptions = {
      text: text(node, 'text'),
      lang: text(node, 'lang'),
      lines: node.lines === true,
      mark: new Set(nodeList(node, 'mark').filter((line) => typeof line === 'number')),
      maxLines: maxLines !== undefined && maxLines > 0 ? maxLines : DEFAULT_MAX_LINES,
    }
    return codeBlock(context, options, 'code')
  },
}

/** What a fence in `md` gets: §9.3's height safety, with no field to set it. */
export const fenceOptions = (value: string, lang: string | undefined): CodeOptions => ({
  text: value,
  lang: lang ?? '',
  lines: false,
  mark: new Set(),
  maxLines: DEFAULT_MAX_LINES,
})
