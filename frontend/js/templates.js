/**
 * templates.js — registry of customizable template objects overlaid on the QR.
 *
 * Each template is an object:
 *   {
 *     id:   string   // stable key, matches backend/config/templates.json
 *     name: string   // button label
 *     icon: string   // emoji/glyph prefix on the button
 *     draw(ctx, cx, cy, size): void  // adds the silhouette sub-path to ctx
 *                                     // (renderer handles beginPath/clip)
 *   }
 *
 * HOW TO ADD A NEW TEMPLATE OBJECT (e.g. skull, cat, burger):
 *   1. Add an entry here with a canvas path in draw().
 *   2. Add the matching entry to backend/config/templates.json
 *      (id + name + icon) so the /api/templates list stays in sync.
 *   3. No changes needed in index.html, renderer.js, or app.js.
 */

const TEMPLATE_OBJECTS = {
  heart: {
    id: 'heart',
    name: 'Heart',
    icon: '♥',
    draw(ctx, cx, cy, size) {
      const s = size / 400; // paths authored for a 400px canvas
      ctx.moveTo(cx, cy + 80 * s);
      ctx.bezierCurveTo(cx - 160 * s, cy - 60 * s, cx - 100 * s, cy - 170 * s, cx, cy - 70 * s);
      ctx.bezierCurveTo(cx + 100 * s, cy - 170 * s, cx + 160 * s, cy - 60 * s, cx, cy + 80 * s);
    },
  },

  star: {
    id: 'star',
    name: 'Star',
    icon: '★',
    draw(ctx, cx, cy, size) {
      const s = size / 400;
      const spikes = 5;
      const outerRadius = 180 * s;
      const innerRadius = 80 * s;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
    },
  },

  diamond: {
    id: 'diamond',
    name: 'Diamond',
    icon: '◆',
    draw(ctx, cx, cy, size) {
      const s = size / 400;
      ctx.moveTo(cx, cy - 180 * s);
      ctx.lineTo(cx + 180 * s, cy);
      ctx.lineTo(cx, cy + 180 * s);
      ctx.lineTo(cx - 180 * s, cy);
    },
  },

  shield: {
    id: 'shield',
    name: 'Shield',
    icon: '🛡',
    draw(ctx, cx, cy, size) {
      const s = size / 400;
      ctx.moveTo(cx - 140 * s, cy - 150 * s);
      ctx.quadraticCurveTo(cx, cy - 180 * s, cx + 140 * s, cy - 150 * s);
      ctx.quadraticCurveTo(cx + 150 * s, cy, cx + 120 * s, cy + 100 * s);
      ctx.quadraticCurveTo(cx, cy + 200 * s, cx, cy + 200 * s);
      ctx.quadraticCurveTo(cx, cy + 200 * s, cx - 120 * s, cy + 100 * s);
      ctx.quadraticCurveTo(cx - 150 * s, cy, cx - 140 * s, cy - 150 * s);
    },
  },

  circle: {
    id: 'circle',
    name: 'Circle',
    icon: '●',
    draw(ctx, cx, cy, size) {
      ctx.arc(cx, cy, (size / 400) * 170, 0, Math.PI * 2);
    },
  },

  square: {
    id: 'square',
    name: 'Full Block',
    icon: '■',
    draw(ctx, cx, cy, size) {
      const m = size * 0.05;
      ctx.rect(m, m, size - m * 2, size - m * 2);
    },
  },
};
