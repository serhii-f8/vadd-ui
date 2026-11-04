import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = fileURLToPath(new URL('../src/', import.meta.url))

describe('package purity', () => {
  it('imports nothing but its own relative modules', () => {
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((name) =>
      name.endsWith('.ts'),
    )
    expect(files.length).toBeGreaterThan(1)
    for (const file of files) {
      const source = readFileSync(srcDir + file, 'utf8')
      const specifiers = [...source.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1])
      for (const specifier of specifiers) expect(specifier, file).toMatch(/^\.\.?\//)
    }
  })
})
