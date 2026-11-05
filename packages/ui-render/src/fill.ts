// §7: `style` is never set from document values, so a bar's width is one of 101 constant rules
// (`css/data.ts`), named by `data-vui-fill`.

const clean = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0)

/** `value` of `scale` as a whole percent. Only a true 0 or 100 reads as empty or full. */
export function fillOf(value: number, scale: number): number {
  const part = clean(value)
  const whole = clean(scale)
  if (part === 0 || whole === 0) return 0
  if (part >= whole) return 100
  return Math.min(Math.max(Math.round((part / whole) * 100), 1), 99)
}

/** Whole percents of `scale`, or of the sum past it. They add up to the sum's rounded fill. */
export function fillShares(values: number[], scale: number): number[] {
  const parts = values.map(clean)
  const total = parts.reduce((sum, part) => sum + part, 0)
  const whole = Math.max(clean(scale), total)
  if (clean(scale) === 0 || total === 0) return parts.map(() => 0)
  const exact = parts.map((part) => (part / whole) * 100)
  const shares = exact.map(Math.floor)
  let spare = fillOf(total, whole) - shares.reduce((sum, share) => sum + share, 0)
  const byRemainder = exact
    .map((share, index) => ({ index, remainder: share % 1 }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of byRemainder) {
    if (spare <= 0) break
    shares[index] = (shares[index] as number) + 1
    spare -= 1
  }
  parts.forEach((part, index) => {
    if (part === 0 || shares[index] !== 0) return
    shares[index] = 1
    const largest = shares.indexOf(Math.max(...shares))
    shares[largest] = (shares[largest] as number) - 1
  })
  return shares
}
