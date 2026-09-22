/**
 * inputs.js — registry of "things that can be turned into a QR code".
 *
 * Each input type is an object:
 *   {
 *     id:          string   // stable key, matches backend/config/input-types.json
 *     label:       string   // shown in the <select>
 *     fields:      [{ key, label, placeholder, hint }]
 *     buildPayload(values): string  // -> raw string encoded into the QR
 *     validate(values): string | null // -> error message or null if ok
 *   }
 *
 * HOW TO ADD A NEW INPUT TYPE (e.g. wifi, vcard, sms):
 *   1. Add an entry here with buildPayload/validate.
 *   2. Add the matching entry to backend/config/input-types.json
 *      (id + label + fields) so the /api/input-types list stays in sync.
 *   3. No changes needed in index.html or app.js — the form renders dynamically.
 */

const INPUT_TYPES = {
  website: {
    id: 'website',
    label: 'Website URL',
    fields: [
      {
        key: 'url',
        label: 'Target URL',
        placeholder: 'https://example.com',
        hint: 'Scheme is added automatically if omitted (example.com → https://example.com).',
      },
    ],
    buildPayload(values) {
      let url = (values.url || '').trim();
      if (!url) return ' ';
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
        url = 'https://' + url; // normalize bare domains
      }
      return url;
    },
    validate(values) {
      const url = (values.url || '').trim();
      if (!url) return 'Please enter a URL.';
      try {
        const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : 'https://' + url;
        new URL(normalized);
        return null;
      } catch {
        return 'That does not look like a valid URL.';
      }
    },
  },

  text: {
    id: 'text',
    label: 'Plain Text',
    fields: [
      {
        key: 'text',
        label: 'Text content',
        placeholder: 'Hello, world!',
        hint: 'Any short text — scanned as-is.',
      },
    ],
    buildPayload(values) {
      return (values.text || '').trim() || ' ';
    },
    validate(values) {
      if (!(values.text || '').trim()) return 'Please enter some text.';
      return null;
    },
  },

  // --- Future slots: uncomment + implement to extend ---
  // wifi: { id: 'wifi', label: 'Wi-Fi', fields: [...],
  //   buildPayload: (v) => `WIFI:T:WPA;S:${v.ssid};P:${v.password};;`,
  //   validate: ... },
  // vcard: { ... }, sms: { ... }, email: { ... },
};
