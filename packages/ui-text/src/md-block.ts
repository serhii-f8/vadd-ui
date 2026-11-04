import { parseInline } from '@vadd/ui-spec'
import { type Block, type Entry, list, para } from './blocks.js'

// The §6.2 subset, and nothing else: anything it does not name stays a paragraph. The
// serializer escapes that paragraph, so `<div>`, `# h1` and a table remain the text they are
// (VD-054). Quotes do not nest, which also keeps the work linear on a run of `>`.

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/
const HEADING = /^ {0,3}(#{3,4})[ \t]+(\S.*)$/
const QUOTE = /^ {0,3}>[ \t]?(.*)$/
const ITEM = /^([ \t]*)([-*+]|\d{1,9}\.)[ \t]+(\S.*)$/

const isBlank = (line: string) => line.trim() === ''

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || QUOTE.test(line) || ITEM.test(line)
}

const indentOf = (line: string) => line.length - line.trimStart().length

interface OpenItem {
  raw: string
  children?: OpenList
}

interface OpenList {
  ordered: boolean
  indent: number
  items: OpenItem[]
}

function closeList(open: OpenList): Block {
  const entries = open.items.map(({ raw, children }): Entry => {
    const text = parseInline(raw)
    return children === undefined ? { text } : { text, blocks: [closeList(children)] }
  })
  return list(entries, open.ordered)
}

class Reader {
  private index = 0
  readonly blocks: Block[] = []

  constructor(private readonly lines: string[]) {}

  private get line(): string | undefined {
    return this.lines[this.index]
  }

  run(): void {
    while (this.line !== undefined) {
      const line = this.line
      if (isBlank(line)) this.index++
      else if (FENCE.test(line)) this.fence(FENCE.exec(line) as RegExpExecArray)
      else if (HEADING.test(line)) this.heading(HEADING.exec(line) as RegExpExecArray)
      else if (QUOTE.test(line)) this.quote()
      else if (ITEM.test(line)) this.list()
      else this.paragraph()
    }
  }

  private fence([, marker, lang]: RegExpExecArray): void {
    const open = marker as string
    const closer = new RegExp(`^ {0,3}${open[0]}{${open.length},}[ \\t]*$`)
    const body: string[] = []
    this.index++
    while (this.line !== undefined && !closer.test(this.line)) {
      body.push(this.line)
      this.index++
    }
    this.index++
    const text = body.join('\n')
    this.blocks.push(
      lang === '' ? { kind: 'code', text } : { kind: 'code', text, lang: lang as string },
    )
  }

  private heading([, marks, title]: RegExpExecArray): void {
    const text = parseInline((title as string).trim().replace(/\s+#+$/, ''))
    this.blocks.push({ kind: 'heading', level: (marks as string).length, text })
    this.index++
  }

  private quote(): void {
    const groups: string[][] = [[]]
    for (let match = QUOTE.exec(this.line ?? ''); match !== null; ) {
      const inner = match[1] as string
      if (isBlank(inner)) groups.push([])
      else groups[groups.length - 1]?.push(inner.trim())
      this.index++
      match = QUOTE.exec(this.line ?? '')
    }
    const blocks = groups
      .filter((group) => group.length > 0)
      .map((group) => para(parseInline(group.join(' '))))
    this.blocks.push({ kind: 'quote', blocks })
  }

  /** The next item line, past blank lines, without moving; undefined when the list ends. */
  private nextItem(): number | undefined {
    let index = this.index
    while (index < this.lines.length && isBlank(this.lines[index] as string)) index++
    return ITEM.test(this.lines[index] ?? '') ? index : undefined
  }

  private list(): void {
    const stack: OpenList[] = []
    for (let next = this.nextItem(); next !== undefined; next = this.nextItem()) {
      this.index = next
      const [, space, marker, raw] = ITEM.exec(this.line as string) as RegExpExecArray
      const indent = (space as string).length
      while (stack.length > 1 && (stack[stack.length - 1] as OpenList).indent > indent) stack.pop()
      const top = stack[stack.length - 1]
      const item: OpenItem = { raw: raw as string }
      if (top === undefined || indent > top.indent) {
        const open = { ordered: /\d/.test(marker as string), indent, items: [item] }
        const parent = top?.items[top.items.length - 1]
        if (parent !== undefined) parent.children = open
        stack.push(open)
      } else {
        top.items.push(item)
      }
      this.index++
      this.continuation(item)
    }
    this.blocks.push(closeList(stack[0] as OpenList))
  }

  /** Indented lines right under an item belong to it. */
  private continuation(item: OpenItem): void {
    while (
      this.line !== undefined &&
      indentOf(this.line) > 0 &&
      !isBlank(this.line) &&
      !isBlockStart(this.line)
    ) {
      item.raw += ` ${this.line.trim()}`
      this.index++
    }
  }

  private paragraph(): void {
    const lines: string[] = []
    while (this.line !== undefined && !isBlank(this.line) && !isBlockStart(this.line)) {
      lines.push(this.line.trim())
      this.index++
    }
    this.blocks.push(para(parseInline(lines.join(' '))))
  }
}

/** The text of an `md` node as blocks. */
export function mdBlocks(value: string): Block[] {
  const reader = new Reader(value.split(/\r\n|\r|\n/))
  reader.run()
  return reader.blocks
}
