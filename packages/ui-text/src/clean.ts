// A document must not reach a terminal's parser (§15.1), and escaping must see the text a
// reader gets. So cleaning comes first: a control character removed after escaping would
// join `<` to `script`, or `!` to `[`, into markup the escaper never saw (VD-053).

// CSI and OSC go whole, so no parameters stay behind as text. An OSC with no terminator ends
// with its line, or one stray byte in a log would take the rest of the document with it.
const ESCAPE_SEQUENCE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escapes is the point.
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b\n\r]*(?:\x07|\x1b\\)?|\x9b[0-?]*[ -/]*[@-~]/g

// All of C0 and C1 except tab and newline.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
const CONTROL = /[\0-\x08\x0b-\x1f\x7f-\x9f]/g

function cleanText(value: string): string {
  return value.replace(ESCAPE_SEQUENCE, '').replace(/\r\n?/g, '\n').replace(CONTROL, '')
}

/**
 * A copy with every string clean, object keys included. A worklist, not recursion: nesting
 * here is the document's to choose, and a host can pass a cycle.
 */
export function cleanValue<T>(value: T): T {
  const copies = new Map<object, object>()
  const pending: [source: object, copy: object][] = []
  const copyOf = (item: unknown): unknown => {
    if (typeof item === 'string') return cleanText(item)
    if (typeof item !== 'object' || item === null) return item
    const known = copies.get(item)
    if (known !== undefined) return known
    const copy = Array.isArray(item) ? [] : {}
    copies.set(item, copy)
    pending.push([item, copy])
    return copy
  }
  const result = copyOf(value)
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [source, copy] = next
    for (const [key, item] of Object.entries(source)) {
      // Not `copy[key] =`, which would set the prototype for a key named `__proto__`.
      Object.defineProperty(copy, Array.isArray(source) ? key : cleanText(key), {
        value: copyOf(item),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
  }
  return result as T
}
