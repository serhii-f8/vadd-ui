async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/** Writes `value` itself: the selection would flatten blank lines in rows and at the fold. */
function execCopy(value: string): boolean {
  const write = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', value)
    event.preventDefault()
  }
  document.addEventListener('copy', write)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', write)
  }
}

/** Selects from the start of `first` to the end of `last`. */
export function select(first: Node, last: Node): void {
  try {
    const selection = document.getSelection()
    const range = document.createRange()
    range.setStartBefore(first)
    range.setEndAfter(last)
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    // The caller still tells the reader what to do.
  }
}

/** The §9.3 chain. False means the reader has to copy the selection `reveal` made. */
export async function copyText(value: string, reveal: () => void): Promise<boolean> {
  if (await writeClipboard(value)) return true
  reveal()
  return execCopy(value)
}
