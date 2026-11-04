import { expect, test } from '@playwright/test'

test('Chromium launches headless and runs script', async ({ browser, page }) => {
  await page.goto('data:text/html,<title>vui</title>')
  await expect(page).toHaveTitle('vui')
  expect(await page.evaluate(() => 40 + 2)).toBe(42)
  expect(browser.browserType().name()).toBe('chromium')
})
