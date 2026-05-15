// PoC in-memory store, JSON-file-backed for survival across `tsx watch`
// reloads. Replace with Heroku Postgres in v1 (see staffler/poc/PLAN.md).
//
// Six tables per PLAN.md:
//   service_groups, permanent_employees, permanent_assignments,
//   shifts, shift_applications, availabilities
//
// All rows are plain JSON objects. The store keeps everything in one
// file on disk (`data/poc-db.json`) so devs can poke at it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "..", "data");
const DB_FILE = join(DATA_DIR, "poc-db.json");

/**
 * Per-weekday opening window. `null` for a weekday means "gesloten op die
 * dag"; presence of a non-null entry on every key (1..7, ISO weekday) is
 * not required — missing keys also mean "gesloten". Keep `from` < `to`.
 */
export interface OpeningHoursDay {
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
}
export type OpeningHours = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, OpeningHoursDay | null>>;

export interface ServiceGroup {
  id: string;
  company_id: string;
  branch_group_id: string; // ref to DPS EngagementGroup id
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  /** Per-weekday opening hours. Null on a key (or missing key) means
   *  "gesloten". Per mockup 14: optional, defaults to {} on creation. */
  opening_hours: OpeningHours;
  deleted_at: string | null; // ISO timestamp or null
  created_at: string;
  updated_at: string;
}

export interface PermanentEmployee {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermanentAssignment {
  id: string;
  service_group_id: string;
  permanent_employee_id: string;
  weekday_pattern: Record<
    string,
    { from: string; to: string; pauseFrom?: string; pauseTo?: string }
  >;
  valid_from: string; // ISO date
  valid_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Flat "vast blok" — single date range + single hour range, no recurrence.
 * Created from the planning grid's empty-cell click on a permanent-employee
 * row (Names view). PoC-DB only, no Dimona.
 */
export interface PermanentBlock {
  id: string;
  company_id: string;
  permanent_employee_id: string;
  date_from: string; // ISO date
  date_to: string;   // ISO date (inclusive)
  from_time: string; // HH:mm
  to_time: string;   // HH:mm
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  company_id: string;
  service_group_id: string;
  date_from: string;
  date_to: string;
  from_time: string;
  to_time: string;
  pause_from: string | null;
  pause_to: string | null;
  capacity: number;
  deadline: string | null;
  target_type: "ALL_POOL" | "SELECTION" | "GROUP" | "NONE";
  target_employee_ids: string[];
  target_group_ids: string[];
  status: "draft" | "open" | "closed" | "fulfilled" | "cancelled";
  published_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftApplication {
  id: string;
  shift_id: string;
  employee_id: string;
  status: "candidate" | "selected" | "rejected" | "withdrawn";
  applied_at: string;
  decided_at: string | null;
  contract_id: string | null;
  note: string | null;
}

export interface Availability {
  id: string;
  employee_id: string;
  date: string;
  from_time: string;
  to_time: string;
  status: "open" | "locked" | "withdrawn" | "expired";
  locked_by_contract_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MyStafflerStatus = "invited" | "active";

/** BCJ-19425 — MyStaffler invite/account status per employee per company.
 *  This is a PoC-DB shim because DPS does not expose the status field on
 *  /api/employees yet. v1 will read it from the real Staffler endpoint. */
export interface MyStafflerInvite {
  id: string;
  employee_id: string;
  company_id: string;
  status: MyStafflerStatus;
  invited_at: string;
  accepted_at: string | null;
  last_login_at: string | null;
  /** FCM registration token if the employee accepted push permissions
   *  on their device. `null` = not subscribed yet. Stored per-invite
   *  (per-company) so an employee with multiple memberships can have
   *  different devices subscribed for different companies (though in
   *  practice it'll be the same token everywhere). */
  fcm_token?: string | null;
  fcm_subscribed_at?: string | null;
}

interface DbShape {
  service_groups: ServiceGroup[];
  permanent_employees: PermanentEmployee[];
  permanent_assignments: PermanentAssignment[];
  permanent_blocks: PermanentBlock[];
  shifts: Shift[];
  shift_applications: ShiftApplication[];
  availabilities: Availability[];
  mystaffler_invites: MyStafflerInvite[];
}

function emptyDb(): DbShape {
  return {
    service_groups: [],
    permanent_employees: [],
    permanent_assignments: [],
    permanent_blocks: [],
    shifts: [],
    shift_applications: [],
    availabilities: [],
    mystaffler_invites: [],
  };
}

class PocDb {
  private data: DbShape;

  constructor() {
    this.data = this.load();
  }

  private load(): DbShape {
    if (!existsSync(DB_FILE)) return emptyDb();
    try {
      const raw = readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      const merged = { ...emptyDb(), ...parsed };
      // Migrations for fields added after the initial PoC-DB shape was
      // persisted. We keep these cheap — service-group rows on disk
      // pre-dated `opening_hours`, so default to {} (= gesloten elke dag,
      // operator vult invult).
      for (const sg of merged.service_groups) {
        if (!sg.opening_hours) sg.opening_hours = {};
      }
      return merged;
    } catch {
      return emptyDb();
    }
  }

  private save(): void {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
  }

  // -- service_groups --

  listServiceGroups(companyId: string): ServiceGroup[] {
    return this.data.service_groups
      .filter((g) => g.company_id === companyId && !g.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getServiceGroup(id: string): ServiceGroup | undefined {
    return this.data.service_groups.find((g) => g.id === id && !g.deleted_at);
  }

  createServiceGroup(
    input: Omit<ServiceGroup, "id" | "deleted_at" | "created_at" | "updated_at" | "opening_hours"> & {
      opening_hours?: OpeningHours;
    },
  ): ServiceGroup {
    const now = new Date().toISOString();
    const { opening_hours, ...rest } = input;
    const row: ServiceGroup = {
      id: randomUUID(),
      deleted_at: null,
      created_at: now,
      updated_at: now,
      opening_hours: opening_hours ?? {},
      ...rest,
    };
    this.data.service_groups.push(row);
    this.save();
    return row;
  }

  updateServiceGroup(
    id: string,
    patch: Partial<Omit<ServiceGroup, "id" | "created_at" | "company_id">>,
  ): ServiceGroup | null {
    const row = this.data.service_groups.find((g) => g.id === id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    this.save();
    return row;
  }

  softDeleteServiceGroup(id: string): boolean {
    const row = this.data.service_groups.find((g) => g.id === id);
    if (!row || row.deleted_at) return false;
    row.deleted_at = new Date().toISOString();
    row.updated_at = row.deleted_at;
    this.save();
    return true;
  }

  // -- permanent_employees (stub, used by later steps) --

  listPermanentEmployees(companyId: string): PermanentEmployee[] {
    return this.data.permanent_employees
      .filter((e) => e.company_id === companyId && !e.deleted_at)
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
      );
  }

  createPermanentEmployee(
    input: Omit<PermanentEmployee, "id" | "deleted_at" | "created_at" | "updated_at">,
  ): PermanentEmployee {
    const now = new Date().toISOString();
    const row: PermanentEmployee = {
      id: randomUUID(),
      deleted_at: null,
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.permanent_employees.push(row);
    this.save();
    return row;
  }

  // -- permanent_assignments --

  listPermanentAssignments(params: {
    companyId: string;
    serviceGroupId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): PermanentAssignment[] {
    const knownServiceGroupIds = new Set(
      this.data.service_groups
        .filter((g) => g.company_id === params.companyId)
        .map((g) => g.id),
    );
    return this.data.permanent_assignments.filter((a) => {
      if (!knownServiceGroupIds.has(a.service_group_id)) return false;
      if (params.serviceGroupId && a.service_group_id !== params.serviceGroupId) return false;
      if (params.dateTo && a.valid_from > params.dateTo) return false;
      if (params.dateFrom && a.valid_to && a.valid_to < params.dateFrom) return false;
      return true;
    });
  }

  createPermanentAssignment(
    input: Omit<PermanentAssignment, "id" | "created_at" | "updated_at">,
  ): PermanentAssignment {
    const now = new Date().toISOString();
    const row: PermanentAssignment = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.permanent_assignments.push(row);
    this.save();
    return row;
  }

  // -- permanent_blocks (Vast blokjes, flat date+hour ranges) --

  listPermanentBlocks(params: { companyId: string; dateFrom?: string; dateTo?: string }): PermanentBlock[] {
    return this.data.permanent_blocks.filter((b) => {
      if (b.company_id !== params.companyId) return false;
      if (params.dateFrom && b.date_to < params.dateFrom) return false;
      if (params.dateTo && b.date_from > params.dateTo) return false;
      return true;
    });
  }

  createPermanentBlock(
    input: Omit<PermanentBlock, "id" | "created_at" | "updated_at">,
  ): PermanentBlock {
    const now = new Date().toISOString();
    const row: PermanentBlock = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.permanent_blocks.push(row);
    this.save();
    return row;
  }

  deletePermanentBlock(id: string): boolean {
    const idx = this.data.permanent_blocks.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    this.data.permanent_blocks.splice(idx, 1);
    this.save();
    return true;
  }

  // -- shifts --

  /**
   * Shift list, augmented with `applications_count` so the planning grid
   * can render the magenta badge that represents how many pool members
   * have positively reacted to the open shift (mockup 11 — "+5" pill).
   * Cheaper than fetching applications per-shift on the client.
   */
  listShifts(
    companyId: string,
    dateFrom: string,
    dateTo: string,
  ): Array<Shift & { applications_count: number }> {
    const counts = new Map<string, number>();
    for (const a of this.data.shift_applications) {
      // Only candidate / selected applications count as "positive reaction".
      // Rejected and withdrawn shouldn't bump the badge.
      if (a.status !== "candidate" && a.status !== "selected") continue;
      counts.set(a.shift_id, (counts.get(a.shift_id) ?? 0) + 1);
    }
    return this.data.shifts
      .filter((s) => s.company_id === companyId && s.date_to >= dateFrom && s.date_from <= dateTo)
      .map((s) => ({ ...s, applications_count: counts.get(s.id) ?? 0 }));
  }

  createShift(
    input: Omit<Shift, "id" | "created_at" | "updated_at">,
  ): { shift: Shift; merged: boolean; mergedInto?: string } {
    const now = new Date().toISOString();

    // Pilot feedback (2026-05-14): if a new shift matches an existing
    // draft/open shift on the same service location + date + hours, the
    // operator almost always means "add more seats", not "create a near-
    // identical duplicate row". Merge instead of insert. Closed / fulfilled
    // / cancelled shifts are *not* candidates — those are historical and
    // re-using them would mutate audit-relevant state. We also leave
    // status untouched: a draft stays a draft, an open stays open.
    const dup = this.data.shifts.find(
      (s) =>
        (s.status === "draft" || s.status === "open") &&
        s.company_id === input.company_id &&
        s.service_group_id === input.service_group_id &&
        s.date_from === input.date_from &&
        s.date_to === input.date_to &&
        s.from_time === input.from_time &&
        s.to_time === input.to_time &&
        (s.pause_from ?? null) === (input.pause_from ?? null) &&
        (s.pause_to ?? null) === (input.pause_to ?? null),
    );
    if (dup) {
      const mergedTargetEmployees = Array.from(
        new Set([...(dup.target_employee_ids ?? []), ...(input.target_employee_ids ?? [])]),
      );
      const mergedTargetGroups = Array.from(
        new Set([...(dup.target_group_ids ?? []), ...(input.target_group_ids ?? [])]),
      );
      dup.capacity = (dup.capacity ?? 1) + (input.capacity ?? 1);
      dup.target_employee_ids = mergedTargetEmployees;
      dup.target_group_ids = mergedTargetGroups;
      // If either side broadcast (target_type !== NONE), prefer that side
      // so the resulting shift keeps its broadcast wiring.
      if (dup.target_type === "NONE" && input.target_type !== "NONE") {
        dup.target_type = input.target_type;
      }
      // The latest deadline wins — operators typically extend, not shrink.
      if (input.deadline && (!dup.deadline || input.deadline > dup.deadline)) {
        dup.deadline = input.deadline;
      }
      dup.updated_at = now;
      this.save();
      return { shift: dup, merged: true, mergedInto: dup.id };
    }

    const row: Shift = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.shifts.push(row);
    this.save();
    return { shift: row, merged: false };
  }

  /** Lookup a single shift by id without filtering by company. Used by
   *  routes that already authenticated the caller and just need to
   *  disambiguate 404 vs 409. */
  findShift(id: string): Shift | null {
    return this.data.shifts.find((s) => s.id === id) ?? null;
  }

  /**
   * Cancel a shift. Only draft / open shifts may be cancelled — closed,
   * fulfilled or already-cancelled shifts are no-ops returning the
   * existing row unchanged so the route can disambiguate via the
   * returned status. Stores `cancel_reason` if provided for audit.
   */
  cancelShift(id: string, reason?: string | null): Shift | null {
    const row = this.data.shifts.find((s) => s.id === id);
    if (!row) return null;
    if (row.status === "cancelled") return row;
    if (row.status !== "draft" && row.status !== "open") return null;
    row.status = "cancelled";
    row.updated_at = new Date().toISOString();
    if (reason) {
      (row as Shift & { cancel_reason?: string }).cancel_reason = reason;
    }
    this.save();
    return row;
  }

  publishShift(id: string): Shift | null {
    const row = this.data.shifts.find((s) => s.id === id);
    if (!row) return null;
    row.status = "open";
    row.published_at = new Date().toISOString();
    row.updated_at = row.published_at;
    this.save();
    return row;
  }

  /**
   * Merge-patch a shift row in place. Used by the batch-share endpoint to
   * update target + deadline without having to round-trip a full Shift
   * payload from the frontend. Returns null if the id is unknown so the
   * caller can surface a 404 to the client.
   */
  patchShift(id: string, patch: Partial<Shift>): Shift | null {
    const row = this.data.shifts.find((s) => s.id === id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    this.save();
    return row;
  }

  // -- shift_applications --

  listApplicationsForEmployee(employeeId: string): ShiftApplication[] {
    return this.data.shift_applications.filter((a) => a.employee_id === employeeId);
  }

  listApplicationsForShift(shiftId: string): ShiftApplication[] {
    return this.data.shift_applications.filter((a) => a.shift_id === shiftId);
  }

  applyToShift(shiftId: string, employeeId: string, note?: string): ShiftApplication {
    const existing = this.data.shift_applications.find(
      (a) =>
        a.shift_id === shiftId &&
        a.employee_id === employeeId &&
        (a.status === "candidate" || a.status === "selected"),
    );
    if (existing) return existing;
    const row: ShiftApplication = {
      id: randomUUID(),
      shift_id: shiftId,
      employee_id: employeeId,
      status: "candidate",
      applied_at: new Date().toISOString(),
      decided_at: null,
      contract_id: null,
      note: note ?? null,
    };
    this.data.shift_applications.push(row);
    this.save();
    return row;
  }

  withdrawApplication(shiftId: string, employeeId: string): boolean {
    const row = this.data.shift_applications.find(
      (a) => a.shift_id === shiftId && a.employee_id === employeeId && a.status === "candidate",
    );
    if (!row) return false;
    row.status = "withdrawn";
    row.decided_at = new Date().toISOString();
    this.save();
    return true;
  }

  selectApplication(applicationId: string, contractId: string): ShiftApplication | null {
    const row = this.data.shift_applications.find((a) => a.id === applicationId);
    if (!row) return null;
    row.status = "selected";
    row.contract_id = contractId;
    row.decided_at = new Date().toISOString();
    this.save();
    return row;
  }

  // -- availabilities --

  listAvailabilities(employeeId: string, from?: string, to?: string): Availability[] {
    return this.data.availabilities.filter((a) => {
      if (a.employee_id !== employeeId) return false;
      if (from && a.date < from) return false;
      if (to && a.date > to) return false;
      return true;
    });
  }

  /** Bulk variant used by the planning grid to paint green hour-blocks
   *  across every visible employee in one round-trip. Returns rows whose
   *  employee_id is in the supplied set and date falls inside the window. */
  listAvailabilitiesBulk(employeeIds: string[], from?: string, to?: string): Availability[] {
    if (employeeIds.length === 0) return [];
    const set = new Set(employeeIds);
    return this.data.availabilities.filter((a) => {
      if (!set.has(a.employee_id)) return false;
      if (from && a.date < from) return false;
      if (to && a.date > to) return false;
      return true;
    });
  }

  createAvailability(
    input: Omit<Availability, "id" | "created_at" | "updated_at">,
  ): Availability {
    const now = new Date().toISOString();
    const row: Availability = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.availabilities.push(row);
    this.save();
    return row;
  }

  /** Delete an availability row. Returns true if removed, false if the
   *  id was unknown. Locked availabilities (already promoted to a
   *  contract) are kept — the underlying contract owns the slot now. */
  deleteAvailability(id: string): boolean {
    const idx = this.data.availabilities.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    if (this.data.availabilities[idx].status === "locked") return false;
    this.data.availabilities.splice(idx, 1);
    this.save();
    return true;
  }

  // -- mystaffler_invites --

  listMyStafflerInvites(companyId: string): MyStafflerInvite[] {
    return this.data.mystaffler_invites.filter((r) => r.company_id === companyId);
  }

  getMyStafflerInvite(employeeId: string, companyId: string): MyStafflerInvite | undefined {
    return this.data.mystaffler_invites.find(
      (r) => r.employee_id === employeeId && r.company_id === companyId,
    );
  }

  upsertMyStafflerInvite(
    employeeId: string,
    companyId: string,
    patch: Partial<Pick<MyStafflerInvite, "status" | "accepted_at" | "last_login_at">> = {},
  ): MyStafflerInvite {
    const now = new Date().toISOString();
    let row = this.getMyStafflerInvite(employeeId, companyId);
    if (!row) {
      row = {
        id: randomUUID(),
        employee_id: employeeId,
        company_id: companyId,
        status: patch.status ?? "invited",
        invited_at: now,
        accepted_at: patch.accepted_at ?? null,
        last_login_at: patch.last_login_at ?? null,
      };
      this.data.mystaffler_invites.push(row);
    } else {
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.accepted_at !== undefined) row.accepted_at = patch.accepted_at;
      if (patch.last_login_at !== undefined) row.last_login_at = patch.last_login_at;
      // If the row already exists and we're "re-inviting", refresh invited_at.
      if (patch.status === "invited") row.invited_at = now;
    }
    this.save();
    return row;
  }

  /** Store the FCM registration token for every invite this employee
   *  has (one row per company they work for). Returns the count of
   *  invites updated — zero means the employee has no invite rows
   *  yet, so the token is dropped. Subsequent calls overwrite; that
   *  matches FCM where a single device → single token, even though
   *  the token can rotate. */
  storeFcmToken(employeeId: string, token: string): number {
    const now = new Date().toISOString();
    let n = 0;
    for (const inv of this.data.mystaffler_invites) {
      if (inv.employee_id !== employeeId) continue;
      inv.fcm_token = token;
      inv.fcm_subscribed_at = now;
      n++;
    }
    if (n > 0) this.save();
    return n;
  }

  /** Bump `last_login_at` on every active invite for this employee.
   *  Called from the MyStaffler-side read endpoints so the company-side
   *  Pool "Last login" column reflects when the uitzendkracht actually
   *  used their view, instead of being frozen at invite-accepted time.
   *  Only flips invites that are already `active` — `invited` rows
   *  stay at null (they shouldn't have logged in yet). */
  touchMyStafflerLogin(employeeId: string): void {
    const now = new Date().toISOString();
    let dirty = false;
    for (const inv of this.data.mystaffler_invites) {
      if (inv.employee_id !== employeeId) continue;
      if (inv.status !== "active") continue;
      inv.last_login_at = now;
      dirty = true;
    }
    if (dirty) this.save();
  }

  // -- raw access for stats/debug --

  raw(): DbShape {
    return this.data;
  }

  /** Wipe all PoC-DB tables. Used by the /api/poc-reset endpoint for
   *  demo / test runs. Does NOT affect the DPS gateway in any way. */
  reset(): void {
    this.data = emptyDb();
    this.save();
  }

  /** Seed a minimal PoC dataset for a given company (called from the demo
   *  endpoint). Idempotent-ish: skips creation if the company already has
   *  service-groups or permanent employees. Takes an optional list of DPS
   *  engagement-group ids so the seeded service-locations point at real
   *  vestigingen. */
  seedDemo(input: {
    companyId: string;
    branchGroupIds: string[];
    /** DPS employee ids for the company, used to seed a varied set of
     *  availability blocks (this week + next week) so the Names grid
     *  shows green hour-blocks per pilot feedback 2026-05-14. */
    employeeIds?: string[];
  }): {
    created: {
      serviceGroups: ServiceGroup[];
      permanentEmployees: PermanentEmployee[];
      availabilities: number;
    };
    skipped: boolean;
  } {
    const existingServiceGroups = this.listServiceGroups(input.companyId);
    const existingPermanentEmployees = this.listPermanentEmployees(input.companyId);
    if (existingServiceGroups.length > 0 || existingPermanentEmployees.length > 0) {
      return {
        created: { serviceGroups: [], permanentEmployees: [], availabilities: 0 },
        skipped: true,
      };
    }
    const branch = input.branchGroupIds[0] ?? "";
    const serviceGroups: ServiceGroup[] = [
      this.createServiceGroup({
        company_id: input.companyId,
        branch_group_id: branch,
        name: "Toog",
        address_line1: "Dok Noord 4F",
        address_line2: null,
        postal_code: "9000",
        city: "Gent",
      }),
      this.createServiceGroup({
        company_id: input.companyId,
        branch_group_id: branch,
        name: "Kassa",
        address_line1: "Dok Noord 4F",
        address_line2: null,
        postal_code: "9000",
        city: "Gent",
      }),
      this.createServiceGroup({
        company_id: input.companyId,
        branch_group_id: branch,
        name: "Terras",
        address_line1: "Dok Noord 4F",
        address_line2: null,
        postal_code: "9000",
        city: "Gent",
      }),
    ];
    const permanentEmployees: PermanentEmployee[] = [
      this.createPermanentEmployee({
        company_id: input.companyId,
        first_name: "Jeff",
        last_name: "Callebaut",
      }),
      this.createPermanentEmployee({
        company_id: input.companyId,
        first_name: "Joke",
        last_name: "Carton",
      }),
    ];

    // Seed availabilities for this week + next week so the Names grid
    // shows the green hour-blocks per mockup. Pattern alternates between
    // employees to keep the grid visually varied:
    //   - 1st employee: Mon–Wed 09–17 (full days)
    //   - 2nd employee: Tue, Thu 12–22 (lunch + evening)
    //   - 3rd employee: Fri 17–23 + Sat 09–15
    //   - 4th+ : Mon–Fri 09–13 (mornings)
    const patterns: Array<Array<{ dayOfWeek: number; from: string; to: string }>> = [
      [
        { dayOfWeek: 1, from: "09:00", to: "17:00" },
        { dayOfWeek: 2, from: "09:00", to: "17:00" },
        { dayOfWeek: 3, from: "09:00", to: "17:00" },
      ],
      [
        { dayOfWeek: 2, from: "12:00", to: "22:00" },
        { dayOfWeek: 4, from: "12:00", to: "22:00" },
      ],
      [
        { dayOfWeek: 5, from: "17:00", to: "23:00" },
        { dayOfWeek: 6, from: "09:00", to: "15:00" },
      ],
      [
        { dayOfWeek: 1, from: "09:00", to: "13:00" },
        { dayOfWeek: 2, from: "09:00", to: "13:00" },
        { dayOfWeek: 3, from: "09:00", to: "13:00" },
        { dayOfWeek: 4, from: "09:00", to: "13:00" },
        { dayOfWeek: 5, from: "09:00", to: "13:00" },
      ],
    ];

    let availabilitiesCount = 0;
    const employees = input.employeeIds ?? [];
    if (employees.length > 0) {
      // Anchor Monday of this week (local date for the server's clock).
      const today = new Date();
      const day = today.getDay();
      const mondayOffset = (day + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const toIso = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      };
      for (let i = 0; i < employees.length; i++) {
        const pattern = patterns[i % patterns.length];
        for (const slot of pattern) {
          // This week + next week (mondayOffset + 7).
          for (const weekOffset of [0, 7]) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + (slot.dayOfWeek - 1) + weekOffset);
            this.createAvailability({
              employee_id: employees[i],
              date: toIso(date),
              from_time: slot.from,
              to_time: slot.to,
              status: "open",
              locked_by_contract_id: null,
            });
            availabilitiesCount++;
          }
        }
      }
    }

    return {
      created: { serviceGroups, permanentEmployees, availabilities: availabilitiesCount },
      skipped: false,
    };
  }
}

export const pocDb = new PocDb();
