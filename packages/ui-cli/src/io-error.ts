/** B10: what an errno code means, in the words of a sentence. */
const REASONS: Record<string, string> = {
  ENOENT: 'no such file',
  EACCES: 'permission denied',
  EPERM: 'permission denied',
  EISDIR: 'is a directory',
  ENOTDIR: 'not a directory',
  ENOSPC: 'no space left on the device',
  EROFS: 'read-only file system',
  EEXIST: 'already exists',
  EMFILE: 'too many open files',
  ENAMETOOLONG: 'name too long',
}

/** The reason to print after `cannot <verb> <path>: `. A code nobody knows keeps its message. */
export function ioReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const { code } = error as NodeJS.ErrnoException
  if (code !== undefined && Object.hasOwn(REASONS, code)) return REASONS[code] as string
  const message = error.message || 'error'
  return code === undefined || message.includes(code) ? message : `${message} (${code})`
}
