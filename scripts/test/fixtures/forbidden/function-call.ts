export function bad(value: string) {
  return Function(value)
}
