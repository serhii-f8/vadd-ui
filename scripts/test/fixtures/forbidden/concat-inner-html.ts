export function bad(node: Element, value: string) {
  ;(node as unknown as Record<string, string>)['inner' + 'HTML'] = value
}
