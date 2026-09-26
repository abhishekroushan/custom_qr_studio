/**
 * renderer.js — the QR + template-object compositing pipeline.
 *
 * Pipeline (opacity/fade approach — v2):
 *   1. Generate a raw square QR with qrcodejs at CorrectLevel.H (30% recovery).
 *   2. Paint the FULL QR onto the canvas at full contrast (white bg + full matrix).
 *      Nothing is deleted here, so the complete data pattern always survives.
 *   3. Wash out everything OUTSIDE the template silhouette with a translucent
 *      white overlay (default 50% opaque). Inside-shape modules stay pure
 *      black; outside-shape modules become light gray — still present for the
 *      decoder, but visually receding so the shape reads clearly.
 *   4. Re-stamp the 3 finder-pattern anchors (top-left, top-right, bottom-left)
 *      at full contrast on top. Scanners lock onto these squares first.
 *
 * Why not hard-clip? Hard-clipping (v1 / prototype.md) deleted every module
 * outside the heart/star/etc. path. Level H only recovers ~30% damage, and a
 * heart/star crop destroys far more than that — so only "Full Block" scanned.
 * The fade approach keeps 100% of modules decodable and uses contrast instead
 * of deletion to express the shape.
 *
 * fadeStrength: 0 = no wash (plain square QR), 1 = outside fully white
 * (equivalent to the old hard-clip look, minus finder restore). Measured safe
 * zone: Heart scans reliably at ≤0.65 for short URLs on a real phone camera,
 * but denser payloads (e.g. long Wikipedia URLs) need more contrast — so the
 * UI defaults to 0.50 as a middle ground across content lengths, phones, and
 * lighting. Exposed as a slider
 * for per-shape experimentation.
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
    this.lastArgs = null; // for fade-only re-renders without regenerating QR
  }

  /**
   * Render payload string through a template object id.
   * @param {string} payload
   * @param {string} templateId  key in TEMPLATE_OBJECTS
   * @param {number} fadeStrength  0..1, how strongly to wash outside modules
   */
  render(payload, templateId, fadeStrength = 0.50) {
    this.rawQrDiv.innerHTML = '';

    new QRCode(this.rawQrDiv, {
      text: payload || ' ',
      width: 256,
      height: 256,
      correctLevel: QRCode.CorrectLevel.H,
    });

    clearTimeout(this.tempoTimer);
    this.tempoTimer = setTimeout(() => this._composite(templateId, fadeStrength), 60);
  }

  /**
   * Re-apply the fade wash without regenerating the QR matrix (cheap, runs on
   * every slider movement). Falls back to full render if no QR exists yet.
   */
  refade(templateId, fadeStrength) {
    const qrImg = this.rawQrDiv.querySelector('img');
    const qrCanvas = this.rawQrDiv.querySelector('canvas');
    const source = qrImg && qrImg.complete && qrImg.naturalWidth ? qrImg : qrCanvas;
    if (!source) {
      // No raw QR cached yet (shouldn't happen after init) — do a full render.
      if (this.lastArgs) this.render(this.lastArgs.payload, templateId, fadeStrength);
      return;
    }
    this._composite(templateId, fadeStrength, source);
  }

  _composite(templateId, fadeStrength, knownSource) {
    const qrImg = this.rawQrDiv.querySelector('img');
    const qrCanvas = this.rawQrDiv.querySelector('canvas');
    const source =
      knownSource || (qrImg && qrImg.complete && qrImg.naturalWidth ? qrImg : qrCanvas);
    if (!source) return;
    if (!knownSource && qrImg && !qrImg.complete) {
      clearTimeout(this.tempoTimer);
      this.tempoTimer = setTimeout(() => this._composite(templateId, fadeStrength), 60);
      return;
    }
    // 'square' template = plain QR, skip the wash entirely.
    const fade = templateId === 'square' ? 0 : fadeStrength;
    this._drawFull(source);
    if (fade > 0.01) this._washOutside(templateId, fade);
    this._restoreFinderPatterns(source);
  }

  /** Step 2: full-strength QR over a white background. */
  _drawFull(source) {
    const { ctx, canvas } = this;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
  }

  /**
   * Step 3: translucent white over everything EXCEPT the silhouette.
   * Uses an even-odd path (full rect + shape) so the fill lands only outside.
   */
  _washOutside(templateId, fadeStrength) {
    const { ctx, canvas } = this;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const template = TEMPLATE_OBJECTS[templateId] || TEMPLATE_OBJECTS.square;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    template.draw(ctx, cx, cy, size);
    ctx.closePath();
    // 'evenodd' => rect minus shape = outside region only.
    ctx.clip('evenodd');
    ctx.fillStyle = `rgba(255, 255, 255, ${fadeStrength})`;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  /** Step 4: finder anchors back at full contrast (independent src/dst scaling). */
  _restoreFinderPatterns(source) {
    const { ctx, canvas } = this;
    const size = canvas.width;
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
