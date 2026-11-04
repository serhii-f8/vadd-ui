export function bad(value: string) {
  return document.createRange().createContextualFragment(value)
}
