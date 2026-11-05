// §9.4: one observer for every chart on the page.

type Listener = (width: number) => void

const listeners = new WeakMap<Element, Listener>()
let observer: ResizeObserver | undefined

/** Calls `listener` with `element`'s width as it changes. Returns the way to stop. */
export function watchWidth(element: Element, listener: Listener): () => void {
  // A host with no `ResizeObserver` keeps the first drawing, scaled by `viewBox`.
  if (typeof ResizeObserver === 'undefined') return () => {}
  observer ??= new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      try {
        listeners.get(target)?.(contentRect.width)
      } catch {
        // No guard runs after mount (VD-080), so the last drawing stands.
      }
    }
  })
  const shared = observer
  listeners.set(element, listener)
  shared.observe(element)
  return () => {
    shared.unobserve(element)
    listeners.delete(element)
  }
}
