export function bad(value: string) {
  return new DOMParser().parseFromString(value, 'text/html')
}
