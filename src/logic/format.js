/* =========================================================
   FORMAT — small text/number helpers used across the app
   =========================================================
   Russian plurals, "N minutes ago", the export file name, HTML escaping,
   avatar initial/colour. All pure (time and the participant list are
   passed in), so they're unit-tested (test/unit/format.test.js) instead
   of living as private copies in whichever file needed them first.
========================================================= */

// Russian plural form for `n`: forms = [one, few, many],
// e.g. plural(2, ['участник', 'участника', 'участников']) → 'участника'.
export function plural(n, forms) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return forms[1];
  return forms[2];
}

// "+150 ₽" / "-40 ₽" / "+0": an explicit sign for a change, with an optional
// unit suffix (include the leading space yourself: ' ₽').
export function formatSigned(n, unit = '') {
  return `${n >= 0 ? '+' : ''}${n}${unit}`;
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

// "Saved 3 minutes ago" for the draft-recovery banner. `now` is injectable
// so tests don't depend on the clock.
export function timeAgo(ts, now = Date.now()) {
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return 'только что';
  if (mins === 1) return 'минуту назад';
  if (mins < 60) return `${mins} ${plural(mins, ['минуту', 'минуты', 'минут'])} назад`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? 'час назад' : `${hrs} ч. назад`;
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
