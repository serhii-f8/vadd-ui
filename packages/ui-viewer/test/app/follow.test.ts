import { describe, expect, it, vi } from 'vitest'
import { createFollow, type FollowWindow } from '../../src/app/follow.js'

function setup() {
  const listeners: (() => void)[] = []
  const page = { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 }
  const win: FollowWindow = {
    document: { documentElement: page },
    addEventListener: (_type, listener) => listeners.push(listener),
    scrollTo: vi.fn((_x: number, y: number) => {
      page.scrollTop = y
    }),
  }
  const follow = createFollow(win)
  const scroll = (top: number) => {
    page.scrollTop = top
    for (const listener of listeners) listener()
  }
  return { page, win, follow, scroll }
}

describe('createFollow', () => {
  it('pins to the bottom from the start', () => {
    const { page, win, follow } = setup()
    page.scrollHeight = 3000
    follow.pin()
    expect(win.scrollTo).toHaveBeenCalledWith(0, 3000)
  })

  it('leaves a reader who scrolled up where they are', () => {
    const { page, win, follow, scroll } = setup()
    scroll(100)
    page.scrollHeight = 3000
    follow.pin()
    expect(win.scrollTo).not.toHaveBeenCalled()
  })

  it('follows again once the reader is back at the bottom', () => {
    const { page, win, follow, scroll } = setup()
    scroll(100)
    scroll(1500)
    page.scrollHeight = 3000
    follow.pin()
    expect(win.scrollTo).toHaveBeenCalledWith(0, 3000)
  })

  it('counts a few pixels above the bottom as the bottom', () => {
    const { win, follow, scroll } = setup()
    scroll(1460)
    follow.pin()
    expect(win.scrollTo).toHaveBeenCalled()
  })

  it('counts just past that as scrolled up', () => {
    const { win, follow, scroll } = setup()
    scroll(1450)
    follow.pin()
    expect(win.scrollTo).not.toHaveBeenCalled()
  })
})
