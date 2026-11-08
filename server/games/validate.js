/* =========================================================
   Answer-field validation helpers for online declarations
   =========================================================
   Mirrors src/logic/entries.js (parseNumberInput): a missing or
   non-numeric value means "not answered yet" → null; a number is
   clamped to the field's range. Every field is optional on the
   wire — a participant may save a partially filled form, and the
   facilitator can top it up, exactly like the offline app.
========================================================= */

// '' / non-number → null (not answered); number → clamped.
export const intValue = (raw, { min, max } = {}) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  let v = Number(raw);
  if (Number.isNaN(v) || !Number.isFinite(v)) return null;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return Math.round(v);
};

export const choiceValue = (raw, options) => {
  const values = options.map((o) => o.value);
  return values.includes(raw) ? raw : null;
};

export const num = (v) => (v === null || v === undefined ? '—' : String(v));
export const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
export const times = (v) => (v === null || v === undefined ? '—' : `×${v.toFixed(1)}`);
