import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const frontendSrc = resolve(repo, 'frontend/src');
const frontendApp = resolve(frontendSrc, 'app');
const stylesScss = resolve(frontendSrc, 'styles.scss');
const indexHtml = resolve(frontendSrc, 'index.html');
const angularJson = resolve(repo, 'frontend/angular.json');
const planningPoc = resolve(
  frontendApp,
  'pages/company/modules/planning-poc/planning-poc.component.ts',
);

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

test('frontend uses the dps-clone layout (pages/auth/login, pages/company/modules)', () => {
  assert.ok(
    existsSync(resolve(frontendApp, 'pages/auth/login/login.component.html')),
    'auth/login present',
  );
  for (const mod of [
    'planning-poc',
    'pool',
    'locations',
    'actuals',
    'mystaffler-preview',
  ]) {
    assert.ok(
      existsSync(resolve(frontendApp, 'pages/company/modules', mod)),
      `expected company module: ${mod}`,
    );
  }
});

test('no console.log / debugger leftover in shipped TS', () => {
  for (const file of walk(frontendApp).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  )) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /\bconsole\.log\(/, `${file} contains console.log`);
    assert.doesNotMatch(code, /\bdebugger;/, `${file} contains debugger`);
  }
});

test('planning-poc still exports the canonical view + zoom unions', () => {
  const code = readFileSync(planningPoc, 'utf8');
  assert.match(code, /type PocPlanningView\s*=\s*'names'\s*\|\s*'locations'/);
  assert.match(code, /type PocPlanningZoom\s*=\s*'day'\s*\|\s*'week'\s*\|\s*'2weeks'/);
});

test('planning-poc renames "Namen" → "Medewerkers" everywhere user-visible', () => {
  const code = readFileSync(planningPoc, 'utf8');
  assert.match(
    code,
    /\{\s*label:\s*'Medewerkers',\s*value:\s*'names'/,
    'VIEW_OPTIONS must show "Medewerkers" not "Namen"',
  );
  // Code comments may still mention "Namen" historically — that's fine.
});

test('planning-poc availabilities render as ResourceTimeRanges, not events', () => {
  const code = readFileSync(planningPoc, 'utf8');
  assert.match(code, /buildResourceTimeRanges\(/);
  assert.match(code, /resourceTimeRanges\s*=\s*signal</);
  // Event `kind` union no longer carries 'availability'
  assert.doesNotMatch(
    code,
    /kind:\s*'contract'\s*\|\s*'shift'\s*\|\s*'permanent'\s*\|\s*'availability'/,
  );
});

test('planning-poc refresh fetches the actual visible date span', () => {
  const code = readFileSync(planningPoc, 'utf8');
  assert.match(code, /z === 'day' \? 0 : z === '2weeks' \? 13 : 6/);
});

test('planning-poc weekStart is the displayed day (no today-snap in startDate)', () => {
  const code = readFileSync(planningPoc, 'utf8');
  // We removed the snap-to-today block from startDate computed
  assert.doesNotMatch(
    code,
    /startDate = computed\([\s\S]*today >= week && today < week\.plus\(\{ days: 7 \}\) \? today : week/m,
  );
});

test('planning-poc cancel + share-button placement still correct', () => {
  const html = readFileSync(
    resolve(
      frontendApp,
      'pages/company/modules/planning-poc/planning-poc.component.html',
    ),
    'utf8',
  );
  // Share button is BEFORE the .planning-nav block per pilot item 12.
  const shareIdx = html.indexOf('openShareDialog()');
  const navIdx = html.indexOf('class="planning-nav"');
  assert.ok(shareIdx > 0 && navIdx > 0);
  assert.ok(
    shareIdx < navIdx,
    'share-open-shifts button must be rendered BEFORE the week-nav so it does not jump',
  );
});

test('Bryntum week-header row dropped from non-Day zoom (item 7)', () => {
  const code = readFileSync(planningPoc, 'utf8');
  // The override viewPreset must only contain a single `day` header
  // for non-Day zoom — search for the comment marker we left.
  assert.match(
    code,
    /Drop the redundant week-level header row from the shared/,
    'inline comment marker for the dropped week header row',
  );
});

test('angular.json registers src/assets glob', () => {
  const cfg = JSON.parse(readFileSync(angularJson, 'utf8'));
  const project = cfg.projects.dps ?? cfg.projects.frontend;
  assert.ok(project, 'expected an Angular project entry');
  const assets = project.architect.build.options.assets;
  const hasGlob = assets.some(
    (a) => typeof a === 'object' && a.input === 'src/assets',
  );
  assert.ok(hasGlob, 'assets entry with input "src/assets" must be present');
});

test('global styles include the shared .poc-banner card', () => {
  const css = readFileSync(stylesScss, 'utf8');
  assert.match(css, /\.poc-banner\b/);
  assert.match(css, /\.poc-banner-icon\b/);
  assert.match(css, /\.poc-banner-body\b/);
});

test('index.html keeps the Staffler theme-color', () => {
  const html = readFileSync(indexHtml, 'utf8');
  assert.match(html, /theme-color"\s+content="#fc074f"/i);
});

test('package.json has dev, build, typecheck, test, check scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  for (const s of ['dev', 'build', 'typecheck', 'test', 'check']) {
    assert.ok(pkg.scripts[s], `missing npm script: ${s}`);
  }
});

test('frontend package.json keeps Bryntum scheduler + PrimeNG (this is the dps clone)', () => {
  const pkg = JSON.parse(readFileSync(resolve(repo, 'frontend/package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@bryntum/scheduler-angular'], 'expected Bryntum scheduler dep');
  assert.ok(pkg.dependencies['primeng'], 'expected PrimeNG dep (this branch IS the dps clone)');
});

test('dialog-shift-batch loonpakket banner is Locaties-only', () => {
  const code = readFileSync(
    resolve(
      frontendApp,
      'shared/components/dialog-shift-batch/dialog-shift-batch.component.ts',
    ),
    'utf8',
  );
  assert.match(
    code,
    /if \(this\.mode === 'single'\) return false;/,
    'banner must early-return when single (Medewerkers) mode',
  );
});

test('shift API service exposes cancel + merged-aware create', () => {
  const code = readFileSync(
    resolve(frontendApp, 'core/api/shift/shift.api.service.ts'),
    'utf8',
  );
  assert.match(code, /cancel\(id: string,\s*reason\?:/);
  assert.match(code, /merged:\s*boolean/);
  assert.match(code, /x-poc-shift-merged/);
});

// -- gap-closure UI structural locks --

test('share dialog renders "Beschikbaar deze week" filter (mockup 06 partial)', () => {
  const html = readFileSync(
    resolve(
      frontendApp,
      'shared/components/dialog-shift-share/dialog-shift-share.component.html',
    ),
    'utf8',
  );
  assert.match(html, /Beschikbaar deze week \(/, 'filter chip label present');
  assert.match(html, /addAllAvailable\(\)/, 'bulk-add handler wired');
  assert.match(html, /visiblePool\(\)/, 'list iterates the filtered signal');
});

test('availability API exposes remove (gap 4)', () => {
  const code = readFileSync(
    resolve(frontendApp, 'core/api/availability/availability.api.service.ts'),
    'utf8',
  );
  assert.match(code, /remove\(id: string\)/);
  assert.match(code, /this\.http\.delete<\{ ok: true \}>/);
});

test('mystaffler-preview availability block is click-to-remove', () => {
  const html = readFileSync(
    resolve(
      frontendApp,
      'pages/company/modules/mystaffler-preview/mystaffler-preview.component.html',
    ),
    'utf8',
  );
  assert.match(html, /removeAvailability\(day\.availability\)/);
  assert.match(html, /is-locked/, 'locked state surfaced as a class');
});

test('locations admin shows 7-pill opening-hours strip + per-weekday editor', () => {
  const html = readFileSync(
    resolve(
      frontendApp,
      'pages/company/modules/locations/company-locations.component.html',
    ),
    'utf8',
  );
  assert.match(html, /class="oh-strip"/, 'compact strip present');
  assert.match(html, /class="oh-pill"/, 'per-day pill present');
  assert.match(html, /toggleClosed\(d\.id/, 'editor toggles closed per weekday');
  assert.match(html, /setDayFrom\(d\.id/, 'from-time setter wired');
  assert.match(html, /setDayTo\(d\.id/, 'to-time setter wired');
});

test('service-group API model exposes OpeningHours types', () => {
  const code = readFileSync(
    resolve(frontendApp, 'core/api/service-group/service-group.api.service.ts'),
    'utf8',
  );
  assert.match(code, /export type OpeningHours/);
  assert.match(code, /opening_hours\?:\s*OpeningHours/);
  assert.match(code, /openingHours\?:\s*OpeningHours/, 'create payload accepts openingHours');
});

test('dialog-shift-batch dialog still surfaces the m09 chrome (sub-title, slot-list, vast tag)', () => {
  const html = readFileSync(
    resolve(
      frontendApp,
      'shared/components/dialog-shift-batch/dialog-shift-batch.component.html',
    ),
    'utf8',
  );
  assert.match(html, /m09-vast-tag/, 'mockup 09: vast tag on the slot head');
  assert.match(html, /Bestaande shift gebruiken/);
  assert.match(html, /Nieuwe uren ingeven/);
  assert.match(html, /shouldShowLoonpakketBanner/);
});

// -- MyStaffler-PoC (employee app on :4201) structural locks --

test('mystaffler-poc: API client targets the real employee endpoints (no stub)', () => {
  const code = readFileSync(
    resolve(repo, 'mystaffler-poc/src/api.js'),
    'utf8',
  );
  assert.match(code, /\/employee-login/, 'real login route');
  assert.match(code, /\/employee-set-password/, 'force-reset finalisation');
  assert.match(code, /notifications\(employeeId\)/, 'notification feed');
  assert.doesNotMatch(code, /mystaffler-stub-login/, 'stub login removed');
});

test('mystaffler-poc: client-side password validator matches the server', () => {
  const code = readFileSync(
    resolve(repo, 'mystaffler-poc/src/main.js'),
    'utf8',
  );
  assert.match(code, /validatePasswordClient/);
  assert.match(code, /minstens 8 tekens/);
  assert.match(code, /één cijfer/);
  assert.match(code, /één hoofdletter/);
});

test('mystaffler-poc: force-reset screen renders when authStatus === FORCE_PASSWORD_RESET', () => {
  const code = readFileSync(
    resolve(repo, 'mystaffler-poc/src/main.js'),
    'utf8',
  );
  assert.match(code, /renderForceReset\(\)/);
  assert.match(code, /forceResetUsername/);
});

test('mystaffler-poc: 4-tab bar (planning, beschikbaarheid, meldingen, profiel) + badge', () => {
  const code = readFileSync(
    resolve(repo, 'mystaffler-poc/src/main.js'),
    'utf8',
  );
  assert.match(code, /'planning'/);
  assert.match(code, /'availability'/);
  assert.match(code, /'notifications'/);
  assert.match(code, /'profile'/);
  assert.match(code, /notifCount > 9 \? '9\+' : notifCount/);
});

test('backend employee-login route: lockout uses the 5-attempt 15-min policy', () => {
  const code = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');
  assert.match(code, /LOCKOUT_THRESHOLD = 5/);
  assert.match(code, /LOCKOUT_WINDOW_MS = 15 \* 60 \* 1000/);
  assert.match(code, /authStatus:\s*['"]LOCKED['"]/);
});

test('backend employee-login route exists with FORCE_PASSWORD_RESET branch', () => {
  const code = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');
  assert.match(code, /"\/api\/employee-login"/);
  assert.match(code, /"\/api\/employee-set-password"/);
  assert.match(code, /FORCE_PASSWORD_RESET/);
  assert.match(code, /validatePassword\(/);
});

test('backend notifications route surfaces the 4 known kinds', () => {
  const code = readFileSync(resolve(repo, 'src/server/index.ts'), 'utf8');
  assert.match(code, /"\/api\/notifications"/);
  assert.match(code, /"new_open_shift"/);
  assert.match(code, /"candidate"/);
  assert.match(code, /"selected"/);
  assert.match(code, /"rejected"/);
});
