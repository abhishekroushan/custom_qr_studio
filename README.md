# QR Shape Mask Studio

Templatized QR code generator: type a **website URL** (or other input types later),
pick a **template object** (heart, star, diamond, shield, circle, square), and the
app renders the QR masked into that silhouette — while keeping it scannable.

Derived from `prototype.md` (single-file prototype), refactored into a modular
`frontend/` + `backend/` layout for extensibility.

## Project structure

```
.
├── index.html                # page skeleton (repo root, for GitHub Pages)
├── prototype.md                # original single-file prototype (reference)
├── frontend/
│   ├── css/styles.css          # dark-theme layout (extracted from prototype)
│   └── js/
│       ├── inputs.js           # INPUT_TYPES registry — what can become a QR
│       ├── templates.js        # TEMPLATE_OBJECTS registry — overlay shapes
│       ├── renderer.js         # QRShapeRenderer: QR → fade wash → finder fix
│       └── app.js              # glue: config fetch, dynamic form, events
├── backend/
│   ├── server.js               # Express: serves root index.html + /api/* config
│   ├── package.json
│   └── config/
│       ├── input-types.json    # which input types are enabled + field metadata
│       └── templates.json      # which template objects are enabled + order
└── README.md
```

## How the HTML works

### `index.html` — the page

The page has two columns inside `.container`:

1. **Control panel (left)**
   - `<select id="input-type-select">` — empty in the HTML; `app.js` fills it
     from `GET /api/input-types` (fallback: `INPUT_TYPES` in `inputs.js`).
   - `<div id="dynamic-fields">` — empty in the HTML; `app.js` renders one
     `<input>` per field of the selected input type. For `website` this is a
     single "Target URL" box defaulting to `https://en.wikipedia.org/wiki/Main_Page`.
   - `<div id="shape-grid">` — empty in the HTML; `app.js` renders one button
     per entry from `GET /api/templates` (fallback: `TEMPLATE_OBJECTS`).
   - Download button — exports the visible canvas as PNG via
     `canvas.toDataURL('image/png')`.

2. **Preview panel (right)**
   - `<div id="raw-qr">` — hidden (`display: none`). The qrcodejs engine paints
     its raw **square** QR here (an `<img>`/`<canvas>`). It is never shown; the
     renderer only reads its pixels.
   - `<canvas id="output-canvas" width="400" height="400">` — the visible
     output: white background + masked QR + restored finder patterns.
   - Warning text noting Level H error correction is active.

3. **Script loading (order matters)** — asset paths are relative to the repo
    root so the same file works on GitHub Pages and via the backend:
    ```html
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="frontend/js/inputs.js"></script>
    <script src="frontend/js/templates.js"></script>
    <script src="frontend/js/renderer.js"></script>
    <script src="frontend/js/app.js"></script>
    ```
   The CDN provides the `QRCode` global with `QRCode.CorrectLevel.H`.
   (Note: `prototype.md` listed `https://cloudflare.com` as the script src,
   which is not a JS file — the modular version uses the correct cdnjs URL.)

### Rendering pipeline (`js/renderer.js`)

Each keystroke / shape click runs:

1. **Raw QR generation** — `new QRCode(rawQrDiv, { text: payload, width: 256,
   height: 256, correctLevel: QRCode.CorrectLevel.H })`. Level H gives ~30%
   data recovery as a safety net.
2. **Full-strength base** — clear canvas, fill white, `drawImage()` the entire
   QR at full contrast. No modules are ever deleted.
3. **Outside-shape wash** — build an even-odd path (full-canvas rect + template
   silhouette from `TEMPLATE_OBJECTS`), `clip('evenodd')`, then fill with
   `rgba(255,255,255,fade)`. Inside-shape modules stay pure black; outside
    modules turn light gray — visually receding but still decodable. The
    **fade slider** (0–95%, default 50%) controls this live via the cheap
   `renderer.refade()` path, which reuses the cached raw QR without
   regenerating the matrix. `square` skips the wash (plain QR).
4. **Finder-pattern restore** — the 3 corner squares (top-left, top-right,
   bottom-left) are stamped back at full contrast with independent
   source/destination scaling.

Why fade instead of hard-clip? The original hard-clip deleted every module
outside the heart/star path. Level H only recovers ~30% damage and a heart
crop destroys far more — hence only "Full Block" scanned. Fade keeps 100% of
modules and expresses the shape through contrast instead of deletion.

Measured threshold (real phone camera, Heart template): scanning starts
working at ~65–66% fade and passes reliably below 65%. In pixel terms, a 65%
white wash turns black modules to gray ~166 — dimmer than that and decoders
give up. The UI therefore defaults to 50%: short URLs (e.g. barkod.studio)
scan up to ~65%, but denser payloads like long Wikipedia URLs need the extra
contrast — 60% already fails there. Rule of thumb: the longer the content,
the lower the fade.
Other shapes will have their own nearby thresholds; the slider max (95%) is
kept for experimentation, not production use.

### Input templatizing (`js/inputs.js` + `backend/config/input-types.json`)

- `website.buildPayload()` trims the field, prepends `https://` when no scheme
  is present, and returns the URL string encoded into the QR.
- `website.validate()` uses `new URL(...)` and surfaces an inline error.
- `text` is included as a second trivial type; wifi/vCard/sms are sketched as
  comments. Backend JSON controls which ids appear and in what order — the
  frontend skips ids it has no implementation for.

### Template objects (`js/templates.js` + `backend/config/templates.json`)

Each shape is `{ id, name, icon, draw(ctx, cx, cy, size) }`. Current set, ported
from the prototype paths: `heart` (cubic Béziers), `star` (5-spike polar loop),
`diamond` (4 lines), `shield` (quadratics), `circle` (`arc`), `square` (`rect`
inset 5%). Backend JSON controls the button list/order.

## Run it

**Option A — with backend (recommended for local dev):**
```bash
cd backend
npm install
npm start
# open http://localhost:3000
```
The server serves root `index.html` plus `/api/*` config; `frontend/` assets
are mounted at `/frontend` to match the Pages-relative paths.

**Option B — GitHub Pages (no backend):**
`index.html` lives at the repo root, so enable Pages with **Deploy from a
branch**, folder **/** (root). The app detects the missing `/api/*` endpoints
and falls back to the local `INPUT_TYPES` / `TEMPLATE_OBJECTS` registries —
full functionality, no server. (Requires internet for the qrcodejs CDN.)

**Option C — static preview locally:**
```bash
npx serve .
# open the printed URL — index.html loads at /
```
Same fallback behavior as Pages.

## Extending

- **New input type** (e.g. Wi-Fi): add implementation to
  `frontend/js/inputs.js` (`INPUT_TYPES.wifi = {...}`) + entry to
  `backend/config/input-types.json`. Nothing else changes.
- **New template object** (e.g. cat): add `draw()` path to
  `frontend/js/templates.js` (`TEMPLATE_OBJECTS.cat = {...}`) + entry to
  `backend/config/templates.json`. Nothing else changes.
