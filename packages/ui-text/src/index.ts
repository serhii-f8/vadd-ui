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
const FAILED = 'Could not render this document\n'

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

/** One cleaning rule for every field and both formats, and one guard around both. */
function render(document: VuiDocument, serialize: (blocks: Block[]) => string): string {
  try {
    const cleaned = clean(serialize(documentBlocks(document))).trimEnd()
    return cleaned === '' ? '' : `${cleaned}\n`
  } catch {
    return FAILED
  }
}

/** GitHub-flavored markdown (§4.5). Total, pure, and silent. */
export function renderMarkdown(document: VuiDocument): string {
  return render(document, blocksToMarkdown)
}

/** Plain text (§4.5). Total, pure, and silent. */
export function renderPlain(document: VuiDocument): string {
  return render(document, blocksToPlain)
}
