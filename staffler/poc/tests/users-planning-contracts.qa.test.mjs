import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Contract locks for the three high-traffic surfaces of the PoC:
 *
 *   1. Users  — login, profile, invite, access management.
 *   2. Planning — open shifts, availability, contracts in a week
 *      (the data feeding the Bryntum grid + the mockup-06 picker).
 *   3. Creating contracts — the Niveau-2 "Kies" payload + the full
 *      contract dialog + the batch create.
 *
 * Same approach as `frontend-api-contracts.qa.test.mjs`: source-level
 * assertions on URL path, HTTP verb, and parameter/body keys. If the
 * upstream Staffler API breaks one of these contracts, or if we
 * accidentally drop a parameter while refactoring, the matching
 * assertion fails fast — long before someone opens the planning view
 * and sees an empty grid.
 *
 * Counterpart: `tests/staffler-client.qa.test.mjs` exercises the same
 * shapes at the real-fetch level through mockFetch.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const frontendApp = resolve(repo, 'frontend/src/app');
const backend = resolve(repo, 'src/server/index.ts');
const sharedModels = resolve(frontendApp, 'shared/models');

function read(rel) {
  return readFileSync(resolve(frontendApp, rel), 'utf8');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. USERS
// ═══════════════════════════════════════════════════════════════════════════

test('AuthApiService.login POSTs to /api/login with {username, password}', () => {
  const src = read('core/api/auth/auth.api.service.ts');
  assert.match(src, /COMPANY_USER_API_URL\s*=\s*`\$\{environment\.apiBaseUrl\}`/);
  assert.match(
    src,
    /this\.http\.post<AuthResultModel>\(`\$\{this\.COMPANY_USER_API_URL\}\/login`,\s*\{\s*username,\s*password,?\s*\}/,
    'login body has username + password (in that order)',
  );
});

test('AuthApiService.getCurrentUser GETs /api/me', () => {
  const src = read('core/api/auth/auth.api.service.ts');
  assert.match(src, /CURRENT_USER_API_URL\s*=\s*`\$\{environment\.apiBaseUrl\}\/me`/);
  assert.match(src, /this\.http\.get<CurrentUserModel>\(this\.CURRENT_USER_API_URL\)/);
});

test('AuthApiService password-reset flow hits the three documented endpoints', () => {
  const src = read('core/api/auth/auth.api.service.ts');
  // setPassword for the FORCE_PASSWORD_RESET branch (carries session + username + password).
  assert.match(src, /this\.http\.post<AuthResultModel>\(`\$\{this\.COMPANY_USER_API_URL\}\/setPassword`,\s*payload\)/);
  // resetPassword starts the email flow with just the username.
  assert.match(src, /this\.http\.post<void>\(`\$\{this\.COMPANY_USER_API_URL\}\/resetPassword`,\s*\{\s*username,?\s*\}/);
  // confirmResetPassword finishes it with {username, newPassword, confirmationCode}.
  assert.match(src, /this\.http\.post<void>\(`\$\{this\.COMPANY_USER_API_URL\}\/confirmResetPassword`,\s*payload\)/);
});

test('AuthApiService.logoutCognito GETs /api/logout (logout-from-all-devices path)', () => {
  const src = read('core/api/auth/auth.api.service.ts');
  assert.match(src, /this\.http\.get<void>\(`\$\{this\.USER_API_URL\}\/logout`\)/);
});

test('UserApiService.inviteUser POSTs to /api/users/companies/:companyId/invite', () => {
  const src = read('core/api/user/user.api.service.ts');
  assert.match(src, /USER_API_URL[\s\S]*?\/users`/);
  assert.match(
    src,
    /this\.http\.post<void>\(\s*`\$\{this\.#USER_API_URL\}\/companies\/\$\{payload\.companyId\}\/invite`,\s*payload\s*\)/,
  );
});

test('UserApiService.setUserLastViewedCompany POSTs to /api/users/:userId/companies/:companyId/last-viewed', () => {
  const src = read('core/api/user/user.api.service.ts');
  assert.match(
    src,
    /this\.http\.post<void>\(\s*`\$\{this\.#USER_API_URL\}\/\$\{userId\}\/companies\/\$\{companyId\}\/last-viewed`,\s*\{\}\s*\)/,
  );
});

test('CompanyApiService user-management endpoints hit /api/companies/:id/users/:userId', () => {
  const src = read('core/api/company/company.api.service.ts');
  // List users for a company.
  assert.match(src, /\$\{COMPANIES_API_URL\}\/\$\{companyId\}\/users/);
  // PATCH role + accessGroups.
  assert.match(src, /this\.http\.patch<CompanyUser>\(\s*`\$\{COMPANIES_API_URL\}\/\$\{companyId\}\/users\/\$\{userId\}`/);
  // Remove user.
  assert.match(src, /this\.http\.delete<void>\(`\$\{COMPANIES_API_URL\}\/\$\{companyId\}\/users\/\$\{userId\}`\)/);
  // Resend invitation.
  assert.match(
    src,
    /this\.http\.post<void>\(\s*`\$\{COMPANIES_API_URL\}\/\$\{companyId\}\/users\/\$\{userId\}\/resendInvitation`/,
  );
  // Remove employee from a company.
  assert.match(src, /this\.http\.delete<void>\(`\$\{COMPANIES_API_URL\}\/\$\{companyId\}\/employees\/\$\{employeeId\}`\)/);
});

test('CompanyApiService.getCompany + updateCompany pin the per-id endpoint', () => {
  const src = read('core/api/company/company.api.service.ts');
  assert.match(src, /this\.http\.get<CompanyDetailModel>\(`\$\{COMPANIES_API_URL\}\/\$\{id\}`\)/);
  assert.match(
    src,
    /this\.http\.put<CompanyDetailModel>\(\s*`\$\{COMPANIES_API_URL\}\/\$\{uuid\}`,/,
  );
});

test('CompanyApiService.getCoefficientsMinimalDefaultConfig sends types=MINIMAL', () => {
  const src = read('core/api/company/company.api.service.ts');
  assert.match(src, /\/coefficients`/);
  assert.match(src, /params:\s*\{\s*types:\s*'MINIMAL'\s*\}/);
});

test('InvitationApiService employee-invitations URLs are pinned', () => {
  const src = read('core/api/invitation/invitation.api.service.ts');
  assert.match(src, /EMPLOYEE_INVITATIONS_API_URL\s*=\s*`\$\{environment\.apiBaseUrl\}\/employees\/invitations`/);
  // POST creates an invitation.
  assert.match(src, /this\.http\.post<EmployeeInvitationModel>\(this\.EMPLOYEE_INVITATIONS_API_URL,/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. PLANNING
// ═══════════════════════════════════════════════════════════════════════════

test('ShiftApiService.list URL is /api/shifts?companyId=&dateFrom=&dateTo=', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  // url is a class-field, declared without `this.` — match the declaration line.
  assert.match(src, /\burl\s*=\s*`\$\{environment\.apiBaseUrl\}\/shifts`/);
  assert.match(
    src,
    /companyId=\$\{encodeURIComponent\(companyId\)\}&dateFrom=\$\{encodeURIComponent\(dateFrom\)\}&dateTo=\$\{encodeURIComponent\(dateTo\)\}/,
  );
});

test('ShiftApiService.create POSTs to /api/shifts and reads the x-poc-shift-merged header', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  // POST with `observe: 'response'` so the caller can read the merge header.
  assert.match(src, /this\.http\s*\.\s*post<ShiftModel>\(this\.url,\s*payload,\s*\{\s*observe:\s*'response'\s*\}/);
  // The merge contract is sticky — pilot operators rely on the "samengevoegd" toast.
  assert.match(src, /'x-poc-shift-merged'/);
  assert.match(src, /'x-poc-shift-merged-into'/);
});

test('ShiftApiService publish/cancel/applications URL fragments are stable', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  assert.match(src, /\$\{this\.url\}\/\$\{id\}\/publish/);
  assert.match(src, /\$\{this\.url\}\/\$\{id\}\/cancel/);
  assert.match(src, /this\.http\.get<ShiftApplicationModel\[\]>\(`\$\{this\.url\}\/\$\{shiftId\}\/applications`\)/);
});

test('ShiftApiService.share PATCHes /api/shifts/:id/share with the broadcast payload shape', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  assert.match(
    src,
    /this\.http\.patch<ShiftModel>\(`\$\{this\.url\}\/\$\{shiftId\}\/share`,\s*payload\)/,
  );
  // The payload type the share dialog passes — lock its keys so a careless rename surfaces.
  for (const key of ['targetType', 'targetEmployeeIds', 'targetGroupIds', 'reactionDeadline']) {
    assert.match(src, new RegExp(`${key}\\??:`), `share payload key ${key}`);
  }
});

test('CreateShiftPayload exposes the keys the new-shift dialog sends', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  for (const key of [
    'companyId',
    'serviceLocationId',
    'dateFrom',
    'dateTo',
    'fromTime',
    'toTime',
    'pauseFrom',
    'pauseTo',
    'capacity',
    'deadline',
    'targetType',
    'targetEmployeeIds',
    'targetGroupIds',
    'status',
  ]) {
    assert.match(
      src,
      new RegExp(`${key}\\??:`),
      `CreateShiftPayload must expose ${key}`,
    );
  }
});

test('AvailabilityApiService bulk endpoints accept employeeIds=… and companyId=… queries', () => {
  const src = read('core/api/availability/availability.api.service.ts');
  // Single-employee list.
  assert.match(src, /URLSearchParams\(\{\s*employeeId\s*\}\)/);
  // Bulk by ids (comma-joined).
  assert.match(src, /URLSearchParams\(\{\s*employeeIds:\s*employeeIds\.join\(','\)\s*\}\)/);
  // Company-scoped bulk (server resolves ids via Staffler).
  assert.match(src, /URLSearchParams\(\{\s*companyId\s*\}\)/);
});

test('CompanyApiService.getCompanyContracts hits /companies/:id/contracts/workTimes with startDate/endDate', () => {
  const src = read('core/api/company/company.api.service.ts');
  assert.match(src, /\/contracts\/workTimes/);
  assert.match(src, /\.set\('startDate',\s*startDate\)/);
  assert.match(src, /\.set\('endDate',\s*endDate\)/);
});

test('MyStafflerApiService planning lists (contracts / my-shifts / availabilities) are pinned', () => {
  const src = read('core/api/my-staffler/my-staffler.api.service.ts');
  assert.match(src, /\/my-staffler\/employees\/\$\{encodeURIComponent\(employeeId\)\}\/contracts\?\$\{qs\}/);
  assert.match(src, /\/my-shifts\?employeeId=/);
  assert.match(src, /\/availabilities\?\$\{search\.toString\(\)\}/);
});

test('ContractConfirmationApiService surfaces the prestatie list + workTimes PATCH', () => {
  const src = read('core/api/contract-confirmation/contract-confirmation.api.service.ts');
  // List under /api/companies (gateway nests confirmations under the company).
  assert.match(src, /CONTRACTS_CONFIRMATIONS_API_URL[\s\S]{0,40}\/companies/);
  assert.match(src, /this\.http\.get<PageableResponsePayloadModel<ContractConfirmation>>/);
  // PATCH updates the per-day workTimes — pilot operators confirm prestaties through this.
  assert.match(src, /this\.http\.patch<Array<ContractConfirmationDaySchedule>>/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CREATING CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

test('ContractModel keeps the fields dialog-shift-detail.select() populates', () => {
  const src = readFileSync(resolve(sharedModels, 'contract.model.ts'), 'utf8');
  // Wage-derived (Pick from EmployeeWageModel).
  for (const key of [
    'allocationId',
    'wageHour',
    'position',
    'compensationHours',
    'mealVoucher',
    'travelAllowance',
    'statute',
    'paritairComite',
    'reason',
    'employmentAddress',
    'revenueConsultant',
    'revenueOfficeCode',
  ]) {
    assert.match(src, new RegExp(`\\|\\s*'${key}'`), `Pick<EmployeeWageModel, …> must list '${key}'`);
  }
  // Contract-owned fields.
  for (const key of [
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
  ]) {
    assert.match(src, new RegExp(`\\b${key}\\??:`), `ContractModel.${key} must exist`);
  }
});

test('ContractInvoicingModel has all coefficient slots the niveau-2 flow fills', () => {
  const src = readFileSync(resolve(sharedModels, 'contract.model.ts'), 'utf8');
  for (const key of [
    'coefficient',
    'coefficientTravelAllowance',
    'coefficientMealVouchers',
    'coefficientEcoVouchers',
    'coefficientBankHoliday',
    'dimonaCost',
    'defaultTaxRate',
  ]) {
    assert.match(src, new RegExp(`${key}:`), `ContractInvoicingModel.${key} must exist`);
  }
});

test('dialog-shift-detail.select() builds a ContractModel that includes wage + hours + invoicing', () => {
  const src = read(
    'shared/components/dialog-shift-detail/dialog-shift-detail.component.ts',
  );
  // The picked-wage fields must be copied 1:1 into the contract — anything
  // missing here means the contract Staffler creates loses that field.
  for (const key of [
    'allocationId: wage.allocationId',
    'wageHour: wage.wageHour',
    'position: wage.position',
    'statute: wage.statute',
    'paritairComite: wage.paritairComite',
  ]) {
    assert.ok(src.includes(key), `dialog-shift-detail.select() must copy ${key}`);
  }
  // Hours per week now come from the company, not the hardcoded 40.
  assert.match(src, /companyHoursPerWeek\(\)/);
  // Invoicing is no longer zeroed — it goes through buildInvoicing(wage).
  assert.match(src, /buildInvoicing\(wage\)/);
});

test('ContractApiService createContract / updateContract / batch shapes are stable', () => {
  const src = read('core/api/contract/contract.api.service.ts');
  // POST /api/contracts — single create.
  assert.match(src, /this\.http\.post<ContractModel>\(CONTRACTS_API_URL,\s*payload\)/);
  // POST /api/contracts/batch — used by the contract-batch flow.
  assert.match(src, /this\.http\.post<ContractModel\[\]>\(`\$\{CONTRACTS_API_URL\}\/batch`,\s*payload\)/);
  // PUT /api/contracts/:id — full edit.
  assert.match(src, /this\.http\.put<ContractModel>\(`\$\{CONTRACTS_API_URL\}\/\$\{payload\.id\}`,\s*payload\)/);
  // GET /api/contracts/:id — open existing.
  assert.match(src, /this\.http\.get<ContractModel>\(`\$\{CONTRACTS_API_URL\}\/\$\{contractId\}`\)/);
});

test('ShiftApiService.select POSTs {applicationId, contract} to /api/shifts/:id/select (niveau-2 Kies)', () => {
  const src = read('core/api/shift/shift.api.service.ts');
  // The POST spans multiple lines in the source; use [\s\S] to cross newlines.
  assert.match(
    src,
    /this\.http\.post<\{\s*contract:\s*unknown;\s*applicationId:\s*string;?\s*\}>\([\s\S]*?`\$\{this\.url\}\/\$\{shiftId\}\/select`,[\s\S]*?\{\s*applicationId,\s*contract,?\s*\}/,
  );
});

test('Backend /api/shifts/:id/select forwards the contract to createContract + flips the application', () => {
  const src = readFileSync(backend, 'utf8');
  // The route exists and accepts the niveau-2 body shape.
  assert.match(src, /"\/api\/shifts\/:id\/select"/);
  assert.match(src, /Body:\s*\{\s*applicationId:\s*string;\s*contract:\s*ContractWebDto\s*\}/);
  // It really does call createContract — not, say, a stub.
  assert.match(src, /createContract\(b\.contract\)/);
  assert.match(src, /pocDb\.selectApplication\(b\.applicationId,\s*contractId\)/);
});

test('Backend /api/contracts POST forwards to upstream via createContract', () => {
  const src = readFileSync(backend, 'utf8');
  assert.match(src, /app\.post<\{\s*Body:\s*ContractWebDto\s*\}>\("\/api\/contracts"/);
  assert.match(src, /clientFor\(session\)\.createContract\(req\.body\)/);
});

test('Backend /api/shifts has create + list + publish + cancel + select + share routes', () => {
  const src = readFileSync(backend, 'utf8');
  for (const path of [
    '"/api/shifts"',
    '"/api/shifts/:id/publish"',
    '"/api/shifts/:id/cancel"',
    '"/api/shifts/:id/select"',
    '"/api/shifts/:id/share"',
    '"/api/shifts/:id/apply"',
  ]) {
    assert.ok(src.includes(path), `backend must register ${path}`);
  }
});
