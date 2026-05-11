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

interface DbShape {
  service_groups: ServiceGroup[];
  permanent_employees: PermanentEmployee[];
  permanent_assignments: PermanentAssignment[];
  shifts: Shift[];
  shift_applications: ShiftApplication[];
  availabilities: Availability[];
}

function emptyDb(): DbShape {
  return {
    service_groups: [],
    permanent_employees: [],
    permanent_assignments: [],
    shifts: [],
    shift_applications: [],
    availabilities: [],
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

  // -- shifts (stub for later steps) --

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

  // -- raw access for stats/debug --

  raw(): DbShape {
    return this.data;
  }
}

export const pocDb = new PocDb();
