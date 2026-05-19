import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * PoC-DB schema integrity.
 *
 * The store is JSON-file-backed (`src/store/poc-db.ts`) and consumed by
 * dozens of routes in `src/server/index.ts` plus the frontend's
 * snake_case API models. A rename on one side without the other
 * silently drops data — the row writes "successfully", reads return
 * an object with the field missing, and the planning grid renders an
 * empty cell with no error. These tests pin each table's columns +
 * cross-reference them against the server's free-text usage so that
 * class of bug is caught at test time.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const db = readFileSync(resolve(repo, 'src/store/poc-db.ts'), 'utf8');
const server = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');

function expectKeys(src, keys, label) {
  for (const k of keys) {
    assert.match(
      src,
      new RegExp(`(^|\\W)${k}\\??:`),
      `${label}.${k} should still exist`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Table interfaces. Locks the column list per table.
// ───────────────────────────────────────────────────────────────────────────

test('ServiceLocation table — vestiging row shape', () => {
  expectKeys(
    db,
    [
      'id',
      'company_id',
      'branch_group_id',
      'name',
      'address_line1',
      'address_line2',
      'postal_code',
      'city',
      'opening_hours',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    'ServiceLocation',
  );
});

test('PermanentEmployee + PermanentBlock shapes', () => {
  expectKeys(
    db,
    ['id', 'company_id', 'first_name', 'last_name', 'deleted_at', 'created_at', 'updated_at'],
    'PermanentEmployee',
  );
  expectKeys(
    db,
    [
      'id',
      'company_id',
      'permanent_employee_id',
      'date_from',
      'date_to',
      'from_time',
      'to_time',
      'created_at',
      'updated_at',
    ],
    'PermanentBlock',
  );
});

test('Shift table keeps every column the planning grid + share dialog use', () => {
  expectKeys(
    db,
    [
      'id',
      'company_id',
      'service_location_id',
      'date_from',
      'date_to',
      'from_time',
      'to_time',
      'pause_from',
      'pause_to',
      'capacity',
      'deadline',
      'target_type',
      'target_employee_ids',
      'target_group_ids',
      'status',
      'published_at',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ],
    'Shift',
  );
  // Status union — the planning grid uses these literals to paint the
  // open-shift block class (poc-event-shift-${status}).
  for (const s of [`"draft"`, `"open"`, `"closed"`, `"fulfilled"`, `"cancelled"`]) {
    assert.ok(db.includes(s), `Shift.status union must include ${s}`);
  }
});

test('ShiftApplication table — the niveau-2 application lifecycle row', () => {
  expectKeys(
    db,
    [
      'id',
      'shift_id',
      'employee_id',
      'status',
      'applied_at',
      'decided_at',
      'contract_id',
      'note',
    ],
    'ShiftApplication',
  );
  for (const s of [`"candidate"`, `"selected"`, `"rejected"`, `"withdrawn"`]) {
    assert.ok(db.includes(s), `ShiftApplication.status union must include ${s}`);
  }
});

test('Availability + status union (open/locked/withdrawn/expired)', () => {
  expectKeys(
    db,
    [
      'id',
      'employee_id',
      'date',
      'from_time',
      'to_time',
      'status',
      'locked_by_contract_id',
      'created_at',
      'updated_at',
    ],
    'Availability',
  );
  for (const s of [`"open"`, `"locked"`, `"withdrawn"`, `"expired"`]) {
    assert.ok(db.includes(s), `Availability.status union must include ${s}`);
  }
});

test('FcmToken row shape — PoC-only push-token store (BCJ-19517)', () => {
  // After BCJ-19425 the invite/account-status fields moved upstream;
  // only the FCM device token still lives PoC-side, in its own table.
  expectKeys(
    db,
    ['employee_id', 'token', 'subscribed_at'],
    'FcmToken',
  );
});

// ───────────────────────────────────────────────────────────────────────────
// DbShape — the persisted-JSON top-level keys MUST match the table types,
// or the file load throws a key-not-found at boot.
// ───────────────────────────────────────────────────────────────────────────

test('DbShape lists every table the rest of poc-db.ts reads/writes', () => {
  for (const k of [
    'service_locations',
    'permanent_employees',
    'permanent_blocks',
    'shifts',
    'shift_applications',
    'availabilities',
    'fcm_tokens',
  ]) {
    assert.match(db, new RegExp(`${k}:\\s*\\w`), `DbShape.${k} should be a top-level table`);
  }
  // emptyDb() returns one empty array per top-level table — keeps fresh
  // installs from crashing on first read.
  for (const k of [
    'service_locations',
    'permanent_employees',
    'permanent_blocks',
    'shifts',
    'shift_applications',
    'availabilities',
    'fcm_tokens',
  ]) {
    assert.match(db, new RegExp(`${k}:\\s*\\[\\]`), `emptyDb().${k} must default to []`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Cross-reference: the server's free-text usage of column names lines up
// with the table interfaces. If a server route references `s.employeeId`
// (instead of `s.employee_id`) the row write/read drops the value.
// ───────────────────────────────────────────────────────────────────────────

test('Server + store use the documented snake_case columns (no camelCase drift)', () => {
  // After the raw()-to-typed-methods cutover, the targeting filter +
  // shift/SL joins moved out of server.ts and into the store layer
  // (poc-db.ts, poc-db-pg.ts). The snake_case invariant is the same;
  // we just check both files now.
  const storeJson = readFileSync(resolve(repo, 'src/store/poc-db.ts'), 'utf8');
  const storePg = readFileSync(resolve(repo, 'src/store/poc-db-pg.ts'), 'utf8');
  const combined = server + '\n' + storeJson + '\n' + storePg;
  for (const col of [
    's.target_employee_ids',
    's.service_location_id',
    's.from_time',
    's.to_time',
    's.date_from',
    'a.shift_id',
    'a.status',
  ]) {
    assert.ok(
      combined.includes(col),
      `server/store should reference ${col} on a poc-db row`,
    );
  }
  // And the inverse — none of these camelCase forms should appear as a
  // poc-db column access. Word-boundary match (`\b`) so we don't false-
  // positive on legitimate camelCase method parameters like
  // `params.serviceLocationId` (a query input — different kind of variable).
  for (const bad of [
    'targetEmployeeIds',
    'fromTime',
    'toTime',
    'dateFrom',
  ]) {
    const camelOnRow = new RegExp(`\\b[sa]\\.${bad}\\b`);
    assert.ok(
      !camelOnRow.test(combined),
      `server/store must NOT reference [sa].${bad} (PoC-DB rows are snake_case)`,
    );
  }
});

test('Server exports listShifts that augments rows with applications_count', () => {
  // The augmentation is the contract the frontend's planning grid relies on.
  assert.match(db, /listShifts\(/);
  assert.match(db, /applications_count:\s*counts\.get\(s\.id\)\s*\?\?\s*0/);
  // Counts only include positive reactions (candidate/selected), not
  // withdrawn/rejected — the operator's magenta badge would be misleading
  // otherwise.
  assert.match(db, /Only candidate \/ selected applications count as "positive reaction"/);
});
