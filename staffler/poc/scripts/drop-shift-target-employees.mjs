#!/usr/bin/env node
/**
 * One-shot cleanup: clear `target_employee_ids` from every PoC shift row.
 *
 * Pilot directive 2026-05-19: a flex employee pinned to a slot is a DPS
 * *contract*, not a PoC-DB shadow row. Prior to fix(server)/proxy-flex-
 * contracts the planning grid painted `shifts.target_employee_ids` as
 * "filled contract" blocks, producing the symptom "5 contracts on
 * localhost vs 0 on DPS QA". The server now strips the field on
 * write; this script wipes the historical residue.
 *
 * Backends:
 *  - POC_DB_BACKEND="postgres" (or DATABASE_URL set) → run UPDATE on the
 *    `shifts` table.
 *  - otherwise → rewrite `data/poc-db.json` in place.
 *
 * Behaviour:
 *  - Idempotent: re-runs on already-clean rows are a no-op.
 *  - Counts and reports the number of rows actually changed.
 *  - target_type=SELECTION → downgraded to NONE (a SELECTION shift
 *    without targets is meaningless and would silently surface to
 *    nobody in mystaffler).
 *
 * Usage:
 *   node scripts/drop-shift-target-employees.mjs
 *   POC_DB_BACKEND=postgres DATABASE_URL=... node scripts/drop-shift-target-employees.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const useBackend =
  process.env.POC_DB_BACKEND === 'postgres' || (process.env.DATABASE_URL && process.env.POC_DB_BACKEND !== 'json')
    ? 'postgres'
    : 'json';

if (useBackend === 'json') {
  const jsonPath = resolve(repoRoot, 'data', 'poc-db.json');
  let raw;
  try {
    raw = readFileSync(jsonPath, 'utf8');
  } catch (err) {
    console.error(`✗ cannot read ${jsonPath}: ${err.message}`);
    process.exit(2);
  }
  const db = JSON.parse(raw);
  const shifts = Array.isArray(db.shifts) ? db.shifts : [];
  let cleared = 0;
  let downgraded = 0;
  for (const s of shifts) {
    const had = Array.isArray(s.target_employee_ids) && s.target_employee_ids.length > 0;
    if (had) {
      s.target_employee_ids = [];
      cleared++;
    }
    if (s.target_type === 'SELECTION') {
      s.target_type = 'NONE';
      downgraded++;
    }
  }
  if (cleared === 0 && downgraded === 0) {
    console.log('✓ JSON store: already clean (0 shadow rows).');
    process.exit(0);
  }
  writeFileSync(jsonPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`✓ JSON store: cleared target_employee_ids on ${cleared} shift(s), downgraded ${downgraded} SELECTION → NONE.`);
  process.exit(0);
}

// Postgres path.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (POC_DB_BACKEND=postgres). Export it and retry.');
  process.exit(2);
}

let Client;
try {
  ({ Client } = await import('pg'));
} catch {
  console.error("Cannot find module 'pg'. Run `npm install pg` first.");
  process.exit(2);
}

const client = new Client({
  connectionString: url,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();
console.log(`→ connected to ${url.replace(/:\/\/[^@]+@/, '://***@')}`);

try {
  await client.query('BEGIN');
  const clearRes = await client.query(
    `UPDATE shifts
       SET target_employee_ids = ARRAY[]::TEXT[]
     WHERE array_length(target_employee_ids, 1) > 0`,
  );
  const downgradeRes = await client.query(
    `UPDATE shifts
       SET target_type = 'NONE'
     WHERE target_type = 'SELECTION'`,
  );
  await client.query('COMMIT');
  console.log(
    `✓ Postgres: cleared target_employee_ids on ${clearRes.rowCount} shift(s), downgraded ${downgradeRes.rowCount} SELECTION → NONE.`,
  );
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error(`✗ failed: ${err.message}`);
  await client.end();
  process.exit(1);
}

await client.end();
