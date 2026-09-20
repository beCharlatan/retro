/* =========================================================
   STATS — small pure numeric helpers shared by the games
   =========================================================
   No DOM. Everything returns null (not NaN) when the input can't
   support an answer, so callers can show "—" instead of "NaN".
========================================================= */

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);

export function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Share of `part` in `whole` as a whole-number percentage; null for an
// empty whole.
export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

// Pearson correlation; null for fewer than 2 points or a constant series.
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = sum(xs) / n;
  const my = sum(ys) / n;
  let num = 0,
    dx2 = 0,
    dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

// Least-squares line y = slope·x + intercept; null when it isn't defined.
export function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = sum(xs) / n;
  const my = sum(ys) / n;
  let num = 0,
    denom = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    denom += (xs[i] - mx) ** 2;
  }
  if (denom === 0) return null;
  const slope = num / denom;
  return { slope, intercept: my - slope * mx };
}

// Beeswarm layout (after Bostock's dodge): places one circle per datum
// along a horizontal axis, stacking crowded ones upward. `x(d)` gives a
// datum's x position; `radius` is the MINIMUM CENTRE-TO-CENTRE DISTANCE
// between two circles (so pass 2·dotRadius for dots that must not touch).
// Returns [{ x, y, data }] sorted by x; `y` is the offset above the axis.
//
// Each circle goes at the lowest height that clears every circle still
// within reach of it. Two bugs in the earlier inline version are fixed
// here: it stopped scanning at the first circle with the same x (three
// people who all answered "500" landed on top of each other), and after
// a gap in the data emptied the queue it never restarted it, so a whole
// second cluster was laid out as if nothing were near it.
export function dodge(data, x, radius) {
  const radius2 = radius * radius;
  const circles = data.map((d) => ({ x: x(d), data: d })).sort((a, b) => a.x - b.x);
  let head = null;
  let tail = null;
  for (const b of circles) {
    // Drop circles too far left to matter for this or any later circle.
    while (head && head.x < b.x - radius) head = head.next;
    if (!head) tail = null; // queue emptied — the next circle starts a new one
    let y = 0;
    for (let a = head; a; a = a.next) {
      const dx = b.x - a.x;
      y = Math.max(y, a.y + Math.sqrt(Math.max(0, radius2 - dx * dx)));
    }
    b.y = y;
    b.next = null;
    if (tail) tail.next = b;
    else head = b;
    tail = b;
  }
  return circles;
}
