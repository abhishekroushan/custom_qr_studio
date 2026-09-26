/**
 * extract.js — image → silhouette mask (frontend-only extraction, Phase 1).
 *
 * Two extraction strategies, tried in order:
 *   1. Alpha channel (transparent PNG logos/icons): the alpha channel IS the
 *      silhouette — exact, no heuristics.
 *   2. Luminance threshold (high-contrast art, e.g. black logo on white):
 *      dark pixels are the object, with a user-adjustable threshold + invert.
 *
 * Mask convention: per-pixel alpha, 255 = inside the silhouette.
 * `maskResultToCanvas()` turns that into a white-on-transparent canvas, which
 * is exactly what QRShapeRenderer's bitmap path composites with.
 *
 * The pure functions (hasUsableAlpha / extractMask / extractErrorMessage) use
 * no DOM and are unit-tested in tests/extract.test.js. Only the loadImage*
 * wrappers and maskResultToCanvas touch the DOM.
 */

const EXTRACT_SIZE = 400;
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.98;

/**
 * True when a meaningful share of pixels is transparent AND a meaningful
 * share is opaque — i.e. the image carries a real alpha silhouette rather
 * than being a fully opaque photo (or fully transparent).
 */
function hasUsableAlpha(data) {
  const n = data.length / 4;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 128) transparent++;
  }
  const t = transparent / n;
  return t > MIN_COVERAGE && t < MAX_COVERAGE;
}

/**
 * @param {Uint8ClampedArray} data  RGBA pixels, width*height*4
 * @param {number} threshold  0..255, luminance cutoff for the threshold path
 * @param {boolean} invert  flip inside/outside
 * @returns {{ mask, width, height, coverage, source, empty }}
 *   source is 'alpha' | 'threshold'; empty is true when coverage is ~0 or ~1
 *   (nothing usable was found — caller should show an error, not a mask).
 */
function extractMask(data, width, height, { threshold = 128, invert = false } = {}) {
  const n = width * height;
  const mask = new Uint8ClampedArray(n);
  const useAlpha = hasUsableAlpha(data);
  let inside = 0;
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    let isInside;
    if (useAlpha) {
      isInside = data[o + 3] >= 128;
    } else {
      const gray = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      isInside = gray < threshold; // dark = object on a light ground
    }
    if (invert) isInside = !isInside;
    mask[p] = isInside ? 255 : 0;
    if (isInside) inside++;
  }
  const coverage = n === 0 ? 0 : inside / n;
  return {
    mask,
    width,
    height,
    coverage,
    source: useAlpha ? 'alpha' : 'threshold',
    empty: coverage < MIN_COVERAGE || coverage > MAX_COVERAGE,
  };
}

/** White shape on transparent ground; alpha channel carries the silhouette. */
function maskResultToCanvas(result) {
  const c = document.createElement('canvas');
  c.width = result.width;
  c.height = result.height;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(result.width, result.height);
  for (let p = 0; p < result.mask.length; p++) {
    const o = p * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = result.mask[p];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function validateImageUrl(raw) {
  const s = (raw || '').trim();
  if (!s) throw { code: 'invalid-url' };
  let url;
  try {
    url = new URL(s);
  } catch {
    throw { code: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw { code: 'invalid-url' };
  return url.href;
}

/**
 * Load an image element from a File (upload, no CORS limits) or a URL string
 * (needs CORS-enabled host for later pixel reads — enforced at read time).
 * Rejects with { code: 'load-failed' } when the bytes can't be decoded.
 */
function loadImageElement(input) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl = null;
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject({ code: 'load-failed' });
    };
    if (typeof File !== 'undefined' && input instanceof File) {
      objectUrl = URL.createObjectURL(input);
      img.src = objectUrl;
    } else {
      img.crossOrigin = 'anonymous';
      img.src = validateImageUrl(input);
    }
  });
}

/**
 * Draw contain-fitted onto an EXTRACT_SIZE canvas and extract the mask.
 * Rejects with { code: 'cors-tainted' } when the host blocks pixel reads,
 * or { code: 'empty-mask', result } when nothing usable was found.
 */
function imageToMaskResult(img, { threshold = 128, invert = false } = {}) {
  const c = document.createElement('canvas');
  c.width = EXTRACT_SIZE;
  c.height = EXTRACT_SIZE;
  const ctx = c.getContext('2d');
  const scale = Math.min(EXTRACT_SIZE / img.naturalWidth, EXTRACT_SIZE / img.naturalHeight);
  const dw = Math.max(1, Math.round(img.naturalWidth * scale));
  const dh = Math.max(1, Math.round(img.naturalHeight * scale));
  ctx.drawImage(img, Math.round((EXTRACT_SIZE - dw) / 2), Math.round((EXTRACT_SIZE - dh) / 2), dw, dh);
  let pixels;
  try {
    pixels = ctx.getImageData(0, 0, EXTRACT_SIZE, EXTRACT_SIZE).data;
  } catch (err) {
    if (err && err.name === 'SecurityError') throw { code: 'cors-tainted' };
    throw { code: 'load-failed' };
  }
  const result = extractMask(pixels, EXTRACT_SIZE, EXTRACT_SIZE, { threshold, invert });
  if (result.empty) throw { code: 'empty-mask', result };
  return result;
}

function extractErrorMessage(err) {
  switch (err && err.code) {
    case 'invalid-url':
      return 'Enter an http(s) image URL or upload a file instead.';
    case 'load-failed':
      return 'Could not load that image. Check the URL or upload the file instead.';
    case 'cors-tainted':
      return 'That host blocks cross-origin pixel reads. Upload the file instead.';
    case 'empty-mask':
      return 'No clear object found — try the threshold slider, invert, or a higher-contrast image.';
    default:
      return 'Something went wrong reading that image. Try another file or URL.';
  }
}
