import type { Frame } from '@playwright/test'
import axe from 'axe-core'

interface Found {
  id: string
  impact?: string | null
  nodes: { target: unknown[] }[]
}

/**
 * The serious and critical axe violations in a frame's document, as `"<rule>: <targets>"`.
 * The source goes in through CDP (`frame.evaluate`), which the frame's CSP does not govern.
 */
export async function axeSerious(frame: Frame): Promise<string[]> {
  const loaded = await frame.evaluate(() => 'axe' in window)
  if (!loaded) await frame.evaluate(axe.source)
  const found = await frame.evaluate(async () => {
    const { axe: inPage } = window as unknown as { axe: typeof axe }
    const result = await inPage.run(document, { resultTypes: ['violations'] })
    return result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target }) => ({ target: [...target] })),
    }))
  })
  return (found as Found[])
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(' ')).join(', ')}`)
}
