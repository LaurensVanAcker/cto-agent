import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const BG_PATH = resolve(repo, 'frontend/src/assets/images/background.jpeg');
const SCSS_PATH = resolve(repo, 'frontend/src/app/pages/login/login.component.scss');
const ANGULAR_JSON = resolve(repo, 'frontend/angular.json');

test('background photo asset exists and is non-empty', () => {
  const s = statSync(BG_PATH);
  assert.ok(s.isFile(), `expected file at ${BG_PATH}`);
  assert.ok(s.size > 50_000, `background.jpeg suspiciously small (${s.size} bytes)`);
});

test('background photo is reasonably sized for web (< 1 MB) and is a JPEG', () => {
  const s = statSync(BG_PATH);
  assert.ok(
    s.size < 1_000_000,
    `background.jpeg too heavy for a login background (${s.size} bytes). Re-export at q=78, ~2400px wide.`
  );
  // JPEG magic bytes: FF D8 FF
  const head = readFileSync(BG_PATH).subarray(0, 3);
  assert.equal(head[0], 0xff);
  assert.equal(head[1], 0xd8);
  assert.equal(head[2], 0xff);
});

test('login SCSS references the background asset on .login-page', () => {
  const scss = readFileSync(SCSS_PATH, 'utf8');
  const block = scss.match(/\.login-page\s*\{[^}]*\}/);
  assert.ok(block, '.login-page rule not found');
  assert.match(
    block[0],
    /background[^;]*url\(['"]?\/?assets\/images\/background\.jpeg['"]?\)/,
    '.login-page must use background url(/assets/images/background.jpeg)'
  );
});

test('angular.json registers src/assets as a build asset glob', () => {
  const cfg = JSON.parse(readFileSync(ANGULAR_JSON, 'utf8'));
  const assets = cfg.projects.frontend.architect.build.options.assets;
  assert.ok(Array.isArray(assets), 'build.options.assets must be an array');
  const hasAssetsGlob = assets.some(
    (a) => typeof a === 'object' && a.input === 'src/assets' && a.glob && a.output
  );
  assert.ok(hasAssetsGlob, 'expected an assets entry with input "src/assets"');
});
