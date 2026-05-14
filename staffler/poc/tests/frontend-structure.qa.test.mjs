import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const frontendApp = resolve(repo, 'frontend/src/app');
const stylesScss = resolve(repo, 'frontend/src/styles.scss');
const indexHtml = resolve(repo, 'frontend/src/index.html');
const routesTs = resolve(frontendApp, 'app.routes.ts');
const appConfigTs = resolve(frontendApp, 'app.config.ts');
const shellHtml = resolve(frontendApp, 'layout/shell.component.html');
const loginHtml = resolve(frontendApp, 'pages/login/login.component.html');

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

test('app uses Angular 18 standalone components — no NgModule decorator', () => {
  for (const file of walk(frontendApp).filter((f) => f.endsWith('.ts'))) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /@NgModule\s*\(/, `${file} must not declare NgModule`);
  }
});

test('no PrimeNG / NGXS / Reactive Forms imports (per PLAN.md scope)', () => {
  const banned = [
    /from\s+['"]primeng/i,
    /from\s+['"]@ngxs\//i,
    /ReactiveFormsModule/,
    /FormBuilder/,
  ];
  for (const file of walk(frontendApp).filter((f) => f.endsWith('.ts'))) {
    const code = readFileSync(file, 'utf8');
    for (const re of banned) {
      assert.doesNotMatch(code, re, `${file} contains banned import: ${re}`);
    }
  }
});

test('all routes are lazy-loaded via loadComponent', () => {
  const code = readFileSync(routesTs, 'utf8');
  const routeBlocks = code.match(/path:\s*['"][^'"]*['"]/g) ?? [];
  assert.ok(routeBlocks.length >= 4, 'expected at least 4 routes');
  // Every path apart from '' redirect-target and '**' should have loadComponent
  assert.match(code, /loadComponent:\s*\(\)\s*=>/);
  assert.ok(
    !/component:\s*[A-Z]\w+Component/.test(code),
    'routes must use loadComponent (lazy), not eager component'
  );
});

test('auth guard wired on shell route', () => {
  const code = readFileSync(routesTs, 'utf8');
  assert.match(code, /canActivate:\s*\[\s*authGuard\s*\]/);
});

test('http client uses fetch + auth interceptor', () => {
  const code = readFileSync(appConfigTs, 'utf8');
  assert.match(code, /withFetch\(\)/);
  assert.match(code, /withInterceptors\(\[\s*authInterceptor\s*\]\)/);
});

test('shell shows brand + 3 nav links + logout', () => {
  const html = readFileSync(shellHtml, 'utf8');
  assert.match(html, /routerLink="\/dashboard"/);
  assert.match(html, /routerLink="\/employees"/);
  assert.match(html, /routerLink="\/contracts"/);
  assert.match(html, /\(click\)="logout\(\)"/);
});

test('login uses signals + control flow @if', () => {
  const ts = readFileSync(resolve(frontendApp, 'pages/login/login.component.ts'), 'utf8');
  assert.match(ts, /signal\(/, 'login must use signals');
  const html = readFileSync(loginHtml, 'utf8');
  assert.match(html, /@if\s*\(/, 'login template must use @if control flow');
});

test('global stylesheet defines Staffler brand tokens (indigo primary + magenta brand)', () => {
  const css = readFileSync(stylesScss, 'utf8');
  assert.match(css, /--color-primary:\s*#3c51f0/i, 'primary must be Staffler indigo #3c51f0');
  assert.match(css, /--color-brand:\s*#fc074f/i, 'brand accent must be magenta #fc074f');
  assert.match(css, /--color-text/);
  assert.match(css, /--color-bg/);
});

test('index.html theme-color matches Staffler indigo', () => {
  const html = readFileSync(indexHtml, 'utf8');
  assert.match(html, /theme-color"\s+content="#3c51f0"/i);
});

test('login screen uses lowercase staffler wordmark', () => {
  const html = readFileSync(loginHtml, 'utf8');
  assert.match(html, /class="wordmark">\s*staffler\s*</, 'login must show lowercase "staffler" wordmark');
  assert.doesNotMatch(html, /Staffler PoC/, 'no capitalized "Staffler PoC" on login per brand memory');
});

test('shell header uses lowercase staffler brand mark', () => {
  const html = readFileSync(resolve(frontendApp, 'layout/shell.component.html'), 'utf8');
  assert.match(html, /class="brand-mark">\s*staffler\s*</, 'shell brand mark must be lowercase "staffler"');
});

test('no eager component-class references in routes (lazy loading discipline)', () => {
  const code = readFileSync(routesTs, 'utf8');
  // import statements for actual components are forbidden in routes.ts
  assert.ok(
    !/^import\s+\{[^}]*Component[^}]*\}\s+from\s+['"]\.\/pages/m.test(code),
    'do not eagerly import page components in routes.ts'
  );
});
