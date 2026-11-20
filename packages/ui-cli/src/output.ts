import { writeFileSync } from 'node:fs'
import { usesExt, type VuiDocument } from '@vadd/ui-spec'
import { renderMarkdown, renderPlain } from '@vadd/ui-text'
import { cdnHtml, GENERATOR_LABEL, inlineHtml } from '@vadd/ui-viewer'
import { ioReason } from './io-error.js'
import { CliError, EXIT } from './outcome.js'

/** §11.4: 500 KiB, unlike the 256 KiB of §13.4, which is the document's own. */
export const OUTPUT_LIMIT = 500 * 1024

export const FORMATS = ['html', 'md', 'text'] as const
export type OutputFormat = (typeof FORMATS)[number]

export interface OutputOptions {
  format: OutputFormat
  cdn?: boolean
  /** `vui.min.js`, or `vui-ext.min.js` when `ext` is true (VD-182). */
  readBundle: (ext?: boolean) => string
}

function bundleOf(readBundle: OutputOptions['readBundle'], ext: boolean): string {
  try {
    return readBundle(ext)
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
  return inlineHtml(document, {
    bundle: bundleOf(readBundle, usesExt(document)),
    generator: GENERATOR_LABEL,
  })
}

export function writeOutput(path: string, text: string): void {
  try {
    writeFileSync(path, text)
  } catch (error) {
    throw new CliError(EXIT.io, 'io', `cannot write ${path}: ${ioReason(error)}`)
  }
}
