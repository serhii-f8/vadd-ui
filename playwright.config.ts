import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: 'line',
  // One Chromium on Linux renders the baselines, so paths carry no platform (VD-064).
  snapshotPathTemplate: 'e2e/__screenshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, threshold: 0.1, animations: 'disabled' },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /budgets\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    // §9.5 timings run after every other test, alone, so the suite's own workers do not contend
    // with them (VD-171).
    {
      name: 'budgets',
      testMatch: /budgets\.spec\.ts$/,
      dependencies: ['chromium'],
      use: { ...devices['Desktop Chrome'], headless: true },
    },
  ],
})
