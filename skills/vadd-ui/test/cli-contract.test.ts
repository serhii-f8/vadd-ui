import { parseDirectiveLine } from '@vadd/ui-spec/host/orca'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fakeSystem,
  stateHome,
  tempDir,
  ViewerFarm,
  vui,
} from '../../../packages/ui-cli/test/helpers.js'
import { heredocs, readSkill } from './helpers.js'

const example = heredocs(readSkill())[0] ?? ''
const TITLE = ['show', '--title', 'Release check']
const farms: ViewerFarm[] = []

afterEach(async () => {
  await Promise.all(farms.splice(0).map((farm) => farm.stopAll()))
})

const scratch = (dir: string) => fakeSystem({ cwd: tempDir(), env: { ORCA_CHAT_SCRATCH_DIR: dir } })

/** What behaviors 4 and 5 promise an agent, read from the CLI and not from the skill. */
describe('the outcomes the skill describes', () => {
  it('prints one directive line for the example when a scratch folder exists', async () => {
    const { exit, stdout } = await vui(TITLE, { stdin: example, system: scratch(tempDir()) })
    expect(exit).toBe(0)
    const lines = stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^::orca-visual\{/)
    expect(parseDirectiveLine(lines[0] ?? '')).not.toBeNull()
  })

  it('prints `vui: shown` and then `vui: open <url>` for the example on a Viewer', async () => {
    const farm = new ViewerFarm({ ...stateHome() })
    farms.push(farm)
    const system = farm.system({ cwd: tempDir() })
    const { exit, stdout } = await vui(TITLE, { stdin: example, system })
    const [shown, open] = stdout.trimEnd().split('\n')
    expect(exit).toBe(0)
    expect(shown).toMatch(/^vui: shown /)
    expect(open).toMatch(/^vui: open http/)
  })

  it.each([
    ['1, invalid', "[{type: 'tabel'}]", 1],
    ['2, unreadable', '{', 2],
    ['3, over a limit', JSON.stringify(['x'.repeat(30000)]), 3],
  ])('exits %s', async (_, stdin, code) => {
    const { exit } = await vui(TITLE, { stdin, system: scratch(tempDir()) })
    expect(exit).toBe(code)
  })

  it('exits 4 with no usable host', async () => {
    const argv = [...TITLE, '--host', 'orca-chat']
    const { exit } = await vui(argv, { stdin: example, system: fakeSystem() })
    expect(exit).toBe(4)
  })

  it('exits 5 when the target folder cannot be written', async () => {
    const system = scratch(`${tempDir()}/missing`)
    const argv = [...TITLE, '--host', 'orca-chat']
    const { exit } = await vui(argv, { stdin: example, system })
    expect(exit).toBe(5)
  })
})
