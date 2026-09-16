/* =========================================================
   TRAIL GEOMETRY — where the steps of the game rail sit
   =========================================================
   Pure math behind game-trail.js's vertical rail (no d3, no DOM).
========================================================= */

export const TRAIL = {
  columns: [175, 95], // steps alternate right / left
  padY: 55,
  maxHeight: 620,
};

// One [x, y] per step: zig-zag between the two columns, evenly spread
// down the rail. Height is capped and the gap computed from it, so a 7-round
// game fits the same rail as a 4-round one. A single step sits mid-rail.
export function stepAnchors(
  total,
  { columns = TRAIL.columns, padY = TRAIL.padY, maxHeight = TRAIL.maxHeight } = {},
) {
  const top = padY;
  const bottom = maxHeight - padY;
  const gap = total > 1 ? (bottom - top) / (total - 1) : 0;
  const offset = total > 1 ? 0 : (bottom - top) / 2;
  return Array.from({ length: total }, (_, i) => [
    columns[i % columns.length],
    top + offset + i * gap,
  ]);
}

// A small checkmark path scaled to the node's own radius, so a finished
// step reads as a cleared checkpoint, not just a different shade of dot.
export function checkMarkPath(x, y, r) {
  const s = r / 10;
  return `M ${x - 5 * s},${y} L ${x - 1 * s},${y + 4 * s} L ${x + 5.5 * s},${y - 5 * s}`;
}
