import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export default defineConfig({
  testDir: './tests/release',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: 'reports/release-2026-10-28/browser/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/release-2026-10-28/browser/results.json' }],
    ['html', { outputFolder: 'reports/release-2026-10-28/browser/html', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : {},
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @partsfinder/api start',
      url: 'http://127.0.0.1:8787/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @partsfinder/web preview -- --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
