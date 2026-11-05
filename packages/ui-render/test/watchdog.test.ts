import { describe, expect, it } from 'vitest'
import { BUDGET_MS, BudgetExceeded, createWatchdog } from '../src/watchdog.js'

function fakeClock() {
  let time = 0
  return {
    clock: () => time,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('watchdog', () => {
  it('has the §15.1 budget', () => {
    expect(BUDGET_MS).toBe(200)
  })

  it('reports own time on leave', () => {
    const { clock, advance } = fakeClock()
    const watchdog = createWatchdog(clock)
    watchdog.enter()
    advance(30)
    expect(watchdog.leave()).toBe(30)
  })

  it('does not charge a child to its parent', () => {
    const { clock, advance } = fakeClock()
    const watchdog = createWatchdog(clock)
    watchdog.enter()
    advance(10)
    watchdog.enter()
    advance(190)
    expect(watchdog.leave()).toBe(190)
    watchdog.enter()
    advance(190)
    expect(watchdog.leave()).toBe(190)
    advance(5)
    expect(watchdog.leave()).toBe(15)
  })

  it('stops at a checkpoint past the budget', () => {
    const { clock, advance } = fakeClock()
    const watchdog = createWatchdog(clock)
    watchdog.enter()
    advance(200)
    expect(() => watchdog.check()).not.toThrow()
    advance(1)
    expect(() => watchdog.check()).toThrow(BudgetExceeded)
  })

  it('checks nothing outside a component', () => {
    expect(() => createWatchdog(() => 1e9).check()).not.toThrow()
    expect(createWatchdog(() => 0).leave()).toBe(0)
  })
})
