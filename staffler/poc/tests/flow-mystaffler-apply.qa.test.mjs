import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * End-to-end flow test for the MyStaffler-PoC demo story.
 *
 * 1. Company-side creates a broadcast shift (SELECTION, targets the
 *    employee).
 * 2. Employee-side fetches my-shifts → sees the open shift, no
 *    application yet.
 * 3. Employee applies → my-shifts now reports an application row with
 *    status='candidate'.
 * 4. Employee withdraws → application flips to 'withdrawn' and is no
 *    longer returned by listApplicationsForEmployee with active status.
 *
 * Drives the pocDb directly (the route logic is thin glue and is
 * already covered by tests/server.qa.test.mjs and
 * tests/employee-login-integration.qa.test.mjs).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-flow-'));
const dataDir = mkdtempSync(resolve(tmpdir(), 'staffler-flow-data-'));
mkdirSync(dataDir, { recursive: true });

function compile() {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ['node'],
      typeRoots: [resolve(repo, 'node_modules/@types')],
      outDir: buildDir,
      rootDir: resolve(repo, 'src'),
    },
    include: [resolve(repo, 'src/store/poc-db.ts')],
  };
  const cfg = resolve(buildDir, 'tsconfig.test.json');
  writeFileSync(cfg, JSON.stringify(tsconfig));
  const res = spawnSync('npx', ['--no-install', 'tsc', '-p', cfg], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error('tsc failed:\n' + res.stdout + '\n' + res.stderr);
}
compile();

process.chdir(dataDir);
const { pocDb } = await import(resolve(buildDir, 'store/poc-db.js'));

function fresh() { pocDb.reset(); return pocDb; }

const SHIFT = {
  company_id: 'C1',
  service_group_id: 'SG-Toog',
  date_from: '2026-05-18',
  date_to: '2026-05-18',
  from_time: '09:00',
  to_time: '17:00',
  pause_from: null,
  pause_to: null,
  capacity: 1,
  deadline: null,
  target_type: 'SELECTION',
  target_group_ids: [],
  status: 'open',
  published_at: '2026-05-14T08:00:00Z',
  created_by_user_id: null,
};

test('flow: company creates broadcast shift → employee sees it via my-shifts logic', () => {
  const db = fresh();
  const create = db.createShift({
    ...SHIFT,
    target_employee_ids: ['E1'],
  });
  assert.equal(create.merged, false);

  // Re-implement the my-shifts filter the route uses so we test the
  // same predicate end-to-end.
  function myShifts(employeeId) {
    const apps = db.listApplicationsForEmployee(employeeId);
    const appByShift = new Map(apps.map((a) => [a.shift_id, a]));
    return db
      .raw()
      .shifts.filter(
        (s) =>
          s.status === 'open' &&
          (s.target_type === 'ALL_POOL' ||
            (s.target_type === 'SELECTION' && s.target_employee_ids?.includes(employeeId))),
      )
      .map((s) => ({ shift: s, application: appByShift.get(s.id) ?? null }));
  }

  const before = myShifts('E1');
  assert.equal(before.length, 1, 'employee sees the broadcast shift');
  assert.equal(before[0].application, null, 'no application yet');

  // Another employee NOT targeted should see nothing.
  assert.equal(myShifts('E2').length, 0);

  // Employee applies.
  const app = db.applyToShift(create.shift.id, 'E1');
  assert.equal(app.status, 'candidate');

  const after = myShifts('E1');
  assert.equal(after.length, 1);
  assert.equal(after[0].application?.status, 'candidate');

  // Withdraw.
  assert.equal(db.withdrawApplication(create.shift.id, 'E1'), true);
  const apps = db.listApplicationsForEmployee('E1');
  // The original row stays for audit; status flipped to 'withdrawn'.
  assert.equal(apps[0].status, 'withdrawn');
});

test('flow: ALL_POOL broadcast reaches every employee (no SELECTION list)', () => {
  const db = fresh();
  const create = db.createShift({
    ...SHIFT,
    target_type: 'ALL_POOL',
    target_employee_ids: [],
  });
  function myShifts(employeeId) {
    return db
      .raw()
      .shifts.filter(
        (s) =>
          s.status === 'open' &&
          (s.target_type === 'ALL_POOL' ||
            (s.target_type === 'SELECTION' && s.target_employee_ids?.includes(employeeId))),
      );
  }
  assert.equal(myShifts('any-employee').length, 1);
  assert.equal(myShifts('whoever').length, 1);
});

test('flow: dedup re-apply returns the existing application (no duplicate row)', () => {
  const db = fresh();
  const create = db.createShift({ ...SHIFT, target_employee_ids: ['E1'] });
  const a = db.applyToShift(create.shift.id, 'E1');
  const b = db.applyToShift(create.shift.id, 'E1');
  assert.equal(a.id, b.id, 'second apply returns the same row, not a new one');
  assert.equal(db.listApplicationsForEmployee('E1').length, 1);
});

test('flow: withdraw without an active application returns false', () => {
  const db = fresh();
  const create = db.createShift({ ...SHIFT, target_employee_ids: ['E1'] });
  // Never applied → nothing to withdraw.
  assert.equal(db.withdrawApplication(create.shift.id, 'E1'), false);
});

process.on('exit', () => {
  try {
    rmSync(buildDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});
