const MAX_DISTANCE = 2

/** Edit distance with unit costs, on UTF-16 code units. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      )
    }
    previous = current
  }
  return previous[b.length] as number
}

/** The closest candidate within 2 edits (§11.3), first in list order on a tie. */
export function suggest(value: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined
  let bestDistance = MAX_DISTANCE + 1
  for (const candidate of candidates) {
    // The length gap bounds the distance, so a huge value never costs a full comparison.
    if (Math.abs(candidate.length - value.length) >= bestDistance) continue
    const distance = levenshtein(value, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}
