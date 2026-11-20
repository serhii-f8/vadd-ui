import { describe, expect, it } from 'vitest'
import { ioReason } from '../src/io-error.js'

const coded = (code: string, message = `${code}: raw`) =>
  Object.assign(new Error(message), { code })

describe('ioReason (B10)', () => {
  it.each([
    ['ENOENT', 'no such file'],
    ['EACCES', 'permission denied'],
    ['EPERM', 'permission denied'],
    ['EISDIR', 'is a directory'],
    ['ENOTDIR', 'not a directory'],
    ['ENOSPC', 'no space left on the device'],
    ['EROFS', 'read-only file system'],
    ['EEXIST', 'already exists'],
    ['EMFILE', 'too many open files'],
    ['ENAMETOOLONG', 'name too long'],
  ])('says %s as "%s"', (code, text) => {
    expect(ioReason(coded(code))).toBe(text)
  })

  it('falls back to the message for a code it does not know', () => {
    expect(ioReason(coded('EWEIRD', 'something odd'))).toBe('something odd (EWEIRD)')
    expect(ioReason(coded('EIO', 'EIO: i/o error, read'))).toBe('EIO: i/o error, read')
  })

  it('takes anything thrown', () => {
    expect(ioReason('plain')).toBe('plain')
    expect(ioReason(new Error('boom'))).toBe('boom')
  })
})
