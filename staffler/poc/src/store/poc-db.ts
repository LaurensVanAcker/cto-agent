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

export interface ServiceGroup {
  id: string;
  company_id: string;
  branch_group_id: string; // ref to DPS EngagementGroup id
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
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
}

interface DbShape {
  service_groups: ServiceGroup[];
  permanent_employees: PermanentEmployee[];
  permanent_assignments: PermanentAssignment[];
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
      return { ...emptyDb(), ...parsed };
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
    input: Omit<ServiceGroup, "id" | "deleted_at" | "created_at" | "updated_at">,
  ): ServiceGroup {
    const now = new Date().toISOString();
    const row: ServiceGroup = {
      id: randomUUID(),
      deleted_at: null,
      created_at: now,
      updated_at: now,
      ...input,
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

  // -- shifts --

  listShifts(companyId: string, dateFrom: string, dateTo: string): Shift[] {
    return this.data.shifts.filter(
      (s) => s.company_id === companyId && s.date_to >= dateFrom && s.date_from <= dateTo,
    );
  }

  createShift(input: Omit<Shift, "id" | "created_at" | "updated_at">): Shift {
    const now = new Date().toISOString();
    const row: Shift = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.data.shifts.push(row);
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
  }): {
    created: {
      serviceGroups: ServiceGroup[];
      permanentEmployees: PermanentEmployee[];
    };
    skipped: boolean;
  } {
    const existingServiceGroups = this.listServiceGroups(input.companyId);
    const existingPermanentEmployees = this.listPermanentEmployees(input.companyId);
    if (existingServiceGroups.length > 0 || existingPermanentEmployees.length > 0) {
      return {
        created: { serviceGroups: [], permanentEmployees: [] },
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
    return {
      created: { serviceGroups, permanentEmployees },
      skipped: false,
    };
  }
}

export const pocDb = new PocDb();
