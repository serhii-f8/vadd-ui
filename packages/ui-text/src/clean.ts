import { cleanText } from '@vadd/ui-spec'

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
