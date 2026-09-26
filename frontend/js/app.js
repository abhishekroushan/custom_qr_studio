/**
 * app.js — glue between registries (inputs.js, templates.js, palettes.js),
 * the renderer, and the optional backend config API.
 *
 * Startup:
 *   1. Try GET /api/input-types, /api/templates, /api/palettes (backend lists).
 *      Fall back to the local INPUT_TYPES / TEMPLATE_OBJECTS / PALETTES
 *      registries so index.html also works opened directly (file://).
 *   2. Render the input-type <select>, the dynamic fields, the
 *      template-object buttons, and the palette <select> (stored choice wins).
 *   3. On any keystroke / selection change: validate -> buildPayload ->
 *      renderer.render(payload, templateId).
 */

(function () {
  'use strict';

  const PALETTE_STORAGE_KEY = 'qr-studio-palette';

  let currentTemplateId = 'heart';
  let currentInputTypeId = 'website';
  let currentPaletteId = DEFAULT_PALETTE;
  let currentFade = 0.50;
  let fieldValues = {};
  let inputTypeList = null;
  let templateList = null;
  let paletteList = null;
  // Custom image-mask state (extract.js): bitmap canvas + source image for
  // live threshold previews. Null until a silhouette is applied.
  let customMaskCanvas = null;
  let loadedExtractImage = null;
  let lastExtractResult = null;

  const typeSelect = document.getElementById('input-type-select');
  const fieldsBox = document.getElementById('dynamic-fields');
  const shapeGrid = document.getElementById('shape-grid');
  const paletteSelect = document.getElementById('palette-select');
  const extractPanel = document.getElementById('extract-panel');
  const extractDialog = document.getElementById('extract-dialog');
  const extractToggle = document.getElementById('extract-toggle');
  const extractStatus = document.getElementById('extract-status');
  const extractClose = document.getElementById('extract-close');
  const extractUrl = document.getElementById('extract-url');
  const extractFetch = document.getElementById('extract-fetch');
  const extractFile = document.getElementById('extract-file');
  const extractThreshold = document.getElementById('extract-threshold');
  const extractThresholdValue = document.getElementById('extract-threshold-value');
  const extractInvert = document.getElementById('extract-invert');
  const extractPreview = document.getElementById('extract-preview');
  const extractSourceHint = document.getElementById('extract-source-hint');
  const extractError = document.getElementById('extract-error');
  const extractApply = document.getElementById('extract-apply');
  const extractCancel = document.getElementById('extract-cancel');
  const fadeSlider = document.getElementById('fade-slider');
  const fadeValue = document.getElementById('fade-value');
  const downloadBtn = document.getElementById('download-btn');
  const canvas = document.getElementById('output-canvas');
  const rawQrDiv = document.getElementById('raw-qr');

  const renderer = new QRShapeRenderer(rawQrDiv, canvas);

  async function fetchConfig(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch {
      return null; // backend not running (e.g. file://) — caller falls back
    }
  }

  function getInputType(id) {
    return INPUT_TYPES[id];
  }

  function renderTypeSelect() {
    typeSelect.innerHTML = '';
    const types = inputTypeList || Object.values(INPUT_TYPES);
    for (const t of types) {
      if (!INPUT_TYPES[t.id]) continue; // backend advertises, frontend implements
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label || INPUT_TYPES[t.id].label;
      typeSelect.appendChild(opt);
    }
    typeSelect.value = currentInputTypeId;
  }

  function renderFields() {
    const def = getInputType(currentInputTypeId);
    fieldsBox.innerHTML = '';
    fieldValues = {};
    for (const f of def.fields) {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';

      const label = document.createElement('label');
      label.textContent = f.label;
      label.setAttribute('for', 'field-' + f.key);

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'field-' + f.key;
      input.placeholder = f.placeholder || '';
      if (currentInputTypeId === 'website' && f.key === 'url') {
        input.value = 'https://en.wikipedia.org/wiki/Main_Page';
      }
      input.addEventListener('input', () => {
        fieldValues[f.key] = input.value;
        regenerate();
      });

      const hint = document.createElement('div');
      hint.className = 'field-hint';
      hint.textContent = f.hint || '';

      const err = document.createElement('div');
      err.className = 'field-error';
      err.id = 'error-' + f.key;

      wrap.appendChild(label);
      wrap.appendChild(input);
      if (f.hint) wrap.appendChild(hint);
      wrap.appendChild(err);
      fieldsBox.appendChild(wrap);
      fieldValues[f.key] = input.value;
    }
  }

  function renderShapeGrid() {
    shapeGrid.innerHTML = '';
    const templates = templateList || Object.values(TEMPLATE_OBJECTS);
    for (const t of templates) {
      if (!TEMPLATE_OBJECTS[t.id]) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shape-btn' + (t.id === currentTemplateId ? ' active' : '');
      btn.dataset.shape = t.id;
      btn.textContent = (t.icon ? t.icon + ' ' : '') + t.name;
      btn.addEventListener('click', () => setShape(t.id));
      shapeGrid.appendChild(btn);
    }
  }

  function renderPaletteSelect() {
    paletteSelect.innerHTML = '';
    const palettes = paletteList || Object.values(PALETTES);
    for (const p of palettes) {
      if (!PALETTES[p.id]) continue; // backend advertises, frontend implements
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || PALETTES[p.id].name;
      if (PALETTES[p.id].description) opt.title = PALETTES[p.id].description;
      paletteSelect.appendChild(opt);
    }
    paletteSelect.value = currentPaletteId;
  }

  function setPalette(id, persist = true) {
    if (!applyPalette(id)) return;
    currentPaletteId = id;
    paletteSelect.value = id;
    if (persist) {
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, id);
      } catch {
        // private mode etc. — palette still applies for this session
      }
    }
  }

  // Called by shape buttons (replaces prototype's inline onclick="setShape(...)").
  function setShape(shapeId) {
    if (shapeId === 'custom' && !customMaskCanvas) {
      // No silhouette yet — guide the user to the extract section first.
      showExtractPanel();
      return;
    }
    currentTemplateId = shapeId;
    if (shapeId !== 'custom') extractStatus.textContent = '';
    shapeGrid.querySelectorAll('.shape-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.shape === shapeId);
    });
    regenerate();
  }

  function regenerate() {
    const def = getInputType(currentInputTypeId);
    const error = def.validate(fieldValues);
    const firstKey = def.fields[0].key;
    const errEl = document.getElementById('error-' + firstKey);
    if (errEl) errEl.textContent = error || '';
    // Render even when invalid (prototype did); validation message guides user.
    if (currentTemplateId === 'custom' && customMaskCanvas) {
      renderer.renderWithBitmap(def.buildPayload(fieldValues), customMaskCanvas, currentFade);
    } else {
      renderer.render(def.buildPayload(fieldValues), currentTemplateId, currentFade);
    }
  }

  function refade() {
    // Cheap path: reuses the cached raw QR, no matrix regeneration.
    // Renderer remembers the custom bitmap from renderWithBitmap.
    renderer.refade(currentTemplateId, currentFade);
  }

  /* ---------- Extract-from-image panel ---------- */

  function showExtractPanel() {
    // Native modal: backdrop, Esc, and focus return come free. Guarded since
    // showModal() throws when the dialog is already open.
    if (!extractDialog.open) extractDialog.showModal();
    extractUrl.focus();
  }

  function hideExtractPanel() {
    if (extractDialog.open) extractDialog.close();
  }

  function setExtractError(err) {
    extractError.textContent = err ? extractErrorMessage(err) : '';
  }

  function extractSettings() {
    return {
      threshold: parseInt(extractThreshold.value, 10),
      invert: extractInvert.checked,
    };
  }

  /** Load an image (File or URL), then refresh the silhouette preview. */
  async function handleExtractInput(input) {
    setExtractError(null);
    lastExtractResult = null;
    try {
      loadedExtractImage = await loadImageElement(input);
    } catch (err) {
      loadedExtractImage = null;
      setExtractError(err);
      return;
    }
    refreshExtractPreview();
  }

  /** Re-extract from the loaded image with current slider settings. */
  function refreshExtractPreview() {
    if (!loadedExtractImage) return;
    setExtractError(null);
    let result;
    try {
      result = imageToMaskResult(loadedExtractImage, extractSettings());
    } catch (err) {
      lastExtractResult = null;
      setExtractError(err);
      return;
    }
    lastExtractResult = result;
    extractSourceHint.textContent =
      result.source === 'alpha'
        ? 'Using the image alpha channel as the silhouette.'
        : 'Using luminance threshold as the silhouette.';
    drawMaskPreview(result);
  }

  /** Black silhouette on white so the shape reads clearly at small size. */
  function drawMaskPreview(result) {
    const pctx = extractPreview.getContext('2d');
    const S = extractPreview.width;
    pctx.clearRect(0, 0, S, S);
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, S, S);
    const solid = document.createElement('canvas');
    solid.width = result.width;
    solid.height = result.height;
    const sctx = solid.getContext('2d');
    sctx.fillStyle = '#111111';
    sctx.fillRect(0, 0, solid.width, solid.height);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskResultToCanvas(result), 0, 0);
    pctx.drawImage(solid, 0, 0, S, S);
  }

  function applyExtract() {
    if (!lastExtractResult) {
      setExtractError(
        loadedExtractImage ? { code: 'empty-mask' } : { code: 'invalid-url' },
      );
      return;
    }
    customMaskCanvas = maskResultToCanvas(lastExtractResult);
    setExtractError(null);
    extractStatus.textContent = '✓ custom silhouette active';
    hideExtractPanel();
    setShape('custom'); // mask exists now, so this activates + regenerates
  }

  async function init() {
    // Backend is the source of truth for *which* types/templates/palettes are
    // enabled and in what order; frontend registries provide the implementation.
    inputTypeList = await fetchConfig('/api/input-types');
    templateList = await fetchConfig('/api/templates');
    paletteList = await fetchConfig('/api/palettes');

    if (inputTypeList && inputTypeList.length) {
      const firstKnown = inputTypeList.find((t) => INPUT_TYPES[t.id]);
      if (firstKnown) currentInputTypeId = firstKnown.id;
    }
    if (templateList && templateList.length) {
      const firstKnown = templateList.find((t) => TEMPLATE_OBJECTS[t.id]);
      if (firstKnown) currentTemplateId = firstKnown.id;
    }

    // Palette: stored choice wins, then backend/default.
    let storedPalette = null;
    try {
      storedPalette = localStorage.getItem(PALETTE_STORAGE_KEY);
    } catch {
      storedPalette = null;
    }
    const enabledPalettes = paletteList || Object.values(PALETTES);
    const firstPalette = enabledPalettes.find((p) => PALETTES[p.id]);
    if (storedPalette && PALETTES[storedPalette] &&
        enabledPalettes.some((p) => p.id === storedPalette)) {
      currentPaletteId = storedPalette;
    } else if (firstPalette) {
      currentPaletteId = firstPalette.id;
    } else {
      currentPaletteId = DEFAULT_PALETTE;
    }

    renderTypeSelect();
    renderFields();
    renderShapeGrid();
    renderPaletteSelect();
    setPalette(currentPaletteId, false);

    paletteSelect.addEventListener('change', () => setPalette(paletteSelect.value));

    typeSelect.addEventListener('change', () => {
      currentInputTypeId = typeSelect.value;
      renderFields();
      regenerate();
    });

    fadeSlider.addEventListener('input', () => {
      currentFade = parseInt(fadeSlider.value, 10) / 100;
      fadeValue.textContent = fadeSlider.value + '%';
      refade();
    });

    extractFetch.addEventListener('click', () => handleExtractInput(extractUrl.value));
    extractUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleExtractInput(extractUrl.value);
    });
    extractFile.addEventListener('change', () => {
      if (extractFile.files && extractFile.files[0]) handleExtractInput(extractFile.files[0]);
    });
    extractThreshold.addEventListener('input', () => {
      extractThresholdValue.textContent = extractThreshold.value;
      refreshExtractPreview();
    });
    extractInvert.addEventListener('change', refreshExtractPreview);
    extractApply.addEventListener('click', applyExtract);
    extractCancel.addEventListener('click', hideExtractPanel);
    extractClose.addEventListener('click', hideExtractPanel);
    extractToggle.addEventListener('click', showExtractPanel);
    // Backdrop click closes (state persists in the live DOM nodes).
    extractDialog.addEventListener('click', (e) => {
      if (e.target === extractDialog) hideExtractPanel();
    });

    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `qr-${currentTemplateId}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    });

    // Expose for console/debugging parity with prototype's global setShape.
    window.setShape = setShape;
    window.showExtractPanel = showExtractPanel;

    regenerate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
