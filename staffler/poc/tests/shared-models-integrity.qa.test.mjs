import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Shared-model integrity locks. The shapes under
 * `frontend/src/app/shared/models/` and the matching PoC-DB rows under
 * `src/server/index.ts` / `frontend/src/app/core/api/**` are referenced
 * from 20+ files. A careless rename (`employee_id` → `employeeId`, or
 * dropping `applications_count` to "clean up") silently breaks every
 * consumer. These tests assert each field name is still present in its
 * declaration, so a refactor either updates the test or fails fast.
 *
 * Scope is intentionally narrow: model files only, not their usage. The
 * downstream usage tests live in dps-clone-structure / users-planning-
 * contracts.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const frontendModels = resolve(repo, 'frontend/src/app/shared/models');
const frontendApi = resolve(repo, 'frontend/src/app/core/api');

function read(rel, base = frontendModels) {
  return readFileSync(resolve(base, rel), 'utf8');
}

/** Helper: assert every key in `keys` appears as a field declaration in `src`. */
function expectKeys(src, keys, label) {
  for (const k of keys) {
    assert.match(
      src,
      // Match `key:` or `key?:` at a field-level (preceded by whitespace).
      new RegExp(`(^|\\W)${k}\\??:`),
      `${label}.${k} should still exist`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EmployeeWageModel — drives the statuut chip, niveau-2 contract copy, and
// the per-employee wage picker. Fields are picked by ContractModel.
// ═══════════════════════════════════════════════════════════════════════════

test('EmployeeWageModel keeps every field the contract Pick<…> relies on', () => {
  const src = read('employee-wage.model.ts');
  expectKeys(
    src,
    [
      'id',
      'allocationId',
      'employeeId',
      'companyInfo',
      'position',
      'wageHour',
      'compensationHours',
      'invoiceEcoWeekly',
      'mealVoucher',
      'travelAllowance',
      'statute',
      'paritairComite',
      'reason',
      'employmentAddress',
      'revenueConsultant',
      'revenueOfficeCode',
    ],
    'EmployeeWageModel',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EmployeeModel — every employee picker (mockup 06, dialog-shift-detail,
// preview, pool) reads `firstName`, `lastName`, sometimes `socialSecurity-
// Number`. The schema also feeds the address-edit dialog.
// ═══════════════════════════════════════════════════════════════════════════

test('EmployeeModel exposes the keys the picker + niveau-2 dialog reads', () => {
  const src = read('employee.model.ts');
  expectKeys(
    src,
    [
      'id',
      'firstName',
      'lastName',
      'socialSecurityNumber',
      'contact',
      'gender',
      'dateOfBirth',
      'iban',
    ],
    'EmployeeModel',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ContractModel + ContractInvoicingModel — niveau-2 build target.
// ═══════════════════════════════════════════════════════════════════════════

test('ContractModel + ContractInvoicingModel still match the niveau-2 contract shape', () => {
  const src = read('contract.model.ts');
  expectKeys(
    src,
    [
      'id',
      'employeeId',
      'companyId',
      'dateFrom',
      'dateTo',
      'status',
      'timetable',
      'invoicing',
      'companyHoursPerWeek',
      'employeeHoursPerWeek',
      'cancelReason',
      'cancelExtraInfo',
      'result',
      'socialSecurityCategory',
    ],
    'ContractModel',
  );
  expectKeys(
    src,
    [
      'coefficient',
      'coefficientTravelAllowance',
      'coefficientMealVouchers',
      'coefficientEcoVouchers',
      'coefficientBankHoliday',
      'dimonaCost',
      'defaultTaxRate',
    ],
    'ContractInvoicingModel',
  );
  // ContractDayScheduleModel — fed into timetable.schedule[] for the niveau-2
  // build. Pilot operators rely on `date`/`fromTime`/`toTime`; the
  // `pauseFromTime`/`pauseToTime` slots stay so the new-shift dialog can
  // round-trip a pause window.
  expectKeys(
    src,
    [
      'shiftTemplateName',
      'createShiftTemplate',
      'date',
      'fromTime',
      'toTime',
      'pauseFromTime',
      'pauseToTime',
    ],
    'ContractDayScheduleModel',
  );
});

test('ContractStatusEnum + ContractResultStatusEnum still expose the documented values', () => {
  const src = read('contract.model.ts');
  for (const v of [
    'DRAFT',
    'VALIDATION',
    'PENDING',
    'ACTIVE',
    'CANCELLED',
    'CANCEL_VALIDATION',
    'DELETED',
    'UNDER_REPAIR',
  ]) {
    assert.match(src, new RegExp(`${v}\\s*=\\s*'${v}'`), `ContractStatusEnum.${v}`);
  }
  for (const v of ['ERROR', 'SUCCESS']) {
    assert.match(
      src,
      new RegExp(`${v}\\s*=\\s*'${v}'`),
      `ContractResultStatusEnum.${v}`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CompanyDetailModel — coefficients + companyInvoiceInfo feed the niveau-2
// invoicing block via dialog-shift-detail.buildInvoicing.
// ═══════════════════════════════════════════════════════════════════════════

test('CompanyDetailModel keeps companyInvoiceInfo + coefficients shapes intact', () => {
  const src = read('company.model.ts');
  // companyInvoiceInfo: where companyHoursPerWeek lives.
  assert.match(src, /companyInvoiceInfo:\s*\{/);
  assert.match(src, /companyHoursPerWeek:\s*number/);
  // CoefficientsCompanyModel: general invoicing block (travel/meal/eco/etc.).
  expectKeys(
    src,
    [
      'coefficientTravelAllowance',
      'dimonaCost',
      'dimonaAddon',
      'coefficientMealVouchers',
      'coefficientEcoVouchers',
      'defaultTaxRate',
    ],
    'CoefficientsCompanyModel',
  );
  // CoefficientsPerStatuteCompanyModel — the per-statute multiplier table the
  // niveau-2 flow's `coefficientFieldFor` maps into.
  expectKeys(
    src,
    [
      'coefficientWhiteCollar',
      'coefficientBlueCollar',
      'coefficientWhiteCollarJobStudent',
      'coefficientBlueCollarJobStudent',
      'coefficientFlextimeWhiteCollar',
      'coefficientFlextimeBlueCollar',
      'coefficientWhiteCollarStudentWorker',
      'coefficientBlueCollarStudentWorker',
      'coefficientExtra',
    ],
    'CoefficientsPerStatuteCompanyModel',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PoC-DB-shaped models (snake_case) — Shift/Availability/Application.
// These mirror the SQLite columns in src/store/poc-db.ts; renaming on
// either side would 500 the planning grid.
// ═══════════════════════════════════════════════════════════════════════════

test('ShiftModel keeps the snake_case PoC-DB shape', () => {
  const src = readFileSync(
    resolve(frontendApi, 'shift/shift.api.service.ts'),
    'utf8',
  );
  expectKeys(
    src,
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
      'applications_count',
    ],
    'ShiftModel',
  );
});

test('ShiftApplicationModel + statuses match the niveau-2 application lifecycle', () => {
  const src = readFileSync(
    resolve(frontendApi, 'shift/shift.api.service.ts'),
    'utf8',
  );
  expectKeys(
    src,
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
    'ShiftApplicationModel',
  );
  // Status values — both the picker and the niveau-2 flow branch on these.
  for (const s of ["'candidate'", "'selected'", "'rejected'", "'withdrawn'"]) {
    assert.ok(src.includes(s), `ShiftApplicationModel.status must include ${s}`);
  }
});

test('AvailabilityModel keeps PoC-DB columns + the four statuses', () => {
  const src = readFileSync(
    resolve(frontendApi, 'availability/availability.api.service.ts'),
    'utf8',
  );
  expectKeys(
    src,
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
    'AvailabilityModel',
  );
  // AvailabilityStatus union — the bottom-sheet checks for 'locked' and the
  // planning grid checks for 'open'.
  for (const s of ["'open'", "'locked'", "'withdrawn'", "'expired'"]) {
    assert.ok(src.includes(s), `AvailabilityStatus must include ${s}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Notifications — the meldingen tab + badge depends on four kinds.
// ═══════════════════════════════════════════════════════════════════════════

test('Backend notifications route emits the four documented kinds', () => {
  const src = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');
  // The kind union as declared on the response shape.
  for (const k of ['new_open_shift', 'candidate', 'selected', 'rejected']) {
    assert.ok(
      src.includes(`"${k}"`),
      `notifications must surface the "${k}" kind`,
    );
  }
});
