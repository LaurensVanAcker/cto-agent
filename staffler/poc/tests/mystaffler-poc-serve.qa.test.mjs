import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';

/**
 * Boots the mystaffler-poc `serve.mjs` on an ephemeral port AND a tiny
 * fake "backend" on another port, then drives requests through the
 * proxy:
 *
 *   - static asset request returns the file with the right MIME type
 *   - SPA fallback returns index.html on an unknown path
 *   - /api/* gets proxied with cookies in both directions
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const SERVE = resolve(repo, 'mystaffler-poc/serve.mjs');

// 1. Stand up a tiny fake backend that echoes the cookie back and
//    sets one in response.
async function startFakeBackend() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (req.url === '/api/ping') {
        const cookie = req.headers.cookie ?? '';
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'poc_sid=stub-sess; Path=/; HttpOnly',
        });
        res.end(JSON.stringify({ pong: true, gotCookie: cookie }));
      } else {
        res.writeHead(404).end();
      }
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function startServe(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVE], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b) => {
      out += b.toString();
      // Wait for the "running" line so we know the listen() has fired.
      if (out.includes('MyStaffler-PoC running on')) resolve(child);
    });
    child.stderr.on('data', (b) => {
      out += b.toString();
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('serve.mjs did not start in 3s:\n' + out)), 3000);
  });
}

let backend;
let serve;
let SERVE_PORT;
let BACKEND_PORT;

test('boot fake backend + serve.mjs', async () => {
  backend = await startFakeBackend();
  BACKEND_PORT = backend.address().port;
  // Pick a likely-free port high in the user range so it doesn't
  // collide with the dev one.
  SERVE_PORT = 14201 + Math.floor(Math.random() * 100);
  serve = await startServe({
    PORT: String(SERVE_PORT),
    BACKEND_ORIGIN: `http://127.0.0.1:${BACKEND_PORT}`,
  });
});

test('static index.html is served with text/html', async () => {
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const body = await res.text();
  assert.match(body, /MyStaffler/);
});

test('css served with text/css mime type', async () => {
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/src/styles.css`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/css/);
});

test('SPA fallback returns index.html for unknown extensionless path', async () => {
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/some/deep/route`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
});

test('unknown file → 404', async () => {
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/nope.js`);
  assert.equal(res.status, 404);
});

test('/api/* is proxied to BACKEND_ORIGIN + Set-Cookie comes back', async () => {
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/api/ping`, {
    headers: { cookie: 'poc_sid=test-cookie' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pong, true);
  assert.match(body.gotCookie, /poc_sid=test-cookie/, 'cookie forwarded to backend');
  assert.match(
    res.headers.get('set-cookie') ?? '',
    /poc_sid=stub-sess/,
    'backend Set-Cookie comes back to the client',
  );
});

test('/api/* upstream-down → 502', async () => {
  // Close the fake backend and immediately query a fresh path so the
  // proxy fails before any retry.
  await new Promise((r) => backend.close(r));
  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/api/ping`);
  assert.equal(res.status, 502);
});

test('tear down', async () => {
  serve.kill();
  await new Promise((r) => setTimeout(r, 100));
});
