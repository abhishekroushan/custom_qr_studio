/**
 * frontend.test.js — index.html / app.js / styles.css stay wired together and
 * share the same defaults (fade, palette, example URL).
 *
 * Covers the manual greps previously run after each UI change.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');
const appJs = read('frontend/js/app.js');
const rendererJs = read('frontend/js/renderer.js');
const css = read('frontend/css/styles.css');
const serverJs = read('backend/server.js');

describe('index.html wiring', () => {
  it('every getElementById target in app.js exists in index.html', () => {
    const used = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(used.length > 0, 'app.js looks up elements');
    for (const id of used) {
      assert.ok(html.includes(`id="${id}"`), `index.html has #${id}`);
    }
  });

  it('script tags resolve to real files, in registry-before-app order', () => {
    const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
      .filter((s) => !s.startsWith('http'));
    assert.deepEqual(srcs, [
      'frontend/js/inputs.js',
      'frontend/js/templates.js',
      'frontend/js/palettes.js',
      'frontend/js/renderer.js',
      'frontend/js/app.js',
    ]);
    for (const s of srcs) {
      assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} exists`);
    }
  });

  it('stylesheet link resolves to a real file', () => {
    const href = html.match(/<link rel="stylesheet" href="([^"]+)" \/>/)[1];
    assert.ok(fs.existsSync(path.join(ROOT, href)), `${href} exists`);
  });

  it('divs are balanced', () => {
    const open = (html.match(/<div\b/g) || []).length;
    const close = (html.match(/<\/div>/g) || []).length;
    assert.equal(open, close, 'balanced divs');
  });

  it('palette toolbar sits above (not inside) the preview window', () => {
    const toolbarAt = html.indexOf('preview-toolbar');
    const panelAt = html.indexOf('preview-panel');
    const hintAt = html.indexOf('ACP: accessible color palette');
    assert.ok(toolbarAt !== -1 && toolbarAt < panelAt, 'toolbar precedes preview window');
    assert.ok(hintAt > toolbarAt && hintAt < panelAt, 'ACP hint between toolbar and window');
  });
});

describe('frontend/backend API contract', () => {
  it('every /api/* path fetched by app.js has a server route', () => {
    const fetched = [...new Set([...appJs.matchAll(/fetchConfig\('(\/api\/[^']+)'\)/g)].map((m) => m[1]))];
    assert.ok(fetched.length >= 3, 'app fetches input-types, templates, palettes');
    const routes = [...serverJs.matchAll(/app\.get\('(\/api\/[^']+)'/g)].map((m) => m[1]);
    for (const p of fetched) {
      assert.ok(routes.includes(p), `server serves ${p}`);
    }
  });
});

describe('shared defaults', () => {
  it('fade default is 0.50 in app, renderer, and slider', () => {
    const appFade = parseFloat(appJs.match(/let currentFade = ([\d.]+)/)[1]);
    const rendererDefault = parseFloat(rendererJs.match(/fadeStrength = ([\d.]+)\)/)[1]);
    const sliderValue = parseInt(html.match(/id="fade-slider"[^>]*value="(\d+)"/)[1], 10) / 100;
    assert.equal(appFade, 0.5);
    assert.equal(rendererDefault, appFade);
    assert.equal(sliderValue, appFade);
  });

  it(':root fallback colors equal the default palette', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(read('frontend/js/palettes.js'), sandbox);
    // Top-level const/let live in the context scope — read them back out.
    const expected = vm.runInContext('PALETTES[DEFAULT_PALETTE].colors', sandbox);
    const DEFAULT_PALETTE = vm.runInContext('DEFAULT_PALETTE', sandbox);
    const rootBlock = css.match(/:root\s*{([^}]+)}/)[1];
    for (const [variable, value] of Object.entries(expected)) {
      assert.ok(
        rootBlock.includes(`${variable}: ${value}`),
        `:root sets ${variable} to the default (${DEFAULT_PALETTE}) value`,
      );
    }
  });

  it('example URL is the Wikipedia main page in app and README', () => {
    const url = 'https://en.wikipedia.org/wiki/Main_Page';
    assert.ok(appJs.includes(url), 'app.js prefills the Wikipedia URL');
    assert.ok(read('README.md').includes(url), 'README documents the Wikipedia URL');
    assert.ok(!appJs.includes('barkod.studio'), 'old example URL is gone');
  });
});
