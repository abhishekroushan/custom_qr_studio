/**
 * renderer.js — the QR + template-object compositing pipeline.
 *
 * Pipeline (same as prototype.md, cleaned up + bug-fixed):
 *   1. Generate a raw square QR with qrcodejs at CorrectLevel.H (30% recovery).
 *      High error correction is what lets us crop pixels into heart/star/etc.
 *      shapes and still scan.
 *   2. Clear the visible <canvas>, paint it white.
 *   3. Build the template silhouette path (from TEMPLATE_OBJECTS) and ctx.clip().
 *   4. drawImage() the raw QR stretched over the canvas — only pixels inside
 *      the silhouette survive.
 *   5. Re-stamp the 3 finder-pattern anchors (top-left, top-right, bottom-left)
 *      unclipped on top. Scanners lock onto these squares first; if they are
 *      cropped the code won't read.
 *
 * Prototype bug fixed here: the original computed anchorSize in canvas pixels
 * but used it as *source* pixels against a differently-sized qrImg. We now
 * scale source and destination rectangles independently.
 */

class QRShapeRenderer {
  /**
   * @param {HTMLElement} rawQrDiv  hidden node qrcodejs renders into
   * @param {HTMLCanvasElement} canvas  visible output canvas
   */
  constructor(rawQrDiv, canvas) {
    this.rawQrDiv = rawQrDiv;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tempoTimer = null;
  }

  /**
   * Render payload string through a template object id.
   * Debounced internally not here — app.js calls this on each keystroke.
   * @param {string} payload
   * @param {string} templateId  key in TEMPLATE_OBJECTS
   */
  render(payload, templateId) {
    this.rawQrDiv.innerHTML = '';

    new QRCode(this.rawQrDiv, {
      text: payload || ' ',
      width: 256,
      height: 256,
      correctLevel: QRCode.CorrectLevel.H,
    });

    // qrcodejs paints async (creates img/canvas/table). Poll briefly,
    // then composite. Prefer img.onload over a blind timeout when possible.
    clearTimeout(this.tempoTimer);
    this.tempoTimer = setTimeout(() => this._composite(templateId), 60);
  }

  _composite(templateId) {
    const qrImg = this.rawQrDiv.querySelector('img');
    const qrCanvas = this.rawQrDiv.querySelector('canvas');
    const source = qrImg && qrImg.complete && qrImg.naturalWidth ? qrImg : qrCanvas;
    if (!source) return;
    if (qrImg && !qrImg.complete) {
      // Image not decoded yet — retry once shortly.
      clearTimeout(this.tempoTimer);
      this.tempoTimer = setTimeout(() => this._composite(templateId), 60);
      return;
    }
    this._drawMasked(source, templateId);
    this._restoreFinderPatterns(source);
  }

  _drawMasked(source, templateId) {
    const { ctx, canvas } = this;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const template = TEMPLATE_OBJECTS[templateId] || TEMPLATE_OBJECTS.square;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    template.draw(ctx, cx, cy, size);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(source, 0, 0, size, size);
    ctx.restore();
  }

  _restoreFinderPatterns(source) {
    const { ctx, canvas } = this;
    const size = canvas.width;
    // Source dimensions (raw QR bitmap) vs destination (canvas) can differ.
    const srcW = source.naturalWidth || source.width;
    const srcH = source.naturalHeight || source.height;
    const frac = 0.28; // anchor covers ~28% of the edge
    const sw = srcW * frac;
    const sh = srcH * frac;
    const d = size * frac;

    // Top-left
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, d, d);
    // Top-right
    ctx.drawImage(source, srcW - sw, 0, sw, sh, size - d, 0, d, d);
    // Bottom-left
    ctx.drawImage(source, 0, srcH - sh, sw, sh, 0, size - d, d, d);
  }
}
