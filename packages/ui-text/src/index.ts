import { parseInline, type VuiDocument } from '@vadd/ui-spec'
import { type Block, muted, text } from './blocks.js'
import { clean } from './clean.js'
import { renderNodes } from './components.js'
import { blocksToMarkdown } from './markdown.js'
import { blocksToPlain } from './plain.js'

export const packageName = '@vadd/ui-text' as const

const DEFAULT_LOCALE = 'en-US'
const TITLE_LEVEL = 3
const NODE_LEVEL = 4

function documentBlocks(document: VuiDocument): Block[] {
  const blocks: Block[] = []
  if (document.title !== undefined) {
    blocks.push({ kind: 'heading', level: TITLE_LEVEL, text: [text(document.title)] })
  }
  if (document.subtitle !== undefined) blocks.push(muted(parseInline(document.subtitle)))
  const locale = document.locale ?? DEFAULT_LOCALE
  const context =
    document.generatedAt === undefined
      ? { locale, level: NODE_LEVEL }
      : { locale, now: document.generatedAt, level: NODE_LEVEL }
  blocks.push(...renderNodes(document.body, context))
  return blocks
}

/** One rule for every field and both formats. */
function finish(output: string): string {
  const cleaned = clean(output).trimEnd()
  return cleaned === ''
    ? ''
    : `${cleaned}
`
}

/** GitHub-flavored markdown (§4.5). Total, pure, and silent. */
export function renderMarkdown(document: VuiDocument): string {
  return finish(blocksToMarkdown(documentBlocks(document)))
}

/** Plain text (§4.5). Total, pure, and silent. */
export function renderPlain(document: VuiDocument): string {
  return finish(blocksToPlain(documentBlocks(document)))
}
