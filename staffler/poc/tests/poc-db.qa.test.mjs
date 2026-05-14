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

process.on('exit', () => {
  try {
    rmSync(buildDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});
