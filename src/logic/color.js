/* =========================================================
   COLOR — hex/HSL helpers (pure)
========================================================= */

// "#rrggbb" → [r, g, b] (0–255).
export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// h in degrees [0,360), s and l in [0,1] → "#rrggbb".
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// A darker shade of the same hue: plain HSL lightness × `amount`. Not a
// hand-picked shade per icon — good enough for a hover/active variant
// across arbitrary hues without a second colour table.
export function darken(hex, amount = 0.72) {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return hslToHex(0, 0, l * amount);
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return hslToHex(h, s, l * amount);
}

// ---------- contrast (WCAG 2) ----------

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

// Relative luminance of "#rrggbb", 0 (black) … 1 (white).
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG contrast ratio between two colours, 1 … 21. 4.5 is the AA minimum for
// normal text, 3 for large text.
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// Mix `hex` with white: amount 0 = white, 1 = the colour itself (like CSS
// color-mix(in srgb, hex <amount>%, white)).
export function tintOf(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (v) => Math.round(255 - (255 - v) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const INK_DARK = '#1f1b2e';
export const AA = 4.5;

// A darker shade of `hex` that reads as TEXT (≥ 4.5:1) on white AND on the pale tint
// of the colour itself (the "eyebrow pill" / stat-card background). Starts from
// `start` (the game's existing "deep" shade) and darkens further only if needed.
export function readableText(hex, start = darken(hex)) {
  const tint = tintOf(hex, 0.16);
  let candidate = start;
  let amount = 1;
  for (let i = 0; i < 40; i++) {
    if (contrastRatio(candidate, '#ffffff') >= AA && contrastRatio(candidate, tint) >= AA) break;
    amount *= 0.94;
    candidate = darken(start, amount);
  }
  return candidate;
}

// A background for a FILLED button (or selected toggle) plus the text colour to put on
// it, guaranteed ≥ 4.5:1. Keeps the game's own colour whenever white or dark text works
// on it; otherwise darkens the colour until white text does.
export function readableFill(hex) {
  if (contrastRatio('#ffffff', hex) >= AA) return { fill: hex, on: '#ffffff' };
  if (contrastRatio(INK_DARK, hex) >= AA) return { fill: hex, on: INK_DARK };
  let fill = hex;
  let amount = 1;
  for (let i = 0; i < 40 && contrastRatio('#ffffff', fill) < AA; i++) {
    amount *= 0.94;
    fill = darken(hex, amount);
  }
  return { fill, on: '#ffffff' };
}
