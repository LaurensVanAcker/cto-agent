import { expect, test, type Page } from '@playwright/test';

/**
 * Pilot feedback 2026-05-19: the `<dps-page-header>` "dances" between the
 * four main menu items — the magenta title chip + the "Galana nv" subtitle
 * land on slightly different x/y on each route. This spec snapshots the
 * bounding-rects of host / title / subtitle on each page so we can diff
 * pixel positions before and after the fix.
 *
 * Pre-fix snapshot (1440x900):
 *   planning-poc: host(x=105, y=16, w=1319, h=77)   — p-3 on host pushed it 16px
 *   pool:         host(x=113, y=24, w=1303, h=77)   — p-4 on host pushed it 24px
 *   user-accounts host(x=89,  y=0,  w=1351, h=89)   — flush at parent edge
 *   actuals:      host(x=89,  y=0,  w=1351, h=89)   — flush at parent edge
 *
 * Fix: drop the `p-3 gap-3` / `p-4 gap-3` classes from the planning-poc /
 * pool component hosts and move that padding+gap inside an inner
 * `<main class="...px-3 pt-3 gap-3">` (the pattern accounts/actuals already
 * use). Result: all four pages give `<dps-page-header>` the same x/y/w.
 *
 * Run via:
 *   cd staffler/poc && npx playwright test \
 *     --project=company-portal --grep header-dance --reporter=list
 *
 * Note: the dev proxy (`tsx watch src/server/index.ts`) keeps sessions in
 * memory. If it restarts between runs the cached cookie in
 * `e2e/.auth/staffler.json` is silently invalidated server-side. Re-login
 * by deleting the auth file (or running `npm run e2e:setup`).
 */

const COMPANY_UUID = '1bbabbe5-d9b0-4dbb-ac49-a17663d63328';

type Rect = { x: number; y: number; width: number; height: number };
type HeaderSnapshot = {
  route: string;
  host: Rect | null;
  title: Rect | null;
  subtitle: Rect | null;
};

const ROUTES: { key: string; path: string; readyLocator: string }[] = [
  {
    key: 'planning',
    path: `/company/${COMPANY_UUID}/planning-poc`,
    readyLocator: '.b-scheduler, .poc-banner',
  },
  {
    key: 'pool',
    path: `/company/${COMPANY_UUID}/pool`,
    readyLocator: 'main p-table, main .pool-toolbar',
  },
  {
    key: 'user-accounts',
    path: `/company/${COMPANY_UUID}/user-accounts`,
    readyLocator: 'main p-table',
  },
  {
    key: 'actuals',
    path: `/company/${COMPANY_UUID}/actuals`,
    readyLocator: 'main, .b-scheduler',
  },
];

async function captureHeader(page: Page, route: string): Promise<HeaderSnapshot> {
  const resp = await page.goto(route);
  // The dev proxy can bounce us to /login if the in-memory session map
  // was cleared (tsx watch restart). Fail fast with a helpful message
  // instead of hanging on a `dps-page-header` that will never appear.
  await page.waitForLoadState('domcontentloaded');
  if (page.url().includes('/login') || page.url() === new URL('/', resp?.url() ?? 'http://x').toString()) {
    throw new Error(
      `Auth wall: dev proxy redirected ${route} to ${page.url()}. ` +
        `Delete e2e/.auth/staffler.json and re-run to log in fresh.`,
    );
  }
  await page.locator('dps-page-header').first().waitFor({ state: 'visible', timeout: 20_000 });
  // Wait until the subtitle (`Galana nv`) renders — the company() signal
  // is hydrated after navigation, so without this the planning + pool
  // captures fired before the `<h3.text-primary>` was in the DOM.
  await page.locator('dps-page-header h3.text-primary').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  // Give Angular one frame to settle layout after navigation
  await page.waitForTimeout(250);

  const snapshot = await page.evaluate(() => {
    const toRect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        width: +r.width.toFixed(2),
        height: +r.height.toFixed(2),
      };
    };
    const host = document.querySelector('dps-page-header');
    // Subtitle = the `<h3>` rendered when subtitle() is set (text-primary).
    // Title chip = `.title-wrapper` (indigo chip with icon + h3).
    const titleChip = host?.querySelector('.title-wrapper') ?? null;
    const subtitleEl = host?.querySelector('h3.text-primary') ?? null;
    return {
      host: toRect(host),
      title: toRect(titleChip),
      subtitle: toRect(subtitleEl),
    };
  });

  return { route, ...snapshot };
}

test.describe('header dance debug', () => {
  test('snapshot dps-page-header rects across the 4 main routes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const results: HeaderSnapshot[] = [];
    for (const r of ROUTES) {
      const snap = await captureHeader(page, r.path);
      results.push(snap);
    }

    // eslint-disable-next-line no-console
    console.log('\n=== HEADER RECT SNAPSHOT (1440x900) ===');
    for (const s of results) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(s, null, 2));
    }

    // Pick planning as the reference; all other rects must match exactly
    // (host.x/y, title.x/y, subtitle.x/y).
    const ref = results.find(r => r.route.includes('planning-poc'))!;
    expect(ref.host, 'planning host rect').not.toBeNull();
    expect(ref.title, 'planning title rect').not.toBeNull();
    expect(ref.subtitle, 'planning subtitle rect').not.toBeNull();

    for (const s of results) {
      // eslint-disable-next-line no-console
      console.log(
        `[diff] ${s.route}: ` +
          `host(Δx=${(s.host!.x - ref.host!.x).toFixed(2)}, Δy=${(s.host!.y - ref.host!.y).toFixed(2)}) ` +
          `title(Δx=${(s.title!.x - ref.title!.x).toFixed(2)}, Δy=${(s.title!.y - ref.title!.y).toFixed(2)}) ` +
          `subtitle(Δx=${(s.subtitle!.x - ref.subtitle!.x).toFixed(2)}, Δy=${(s.subtitle!.y - ref.subtitle!.y).toFixed(2)})`,
      );
    }

    // Hard assertion: subtitle + title must align pixel-perfect across all 4 routes
    for (const s of results) {
      expect(s.host!.x, `${s.route} host.x`).toBeCloseTo(ref.host!.x, 1);
      expect(s.host!.y, `${s.route} host.y`).toBeCloseTo(ref.host!.y, 1);
      expect(s.title!.x, `${s.route} title.x`).toBeCloseTo(ref.title!.x, 1);
      expect(s.title!.y, `${s.route} title.y`).toBeCloseTo(ref.title!.y, 1);
      expect(s.subtitle!.x, `${s.route} subtitle.x`).toBeCloseTo(ref.subtitle!.x, 1);
      expect(s.subtitle!.y, `${s.route} subtitle.y`).toBeCloseTo(ref.subtitle!.y, 1);
    }
  });
});
