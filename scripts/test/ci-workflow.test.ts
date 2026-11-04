import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './helpers.js'

const workflow = readFileSync(`${repoRoot}.github/workflows/ci.yml`, 'utf8')

describe('ci workflow', () => {
  it('triggers on every push and pull request', () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {2}pull_request:\n/m)
    expect(workflow).not.toContain('branches:')
  })

  it('takes pnpm from the packageManager pin', () => {
    expect(workflow).toContain('pnpm/action-setup')
    expect(workflow).not.toMatch(/^\s+version:/m)
  })

  it('installs, adds Chromium, then runs the gate', () => {
    const steps = [
      'pnpm install --frozen-lockfile',
      'pnpm exec playwright install --with-deps chromium',
      'pnpm gate',
    ].map((step) => workflow.indexOf(`- run: ${step}\n`))
    expect(steps.every((index) => index >= 0)).toBe(true)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
  })
})
