/**
 * renderer.test.js — QRShapeRenderer pipeline with mocked canvas/DOM.
 *
 * Verifies the fade (not deletion) compositing contract:
 * full-strength base -> even-odd outside wash -> 3 full-contrast anchors.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FRONTEND_JS = path.join(ROOT, 'frontend', 'js');
const SIZE = 400;

function loadRenderer() {
  const constructions = [];
  const timers = [];
  // complete:true mirrors a fully-loaded <img> from qrcodejs.
  const source = { complete: true, naturalWidth: 256, naturalHeight: 256, width: 256, height: 256 };
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, p) => (...a) => { calls.push({ method: p, args: a }); },
      set: (t, p, v) => { t[p] = v; calls.push({ set: p, value: v }); return true; },
    },
  );
  const canvas = { width: SIZE, height: SIZE, getContext: () => ctx };
  const rawQrDiv = { innerHTML: '', querySelector: () => source };

  // document.createElement stub for the bitmap overlay canvas.
  const overlayCalls = [];
  const overlayCtx = new Proxy(
    {},
    {
      get: (_t, p) => (...a) => { overlayCalls.push({ method: p, args: a }); },
      set: (t, p, v) => { t[p] = v; overlayCalls.push({ set: p, value: v }); return true; },
    },
  );
  const overlayCanvases = [];
  const fakeDocument = {
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => overlayCtx };
      overlayCanvases.push(c);
      return c;
    },
  };

  const sandbox = {
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    document: fakeDocument,
    QRCode: class {
      constructor(el, opts) { constructions.push({ el, opts }); }
      static CorrectLevel = { H: 'H' };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(FRONTEND_JS, 'templates.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(FRONTEND_JS, 'renderer.js'), 'utf8'), sandbox);
  sandbox.rawQrDiv = rawQrDiv;
  sandbox.canvas = canvas;
  const renderer = vm.runInContext('new QRShapeRenderer(rawQrDiv, canvas)', sandbox);
  return { sandbox, renderer, calls, constructions, timers, source, overlayCalls, overlayCanvases };
}

const drawImages = (calls) => calls.filter((c) => c.method === 'drawImage');
const fills = (calls, value) => calls.filter((c) => c.set === 'fillStyle' && c.value === value);

describe('QRShapeRenderer', () => {
  let r;
  beforeEach(() => { r = loadRenderer(); });

  it('generates the raw QR at Level H, 256x256', () => {
    r.renderer.render('https://example.com', 'heart', 0.5);
    assert.equal(r.constructions.length, 1);
    const opts = r.constructions[0].opts;
    assert.equal(opts.text, 'https://example.com');
    assert.equal(opts.width, 256);
    assert.equal(opts.height, 256);
    assert.equal(opts.correctLevel, 'H');
  });

  it('heart@0.5: full base + even-odd wash + 3 anchors (4 drawImages)', () => {
    r.renderer.render('https://example.com', 'heart', 0.5);
    assert.equal(r.timers.length, 1);
    r.timers[0](); // run the scheduled composite

    const images = drawImages(r.calls);
    assert.equal(images.length, 4, '1 full QR + 3 finder anchors');

    // White background under the full QR.
    assert.ok(fills(r.calls, '#ffffff').length >= 1, 'white base fill');
    assert.ok(r.calls.some((c) => c.method === 'clearRect'), 'canvas cleared');

    // Outside-only wash at the requested strength.
    assert.ok(r.calls.some((c) => c.method === 'clip' && c.args[0] === 'evenodd'), 'even-odd clip');
    const overlay = r.calls.find((c) => c.set === 'fillStyle' && String(c.value).startsWith('rgba'));
    assert.ok(overlay, 'translucent white overlay applied');
    assert.ok(overlay.value.includes('0.5'), `overlay uses fade 0.5 (got ${overlay.value})`);
  });

  it('square template skips the wash (plain QR + anchors)', () => {
    r.renderer.render('https://example.com', 'square', 0.5);
    r.timers[0]();
    assert.ok(!r.calls.some((c) => c.method === 'clip' && c.args[0] === 'evenodd'), 'no wash for square');
    assert.equal(drawImages(r.calls).length, 4, 'full QR + 3 anchors still drawn');
  });

  it('anchors are ~28% edge squares at the three corners', () => {
    r.renderer.render('https://example.com', 'heart', 0.5);
    r.timers[0]();
    const anchors = drawImages(r.calls).filter((c) => c.args.length === 9);
    assert.equal(anchors.length, 3);
    const d = SIZE * 0.28;
    const dests = anchors.map((c) => [c.args[5], c.args[6]]);
    for (const [dx, dy] of dests) {
      const near = (v, e) => Math.abs(v - e) < 1e-6;
      const corner = (near(dx, 0) || near(dx, SIZE - d)) && (near(dy, 0) || near(dy, SIZE - d));
      assert.ok(corner, `anchor at (${dx}, ${dy}) sits in a corner`);
    }
  });

  it('refade reuses the cached QR without regenerating the matrix', () => {
    r.renderer.render('https://example.com', 'heart', 0.5);
    r.timers[0]();
    assert.equal(r.constructions.length, 1);
    r.renderer.refade('heart', 0.3);
    assert.equal(r.constructions.length, 1, 'no new QRCode built');
    const overlay = r.calls
      .filter((c) => c.set === 'fillStyle' && String(c.value).startsWith('rgba'))
      .pop();
    assert.ok(overlay.value.includes('0.3'), 'refade applied the new strength');
  });

  it('renderWithBitmap: overlay-cut wash, anchors kept (5 drawImages)', () => {
    const mask = { __mask: true };
    r.renderer.renderWithBitmap('https://example.com', mask, 0.5);
    assert.equal(r.constructions.length, 1, 'one QR matrix built');
    r.timers[0]();

    // Main canvas: full QR + overlay stamp + 3 anchors.
    assert.equal(drawImages(r.calls).length, 5);

    // Overlay: wash fill at strength, silhouette punched out, mask stamped.
    assert.equal(r.overlayCanvases.length, 1, 'one offscreen overlay');
    assert.equal(r.overlayCanvases[0].width, SIZE);
    const wash = r.overlayCalls.find(
      (c) => c.set === 'fillStyle' && String(c.value).startsWith('rgba'),
    );
    assert.ok(wash && wash.value.includes('0.5'), 'overlay wash uses fade 0.5');
    assert.ok(
      r.overlayCalls.some((c) => c.set === 'globalCompositeOperation' && c.value === 'destination-out'),
      'silhouette punched via destination-out',
    );
    const stamp = r.overlayCalls.find((c) => c.method === 'drawImage');
    assert.ok(stamp, 'mask stamped onto overlay');
    assert.equal(stamp.args[0], mask, 'the provided mask canvas is used');
  });

  it('custom refade reuses the bitmap without rebuilding anything', () => {
    const mask = { __mask: true };
    r.renderer.renderWithBitmap('https://example.com', mask, 0.5);
    r.timers[0]();
    assert.equal(r.constructions.length, 1);
    r.renderer.refade('custom', 0.3);
    assert.equal(r.constructions.length, 1, 'no new QRCode built');
    const wash = r.overlayCalls
      .filter((c) => c.set === 'fillStyle' && String(c.value).startsWith('rgba'))
      .pop();
    assert.ok(wash.value.includes('0.3'), 'custom refade applied the new strength');
  });
});
