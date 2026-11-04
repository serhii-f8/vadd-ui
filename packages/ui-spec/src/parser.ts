import { type JsonObject, type JsonValue, setOwn } from './json.js'

// The relaxed-JSON grammar of §5.1: strict JSON plus exactly unquoted keys, single quotes,
// trailing commas and comments (VD-022). JSON5's other extensions are refused, so a
// document never depends on a parser more forgiving than this one.

/** Far above the §13.4 depth of 12, which task 03 reports with a pointer (VD-023). */
export const MAX_NESTING = 128

export interface ParseError {
  /** `too-deep` is a limit, not a typo: task 03 maps it to exit 3 rather than exit 2. */
  code: 'syntax' | 'too-deep'
  message: string
  /** 1-based. `\n`, `\r\n` and `\r` each end a line. */
  line: number
  /** 1-based, in UTF-16 code units. */
  column: number
  offset: number
}

export type ParseResult = { ok: true; value: JsonValue } | { ok: false; error: ParseError }

const SPACE = 0x20
const TAB = 0x09
const LF = 0x0a
const CR = 0x0d
const DOUBLE_QUOTE = 0x22
const SINGLE_QUOTE = 0x27
const STAR = 0x2a
const PLUS = 0x2b
const COMMA = 0x2c
const MINUS = 0x2d
const DOT = 0x2e
const SLASH = 0x2f
const ZERO = 0x30
const NINE = 0x39
const COLON = 0x3a
const OPEN_BRACKET = 0x5b
const BACKSLASH = 0x5c
const CLOSE_BRACKET = 0x5d
const OPEN_BRACE = 0x7b
const CLOSE_BRACE = 0x7d
const LINE_SEPARATOR = 0x2028
const PARAGRAPH_SEPARATOR = 0x2029

const ESCAPES: Record<string, string> = {
  '"': '"',
  "'": "'",
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

class Failure {
  constructor(
    readonly code: ParseError['code'],
    readonly message: string,
    readonly offset: number,
  ) {}
}

function isDigit(code: number): boolean {
  return code >= ZERO && code <= NINE
}

function isKeyStart(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f
}

function isKeyPart(code: number): boolean {
  return isKeyStart(code) || isDigit(code)
}

class Parser {
  private pos = 0

  constructor(private readonly text: string) {}

  document(): JsonValue {
    const value = this.value(0)
    this.skipTrivia()
    if (this.pos < this.text.length) this.fail(`unexpected ${this.describeHere()} after the value`)
    return value
  }

  private fail(message: string, offset = this.pos, code: ParseError['code'] = 'syntax'): never {
    throw new Failure(code, message, offset)
  }

  private peek(offset = this.pos): number {
    return this.text.charCodeAt(offset)
  }

  private describeHere(): string {
    if (this.pos >= this.text.length) return 'end of input'
    const code = this.text.codePointAt(this.pos) as number
    if (code > SPACE && code < 0x7f) return `"${String.fromCharCode(code)}"`
    return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
  }

  private skipTrivia(): void {
    for (;;) {
      const code = this.peek()
      if (code === SPACE || code === TAB || code === LF || code === CR) {
        this.pos++
      } else if (code === SLASH) {
        this.skipComment()
      } else {
        return
      }
    }
  }

  private skipComment(): void {
    const next = this.peek(this.pos + 1)
    if (next === SLASH) {
      this.pos += 2
      while (this.pos < this.text.length && this.peek() !== LF && this.peek() !== CR) this.pos++
    } else if (next === STAR) {
      const end = this.text.indexOf('*/', this.pos + 2)
      if (end === -1) this.fail('unterminated comment')
      this.pos = end + 2
    } else {
      this.fail('unexpected "/"; comments start with // or /*')
    }
  }

  private value(depth: number): JsonValue {
    this.skipTrivia()
    const code = this.peek()
    if (code === OPEN_BRACE) return this.object(depth)
    if (code === OPEN_BRACKET) return this.array(depth)
    if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) return this.string(code)
    if (code === MINUS || isDigit(code)) return this.number()
    if (code === PLUS) return this.plus()
    if (code === DOT) this.fail('numbers must start with a digit')
    if (isKeyPart(code)) return this.literal()
    this.fail(`unexpected ${this.describeHere()}; expected a value`)
  }

  private enter(depth: number): void {
    if (depth >= MAX_NESTING) {
      this.fail(`nesting exceeds ${MAX_NESTING} levels`, this.pos, 'too-deep')
    }
    this.pos++
  }

  private array(depth: number): JsonValue[] {
    this.enter(depth)
    const items: JsonValue[] = []
    for (;;) {
      this.skipTrivia()
      if (this.peek() === CLOSE_BRACKET) {
        this.pos++
        return items
      }
      items.push(this.value(depth + 1))
      this.skipTrivia()
      if (this.peek() === COMMA) {
        this.pos++
      } else if (this.peek() !== CLOSE_BRACKET) {
        this.fail(`unexpected ${this.describeHere()}; expected "," or "]"`)
      }
    }
  }

  private object(depth: number): JsonObject {
    this.enter(depth)
    const object: JsonObject = {}
    for (;;) {
      this.skipTrivia()
      if (this.peek() === CLOSE_BRACE) {
        this.pos++
        return object
      }
      const key = this.key()
      this.skipTrivia()
      if (this.peek() !== COLON) this.fail(`unexpected ${this.describeHere()}; expected ":"`)
      this.pos++
      setOwn(object, key, this.value(depth + 1))
      this.skipTrivia()
      if (this.peek() === COMMA) {
        this.pos++
      } else if (this.peek() !== CLOSE_BRACE) {
        this.fail(`unexpected ${this.describeHere()}; expected "," or "}"`)
      }
    }
  }

  private key(): string {
    const code = this.peek()
    if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) return this.string(code)
    if (!isKeyStart(code)) {
      this.fail(`unexpected ${this.describeHere()}; keys need quotes unless they are identifiers`)
    }
    const start = this.pos
    while (isKeyPart(this.peek())) this.pos++
    return this.text.slice(start, this.pos)
  }

  private string(quote: number): string {
    const open = this.pos
    this.pos++
    let out = ''
    let chunk = this.pos
    for (;;) {
      if (this.pos >= this.text.length) this.fail('unterminated string', open)
      const code = this.peek()
      if (code === quote) {
        out += this.text.slice(chunk, this.pos)
        this.pos++
        return out
      }
      if (code === BACKSLASH) {
        out += this.text.slice(chunk, this.pos) + this.escape(open)
        chunk = this.pos
      } else if (code === LF || code === CR) {
        this.fail('unterminated string: a raw line break; use \\n')
      } else if (code < SPACE) {
        this.fail(`raw control character ${this.describeHere()} in a string; escape it`)
      } else {
        this.pos++
      }
    }
  }

  private escape(open: number): string {
    const backslash = this.pos
    if (backslash + 1 >= this.text.length) this.fail('unterminated string', open)
    const code = this.peek(backslash + 1)
    if (code === LF || code === CR || code === LINE_SEPARATOR || code === PARAGRAPH_SEPARATOR) {
      this.fail('multi-line string continuations are not supported; use \\n')
    }
    const letter = this.text.charAt(backslash + 1)
    if (letter === 'u') {
      const digits = this.text.slice(backslash + 2, backslash + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.fail('\\u needs four hex digits')
      this.pos = backslash + 6
      return String.fromCharCode(Number.parseInt(digits, 16))
    }
    const escaped = ESCAPES[letter]
    if (escaped === undefined) {
      this.pos = backslash + 1
      this.fail(`unsupported escape \\${this.describeHere()}`, backslash)
    }
    this.pos = backslash + 2
    return escaped
  }

  private plus(): never {
    const after = this.text.charAt(this.pos + 1)
    if (after === 'I') this.fail('Infinity is not supported')
    if (after === 'N') this.fail('NaN is not supported')
    this.fail('numbers cannot start with "+"')
  }

  private digits(context: string): void {
    if (!isDigit(this.peek())) this.fail(`expected a digit ${context}`)
    while (isDigit(this.peek())) this.pos++
  }

  private number(): number {
    const start = this.pos
    if (this.peek() === MINUS) this.pos++
    const first = this.text.charAt(this.pos)
    if (first === 'I') this.fail('Infinity is not supported', start)
    if (first === 'N') this.fail('NaN is not supported', start)
    if (first === '0') {
      const next = this.text.charAt(this.pos + 1)
      if (next === 'x' || next === 'X') this.fail('hex numbers are not supported', start)
      if (isDigit(this.peek(this.pos + 1))) this.fail('numbers cannot have leading zeros', start)
      this.pos++
    } else {
      this.digits('in the number')
    }
    if (this.peek() === DOT) {
      this.pos++
      this.digits('after the decimal point')
    }
    if (this.text.charAt(this.pos).toLowerCase() === 'e') {
      this.pos++
      if (this.peek() === PLUS || this.peek() === MINUS) this.pos++
      this.digits('in the exponent')
    }
    const value = Number(this.text.slice(start, this.pos))
    if (!Number.isFinite(value)) this.fail('number is out of range', start)
    return value
  }

  private literal(): JsonValue {
    const start = this.pos
    while (isKeyPart(this.peek())) this.pos++
    const word = this.text.slice(start, this.pos)
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    if (word === 'Infinity' || word === 'NaN') this.fail(`${word} is not supported`, start)
    return this.fail(`unexpected "${word.slice(0, 40)}"; strings need quotes`, start)
  }
}

function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset; i++) {
    const code = text.charCodeAt(i)
    const crlf = code === CR && text.charCodeAt(i + 1) === LF
    if ((code === LF || code === CR) && !crlf) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: offset - lineStart + 1 }
}

/** Parses relaxed JSON. Never throws: failures come back with a line and column. */
export function parse(text: string): ParseResult {
  try {
    return { ok: true, value: new Parser(text).document() }
  } catch (caught) {
    if (!(caught instanceof Failure)) throw caught
    const { code, message, offset } = caught
    return { ok: false, error: { code, message, offset, ...locate(text, offset) } }
  }
}
