/* =========================================================
   MAP PHYSICS — the home map's numbers, without the DOM
   =========================================================
   The map (map-render.js) is 13 drifting game icons plus a zoom
   "camera". Everything numeric about it lives here as plain functions on
   plain objects — no d3, no canvas, no window — so it can be unit-tested
   (test/unit/map-physics.test.js) and profiled on its own:

     seeded randomness        hashString, mulberry32
     camera                   applyTransform, interpolateTransform,
                              focusTransform
     layout                   computeSafeBounds, computeIconScale,
                              initialNodes
     per-frame simulation     moveNodes, separateNodes
     motion wake (the tail)   smoothHeading, wakeDots

   A node is { x, y, vx, vy, frozen, ...game }. The simulation functions
   MUTATE the nodes they are given, on purpose: map-render.js binds each
   node object to its <button> via d3's data join, so replacing them
   would silently detach the icons. World space == screen px at the
   identity zoom.
========================================================= */

export const MIN_SEPARATION = 170; // px between icon centres before they push apart
export const DRIFT_SPEED = [6, 15]; // px/s
export const MOUSE_REPEL_RADIUS = 210;
export const MOUSE_REPEL_STRENGTH = 90;
// The HUD cards (roster, filters, masthead, shuffle button) sit at fixed
// screen corners; icons must stay inside what's left.
export const SAFE_INSET = { top: 130, right: 280, bottom: 110, left: 200 };
export const FOCUS_X_FRAC = 0.28;
export const FOCUS_Y_FRAC = 0.6;
export const FOCUS_SCALE = 4.6;

export const IDENTITY = { k: 1, x: 0, y: 0 };

// ---------- seeded randomness ----------

// String → 32-bit seed (FNV-1a).
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic PRNG returning floats in [0, 1).
export function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- camera ----------

// A transform is plain { k, x, y } (scale, translate) — deliberately not
// d3-zoom's class instance, whose prototype methods get lost when
// interpolated.
export function applyTransform(t, [px, py]) {
  return [px * t.k + t.x, py * t.k + t.y];
}

const lerp = (a, b, t) => a + (b - a) * t;

// Returns tt ∈ [0,1] → the transform part-way from `a` to `b`.
export function interpolateTransform(a, b) {
  return (tt) => ({ k: lerp(a.k, b.k, tt), x: lerp(a.x, b.x, tt), y: lerp(a.y, b.y, tt) });
}

// The camera that puts `node` at the focus point (a fixed fraction of the
// container) at FOCUS_SCALE zoom; `fallback` when there is no node.
export function focusTransform(node, width, height, fallback = IDENTITY) {
  if (!node) return fallback;
  const w = width || 900;
  const h = height || 600;
  const targetX = w * FOCUS_X_FRAC;
  const targetY = h * FOCUS_Y_FRAC;
  return { k: FOCUS_SCALE, x: targetX - FOCUS_SCALE * node.x, y: targetY - FOCUS_SCALE * node.y };
}

// ---------- layout ----------

// The smallest playable area per axis; below this the icons are simply
// shrunk (computeIconScale) rather than pushed off-screen.
export const MIN_SPAN = 120;
// Vertical HUD insets shrink on short windows (browser zoomed in, small
// laptop) — the masthead/roster/hint bars are one line tall whatever the
// window is, so they don't need 130px of reserve when only 400px exist.
const SHORT_WINDOW_HEIGHT = 700;
const MIN_VERTICAL_FACTOR = 0.55;

// The rectangle icons drift inside for a container of width × height:
// the container minus the HUD insets. Horizontal insets are the physical
// width of the side HUD cards, so they stay fixed; vertical ones ease off on
// short windows. Never smaller than MIN_SPAN per axis, and always inside the
// container.
export function computeSafeBounds(width, height, inset = SAFE_INSET) {
  const fullW = width || 900;
  const fullH = height || 600;
  const vk = Math.min(1, Math.max(MIN_VERTICAL_FACTOR, fullH / SHORT_WINDOW_HEIGHT));
  const top = inset.top * vk;
  const bottom = inset.bottom * vk;
  const minX = Math.min(inset.left, Math.max(0, fullW - MIN_SPAN));
  const minY = Math.min(top, Math.max(0, fullH - MIN_SPAN));
  return {
    minX,
    maxX: Math.min(fullW, Math.max(fullW - inset.right, minX + MIN_SPAN)),
    minY,
    maxY: Math.min(fullH, Math.max(fullH - bottom, minY + MIN_SPAN)),
  };
}

// How much to shrink the icons (0.4..1) so `count` of them, each wanting
// about MIN_SEPARATION of room, fit in `bounds` without overlapping or
// spilling out. 1 whenever there's room — on a normal screen nothing changes.
export const MIN_ICON_SCALE = 0.4;
const PACKING_EFFICIENCY = 0.7; // circles don't tile a rectangle perfectly

export function computeIconScale(bounds, count, separation = MIN_SEPARATION) {
  if (count <= 0) return 1;
  const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  const wanted = count * separation * separation * PACKING_EFFICIENCY;
  return Math.min(1, Math.max(MIN_ICON_SCALE, Math.sqrt(area / wanted)));
}

// Scatters every game inside `bounds`, each on its own heading. Rejection
// sampling (40 tries) for the starting spread — cheap for 13 points. The
// layout drifts away from its start within seconds, so determinism only
// matters so a reload doesn't reshuffle for no reason.
export function initialNodes(
  games,
  bounds,
  { seed = 'map-layout', minSeparation = MIN_SEPARATION } = {},
) {
  const rand = mulberry32(hashString(seed));
  const placed = [];
  for (const g of games) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
      y = bounds.minY + rand() * (bounds.maxY - bounds.minY);
      if (placed.every((n) => Math.hypot(n.x - x, n.y - y) >= minSeparation)) break;
    }
    const angle = rand() * Math.PI * 2;
    const speed = DRIFT_SPEED[0] + rand() * (DRIFT_SPEED[1] - DRIFT_SPEED[0]);
    placed.push({
      ...g,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      frozen: false,
    });
  }
  return placed;
}

// ---------- per-frame simulation ----------

// Advances every unfrozen node by `dt` seconds: constant-velocity drift, a
// gentle push away from the pointer (`pointer` = {x, y} in world space, or
// null), and a bounce off the edges of `bounds`.
export function moveNodes(nodes, dt, bounds, pointer = null) {
  for (const n of nodes) {
    if (n.frozen) continue;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    if (pointer) {
      const dx = n.x - pointer.x;
      const dy = n.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < MOUSE_REPEL_RADIUS) {
        const force = (1 - dist / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_STRENGTH;
        n.x += (dx / dist) * force * dt;
        n.y += (dy / dist) * force * dt;
      }
    }
    if (n.x < bounds.minX) {
      n.x = bounds.minX;
      n.vx = Math.abs(n.vx);
    } else if (n.x > bounds.maxX) {
      n.x = bounds.maxX;
      n.vx = -Math.abs(n.vx);
    }
    if (n.y < bounds.minY) {
      n.y = bounds.minY;
      n.vy = Math.abs(n.vy);
    } else if (n.y > bounds.maxY) {
      n.y = bounds.maxY;
      n.vy = -Math.abs(n.vy);
    }
  }
}

// Gentle separation so two icons don't drift into a stacked pile: any
// unfrozen pair closer than `minSeparation` is nudged apart. O(n²) over 13
// nodes is nothing.
export function separateNodes(nodes, dt, minSeparation = MIN_SEPARATION) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].frozen) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].frozen) continue;
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      // Floor, not `|| 1`: two icons a denormal-float apart would make
      // (minSeparation - dist) / dist overflow to Infinity and fling both off.
      const dist = Math.max(Math.hypot(dx, dy), 1e-6);
      if (dist < minSeparation) {
        const push = ((minSeparation - dist) / dist) * 0.5;
        const ox = dx * push;
        const oy = dy * push;
        nodes[i].x -= ox * dt * 6;
        nodes[i].y -= oy * dt * 6;
        nodes[j].x += ox * dt * 6;
        nodes[j].y += oy * dt * 6;
      }
    }
  }
}

// ---------- the wake (the fading tail behind a drifting icon) ----------
//
// The tail used to be the icon's last 10 positions. The icons drift at
// 6–15 px/s, so 10 frames back is about 2 px — the whole "trail" sat under
// the icon and was invisible. It is now drawn as a comet tail: dots laid out
// BEHIND the icon, starting just past its edge and reaching a fixed distance
// away, regardless of how slowly the icon drifts.

export const ICON_SIZE = 75; // px, the game icon's own size at scale 1
export const WAKE = {
  count: 9, // dots in the tail
  startGap: 8, // px between the icon's edge and the first dot
  gap: 11, // px between neighbouring dots
  maxRadius: 10, // the dot nearest the icon
  minRadius: 3, // the dot at the far end
  maxAlpha: 0.38,
  fade: 1.25, // >1 fades faster than linearly toward the tip
};

// Which way the icon is heading, smoothed: a bounce off an edge flips its
// velocity instantly, and an instantly flipping tail would snap across the
// icon. `prev` is a unit vector; the result is too. Time constant `tau` (s).
//
// Turns by ANGLE, along the shorter way round. (Blending the two vectors and
// re-normalising looks equivalent but is stuck on a head-on 180° reversal:
// the blend of (1,0) and (-1,0) is still along the x axis, so after
// normalising it never leaves (1,0).)
export function smoothHeading(prev, vx, vy, dt, tau = 0.45) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-6) return prev;
  const from = Math.atan2(prev.y, prev.x);
  let turn = Math.atan2(vy, vx) - from;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  else if (turn < -Math.PI) turn += 2 * Math.PI;
  const angle = from + turn * (1 - Math.exp(-dt / tau));
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// The tail's dots relative to the icon's centre, for an icon heading `heading`
// (unit vector) and shrunk by `iconScale`. Every offset points BACKWARD, and
// starts outside the icon's own radius so the tail is actually visible.
// Returns [{ dx, dy, radius, alpha }] nearest-to-the-icon first.
export function wakeDots(heading, iconScale = 1, wake = WAKE) {
  const edge = (ICON_SIZE / 2) * iconScale;
  const dots = [];
  for (let i = 0; i < wake.count; i++) {
    const t = wake.count > 1 ? i / (wake.count - 1) : 0;
    const distance = edge + (wake.startGap + i * wake.gap) * iconScale;
    dots.push({
      dx: -heading.x * distance,
      dy: -heading.y * distance,
      radius: (wake.maxRadius + (wake.minRadius - wake.maxRadius) * t) * iconScale,
      alpha: wake.maxAlpha * (1 - t) ** wake.fade,
    });
  }
  return dots;
}
