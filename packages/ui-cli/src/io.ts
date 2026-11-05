/** Everything `run` takes from the process, so a test can stand in for it. */
export interface Io {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean; fd?: number }
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** `generatedAt` comes from here (§5.2). */
  now: () => Date
  readBundle: () => string
  readSchema: () => string
}
