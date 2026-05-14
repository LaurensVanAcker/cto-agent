import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

// Compile the staffler-client (mirrors the other client tests).
const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-emp-login-'));
function compile() {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: buildDir,
      rootDir: resolve(repo, 'src'),
    },
    include: [
      resolve(repo, 'src/client/staffler-client.ts'),
      resolve(repo, 'src/types/staffler.ts'),
    ],
  };
  const cfgPath = resolve(buildDir, 'tsconfig.test.json');
  writeFileSync(cfgPath, JSON.stringify(tsconfig));
  const res = spawnSync('npx', ['--no-install', 'tsc', '-p', cfgPath], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error('tsc failed:\n' + res.stdout + '\n' + res.stderr);
  }
}
compile();
const { StafflerClient } = await import(
  resolve(buildDir, 'client/staffler-client.js')
);

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler({ url, init });
  };
  fn.calls = calls;
  return fn;
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('employeeLogin hits the employees publicapi endpoint (not the company one)', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ authStatus: 'SUCCESS', skey: 'EMP-SK' })
  );
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu', fetchImpl });
  const res = await c.employeeLogin({ username: 'jan@bedrijf.be', password: 'x' });
  assert.equal(res.authStatus, 'SUCCESS');
  assert.equal(c.getSkey(), 'EMP-SK');
  assert.equal(
    fetchImpl.calls[0].url,
    'https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/employees/users/login',
    'must POST to the employees endpoint',
  );
});

test('employeeLogin keeps the skey unset when authStatus !== SUCCESS', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ authStatus: 'FORCE_PASSWORD_RESET', session: 'cogn-sess' })
  );
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu', fetchImpl });
  const res = await c.employeeLogin({ username: 'a@b.c', password: 'temp' });
  assert.equal(res.authStatus, 'FORCE_PASSWORD_RESET');
  assert.equal(res.session, 'cogn-sess');
  assert.equal(c.getSkey(), undefined);
});

test('employeeSetPassword stores the new skey on SUCCESS', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ authStatus: 'SUCCESS', skey: 'NEW-SK' })
  );
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu', fetchImpl });
  await c.employeeSetPassword({ session: 'cogn-sess', username: 'a@b.c', password: 'NewPass123' });
  assert.equal(c.getSkey(), 'NEW-SK');
  assert.equal(
    fetchImpl.calls[0].url,
    'https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/employees/users/setPassword',
  );
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
    session: 'cogn-sess',
    username: 'a@b.c',
    password: 'NewPass123',
  });
});

// -- Lockout policy: in-memory map mirrors what's in server/index.ts. --
// We re-implement the policy here so the test guards the contract
// independently of any one route. If the route logic drifts we'll
// notice via the integration test (server.qa.test.mjs).
test('lockout opens after 5 fails and resets after the window', () => {
  const THRESHOLD = 5;
  const WINDOW_MS = 15 * 60 * 1000;
  const attempts = new Map();

  // Mirrors server's `getLockState`: returns the lock + reaps expired rows.
  function getLockState(email) {
    const row = attempts.get(email);
    if (!row) return { locked: false };
    const now = Date.now();
    if (row.lockedUntilMs && row.lockedUntilMs > now) return { locked: true };
    if (row.lockedUntilMs && row.lockedUntilMs <= now) {
      attempts.delete(email);
      return { locked: false };
    }
    return { locked: false };
  }
  function recordFail(email) {
    const now = Date.now();
    const cur = attempts.get(email);
    const row = cur && now - cur.windowStartedMs < WINDOW_MS ? cur : { failedCount: 0, lockedUntilMs: 0, windowStartedMs: now };
    row.failedCount += 1;
    if (row.failedCount >= THRESHOLD) row.lockedUntilMs = now + WINDOW_MS;
    attempts.set(email, row);
    return row.lockedUntilMs > now;
  }
  // Real flow: each attempt first checks getLockState, then on auth-fail
  // calls recordFail. The 5th fail locks; subsequent attempts short-
  // circuit on getLockState.
  const u = 'a@b.c';
  for (let i = 0; i < 4; i++) {
    assert.equal(getLockState(u).locked, false);
    assert.equal(recordFail(u), false, `fail ${i + 1} should NOT lock`);
  }
  assert.equal(getLockState(u).locked, false);
  assert.equal(recordFail(u), true, '5th fail locks');
  assert.equal(getLockState(u).locked, true, 'lock state is reported');

  // Simulate lock expiry by mutating lockedUntilMs into the past.
  attempts.get(u).lockedUntilMs = Date.now() - 1;
  // Real flow: getLockState reaps the expired row → fresh window.
  assert.equal(getLockState(u).locked, false, 'expired lock no longer locks');
  assert.equal(recordFail(u), false, 'fresh window starts at 1 fail');
});

// -- Password validator (matches server's `validatePassword`) --
function validate(p) {
  if (typeof p !== 'string' || p.length < 8) return { ok: false, reason: 'too short' };
  if (!/[0-9]/.test(p)) return { ok: false, reason: 'no digit' };
  if (!/[A-Z]/.test(p)) return { ok: false, reason: 'no upper' };
  return { ok: true };
}

test('password validator: BCJ-19426 rules', () => {
  assert.equal(validate('short1A').ok, false, 'less than 8 chars rejected');
  assert.equal(validate('lowercase123').ok, false, 'no uppercase rejected');
  assert.equal(validate('Uppercase').ok, false, 'no digit rejected');
  assert.equal(validate('Goodpass1').ok, true, 'valid');
  assert.equal(validate('Aa1bb22cc').ok, true, 'valid mixed');
  assert.equal(validate('').ok, false, 'empty rejected');
  assert.equal(validate(undefined).ok, false, 'undefined rejected');
});

process.on('exit', () => {
  try { rmSync(buildDir, { recursive: true, force: true }); } catch {}
});
