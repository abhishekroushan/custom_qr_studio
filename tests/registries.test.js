/**
 * registries.test.js — frontend registries behave correctly and stay in sync
 * with the backend JSON configs.
 *
 * Covers the manual checks previously done via node -e id comparisons, plus
 * behavioral checks on buildPayload/validate/draw/applyPalette.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND_JS = path.join(ROOT, 'frontend', 'js');
const CONFIG_DIR = path.join(ROOT, 'backend', 'config');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8'));
}

/** Execute plain-script frontend files in a shared VM context with DOM stubs. */
function makeContext() {
  const appliedVars = {};
  const sandbox = {
    document: {
      documentElement: { style: { setProperty: (k, v) => { appliedVars[k] = v; } } },
    },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = v; } },
    URL,
  };
  vm.createContext(sandbox);
  for (const f of ['inputs.js', 'templates.js', 'palettes.js']) {
    vm.runInContext(fs.readFileSync(path.join(FRONTEND_JS, f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, appliedVars };
}

/** Proxy ctx recording every method call — enough for path smoke tests. */
function mockPathCtx() {
  const calls = [];
  return {
    calls,
    ctx: new Proxy({}, { get: (_t, p) => (...a) => { calls.push({ method: p, args: a }); } }),
  };
}

let ctx;
before(() => { ctx = makeContext(); });

describe('INPUT_TYPES registry', () => {
  it('every backend input id has a frontend implementation', () => {
    const INPUT_TYPES = vm.runInContext('INPUT_TYPES', ctx.sandbox);
    for (const t of loadJson('input-types.json')) {
      assert.ok(INPUT_TYPES[t.id], `INPUT_TYPES.${t.id} implemented`);
      for (const k of ['id', 'label', 'fields', 'buildPayload', 'validate']) {
        assert.ok(INPUT_TYPES[t.id][k] !== undefined, `${t.id} has ${k}`);
      }
    }
  });

  it('website normalizes bare domains and validates URLs', () => {
    const website = vm.runInContext('INPUT_TYPES.website', ctx.sandbox);
    assert.equal(website.buildPayload({ url: 'example.com' }), 'https://example.com');
    assert.equal(website.buildPayload({ url: 'https://example.com' }), 'https://example.com');
    assert.equal(website.validate({ url: 'https://en.wikipedia.org/wiki/Main_Page' }), null);
    assert.equal(typeof website.validate({ url: '' }), 'string', 'empty url errors');
    assert.equal(typeof website.validate({ url: 'not a url with spaces' }), 'string', 'bad url errors');
  });

  it('text passes content through and requires non-empty input', () => {
    const text = vm.runInContext('INPUT_TYPES.text', ctx.sandbox);
    assert.equal(text.buildPayload({ text: '  hi  ' }), 'hi');
    assert.equal(text.validate({ text: 'hi' }), null);
    assert.equal(typeof text.validate({ text: '   ' }), 'string');
  });
});

describe('TEMPLATE_OBJECTS registry', () => {
  it('every backend template id has a draw() implementation', () => {
    const TEMPLATES = vm.runInContext('TEMPLATE_OBJECTS', ctx.sandbox);
    for (const t of loadJson('templates.json')) {
      assert.ok(TEMPLATES[t.id], `TEMPLATE_OBJECTS.${t.id} implemented`);
      assert.equal(typeof TEMPLATES[t.id].draw, 'function');
    }
  });

  it('every draw() emits canvas path commands without throwing', () => {
    const TEMPLATES = vm.runInContext('TEMPLATE_OBJECTS', ctx.sandbox);
    for (const [id, t] of Object.entries(TEMPLATES)) {
      for (const size of [400, 200]) {
        const { calls, ctx: mock } = mockPathCtx();
        t.draw(mock, size / 2, size / 2, size);
        assert.ok(calls.length > 0, `${id} emits path commands at size ${size}`);
      }
    }
  });

  it('no custom entry: silhouettes live outside the shape registry', () => {
    const TEMPLATES = vm.runInContext('TEMPLATE_OBJECTS', ctx.sandbox);
    assert.ok(!('custom' in TEMPLATES), 'shape grid is the six vector shapes only');
  });
});

describe('PALETTES registry', () => {
  const EXPECTED_VARS = [
    '--bg-primary', '--bg-secondary', '--accent', '--text', '--muted',
    '--border', '--input-text', '--on-accent', '--error',
  ];

  it('every backend palette id has a full 9-variable implementation', () => {
    const PALETTES = vm.runInContext('PALETTES', ctx.sandbox);
    for (const p of loadJson('palettes.json')) {
      assert.ok(PALETTES[p.id], `PALETTES.${p.id} implemented`);
      const missing = EXPECTED_VARS.filter((v) => !(v in PALETTES[p.id].colors));
      assert.deepEqual(missing, [], `${p.id} supplies all variables`);
    }
  });

  it('DEFAULT_PALETTE matches the first backend entry (abyss)', () => {
    const DEFAULT_PALETTE = vm.runInContext('DEFAULT_PALETTE', ctx.sandbox);
    assert.equal(DEFAULT_PALETTE, 'abyss');
    assert.equal(loadJson('palettes.json')[0].id, DEFAULT_PALETTE);
  });

  it('applyPalette sets all variables, rejects unknown ids', () => {
    const ok = vm.runInContext("applyPalette('day')", ctx.sandbox);
    assert.equal(ok, true);
    assert.equal(ctx.appliedVars['--bg-primary'], '#f1f5f9');
    assert.equal(vm.runInContext("applyPalette('nope')", ctx.sandbox), false);
  });
});
