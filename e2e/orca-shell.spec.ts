import { expect, test } from '@playwright/test'
import { openVisual, settled } from './harness/host.js'
import {
  NATIVE_CHAT_VISUAL_CSP,
  nativeChatVisualThemeCss,
} from './harness/orca/src/shared/native-chat/native-chat-visual-shell.js'
import { THEMES } from './harness/theme.js'

const WIDTH = 720
const doc = {
  title: 'Harness',
  body: [
    { type: 'md', text: 'Hello from the shell. :ok:' },
    { type: 'md', title: 'Folded', fold: 'closed', text: 'Revealed.' },
    { type: 'x-tall', title: 'Tall', fold: 'closed', lines: 30 },
  ],
}
const violations = (frame: import('@playwright/test').Frame) =>
  frame.evaluate(() => (window as unknown as { __vuiViolations: string[] }).__vuiViolations)

test.describe('Orca shell', () => {
  test('uses the exact CSP, theme element, base and sandbox', async ({ page }) => {
    const { frame, iframe } = await openVisual(page, { input: doc }, 'dark', WIDTH)
    const shell = await frame.evaluate(() => ({
      csp: document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content'),
      theme: document.getElementById('orca-visual-theme')?.textContent,
      html: document.documentElement.className,
      base: document.querySelector('base')?.getAttribute('href'),
      first: document.head.firstElementChild?.tagName,
    }))
    expect(shell.csp).toBe(NATIVE_CHAT_VISUAL_CSP)
    expect(shell.theme).toBe(nativeChatVisualThemeCss(THEMES.dark))
    expect(shell.html).toBe('dark')
    expect(shell.base).toBe('about:srcdoc')
    expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(await iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  test('renders with no CSP violation and no request', async ({ page }) => {
    const opened = await openVisual(page, { input: doc }, 'light', WIDTH)
    await settled(opened)
    await expect(opened.frame.locator('.vui-title')).toHaveText('Harness')
    expect(await violations(opened.frame)).toEqual([])
    expect(opened.console.filter((line) => /Content Security Policy|Refused/.test(line))).toEqual(
      [],
    )
    expect(
      opened.requests.filter((url) => !/^(?:http:\/\/orca-host\.test\/|about:|data:)/.test(url)),
    ).toEqual([])
  })

  test('the violation check can fail: a fetch is blocked and seen', async ({ page }) => {
    const { frame } = await openVisual(page, { input: doc }, 'light', WIDTH)
    await frame.evaluate(() => fetch('https://example.test/x').catch(() => undefined))
    await expect
      .poll(() => violations(frame))
      .toContainEqual(expect.stringContaining('connect-src'))
  })

  test('reports the content height within 1 px, through folds', async ({ page }) => {
    const opened = await openVisual(page, { input: doc }, 'light', WIDTH)
    const { frame, iframe, lastReport } = opened
    const check = async () => {
      await settled(opened)
      const content = await frame
        .locator('.vui-root')
        .evaluate((node) => node.getBoundingClientRect().height)
      expect(Math.abs(((await lastReport()) ?? 0) - content)).toBeLessThanOrEqual(1)
      expect(Math.abs(((await iframe.boundingBox())?.height ?? 0) - content)).toBeLessThanOrEqual(1)
      return content
    }
    const closed = await check()
    await frame.locator('.vui-fold-toggle').nth(1).click()
    expect(await check()).toBeGreaterThan(closed + 200)
    await frame.locator('.vui-fold-toggle').nth(1).click()
    expect(await check()).toBe(closed)
  })

  test("caps a frame at Orca's 2000 px", async ({ page }) => {
    const opened = await openVisual(
      page,
      { input: [{ type: 'x-tall', lines: 200 }] },
      'light',
      WIDTH,
    )
    await settled(opened)
    expect((await opened.iframe.boundingBox())?.height).toBe(2000)
  })

  test('a live theme switch restyles with no DOM mutation', async ({ page }) => {
    const opened = await openVisual(page, { input: doc }, 'light', WIDTH)
    const { frame, switchTheme } = opened
    await settled(opened)
    await frame.evaluate(() => {
      const target = window as unknown as { __mutations: number; __marker: Element | null }
      target.__mutations = 0
      target.__marker = document.querySelector('.vui-title')
      new MutationObserver((records) => {
        target.__mutations += records.length
      }).observe(document.getElementById('vui') as HTMLElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
    })
    const color = () => frame.locator('.vui-title').evaluate((node) => getComputedStyle(node).color)
    const before = await color()
    await switchTheme('dark')
    await expect.poll(color).not.toBe(before)
    expect(await frame.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      true,
    )
    const after = await color()
    await switchTheme('light')
    await expect.poll(color).toBe(before)
    expect(after).not.toBe(before)
    expect(
      await frame.evaluate(() => {
        const target = window as unknown as { __mutations: number; __marker: Element | null }
        return {
          mutations: target.__mutations,
          same: target.__marker === document.querySelector('.vui-title'),
        }
      }),
    ).toEqual({ mutations: 0, same: true })
  })

  test('intercepts a link through the shell, leaving #links native', async ({ page }) => {
    const input = [{ type: 'md', text: '[out](https://example.test/) [in](#x)', id: 'x' }]
    const opened = await openVisual(page, { input }, 'light', WIDTH)
    await settled(opened)
    await page.evaluate(() => {
      const box = window as unknown as { __links: string[] }
      box.__links = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'orca-visual-open-link') box.__links.push(event.data.url)
      })
    })
    await opened.frame.locator('a', { hasText: 'out' }).click()
    await opened.frame.locator('a', { hasText: 'in' }).click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __links: string[] }).__links))
      .toEqual(['https://example.test/'])
  })
})

test.describe('schemes (VD-007, VD-058)', () => {
  const inkOf = (frame: import('@playwright/test').Frame) =>
    frame.evaluate(() => {
      const probe = document.createElement('span')
      probe.className = 'vui-tone-ok'
      document.getElementById('vui')?.append(probe)
      const value = getComputedStyle(probe).color
      probe.remove()
      return value
    })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
  })

  test('a light Orca theme on a dark OS keeps light tones', async ({ page }) => {
    const light = await openVisual(page, { input: doc }, 'light', WIDTH)
    await settled(light)
    const ink = await inkOf(light.frame)

    const other = await page.context().newPage()
    await other.emulateMedia({ colorScheme: 'dark' })
    const dark = await openVisual(other, { input: doc }, 'dark', WIDTH)
    await settled(dark)
    expect(await inkOf(dark.frame)).not.toBe(ink)

    // Orca's toggle leaves `class=""` here, which must read as light, not as "follow the OS".
    await dark.switchTheme('light')
    await expect
      .poll(() => dark.frame.evaluate(() => document.documentElement.getAttribute('class')))
      .toBe('')
    expect(await inkOf(dark.frame)).toBe(ink)
    await other.close()
  })
})
