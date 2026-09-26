/**
 * extract.test.js — image → silhouette mask logic (pure functions only).
 *
 * Synthetic pixel buffers stand in for real images: alpha-channel cases
 * (transparent PNG style) and opaque luminance cases (logo-on-white style).
 * Functions under test are invoked inside the VM context via sandbox globals.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

let sandbox;
/** Run an expression in the extract.js context with given globals. */
function run(expr, globals = {}) {
  Object.assign(sandbox, globals);
  return vm.runInContext(expr, sandbox);
}

before(() => {
  sandbox = { URL };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend', 'js', 'extract.js'), 'utf8'), sandbox);
});

/** Build a w*h RGBA buffer: bg fill + optional filled rect. */
function makePixels(w, h, bg, rect) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    data.set(bg, p * 4);
  }
  if (rect) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        data.set(rect.color, (y * w + x) * 4);
      }
    }
  }
  return data;
}

const OPAQUE_WHITE = [255, 255, 255, 255];
const OPAQUE_BLACK = [0, 0, 0, 255];
const TRANSPARENT = [0, 0, 0, 0];
const OPAQUE_RED = [255, 0, 0, 255];

describe('hasUsableAlpha', () => {
  it('true for mixed transparent/opaque images', () => {
    const data = makePixels(4, 4, TRANSPARENT, { x: 1, y: 1, w: 2, h: 2, color: OPAQUE_RED });
    assert.equal(run('hasUsableAlpha(data)', { data }), true);
  });

  it('false for fully opaque photos', () => {
    assert.equal(run('hasUsableAlpha(data)', { data: makePixels(4, 4, OPAQUE_WHITE) }), false);
  });

  it('false for fully transparent images', () => {
    assert.equal(run('hasUsableAlpha(data)', { data: makePixels(4, 4, TRANSPARENT) }), false);
  });
});

describe('extractMask', () => {
  it('alpha path: opaque square on transparent ground', () => {
    const data = makePixels(4, 4, TRANSPARENT, { x: 1, y: 1, w: 2, h: 2, color: OPAQUE_RED });
    const r = run('extractMask(data, 4, 4)', { data });
    assert.equal(r.source, 'alpha');
    assert.equal(r.empty, false);
    assert.equal(r.coverage, 0.25);
    // Center pixel inside, corner pixel outside.
    assert.equal(r.mask[1 * 4 + 1], 255);
    assert.equal(r.mask[0], 0);
  });

  it('threshold path: black square on opaque white', () => {
    const data = makePixels(4, 4, OPAQUE_WHITE, { x: 1, y: 1, w: 2, h: 2, color: OPAQUE_BLACK });
    const r = run('extractMask(data, 4, 4)', { data });
    assert.equal(r.source, 'threshold');
    assert.equal(r.empty, false);
    assert.equal(r.coverage, 0.25);
    assert.equal(r.mask[1 * 4 + 1], 255);
    assert.equal(r.mask[0], 0);
  });

  it('empty for all-white and all-black images', () => {
    const white = run('extractMask(data, 4, 4)', { data: makePixels(4, 4, OPAQUE_WHITE) });
    assert.equal(white.empty, true, 'blank page has nothing to extract');
    assert.equal(white.coverage, 0);
    const black = run('extractMask(data, 4, 4)', { data: makePixels(4, 4, OPAQUE_BLACK) });
    assert.equal(black.empty, true, 'full-bleed black is not an object');
    assert.equal(black.coverage, 1);
  });

  it('invert flips inside and outside', () => {
    const data = makePixels(4, 4, OPAQUE_WHITE, { x: 1, y: 1, w: 2, h: 2, color: OPAQUE_BLACK });
    const normal = run('extractMask(data, 4, 4)', { data });
    const flipped = run('extractMask(data, 4, 4, { invert: true })', { data });
    assert.equal(flipped.mask[1 * 4 + 1], 0, 'former object is now outside');
    assert.equal(flipped.mask[0], 255, 'former background is now inside');
    assert.ok(Math.abs(flipped.coverage - (1 - normal.coverage)) < 1e-9);
  });

  it('threshold cutoff is respected', () => {
    const gray100 = makePixels(2, 2, [100, 100, 100, 255]);
    const loose = run('extractMask(data, 2, 2, { threshold: 128 })', { data: gray100 });
    assert.equal(loose.mask[0], 255, 'gray 100 < 128 is inside');
    const strict = run('extractMask(data, 2, 2, { threshold: 50 })', { data: gray100 });
    assert.equal(strict.mask[0], 0, 'gray 100 >= 50 is outside');
  });

  it('coverage boundary: 2% counts, 1% is empty', () => {
    // 10x10, all opaque white + N black pixels.
    const two = makePixels(10, 10, OPAQUE_WHITE, { x: 0, y: 0, w: 2, h: 1, color: OPAQUE_BLACK });
    assert.equal(run('extractMask(data, 10, 10)', { data: two }).empty, false);
    const one = makePixels(10, 10, OPAQUE_WHITE, { x: 0, y: 0, w: 1, h: 1, color: OPAQUE_BLACK });
    assert.equal(run('extractMask(data, 10, 10)', { data: one }).empty, true);
  });
});

describe('classifyImageSource', () => {
  it('accepts data:image URLs (copy-image-address pastes)', () => {
    const src = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
    // Field-wise compare: objects built inside the VM carry another realm's prototype.
    const r = run('classifyImageSource(s)', { s: src });
    assert.equal(r.kind, 'data-url');
    assert.equal(r.src, src);
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(run('classifyImageSource(s)', { s: png }).kind, 'data-url');
  });

  it('accepts http(s) URLs', () => {
    const r = run("classifyImageSource('https://example.com/a.png')");
    assert.equal(r.kind, 'http-url');
    assert.equal(r.src, 'https://example.com/a.png');
  });

  it('rejects non-image data URLs and bad URLs', () => {
    for (const bad of ['', 'not a url', 'ftp://example.com/a.png', 'data:text/plain;base64,aGk=', 'data:image/pngnotbase64,xxx']) {
      assert.throws(() => run('classifyImageSource(s)', { s: bad }), `rejects ${JSON.stringify(bad).slice(0, 40)}`);
    }
  });
});

describe('validateImageUrl + extractErrorMessage', () => {
  it('accepts http(s), rejects the rest', () => {
    assert.equal(run("validateImageUrl('https://example.com/a.png')"), 'https://example.com/a.png');
    for (const bad of ['', 'not a url', 'ftp://example.com/a.png', 'javascript:alert(1)']) {
      assert.throws(() => run('validateImageUrl(s)', { s: bad }), 'rejects ' + JSON.stringify(bad));
    }
  });

  it('every error code maps to a helpful message', () => {
    const codes = ['invalid-url', 'load-failed', 'cors-tainted', 'empty-mask', 'weird'];
    const messages = codes.map((code) => run('extractErrorMessage({ code })', { code }));
    for (const [code, msg] of codes.map((c, i) => [c, messages[i]])) {
      assert.equal(typeof msg, 'string', `${code} maps to a string`);
      assert.ok(msg.length > 10, `${code} message is helpful`);
    }
    assert.ok(messages[2].toLowerCase().includes('upload'), 'cors error suggests uploading');
  });
});
