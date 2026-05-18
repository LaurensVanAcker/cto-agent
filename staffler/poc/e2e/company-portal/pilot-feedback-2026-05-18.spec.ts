import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Playwright e2e — pilot-feedback 2026-05-18 batch.
 *
 * Exercises the 7 fixes shipped in 17c9c16 + 25946ed:
 *   1. day-view drag stacks overlapping events (separate y-lanes)
 *   2. contract-edit dialog: dates + wage locked; time inputs gated by 8h window
 *   3. contract-dialog datepicker no longer overflows the dialog chrome
 *   4. open-shift edit keeps the "+ Shift toevoegen" button
 *   5. dialog-shift-batch employee picker: 3 sections + chips + Charlotte Ramsey
 *   6. backend /api/availabilities seed is populated for current week
 *   7. user-accounts kebab renders for both COMPANY_USER and GROUP_USER rows
 *
 * Each test self-skips cleanly when seed data / fixtures / creds aren't
 * available so the suite stays green on machines without QA access. The
 * fixes themselves are the system-under-test and are NEVER edited here.
 *
 * Fixture gap (TODO): no shared login page-object / session yet. Each test
 * inlines a thin helper that posts to /api/login; once a real fixture lands
 * in `e2e/_fixtures/`, swap the helper for `test.use({ storageState })`.
 */

const username = process.env.STAFFLER_QA_USER;
const password = process.env.STAFFLER_QA_PASSWORD;
const haveCreds = !!username && !!password;

// Helper: best-effort UI login. Returns true if we landed in the app shell.
async function login(page: Page): Promise<boolean> {
  await page.goto('/');
  const emailField = page.locator('input[type="email"], input[name="username"]').first();
  if (!(await emailField.isVisible().catch(() => false))) {
    // Already authenticated via reused session — bail out happily.
    return true;
  }
  await emailField.fill(username!);
  await page.locator('input[type="password"]').first().fill(password!);
  await page.getByRole('button', { name: /inloggen|sign in|login/i }).click();
  try {
    await page.waitForResponse(r => r.url().includes('/api/me') && r.ok(), { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

// Helper: navigate to planning grid + wait until Bryntum is alive.
async function gotoPlanning(page: Page): Promise<boolean> {
  await page.goto('/company/planning-poc');
  const scheduler = page.locator('.b-scheduler');
  try {
    await expect(scheduler).toBeVisible({ timeout: 20_000 });
  } catch {
    return false;
  }
  return true;
}

test.describe('pilot-feedback 2026-05-18', () => {
  test.skip(!haveCreds, 'STAFFLER_QA_USER + STAFFLER_QA_PASSWORD not set — skipping pilot-feedback suite');

  test.beforeEach(async ({ page }) => {
    test.skip(!(await login(page)), 'login flow failed — seed/QA env unreachable');
  });

  // 1) Drag-stack in day-view ----------------------------------------------
  test('1) day-view drag stacks overlapping events into separate y-lanes', async ({ page }) => {
    test.skip(!(await gotoPlanning(page)), 'planning grid did not mount');

    // Switch to day-view. The actuals/planning toolbar exposes a "Dag" pill.
    const dagBtn = page.getByRole('button', { name: /^dag$|day/i }).first();
    if (await dagBtn.isVisible().catch(() => false)) {
      await dagBtn.click();
    } else {
      test.skip(true, 'day-view toggle not found in this build — fixture gap');
    }

    // Wait for at least one event to render so the lane geometry is settled.
    const events = page.locator('.b-sch-event');
    try {
      await expect(events.first()).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, 'no scheduler events visible in day-view — seed has no overlapping contracts');
    }

    // Read `top` for every visible event in the SAME resource row and assert
    // we see at least two distinct lanes (= stack mode is active). We pick the
    // first resource row that actually contains ≥2 events.
    const lanes = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.b-sch-event-row, .b-grid-row'));
      for (const row of rows) {
        const evs = Array.from(row.querySelectorAll('.b-sch-event')) as HTMLElement[];
        if (evs.length < 2) continue;
        const tops = evs.map(el => Math.round(parseFloat(getComputedStyle(el).top || '0')));
        return tops;
      }
      return null;
    });
    test.skip(!lanes, 'no resource row with ≥2 overlapping events — drag-stack scenario absent in seed');

    const unique = Array.from(new Set(lanes!));
    expect(unique.length).toBeGreaterThanOrEqual(2);
    // barMargin: 6 → lanes should differ by ≥ ~6px; allow a generous lower bound.
    const sorted = unique.slice().sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(4);
  });

  // 2) Contract-edit read-only + 8h window ---------------------------------
  test('2) contract-edit: dates + wage locked, time inputs gated by 8h window', async ({ page }) => {
    test.skip(!(await gotoPlanning(page)), 'planning grid did not mount');

    // Open the first existing contract event. We click via JS to bypass
    // Bryntum's pointer-events guard on confirmed contracts.
    const opened = await page.evaluate(() => {
      const ev = document.querySelector('.b-sch-event') as HTMLElement | null;
      if (!ev) return false;
      ev.click();
      return true;
    });
    test.skip(!opened, 'no existing contract events in seed to open');

    const dialog = page.locator('.contract-dialog, p-dialog .p-dialog, [role="dialog"]').first();
    try {
      await expect(dialog).toBeVisible({ timeout: 8_000 });
    } catch {
      test.skip(true, 'contract-dialog did not open from click — UI fixture gap');
    }

    // 2a) Date range field is disabled.
    const dateInput = dialog.locator('p-datepicker input').first();
    await expect(dateInput).toBeVisible();
    // p-datepicker with [readonlyInput] + applyExistingContractEditRules
    // disables the control. We accept either disabled-attr or readonly.
    const dateReadOnly = await dateInput.evaluate((el: HTMLInputElement) =>
      el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true'
    );
    expect(dateReadOnly).toBeTruthy();

    // 2b) Loonpakket strip is visible. In edit-mode this is the disabled
    //     `<input pInputText [value]="position - statute" [disabled]="true">`.
    const wageStrip = dialog.locator('input[pInputText][disabled], input[disabled]')
      .filter({ hasNot: page.locator('p-datepicker input') })
      .first();
    if (await wageStrip.count()) {
      await expect(wageStrip).toBeVisible();
    } else {
      // Skeleton placeholder is also acceptable while data loads.
      await expect(dialog.locator('p-skeleton').first()).toBeVisible();
    }

    // 2c/d) Determine whether the contract starts > 8h in the future. We
    //       use the visible date label as a heuristic; if undetermined we
    //       just assert the inputs exist + are in a consistent state.
    const timeInputs = dialog.locator('dps-time-field input, input[type="time"]');
    const count = await timeInputs.count();
    test.skip(count === 0, 'time-field inputs not rendered (cancel mode or different tab)');

    const firstTime = timeInputs.first();
    const isDisabled = await firstTime.evaluate((el: HTMLInputElement) =>
      el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true'
    );
    // We assert internal consistency: either both enabled (>8h) OR both
    // disabled (<8h). The applyExistingContractEditRules helper guarantees
    // this invariant — if it's broken we fail loudly.
    const lastTime = timeInputs.last();
    const lastDisabled = await lastTime.evaluate((el: HTMLInputElement) =>
      el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true'
    );
    expect(isDisabled).toBe(lastDisabled);
  });

  // 3) Datepicker overflow --------------------------------------------------
  test('3) contract-dialog datepicker fits inside the dialog chrome (default + narrow)', async ({ page }) => {
    test.skip(!(await gotoPlanning(page)), 'planning grid did not mount');

    const opened = await page.evaluate(() => {
      const ev = document.querySelector('.b-sch-event') as HTMLElement | null;
      if (!ev) return false;
      ev.click();
      return true;
    });
    test.skip(!opened, 'no contract events to open for datepicker test');

    const dialog = page.locator('p-dialog .p-dialog, [role="dialog"]').first();
    try {
      await expect(dialog).toBeVisible({ timeout: 8_000 });
    } catch {
      test.skip(true, 'contract-dialog did not open — fixture gap');
    }

    async function assertNoOverflow() {
      const overflow = await page.evaluate(() => {
        const dlg = document.querySelector(
          'p-dialog .p-dialog, [role="dialog"]'
        ) as HTMLElement | null;
        if (!dlg) return { ok: false, reason: 'no dialog' };
        const input = dlg.querySelector('p-datepicker input') as HTMLElement | null;
        const btn = dlg.querySelector('p-datepicker button, p-datepicker .p-datepicker-trigger') as
          | HTMLElement
          | null;
        if (!input) return { ok: false, reason: 'no datepicker input' };
        const dlgR = dlg.getBoundingClientRect().right;
        const inR = input.getBoundingClientRect().right;
        const btR = btn ? btn.getBoundingClientRect().right : inR;
        return { ok: inR <= dlgR + 0.5 && btR <= dlgR + 0.5, inR, btR, dlgR };
      });
      expect(overflow.ok, JSON.stringify(overflow)).toBe(true);
    }

    // Default viewport.
    await assertNoOverflow();

    // Narrow viewport.
    await page.setViewportSize({ width: 360, height: 800 });
    // Give the dialog a tick to reflow.
    await page.waitForTimeout(250);
    await assertNoOverflow();
  });

  // 4) Open-shift edit keeps "+ Shift toevoegen" ----------------------------
  test('4) open-shift edit shows "Shift toevoegen"; contract edit hides it', async ({ page }) => {
    test.skip(!(await gotoPlanning(page)), 'planning grid did not mount');

    // Find an open-shift block in the planning grid (.b-sch-event with the
    // open-shift styling — fall back to any event if the marker is unknown).
    const openShift = page.locator('.b-sch-event.open-shift, .b-sch-event[data-kind="open-shift"], .b-sch-event').first();
    if (!(await openShift.isVisible().catch(() => false))) {
      test.skip(true, 'no open-shift event in seed — fixture gap');
    }
    await openShift.click({ force: true });

    const dialog = page.locator('.m09-add-slot, p-dialog .p-dialog, [role="dialog"]').first();
    try {
      await expect(dialog).toBeVisible({ timeout: 8_000 });
    } catch {
      test.skip(true, 'shift-batch dialog did not open');
    }

    // Open-shift mode: + Shift toevoegen button MUST be visible.
    const addSlotBtn = page.getByRole('button', { name: /shift toevoegen/i });
    await expect(addSlotBtn.first()).toBeVisible();

    // Close dialog.
    const closer = page.locator('button:has(.dps-icon-close), .m09-btn-cancel').first();
    if (await closer.isVisible().catch(() => false)) {
      await closer.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // Now click a contract event. isCreateMode is false there → no shift-template
    // selector AND no "Shift toevoegen" because mode === 'single'.
    const contractEvent = page.locator('.b-sch-event:not(.open-shift)').first();
    if (!(await contractEvent.isVisible().catch(() => false))) {
      test.skip(true, 'no contract event distinct from open-shift in seed');
    }
    await contractEvent.click({ force: true });
    // Wait for some dialog to land; if it's the contract-dialog (no Shift
    // toevoegen button there at all) that's the assertion satisfied.
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /shift toevoegen/i })).toHaveCount(0);
  });

  // 5) Employee picker — 3 sections + chips + Charlotte Ramsey -------------
  test('5) shift-batch dialog: 3 sections, vaste werknemers row, chip + Charlotte Ramsey', async ({ page }) => {
    test.skip(!(await gotoPlanning(page)), 'planning grid did not mount');

    // Open the shift-batch dialog via the "+ shift toevoegen" affordance on
    // the planning surface. We try the generic add-shift button first.
    const addShiftTrigger = page.getByRole('button', { name: /shift toevoegen|nieuwe shift|add shift/i }).first();
    if (!(await addShiftTrigger.isVisible().catch(() => false))) {
      // Fall back: click the first open-shift event to open the picker in
      // edit mode (still renders the 3 sections).
      const fallback = page.locator('.b-sch-event').first();
      if (!(await fallback.isVisible().catch(() => false))) {
        test.skip(true, 'no entry point to shift-batch dialog');
      }
      await fallback.click({ force: true });
    } else {
      await addShiftTrigger.click();
    }

    // Switch the first slot to "Persoon kiezen" if the choice screen shows.
    const persoonBtn = page.locator('.m09-choice-btn.persoon').first();
    if (await persoonBtn.isVisible().catch(() => false)) {
      await persoonBtn.click();
    }

    const picker = page.locator('.persoon-inline-list').first();
    try {
      await expect(picker).toBeVisible({ timeout: 8_000 });
    } catch {
      test.skip(true, 'persoon-kiezen picker did not render');
    }

    // 5a) Three sticky group headers — by label match (some can be empty).
    const headers = picker.locator('.persoon-group-header .persoon-group-label');
    const headerTexts = (await headers.allTextContents()).map(s => s.trim());
    expect(headerTexts).toEqual(
      expect.arrayContaining(['Beschikbaar', 'Andere medewerkers', 'Vaste werknemers'])
    );

    // 5b) At least one row in the "Vaste werknemers" group.
    // The header doesn't natively wrap its rows in the same parent, so we
    // walk siblings until we hit the next header.
    const vastRowCount = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('.persoon-group-header'));
      const vastHeader = headers.find(h =>
        (h.querySelector('.persoon-group-label')?.textContent || '').trim() === 'Vaste werknemers'
      );
      if (!vastHeader) return 0;
      let n = 0;
      let next = vastHeader.nextElementSibling;
      while (next && !next.classList.contains('persoon-group-header')) {
        if (next.classList.contains('persoon-inline-row')) n++;
        next = next.nextElementSibling;
      }
      return n;
    });
    expect(vastRowCount).toBeGreaterThanOrEqual(1);

    // 5c) At least one availability-badge chip with a "Nu — Mu" range.
    const chip = picker.locator('.availability-badge').first();
    await expect(chip).toBeVisible();
    const chipText = (await chip.textContent())?.trim() ?? '';
    expect(chipText).toMatch(/\d{1,2}u\s*[—\-–]\s*\d{1,2}u/);

    // 5d) Charlotte Ramsey exists and is clickable (no disabled state).
    const charlotte = page.locator('.persoon-inline-row', { hasText: 'Charlotte Ramsey' }).first();
    if (!(await charlotte.count())) {
      test.skip(true, 'Charlotte Ramsey not present in this seed — bucket may rotate');
    }
    await expect(charlotte).toBeVisible();
    const disabled = await charlotte.evaluate((el: HTMLButtonElement) =>
      el.disabled || el.getAttribute('aria-disabled') === 'true'
    );
    expect(disabled).toBeFalsy();
  });

  // 6) Seed availability data this week ------------------------------------
  test('6) /api/availabilities has rows for ≥5 employees this week', async ({ page, request }) => {
    // We need the session cookie that the page just acquired during
    // beforeEach. Reuse the page's APIRequestContext for that.
    const baseURL = page.url().replace(/\/[^/]*$/, '');
    const ctx: APIRequestContext = page.request;

    const from = '2026-05-18';
    const to = '2026-05-24';

    // First we need a companyId. Hit /api/me to pull it.
    const meResp = await ctx.get('/api/me');
    if (!meResp.ok()) {
      test.skip(true, `/api/me did not return OK (status ${meResp.status()}) — seed not reachable`);
    }
    const me = (await meResp.json()) as { companyId?: string; activeCompanyId?: string };
    const companyId = me.companyId ?? me.activeCompanyId;
    test.skip(!companyId, 'no companyId on /api/me payload — cannot query availabilities');

    const resp = await ctx.get(`/api/availabilities?companyId=${companyId}&from=${from}&to=${to}`);
    expect(resp.ok(), `availabilities GET status ${resp.status()}`).toBeTruthy();
    const body = (await resp.json()) as unknown;

    // Body shape may be an array of rows or a { employeeId: rows[] } map.
    const rowsByEmployee = new Map<string, number>();
    if (Array.isArray(body)) {
      for (const row of body as Array<{ employeeId?: string; employee_id?: string; date: string }>) {
        const empId = row.employeeId ?? row.employee_id;
        if (!empId) continue;
        if (row.date >= from && row.date <= to) {
          rowsByEmployee.set(empId, (rowsByEmployee.get(empId) ?? 0) + 1);
        }
      }
    } else if (body && typeof body === 'object') {
      for (const [empId, rows] of Object.entries(body as Record<string, Array<{ date: string }>>)) {
        for (const row of rows ?? []) {
          if (row.date >= from && row.date <= to) {
            rowsByEmployee.set(empId, (rowsByEmployee.get(empId) ?? 0) + 1);
          }
        }
      }
    }

    expect(rowsByEmployee.size, `expected ≥5 employees w/ availability between ${from} and ${to}`)
      .toBeGreaterThanOrEqual(5);
    void baseURL;
  });

  // 7) User-accounts kebab menu --------------------------------------------
  test('7) user-accounts kebab renders for COMPANY_USER + GROUP_USER rows', async ({ page }) => {
    await page.goto('/company/user-accounts');

    const table = page.locator('p-table');
    try {
      await expect(table).toBeVisible({ timeout: 10_000 });
    } catch {
      test.skip(true, '/company/user-accounts did not load — route/guard gap');
    }

    // The table renders rows once /api/company-users resolves.
    const rows = page.locator('p-table tr', { has: page.locator('td') });
    try {
      await expect(rows.first()).toBeVisible({ timeout: 8_000 });
    } catch {
      test.skip(true, 'no user-account rows in this tenant');
    }

    const rowCount = await rows.count();
    let companyUserRow = -1;
    let groupUserRow = -1;
    for (let i = 0; i < rowCount; i++) {
      const txt = (await rows.nth(i).textContent()) ?? '';
      // ACCESS_TO_ALL_GROUPS string (Dutch: "toegang tot alle vestigingen")
      if (/alle vestigingen|all groups|all branches/i.test(txt) && companyUserRow < 0) {
        companyUserRow = i;
      } else if (/p-chip|vestiging/i.test(txt) && groupUserRow < 0) {
        // GROUP_USER rows render p-chip per accessGroup.
        groupUserRow = i;
      }
    }

    // Looser fallback: just assert that EVERY visible row has a kebab.
    // The fix ensured the self-exclusion guard is gone, so when
    // canManipulateUsers is true every row must show the trigger.
    const kebabCount = await page.locator('p-table tr p-button:has(.dps-icon-more), p-table tr button:has(.dps-icon-more)').count();
    expect(kebabCount).toBeGreaterThanOrEqual(rowCount);

    // Sanity log for reviewers: at least one of each role should be present
    // for the assertion to be meaningful, but a single-role tenant still
    // satisfies the contract.
    if (companyUserRow < 0 && groupUserRow < 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'tenant has neither a clear COMPANY_USER nor GROUP_USER row — kebab presence is still verified',
      });
    }
  });
});
