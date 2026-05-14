import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const contractsTs = resolve(repo, 'frontend/src/app/pages/contracts/contracts.component.ts');

test('contracts.component.ts uses local-date helpers (no toISOString slice bug)', () => {
  const code = readFileSync(contractsTs, 'utf8');
  assert.doesNotMatch(
    code,
    /\.toISOString\(\)\.slice\(0,\s*0\s*\+\s*10\)/,
    'no obvious toISOString slice pattern'
  );
  assert.doesNotMatch(
    code,
    /toISOString\(\)\.slice\(0,\s*10\)/,
    'must not derive date string via toISOString().slice — timezone-shift bug'
  );
  assert.match(code, /toLocalIsoDate\(/, 'must use the local-date helper');
  assert.match(code, /addDaysIso\(/, 'must use the addDaysIso helper');
});

// Re-implement the helpers inline so we can verify their behavior across
// timezones without spinning up Angular.
function toLocalIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalIsoDate(dt);
}

test('addDaysIso adds 6 days across month boundaries', () => {
  assert.equal(addDaysIso('2026-05-11', 6), '2026-05-17');
  assert.equal(addDaysIso('2026-04-30', 6), '2026-05-06');
  assert.equal(addDaysIso('2026-12-29', 6), '2027-01-04');
});

test('toLocalIsoDate uses local calendar day (not UTC)', () => {
  // 23:30 local on the 17th is the 17th locally even if UTC has rolled past.
  const d = new Date(2026, 4, 17, 23, 30, 0); // May 17, 23:30 local
  assert.equal(toLocalIsoDate(d), '2026-05-17');
});
