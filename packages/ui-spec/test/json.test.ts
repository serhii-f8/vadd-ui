import { describe, expect, it } from 'vitest'
import { hasOwn, isJsonObject, type JsonObject, setOwn } from '../src/json.js'
import { escapeSegment, joinPointer } from '../src/pointer.js'

describe('isJsonObject', () => {
  it('is true only for plain objects', () => {
    expect(isJsonObject({})).toBe(true)
    expect(isJsonObject([])).toBe(false)
    expect(isJsonObject(null)).toBe(false)
    expect(isJsonObject('x')).toBe(false)
  })
})

describe('hasOwn', () => {
  it('ignores inherited keys', () => {
    expect(hasOwn({ a: 1 }, 'a')).toBe(true)
    expect(hasOwn({}, 'toString')).toBe(false)
  })
})

describe('setOwn', () => {
  it('writes ordinary keys', () => {
    const target: JsonObject = {}
    setOwn(target, 'a', 1)
    expect(target).toEqual({ a: 1 })
  })

  it('makes __proto__ an own key and leaves the prototype alone', () => {
    const target: JsonObject = {}
    setOwn(target, '__proto__', { polluted: true })
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype)
    expect(hasOwn(target, '__proto__')).toBe(true)
    expect(JSON.stringify(target)).toBe('{"__proto__":{"polluted":true}}')
  })
})

describe('pointers', () => {
  it('escapes per RFC 6901', () => {
    expect(escapeSegment('a/b~c')).toBe('a~1b~0c')
  })

  it('joins a segment onto a base', () => {
    expect(joinPointer('', 'body')).toBe('/body')
    expect(joinPointer('/body', 0)).toBe('/body/0')
    expect(joinPointer('/rows', 'a/b')).toBe('/rows/a~1b')
  })
})
