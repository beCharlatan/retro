/* =========================================================
   CHART LAYOUT — vertical geometry of the beeswarm charts (pure)
   =========================================================
   The dot charts size themselves from their data: a pile of identical
   answers needs a tall lane, a spread-out team a short one, and the SVG
   height follows (a fixed height once wasted a whole PDF page, then a
   whole page of the export). These functions are that arithmetic, with
   no d3 or DOM, so it can be unit-tested.
========================================================= */

// Height one swarm needs: room for a dot at the axis plus the tallest
// stack above it. `swarm` is the output of stats.js's dodge().
export function swarmHeight(swarm, dotRadius) {
  return dotRadius * 2 + 6 + Math.max(0, ...swarm.map((s) => s.y));
}

// The value range a lane's axis should cover: zero (or slightly below the
// smallest value) up to a little above the largest, so the extreme dots and
// the "correct answer" marker never sit on the edge.
//
// Never zero-width: if every value (and the answer) is 0 the naive range is
// [0, 0], which a d3 scale would collapse to one point — so the domain always
// spans at least one unit.
export function valueDomain(values, { headroom = 1.15, floor = 0.9 } = {}) {
  const min = Math.min(0, Math.min(...values) * floor);
  const max = Math.max(Math.max(...values) * headroom, min + 1);
  return [min, max];
}

// Stacks lanes top to bottom. `heights[i]` is lane i's content height;
// returns each lane's baseline (y of its axis) and the total SVG height.
//   firstTop  space above the first lane's content
//   gap       space from one lane's baseline to the next lane's content
//   bottom    space below the last baseline
export function stackLanes(heights, { firstTop, gap, bottom }) {
  const baselines = [];
  let cursor = firstTop;
  heights.forEach((h, i) => {
    cursor = i === 0 ? cursor + h : cursor + gap + h;
    baselines.push(cursor);
  });
  return { baselines, height: cursor + bottom };
}
