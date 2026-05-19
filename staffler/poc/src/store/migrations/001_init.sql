-- PoC-DB schema for Heroku Postgres.
--
-- Mirrors the JSON-file-backed types in `src/store/poc-db.ts`. Run via
-- `scripts/migrate.mjs`; every statement is IF NOT EXISTS so re-running
-- against an existing database is a no-op.
--
-- Conventions:
--   - snake_case columns (matches the JSON store and the frontend's
--     snake_case API models).
--   - All timestamps are TIMESTAMPTZ (the JSON store keeps ISO strings,
--     which Postgres parses cleanly on INSERT).
--   - Soft delete: `deleted_at` nullable on rows that get unlisted but
--     not erased (service_locations, permanent_employees).
--
-- BCJ-19425 — invite/account status now comes from the upstream DPS
-- `/api/employees` endpoint (EmployeeWebDto.myStafflerStatus +
-- .lastLogin), so the old `mystaffler_invites` table is gone. FCM
-- device tokens still live PoC-side in `fcm_tokens` until the upstream
-- registration endpoint ships (BCJ-19517 / 19445).

CREATE TABLE IF NOT EXISTS service_locations (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL,
  branch_group_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  postal_code     TEXT,
  city            TEXT,
  -- OpeningHours is a Partial<Record<1..7, {from,to}|null>>; JSONB lets
  -- us read/write the object as-is without a join table.
  opening_hours   JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_locations_company_id ON service_locations(company_id);

CREATE TABLE IF NOT EXISTS permanent_employees (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_permanent_employees_company_id ON permanent_employees(company_id);

CREATE TABLE IF NOT EXISTS permanent_blocks (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL,
  permanent_employee_id TEXT NOT NULL REFERENCES permanent_employees(id) ON DELETE CASCADE,
  date_from             DATE NOT NULL,
  date_to               DATE NOT NULL,
  from_time             TEXT NOT NULL,    -- HH:mm
  to_time               TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perm_blocks_company ON permanent_blocks(company_id);
CREATE INDEX IF NOT EXISTS idx_perm_blocks_dates ON permanent_blocks(date_from, date_to);

CREATE TABLE IF NOT EXISTS shifts (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL,
  service_location_id TEXT NOT NULL REFERENCES service_locations(id) ON DELETE CASCADE,
  date_from           DATE NOT NULL,
  date_to             DATE NOT NULL,
  from_time           TEXT NOT NULL,
  to_time             TEXT NOT NULL,
  pause_from          TEXT,
  pause_to            TEXT,
  capacity            INTEGER NOT NULL DEFAULT 1,
  deadline            TIMESTAMPTZ,
  target_type         TEXT NOT NULL DEFAULT 'NONE'
                       CHECK (target_type IN ('ALL_POOL','SELECTION','GROUP','PARTNERS','NONE')),
  target_employee_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  target_group_ids    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status              TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','open','closed','fulfilled','cancelled')),
  published_at        TIMESTAMPTZ,
  created_by_user_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_dates ON shifts(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

CREATE TABLE IF NOT EXISTS shift_applications (
  id          TEXT PRIMARY KEY,
  shift_id    TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'candidate'
               CHECK (status IN ('candidate','selected','rejected','withdrawn')),
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at  TIMESTAMPTZ,
  contract_id TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_apps_shift ON shift_applications(shift_id);
CREATE INDEX IF NOT EXISTS idx_apps_employee ON shift_applications(employee_id);

CREATE TABLE IF NOT EXISTS availabilities (
  id                       TEXT PRIMARY KEY,
  employee_id              TEXT NOT NULL,
  date                     DATE NOT NULL,
  from_time                TEXT NOT NULL,
  to_time                  TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','locked','withdrawn','expired')),
  locked_by_contract_id    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enforce one row per (employee, date) — the bottom-sheet UX assumes
  -- a single window per day; conflicting writes should 409 server-side.
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_avails_date ON availabilities(date);
CREATE INDEX IF NOT EXISTS idx_avails_employee ON availabilities(employee_id);

CREATE TABLE IF NOT EXISTS fcm_tokens (
  employee_id   TEXT PRIMARY KEY,
  token         TEXT NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
