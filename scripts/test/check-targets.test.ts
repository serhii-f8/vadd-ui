import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editJson, makeWorkspace, repoRoot, run } from './helpers.js'

const script = 'check-targets.mjs'
const check = (root: string) => run(script, '--root', root)

function compileProbe(config: 'browser' | 'node'): string {
  const outDir = mkdtempSync(join(tmpdir(), 'vui-probe-'))
  const project = `${repoRoot}scripts/test/fixtures/target-probe/${config}`
  // Node on TypeScript's own entry: `.bin/tsc` is a shell script, and `tsc.cmd` on Windows,
  // which spawnSync cannot run without a shell.
  const tsc = `${repoRoot}node_modules/typescript/bin/tsc`
  const result = spawnSync(process.execPath, [tsc, '-p', project, '--outDir', outDir], {
    encoding: 'utf8',
  })
  expect(result.stdout).toBe('')
  return readFileSync(join(outDir, 'probe.js'), 'utf8')
}

describe('check-targets', () => {
  it('passes the real workspace', () => {
    const { code, out } = run(script)
    expect(out).toContain('7 packages')
    expect(code).toBe(0)
  })

  it('fails when a renderer package extends the Node config', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui-render/tsconfig.json', (config) => {
      config.extends = '../../tsconfig.node.json'
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain('@vadd/ui-render')
  })

  it('fails when a package overrides the target', () => {
    const root = makeWorkspace()
    editJson(root, 'packages/ui/tsconfig.json', (config) => {
      config.compilerOptions = { target: 'ES2022' }
    })
    expect(check(root).code).toBe(1)
  })

  it.each([
    ['tsconfig.browser.json', 'ES2022'],
    ['tsconfig.node.json', 'ES2024'],
  ])('fails when %s changes its target', (file, target) => {
    const root = makeWorkspace()
    editJson(root, file, (config) => {
      config.compilerOptions = { target }
    })
    const { code, out } = check(root)
    expect(code).toBe(1)
    expect(out).toContain(file)
  })
})

describe('compiled output', () => {
  it('lowers ES2021 syntax through the browser config', () => {
    expect(compileProbe('browser')).not.toContain('??=')
  })

  it('keeps it through the Node 20 config', () => {
    expect(compileProbe('node')).toContain('??=')
  })
})
