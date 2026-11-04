export function bad(value: string) {
  return new Function(value)
}
