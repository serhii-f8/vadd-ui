import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: 'line',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } }],
})
