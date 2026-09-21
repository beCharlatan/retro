/* =========================================================
   CHART DATA — the numbers behind the results charts (pure)
   =========================================================
   The d3 code in src/charts/ only draws; deciding WHAT to draw — how many
   people gave each rating, which pairs cooperated, what range an axis
   should cover so one absurd answer doesn't flatten everyone else — is
   arithmetic, and lives here so it can be unit-tested (test/unit/
   chart-data.test.js).
========================================================= */

// Round a positive number UP to a "nice" axis maximum: 37 → 40, 1234 → 1500,
// 0.8 → 1. Uses the 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 / 10 ladder per decade.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceCeil(value) {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const scaled = value / pow;
  const step = NICE_STEPS.find((s) => s >= scaled - 1e-9) ?? 10;
  return step * pow;
}

// An axis running from 0 to a nice value just above the largest number.
export function zeroBasedDomain(values, headroom = 1.06) {
  const max = Math.max(0, ...values);
  return [0, niceCeil(max * headroom)];
}

// q-quantile (0..1) of a list, linear interpolation; null for an empty list.
export function quantile(values, q) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ---------- Эффект Барнума: how many people gave each rating ----------

export function ratingCounts(ratings, min = 0, max = 5) {
  const counts = Array.from({ length: max - min + 1 }, () => 0);
  for (const r of ratings) {
    const i = Math.round(r) - min;
    if (i >= 0 && i < counts.length) counts[i]++;
  }
  return counts;
}

// ---------- Дилемма заключённого: what each pair ended up doing ----------

// For one round ('1' or '2'), split the pairs into: both cooperated, one was
// betrayed (exactly one defected), both defected. `filled` = complete pair rows.
export function dilemmaOutcomes(filled, round) {
  const a = `r${round}a`;
  const b = `r${round}b`;
  const out = { mutual: 0, exploited: 0, defect: 0, total: filled.length };
  for (const e of filled) {
    if (e[a] === 'C' && e[b] === 'C') out.mutual++;
    else if (e[a] === 'D' && e[b] === 'D') out.defect++;
    else out.exploited++;
  }
  return out;
}

// ---------- Калибровка: the ranges people named ----------

// The value range an interval lane should show. People sometimes type an absurd
// "90% sure" range (0 to 999999); if the axis had to reach it, every sensible range
// would shrink to a sliver. So the axis covers the true answer plus the MIDDLE of what
// people said (10th percentile of lows … 90th percentile of highs), with padding —
// wider intervals are drawn clipped at the edge instead.
export function intervalDomain(bars, answer, { lowQ = 0.1, highQ = 0.9, pad = 0.08 } = {}) {
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  let lo = answer;
  let hi = answer;
  if (bars.length) {
    lo = Math.min(answer, quantile(lows, lowQ));
    hi = Math.max(answer, quantile(highs, highQ));
  }
  let span = hi - lo;
  if (span <= 0) span = Math.max(1, Math.abs(answer) * 0.2);
  return [lo - span * pad, hi + span * pad];
}

// Clip an interval to the axis; says which sides were cut so they can be marked.
export function clipInterval(low, high, [min, max]) {
  return {
    low: Math.max(low, min),
    high: Math.min(high, max),
    clippedLow: low < min,
    clippedHigh: high > max,
    visible: high >= min && low <= max,
  };
}

// Narrowest range first — the most confident people at the top reads well.
export const sortIntervals = (bars) =>
  bars.slice().sort((a, b) => a.high - a.low - (b.high - b.low) || a.low - b.low);

// ---------- Ошибка планирования / Ультиматум: scatter axes ----------

// A shared square-ish domain for a scatter where both axes are on the same scale
// (planned vs actual time, offer vs minimum): 0 … a nice number above the largest.
export function sharedDomain(pairs, headroom = 1.08) {
  const all = pairs.flat().filter((v) => Number.isFinite(v));
  return zeroBasedDomain(all, headroom);
}
