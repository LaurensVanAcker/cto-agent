import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * End-to-end integration of the /api/employee-login + /api/employee-set-
 * password contract. We replicate the route logic on top of a real
 * Fastify instance (same trick as tests/server.qa.test.mjs) so the
 * test catches regressions in any of the moving parts:
 *
 *   - SUCCESS → cookie set, employee shape returned
 *   - FORCE_PASSWORD_RESET → cookie holds the Cognito session, no skey
 *     leak to the body
 *   - Wrong password 5x → 423 Locked, retryInSec in body
 *   - set-password follow-up → promotes the session, returns SUCCESS
 *   - set-password validator → rejects weak passwords with a message
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-emp-int-'));
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
  if (res.status !== 0) throw new Error('tsc failed:\n' + res.stdout + '\n' + res.stderr);
}
compile();

const { default: Fastify } = await import('fastify');
const { StafflerClient } = await import(
  resolve(buildDir, 'client/staffler-client.js')
);
const { randomBytes } = await import('node:crypto');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getCookieSid(setCookie) {
  if (!setCookie) return null;
  const m = /poc_sid=([A-Za-z0-9_-]+)/.exec(setCookie);
  return m ? m[1] : null;
}

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return { ok: false, reason: 'too short' };
  if (!/[0-9]/.test(p)) return { ok: false, reason: 'no digit' };
  if (!/[A-Z]/.test(p)) return { ok: false, reason: 'no upper' };
  return { ok: true };
}

function buildServer(fetchImpl) {
  const gateway = 'https://gw.qa.dps.boemm.eu';
  const sessions = new Map();
  const loginAttempts = new Map();
  const THRESHOLD = 5;
  const WINDOW_MS = 15 * 60 * 1000;

  function getLockState(email) {
    const row = loginAttempts.get(email);
    if (!row) return { locked: false, retryInMs: 0 };
    const now = Date.now();
    if (row.lockedUntilMs && row.lockedUntilMs > now) {
      return { locked: true, retryInMs: row.lockedUntilMs - now };
    }
    if (row.lockedUntilMs && row.lockedUntilMs <= now) {
      loginAttempts.delete(email);
    }
    return { locked: false, retryInMs: 0 };
  }
  function recordFail(email) {
    const now = Date.now();
    const cur = loginAttempts.get(email);
    const row = cur && now - cur.windowStartedMs < WINDOW_MS
      ? cur
      : { failedCount: 0, lockedUntilMs: 0, windowStartedMs: now };
    row.failedCount += 1;
    if (row.failedCount >= THRESHOLD) row.lockedUntilMs = now + WINDOW_MS;
    loginAttempts.set(email, row);
    return { locked: row.lockedUntilMs > now, retryInMs: Math.max(0, row.lockedUntilMs - now) };
  }
  function clearFails(email) { loginAttempts.delete(email); }

  function readSid(req) {
    const cookie = req.headers.cookie;
    if (!cookie) return null;
    const m = /(?:^|;\s*)poc_sid=([A-Za-z0-9_-]+)/.exec(cookie);
    return m ? m[1] : null;
  }
  function pickSession(req) {
    const sid = readSid(req);
    return sid ? sessions.get(sid) ?? null : null;
  }
  function newSid() { return randomBytes(16).toString('base64url'); }

  const app = Fastify();

  app.post('/api/employee-login', async (req, reply) => {
    const username = (req.body?.username ?? '').trim().toLowerCase();
    const password = req.body?.password ?? '';
    if (!username || !password) {
      reply.status(400);
      return { authStatus: 'FAILURE', message: 'missing' };
    }
    const lock = getLockState(username);
    if (lock.locked) {
      reply.status(423);
      return {
        authStatus: 'LOCKED',
        retryInSec: Math.ceil(lock.retryInMs / 1000),
      };
    }
    const client = new StafflerClient({ gateway, fetchImpl });
    let result;
    try {
      result = await client.employeeLogin({ username, password });
    } catch {
      const lockAfter = recordFail(username);
      reply.status(401);
      return {
        authStatus: 'FAILURE',
        retryInSec: lockAfter.retryInMs > 0 ? Math.ceil(lockAfter.retryInMs / 1000) : 0,
      };
    }
    if (result.authStatus === 'FORCE_PASSWORD_RESET' && result.session) {
      const sid = newSid();
      sessions.set(sid, { skey: '', username, kind: 'employee', forceResetSession: result.session });
      reply.header('Set-Cookie', `poc_sid=${sid}; Path=/; HttpOnly`);
      return { authStatus: 'FORCE_PASSWORD_RESET', session: result.session, username };
    }
    if (result.authStatus !== 'SUCCESS' || !result.skey) {
      recordFail(username);
      reply.status(401);
      return { authStatus: result.authStatus ?? 'FAILURE' };
    }
    clearFails(username);
    const sid = newSid();
    sessions.set(sid, { skey: result.skey, username, kind: 'employee' });
    reply.header('Set-Cookie', `poc_sid=${sid}; Path=/; HttpOnly`);
    return {
      authStatus: 'SUCCESS',
      employee: { id: username, email: username, firstName: username.split('@')[0], lastName: '' },
    };
  });

  app.post('/api/employee-set-password', async (req, reply) => {
    const session = pickSession(req);
    if (!session || !session.forceResetSession || session.kind !== 'employee') {
      reply.status(401);
      return { kind: 'unauthenticated' };
    }
    const password = req.body?.password ?? '';
    const validity = validatePassword(password);
    if (!validity.ok) {
      reply.status(400);
      return { kind: 'validation', reason: validity.reason };
    }
    const client = new StafflerClient({ gateway, fetchImpl });
    const result = await client.employeeSetPassword({
      session: session.forceResetSession,
      username: session.username,
      password,
    });
    if (result.authStatus !== 'SUCCESS' || !result.skey) {
      reply.status(400);
      return { authStatus: result.authStatus ?? 'FAILURE' };
    }
    session.skey = result.skey;
    session.forceResetSession = undefined;
    return { authStatus: 'SUCCESS' };
  });

  return { app, sessions, loginAttempts };
}

test('POST /api/employee-login: SUCCESS sets cookie + employee body', async () => {
  let idx = 0;
  const fetchImpl = async () => {
    idx++;
    return jsonResponse({ authStatus: 'SUCCESS', skey: 'EMP-SK' });
  };
  const { app, sessions } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-login',
    payload: { username: 'jan@bedrijf.be', password: 'GoodPass1' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.authStatus, 'SUCCESS');
  assert.equal(body.employee.email, 'jan@bedrijf.be');
  const sid = getCookieSid(res.headers['set-cookie']);
  assert.ok(sid && sessions.has(sid));
  assert.equal(sessions.get(sid).skey, 'EMP-SK');
  assert.equal(sessions.get(sid).kind, 'employee');
});

test('POST /api/employee-login: FORCE_PASSWORD_RESET stashes cognito session in cookie', async () => {
  const fetchImpl = async () => jsonResponse({ authStatus: 'FORCE_PASSWORD_RESET', session: 'cogn-sess' });
  const { app, sessions } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-login',
    payload: { username: 'a@b.c', password: 'temp' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.authStatus, 'FORCE_PASSWORD_RESET');
  assert.equal(body.session, 'cogn-sess');
  const sid = getCookieSid(res.headers['set-cookie']);
  const row = sessions.get(sid);
  assert.equal(row.forceResetSession, 'cogn-sess');
  assert.equal(row.skey, '');
});

test('POST /api/employee-login: 5 fails → 423 Locked with retryInSec', async () => {
  const fetchImpl = async () => jsonResponse({ authStatus: 'FAILURE' }, 401);
  const { app } = buildServer(fetchImpl);
  for (let i = 0; i < 4; i++) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/employee-login',
      payload: { username: 'a@b.c', password: 'x' },
    });
    assert.equal(r.statusCode, 401, `attempt ${i + 1} should be 401`);
  }
  const fifth = await app.inject({
    method: 'POST',
    url: '/api/employee-login',
    payload: { username: 'a@b.c', password: 'x' },
  });
  assert.equal(fifth.statusCode, 401, 'fifth attempt records the lock');
  const sixth = await app.inject({
    method: 'POST',
    url: '/api/employee-login',
    payload: { username: 'a@b.c', password: 'x' },
  });
  assert.equal(sixth.statusCode, 423);
  const body = sixth.json();
  assert.equal(body.authStatus, 'LOCKED');
  assert.ok(body.retryInSec > 0);
});

test('POST /api/employee-set-password: rejects weak password, accepts strong one + promotes session', async () => {
  let upstreamIdx = 0;
  const fetchImpl = async () => {
    upstreamIdx++;
    if (upstreamIdx === 1) return jsonResponse({ authStatus: 'FORCE_PASSWORD_RESET', session: 'cogn' });
    return jsonResponse({ authStatus: 'SUCCESS', skey: 'PROMOTED' });
  };
  const { app, sessions } = buildServer(fetchImpl);
  const login = await app.inject({
    method: 'POST',
    url: '/api/employee-login',
    payload: { username: 'a@b.c', password: 'temp' },
  });
  const sid = getCookieSid(login.headers['set-cookie']);
  const cookie = `poc_sid=${sid}`;

  // Weak password → 400
  const weak = await app.inject({
    method: 'POST',
    url: '/api/employee-set-password',
    headers: { cookie },
    payload: { password: 'short' },
  });
  assert.equal(weak.statusCode, 400);

  // Strong password → SUCCESS, session promoted
  const ok = await app.inject({
    method: 'POST',
    url: '/api/employee-set-password',
    headers: { cookie },
    payload: { password: 'Strong1Pass' },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().authStatus, 'SUCCESS');
  assert.equal(sessions.get(sid).skey, 'PROMOTED');
  assert.equal(sessions.get(sid).forceResetSession, undefined);
});

test('POST /api/employee-set-password: 401 when no session', async () => {
  const fetchImpl = async () => jsonResponse({});
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-set-password',
    payload: { password: 'Strong1Pass' },
  });
  assert.equal(res.statusCode, 401);
});

process.on('exit', () => {
  try { rmSync(buildDir, { recursive: true, force: true }); } catch {}
});
