// §9.4's arithmetic. Nothing here knows about charts or the DOM.

const MAX_TICKS = 6
const STEPS = [1, 2, 5, 10, 20, 50]
const FAR = 1e300

/** 1-2-5 ticks that cover `low` to `high`: at most 6, at least 2, always finite. */
export function niceTicks(low: number, high: number): number[] {
  const from = Math.max(low, -FAR)
  const to = Math.min(high, FAR)
  if (from === to) {
    if (from === 0) return [0, 1]
    return niceTicks(from - Math.abs(from) / 2, to + Math.abs(to) / 2)
  }
  const unit = 10 ** Math.floor(Math.log10((to - from) / 5))
  for (const factor of STEPS) {
    const step = unit * factor
    const first = Math.floor(from / step)
    const count = Math.ceil(to / step) - first + 1
    const places = Math.min(Math.max(-Math.floor(Math.log10(step)), 0), 100)
    if (count <= MAX_TICKS && count >= 2) {
      // Rounded to the step's own decimals: `3 * 0.1` is not 0.3.
      const ticks = Array.from({ length: count }, (_, index) =>
        Number(((first + index) * step).toFixed(places)),
      )
      const usable =
        (ticks[0] as number) <= from &&
        (ticks[count - 1] as number) >= to &&
        ticks.every(
          (tick, index) =>
            Number.isFinite(tick) && (index === 0 || tick > (ticks[index - 1] as number)),
        )
      if (usable) return ticks
    }
  }
  return [from, to]
}

/**
 * Largest-Triangle-Three-Buckets over the finite points of `ys`. Returns kept indices of the
 * originals, in order: all of them at or under `limit`, exactly `limit` past it.
 */
export function lttb(
  xs: readonly number[],
  ys: readonly (number | undefined)[],
  limit: number,
): number[] {
  const finite = ys.flatMap((value, index) => (value === undefined ? [] : [index]))
  const size = finite.length
  if (size <= limit) return finite
  const px = finite.map((index) => xs[index] as number)
  const py = finite.map((index) => ys[index] as number)
  const width = (size - 2) / (limit - 2)
  const edge = (bucket: number) => Math.min(Math.floor(bucket * width) + 1, size)
  const kept = [0]
  let anchor = 0
  for (let bucket = 0; bucket < limit - 2; bucket += 1) {
    const end = edge(bucket + 1)
    const next = edge(bucket + 2)
    let meanX = 0
    let meanY = 0
    for (let at = end; at < next; at += 1) {
      meanX += (px[at] as number) / (next - end)
      meanY += (py[at] as number) / (next - end)
    }
    const ax = px[anchor] as number
    const ay = py[anchor] as number
    let largest = -1
    for (let at = edge(bucket); at < end; at += 1) {
      const area = Math.abs(
        (ax - meanX) * ((py[at] as number) - ay) - (ax - (px[at] as number)) * (meanY - ay),
      )
      if (area > largest) {
        largest = area
        anchor = at
      }
    }
    kept.push(anchor)
  }
  kept.push(size - 1)
  return kept.map((at) => finite[at] as number)
}

/** The index of the value closest to `target`, or -1 for an empty list. */
export function nearest(positions: readonly number[], target: number): number {
  let best = -1
  let distance = Number.POSITIVE_INFINITY
  positions.forEach((position, index) => {
    const gap = Math.abs(position - target)
    if (gap < distance) {
      distance = gap
      best = index
    }
  })
  return best
}
