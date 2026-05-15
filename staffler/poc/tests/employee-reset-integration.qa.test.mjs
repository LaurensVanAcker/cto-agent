import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Forgot-password 2-step contract. Same in-process Fastify pattern as
 * the other integration tests — we re-implement the route logic on top
 * of a real Fastify so the test exercises serialisation, status codes,
 * and the password validator together with the upstream call.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-reset-int-'));
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

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) return { ok: false, reason: 'too short' };
  if (!/[0-9]/.test(p)) return { ok: false, reason: 'no digit' };
  if (!/[A-Z]/.test(p)) return { ok: false, reason: 'no upper' };
  return { ok: true };
}

function buildServer(fetchImpl) {
  const gateway = 'https://gw.qa.dps.boemm.eu';
  const app = Fastify();

  app.post('/api/employee-reset-password', async (req, reply) => {
    const username = (req.body?.username ?? '').trim().toLowerCase();
    if (!username) {
      reply.status(400);
      return { kind: 'validation' };
    }
    try {
      await new StafflerClient({ gateway, fetchImpl }).employeeResetPassword(username);
    } catch {
      // intentionally swallow — anti-enumeration
    }
    return { ok: true };
  });

  app.post('/api/employee-confirm-reset-password', async (req, reply) => {
    const username = (req.body?.username ?? '').trim().toLowerCase();
    const newPassword = req.body?.newPassword ?? '';
    const confirmationCode = (req.body?.confirmationCode ?? '').trim();
    if (!username || !newPassword || !confirmationCode) {
      reply.status(400);
      return { kind: 'validation' };
    }
    const v = validatePassword(newPassword);
    if (!v.ok) {
      reply.status(400);
      return { kind: 'validation', reason: v.reason };
    }
    try {
      await new StafflerClient({ gateway, fetchImpl }).employeeConfirmResetPassword({
        username,
        newPassword,
        confirmationCode,
      });
      return { ok: true };
    } catch (err) {
      reply.status(err?.status ?? 500);
      return { kind: 'upstream' };
    }
  });

  return { app };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('POST /api/employee-reset-password: 200 even on upstream error (no enumeration)', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    // Simulate upstream 4xx — we should still return 200.
    return new Response('not found', { status: 404 });
  };
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-reset-password',
    payload: { username: 'unknown@example.com' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  // Upstream was actually called — anti-enumeration must NOT short-circuit.
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/publicapi\/employees\/users\/resetPassword$/);
});

test('POST /api/employee-reset-password: 400 when username missing', async () => {
  const fetchImpl = async () => jsonResponse({});
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-reset-password',
    payload: {},
  });
  assert.equal(res.statusCode, 400);
});

test('POST /api/employee-confirm-reset-password: rejects weak password', async () => {
  const fetchImpl = async () => jsonResponse({});
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-confirm-reset-password',
    payload: { username: 'a@b.c', newPassword: 'short', confirmationCode: '123456' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().kind, 'validation');
});

test('POST /api/employee-confirm-reset-password: forwards strong password to upstream', async () => {
  let upstreamCalled = false;
  let upstreamBody;
  const fetchImpl = async (url, init) => {
    upstreamCalled = true;
    upstreamBody = JSON.parse(init.body);
    return new Response(null, { status: 204 });
  };
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-confirm-reset-password',
    payload: { username: 'a@b.c', newPassword: 'Strong1Pass', confirmationCode: '123456' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(upstreamCalled, true);
  assert.equal(upstreamBody.username, 'a@b.c');
  assert.equal(upstreamBody.confirmationCode, '123456');
  assert.equal(upstreamBody.newPassword, 'Strong1Pass');
});

test('POST /api/employee-confirm-reset-password: bubbles upstream failure', async () => {
  const fetchImpl = async () => new Response('bad code', { status: 400 });
  const { app } = buildServer(fetchImpl);
  const res = await app.inject({
    method: 'POST',
    url: '/api/employee-confirm-reset-password',
    payload: { username: 'a@b.c', newPassword: 'Strong1Pass', confirmationCode: 'WRONG' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().kind, 'upstream');
});

process.on('exit', () => {
  try { rmSync(buildDir, { recursive: true, force: true }); } catch {}
});
