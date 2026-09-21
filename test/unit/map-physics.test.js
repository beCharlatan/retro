// test/unit/map-physics.test.js
// The home map's numbers (src/logic/map-physics.js): seeded randomness,
// the zoom camera, the layout, and the per-frame drift/bounce/separation.
import { describe, expect, test } from 'bun:test';
import {
  applyTransform,
  computeIconScale,
  computeSafeBounds,
  DRIFT_SPEED,
  FOCUS_SCALE,
  FOCUS_X_FRAC,
  FOCUS_Y_FRAC,
  focusTransform,
  hashString,
  ICON_SIZE,
  IDENTITY,
  initialNodes,
  interpolateTransform,
  MIN_ICON_SCALE,
  MIN_SEPARATION,
  MIN_SPAN,
  MOUSE_REPEL_RADIUS,
  moveNodes,
  mulberry32,
  SAFE_INSET,
  separateNodes,
  smoothHeading,
  WAKE,
  wakeDots,
} from '../../src/logic/map-physics.js';

const GAMES = Array.from({ length: 13 }, (_, i) => ({ id: `game-${i}`, name: `Game ${i}` }));
const BOUNDS = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
const node = (over = {}) => ({ x: 500, y: 400, vx: 0, vy: 0, frozen: false, ...over });

describe('seeded randomness', () => {
  test('hashString is deterministic and spreads different inputs', () => {
    expect(hashString('map-layout')).toBe(hashString('map-layout'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('')).toBe(2166136261);
  });
  test('hashString is an unsigned 32-bit integer', () => {
    const h = hashString('anything at all');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
  test('mulberry32 yields floats in [0,1) and the same stream for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(b()).toBe(v);
    }
  });
  test('different seeds give different streams', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('camera', () => {
  test('applyTransform scales then translates', () => {
    expect(applyTransform(IDENTITY, [10, 20])).toEqual([10, 20]);
    expect(applyTransform({ k: 2, x: 5, y: -5 }, [10, 20])).toEqual([25, 35]);
  });
  test('interpolateTransform hits both endpoints and the midpoint', () => {
    const a = { k: 1, x: 0, y: 0 };
    const b = { k: 3, x: 100, y: -40 };
    const at = interpolateTransform(a, b);
    expect(at(0)).toEqual(a);
    expect(at(1)).toEqual(b);
    expect(at(0.5)).toEqual({ k: 2, x: 50, y: -20 });
  });
  test('focusTransform puts the node exactly on the focus point', () => {
    const n = { x: 400, y: 300 };
    const t = focusTransform(n, 1000, 800);
    expect(t.k).toBe(FOCUS_SCALE);
    const [sx, sy] = applyTransform(t, [n.x, n.y]);
    expect(sx).toBeCloseTo(1000 * FOCUS_X_FRAC, 6);
    expect(sy).toBeCloseTo(800 * FOCUS_Y_FRAC, 6);
  });
  test('focusTransform without a node keeps the current camera', () => {
    const current = { k: 2, x: 1, y: 2 };
    expect(focusTransform(null, 1000, 800, current)).toBe(current);
  });
  test('focusTransform falls back to a default container size when unmeasured', () => {
    const t = focusTransform({ x: 0, y: 0 }, 0, 0);
    expect(t.x).toBeCloseTo(900 * FOCUS_X_FRAC, 6);
  });
});

describe('computeSafeBounds', () => {
  test('is the container minus the HUD insets', () => {
    expect(computeSafeBounds(1400, 900)).toEqual({
      minX: SAFE_INSET.left,
      maxX: 1400 - SAFE_INSET.right,
      minY: SAFE_INSET.top,
      maxY: 900 - SAFE_INSET.bottom,
    });
  });
  test('a small window (300×300) still leaves MIN_SPAN to play in per axis', () => {
    const b = computeSafeBounds(300, 300);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(MIN_SPAN - 1e-9);
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(MIN_SPAN - 1e-9);
  });
  test('the bounds never reach outside the container (so nothing is off-screen)', () => {
    for (const [w, h] of [
      [390, 700],
      [900, 360],
      [1280, 500],
      [1440, 800],
      [100, 100],
    ]) {
      const b = computeSafeBounds(w, h);
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(w);
      expect(b.maxY).toBeLessThanOrEqual(h);
    }
  });
  test('on a short window the vertical HUD reserve eases off so the icons get more height', () => {
    const tall = computeSafeBounds(1400, 900);
    const short = computeSafeBounds(1400, 420);
    expect(short.maxY - short.minY).toBeGreaterThan(0.5 * (420 - 240)); // more than the un-eased reserve would leave
    expect(short.minY).toBeLessThan(tall.minY);
  });
  test('on a normal-height window the bounds are exactly the fixed HUD insets', () => {
    expect(computeSafeBounds(1400, 700)).toEqual({
      minX: SAFE_INSET.left,
      maxX: 1400 - SAFE_INSET.right,
      minY: SAFE_INSET.top,
      maxY: 700 - SAFE_INSET.bottom,
    });
  });
  test('an unmeasured (0×0) container uses the default size', () => {
    expect(computeSafeBounds(0, 0)).toEqual(computeSafeBounds(900, 600));
  });
});

describe('initialNodes', () => {
  const bounds = computeSafeBounds(1400, 900);
  const nodes = initialNodes(GAMES, bounds);
  test('one node per game, keeping the game’s own fields', () => {
    expect(nodes).toHaveLength(GAMES.length);
    expect(nodes.map((n) => n.id)).toEqual(GAMES.map((g) => g.id));
    expect(nodes[0].name).toBe('Game 0');
  });
  test('every node starts inside the bounds and unfrozen', () => {
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.x).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.y).toBeLessThanOrEqual(bounds.maxY);
      expect(n.frozen).toBe(false);
    }
  });
  test('drift speed is within DRIFT_SPEED', () => {
    for (const n of nodes) {
      const speed = Math.hypot(n.vx, n.vy);
      expect(speed).toBeGreaterThanOrEqual(DRIFT_SPEED[0] - 1e-9);
      expect(speed).toBeLessThanOrEqual(DRIFT_SPEED[1] + 1e-9);
    }
  });
  test('the layout is deterministic (a reload does not reshuffle)', () => {
    expect(initialNodes(GAMES, bounds)).toEqual(nodes);
  });
  test('a different seed gives a different layout', () => {
    expect(initialNodes(GAMES, bounds, { seed: 'other' })).not.toEqual(nodes);
  });
  test('most icons start clear of each other (rejection sampling)', () => {
    let close = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < MIN_SEPARATION) close++;
      }
    }
    expect(close).toBeLessThan(6);
  });
});

describe('moveNodes', () => {
  test('drifts at constant velocity', () => {
    const n = node({ vx: 10, vy: -4 });
    moveNodes([n], 2, BOUNDS);
    expect(n.x).toBeCloseTo(520, 9);
    expect(n.y).toBeCloseTo(392, 9);
  });
  test('bounces off the right and bottom edges, turning the velocity inward', () => {
    const n = node({ x: 999, y: 799, vx: 10, vy: 10 });
    moveNodes([n], 1, BOUNDS);
    expect(n.x).toBe(BOUNDS.maxX);
    expect(n.y).toBe(BOUNDS.maxY);
    expect(n.vx).toBe(-10);
    expect(n.vy).toBe(-10);
  });
  test('bounces off the left and top edges', () => {
    const n = node({ x: 1, y: 1, vx: -10, vy: -10 });
    moveNodes([n], 1, BOUNDS);
    expect(n.x).toBe(BOUNDS.minX);
    expect(n.y).toBe(BOUNDS.minY);
    expect(n.vx).toBe(10);
    expect(n.vy).toBe(10);
  });
  test('frozen nodes do not move at all', () => {
    const n = node({ vx: 50, vy: 50, frozen: true });
    moveNodes([n], 1, BOUNDS, { x: 501, y: 401 });
    expect([n.x, n.y]).toEqual([500, 400]);
  });
  test('the pointer pushes a nearby icon away from it', () => {
    const n = node();
    moveNodes([n], 1, BOUNDS, { x: 450, y: 400 }); // pointer to the left → pushed right
    expect(n.x).toBeGreaterThan(500);
    expect(n.y).toBeCloseTo(400, 9);
  });
  test('a far-away pointer does nothing', () => {
    const n = node();
    moveNodes([n], 1, BOUNDS, { x: 500 - MOUSE_REPEL_RADIUS - 10, y: 400 });
    expect([n.x, n.y]).toEqual([500, 400]);
  });
  test('a pointer exactly on an icon does not produce NaN', () => {
    const n = node();
    moveNodes([n], 1, BOUNDS, { x: 500, y: 400 });
    expect(Number.isNaN(n.x)).toBe(false);
    expect(Number.isNaN(n.y)).toBe(false);
  });
  test('over a long run every icon stays inside the bounds', () => {
    const bounds = computeSafeBounds(1400, 900);
    const nodes = initialNodes(GAMES, bounds);
    for (let frame = 0; frame < 60 * 120; frame++) {
      moveNodes(nodes, 1 / 60, bounds, frame % 300 < 150 ? { x: 700, y: 450 } : null);
      separateNodes(nodes, 1 / 60);
      // separation may nudge past the edge for one frame; the next move re-clamps.
    }
    moveNodes(nodes, 1 / 60, bounds);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(n.x).toBeLessThanOrEqual(bounds.maxX);
      expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(n.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});

describe('separateNodes', () => {
  test('pushes an overlapping pair apart, symmetrically', () => {
    const a = node({ x: 500, y: 400 });
    const b = node({ x: 520, y: 400 });
    separateNodes([a, b], 0.1);
    expect(a.x).toBeLessThan(500);
    expect(b.x).toBeGreaterThan(520);
    expect(500 - a.x).toBeCloseTo(b.x - 520, 9);
  });
  test('leaves well-separated icons alone', () => {
    const a = node({ x: 100, y: 100 });
    const b = node({ x: 100 + MIN_SEPARATION + 1, y: 100 });
    separateNodes([a, b], 0.1);
    expect([a.x, b.x]).toEqual([100, 100 + MIN_SEPARATION + 1]);
  });
  test('a frozen icon is not shoved, and its neighbour is not pushed off it', () => {
    const a = node({ x: 500, y: 400, frozen: true });
    const b = node({ x: 510, y: 400 });
    separateNodes([a, b], 0.1);
    expect(a.x).toBe(500);
    expect(b.x).toBe(510);
  });
  test('two icons at the exact same spot do not produce NaN', () => {
    const a = node();
    const b = node();
    separateNodes([a, b], 0.1);
    expect(Number.isNaN(a.x) || Number.isNaN(b.x)).toBe(false);
  });
  test('repeated separation resolves a pile-up (dist grows toward MIN_SEPARATION)', () => {
    const a = node({ x: 500, y: 400 });
    const b = node({ x: 510, y: 400 });
    for (let i = 0; i < 600; i++) separateNodes([a, b], 1 / 60);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(MIN_SEPARATION * 0.95);
  });
});

describe('computeIconScale', () => {
  test('is exactly 1 on normal screens — nothing shrinks', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1440, 800],
      [1366, 700],
      [1280, 720],
    ]) {
      expect(computeIconScale(computeSafeBounds(w, h), 13)).toBe(1);
    }
  });
  test('shrinks on a small or zoomed-in window, but never below the minimum', () => {
    const small = computeIconScale(computeSafeBounds(1000, 420), 13);
    expect(small).toBeLessThan(1);
    expect(small).toBeGreaterThanOrEqual(MIN_ICON_SCALE);
    expect(computeIconScale(computeSafeBounds(300, 300), 13)).toBe(MIN_ICON_SCALE);
  });
  test('a smaller window never gets a bigger icon', () => {
    const scales = [1440, 1200, 1000, 800, 640, 500].map((w) =>
      computeIconScale(computeSafeBounds(w, 500), 13),
    );
    for (let i = 1; i < scales.length; i++)
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1] + 1e-9);
  });
  test('fewer icons need less room, so they shrink less', () => {
    const b = computeSafeBounds(900, 420);
    expect(computeIconScale(b, 5)).toBeGreaterThanOrEqual(computeIconScale(b, 13));
  });
  test('nothing to place → no shrinking', () => {
    expect(computeIconScale(computeSafeBounds(200, 200), 0)).toBe(1);
  });
  test('with the icons shrunk, they actually spread inside a small window without leaving it', () => {
    const w = 900;
    const h = 420;
    const b = computeSafeBounds(w, h);
    const scale = computeIconScale(b, 13);
    const nodes = initialNodes(GAMES, b, { minSeparation: 170 * scale });
    for (let frame = 0; frame < 60 * 30; frame++) {
      moveNodes(nodes, 1 / 60, b);
      separateNodes(nodes, 1 / 60, 170 * scale);
    }
    moveNodes(nodes, 1 / 60, b);
    const half = (75 / 2) * scale + 20; // icon + glow
    for (const n of nodes) {
      expect(n.x - half).toBeGreaterThanOrEqual(0);
      expect(n.x + half).toBeLessThanOrEqual(w);
      expect(n.y - half).toBeGreaterThanOrEqual(0);
      expect(n.y + half).toBeLessThanOrEqual(h);
    }
  });
});

describe('the wake (tail behind an icon)', () => {
  const east = { x: 1, y: 0 };

  test('has the configured number of dots, all BEHIND the icon', () => {
    const dots = wakeDots(east);
    expect(dots).toHaveLength(WAKE.count);
    for (const d of dots) {
      expect(d.dx).toBeLessThan(0); // heading east → tail to the west
      expect(d.dy).toBeCloseTo(0, 9);
    }
  });
  test('regression: the whole tail lies outside the icon itself (it used to hide underneath it)', () => {
    for (const scale of [1, 0.6, 0.4]) {
      const edge = (ICON_SIZE / 2) * scale;
      for (const d of wakeDots(east, scale))
        expect(Math.hypot(d.dx, d.dy) - d.radius).toBeGreaterThan(edge * 0.6);
    }
  });
  test('the dots move away from the icon in order, shrinking and fading toward the tip', () => {
    const dots = wakeDots(east);
    for (let i = 1; i < dots.length; i++) {
      expect(Math.hypot(dots[i].dx, dots[i].dy)).toBeGreaterThan(
        Math.hypot(dots[i - 1].dx, dots[i - 1].dy),
      );
      expect(dots[i].radius).toBeLessThan(dots[i - 1].radius);
      expect(dots[i].alpha).toBeLessThan(dots[i - 1].alpha);
    }
    expect(dots[0].alpha).toBeCloseTo(WAKE.maxAlpha, 9);
    expect(dots.at(-1).alpha).toBeCloseTo(0, 9);
  });
  test('follows the heading in any direction', () => {
    const south = wakeDots({ x: 0, y: 1 });
    expect(south.every((d) => d.dy < 0 && Math.abs(d.dx) < 1e-9)).toBe(true);
    const diag = wakeDots({ x: Math.SQRT1_2, y: Math.SQRT1_2 });
    expect(diag.every((d) => d.dx < 0 && d.dy < 0)).toBe(true);
  });
  test('shrinks with the icon scale', () => {
    const full = wakeDots(east, 1).at(-1);
    const small = wakeDots(east, 0.5).at(-1);
    expect(Math.abs(small.dx)).toBeCloseTo(Math.abs(full.dx) / 2, 9);
    expect(small.radius).toBeCloseTo(full.radius / 2, 9);
  });

  test('smoothHeading: unit length, and moves toward the new direction without snapping', () => {
    let h = { x: 1, y: 0 };
    h = smoothHeading(h, 0, 10, 1 / 60); // the icon now heads south
    expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 9);
    expect(h.y).toBeGreaterThan(0);
    expect(h.y).toBeLessThan(0.2); // one frame later: barely turned
    for (let i = 0; i < 300; i++) h = smoothHeading(h, 0, 10, 1 / 60);
    expect(h.y).toBeGreaterThan(0.99); // eventually fully turned
  });
  test('smoothHeading: a head-on 180° bounce completes the turn (regression: it used to stay stuck)', () => {
    let h = { x: 1, y: 0 };
    for (let i = 0; i < 200; i++) {
      h = smoothHeading(h, -10, 0, 1 / 60);
      expect(Number.isFinite(h.x) && Number.isFinite(h.y)).toBe(true);
      expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 6);
    }
    expect(h.x).toBeLessThan(-0.9);
  });
  test('smoothHeading: a stationary icon keeps its previous heading', () => {
    const h = { x: 0, y: -1 };
    expect(smoothHeading(h, 0, 0, 1 / 60)).toBe(h);
  });
});
