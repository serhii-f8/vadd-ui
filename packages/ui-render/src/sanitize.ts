import {
  type Diagnostic,
  type JsonObject,
  type JsonValue,
  joinPointer,
  MAX_NESTING,
  setOwn,
} from '@vadd/ui-spec'

// `render` also takes objects from host code, which can hold what `JSON.parse` never yields:
// cycles, getters, proxies, shared subtrees. `normalize` is total only over JSON, so this
// copies an object down to JSON first, and only JSON gets past it.

/** About five times what a 256 KiB document can hold, and bounds a shared-subtree bomb. */
export const MAX_VALUES = 500_000
const MAX_WARNINGS = 20

export interface Sanitized {
  value: JsonValue
  diagnostics: Diagnostic[]
}

class Copier {
  readonly diagnostics: Diagnostic[] = []
  private values = 0
  private exhausted = false
  private readonly open = new Set<object>()

  private warn(path: string, message: string, code: Diagnostic['code'] = 'bad-value'): void {
    if (this.diagnostics.length < MAX_WARNINGS) {
      this.diagnostics.push({ severity: 'warn', path, code, message })
    }
  }

  private spend(path: string): boolean {
    this.values += 1
    if (this.values <= MAX_VALUES) return true
    if (!this.exhausted) {
      this.exhausted = true
      this.diagnostics.push({
        severity: 'warn',
        path,
        code: 'limit-input-size',
        message: `object has over ${MAX_VALUES} values, so the rest is left out`,
      })
    }
    return false
  }

  private array(source: unknown[], path: string, depth: number): JsonValue[] {
    const copy: JsonValue[] = []
    for (let index = 0; index < source.length && !this.exhausted; index += 1) {
      const pointer = joinPointer(path, index)
      copy.push(this.read(() => source[index], pointer, depth, null) as JsonValue)
    }
    return copy
  }

  private object(source: object, path: string, depth: number): JsonObject {
    const copy: JsonObject = {}
    for (const key of Object.keys(source)) {
      if (this.exhausted) break
      const pointer = joinPointer(path, key)
      const item = this.read(() => (source as Record<string, unknown>)[key], pointer, depth)
      if (item !== undefined) setOwn(copy, key, item)
    }
    return copy
  }

  /** Reads through `get`, because a getter or a proxy can throw. */
  private read(
    get: () => unknown,
    path: string,
    depth: number,
    fallback?: null,
  ): JsonValue | undefined {
    try {
      const value = this.copy(get(), path, depth)
      return value === undefined ? fallback : value
    } catch {
      this.warn(path, 'property could not be read, so it is left out')
      return fallback
    }
  }

  private nested(source: object, path: string, depth: number): JsonValue {
    if (this.open.has(source)) {
      this.warn(path, 'circular reference replaced by null')
      return null
    }
    if (depth >= MAX_NESTING) {
      this.warn(path, `nesting exceeds ${MAX_NESTING} levels`, 'limit-depth')
      return null
    }
    this.open.add(source)
    try {
      return Array.isArray(source)
        ? this.array(source, path, depth + 1)
        : this.object(source, path, depth + 1)
    } catch {
      this.warn(path, 'object could not be read, so it is replaced by null')
      return null
    } finally {
      this.open.delete(source)
    }
  }

  private date(value: Date, path: string): string | null {
    if (!Number.isNaN(value.getTime())) return value.toISOString()
    this.warn(path, 'invalid Date replaced by null')
    return null
  }

  /** Undefined for what JSON leaves out of an object. */
  copy(value: unknown, path: string, depth: number): JsonValue | undefined {
    if (!this.spend(path)) return undefined
    switch (typeof value) {
      case 'string':
      case 'boolean':
        return value
      case 'number':
        if (Number.isFinite(value)) return value
        this.warn(path, `number ${value} replaced by null`)
        return null
      case 'bigint':
        this.warn(path, 'bigint replaced by null')
        return null
      case 'object':
        if (value === null) return null
        return value instanceof Date ? this.date(value, path) : this.nested(value, path, depth)
      default:
        return undefined
    }
  }
}

/** A JSON copy of `value`. Total, and bounded in time and depth. */
export function sanitize(value: unknown): Sanitized {
  const copier = new Copier()
  return { value: copier.copy(value, '', 0) ?? null, diagnostics: copier.diagnostics }
}
