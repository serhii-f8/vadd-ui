import type { JsonObject, JsonValue } from '../../src/index.js'

export interface Expected {
  severity: 'error' | 'warn' | 'info'
  code: string
  path: string
}

/** `text` is relaxed source; otherwise `input` is passed as a value. */
export interface Source {
  name: string
  text?: string
  input?: JsonValue
}

/** No diagnostics at all, and this exact canonical form. */
export interface ValidCase extends Source {
  canonical: JsonValue
}

/** At least one `error`, for `invalidCases`, or none, for `noticeCases`. */
export interface DiagnosedCase extends Source {
  diagnostics: Expected[]
}

export const envelope = (body: JsonValue[], fields: JsonObject = {}): JsonObject => ({
  vui: 1,
  density: 'compact',
  locale: 'en-US',
  ...fields,
  body,
})

export const repeat = <T>(count: number, make: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => make(index))
