import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

// Compile poc-db.ts into a temp dir so we can import it without ts-node.
// Same trick as the other tests — keeps node:test dependency-free.
const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-pocdb-'));
const dataDir = mkdtempSync(resolve(tmpdir(), 'staffler-pocdb-data-'));
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
  const cfgPath = resolve(buildDir, 'tsconfig.test.json');
  writeFileSync(cfgPath, JSON.stringify(tsconfig));
  const res = spawnSync('npx', ['--no-install', 'tsc', '-p', cfgPath], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error('tsc failed:\n' + res.stdout + '\n' + res.stderr);
  }
}

compile();

// poc-db writes to ./data/poc-store.json by default. Redirect via cwd
// override: we import once but isolate each test with a fresh `reset()`.
process.chdir(dataDir);

const pocDbModule = await import(resolve(buildDir, 'store/poc-db.js'));
const { pocDb } = pocDbModule;

function freshDb() {
  pocDb.reset();
  return pocDb;
}

const baseShift = {
  company_id: 'C1',
  service_group_id: 'SG1',
  date_from: '2026-05-18',
  date_to: '2026-05-18',
  from_time: '09:00',
  to_time: '17:00',
  pause_from: null,
  pause_to: null,
  capacity: 1,
  deadline: null,
  target_type: 'NONE',
  target_employee_ids: [],
  target_group_ids: [],
  status: 'draft',
  published_at: null,
  created_by_user_id: null,
};

test('createShift inserts a new shift when nothing matches', () => {
  const db = freshDb();
  const result = db.createShift({ ...baseShift });
  assert.equal(result.merged, false);
  assert.ok(result.shift.id);
  assert.equal(result.shift.capacity, 1);
});

test('createShift dedups on identical SL + dates + hours (sums capacity, unions targets)', () => {
  const db = freshDb();
  const a = db.createShift({
    ...baseShift,
    capacity: 2,
    target_employee_ids: ['E1', 'E2'],
  });
  assert.equal(a.merged, false);

  const b = db.createShift({
    ...baseShift,
    capacity: 3,
    target_employee_ids: ['E2', 'E3'],
  });
  assert.equal(b.merged, true);
  assert.equal(b.mergedInto, a.shift.id);
  assert.equal(b.shift.capacity, 5);
  assert.deepEqual([...new Set(b.shift.target_employee_ids)].sort(), ['E1', 'E2', 'E3']);
});

test('createShift does NOT dedup when hours differ', () => {
  const db = freshDb();
  const a = db.createShift({ ...baseShift, from_time: '09:00', to_time: '17:00' });
  const b = db.createShift({ ...baseShift, from_time: '10:00', to_time: '18:00' });
  assert.equal(b.merged, false);
  assert.notEqual(a.shift.id, b.shift.id);
});

test('createShift does NOT dedup when service_group differs', () => {
  const db = freshDb();
  const a = db.createShift({ ...baseShift, service_group_id: 'SG1' });
  const b = db.createShift({ ...baseShift, service_group_id: 'SG2' });
  assert.equal(b.merged, false);
  assert.notEqual(a.shift.id, b.shift.id);
});

test('createShift does NOT dedup into closed / fulfilled / cancelled shifts', () => {
  const db = freshDb();
  const a = db.createShift({ ...baseShift });
  // Manually flip status to cancelled (simulate a previously-cancelled shift).
  db.cancelShift(a.shift.id);
  const b = db.createShift({ ...baseShift });
  assert.equal(b.merged, false, 'cancelled shift must not be a merge target');
});

test('createShift merge prefers broadcast target over NONE', () => {
  const db = freshDb();
  db.createShift({ ...baseShift, target_type: 'NONE' });
  const b = db.createShift({ ...baseShift, target_type: 'ALL_POOL' });
  assert.equal(b.shift.target_type, 'ALL_POOL');
});

test('createShift merge extends deadline if the new one is later', () => {
  const db = freshDb();
  db.createShift({ ...baseShift, deadline: '2026-05-17T18:00:00Z' });
  const b = db.createShift({ ...baseShift, deadline: '2026-05-17T22:00:00Z' });
  assert.equal(b.shift.deadline, '2026-05-17T22:00:00Z');
});

test('cancelShift flips draft → cancelled', () => {
  const db = freshDb();
  const created = db.createShift({ ...baseShift });
  const cancelled = db.cancelShift(created.shift.id);
  assert.equal(cancelled.status, 'cancelled');
});

test('cancelShift on an unknown id returns null', () => {
  const db = freshDb();
  assert.equal(db.cancelShift('does-not-exist'), null);
});

test('cancelShift is idempotent on already-cancelled shifts', () => {
  const db = freshDb();
  const created = db.createShift({ ...baseShift });
  db.cancelShift(created.shift.id);
  const second = db.cancelShift(created.shift.id);
  assert.equal(second.status, 'cancelled');
});

test('findShift returns the shift by id without company filter', () => {
  const db = freshDb();
  const created = db.createShift({ ...baseShift });
  assert.equal(db.findShift(created.shift.id).id, created.shift.id);
  assert.equal(db.findShift('nope'), null);
});

test('listAvailabilitiesBulk filters by employee + date window', () => {
  const db = freshDb();
  db.createAvailability({
    employee_id: 'E1',
    date: '2026-05-18',
    from_time: '09:00',
    to_time: '17:00',
    status: 'open',
    locked_by_contract_id: null,
  });
  db.createAvailability({
    employee_id: 'E2',
    date: '2026-05-25',
    from_time: '09:00',
    to_time: '17:00',
    status: 'open',
    locked_by_contract_id: null,
  });
  const inWeek = db.listAvailabilitiesBulk(['E1', 'E2'], '2026-05-18', '2026-05-22');
  assert.equal(inWeek.length, 1);
  assert.equal(inWeek[0].employee_id, 'E1');

  const empty = db.listAvailabilitiesBulk([], '2026-05-18', '2026-05-22');
  assert.equal(empty.length, 0);
});

test('seedDemo creates 3 service groups, 2 permanent employees, and patterned availabilities', () => {
  const db = freshDb();
  const res = db.seedDemo({
    companyId: 'C1',
    branchGroupIds: ['BR1'],
    employeeIds: ['E1', 'E2', 'E3', 'E4'],
  });
  assert.equal(res.skipped, false);
  assert.equal(res.created.serviceGroups.length, 3);
  assert.equal(res.created.permanentEmployees.length, 2);
  assert.ok(res.created.availabilities > 0, 'expected availability rows to be seeded');
});

test('seedDemo skips when the company is already seeded', () => {
  const db = freshDb();
  db.seedDemo({ companyId: 'C1', branchGroupIds: ['BR1'], employeeIds: ['E1'] });
  const second = db.seedDemo({
    companyId: 'C1',
    branchGroupIds: ['BR1'],
    employeeIds: ['E1'],
  });
  assert.equal(second.skipped, true);
});

// -- gap 4: deleteAvailability state machine --

test('deleteAvailability removes an open row', () => {
  const db = freshDb();
  const av = db.createAvailability({
    employee_id: 'E1',
    date: '2026-05-18',
    from_time: '09:00',
    to_time: '17:00',
    status: 'open',
    locked_by_contract_id: null,
  });
  assert.equal(db.deleteAvailability(av.id), true);
  assert.equal(db.listAvailabilities('E1').length, 0);
});

test('deleteAvailability returns false on unknown id', () => {
  const db = freshDb();
  assert.equal(db.deleteAvailability('not-a-real-id'), false);
});

test('deleteAvailability refuses locked rows (already promoted to a contract)', () => {
  const db = freshDb();
  const av = db.createAvailability({
    employee_id: 'E1',
    date: '2026-05-18',
    from_time: '09:00',
    to_time: '17:00',
    status: 'locked',
    locked_by_contract_id: 'C-1',
  });
  assert.equal(db.deleteAvailability(av.id), false);
  assert.equal(db.listAvailabilities('E1').length, 1, 'locked row must stay');
});

// -- gap 3: touchMyStafflerLogin --

test('touchMyStafflerLogin bumps every active invite for the employee', () => {
  const db = freshDb();
  // Two companies, both with an active invite for E1 — last_login_at
  // starts null because we don't pass it to upsert.
  db.upsertMyStafflerInvite('E1', 'C1', { status: 'active', accepted_at: '2026-05-01T08:00:00Z' });
  db.upsertMyStafflerInvite('E1', 'C2', { status: 'active', accepted_at: '2026-05-01T08:00:00Z' });
  // And one INVITED row that should NOT be bumped (employee hasn't logged in there yet).
  db.upsertMyStafflerInvite('E1', 'C3', { status: 'invited' });
  assert.equal(db.getMyStafflerInvite('E1', 'C1').last_login_at, null, 'baseline: active row is null before touch');

  db.touchMyStafflerLogin('E1');

  const a = db.getMyStafflerInvite('E1', 'C1');
  const b = db.getMyStafflerInvite('E1', 'C2');
  const c = db.getMyStafflerInvite('E1', 'C3');
  assert.ok(
    typeof a.last_login_at === 'string' && a.last_login_at.endsWith('Z'),
    'active invite C1 was stamped with an ISO',
  );
  assert.ok(
    typeof b.last_login_at === 'string' && b.last_login_at.endsWith('Z'),
    'active invite C2 was stamped with an ISO',
  );
  assert.equal(c.last_login_at, null, 'invited row stays null');
});

test('touchMyStafflerLogin is a no-op for unknown employees', () => {
  const db = freshDb();
  // No mystaffler rows for E1 — call must not throw, must not touch anything.
  db.touchMyStafflerLogin('E1');
  assert.equal(db.listMyStafflerInvites('C1').length, 0);
});

// -- gap 2: opening hours --

test('createServiceGroup defaults opening_hours to {} when omitted', () => {
  const db = freshDb();
  const sg = db.createServiceGroup({
    company_id: 'C1',
    branch_group_id: 'BR1',
    name: 'Toog',
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
  });
  assert.deepEqual(sg.opening_hours, {});
});

test('createServiceGroup persists opening_hours payload as-is', () => {
  const db = freshDb();
  const oh = {
    1: { from: '09:00', to: '17:00' },
    2: { from: '09:00', to: '17:00' },
    3: null,
    7: { from: '10:00', to: '14:00' },
  };
  const sg = db.createServiceGroup({
    company_id: 'C1',
    branch_group_id: 'BR1',
    name: 'Bar',
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
    opening_hours: oh,
  });
  assert.deepEqual(sg.opening_hours[1], { from: '09:00', to: '17:00' });
  assert.equal(sg.opening_hours[3], null);
  assert.deepEqual(sg.opening_hours[7], { from: '10:00', to: '14:00' });
});

test('updateServiceGroup can replace opening_hours partially', () => {
  const db = freshDb();
  const sg = db.createServiceGroup({
    company_id: 'C1',
    branch_group_id: 'BR1',
    name: 'Toog',
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
    opening_hours: { 1: { from: '09:00', to: '17:00' } },
  });
  const next = { 1: { from: '08:00', to: '20:00' }, 5: { from: '12:00', to: '23:00' } };
  const updated = db.updateServiceGroup(sg.id, { opening_hours: next });
  assert.deepEqual(updated.opening_hours[1], { from: '08:00', to: '20:00' });
  assert.deepEqual(updated.opening_hours[5], { from: '12:00', to: '23:00' });
});

process.on('exit', () => {
  try {
    rmSync(buildDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});
