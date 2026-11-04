export function bad(value: string) {
  return (0, globalThis.eval)(value)
}
