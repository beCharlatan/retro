/* =========================================================
   FORMAT — small text/number helpers used across the app
   =========================================================
   Russian plurals, "N minutes ago", the export file name, HTML escaping,
   avatar initial/colour. All pure (time and the participant list are
   passed in), so they're unit-tested (test/unit/format.test.js) instead
   of living as private copies in whichever file needed them first.
========================================================= */

// Russian plural form for `n` — the browser's own CLDR rules
// (Intl.PluralRules), not a hand-written copy of them:
// forms = [one, few, many],
// e.g. plural(2, ['участник', 'участника', 'участников']) → 'участника'.
// Fractions ("other" in CLDR) read like "many" in Russian ("2,5 участников").
const PLURAL_RULES = new Intl.PluralRules('ru');

export function plural(n, forms) {
  switch (PLURAL_RULES.select(n)) {
    case 'one':
      return forms[0];
    case 'few':
      return forms[1];
    default:
      return forms[2];
  }
}

// "+150 ₽" / "-40 ₽" / "+0": an explicit sign for a change, with an optional
// unit suffix (include the leading space yourself: ' ₽').
export function formatSigned(n, unit = '') {
  return `${n >= 0 ? '+' : ''}${n}${unit}`;
}

// A short number for chart axes: 950 → "950", 12 500 → "12,5 тыс", 1 500 000 → "1,5 млн".
export function formatCompact(n) {
  const abs = Math.abs(n);
  const trim = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  if (abs >= 1e9) return `${trim(n / 1e9)} млрд`;
  if (abs >= 1e6) return `${trim(n / 1e6)} млн`;
  if (abs >= 1e4) return `${trim(n / 1e3)} тыс`;
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

// A hit/miss/unanswered cell in a results table.
export const outcomeMark = (outcome) => (outcome === null ? '—' : outcome ? '✓' : '✕');

// A percentage cell; null (nobody answered) shows a dash.
export const formatPercent = (pct) => (pct === null ? '—' : `${pct}%`);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// "19 сентября 2026 г."
export function formatRuDate(date = new Date()) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// "Эффект_якоря_19.09.2026.png" — game title (minus characters a file name
// can't hold, spaces → underscores) + DD.MM.YYYY + extension.
export function buildExportFilename(gameTitle, date = new Date(), ext = 'png') {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const slug = String(gameTitle)
    .replace(/[:/\\*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${slug}_${dd}.${mm}.${date.getFullYear()}.${ext}`;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat('ru', { numeric: 'always' });

// "Saved 3 minutes ago" for the draft-recovery banner, worded and declined
// by Intl.RelativeTimeFormat ("22 минуты назад", "3 часа назад") — the
// only thing we add is "только что" for the first minute. `now` is
// injectable so tests don't depend on the clock.
export function timeAgo(ts, now = Date.now()) {
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return RELATIVE_TIME.format(-mins, 'minute');
  return RELATIVE_TIME.format(-Math.round(mins / 60), 'hour');
}

// First letter of the name, uppercased — the fallback for a person with
// no photo; '?' for an empty name.
export function avatarInitial(name) {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

// A person keeps one colour everywhere, chosen by their position in the
// participant list and wrapping around the palette; an unknown name gets
// the first colour.
export function pickAvatarColor(name, participants, palette) {
  const idx = participants.indexOf(name);
  return palette[(idx < 0 ? 0 : idx) % palette.length];
}
