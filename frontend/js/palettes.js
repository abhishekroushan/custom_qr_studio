/**
 * palettes.js — registry of page color configurations.
 *
 * Each palette is an object:
 *   {
 *     id:          string   // stable key, matches backend/config/palettes.json
 *     name:        string   // shown in the <select>
 *     description: string   // tooltip / docs
 *     colors:      { '--var': '#hex', ... }  // applied to :root, see css/styles.css
 *   }
 *
 * HOW TO ADD A NEW PALETTE (e.g. sepia, brand theme):
 *   1. Add an entry here with all 9 variables below (missing keys fall back
 *      to whatever is currently set — always specify the full set).
 *   2. Add the matching entry to backend/config/palettes.json
 *      (id + name + description) so the /api/palettes list stays in sync.
 *   3. No changes needed in index.html, styles.css, or app.js.
 *
 * Color-blind safety: status is never conveyed by hue alone (validation
 * errors always include text), and accents are drawn from the Okabe–Ito
 * palette (blue/orange/yellow), which stays distinguishable under
 * deuteranopia, protanopia, and tritanopia. The QR matrix itself always
 * renders black-on-white regardless of palette, to protect scannability.
 */

const DEFAULT_PALETTE = 'abyss';

const PALETTES = {
  abyss: {
    id: 'abyss',
    name: 'Abyss (color-blind safe)',
    description: 'Default. Deep-sea dark theme with a vivid cyan accent.',
    colors: {
      '--bg-primary': '#0b1220',
      '--bg-secondary': '#131c2e',
      '--accent': '#22d3ee',
      '--text': '#f1f5f9',
      '--muted': '#8fa0b3',
      '--border': '#243145',
      '--input-text': '#ffffff',
      '--on-accent': '#06202a',
      '--error': '#ff8a80',
    },
  },

  'pastel-colorblind': {
    id: 'pastel-colorblind',
    name: 'Pastel (color-blind safe)',
    description: 'Soft parchment surfaces with an Okabe-Ito blue accent.',
    colors: {
      '--bg-primary': '#f4efe3',
      '--bg-secondary': '#fdfcf8',
      '--accent': '#0072b2',
      '--text': '#1f2933',
      '--muted': '#5b6b7a',
      '--border': '#d8d2c0',
      '--input-text': '#1f2933',
      '--on-accent': '#ffffff',
      '--error': '#b00020',
    },
  },

  day: {
    id: 'day',
    name: 'Day',
    description: 'Neutral light theme with a sky-blue accent.',
    colors: {
      '--bg-primary': '#f1f5f9',
      '--bg-secondary': '#ffffff',
      '--accent': '#0284c7',
      '--text': '#0f172a',
      '--muted': '#64748b',
      '--border': '#cbd5e1',
      '--input-text': '#0f172a',
      '--on-accent': '#ffffff',
      '--error': '#dc2626',
    },
  },

  night: {
    id: 'night',
    name: 'Night',
    description: 'The original dark slate theme.',
    colors: {
      '--bg-primary': '#0f172a',
      '--bg-secondary': '#1e293b',
      '--accent': '#38bdf8',
      '--text': '#f8fafc',
      '--muted': '#94a3b8',
      '--border': '#334155',
      '--input-text': '#ffffff',
      '--on-accent': '#0f172a',
      '--error': '#f87171',
    },
  },

  'high-contrast': {
    id: 'high-contrast',
    name: 'High contrast',
    description: 'Black/white with a yellow accent. Maximum legibility.',
    colors: {
      '--bg-primary': '#000000',
      '--bg-secondary': '#101010',
      '--accent': '#ffd500',
      '--text': '#ffffff',
      '--muted': '#d4d4d4',
      '--border': '#ffffff',
      '--input-text': '#ffffff',
      '--on-accent': '#000000',
      '--error': '#ff7a7a',
    },
  },
};

/**
 * Apply a palette by setting CSS variables on :root.
 * @param {string} id  key in PALETTES
 * @returns {boolean}  true if the palette exists and was applied
 */
function applyPalette(id) {
  const palette = PALETTES[id];
  if (!palette) return false;
  const root = document.documentElement;
  for (const [variable, value] of Object.entries(palette.colors)) {
    root.style.setProperty(variable, value);
  }
  return true;
}
