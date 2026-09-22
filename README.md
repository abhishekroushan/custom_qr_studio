# QR Shape Mask Studio

Templatized QR code generator: type a **website URL** (or other input types later),
pick a **template object** (heart, star, diamond, shield, circle, square), and the
app renders the QR masked into that silhouette — while keeping it scannable.

Derived from `prototype.md` (single-file prototype), refactored into a modular
`frontend/` + `backend/` layout for extensibility.

## Project structure

```
.
├── prototype.md                # original single-file prototype (reference)
├── frontend/
│   ├── index.html              # page skeleton: controls left, canvas preview right
│   ├── css/styles.css          # dark-theme layout (extracted from prototype)
│   └── js/
│       ├── inputs.js           # INPUT_TYPES registry — what can become a QR
│       ├── templates.js        # TEMPLATE_OBJECTS registry — overlay shapes
│       ├── renderer.js         # QRShapeRenderer: QR → mask → finder-pattern fix
│       └── app.js              # glue: config fetch, dynamic form, events
├── backend/
│   ├── server.js               # Express: serves frontend/ + /api/* config
│   ├── package.json
│   └── config/
│       ├── input-types.json    # which input types are enabled + field metadata
│       └── templates.json      # which template objects are enabled + order
└── README.md
```

## How the HTML works

### `frontend/index.html` — the page

The page has two columns inside `.container`:

1. **Control panel (left)**
   - `<select id="input-type-select">` — empty in the HTML; `app.js` fills it
     from `GET /api/input-types` (fallback: `INPUT_TYPES` in `inputs.js`).
   - `<div id="dynamic-fields">` — empty in the HTML; `app.js` renders one
     `<input>` per field of the selected input type. For `website` this is a
     single "Target URL" box defaulting to `https://barkod.studio`.
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

3. **Script loading (order matters)**
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
   <script src="js/inputs.js"></script>
   <script src="js/templates.js"></script>
   <script src="js/renderer.js"></script>
   <script src="js/app.js"></script>
   ```
   The CDN provides the `QRCode` global with `QRCode.CorrectLevel.H`.
   (Note: `prototype.md` listed `https://cloudflare.com` as the script src,
   which is not a JS file — the modular version uses the correct cdnjs URL.)

### Rendering pipeline (`js/renderer.js`)

Each keystroke / shape click runs:

1. **Raw QR generation** — `new QRCode(rawQrDiv, { text: payload, width: 256,
   height: 256, correctLevel: QRCode.CorrectLevel.H })`. Level H gives ~30%
   data recovery, which is what allows cropping modules into a silhouette.
2. **Canvas reset** — clear + fill white (QR scanners expect a light quiet zone).
3. **Silhouette clip** — `ctx.beginPath()`, call
   `TEMPLATE_OBJECTS[id].draw(ctx, cx, cy, size)` (Bézier/line/arc paths authored
   for a 400px canvas, scaled by `size/400`), then `ctx.clip()`.
4. **Masked blit** — `ctx.drawImage(rawQR, 0, 0, size, size)` inside the clip,
   so only silhouette pixels survive; `ctx.restore()`.
5. **Finder-pattern restore** — the 3 corner squares (top-left, top-right,
   bottom-left) are stamped back **unclipped** at ~28% of the edge length, with
   source/destination rectangles scaled independently (the prototype mixed these
   scales, which this version fixes). Without this, cameras can't lock on.

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

**Option A — with backend (recommended):**
```bash
cd backend
npm install
npm start
# open http://localhost:3000
```

**Option B — frontend only:**
open `frontend/index.html` directly (or `npx serve frontend`). The app detects
missing `/api/*` and falls back to the local JS registries.

## Extending

- **New input type** (e.g. Wi-Fi): add implementation to
  `frontend/js/inputs.js` (`INPUT_TYPES.wifi = {...}`) + entry to
  `backend/config/input-types.json`. Nothing else changes.
- **New template object** (e.g. cat): add `draw()` path to
  `frontend/js/templates.js` (`TEMPLATE_OBJECTS.cat = {...}`) + entry to
  `backend/config/templates.json`. Nothing else changes.
