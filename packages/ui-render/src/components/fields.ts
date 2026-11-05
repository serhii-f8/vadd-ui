import { hasOwn, type JsonObject, type JsonValue } from '@vadd/ui-spec'

// A field can arrive in any shape: a drop removes it, and past VD-066's cap nothing checks it.

const field = (node: JsonObject, name: string): JsonValue | undefined =>
  hasOwn(node, name) ? node[name] : undefined

export function nodeList(node: JsonObject, name: string): JsonValue[] {
  const value = field(node, name)
  return Array.isArray(value) ? value : []
}

export function text(node: JsonObject, name: string): string {
  const value = field(node, name)
  return typeof value === 'string' ? value : ''
}

export function whole(node: JsonObject, name: string): number | undefined {
  const value = field(node, name)
  return Number.isInteger(value) ? (value as number) : undefined
}
