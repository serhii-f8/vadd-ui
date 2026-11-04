/** A value strict JSON can represent. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasOwn(object: object, key: string): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is ES2022 and the target is ES2020
  return Object.prototype.hasOwnProperty.call(object, key)
}

/** Assigns `key` as data, so that `__proto__` in a document cannot set a prototype. */
export function setOwn(target: JsonObject, key: string, value: JsonValue): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  } else {
    target[key] = value
  }
}
