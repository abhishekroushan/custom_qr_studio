/**
 * config.test.js — backend JSON configs are valid and well-formed.
 *
 * Covers the manual checks previously done via:
 *   node -e "JSON.parse(readFileSync('backend/config/*.json'))"
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'backend', 'config');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8'));
}

describe('backend config files', () => {
  it('all three config files parse as JSON arrays', () => {
    for (const f of ['input-types.json', 'templates.json', 'palettes.json']) {
      assert.ok(Array.isArray(load(f)), `${f} should be an array`);
    }
  });

  it('input-types entries have id/label/enabled/fields', () => {
    const types = load('input-types.json');
    assert.ok(types.length >= 1, 'at least one input type');
    for (const t of types) {
      assert.equal(typeof t.id, 'string', 'id is a string');
      assert.equal(typeof t.label, 'string', 'label is a string');
      assert.equal(typeof t.enabled, 'boolean', 'enabled is a boolean');
      assert.ok(Array.isArray(t.fields) && t.fields.length >= 1, `${t.id} has fields`);
      for (const f of t.fields) {
        for (const k of ['key', 'label', 'placeholder']) {
          assert.equal(typeof f[k], 'string', `${t.id}.${k} is a string`);
        }
      }
    }
  });

  it('website input type is present and enabled', () => {
    const types = load('input-types.json');
    const website = types.find((t) => t.id === 'website');
    assert.ok(website, 'website entry exists');
    assert.equal(website.enabled, true);
  });

  it('template entries have id/name/icon/enabled', () => {
    const templates = load('templates.json');
    const ids = templates.map((t) => t.id);
    // Six vector shapes; custom silhouettes live in their own section.
    assert.deepEqual(ids, ['heart', 'star', 'diamond', 'shield', 'circle', 'square']);
    for (const t of templates) {
      assert.equal(typeof t.name, 'string');
      assert.equal(typeof t.icon, 'string');
      assert.equal(typeof t.enabled, 'boolean');
    }
  });

  it('palette entries have id/name/description/enabled, abyss first', () => {
    const palettes = load('palettes.json');
    assert.ok(palettes.length >= 2, 'multiple palettes');
    assert.equal(palettes[0].id, 'abyss', 'abyss is the default (first) palette');
    for (const p of palettes) {
      assert.equal(typeof p.name, 'string');
      assert.equal(typeof p.description, 'string');
      assert.equal(typeof p.enabled, 'boolean');
    }
  });

  it('ids are unique within each config file', () => {
    for (const f of ['input-types.json', 'templates.json', 'palettes.json']) {
      const ids = load(f).map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, `${f} has no duplicate ids`);
    }
  });
});
