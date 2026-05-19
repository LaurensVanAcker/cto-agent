// Postgres-backed adapter that mirrors the `pocDb` surface from
// `poc-db.ts`. Drop-in compatible at the type level so the server can
// switch backends via the POC_DB_BACKEND env var. Every public method
// is implemented — including the createShift merge semantics that
// pilot operators rely on.
//
// Difference from the JSON store: every method is async. Server.ts
// currently calls the JSON store synchronously; the cutover step is a
// one-time pass to `await` each call site (server.ts is ~50 sites).
// That pass is not in this file; see `src/store/README.md` for the
// rollout plan.

import { randomUUID } from 'node:crypto';
import type {
  Availability,
  PermanentBlock,
  PermanentEmployee,
  ServiceLocation,
  Shift,
  ShiftApplication,
  OpeningHours,
} from './poc-db.js';

// Lazy-imported `pg` so the file is type-checkable without the dep.
// At runtime, the server only constructs PocDbPg when POC_DB_BACKEND=postgres.
type PgClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  end: () => Promise<void>;
};

let pgPromise: Promise<unknown> | null = null;
async function loadPg() {
  if (!pgPromise) pgPromise = import('pg' as string);
  return pgPromise as unknown as Promise<{ Pool: new (cfg: object) => unknown }>;
}

export class PocDbPg {
  private pool!: { query: PgClient['query']; end: () => Promise<void> };
  private ready: Promise<void>;

  constructor(connectionString: string = process.env.DATABASE_URL ?? '') {
    if (!connectionString) {
      throw new Error('PocDbPg requires DATABASE_URL or an explicit connectionString.');
    }
    this.ready = (async () => {
      const { Pool } = await loadPg();
      this.pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost')
          ? false
          : { rejectUnauthorized: false },
        max: 10,
      }) as unknown as { query: PgClient['query']; end: () => Promise<void> };
    })();
  }

  async close(): Promise<void> {
    await this.ready;
    await this.pool.end();
  }

  // ── Read hot path — implemented ────────────────────────────────────────

  async listServiceLocations(companyId: string): Promise<ServiceLocation[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT * FROM service_locations
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY name ASC`,
      [companyId],
    );
    return rows.map(rowToServiceLocation);
  }

  async listServiceLocationsByIds(ids: string[]): Promise<ServiceLocation[]> {
    await this.ready;
    if (ids.length === 0) return [];
    const { rows } = await this.pool.query(
      `SELECT * FROM service_locations
       WHERE id = ANY($1::text[]) AND deleted_at IS NULL`,
      [ids],
    );
    return rows.map(rowToServiceLocation);
  }

  async listShifts(
    companyId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<Array<Shift & { applications_count: number }>> {
    await this.ready;
    // Augment with the same applications_count the JSON store computes
    // — only candidate/selected applications count as "positive reaction".
    const args: unknown[] = [companyId];
    let dateClause = '';
    if (dateFrom && dateTo) {
      args.push(dateFrom, dateTo);
      dateClause = `AND s.date_to >= $${args.length - 1} AND s.date_from <= $${args.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT
         s.*,
         (
           SELECT COUNT(*)::int FROM shift_applications a
           WHERE a.shift_id = s.id
             AND a.status IN ('candidate','selected')
         ) AS applications_count
       FROM shifts s
       WHERE s.company_id = $1
       ${dateClause}
       ORDER BY s.date_from ASC, s.from_time ASC`,
      args,
    );
    return rows.map(rowToShiftWithCount);
  }

  async findAvailability(id: string): Promise<Availability | null> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT * FROM availabilities WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToAvailability(rows[0]) : null;
  }

  async listAvailabilities(
    employeeId: string,
    from?: string,
    to?: string,
  ): Promise<Availability[]> {
    await this.ready;
    const args: unknown[] = [employeeId];
    let dateClause = '';
    if (from && to) {
      args.push(from, to);
      dateClause = `AND date BETWEEN $2 AND $3`;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM availabilities
       WHERE employee_id = $1 ${dateClause}
       ORDER BY date ASC`,
      args,
    );
    return rows.map(rowToAvailability);
  }

  async listAvailabilitiesBulk(
    employeeIds: string[],
    from?: string,
    to?: string,
  ): Promise<Availability[]> {
    await this.ready;
    if (employeeIds.length === 0) return [];
    const args: unknown[] = [employeeIds];
    let dateClause = '';
    if (from && to) {
      args.push(from, to);
      dateClause = `AND date BETWEEN $2 AND $3`;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM availabilities
       WHERE employee_id = ANY($1::text[]) ${dateClause}
       ORDER BY date ASC`,
      args,
    );
    return rows.map(rowToAvailability);
  }

  async listPermanentEmployees(companyId: string): Promise<PermanentEmployee[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT * FROM permanent_employees
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY last_name ASC, first_name ASC`,
      [companyId],
    );
    return rows.map(rowToPermanentEmployee);
  }

  async listPermanentBlocks(params: {
    companyId: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PermanentBlock[]> {
    await this.ready;
    const args: unknown[] = [params.companyId];
    let dateClause = '';
    if (params.dateFrom && params.dateTo) {
      args.push(params.dateFrom, params.dateTo);
      dateClause = `AND date_to >= $2 AND date_from <= $3`;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM permanent_blocks
       WHERE company_id = $1 ${dateClause}
       ORDER BY date_from ASC`,
      args,
    );
    return rows.map(rowToPermanentBlock);
  }

  // ── Write paths ────────────────────────────────────────────────────────

  async createServiceLocation(input: {
    company_id: string;
    branch_group_id: string;
    name: string;
    address_line1?: string | null;
    address_line2?: string | null;
    postal_code?: string | null;
    city?: string | null;
    opening_hours?: OpeningHours;
  }): Promise<ServiceLocation> {
    await this.ready;
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO service_locations
         (id, company_id, branch_group_id, name, address_line1, address_line2, postal_code, city, opening_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        input.company_id,
        input.branch_group_id,
        input.name,
        input.address_line1 ?? null,
        input.address_line2 ?? null,
        input.postal_code ?? null,
        input.city ?? null,
        input.opening_hours ?? {},
      ],
    );
    return rowToServiceLocation(rows[0]);
  }

  async updateServiceLocation(
    id: string,
    patch: Partial<Omit<ServiceLocation, 'id' | 'created_at' | 'company_id'>>,
  ): Promise<ServiceLocation | null> {
    await this.ready;
    // Build a dynamic SET clause from the patch keys we recognise. Each
    // entry pairs a column with a placeholder so we never interpolate
    // values into SQL.
    const cols = [
      'branch_group_id',
      'name',
      'address_line1',
      'address_line2',
      'postal_code',
      'city',
      'opening_hours',
      'deleted_at',
    ] as const;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const c of cols) {
      if (c in patch) {
        sets.push(`${c} = $${sets.length + 1}`);
        args.push((patch as Record<string, unknown>)[c]);
      }
    }
    if (sets.length === 0) {
      // No-op patch — return the row as-is so callers can still
      // distinguish "row not found" (null) from "nothing changed".
      const { rows } = await this.pool.query(
        `SELECT * FROM service_locations WHERE id = $1`,
        [id],
      );
      return rows[0] ? rowToServiceLocation(rows[0]) : null;
    }
    args.push(id);
    const { rows } = await this.pool.query(
      `UPDATE service_locations
       SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${args.length}
       RETURNING *`,
      args,
    );
    return rows[0] ? rowToServiceLocation(rows[0]) : null;
  }

  async softDeleteServiceLocation(id: string): Promise<boolean> {
    await this.ready;
    const { rowCount } = await this.pool.query(
      `UPDATE service_locations
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async createPermanentEmployee(input: {
    company_id: string;
    first_name: string;
    last_name: string;
  }): Promise<PermanentEmployee> {
    await this.ready;
    const { rows } = await this.pool.query(
      `INSERT INTO permanent_employees (id, company_id, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [randomUUID(), input.company_id, input.first_name, input.last_name],
    );
    return rowToPermanentEmployee(rows[0]);
  }

  async createPermanentBlock(input: {
    company_id: string;
    permanent_employee_id: string;
    date_from: string;
    date_to: string;
    from_time: string;
    to_time: string;
  }): Promise<PermanentBlock> {
    await this.ready;
    const { rows } = await this.pool.query(
      `INSERT INTO permanent_blocks
         (id, company_id, permanent_employee_id, date_from, date_to, from_time, to_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        randomUUID(),
        input.company_id,
        input.permanent_employee_id,
        input.date_from,
        input.date_to,
        input.from_time,
        input.to_time,
      ],
    );
    return rowToPermanentBlock(rows[0]);
  }

  async deletePermanentBlock(id: string): Promise<boolean> {
    await this.ready;
    const { rowCount } = await this.pool.query(
      `DELETE FROM permanent_blocks WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Create or merge a shift. Mirrors the JSON store's pilot-required
   * merge rule: if a draft/open shift on the same service location +
   * date + hours already exists, bump its capacity instead of inserting
   * a duplicate row. Runs inside a transaction so the read-modify-write
   * is race-safe under concurrent pilot edits.
   */
  async createShift(input: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<{
    shift: Shift;
    merged: boolean;
    mergedInto?: string;
  }> {
    await this.ready;
    // We use a pool client to keep BEGIN/COMMIT on the same connection.
    const pool = this.pool as unknown as {
      connect: () => Promise<{
        query: PgClient['query'];
        release: () => void;
      }>;
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Look for a merge candidate. SELECT ... FOR UPDATE so two
      // concurrent createShift calls don't both decide to merge.
      const { rows: dups } = await client.query(
        `SELECT * FROM shifts
         WHERE status IN ('draft','open')
           AND company_id = $1
           AND service_location_id = $2
           AND date_from = $3 AND date_to = $4
           AND from_time = $5 AND to_time = $6
           AND COALESCE(pause_from,'') = COALESCE($7,'')
           AND COALESCE(pause_to,'')   = COALESCE($8,'')
         LIMIT 1
         FOR UPDATE`,
        [
          input.company_id,
          input.service_location_id,
          input.date_from,
          input.date_to,
          input.from_time,
          input.to_time,
          input.pause_from ?? null,
          input.pause_to ?? null,
        ],
      );
      if (dups[0]) {
        const dup = dups[0] as Record<string, unknown>;
        const mergedEmployees = Array.from(
          new Set([
            ...((dup.target_employee_ids as string[]) ?? []),
            ...(input.target_employee_ids ?? []),
          ]),
        );
        const mergedGroups = Array.from(
          new Set([
            ...((dup.target_group_ids as string[]) ?? []),
            ...(input.target_group_ids ?? []),
          ]),
        );
        const nextTargetType =
          dup.target_type === 'NONE' && input.target_type !== 'NONE'
            ? input.target_type
            : dup.target_type;
        const dupDeadline = dup.deadline ? (dup.deadline as Date).toISOString() : null;
        const nextDeadline =
          input.deadline && (!dupDeadline || input.deadline > dupDeadline)
            ? input.deadline
            : dupDeadline;
        const { rows: updated } = await client.query(
          `UPDATE shifts
           SET capacity = capacity + $1,
               target_employee_ids = $2,
               target_group_ids = $3,
               target_type = $4,
               deadline = $5,
               updated_at = NOW()
           WHERE id = $6
           RETURNING *`,
          [
            input.capacity ?? 1,
            mergedEmployees,
            mergedGroups,
            nextTargetType,
            nextDeadline,
            dup.id,
          ],
        );
        await client.query('COMMIT');
        const row = rowToShift(updated[0]);
        return { shift: row, merged: true, mergedInto: row.id };
      }

      const { rows: created } = await client.query(
        `INSERT INTO shifts
           (id, company_id, service_location_id, date_from, date_to,
            from_time, to_time, pause_from, pause_to, capacity,
            deadline, target_type, target_employee_ids, target_group_ids,
            status, published_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          randomUUID(),
          input.company_id,
          input.service_location_id,
          input.date_from,
          input.date_to,
          input.from_time,
          input.to_time,
          input.pause_from ?? null,
          input.pause_to ?? null,
          input.capacity ?? 1,
          input.deadline ?? null,
          input.target_type ?? 'NONE',
          input.target_employee_ids ?? [],
          input.target_group_ids ?? [],
          input.status ?? 'draft',
          input.published_at ?? null,
          input.created_by_user_id ?? null,
        ],
      );
      await client.query('COMMIT');
      return { shift: rowToShift(created[0]), merged: false };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  async findShift(id: string): Promise<Shift | null> {
    await this.ready;
    const { rows } = await this.pool.query(`SELECT * FROM shifts WHERE id = $1`, [id]);
    return rows[0] ? rowToShift(rows[0]) : null;
  }

  async listShiftsForEmployee(employeeId: string): Promise<Shift[]> {
    await this.ready;
    // ALL_POOL → every open shift counts; SELECTION → only those that
    // name this employee in target_employee_ids. Postgres ANY() does
    // the array-contains test cleanly with the TEXT[] column.
    const { rows } = await this.pool.query(
      `SELECT * FROM shifts
       WHERE status = 'open'
         AND (
           target_type = 'ALL_POOL'
           OR (target_type = 'SELECTION' AND $1 = ANY(target_employee_ids))
         )`,
      [employeeId],
    );
    return rows.map(rowToShift);
  }

  async cancelShift(id: string, reason?: string | null): Promise<Shift | null> {
    await this.ready;
    // Two-step: check current status, then update only if it's still
    // draft/open. Returns null on "not cancellable" so the route can
    // disambiguate 404 vs 409 via findShift.
    const { rows: existing } = await this.pool.query(
      `SELECT status FROM shifts WHERE id = $1`,
      [id],
    );
    if (!existing[0]) return null;
    if (existing[0].status === 'cancelled') {
      const { rows: r } = await this.pool.query(`SELECT * FROM shifts WHERE id = $1`, [id]);
      return rowToShift(r[0]);
    }
    if (existing[0].status !== 'draft' && existing[0].status !== 'open') return null;
    const { rows } = await this.pool.query(
      `UPDATE shifts SET status='cancelled', updated_at=NOW()${
        reason ? `, cancel_reason=$2` : ''
      } WHERE id = $1 RETURNING *`,
      reason ? [id, reason] : [id],
    );
    return rows[0] ? rowToShift(rows[0]) : null;
  }

  async publishShift(id: string): Promise<Shift | null> {
    await this.ready;
    const { rows } = await this.pool.query(
      `UPDATE shifts SET status='open', published_at=NOW(), updated_at=NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0] ? rowToShift(rows[0]) : null;
  }

  async patchShift(id: string, patch: Partial<Shift>): Promise<Shift | null> {
    await this.ready;
    const cols = [
      'target_type',
      'target_employee_ids',
      'target_group_ids',
      'deadline',
      'capacity',
      'status',
    ] as const;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const c of cols) {
      if (c in patch) {
        sets.push(`${c} = $${sets.length + 1}`);
        args.push((patch as Record<string, unknown>)[c]);
      }
    }
    if (sets.length === 0) return this.findShift(id);
    args.push(id);
    const { rows } = await this.pool.query(
      `UPDATE shifts SET ${sets.join(', ')}, updated_at=NOW()
       WHERE id = $${args.length} RETURNING *`,
      args,
    );
    return rows[0] ? rowToShift(rows[0]) : null;
  }

  // ── shift_applications ───────────────────────────────────────────────

  async listApplicationsForEmployee(employeeId: string): Promise<ShiftApplication[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT * FROM shift_applications WHERE employee_id = $1`,
      [employeeId],
    );
    return rows.map(rowToShiftApplication);
  }

  async listApplicationsForShift(shiftId: string): Promise<ShiftApplication[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT * FROM shift_applications WHERE shift_id = $1`,
      [shiftId],
    );
    return rows.map(rowToShiftApplication);
  }

  async applyToShift(
    shiftId: string,
    employeeId: string,
    note?: string,
  ): Promise<ShiftApplication> {
    await this.ready;
    // If a candidate/selected row already exists, return it as-is — the
    // route is idempotent (mockup 11 retry-tap semantics).
    const { rows: existing } = await this.pool.query(
      `SELECT * FROM shift_applications
       WHERE shift_id = $1 AND employee_id = $2 AND status IN ('candidate','selected')
       LIMIT 1`,
      [shiftId, employeeId],
    );
    if (existing[0]) return rowToShiftApplication(existing[0]);
    const { rows } = await this.pool.query(
      `INSERT INTO shift_applications (id, shift_id, employee_id, status, note)
       VALUES ($1, $2, $3, 'candidate', $4)
       RETURNING *`,
      [randomUUID(), shiftId, employeeId, note ?? null],
    );
    return rowToShiftApplication(rows[0]);
  }

  async withdrawApplication(shiftId: string, employeeId: string): Promise<boolean> {
    await this.ready;
    const { rowCount } = await this.pool.query(
      `UPDATE shift_applications
       SET status='withdrawn', decided_at=NOW()
       WHERE shift_id = $1 AND employee_id = $2 AND status='candidate'`,
      [shiftId, employeeId],
    );
    return (rowCount ?? 0) > 0;
  }

  async selectApplication(
    applicationId: string,
    contractId: string,
  ): Promise<ShiftApplication | null> {
    await this.ready;
    const { rows } = await this.pool.query(
      `UPDATE shift_applications
       SET status='selected', contract_id=$2, decided_at=NOW()
       WHERE id = $1 RETURNING *`,
      [applicationId, contractId],
    );
    return rows[0] ? rowToShiftApplication(rows[0]) : null;
  }

  // ── availabilities ───────────────────────────────────────────────────

  async createAvailability(input: {
    employee_id: string;
    date: string;
    from_time: string;
    to_time: string;
    status: Availability['status'];
    locked_by_contract_id: string | null;
  }): Promise<Availability> {
    await this.ready;
    // UNIQUE (employee_id, date) — pilot UX promises one row per day.
    // Re-creating an existing slot 409s in production; the bottom-sheet
    // delete-then-create flow already deletes first.
    const { rows } = await this.pool.query(
      `INSERT INTO availabilities
         (id, employee_id, date, from_time, to_time, status, locked_by_contract_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        randomUUID(),
        input.employee_id,
        input.date,
        input.from_time,
        input.to_time,
        input.status,
        input.locked_by_contract_id,
      ],
    );
    return rowToAvailability(rows[0]);
  }

  async deleteAvailability(id: string): Promise<boolean> {
    await this.ready;
    // Locked rows are kept — the contract owns the slot. Returning false
    // lets the route surface a 409 to the operator's bottom-sheet.
    const { rowCount } = await this.pool.query(
      `DELETE FROM availabilities WHERE id = $1 AND status != 'locked'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  // ── fcm_tokens ───────────────────────────────────────────────────────

  /** Upsert the FCM token row for an employee. Keyed on employee_id
   *  (one device → one token); the ON CONFLICT path refreshes the
   *  token + subscribed_at. Returns the number of rows written —
   *  always 0 or 1 since the table has a single row per employee. */
  async storeFcmToken(employeeId: string, token: string): Promise<number> {
    await this.ready;
    const { rows } = await this.pool.query(
      `INSERT INTO fcm_tokens (employee_id, token)
       VALUES ($1, $2)
       ON CONFLICT (employee_id) DO UPDATE
       SET token = EXCLUDED.token, subscribed_at = NOW()
       RETURNING 1`,
      [employeeId, token],
    );
    return rows.length;
  }

  // ── escape hatch ─────────────────────────────────────────────────────
  //
  // `raw()` on the JSON store hands callers the in-memory DbShape. On
  // Postgres there is no such object — the whole DB is on disk, and
  // shoving every row into one query would defeat the point of having a
  // DB at all. The notification-derivation routes (server.ts uses raw()
  // there) need to be ported to proper SQL queries before this backend
  // is production-ready. Throws loud so a misconfigured deploy doesn't
  // silently misbehave.
  raw(): never {
    throw new Error(
      'PocDbPg.raw() is not available. The notification-derivation routes ' +
      "in server.ts still use raw() access patterns — refactor those to " +
      'SQL before switching POC_DB_BACKEND=postgres for production.',
    );
  }

  // ── dev / demo ───────────────────────────────────────────────────────

  /**
   * Seed a starter dataset. Mirrors the JSON store's seedDemo so review
   * apps + demo dynos can boot non-empty. Idempotent: skips when the
   * company already has service-locations or permanent employees.
   */
  async seedDemo(input: {
    companyId: string;
    branchGroupIds: string[];
    employeeIds?: string[];
  }): Promise<{
    created: {
      serviceLocations: ServiceLocation[];
      permanentEmployees: PermanentEmployee[];
      availabilities: number;
    };
    skipped: boolean;
  }> {
    const [existingSLs, existingPEs] = await Promise.all([
      this.listServiceLocations(input.companyId),
      this.listPermanentEmployees(input.companyId),
    ]);
    if (existingSLs.length > 0 || existingPEs.length > 0) {
      return {
        created: { serviceLocations: [], permanentEmployees: [], availabilities: 0 },
        skipped: true,
      };
    }
    const branch = input.branchGroupIds[0] ?? '';
    const serviceLocations: ServiceLocation[] = [];
    for (const name of ['Toog', 'Kassa', 'Terras']) {
      serviceLocations.push(
        await this.createServiceLocation({
          company_id: input.companyId,
          branch_group_id: branch,
          name,
          address_line1: 'Dok Noord 4F',
          address_line2: null,
          postal_code: '9000',
          city: 'Gent',
        }),
      );
    }
    const permanentEmployees: PermanentEmployee[] = [];
    for (const [first, last] of [
      ['Jeff', 'Callebaut'],
      ['Joke', 'Carton'],
    ]) {
      permanentEmployees.push(
        await this.createPermanentEmployee({
          company_id: input.companyId,
          first_name: first,
          last_name: last,
        }),
      );
    }

    // Availability patterns — same shape as the JSON impl so the
    // planning grid looks identical regardless of backend.
    const patterns: Array<Array<{ dayOfWeek: number; from: string; to: string }>> = [
      [
        { dayOfWeek: 1, from: '09:00', to: '17:00' },
        { dayOfWeek: 2, from: '09:00', to: '17:00' },
        { dayOfWeek: 3, from: '09:00', to: '17:00' },
      ],
      [
        { dayOfWeek: 2, from: '12:00', to: '22:00' },
        { dayOfWeek: 4, from: '12:00', to: '22:00' },
      ],
      [
        { dayOfWeek: 5, from: '17:00', to: '23:00' },
        { dayOfWeek: 6, from: '09:00', to: '15:00' },
      ],
      [
        { dayOfWeek: 1, from: '09:00', to: '13:00' },
        { dayOfWeek: 2, from: '09:00', to: '13:00' },
        { dayOfWeek: 3, from: '09:00', to: '13:00' },
        { dayOfWeek: 4, from: '09:00', to: '13:00' },
        { dayOfWeek: 5, from: '09:00', to: '13:00' },
      ],
    ];

    let availabilitiesCount = 0;
    const employees = input.employeeIds ?? [];
    if (employees.length > 0) {
      const today = new Date();
      const day = today.getDay();
      const mondayOffset = (day + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const toIso = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      for (let i = 0; i < employees.length; i++) {
        const pattern = patterns[i % patterns.length];
        for (const slot of pattern) {
          for (const weekOffset of [0, 7]) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + (slot.dayOfWeek - 1) + weekOffset);
            try {
              await this.createAvailability({
                employee_id: employees[i],
                date: toIso(date),
                from_time: slot.from,
                to_time: slot.to,
                status: 'open',
                locked_by_contract_id: null,
              });
              availabilitiesCount++;
            } catch {
              // UNIQUE (employee_id, date) — re-runs of seedDemo may hit
              // this if availabilities already exist for an employee.
              // Counts as a soft-skip; the rest of the seed proceeds.
            }
          }
        }
      }
    }

    return {
      created: { serviceLocations, permanentEmployees, availabilities: availabilitiesCount },
      skipped: false,
    };
  }

  /**
   * Wipe every row from every PoC-DB table. Dev convenience —
   * `/api/poc-reset` calls it. In Postgres we just TRUNCATE all tables
   * in one statement; CASCADE handles the foreign-key chain.
   */
  async reset(): Promise<void> {
    await this.ready;
    await this.pool.query(
      `TRUNCATE TABLE
         fcm_tokens,
         availabilities,
         shift_applications,
         shifts,
         permanent_blocks,
         permanent_employees,
         service_locations
       RESTART IDENTITY CASCADE`,
    );
  }
}

// ── Row-to-domain mappers ────────────────────────────────────────────────

function rowToServiceLocation(r: Record<string, unknown>): ServiceLocation {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    branch_group_id: r.branch_group_id as string,
    name: r.name as string,
    address_line1: (r.address_line1 as string | null) ?? null,
    address_line2: (r.address_line2 as string | null) ?? null,
    postal_code: (r.postal_code as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    opening_hours: (r.opening_hours as OpeningHours) ?? {},
    deleted_at: r.deleted_at ? (r.deleted_at as Date).toISOString() : null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  };
}

function rowToShiftWithCount(
  r: Record<string, unknown>,
): Shift & { applications_count: number } {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    service_location_id: r.service_location_id as string,
    date_from: (r.date_from as Date).toISOString().slice(0, 10),
    date_to: (r.date_to as Date).toISOString().slice(0, 10),
    from_time: r.from_time as string,
    to_time: r.to_time as string,
    pause_from: (r.pause_from as string | null) ?? null,
    pause_to: (r.pause_to as string | null) ?? null,
    capacity: r.capacity as number,
    deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
    target_type: r.target_type as Shift['target_type'],
    target_employee_ids: (r.target_employee_ids as string[]) ?? [],
    target_group_ids: (r.target_group_ids as string[]) ?? [],
    status: r.status as Shift['status'],
    published_at: r.published_at ? (r.published_at as Date).toISOString() : null,
    created_by_user_id: (r.created_by_user_id as string | null) ?? null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
    applications_count: (r.applications_count as number) ?? 0,
  };
}

function rowToAvailability(r: Record<string, unknown>): Availability {
  return {
    id: r.id as string,
    employee_id: r.employee_id as string,
    date: (r.date as Date).toISOString().slice(0, 10),
    from_time: r.from_time as string,
    to_time: r.to_time as string,
    status: r.status as Availability['status'],
    locked_by_contract_id: (r.locked_by_contract_id as string | null) ?? null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  };
}

function rowToPermanentEmployee(r: Record<string, unknown>): PermanentEmployee {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    first_name: r.first_name as string,
    last_name: r.last_name as string,
    deleted_at: r.deleted_at ? (r.deleted_at as Date).toISOString() : null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  };
}

function rowToPermanentBlock(r: Record<string, unknown>): PermanentBlock {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    permanent_employee_id: r.permanent_employee_id as string,
    date_from: (r.date_from as Date).toISOString().slice(0, 10),
    date_to: (r.date_to as Date).toISOString().slice(0, 10),
    from_time: r.from_time as string,
    to_time: r.to_time as string,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  };
}

function rowToShift(r: Record<string, unknown>): Shift {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    service_location_id: r.service_location_id as string,
    date_from: (r.date_from as Date).toISOString().slice(0, 10),
    date_to: (r.date_to as Date).toISOString().slice(0, 10),
    from_time: r.from_time as string,
    to_time: r.to_time as string,
    pause_from: (r.pause_from as string | null) ?? null,
    pause_to: (r.pause_to as string | null) ?? null,
    capacity: r.capacity as number,
    deadline: r.deadline ? (r.deadline as Date).toISOString() : null,
    target_type: r.target_type as Shift['target_type'],
    target_employee_ids: (r.target_employee_ids as string[]) ?? [],
    target_group_ids: (r.target_group_ids as string[]) ?? [],
    status: r.status as Shift['status'],
    published_at: r.published_at ? (r.published_at as Date).toISOString() : null,
    created_by_user_id: (r.created_by_user_id as string | null) ?? null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  };
}

function rowToShiftApplication(r: Record<string, unknown>): ShiftApplication {
  return {
    id: r.id as string,
    shift_id: r.shift_id as string,
    employee_id: r.employee_id as string,
    status: r.status as ShiftApplication['status'],
    applied_at: (r.applied_at as Date).toISOString(),
    decided_at: r.decided_at ? (r.decided_at as Date).toISOString() : null,
    contract_id: (r.contract_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

