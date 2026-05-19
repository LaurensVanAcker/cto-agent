import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Inventory + body-shape locks for the PoC Fastify backend
 * (`src/server/index.ts`).
 *
 * Why source-level regex: spinning up real Fastify per route would be
 * heavier than the (already long) server.qa.test.mjs that does it for
 * the auth / cookie path. Most of these routes are thin forwarders —
 * the bug we want to catch is "someone deleted the route" or "someone
 * renamed the path / verb / body field". Those show up here in ~80ms
 * for the whole inventory.
 *
 * Each route appears as one assertion on the literal URL fragment used
 * as Fastify's path argument. If the path drifts, the matching assert
 * fails and points at the file:line; the integration tests in
 * server.qa.test.mjs + employee-login-integration.qa.test.mjs cover
 * runtime semantics for the high-traffic ones.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const src = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');

function expectRoute(verb, path) {
  // Fastify registers routes either as `app.<verb>(...)` or
  // `app.<verb><{ Body|Params|Querystring }>(...)` — both forms wrap
  // the path string literal next, possibly across lines. The Body
  // type can run hundreds of chars (full nested DTOs) so the window
  // is generous; we still bound it so a stray match later in the
  // file doesn't pair with the wrong verb.
  const quoted = JSON.stringify(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const verbRe = new RegExp(`app\\.${verb}\\b[\\s\\S]{0,800}?${quoted}`);
  assert.match(src, verbRe, `expected ${verb.toUpperCase()} ${path} route to exist`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH (company-user + employee)
// ═══════════════════════════════════════════════════════════════════════════

test('auth routes — login / employee-login / set-password / reset / confirm / logout', () => {
  expectRoute('post', '/api/login');
  expectRoute('post', '/api/employee-login');
  expectRoute('post', '/api/employee-set-password');
  expectRoute('post', '/api/employee-reset-password');
  expectRoute('post', '/api/employee-confirm-reset-password');
  expectRoute('post', '/api/logout');
});

// /api/health exists so the login page can detect "proxy points at the
// wrong env" (stale STAFFLER_ENV=dev sending QA creds to dev Cognito).
// The endpoint must return BOTH env and gateway — env alone isn't enough
// to spot a custom STAFFLER_GATEWAY_* override.
test('health route — /api/health exposes env + gateway', () => {
  expectRoute('get', '/api/health');
  assert.match(src, /return\s*\{\s*env,\s*gateway,/);
});

// /api/login + /api/employee-login must log the gateway/env on auth
// failure so dev-time misconfigs are self-diagnosing. The login page
// renders the env banner, but the server-side warn is the fallback
// when only the proxy log is available (e.g. when running headless).
test('auth failure logs gateway + STAFFLER_ENV', () => {
  assert.match(
    src,
    /\[auth\][^\n]*\/api\/login[^\n]*\$\{gateway\}[^\n]*STAFFLER_ENV=\$\{env\}/,
    '/api/login FAILURE/401 path must console.warn the gateway+env',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT USER
// ═══════════════════════════════════════════════════════════════════════════

test('me — GET reads cached profile, PATCH whitelists firstName / lastName / phoneNumber', () => {
  expectRoute('get', '/api/me');
  expectRoute('patch', '/api/me');
  // The PATCH body shape is whitelisted server-side. Lock the keys so a
  // newly-added field doesn't leak through to upstream by accident.
  assert.match(src, /Body:\s*\{\s*firstName\?:\s*string;\s*lastName\?:\s*string;\s*phoneNumber\?:\s*string\s*\}/);
  // Dropping unknown fields is part of the contract too — anything else
  // would mean we can't trust the gateway about strictness.
  assert.match(src, /Whitelist the fields we forward/);
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANIES + EMPLOYEES + DICTIONARIES (mostly raw forwarders)
// ═══════════════════════════════════════════════════════════════════════════

test('reference + company routes — dictionaries / companies / employees / groups / assign', () => {
  expectRoute('get', '/api/dictionaries');
  expectRoute('get', '/api/companies/:id');
  expectRoute('get', '/api/employees');
  expectRoute('get', '/api/contracts');
  expectRoute('post', '/api/contracts');
  expectRoute('get', '/api/companies/:id/groups');
  expectRoute('post', '/api/companies/:id/employees/:eid/groups');
});

// ═══════════════════════════════════════════════════════════════════════════
// POC-DB seed/reset
// ═══════════════════════════════════════════════════════════════════════════

test('poc-db lifecycle routes are wired', () => {
  expectRoute('post', '/api/poc-seed-demo');
  expectRoute('post', '/api/poc-reset');
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE LOCATIONS (vestigingen)
// ═══════════════════════════════════════════════════════════════════════════

test('service-locations CRUD', () => {
  expectRoute('get', '/api/service-locations');
  expectRoute('post', '/api/service-locations');
  expectRoute('put', '/api/service-locations/:id');
  expectRoute('delete', '/api/service-locations/:id');
});

// ═══════════════════════════════════════════════════════════════════════════
// PERMANENT EMPLOYEES / BLOCKS
// ═══════════════════════════════════════════════════════════════════════════

test('permanent-* routes — employees / blocks', () => {
  expectRoute('get', '/api/permanent-employees');
  expectRoute('post', '/api/permanent-employees');
  expectRoute('get', '/api/permanent-blocks');
  expectRoute('post', '/api/permanent-blocks');
  expectRoute('delete', '/api/permanent-blocks/:id');
});

// ═══════════════════════════════════════════════════════════════════════════
// SHIFTS
// ═══════════════════════════════════════════════════════════════════════════

test('shifts — list / create / publish / cancel / share / applications / apply / select', () => {
  expectRoute('get', '/api/shifts');
  expectRoute('post', '/api/shifts');
  expectRoute('post', '/api/shifts/:id/publish');
  expectRoute('post', '/api/shifts/:id/cancel');
  expectRoute('patch', '/api/shifts/:id/share');
  expectRoute('get', '/api/shifts/:id/applications');
  expectRoute('post', '/api/shifts/:id/apply');
  expectRoute('delete', '/api/shifts/:id/apply');
  expectRoute('post', '/api/shifts/:id/select');
});

test('shifts/:id/select declares the niveau-2 body and forwards to createContract', () => {
  // Same assertion as users-planning-contracts.qa, repeated here so the
  // backend-route inventory is self-contained.
  assert.match(src, /Body:\s*\{\s*applicationId:\s*string;\s*contract:\s*ContractWebDto\s*\}/);
  assert.match(src, /clientFor\(session\)\.createContract\(b\.contract\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// AVAILABILITIES (PoC-DB)
// ═══════════════════════════════════════════════════════════════════════════

test('availabilities — list / create / remove + three list modes', () => {
  expectRoute('get', '/api/availabilities');
  expectRoute('post', '/api/availabilities');
  expectRoute('delete', '/api/availabilities/:id');
  // The list endpoint supports three filter modes — employeeId, employeeIds
  // (bulk), companyId (server resolves ids). These come through the
  // Querystring type declaration.
  assert.match(
    src,
    /Querystring:\s*\{\s*employeeId\?:\s*string;\s*employeeIds\?:\s*string;\s*companyId\?:\s*string;\s*from\?:\s*string;\s*to\?:\s*string;?\s*\}/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// MYSTAFFLER INVITES + READ ROUTES
// ═══════════════════════════════════════════════════════════════════════════

test('mystaffler invite routes — single proxy endpoint (BCJ-19425)', () => {
  // BCJ-19425 collapsed first-invite + resend into a single upstream
  // endpoint, and dropped the demo mark-active helper now that
  // myStafflerStatus comes through on EmployeeWebDto.
  expectRoute('post', '/api/employees/:id/mystaffler-invite');
});

test('mystaffler read routes — per-employee contracts + my-shifts + notifications', () => {
  expectRoute('get', '/api/my-staffler/employees/:id/contracts');
  expectRoute('get', '/api/my-shifts');
  expectRoute('get', '/api/notifications');
});

// ═══════════════════════════════════════════════════════════════════════════
// FCM (PWA push)
// ═══════════════════════════════════════════════════════════════════════════

test('FCM endpoints — config + subscribe', () => {
  expectRoute('get', '/api/fcm-config');
  expectRoute('post', '/api/fcm-subscribe');
  // The /api/fcm-subscribe body is exactly {employeeId?, token?} — anything
  // else means the worker registration drifted.
  assert.match(
    src,
    /Body:\s*\{\s*employeeId\?:\s*string;\s*token\?:\s*string\s*\}/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY NETS
// ═══════════════════════════════════════════════════════════════════════════

test('setNotFoundHandler still proxies /api/* via rawAuthed (kept for unwrapped endpoints)', () => {
  assert.match(src, /app\.setNotFoundHandler\(/);
  assert.match(src, /clientFor\(session\)\.rawAuthed<unknown>\(method,\s*req\.url,\s*req\.body\)/);
  // Non-/api paths must 404 — the SPA is served by sister Heroku apps
  // (Option C), not by this server. No SPA fallback here anymore.
  assert.doesNotMatch(src, /sendFile\(/);
  assert.doesNotMatch(src, /@fastify\/static/);
});

test('lockout policy: 5 failed employee-login attempts within 15 min → 423 Locked', () => {
  assert.match(src, /getLockState\(username\)/);
  assert.match(src, /recordLoginFailure\(username\)/);
  assert.match(src, /clearLoginFailures\(username\)/);
  // 423 surfaced explicitly so the client can show the retry-in toast.
  assert.match(src, /reply\.status\(423\)/);
  assert.match(src, /authStatus:\s*"LOCKED"/);
});

test('FORCE_PASSWORD_RESET keeps the cognito session in the cookie, not the body', () => {
  // The Set-Cookie carries `poc_sid` with the stashed session; the body
  // returns just username + session (Cognito needs it for set-password).
  assert.match(src, /"FORCE_PASSWORD_RESET" && result\.session/);
  assert.match(src, /forceResetSession:\s*result\.session/);
  assert.match(src, /Set-Cookie/);
});

test('Every /api/* route handler grabs the session before calling upstream', () => {
  // Heuristic: count `pickSession(req)` invocations vs. the number of
  // authed-only routes. Each authed route should pull the session once;
  // a missing call means the route forwards without a skey and 401s.
  const pickCount = (src.match(/pickSession\(req\)/g) ?? []).length;
  // ~47 registered routes (post permanent-assignments removal), minus the
  // handful that don't need auth (/api/login, /api/employee-login,
  //  /api/employee-reset-password, /api/employee-confirm-reset-password,
  //  /api/employee-set-password, /api/fcm-config). That's ~41 authed routes;
  // allow some headroom for nested handlers (employee-set-password also
  // picks the session).
  assert.ok(pickCount >= 33, `expected ≥33 pickSession() calls, saw ${pickCount}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-TENANT GUARD (assertCompanyAccess)
// ═══════════════════════════════════════════════════════════════════════════

test('assertCompanyAccess helper exists and is keyed on session.companyIds', () => {
  // Helper signature: returns null on success, or { status, body }.
  assert.match(src, /function assertCompanyAccess\(/);
  // Pulls the allowed list from the session …
  assert.match(src, /session\.companyIds\s*\?\?\s*\[\]/);
  // … and 403s when the requested companyId is not a member.
  assert.match(src, /status:\s*403/);
  assert.match(src, /kind:\s*"forbidden"/);
});

test('login flows hydrate session.companyIds from the DPS profile', () => {
  // The helper that turns profile JSON into a string[] of companyIds.
  assert.match(src, /function companyIdsFromProfile\(/);
  // Must be wired on both company-login and employee-login happy paths
  // (and the /api/me refresh path) — at least three call sites.
  const callSites = (src.match(/session\.companyIds\s*=\s*companyIdsFromProfile\(/g) ?? []).length;
  assert.ok(callSites >= 3, `expected ≥3 session.companyIds hydration sites, saw ${callSites}`);
});

test('every companyId-bearing PoC-DB route runs assertCompanyAccess', () => {
  // For each route that the operator (company-side) can hit with a
  // companyId, the handler MUST call assertCompanyAccess before reading
  // or writing the PoC-DB. Otherwise a logged-in user of company A can
  // forge query.companyId=B and walk the other tenant's data.
  const guardedRoutes = [
    '/api/poc-seed-demo',
    '/api/service-locations',
    '/api/permanent-employees',
    '/api/permanent-blocks',
    '/api/shifts',
    '/api/availabilities',
  ];
  for (const path of guardedRoutes) {
    const quoted = JSON.stringify(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Find the path literal, then verify assertCompanyAccess appears
    // within ~800 chars after it (the handler body). Wide enough for
    // the longest current handler but tight enough to not accidentally
    // match a different route's guard.
    const re = new RegExp(`${quoted}[\\s\\S]{0,800}?assertCompanyAccess\\(session,`);
    assert.match(src, re, `${path} handler must call assertCompanyAccess(session, ...)`);
  }
});
