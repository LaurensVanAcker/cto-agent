import { expect, test } from '@playwright/test';

/**
 * Pilot feedback 2026-05-19 (item 7, re-fix verification): switching the
 * planning view between Dag / Week / 2 weken must NOT wipe contract bars
 * from the Bryntum grid. Originally a manual F5 was required.
 *
 * Reproduction:
 *   1. Land on /company/planning (Names + Week is the default).
 *   2. Wait until the Bryntum grid paints at least one contract bar.
 *   3. Click 2 weken → assert contract bars still present.
 *   4. Click Dag → assert contract bars still present.
 *   5. Click Week → assert contract bars still present.
 *
 * Selector: `.b-sch-event-wrap .poc-event-contract` — Bryntum wraps each
 * event in a `.b-sch-event-wrap` and the contract class is set via the
 * `cls` field in buildEvents (component .ts line 1676).
 */

test.describe('planning grid keeps contracts across viewPreset switches', () => {
  test('Names view: Week → 2 weken → Dag → Week, contracts always visible', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Capture console + page errors so a runtime exception in the
    // viewPreset rebuild shows up in the test output instead of being
    // hidden behind a silent empty grid.
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

    // The company route is `/company/:companyId/<subroute>`. Hardcoded
    // here to the demo company UUID seen in the backend logs — avoids
    // depending on a dashboard redirect that may not have access to a
    // hydrated NgRx state in this fresh Playwright session.
    await page.goto('/company/1bbabbe5-d9b0-4dbb-ac49-a17663d63328/planning-poc');

    // Bryntum mounts a single `.b-scheduler` container.
    await expect(page.locator('.b-scheduler')).toBeVisible({ timeout: 30_000 });

    // Wait for at least one contract bar in the default Week view.
    const contractBar = page.locator('.b-sch-event-wrap .poc-event-contract');
    await expect(contractBar.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await contractBar.count();
    expect(initialCount, 'baseline week view should have contracts').toBeGreaterThan(0);

    // The zoom segment is the second p-selectButton on the page (first
    // is the view toggle Namen/Locaties). PrimeNG renders the options as
    // plain divs with role=generic, not <button>, so locate by exact
    // visible text inside the segment.
    const zoomSegment = page.locator('p-selectbutton.planning-segment').nth(1);
    const dagBtn = zoomSegment.getByText(/^Dag$/);
    const weekBtn = zoomSegment.getByText(/^Week$/);
    const twoWeekBtn = zoomSegment.getByText(/^2 weken$/);

    // Helper: log the post-switch contract count and capture errors.
    // Returns the count instead of asserting so we can sequence multiple
    // switches and reason about the trajectory (the Dag view may
    // legitimately have 0 contracts on a given day; the bug we're
    // tracking is "contracts disappear and stay gone" across a switch).
    const countAfterSwitch = async (label: string): Promise<number> => {
      await page.waitForTimeout(800);
      const n = await contractBar.count();
      // eslint-disable-next-line no-console
      console.log(`[test] ${label}: contractBars=${n}`);
      await page.waitForTimeout(1000);
      const nAfter = await contractBar.count();
      // eslint-disable-next-line no-console
      console.log(`[test] ${label} + 1s: contractBars=${nAfter}`);
      return nAfter;
    };

    await twoWeekBtn.click();
    const c1 = await countAfterSwitch('Week → 2 weken');

    await dagBtn.click();
    const c2 = await countAfterSwitch('2 weken → Dag');

    await weekBtn.click();
    const c3 = await countAfterSwitch('Dag → Week');

    await twoWeekBtn.click();
    const c4 = await countAfterSwitch('Week → 2 weken (round trip)');

    await weekBtn.click();
    const c5 = await countAfterSwitch('2 weken → Week (round trip)');

    // The real bug we're tracking: a switch INTO a multi-day view (Week
    // or 2 weken) must NEVER wipe contracts that were present in the
    // baseline Week view. Dag-view counts can legitimately be 0 if the
    // landed-on day has no contracts — we don't assert on those.
    expect(
      c1,
      `Week → 2 weken should preserve contracts (was ${initialCount}, got ${c1}). console=${consoleErrors.join(' | ')}`,
    ).toBeGreaterThan(0);
    expect(
      c3,
      `Dag → Week should restore contracts (baseline ${initialCount}, got ${c3}). console=${consoleErrors.join(' | ')}`,
    ).toBeGreaterThan(0);
    expect(
      c4,
      `Week → 2 weken (round trip) should preserve contracts (got ${c4}). console=${consoleErrors.join(' | ')}`,
    ).toBeGreaterThan(0);
    expect(
      c5,
      `2 weken → Week (round trip) should preserve contracts (got ${c5}). console=${consoleErrors.join(' | ')}`,
    ).toBeGreaterThan(0);

    // Flag if Bryntum / Angular Animations errors appeared at any point.
    const bryntumOrAnimErrors = consoleErrors.filter(
      e =>
        /Cannot append.*to dps-company/.test(e) ||
        /Cannot read properties of null \(reading 'isRoot'\)/.test(e),
    );
    expect(
      bryntumOrAnimErrors,
      `expected no Bryntum tree-store or Angular Animations crashes, got: ${bryntumOrAnimErrors.join(' | ')}`,
    ).toEqual([]);

    // Volatile info for the test report so we always see the trajectory.
    // eslint-disable-next-line no-console
    console.log(
      `[test] trajectory: baseline=${initialCount} c1=${c1} c2=${c2} c3=${c3} c4=${c4} c5=${c5}`,
    );
  });
});
