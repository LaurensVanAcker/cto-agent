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

    // Helper: assert there is at least one contract bar after a short
    // settling time. We DELIBERATELY wait both for the bar AND a short
    // post-wait, because the bug was "appears briefly then disappears".
    const expectContractsStable = async (label: string) => {
      // First settle the rebuild — Bryntum's updateViewPreset is
      // synchronous, but the wrapper's ngOnChanges + our setTimeout(0)
      // sync land on later macrotasks.
      await page.waitForTimeout(800);
      const n = await contractBar.count();
      const reallyVisible = await contractBar.first().isVisible().catch(() => false);
      expect(
        n,
        `after ${label}: expected contract bars > 0, got ${n} (visible=${reallyVisible}). console=${consoleErrors.join(
          ' | ',
        )}`,
      ).toBeGreaterThan(0);
      // And still present 1s later — guards against the prior race where
      // contracts re-appeared then got wiped by a delayed Bryntum reconcile.
      await page.waitForTimeout(1000);
      const nAfter = await contractBar.count();
      expect(
        nAfter,
        `after ${label} + 1s settle: expected contract bars > 0, got ${nAfter}. console=${consoleErrors.join(
          ' | ',
        )}`,
      ).toBeGreaterThan(0);
    };

    await twoWeekBtn.click();
    await expectContractsStable('Week → 2 weken');

    await dagBtn.click();
    await expectContractsStable('2 weken → Dag');

    await weekBtn.click();
    await expectContractsStable('Dag → Week');

    // Reverse direction for full coverage.
    await twoWeekBtn.click();
    await expectContractsStable('Week → 2 weken (round trip)');

    await weekBtn.click();
    await expectContractsStable('2 weken → Week (round trip)');
  });
});
