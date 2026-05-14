import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

// We can't directly import the server (it auto-listens on import).
// Instead we recreate the same routes by importing the StafflerClient (compiled
// to JS) and exercising it through a tiny Fastify instance that mirrors the
// real server logic. The point is to lock in the proxy contract: session
// cookies, 401-on-no-session, skey header injection.

const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-server-'));

function compileClient() {
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

compileClient();

const { default: Fastify } = await import('fastify');
const { StafflerClient, StafflerError } = await import(
  resolve(buildDir, 'client/staffler-client.js')
);
const { randomBytes } = await import('node:crypto');

function buildServer(fetchImpl) {
  const sessions = new Map();
  const gateway = 'https://gw.qa.dps.boemm.eu';
  const newSid = () => randomBytes(16).toString('base64url');
  const readSid = (req) => {
    const cookie = req.headers.cookie;
    if (!cookie) return null;
    const m = /(?:^|;\s*)poc_sid=([A-Za-z0-9_-]+)/.exec(cookie);
    return m ? m[1] : null;
  };
  const pickSession = (req) => {
    const sid = readSid(req);
    return sid ? sessions.get(sid) ?? null : null;
  };
  const clientFor = (session) =>
    new StafflerClient({ gateway, skey: session?.skey, fetchImpl });

  const app = Fastify();

  app.post('/api/login', async (req, reply) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      reply.status(400);
      return { kind: 'validation' };
    }
    const c = new StafflerClient({ gateway, fetchImpl });
    try {
      const r = await c.login({ username, password });
      if (r.authStatus !== 'SUCCESS' || !r.skey) {
        return { ok: false, authStatus: r.authStatus, session: r.session };
      }
      const sid = newSid();
      const session = { skey: r.skey, username };
      sessions.set(sid, session);
      reply.header('Set-Cookie', `poc_sid=${sid}; Path=/; HttpOnly`);
      try {
        const profile = await c.getCurrentUser();
        session.profileJson = JSON.stringify(profile);
        return { ok: true, profile };
      } catch {
        return { ok: true, profile: null };
      }
    } catch (err) {
      if (err instanceof StafflerError) {
        reply.status(err.status || 500);
        return { kind: err.kind };
      }
      throw err;
    }
  });

  app.post('/api/logout', async (req, reply) => {
    const session = pickSession(req);
    if (session) {
      try { await clientFor(session).logout(); } catch {}
      const sid = readSid(req);
      if (sid) sessions.delete(sid);
      reply.header('Set-Cookie', `poc_sid=; Path=/; Max-Age=0`);
    }
    return { ok: true };
  });

  app.get('/api/me', async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: 'unauthenticated' }; }
    if (session.profileJson) return JSON.parse(session.profileJson);
    const profile = await clientFor(session).getCurrentUser();
    session.profileJson = JSON.stringify(profile);
    return profile;
  });

  app.get('/api/employees', async (req, reply) => {
    const session = pickSession(req);
    if (!session) { reply.status(401); return { kind: 'unauthenticated' }; }
    return clientFor(session).listEmployees({
      companyId: req.query.companyId,
      page: req.query.page ? parseInt(req.query.page) : 0,
      size: req.query.size ? parseInt(req.query.size) : 20,
    });
  });

  return { app, sessions };
}

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

test('POST /api/login with missing creds → 400', async () => {
  const fetchImpl = async () => jsonResponse({});
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: {} });
  assert.equal(res.statusCode, 400);
});

test('POST /api/login SUCCESS sets cookie and returns profile', async () => {
  let callIdx = 0;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (callIdx++ === 0) return jsonResponse({ authStatus: 'SUCCESS', skey: 'SK1' });
    return jsonResponse({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, userId: 'u1', userRoles: [], companyMemberships: [] });
  };
  const { app, sessions } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'a@b.c', password: 'x' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.profile.user.email, 'a@b.c');
  const sid = getCookieSid(res.headers['set-cookie']);
  assert.ok(sid, 'session cookie set');
  assert.ok(sessions.has(sid), 'session stored server-side');
  assert.equal(sessions.get(sid).skey, 'SK1');
  // The currentuser call must include the skey header
  assert.equal(calls[1].init.headers['x-boemm-skey'], 'SK1');
});

test('POST /api/login wrong creds (no skey) → ok:false, no cookie', async () => {
  const fetchImpl = async () => jsonResponse({ authStatus: 'FORCE_PASSWORD_RESET' });
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'a@b.c', password: 'wrong' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, false);
  assert.ok(!res.headers['set-cookie']);
});

test('GET /api/me without session → 401', async () => {
  const fetchImpl = async () => jsonResponse({});
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({ method: 'GET', url: '/api/me' });
  assert.equal(res.statusCode, 401);
});

test('GET /api/me with session returns cached profile (no extra fetch)', async () => {
  const calls = [];
  let idx = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (idx++ === 0) return jsonResponse({ authStatus: 'SUCCESS', skey: 'SK' });
    return jsonResponse({ user: { id: 'u', email: 'e', name: 'n' }, userId: 'u', userRoles: [], companyMemberships: [] });
  };
  const { app } = buildServer(fetchImpl);
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'a@b.c', password: 'x' },
  });
  const sid = getCookieSid(loginRes.headers['set-cookie']);
  const callsBefore = calls.length;
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: `poc_sid=${sid}` },
  });
  assert.equal(meRes.statusCode, 200);
  assert.equal(calls.length, callsBefore, 'cached profile must not refetch');
});

test('GET /api/employees requires session', async () => {
  const fetchImpl = async () => jsonResponse({ content: [] });
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({ method: 'GET', url: '/api/employees?companyId=C1' });
  assert.equal(res.statusCode, 401);
});

test('GET /api/employees forwards companyId + skey', async () => {
  const calls = [];
  let idx = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (idx++ === 0) return jsonResponse({ authStatus: 'SUCCESS', skey: 'SK' });
    if (idx === 2) return jsonResponse({ user: { id: 'u', email: 'e', name: 'n' }, userId: 'u', userRoles: [], companyMemberships: [] });
    return jsonResponse({ content: [{ id: 'E1' }], totalElements: 1 });
  };
  const { app } = buildServer(fetchImpl);
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'a@b.c', password: 'x' },
  });
  const sid = getCookieSid(loginRes.headers['set-cookie']);
  const res = await app.inject({
    method: 'GET',
    url: '/api/employees?companyId=COMP-1',
    headers: { cookie: `poc_sid=${sid}` },
  });
  assert.equal(res.statusCode, 200);
  const empCall = calls.at(-1);
  assert.match(empCall.url, /\/api\/employees\?companyId=COMP-1/);
  assert.equal(empCall.init.headers['x-boemm-skey'], 'SK');
});

test('POST /api/logout deletes session and clears cookie', async () => {
  let idx = 0;
  const fetchImpl = async (url, init) => {
    if (idx++ === 0) return jsonResponse({ authStatus: 'SUCCESS', skey: 'SK' });
    if (idx === 2) return jsonResponse({ user: { id: 'u', email: 'e', name: 'n' }, userId: 'u', userRoles: [], companyMemberships: [] });
    return new Response(null, { status: 204 }); // logout
  };
  const { app, sessions } = buildServer(fetchImpl);
  const loginRes = await app.inject({
    method: 'POST', url: '/api/login', payload: { username: 'a', password: 'b' },
  });
  const sid = getCookieSid(loginRes.headers['set-cookie']);
  assert.ok(sessions.has(sid));
  const res = await app.inject({
    method: 'POST', url: '/api/logout', headers: { cookie: `poc_sid=${sid}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(!sessions.has(sid), 'session removed');
  assert.match(res.headers['set-cookie'], /poc_sid=;.*Max-Age=0/);
});

process.on('exit', () => {
  try { rmSync(buildDir, { recursive: true, force: true }); } catch {}
});
