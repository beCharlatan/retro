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
     layout                   computeSafeBounds, initialNodes
     per-frame simulation     moveNodes, separateNodes

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

// The rectangle icons drift inside for a container of width × height:
// the container minus the HUD insets, never smaller than 200px per axis
// (a tiny window still gets a playable area).
export function computeSafeBounds(width, height, inset = SAFE_INSET) {
  const fullW = width || 900;
  const fullH = height || 600;
  return {
    minX: inset.left,
    maxX: Math.max(fullW - inset.right, inset.left + 200),
    minY: inset.top,
    maxY: Math.max(fullH - inset.bottom, inset.top + 200),
  };
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
