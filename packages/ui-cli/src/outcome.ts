/** §11.4. `4` is `vui show`'s. */
export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5

export const EXIT = { ok: 0, invalid: 1, parse: 2, limit: 3, noHost: 4, io: 5 } as const

/** What a command did. One place prints it, so `--json` holds on every path. */
export interface Outcome {
  exit: ExitCode
  /** Human output. */
  stdout?: string
  stderr?: string
  /** The `--json` form, without `ok`, which comes from `exit`. */
  json: Record<string, unknown>
}

/** A failure a command cannot go on from. `message` is printed through `safe`. */
export class CliError extends Error {
  constructor(
    readonly exit: ExitCode,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** §11.4 has no usage code and §16 allows only 0 to 5, so a bad argument list is a parse error. */
export function usageError(message: string): CliError {
  return new CliError(EXIT.parse, 'usage', message)
}
