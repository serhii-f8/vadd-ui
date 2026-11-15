import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './helpers.js'

const read = (name: string) => readFileSync(`${repoRoot}.github/workflows/${name}`, 'utf8')
const workflow = read('ci.yml')
/** A GitHub Actions expression, `${{ … }}`. */
const expr = (inner: string) => `\${{ ${inner} }}`

/** The text of one job: from its key to the next job key at the same indent. */
function job(source: string, name: string): string {
  const start = source.indexOf(`\n  ${name}:\n`)
  if (start === -1) throw new Error(`no job ${name}`)
  const rest = source.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function inOrder(text: string, steps: string[]) {
  const at = steps.map((step) => text.indexOf(step))
  expect(at.every((index) => index >= 0)).toBe(true)
  expect(at).toEqual([...at].sort((a, b) => a - b))
}

describe('ci workflow', () => {
  it('triggers on every push and pull request', () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {2}pull_request:\n/m)
    expect(workflow).not.toContain('branches:')
  })

  it('reads the repository only', () => {
    for (const name of ['ci.yml', 'scheduled.yml', 'snapshots.yml']) {
      expect(read(name)).toMatch(/^permissions:\n {2}contents: read\n/m)
    }
  })

  it('takes pnpm from the packageManager pin', () => {
    expect(workflow).toContain('pnpm/action-setup')
    expect(workflow).not.toMatch(/^\s+version:/m)
  })

  it('gate: installs, adds Chromium, runs the gate, then the §16.1 scenario', () => {
    inOrder(job(workflow, 'gate'), [
      '- run: pnpm install --frozen-lockfile\n',
      '- run: pnpm exec playwright install --with-deps chromium\n',
      '- run: pnpm gate\n',
      '- run: node scripts/host-scenario.mjs --surface browser',
    ])
  })

  it('portable: Windows and macOS run the gate without pixel baselines, then the scenario', () => {
    const portable = job(workflow, 'portable')
    expect(portable).toMatch(/os: \[windows-latest, macos-latest\]/)
    expect(portable).toContain(`runs-on: ${expr('matrix.os')}`)
    expect(portable).toContain('VUI_PIXELS: skip')
    inOrder(portable, [
      '- run: pnpm gate\n',
      '- run: node scripts/host-scenario.mjs --surface browser',
    ])
  })

  it('engines: Firefox and WebKit run the smoke projects', () => {
    const engines = job(workflow, 'engines')
    expect(engines).toContain('pnpm exec playwright install --with-deps firefox webkit')
    expect(engines).toContain("VUI_ENGINES: '1'")
    expect(engines).toContain('--project=firefox --project=webkit')
  })

  it('wsl-nat: the scenario and doctor inside a default-NAT WSL distro on Windows', () => {
    const wsl = job(workflow, 'wsl-nat')
    expect(wsl).toContain(`if: ${expr("vars.WSL2_RUNNER != ''")}`)
    expect(wsl).toContain(`runs-on: ${expr('vars.WSL2_RUNNER')}`)
    expect(wsl).toContain("x.name === 'windows'")
    expect(wsl).toContain('wsl-version: 2')
    expect(wsl).toContain('Vampire/setup-wsl')
    expect(wsl).toContain('host-scenario.mjs --surface browser')
    expect(wsl).toContain('doctor --json')
    expect(wsl).not.toContain('networkingMode')
  })
})

describe('scheduled workflow', () => {
  const scheduled = read('scheduled.yml')

  it('runs daily and by hand', () => {
    expect(scheduled).toMatch(/^on:\n {2}schedule:\n {4}- cron: /m)
    expect(scheduled).toContain('workflow_dispatch:')
  })

  it('orca-contract: Orca main against host/orca.ts, and tab create --help (§17.3)', () => {
    const contract = job(scheduled, 'orca-contract')
    expect(contract).toContain('repository: stablyai/orca')
    expect(contract).toContain('ref: main')
    expect(contract).toContain('node-version: 24')
    expect(contract).toContain('pnpm run build:cli')
    inOrder(contract, [
      'node scripts/check-orca-contract.mjs --orca orca',
      '--orca-cli "node orca/out/cli/index.js"',
    ])
  })

  it('fuzz: 100k cases (§16)', () => {
    inOrder(job(scheduled, 'fuzz'), ['- run: pnpm build\n', '- run: pnpm fuzz\n'])
  })
})

describe('snapshots workflow', () => {
  const snapshots = read('snapshots.yml')

  it('regenerates the pixel baselines by hand only and uploads them', () => {
    expect(snapshots).toMatch(/^on:\n {2}workflow_dispatch:\n/m)
    expect(snapshots).not.toMatch(/^\s+(push|pull_request|schedule):/m)
    expect(snapshots).toContain('--update-snapshots=all')
    expect(snapshots).toContain('actions/upload-artifact')
    expect(snapshots).toContain('runs-on: ubuntu-latest')
    expect(snapshots).not.toContain('windows-latest')
  })
})

describe('release workflow', () => {
  const release = read('release.yml')

  it('runs by hand only, gates, then publishes with provenance', () => {
    expect(release).toMatch(/^on:\n {2}workflow_dispatch:\n/m)
    expect(release).toContain('id-token: write')
    expect(release).toContain("NPM_CONFIG_PROVENANCE: 'true'")
    // §15.1: the job that holds the tokens runs no action by a movable tag.
    expect(release).not.toMatch(/uses: [^@\s]+@v\d/)
    inOrder(release, [
      '- run: pnpm gate\n',
      'run: pnpm -r publish --access public --no-git-checks\n',
    ])
  })
})
