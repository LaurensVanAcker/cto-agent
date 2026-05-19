#!/usr/bin/env node
// Wipe and re-seed the LOCAL PoC database with a clean example dataset.
//
// Scope:
//   - Operates ONLY on `data/poc-db.json` (the JSON-file backend behind
//     `src/store/poc-db.ts`). The repo also ships `ruvector.db`, but that
//     is an embeddings sidecar (`file ruvector.db` → "data", not SQLite)
//     and not part of the PoC business store, so we leave it alone.
//   - Touches NO network endpoints. The DPS gateway / upstream is not
//     called. This is pure local cleanup.
//
// What gets wiped (per `DbShape` in src/store/poc-db.ts):
//   service_locations, permanent_employees, permanent_blocks,
//   shifts, shift_applications, availabilities, fcm_tokens
//
// Stale keys still found in old JSON files are dropped too:
//   service_groups (legacy rename target of service_locations),
//   permanent_assignments (never declared in DbShape, leaked in somewhere),
//   mystaffler_invites (pre-BCJ-19425 cutover).
//
// What gets seeded:
//   - 2 service-locations under 1 branch ("Toog", "Kassa")
//   - 1 permanent employee with 1 vast blok this week (Mon 09–17)
//   - 1 open shift next Monday 18–23 targeting ALL_POOL
//   - 0 availabilities / shift_applications / fcm_tokens
//     (availabilities depend on real DPS employee ids and will be
//      re-populated by the existing seedDemo endpoint when the operator
//      re-runs it from the UI).
//
// Linkage:
//   We preserve the `company_id` and the first non-deleted
//   `branch_group_id` from the existing PoC-DB so the seeded rows still
//   point at the pilot's real DPS vestiging. If those can't be found we
//   fall back to fresh UUIDs (with a warning) — re-running `seedDemo`
//   from the UI will fix the linkage on the next call.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "data");
const DB_FILE = join(DATA_DIR, "poc-db.json");

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readExistingDb() {
  if (!existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    console.warn(`[wipe-and-seed] could not parse existing ${DB_FILE}: ${err.message}`);
    return null;
  }
}

function countsOf(db) {
  if (!db || typeof db !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(db)) {
    if (Array.isArray(v)) out[k] = v.length;
  }
  return out;
}

function pickLinkage(existing) {
  // Try to keep the pilot's real DPS linkage so the seeded SLs are still
  // useful in the UI. Falls back to fresh UUIDs if the file is empty.
  const slList = Array.isArray(existing?.service_locations)
    ? existing.service_locations
    : Array.isArray(existing?.service_groups)
      ? existing.service_groups
      : [];
  const activeSl = slList.find((s) => s && !s.deleted_at) ?? slList[0];
  const peList = Array.isArray(existing?.permanent_employees) ? existing.permanent_employees : [];
  const activePe = peList.find((e) => e && !e.deleted_at) ?? peList[0];

  const companyId = activeSl?.company_id ?? activePe?.company_id ?? null;
  const branchGroupId = activeSl?.branch_group_id ?? null;
  return { companyId, branchGroupId, hadLinkage: Boolean(companyId && branchGroupId) };
}

function isoDateOffset(daysFromToday) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** Return offset (in days) from today to the next Monday (or today if today is Mon). */
function offsetToNextMonday() {
  const today = new Date();
  // getUTCDay: Sun=0, Mon=1, ... Sat=6
  const dow = today.getUTCDay();
  // ISO weekday Mon=1: distance to next Mon (or today if already Mon).
  return dow === 1 ? 0 : (8 - dow) % 7 || 7;
}

function buildSeed({ companyId, branchGroupId }) {
  const now = new Date().toISOString();
  const cid = companyId ?? randomUUID();
  const bid = branchGroupId ?? randomUUID();

  const slToog = {
    id: randomUUID(),
    company_id: cid,
    branch_group_id: bid,
    name: "Toog",
    address_line1: "Dok Noord 4F",
    address_line2: null,
    postal_code: "9000",
    city: "Gent",
    opening_hours: {},
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  const slKassa = {
    id: randomUUID(),
    company_id: cid,
    branch_group_id: bid,
    name: "Kassa",
    address_line1: "Dok Noord 4F",
    address_line2: null,
    postal_code: "9000",
    city: "Gent",
    opening_hours: {},
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  const permEmp = {
    id: randomUUID(),
    company_id: cid,
    first_name: "Jeff",
    last_name: "Callebaut",
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  // 1 vast blok: this Monday 09:00 – 17:00.
  const mondayOffset = offsetToNextMonday();
  // Anchor "this week's Monday" — if today is Tue..Sun we want the
  // already-past Mon; if today is Mon, use today. offsetToNextMonday()
  // returns 0 if today is Mon, otherwise the *next* Mon. For the vast
  // blok we'd rather pick "this week's Mon" so the planning grid lights
  // up immediately, so when offsetToNextMonday() > 0 we step back 7 days.
  const thisWeekMondayOffset = mondayOffset === 0 ? 0 : mondayOffset - 7;
  const blokDate = isoDateOffset(thisWeekMondayOffset);

  const permBlock = {
    id: randomUUID(),
    company_id: cid,
    permanent_employee_id: permEmp.id,
    date_from: blokDate,
    date_to: blokDate,
    from_time: "09:00",
    to_time: "17:00",
    created_at: now,
    updated_at: now,
  };

  // 1 open shift: next Monday 18:00 – 23:00 at "Toog".
  const nextMondayOffset = offsetToNextMonday() === 0 ? 7 : offsetToNextMonday();
  const shiftDate = isoDateOffset(nextMondayOffset);
  const deadlineDate = isoDateOffset(nextMondayOffset - 1);
  const shift = {
    id: randomUUID(),
    company_id: cid,
    service_location_id: slToog.id,
    date_from: shiftDate,
    date_to: shiftDate,
    from_time: "18:00",
    to_time: "23:00",
    pause_from: null,
    pause_to: null,
    capacity: 2,
    deadline: `${deadlineDate}T21:00`,
    target_type: "ALL_POOL",
    target_employee_ids: [],
    target_group_ids: [],
    status: "open",
    published_at: now,
    created_by_user_id: null,
    created_at: now,
    updated_at: now,
  };

  return {
    service_locations: [slToog, slKassa],
    permanent_employees: [permEmp],
    permanent_blocks: [permBlock],
    shifts: [shift],
    shift_applications: [],
    availabilities: [],
    fcm_tokens: [],
  };
}

function main() {
  const existing = readExistingDb();
  const before = countsOf(existing);
  console.log("[wipe-and-seed] before:", JSON.stringify(before));

  // Backup (best-effort) — kept inside data/ which is gitignored.
  if (existing && existsSync(DB_FILE)) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const backupFile = join(DATA_DIR, `.backup-${ts()}.poc-db.json`);
    try {
      copyFileSync(DB_FILE, backupFile);
      console.log(`[wipe-and-seed] backup written: ${backupFile}`);
    } catch (err) {
      console.warn(`[wipe-and-seed] backup failed (continuing): ${err.message}`);
    }
  }

  const linkage = pickLinkage(existing);
  if (!linkage.hadLinkage) {
    console.warn(
      "[wipe-and-seed] no existing company_id / branch_group_id found — " +
        "seeding with fresh UUIDs. Re-run the /api/poc-seed endpoint from the " +
        "UI to relink with the pilot's real DPS vestiging.",
    );
  } else {
    console.log(
      `[wipe-and-seed] preserving linkage: company_id=${linkage.companyId} ` +
        `branch_group_id=${linkage.branchGroupId}`,
    );
  }

  const seeded = buildSeed(linkage);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(seeded, null, 2), "utf-8");

  const after = countsOf(seeded);
  console.log("[wipe-and-seed] after:", JSON.stringify(after));
  console.log("[wipe-and-seed] done.");
}

main();
