import { expect, type Page, test } from '@playwright/test'
import { stylesheet } from '../packages/ui-render/src/css/index.js'
import { openVisual } from './harness/host.js'

// The stylesheet alone, in a real engine: selectors that jsdom cannot judge.

const css = stylesheet

const TONES = ['ok', 'warn', 'err', 'info', 'muted', 'accent', 'default']

async function standalone(page: Page, htmlClass: string | null) {
  const classAttribute = htmlClass === null ? '' : ` class="${htmlClass}"`
  await page.setContent(
    `<!doctype html><html${classAttribute}><head><style>${css}</style></head><body><div class="vui-root" id="r"><div class="vui-card" id="c">x</div></div></body></html>`,
  )
}

const surfaceToken = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.getElementById('r') as HTMLElement)
      .getPropertyValue('--vui-surface')
      .trim(),
  )

/** Every default tone's rendered contrast against the card, resolved by the engine. */
function contrasts(host: Pick<Page, 'evaluate'>, tones: string[]): Promise<Record<string, number>> {
  return host.evaluate((names) => {
    const root = document.getElementById('r') ?? (document.getElementById('vui') as HTMLElement)
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const paint = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    const rgb = (color: string) => {
      paint.fillStyle = '#000'
      paint.fillRect(0, 0, 1, 1)
      paint.fillStyle = color
      paint.fillRect(0, 0, 1, 1)
      return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const channel = (value: number) => {
      const unit = value / 255
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }
    const luminance = (color: number[]) => {
      const [r = 0, g = 0, b = 0] = color
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const card = document.createElement('div')
    card.className = 'vui-card'
    root.append(card)
    const surface = getComputedStyle(card).backgroundColor
    const result: Record<string, number> = {}
    for (const name of names) {
      const span = document.createElement('span')
      span.className = `vui-tone-${name}`
      card.append(span)
      const ink = luminance(rgb(getComputedStyle(span).color))
      const paper = luminance(rgb(surface))
      result[name] = (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05)
    }
    card.remove()
    return result
  }, tones)
}

test.describe('scheme selection with fallback tokens', () => {
  test('a page with no class follows the OS', async ({ page }) => {
    await standalone(page, null)
    expect(await surfaceToken(page)).toBe('#ffffff')
    await page.emulateMedia({ colorScheme: 'dark' })
    expect(await surfaceToken(page)).toBe('#141414')
  })

  test('an unrelated class still follows the OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await standalone(page, 'page')
    expect(await surfaceToken(page)).toBe('#141414')
  })

  test('.dark wins on a light OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await standalone(page, 'dark')
    expect(await surfaceToken(page)).toBe('#141414')
  })

  for (const htmlClass of ['light', '']) {
    test(`class="${htmlClass}" is light on a dark OS`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await standalone(page, htmlClass)
      expect(await surfaceToken(page)).toBe('#ffffff')
    })
  }

  test('data-vui-theme beats both, in both directions', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await standalone(page, 'dark')
    await page.evaluate(() => document.getElementById('r')?.setAttribute('data-vui-theme', 'light'))
    expect(await surfaceToken(page)).toBe('#ffffff')
    await standalone(page, 'light')
    await page.evaluate(() => document.getElementById('r')?.setAttribute('data-vui-theme', 'dark'))
    expect(await surfaceToken(page)).toBe('#141414')
  })

  test('data-vui-theme works in a shadow root, where :root cannot match', async ({ page }) => {
    await page.setContent('<!doctype html><html><body><div id="h"></div></body></html>')
    const read = (theme: string) =>
      page.evaluate(
        ([sheet, value]) => {
          const shadow =
            (document.getElementById('h') as HTMLElement).shadowRoot ??
            (document.getElementById('h') as HTMLElement).attachShadow({ mode: 'open' })
          const style = document.createElement('style')
          style.textContent = sheet as string
          const root = document.createElement('div')
          root.className = 'vui-root'
          root.setAttribute('data-vui-theme', value as string)
          shadow.replaceChildren(style, root)
          return getComputedStyle(root).getPropertyValue('--vui-surface').trim()
        },
        [css, theme],
      )
    expect(await read('dark')).toBe('#141414')
    expect(await read('light')).toBe('#ffffff')
  })
})

test.describe('§15.2 contrast, as the engine resolves it', () => {
  test('fallback tokens reach 4.5:1 in both schemes', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await standalone(page, scheme)
      for (const [tone, ratio] of Object.entries(await contrasts(page, TONES))) {
        expect(ratio, `${scheme} ${tone}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test("Orca's real tokens reach 4.5:1 in both themes", async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const { frame } = await openVisual(page, { input: [] }, scheme, 720)
      for (const [tone, ratio] of Object.entries(await contrasts(frame, TONES))) {
        expect(ratio, `${scheme} ${tone}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

test.describe('motion', () => {
  test('reduced motion removes the fold animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await standalone(page, 'light')
    const name = await page.evaluate(() => {
      const box = document.getElementById('c') as HTMLElement
      box.classList.add('vui-fold-opening')
      return getComputedStyle(box).animationName
    })
    expect(name).toBe('none')
  })

  test('otherwise it runs for at most 150 ms', async ({ page }) => {
    await standalone(page, 'light')
    const duration = await page.evaluate(() => {
      const box = document.getElementById('c') as HTMLElement
      box.classList.add('vui-fold-opening')
      return getComputedStyle(box).animationDuration
    })
    expect(Number.parseFloat(duration) * 1_000).toBeLessThanOrEqual(150)
  })
})
