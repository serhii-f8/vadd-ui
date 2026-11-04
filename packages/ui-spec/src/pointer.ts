/** Escapes one JSON Pointer segment (RFC 6901). */
export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function joinPointer(base: string, segment: string | number): string {
  return `${base}/${typeof segment === 'number' ? segment : escapeSegment(segment)}`
}
