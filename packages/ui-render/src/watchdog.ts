// VD-008, §15.1. Synchronous code cannot be preempted, so a component reaches a checkpoint or
// the wrapper measures it on return. This is the one clock in the package, and the determinism
// of §9.3 covers renders that stay inside the budget.

export const BUDGET_MS = 200

export type Clock = () => number

export class BudgetExceeded extends Error {
  constructor() {
    super(`render exceeded ${BUDGET_MS} ms`)
  }
}

export interface Watchdog {
  enter(): void
  /** Throws `BudgetExceeded` past the budget. */
  check(): void
  /** Own time of the component just finished, without its children. */
  leave(): number
}

interface Frame {
  start: number
  children: number
}

export function createWatchdog(clock: Clock = () => performance.now()): Watchdog {
  const frames: Frame[] = []
  const own = (frame: Frame) => clock() - frame.start - frame.children
  return {
    enter() {
      frames.push({ start: clock(), children: 0 })
    },
    check() {
      const frame = frames[frames.length - 1]
      if (frame !== undefined && own(frame) > BUDGET_MS) throw new BudgetExceeded()
    },
    leave() {
      const frame = frames.pop()
      if (frame === undefined) return 0
      const parent = frames[frames.length - 1]
      if (parent !== undefined) parent.children += clock() - frame.start
      return own(frame)
    },
  }
}
