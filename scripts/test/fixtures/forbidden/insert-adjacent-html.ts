export function bad(node: Element, value: string) {
  node.insertAdjacentHTML('beforeend', value)
}
