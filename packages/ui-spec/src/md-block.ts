// The §6.2 subset, and nothing else: anything it does not name stays a paragraph, so `<div>`,
// `# h1` and a table remain the text they are (VD-054). Quotes do not nest, which also keeps
// the work linear on a run of `>`. Inline text stays raw: each host parses it its own way.

export interface MdItem {
  text: string
  children?: MdList
}

export interface MdList {
  ordered: boolean
  /** The number of the first item, when it is not 1. */
  start?: number
  items: MdItem[]
}

export type MdBlock =
  | { kind: 'heading'; level: 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; paragraphs: string[] }
  | { kind: 'list'; list: MdList }
  | { kind: 'code'; text: string; lang?: string }

// A backtick fence has no backtick after it, or a one-line ```a``` would swallow the node.
const FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})[ \t]*([^\s`]*)/
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
  start: number
  indent: number
  items: OpenItem[]
}

function closeList({ ordered, start, items }: OpenList): MdList {
  return {
    ordered,
    ...(ordered && start !== 1 ? { start } : {}),
    items: items.map(({ raw, children }) =>
      children === undefined ? { text: raw } : { text: raw, children: closeList(children) },
    ),
  }
}

class Reader {
  private index = 0
  readonly blocks: MdBlock[] = []

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
    this.blocks.push(lang === '' ? { kind: 'code', text } : { kind: 'code', text, lang })
  }

  private heading([, marks, title]: RegExpExecArray): void {
    const text = (title as string).trim().replace(/\s#+$/, '').trimEnd()
    this.blocks.push({ kind: 'heading', level: (marks as string).length as 3 | 4, text })
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
    const paragraphs = groups.filter((group) => group.length > 0).map((group) => group.join(' '))
    this.blocks.push({ kind: 'quote', paragraphs })
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
        const parent = top?.items[top.items.length - 1]
        const open = parent?.children
        if (open === undefined) {
          const ordered = /\d/.test(marker as string)
          const start = Number.parseInt(marker as string, 10)
          const created = { ordered, start, indent, items: [item] }
          if (parent !== undefined) parent.children = created
          stack.push(created)
        } else {
          // Indentation stepped back to a level between two others: the same child list.
          open.indent = indent
          open.items.push(item)
          stack.push(open)
        }
      } else {
        top.items.push(item)
      }
      this.index++
      this.continuation(item)
    }
    this.blocks.push({ kind: 'list', list: closeList(stack[0] as OpenList) })
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
    this.blocks.push({ kind: 'paragraph', text: lines.join(' ') })
  }
}

/** The text of an `md` node as blocks. */
export function parseMd(value: string): MdBlock[] {
  const reader = new Reader(value.split(/\r\n|\r|\n/))
  reader.run()
  return reader.blocks
}
