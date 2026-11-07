import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { dashboardPage, type PageOptions, type ReactLine } from './harness/vui-view-page.js'

// §4.4 in a real engine: `<VuiView>` on a dashboard page, on React 19 and 18. Dashboard CSS
// must not reach the shadow root, vadd-ui CSS must not leave it, and the theme follows the
// host's `.dark` with the host's own tokens.

const WIDTHS = [360, 720, 1100] as const

/** §19.1, the verification report. */
const REPORT = {
  title: 'Objective #14 — refresh-token rotation',
  subtitle: 'branch vadd/obj-14 @ 4f2c1a9',
  body: [
    {
      type: 'stats',
      items: [
        { label: 'Checks', value: '5/6', tone: 'warn' },
        { label: 'Tests', value: 142, delta: -3, deltaFormat: 'delta' },
        { label: 'Coverage', value: 0.874, format: 'pct', delta: 0.012, deltaFormat: 'delta:pct' },
        { label: 'Duration', value: 48200, format: 'ms' },
      ],
    },
    {
      type: 'checks',
      items: [
        { name: 'Typecheck', status: 'ok', cmd: 'pnpm tsc -b', ms: 9100 },
        { name: 'Unit tests', status: 'ok', cmd: 'pnpm vitest run', ms: 21400 },
        {
          name: 'E2E',
          status: 'fail',
          cmd: 'pnpm e2e',
          ms: 17700,
          output: 'auth.spec.ts:88  expected 401, got 200',
        },
      ],
    },
    {
      type: 'callout',
      tone: 'warn',
      text: 'E2E fails on expired-token replay. Rotation is not invalidating the old token.',
    },
  ],
}

const PROPERTIES = [
  'display',
  'color',
  'background-color',
  'padding-top',
  'border-top-width',
  'font-weight',
  'letter-spacing',
  'text-transform',
  'fill',
  'stroke',
  'opacity',
]

async function open(page: Page, options: PageOptions, theme?: 'light' | 'dark' | 'auto') {
  await page.setContent(dashboardPage(options))
  await page.evaluate(
    ([doc, chosen]) => {
      const mount = document.getElementById('mount') as HTMLElement
      window.mountView(mount, { doc, theme: chosen ?? undefined })
    },
    [REPORT, theme ?? null] as const,
  )
  await expect(page.locator('[data-vui-view]')).toHaveCount(1)
  await page.waitForFunction(() =>
    document.querySelector('[data-vui-view]')?.shadowRoot?.querySelector('.vui-root *'),
  )
}

/** Every shadow element's computed style, by its position. */
function shadowStyles(page: Page): Promise<string[][]> {
  return page.evaluate((properties) => {
    const shadow = document.querySelector('[data-vui-view]')?.shadowRoot as ShadowRoot
    return [...shadow.querySelectorAll('.vui-root, .vui-root *')].map((element) => {
      const style = getComputedStyle(element)
      return [element.tagName, ...properties.map((name) => style.getPropertyValue(name))]
    })
  }, PROPERTIES)
}

function decoyStyles(page: Page): Promise<string[][]> {
  return page.evaluate((properties) => {
    return ['decoy', 'decoy-card', 'decoy-h2'].map((id) => {
      const style = getComputedStyle(document.getElementById(id) as HTMLElement)
      return properties.map((name) => style.getPropertyValue(name))
    })
  }, PROPERTIES)
}

const vuiRoot = (page: Page) =>
  page.evaluateHandle(
    () =>
      document
        .querySelector('[data-vui-view]')
        ?.shadowRoot?.querySelector('.vui-root') as HTMLElement,
  )

for (const react of ['19', '18'] as ReactLine[]) {
  test.describe(`VuiView on React ${react}`, () => {
    test('renders the report in an open shadow root, nothing in the light DOM', async ({
      page,
    }) => {
      await open(page, { react })
      expect(await page.evaluate(() => window.reactVersion.split('.')[0])).toBe(react)
      const facts = await page.evaluate(() => {
        const host = document.querySelector('[data-vui-view]') as HTMLElement
        const shadow = host.shadowRoot as ShadowRoot
        return {
          lightChildren: host.children.length,
          text: shadow.textContent ?? '',
          headStyles: document.head.querySelectorAll('style').length,
          diagnostics: window.diagnostics,
        }
      })
      expect(facts.lightChildren).toBe(0)
      expect(facts.text).toContain('Objective #14')
      expect(facts.text).toContain('expected 401, got 200')
      expect(facts.headStyles).toBe(1)
      expect(facts.diagnostics).toEqual([[]])
    })

    test('dashboard CSS does not reach inside', async ({ page }) => {
      await open(page, { react })
      const calm = await shadowStyles(page)
      await open(page, { react, hostile: true, decoy: true })
      const hostile = await shadowStyles(page)
      expect(calm.length).toBeGreaterThan(20)
      expect(hostile).toEqual(calm)
      // The rules are live: the same page's own heading takes them.
      const control = await page.evaluate(() => {
        const style = getComputedStyle(document.getElementById('decoy-h2') as HTMLElement)
        return [style.color, style.textTransform]
      })
      expect(control).toEqual(['rgb(255, 0, 0)', 'uppercase'])
    })

    test('vadd-ui CSS does not reach outside', async ({ page }) => {
      await page.setContent(dashboardPage({ react, decoy: true }))
      const before = await decoyStyles(page)
      await page.evaluate((doc) => {
        window.mountView(document.getElementById('mount') as HTMLElement, { doc })
      }, REPORT)
      await page.waitForFunction(() =>
        document.querySelector('[data-vui-view]')?.shadowRoot?.querySelector('.vui-root *'),
      )
      expect(await decoyStyles(page)).toEqual(before)
      // The decoy is a block with no card border, as the browser would draw a plain div.
      expect(before[1]?.[PROPERTIES.indexOf('border-top-width')]).toBe('0px')
    })

    test('auto follows .dark on <html> with the host tokens, without a re-render', async ({
      page,
    }) => {
      await open(page, { react })
      const root = await vuiRoot(page)
      const read = () =>
        root.evaluate((element) => ({
          theme: element.dataset.vuiTheme,
          surface: getComputedStyle(element).getPropertyValue('--vui-surface').trim(),
        }))
      // A mark on the drawn content, which a re-render would replace.
      await root.evaluate((element) => {
        ;(element.firstElementChild as Element & { vuiMark?: true }).vuiMark = true
      })
      const light = await read()
      expect(light.theme).toBe('light')
      expect(light.surface).toBe('oklch(1 0 0)')
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await expect.poll(async () => (await read()).theme).toBe('dark')
      const dark = await read()
      expect(dark.surface).toBe('oklch(0.205 0 0)')
      const kept = await root.evaluate(
        (element) => (element.firstElementChild as Element & { vuiMark?: true }).vuiMark === true,
      )
      expect(kept).toBe(true)
    })

    test('an explicit theme wins over the page', async ({ page }) => {
      await open(page, { react, dark: true }, 'light')
      const root = await vuiRoot(page)
      expect(await root.evaluate((element) => element.dataset.vuiTheme)).toBe('light')
    })
  })
}

test.describe('screenshots for inspection', () => {
  const dir = process.env.VUI_EVIDENCE_DIR
  for (const width of WIDTHS) {
    for (const dark of [false, true]) {
      test(`${width} px, ${dark ? 'dark' : 'light'}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 })
        await open(page, { react: '19', hostile: true, dark })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBe(0)
        const name = `vui-view-${width}-${dark ? 'dark' : 'light'}.png`
        const file = dir === undefined ? info.outputPath(name) : join(dir, name)
        if (dir !== undefined) mkdirSync(dir, { recursive: true })
        await page.screenshot({ path: file, fullPage: true })
      })
    }
  }
})
