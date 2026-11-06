async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/** Writes `value` itself, as `ui-render`'s copy does. */
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

/** The §9.3 chain, with no text on screen to select. */
export async function copyText(value: string): Promise<boolean> {
  return (await writeClipboard(value)) || execCopy(value)
}
