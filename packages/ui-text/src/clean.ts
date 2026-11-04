// A document must not reach a terminal's parser (§15.1). CSI and OSC sequences go whole, so
// no parameters are left behind as text.
const ESCAPE_SEQUENCE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escapes is the point.
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x9b[0-?]*[ -/]*[@-~]/g

// All of C0 and C1 except tab and newline.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
const CONTROL = /[\0-\x08\x0b-\x1f\x7f-\x9f]/g

export function stripEscapes(value: string): string {
  return value.replace(ESCAPE_SEQUENCE, '')
}

export function clean(value: string): string {
  return stripEscapes(value).replace(/\r\n?/g, '\n').replace(CONTROL, '')
}
