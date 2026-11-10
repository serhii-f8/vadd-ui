// VD-151: a corpus is a folder of case folders, each with the same content three ways.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CliError, EXIT } from '../outcome.js'

export interface BenchCase {
  name: string
  vui: string
  md: string
  html: string
}

/** Shipped beside `dist`, so `vui bench` works after an install. Same depth from `src`. */
export const DEFAULT_CORPUS = fileURLToPath(new URL('../../corpus/', import.meta.url))

const FILES = ['vui', 'md', 'html'] as const

function reason(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? String(error)
}

function read(path: string, shown: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new CliError(EXIT.io, 'io', `cannot read ${shown}: ${reason(error)}`)
  }
}

/** Every folder in `dir`, by name. Files beside them and hidden folders such as `.git` are ignored. */
export function readCorpus(dir: string): BenchCase[] {
  let names: string[]
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    throw new CliError(EXIT.io, 'io', `cannot read the corpus ${dir}: ${reason(error)}`)
  }
  if (names.length === 0) throw new CliError(EXIT.io, 'io', `no cases in ${dir}`)
  return names.map((name) => {
    const [vui, md, html] = FILES.map((kind) => {
      return read(join(dir, name, `doc.${kind}`), `${name}/doc.${kind}`)
    }) as [string, string, string]
    return { name, vui, md, html }
  })
}
