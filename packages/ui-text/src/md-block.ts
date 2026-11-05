import { type MdBlock, type MdList, parseInline, parseMd } from '@vadd/ui-spec'
import { type Block, codeBlock, type Entry, list, para } from './blocks.js'

function listBlock({ ordered, start, items }: MdList): Block {
  const entries = items.map(({ text: raw, children }): Entry => {
    const text = parseInline(raw)
    return children === undefined ? { text } : { text, blocks: [listBlock(children)] }
  })
  return list(entries, ordered, start)
}

function toBlock(block: MdBlock): Block {
  switch (block.kind) {
    case 'heading':
      return { kind: 'heading', level: block.level, text: parseInline(block.text) }
    case 'paragraph':
      return para(parseInline(block.text))
    case 'quote':
      return { kind: 'quote', blocks: block.paragraphs.map((text) => para(parseInline(text))) }
    case 'list':
      return listBlock(block.list)
    case 'code':
      return codeBlock(block.text, block.lang)
  }
}

/** The text of an `md` node as serializer blocks. */
export function mdBlocks(value: string): Block[] {
  return parseMd(value).map(toBlock)
}
