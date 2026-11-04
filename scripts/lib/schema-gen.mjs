// Reads the TypeScript subset of `packages/ui-spec/src/types.ts` and writes JSON Schema
// (draft 2020-12). TypeScript 7 has no stable compiler API (VD-029). Anything outside the
// subset throws with a line number, so a new construct cannot silently leave the schema.

/** @typedef {{ text: string, line: number, doc?: string }} Token */
/** @typedef {Record<string, unknown>} Schema */
/**
 * @typedef {{ kind: 'interface', base?: string, members: Member[] }
 *   | { kind: 'alias', schema: (ref: (name: string) => Schema) => Schema, tags: Schema }} Declaration
 */
/** @typedef {{ name: string, optional: boolean, schema: (ref: (name: string) => Schema) => Schema }} Member */

const ROOT = 'VuiDocument'
const DRAFT = 'https://json-schema.org/draft/2020-12/schema'
const TOKEN =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|[[\](){}<>|:?,=;]/y
const PRIMITIVES = new Set(['string', 'number', 'boolean', 'null'])

/**
 * @param {string} source
 * @returns {Token[]}
 */
function tokenize(source) {
  /** @type {Token[]} */
  const tokens = []
  let line = 1
  /** @type {string | undefined} */
  let doc
  let offset = 0
  while (offset < source.length) {
    TOKEN.lastIndex = offset
    const text = TOKEN.exec(source)?.[0]
    if (text === undefined) throw new Error(`types: line ${line}: cannot read "${source[offset]}"`)
    offset += text.length
    if (text.startsWith('/**')) {
      doc = text
    } else if (!/^(\s|\/\/|\/\*)/.test(text)) {
      tokens.push(doc === undefined ? { text, line } : { text, line, doc })
      doc = undefined
    }
    line += text.split('\n').length - 1
  }
  return tokens
}

/**
 * Keywords from the doc tags of a type alias.
 *
 * @param {string | undefined} doc
 * @returns {Schema}
 */
function readTags(doc = '') {
  /** @type {Schema} */
  const tags = {}
  if (doc.includes('@integer')) tags.type = 'integer'
  for (const [, name, value] of doc.matchAll(/@(minimum|maximum) (-?\d+)/g)) {
    tags[/** @type {string} */ (name)] = Number(value)
  }
  return tags
}

/** One pass over the tokens: collects constants and declarations. */
class Reader {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
    /** @type {Map<string, string[]>} */
    this.constants = new Map()
    /** @type {Map<string, Declaration>} */
    this.declarations = new Map()
  }

  get token() {
    return this.tokens[this.pos]
  }

  /**
   * @param {string} message
   * @returns {never}
   */
  fail(message) {
    const line = this.token?.line ?? this.tokens.at(-1)?.line ?? 1
    throw new Error(`types: line ${line}: ${message}`)
  }

  /** @param {string} text */
  at(text) {
    return this.token?.text === text
  }

  /** @param {string} text */
  eat(text) {
    if (!this.at(text)) return false
    this.pos++
    return true
  }

  /** @param {string} text */
  expect(text) {
    if (!this.eat(text)) this.fail(`expected "${text}", found "${this.token?.text ?? 'the end'}"`)
  }

  name() {
    const text = this.token?.text ?? ''
    if (!/^[A-Za-z_$]/.test(text)) this.fail(`expected a name, found "${text}"`)
    this.pos++
    return text
  }

  file() {
    while (this.token !== undefined) {
      const { doc } = this.token
      this.eat('export')
      if (this.eat('const')) this.constant()
      else if (this.eat('type')) this.alias(doc)
      else if (this.eat('interface')) this.interface()
      else this.fail(`unsupported statement "${this.token?.text}"`)
    }
  }

  constant() {
    const name = this.name()
    this.expect('=')
    if (!this.eat('[')) {
      this.pos++
      return
    }
    /** @type {string[]} */
    const values = []
    while (!this.eat(']')) {
      values.push(this.string())
      this.eat(',')
    }
    this.expect('as')
    this.expect('const')
    this.constants.set(name, values)
  }

  string() {
    const text = this.token?.text ?? ''
    if (!/^['"]/.test(text)) this.fail(`expected a string, found "${text}"`)
    this.pos++
    return text.slice(1, -1)
  }

  /** @param {string | undefined} doc */
  alias(doc) {
    const name = this.name()
    this.expect('=')
    this.declarations.set(name, { kind: 'alias', schema: this.type(), tags: readTags(doc) })
  }

  interface() {
    const name = this.name()
    const base = this.eat('extends') ? this.name() : undefined
    this.expect('{')
    /** @type {Member[]} */
    const members = []
    while (!this.eat('}')) {
      const member = this.name()
      const optional = this.eat('?')
      this.expect(':')
      members.push({ name: member, optional, schema: this.type() })
      this.eat(';')
    }
    this.declarations.set(name, { kind: 'interface', members, ...(base ? { base } : {}) })
  }

  type() {
    this.eat('|')
    const members = [this.postfix()]
    while (this.eat('|')) members.push(this.postfix())
    /** @param {(name: string) => Schema} ref */
    return (ref) => union(members.map((member) => member(ref)))
  }

  postfix() {
    let schema = this.primary()
    while (this.at('[') && this.tokens[this.pos + 1]?.text === ']') {
      this.pos += 2
      const items = schema
      /** @param {(name: string) => Schema} ref */
      schema = (ref) => ({ type: 'array', items: items(ref) })
    }
    return schema
  }

  /** @returns {(ref: (name: string) => Schema) => Schema} */
  primary() {
    if (this.eat('(')) return this.eat('typeof') ? this.typeofConstant() : this.parenthesized()
    if (this.eat('[')) return this.tuple()
    const { text } = this.token ?? { text: '' }
    if (/^['"]/.test(text)) {
      const value = this.string()
      return () => ({ const: value })
    }
    this.pos++
    if (text === 'true' || text === 'false') return () => ({ const: text === 'true' })
    if (PRIMITIVES.has(text)) return () => ({ type: text })
    if (text === 'unknown') return () => ({})
    if (text === 'Record') return this.record()
    this.pos--
    const name = this.name()
    if (this.at('<')) this.fail(`unsupported generic type ${name}`)
    return (ref) => ref(name)
  }

  parenthesized() {
    const inner = this.type()
    this.expect(')')
    return inner
  }

  typeofConstant() {
    const name = this.name()
    this.expect(')')
    this.expect('[')
    this.expect('number')
    this.expect(']')
    const values = this.constants.get(name)
    if (values === undefined) this.fail(`unknown constant ${name}`)
    return () => ({ enum: values })
  }

  tuple() {
    /** @type {((ref: (name: string) => Schema) => Schema)[]} */
    const members = []
    while (!this.eat(']')) {
      if (this.tokens[this.pos + 1]?.text === ':') this.pos += 2
      members.push(this.type())
      this.eat(',')
    }
    /** @param {(name: string) => Schema} ref */
    return (ref) => ({
      type: 'array',
      prefixItems: members.map((member) => member(ref)),
      minItems: members.length,
      maxItems: members.length,
    })
  }

  record() {
    this.expect('<')
    this.expect('string')
    this.expect(',')
    const values = this.type()
    this.expect('>')
    /** @param {(name: string) => Schema} ref */
    return (ref) => ({ type: 'object', additionalProperties: values(ref) })
  }
}

/**
 * The smallest schema for a union.
 *
 * @param {Schema[]} members
 * @returns {Schema}
 */
function union(members) {
  const [only] = members
  if (members.length === 1 && only !== undefined) return only
  if (members.every((member) => 'const' in member)) {
    return { enum: members.map((member) => member.const) }
  }
  if (
    members.every((member) => typeof member.type === 'string' && Object.keys(member).length === 1)
  ) {
    return { type: members.map((member) => member.type) }
  }
  return { anyOf: members }
}

/**
 * The members of an interface, base first; a child's member replaces the base's in place.
 *
 * @param {Map<string, Declaration>} declarations
 * @param {string} name
 * @returns {Map<string, Member>}
 */
function flatten(declarations, name) {
  const declaration = declarations.get(name)
  if (declaration?.kind !== 'interface') throw new Error(`types: ${name} is not an interface`)
  const members = declaration.base ? flatten(declarations, declaration.base) : new Map()
  for (const member of declaration.members) members.set(member.name, member)
  return members
}

/**
 * @param {string} source the text of `types.ts`
 * @returns {Schema}
 */
export function generateSchema(source) {
  const reader = new Reader(tokenize(source))
  reader.file()
  const { declarations } = reader
  if (!declarations.has(ROOT)) throw new Error(`types: no ${ROOT} declared`)

  /** @type {Record<string, Schema>} */
  const defs = {}
  const pending = [ROOT]
  /** @param {string} name */
  const ref = (name) => {
    if (!declarations.has(name)) throw new Error(`types: unknown type ${name}`)
    pending.push(name)
    return { $ref: `#/$defs/${name}` }
  }
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (name in defs) continue
    const declaration = /** @type {Declaration} */ (declarations.get(name))
    if (declaration.kind === 'alias') {
      defs[name] = { ...declaration.schema(ref), ...declaration.tags }
    } else {
      const members = [...flatten(declarations, name).values()]
      defs[name] = {
        type: 'object',
        properties: Object.fromEntries(members.map((m) => [m.name, m.schema(ref)])),
        required: members.filter((m) => !m.optional).map((m) => m.name),
      }
    }
  }
  const ordered = Object.fromEntries(Object.entries(defs).sort(([a], [b]) => a.localeCompare(b)))
  return { $schema: DRAFT, title: 'VUI document', $ref: `#/$defs/${ROOT}`, $defs: ordered }
}
