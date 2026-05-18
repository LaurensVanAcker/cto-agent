import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * One-shot auth bootstrap.
 *
 * Strategy:
 *   1. If `e2e/.auth/staffler.json` exists AND is < 12h old → skip.
 *      Subsequent specs reuse the cookies via `storageState` in
 *      `playwright.config.ts`.
 *   2. Else, if STAFFLER_QA_USER + STAFFLER_QA_PASSWORD are set, run a
 *      non-interactive UI login (works fine on CI/headless).
 *   3. Else, open Chromium headed so Laurens can log in manually. The
 *      setup waits up to 5 minutes for the post-login navigation, then
 *      persists storageState to disk.
 *
 * Re-auth: delete `e2e/.auth/staffler.json` to force a fresh login.
 */

const AUTH_DIR = path.resolve(__dirname, '..', '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'staffler.json');
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function authStateIsFresh(): boolean {
  try {
    const stat = fs.statSync(AUTH_FILE);
    return Date.now() - stat.mtimeMs < TWELVE_HOURS_MS;
  } catch {
    return false;
  }
}

setup('authenticate and persist storageState', async ({ page }) => {
  // Generous timeout because the interactive path may need a few minutes.
  setup.setTimeout(6 * 60_000);

  if (authStateIsFresh()) {
    console.log(`auth.setup: reusing ${AUTH_FILE} (< 12h old) — skipping login.`);
    return;
  }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const user = process.env.STAFFLER_QA_USER;
  const pass = process.env.STAFFLER_QA_PASSWORD;
  const haveCreds = !!user && !!pass;

  await page.goto('/');

  if (haveCreds) {
    // Headless / CI path — fill the form ourselves.
    const emailField = page
      .locator('input[name="email"], input#email, input[formcontrolname="email"], input[type="email"], input[name="username"]')
      .first();
    await expect(emailField).toBeVisible({ timeout: 15_000 });
    await emailField.fill(user!);
    await page
      .locator('input[name="password"], input#password, input[formcontrolname="password"], input[type="password"]')
      .first()
      .fill(pass!);
    // Form submit is the most resilient — works whether the button label is
    // "Log in", "Inloggen", or translated.
    const submit = page.locator('button[type="submit"]').first();
    if (await submit.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submit.click();
    } else {
      await page.keyboard.press('Enter');
    }
  } else {
    // Interactive path — Laurens logs in by hand in the headed browser.
    // eslint-disable-next-line no-console
    console.log(
      '\n👉 Log in manually, then close the dialog — Playwright will save the session.\n' +
        '   (Waiting up to 5 minutes for the post-login redirect to /company/...)\n',
    );
  }

  // Wait for either the URL to land on a post-login page OR the
  // /api/me round-trip to succeed (covers both auto and interactive flow).
  const postLoginUrl = page.waitForURL(/\/company\//, { timeout: 5 * 60_000 });
  const postLoginApi = page
    .waitForResponse(r => r.url().includes('/api/me') && r.ok(), { timeout: 5 * 60_000 })
    .catch(() => null);

  await Promise.race([postLoginUrl, postLoginApi]);

  // Belt-and-braces: ensure /api/me has fired before we snapshot.
  try {
    await page.waitForResponse(r => r.url().includes('/api/me') && r.ok(), { timeout: 10_000 });
  } catch {
    /* not fatal — URL match is sufficient evidence */
  }

  await page.context().storageState({ path: AUTH_FILE });
  // eslint-disable-next-line no-console
  console.log(`auth.setup: storageState saved → ${AUTH_FILE}`);
});
