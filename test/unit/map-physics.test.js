// test/unit/map-physics.test.js
// The home map's numbers (src/logic/map-physics.js): seeded randomness,
// the zoom camera, the layout, and the per-frame drift/bounce/separation.
import { describe, expect, test } from 'bun:test';
import {
  applyTransform,
  computeSafeBounds,
  DRIFT_SPEED,
  FOCUS_SCALE,
  FOCUS_X_FRAC,
  FOCUS_Y_FRAC,
  focusTransform,
  hashString,
  IDENTITY,
  initialNodes,
  interpolateTransform,
  MIN_SEPARATION,
  MOUSE_REPEL_RADIUS,
  moveNodes,
  mulberry32,
  SAFE_INSET,
  separateNodes,
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
  test('a tiny window still leaves at least 200px to play in per axis', () => {
    const b = computeSafeBounds(100, 100);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(200);
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(200);
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
