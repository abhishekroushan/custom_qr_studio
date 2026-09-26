/**
 * server.test.js — backend HTTP integration.
 *
 * Boots backend/server.js on a test port and checks every route previously
 * verified by hand with curl.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3457;
const BASE = `http://localhost:${PORT}`;

let child;

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('test server did not start in time');
}

before(async () => {
  child = spawn('node', ['backend/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(() => {
  if (child && !child.killed) child.kill();
});

describe('backend HTTP API', () => {
  it('health check reports ok', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it('config endpoints return non-empty lists with ids', async () => {
    for (const p of ['input-types', 'templates', 'palettes']) {
      const res = await fetch(`${BASE}/api/${p}`);
      assert.equal(res.status, 200, `/api/${p} status`);
      const body = await res.json();
      assert.ok(Array.isArray(body) && body.length > 0, `/api/${p} non-empty`);
      for (const entry of body) {
        assert.equal(typeof entry.id, 'string', `${p} entry has id`);
      }
    }
  });

  it('palettes list starts with the abyss default', async () => {
    const body = await fetch(`${BASE}/api/palettes`).then((r) => r.json());
    assert.equal(body[0].id, 'abyss');
  });

  it('serves root index.html referencing frontend assets', async () => {
    const res = await fetch(`${BASE}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('frontend/js/app.js'), 'references app bundle');
    assert.ok(html.includes('id="palette-select"'), 'contains palette toolbar');
  });

  it('serves frontend assets at /frontend/* and legacy paths', async () => {
    for (const p of ['/frontend/js/app.js', '/frontend/js/palettes.js', '/frontend/css/styles.css', '/css/styles.css']) {
      const res = await fetch(`${BASE}${p}`);
      assert.equal(res.status, 200, `GET ${p}`);
    }
    const appJs = await fetch(`${BASE}/frontend/js/app.js`).then((r) => r.text());
    assert.ok(appJs.includes('QRShapeRenderer'), 'app bundle content served');
  });
});
