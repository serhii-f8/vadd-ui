export function probe(input: { value?: number }): { value?: number } {
  input.value ??= 1
  return input
}
