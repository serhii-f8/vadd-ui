// §6's `ext` tier: what picks the bundle (VD-182) and how `compare` crowns a winner (VD-183).
// Both read plain JSON that may not have passed validation, so neither trusts a shape.

import { hasOwn } from './json.js'

/** The component types of the `ext` tier; a `scatter` chart is the other ext node. */
export const EXT_TYPES: ReadonlySet<string> = new Set(['compare', 'flow'])

/** True when any object in `value` is an ext node: the writer must embed `vui-ext.min.js`. */
export function usesExt(value: unknown): boolean {
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const item = pending.pop()
    if (typeof item !== 'object' || item === null) continue
    // A loop, not a spread: an argument list has an engine limit that a long array can pass.
    if (Array.isArray(item)) {
      for (const entry of item) if (typeof entry === 'object') pending.push(entry)
      continue
    }
    const node = item as Record<string, unknown>
    if (typeof node.type === 'string' && EXT_TYPES.has(node.type)) return true
    if (node.type === 'chart' && node.kind === 'scatter') return true
    for (const key in node) {
      if (hasOwn(node, key) && typeof node[key] === 'object') pending.push(node[key])
    }
  }
  return false
}

/** The options, below `count`, whose finite number is the best in the `better` direction. */
export function compareBest(values: unknown, better: unknown, count: number): Set<number> {
  const best = new Set<number>()
  if ((better !== 'high' && better !== 'low') || !Array.isArray(values)) return best
  const sign = better === 'high' ? 1 : -1
  let top = Number.NEGATIVE_INFINITY
  values.slice(0, count).forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    const score = value * sign
    if (score > top) {
      top = score
      best.clear()
    }
    if (score === top) best.add(index)
  })
  return best
}

/** `pick` when it names an option; otherwise the one with strictly the most best cells. */
export function compareWinner(node: {
  options?: unknown
  criteria?: unknown
  pick?: unknown
}): number | undefined {
  const count = Array.isArray(node.options) ? node.options.length : 0
  const { pick } = node
  if (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < count) return pick
  const wins = new Array<number>(count).fill(0)
  for (const criterion of Array.isArray(node.criteria) ? node.criteria : []) {
    if (typeof criterion !== 'object' || criterion === null) continue
    const { values, better } = criterion as Record<string, unknown>
    for (const index of compareBest(values, better, count))
      wins[index] = (wins[index] as number) + 1
  }
  const most = wins.reduce((top, win) => Math.max(top, win), 0)
  const leaders = wins.flatMap((win, index) => (win === most ? [index] : []))
  return most > 0 && leaders.length === 1 ? leaders[0] : undefined
}
