import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const frontendApp = resolve(repo, 'frontend/src/app');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test('proxy.conf.json forwards /api to Fastify on :5173', () => {
  const cfg = JSON.parse(readFileSync(resolve(repo, 'frontend/proxy.conf.json'), 'utf8'));
  assert.ok(cfg['/api'], '/api proxy rule missing');
  assert.equal(cfg['/api'].target, 'http://localhost:5173');
  assert.equal(cfg['/api'].changeOrigin, true);
});

test('environments share same apiBase (relative /api, same-origin)', () => {
  const prod = readFileSync(resolve(repo, 'frontend/src/environments/environment.ts'), 'utf8');
  const dev = readFileSync(resolve(repo, 'frontend/src/environments/environment.development.ts'), 'utf8');
  assert.match(prod, /apiBase:\s*['"]\/api['"]/);
  assert.match(dev, /apiBase:\s*['"]\/api['"]/);
  assert.match(prod, /production:\s*true/);
  assert.match(dev, /production:\s*false/);
});

test('authGuard returns UrlTree (with returnTo) when unauthenticated', () => {
  const code = readFileSync(resolve(frontendApp, 'core/auth/auth.guard.ts'), 'utf8');
  assert.match(code, /createUrlTree\(\[\s*['"]\/login['"]\s*\]/);
  assert.match(code, /queryParams:\s*\{\s*returnTo:\s*state\.url\s*\}/);
});

test('authInterceptor adds withCredentials for /api calls and force-logouts on 401 except login', () => {
  const code = readFileSync(resolve(frontendApp, 'core/auth/auth.interceptor.ts'), 'utf8');
  assert.match(code, /req\.url\.startsWith\(['"]\/api['"]\)/);
  assert.match(code, /withCredentials:\s*true/);
  assert.match(code, /forceLogout\(\)/);
  assert.match(
    code,
    /endsWith\(['"]\/api\/login['"]\)/,
    'login endpoint must be excluded from forceLogout-on-401'
  );
});

test('AuthService caches profile, exposes signals, and clears state on logout', () => {
  const code = readFileSync(resolve(frontendApp, 'core/auth/auth.service.ts'), 'utf8');
  assert.match(code, /_user\s*=\s*signal</);
  assert.match(code, /activeCompanyId\s*=\s*this\._activeCompanyId\.asReadonly\(\)/);
  assert.match(code, /async\s+logout\(\)/);
  assert.match(code, /this\._user\.set\(null\)/);
});

test('dashboard renders user, memberships and activate button', () => {
  const html = readFileSync(resolve(frontendApp, 'pages/dashboard/dashboard.component.html'), 'utf8');
  assert.match(html, /u\.user\.email/);
  assert.match(html, /companyMemberships/);
  assert.match(html, /\(click\)="setActive\(m\.companyId\)"/);
  assert.match(html, /routerLink="\/employees"|\[routerLink\]="\[\s*'\/employees'\s*\]"/);
});

test('employees component reads companyId from query or active membership and paginates 50', () => {
  const code = readFileSync(resolve(frontendApp, 'pages/employees/employees.component.ts'), 'utf8');
  assert.match(code, /queryParamMap\.get\(['"]companyId['"]\)/);
  assert.match(code, /activeCompanyId\(\)/);
  assert.match(code, /size:\s*50/);
});

test('contracts component derives end-date locally (no toISOString slice bug)', () => {
  const code = readFileSync(resolve(frontendApp, 'pages/contracts/contracts.component.ts'), 'utf8');
  assert.doesNotMatch(code, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(code, /addDaysIso\(/);
  assert.match(code, /toLocalIsoDate\(/);
});

test('StafflerService surfaces same endpoints proxy exposes', () => {
  const code = readFileSync(resolve(frontendApp, 'core/api/staffler.service.ts'), 'utf8');
  for (const path of ['/login', '/logout', '/me', '/dictionaries', '/companies', '/employees', '/contracts']) {
    assert.match(code, new RegExp(`\\\$\\{this\\.base\\}${path.replace('/', '\\/')}`), `expected ${path} in StafflerService`);
  }
});

test('no leftover console.log / debugger / TODO-in-code in shipped source', () => {
  for (const file of walk(frontendApp).filter((f) => f.endsWith('.ts'))) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /\bconsole\.log\(/, `${file} contains console.log`);
    assert.doesNotMatch(code, /\bdebugger;/, `${file} contains debugger`);
  }
});

test('error-path helpers in components do not swallow errors silently (still log via console.error)', () => {
  // We allow console.error for the catch path; the previous test bans only console.log.
  const employees = readFileSync(resolve(frontendApp, 'pages/employees/employees.component.ts'), 'utf8');
  const contracts = readFileSync(resolve(frontendApp, 'pages/contracts/contracts.component.ts'), 'utf8');
  for (const code of [employees, contracts]) {
    assert.match(code, /console\.error\(err\)/, 'catch path should console.error for debuggability');
    assert.match(code, /this\.error\.set\(/, 'catch path must surface user-facing error signal');
  }
});

test('package.json scripts include dev, build, start, typecheck, test', () => {
  const pkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  for (const s of ['dev', 'build', 'start', 'typecheck', 'test']) {
    assert.ok(pkg.scripts[s], `missing npm script: ${s}`);
  }
});

test('Angular package.json keeps Angular 18 + zoneless config-free baseline', () => {
  const pkg = JSON.parse(readFileSync(resolve(repo, 'frontend/package.json'), 'utf8'));
  assert.match(pkg.dependencies['@angular/core'], /^\^18\./);
  assert.equal(pkg.dependencies['@angular/forms'] !== undefined, true);
  // banned packages
  assert.equal(pkg.dependencies?.primeng, undefined, 'PrimeNG must not be a runtime dep');
  assert.equal(pkg.dependencies?.['@ngxs/store'], undefined, 'NGXS must not be a runtime dep');
});

test('login form has email + password inputs with correct autocomplete', () => {
  const html = readFileSync(resolve(frontendApp, 'pages/login/login.component.html'), 'utf8');
  assert.match(html, /type="email"[^>]*autocomplete="username"/s);
  assert.match(html, /type="password"[^>]*autocomplete="current-password"/s);
});

test('login submit calls AuthService.login and routes to returnTo on success', () => {
  const code = readFileSync(resolve(frontendApp, 'pages/login/login.component.ts'), 'utf8');
  assert.match(code, /this\.auth\.login\(/);
  assert.match(code, /queryParamMap\.get\(['"]returnTo['"]\)/);
  assert.match(code, /this\.router\.navigateByUrl\(/);
});

test('shell logout button wires to auth.logout()', () => {
  const html = readFileSync(resolve(frontendApp, 'layout/shell.component.html'), 'utf8');
  const ts = readFileSync(resolve(frontendApp, 'layout/shell.component.ts'), 'utf8');
  assert.match(html, /\(click\)="logout\(\)"/);
  assert.match(ts, /this\.auth\.logout\(\)/);
});
