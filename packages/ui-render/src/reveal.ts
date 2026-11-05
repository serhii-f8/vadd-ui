// VD-070: a browser will not jump into `hidden` content. A link opens what hides its target,
// and the native jump that follows the click does the rest.

const openers = new WeakMap<Element, () => void>()

/** Says how to show `region`, which something may hide. */
export function opensWith(region: Element, open: () => void): void {
  openers.set(region, open)
}

function decoded(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

/** Shows the element a `#fragment` link in `link`'s tree points to, found as the browser does. */
export function reveal(link: Element, fragment: string): void {
  // A link that is not attached has an element for its root, which has no such method.
  const tree = link.getRootNode() as Partial<Document>
  let node = tree.getElementById?.(fragment) ?? tree.getElementById?.(decoded(fragment))
  for (; node; node = node.parentElement) {
    if (node.hidden) openers.get(node)?.()
  }
}
