/** Close enough to the bottom to count as reading the newest entry. */
const NEAR_BOTTOM_PX = 48

/** The part of `Window` this uses. */
export interface FollowWindow {
  document: { documentElement: { scrollHeight: number; clientHeight: number; scrollTop: number } }
  addEventListener(type: 'scroll', listener: () => void, options: { passive: boolean }): void
  scrollTo(x: number, y: number): void
}

/**
 * `pin` runs after each entry and each document, and never from a resize, so unfolding
 * something inside a document does not throw the page to the bottom. Every growth is pinned
 * in the same task, so the `scroll` a pin causes never sees a page taller than it pinned.
 */
export function createFollow(win: FollowWindow): { pin: () => void } {
  const page = win.document.documentElement
  let following = true

  win.addEventListener(
    'scroll',
    () => {
      const distance = page.scrollHeight - page.clientHeight - page.scrollTop
      following = distance <= NEAR_BOTTOM_PX
    },
    { passive: true },
  )

  return {
    pin() {
      if (following) win.scrollTo(0, page.scrollHeight)
    },
  }
}
