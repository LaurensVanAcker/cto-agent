import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

// Compile the staffler-client + types once with tsc into a temp dir so we can
// import the JS in node:test without needing Angular's compiler. The repo
// already has tsx + tsc as devDeps; we use tsc to emit ESM JS.
const buildDir = mkdtempSync(resolve(tmpdir(), 'staffler-client-'));

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

const { StafflerClient, StafflerError, gatewayFor } = await import(
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

test('gatewayFor returns the QA URL for "qa"', () => {
  assert.equal(gatewayFor('qa'), 'https://gw.qa.dps.boemm.eu');
  assert.equal(gatewayFor('dev'), 'https://gw.dev.dps.boemm.eu');
  assert.equal(gatewayFor('prod'), 'https://gw.myplanning.digitalpayrollservices.be');
});

test('login() stores skey on SUCCESS and sends no auth header', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ authStatus: 'SUCCESS', skey: 'SK-123' })
  );
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu', fetchImpl });
  const res = await c.login({ username: 'a@b.c', password: 'x' });
  assert.equal(res.authStatus, 'SUCCESS');
  assert.equal(c.getSkey(), 'SK-123');
  const headers = fetchImpl.calls[0].init.headers;
  assert.ok(!('x-boemm-skey' in headers), 'login must not send skey header');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(
    fetchImpl.calls[0].url,
    'https://gw.qa.dps.boemm.eu/v1/dps-api/publicapi/companies/users/login'
  );
});

test('authedCall sends x-boemm-skey header', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ user: { id: 'u1' } }));
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK-XYZ',
    fetchImpl,
  });
  await c.getCurrentUser();
  const headers = fetchImpl.calls[0].init.headers;
  assert.equal(headers['x-boemm-skey'], 'SK-XYZ');
  assert.equal(
    fetchImpl.calls[0].url,
    'https://gw.qa.dps.boemm.eu/v1/dps-api/api/users/currentuser'
  );
});

test('authedCall without skey throws StafflerError(transport)', async () => {
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu' });
  await assert.rejects(() => c.getCurrentUser(), (err) => {
    assert.ok(err instanceof StafflerError);
    assert.equal(err.kind, 'transport');
    assert.equal(err.status, 0);
    return true;
  });
});

test('listEmployees builds full querystring with defaults', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ content: [], totalElements: 0 }));
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await c.listEmployees({ companyId: 'C-1', nameLike: 'an' });
  const url = new URL(fetchImpl.calls[0].url);
  assert.equal(url.pathname, '/v1/dps-api/api/employees');
  assert.equal(url.searchParams.get('companyId'), 'C-1');
  assert.equal(url.searchParams.get('nameLike'), 'an');
  assert.equal(url.searchParams.get('page'), '0');
  assert.equal(url.searchParams.get('size'), '20');
  assert.equal(url.searchParams.get('sortBy'), 'lastName:asc');
});

test('listContracts joins employeeIds and statuses', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ content: [], totalElements: 0 }));
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await c.listContracts({
    companyId: 'C-1',
    startDate: '2026-05-11',
    endDate: '2026-05-17',
    employeeIds: ['e1', 'e2'],
    statuses: ['ACTIVE', 'COMPLETED'],
  });
  const url = new URL(fetchImpl.calls[0].url);
  assert.equal(url.searchParams.get('employeeIds'), 'e1,e2');
  assert.equal(url.searchParams.get('statuses'), 'ACTIVE,COMPLETED');
  assert.equal(url.searchParams.get('startDate'), '2026-05-11');
  assert.equal(url.searchParams.get('endDate'), '2026-05-17');
});

test('createContract POSTs JSON body', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ id: 'C-NEW' }));
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await c.createContract({ id: 'X', employeeId: 'E1' });
  const { init } = fetchImpl.calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { id: 'X', employeeId: 'E1' });
});

test('parses business error with apiErrors into StafflerError.business', async () => {
  const fetchImpl = mockFetch(() =>
    new Response(
      JSON.stringify({
        apiErrors: [{ code: 'CONTRACT_DATE_FROM_PAST', details: 'past', group: 'CONTRACT' }],
        traceId: 'T-1',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
  );
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await assert.rejects(
    () => c.createContract({ id: 'X' }),
    (err) => {
      assert.ok(err instanceof StafflerError);
      assert.equal(err.kind, 'business');
      assert.equal(err.status, 400);
      assert.equal(err.traceId, 'T-1');
      assert.equal(err.errors[0].code, 'CONTRACT_DATE_FROM_PAST');
      return true;
    }
  );
});

test('non-business HTTP error becomes StafflerError.gateway', async () => {
  const fetchImpl = mockFetch(() =>
    new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } })
  );
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await assert.rejects(
    () => c.getCurrentUser(),
    (err) => {
      assert.ok(err instanceof StafflerError);
      assert.equal(err.kind, 'gateway');
      assert.equal(err.status, 502);
      return true;
    }
  );
});

test('logout clears skey on success', async () => {
  const fetchImpl = mockFetch(() => new Response(null, { status: 204 }));
  const c = new StafflerClient({
    gateway: 'https://gw.qa.dps.boemm.eu',
    skey: 'SK',
    fetchImpl,
  });
  await c.logout();
  assert.equal(c.getSkey(), undefined);
});

test('getDictionaries hits publicapi without skey', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({ dictionaries: {} }));
  const c = new StafflerClient({ gateway: 'https://gw.qa.dps.boemm.eu', fetchImpl });
  await c.getDictionaries(['statutes', 'languages']);
  const headers = fetchImpl.calls[0].init.headers;
  assert.ok(!('x-boemm-skey' in headers));
  assert.match(fetchImpl.calls[0].url, /publicapi\/dictionaries\?types=statutes%2Clanguages/);
});

process.on('exit', () => {
  try {
    rmSync(buildDir, { recursive: true, force: true });
  } catch {}
});
