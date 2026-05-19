import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright config for the PoC's two demo flows.
 *
 * Setup:
 *   1. From `poc/`:  `npm install --save-dev @playwright/test`
 *   2. Then:          `npx playwright install --with-deps`  (browsers)
 *   3. Run all:       `npm run e2e`        (assumes dev:all is up on :1445 / :4201)
 *   4. Or in CI:      `npm run e2e:ci`     (boots dev:all itself via webServer)
 *
 * Auth strategy:
 *   The `setup` project (`e2e/_setup/auth.setup.ts`) produces
 *   `e2e/.auth/staffler.json`, a Playwright storageState file. All
 *   company-portal specs depend on it and reuse the session for 12h.
 *
 *   - First local run pops a headed browser; log in once.
 *   - Subsequent runs are headless and instant.
 *   - To force a fresh login: delete `e2e/.auth/staffler.json`.
 *   - CI bypass: set STAFFLER_QA_USER + STAFFLER_QA_PASSWORD, and the
 *     setup project will auto-fill the form non-interactively.
 *
 * mystaffler-poc still uses its own creds (MYSTAFFLER_EMP_*) and skips
 * cleanly when missing.
 */
const AUTH_STATE = path.resolve(__dirname, 'e2e', '.auth', 'staffler.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,             // demo flows share state on QA — serial is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      // One-shot interactive (or env-driven) login → storageState file.
      // Runs headed so Laurens can log in by hand the first time.
      name: 'setup',
      testMatch: /_setup\/.*\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.COMPANY_PORTAL_URL ?? 'http://localhost:1445',
        headless: false,
      },
    },
    {
      name: 'company-portal',
      testMatch: /company-portal\/.+\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.COMPANY_PORTAL_URL ?? 'http://localhost:1445',
        storageState: AUTH_STATE,
      },
    },
    {
      name: 'mystaffler-poc',
      testMatch: /mystaffler-poc\/.+\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MYSTAFFLER_POC_URL ?? 'http://localhost:4201',
      },
    },
  ],

  // In CI we boot dev:all ourselves; locally the dev assumes it's already
  // running so iteration stays fast.
  webServer: process.env.CI
    ? {
        command: 'npm run dev:all',
        url: 'http://localhost:1445',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
