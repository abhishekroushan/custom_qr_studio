/**
 * server.js — minimal backend for QR Shape Mask Studio.
 *
 * Responsibilities:
 *   1. Serve the app (root index.html + frontend/ assets) so `npm start`
 *      gives you the full app at http://localhost:3000 with no build step.
 *      index.html lives at the repo root for GitHub Pages; assets stay in
 *      frontend/css + frontend/js and are mounted at /frontend to match the
 *      Pages-relative paths (the bare static mount keeps old /css + /js URLs
 *      working too).
 *   2. Serve /api/input-types and /api/templates from JSON config files.
 *      The frontend treats these lists as the source of truth for WHAT is
 *      enabled (and in what order); the drawing/encoding logic stays in
 *      frontend/js/*.js. To extend the app, edit the JSON + the matching
 *      frontend registry — no server restart logic beyond a file read.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_DIR = path.join(__dirname, 'config');

function loadJson(name) {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8');
  return JSON.parse(raw);
}

app.get('/api/input-types', (req, res) => {
  res.json(loadJson('input-types.json'));
});

app.get('/api/templates', (req, res) => {
  res.json(loadJson('templates.json'));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Static assets. /frontend/* mirrors the GitHub Pages relative paths used by
// root index.html; the bare mount keeps legacy /css/* + /js/* URLs working.
// Must come after /api routes.
app.use('/frontend', express.static(FRONTEND_DIR));
app.use(express.static(FRONTEND_DIR));

// Root entry page (lives at repo root for GitHub Pages).
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QR Shape Mask Studio: http://localhost:${PORT}`);
});
