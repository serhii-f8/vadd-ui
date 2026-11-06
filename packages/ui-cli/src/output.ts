import { writeFileSync } from 'node:fs'
import type { VuiDocument } from '@vadd/ui-spec'
import { renderMarkdown, renderPlain } from '@vadd/ui-text'
import { cdnHtml, GENERATOR_LABEL, inlineHtml } from '@vadd/ui-viewer'
import { CliError, EXIT } from './outcome.js'

/** §11.4: 500 KiB, unlike the 256 KiB of §13.4, which is the document's own. */
export const OUTPUT_LIMIT = 500 * 1024

export const FORMATS = ['html', 'md', 'text'] as const
export type OutputFormat = (typeof FORMATS)[number]

export interface OutputOptions {
  format: OutputFormat
  cdn?: boolean
  readBundle: () => string
}

function bundleOf(readBundle: () => string): string {
  try {
    return readBundle()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(EXIT.io, 'io', `cannot read the renderer bundle: ${reason}`)
  }
}

/** A stamped document as text. Hosts that write files call this and `writeOutput`. */
export function renderOutput(document: VuiDocument, options: OutputOptions): string {
  const { format, cdn, readBundle } = options
  if (format === 'md') return renderMarkdown(document)
  if (format === 'text') return renderPlain(document)
  if (cdn === true) return cdnHtml(document)
  return inlineHtml(document, { bundle: bundleOf(readBundle), generator: GENERATOR_LABEL })
}

export function writeOutput(path: string, text: string): void {
  try {
    writeFileSync(path, text)
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code ?? (error as Error).message
    throw new CliError(EXIT.io, 'io', `cannot write ${path}: ${reason}`)
  }
}
