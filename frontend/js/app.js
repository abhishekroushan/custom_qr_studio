/**
 * app.js — glue between registries (inputs.js, templates.js), the renderer,
 * and the optional backend config API.
 *
 * Startup:
 *   1. Try GET /api/input-types and /api/templates (backend lists).
 *      Fall back to the local INPUT_TYPES / TEMPLATE_OBJECTS registries
 *      so index.html also works opened directly (file://) with no server.
 *   2. Render the input-type <select>, the dynamic fields, and the
 *      template-object buttons.
 *   3. On any keystroke / selection change: validate -> buildPayload ->
 *      renderer.render(payload, templateId).
 */

(function () {
  'use strict';

  let currentTemplateId = 'heart';
  let currentInputTypeId = 'website';
  let currentFade = 0.60;
  let fieldValues = {};
  let inputTypeList = null;
  let templateList = null;

  const typeSelect = document.getElementById('input-type-select');
  const fieldsBox = document.getElementById('dynamic-fields');
  const shapeGrid = document.getElementById('shape-grid');
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

  // Called by shape buttons (replaces prototype's inline onclick="setShape(...)").
  function setShape(shapeId) {
    currentTemplateId = shapeId;
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
    renderer.render(def.buildPayload(fieldValues), currentTemplateId, currentFade);
  }

  function refade() {
    // Cheap path: reuses the cached raw QR, no matrix regeneration.
    renderer.refade(currentTemplateId, currentFade);
  }

  async function init() {
    // Backend is the source of truth for *which* types/templates are enabled
    // and in what order; frontend registries provide the implementation.
    inputTypeList = await fetchConfig('/api/input-types');
    templateList = await fetchConfig('/api/templates');

    if (inputTypeList && inputTypeList.length) {
      const firstKnown = inputTypeList.find((t) => INPUT_TYPES[t.id]);
      if (firstKnown) currentInputTypeId = firstKnown.id;
    }
    if (templateList && templateList.length) {
      const firstKnown = templateList.find((t) => TEMPLATE_OBJECTS[t.id]);
      if (firstKnown) currentTemplateId = firstKnown.id;
    }

    renderTypeSelect();
    renderFields();
    renderShapeGrid();

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

    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `qr-${currentTemplateId}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    });

    // Expose for console/debugging parity with prototype's global setShape.
    window.setShape = setShape;

    regenerate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
