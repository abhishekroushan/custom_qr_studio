/**
 * accessibility.test.js — every palette meets WCAG contrast minimums and the
 * QR matrix itself is never tinted (always black-on-white for scanners).
 *
 * Codifies the contrast math previously run ad-hoc in node -e snippets, plus
 * the measured fade-threshold documentation (65% wash -> gray ~166).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function loadPalettes() {
  const sandbox = { document: { documentElement: { style: { setProperty: () => {} } } } };
  vm.createContext(sandbox);
  vm.runInContext(read('frontend/js/palettes.js'), sandbox);
  return vm.runInContext('PALETTES', sandbox);
}

describe('palette contrast (WCAG AA)', () => {
  const PALETTES = loadPalettes();

  it('body text reaches 4.5:1 on every palette', () => {
    for (const [id, p] of Object.entries(PALETTES)) {
      const r = contrast(p.colors['--text'], p.colors['--bg-primary']);
      assert.ok(r >= 4.5, `${id} text/bg ${r.toFixed(2)} >= 4.5`);
    }
  });

  it('muted text reaches 3:1 on every palette', () => {
    for (const [id, p] of Object.entries(PALETTES)) {
      const r = contrast(p.colors['--muted'], p.colors['--bg-primary']);
      assert.ok(r >= 3, `${id} muted/bg ${r.toFixed(2)} >= 3`);
    }
  });

  it('accent buttons (on-accent on accent) reach 3:1', () => {
    for (const [id, p] of Object.entries(PALETTES)) {
      const r = contrast(p.colors['--on-accent'], p.colors['--accent']);
      assert.ok(r >= 3, `${id} button ${r.toFixed(2)} >= 3`);
    }
  });
});

describe('QR scannability guards', () => {
  it('renderer always paints a white base under the matrix', () => {
    const rendererJs = read('frontend/js/renderer.js');
    assert.ok(rendererJs.includes("fillStyle = '#ffffff'"), 'white base fill present');
  });

  it('measured fade threshold math holds: 65% wash -> gray ~166', () => {
    // Black module (0) under white at alpha a renders as gray 255*a.
    // Real-camera testing found Heart starts scanning at ~65-66%.
    const grayAt = (a) => Math.round(255 * a);
    assert.equal(grayAt(0.65), 166);
    assert.ok(grayAt(0.5) < grayAt(0.65), '50% default is darker (safer) than the threshold');
  });

  it('default fade (0.50) sits below the measured 0.65 threshold', () => {
    const appJs = read('frontend/js/app.js');
    const currentFade = parseFloat(appJs.match(/let currentFade = ([\d.]+)/)[1]);
    assert.ok(currentFade < 0.65, `default ${currentFade} has headroom under 0.65`);
  });
});
