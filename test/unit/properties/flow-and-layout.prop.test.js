// Property tests for round-flow, chart-layout and map-physics.
import { describe, expect, test } from 'bun:test';
import { stackLanes, swarmHeight, valueDomain } from '../../../src/logic/chart-layout.js';
import {
  applyTransform,
  computeSafeBounds,
  focusTransform,
  hashString,
  interpolateTransform,
  moveNodes,
  mulberry32,
  separateNodes,
} from '../../../src/logic/map-physics.js';
import {
  activeIndexFromTops,
  advanceFlow,
  initialFlow,
  isRoundLocked,
  setActiveRound,
} from '../../../src/logic/round-flow.js';
import { dodge } from '../../../src/logic/stats.js';
import { fc, int, num, RUNS } from './helpers.js';

describe('round flow', () => {
  test('screenIdx never decreases, whatever sequence of advances happens', () => {
    fc.assert(
      fc.property(fc.array(int(0, 10), { maxLength: 30 }), (targets) => {
        let s = initialFlow();
        for (const t of targets) {
          const before = s.screenIdx;
          s = advanceFlow(s, t);
          expect(s.screenIdx).toBeGreaterThanOrEqual(before);
          expect(s.screenIdx).toBe(Math.max(before, t));
        }
      }),
      RUNS,
    );
  });
  test('the active round can never run ahead of the unlocked frontier', () => {
    fc.assert(
      fc.property(int(0, 10), fc.array(int(0, 20), { maxLength: 20 }), (frontier, scrolls) => {
        let s = advanceFlow(initialFlow(), frontier);
        for (const idx of scrolls) {
          s = setActiveRound(s, idx);
          expect(s.activeRound).toBeLessThanOrEqual(s.screenIdx);
        }
      }),
      RUNS,
    );
  });
  test('a round is locked exactly when it is past screenIdx', () => {
    fc.assert(
      fc.property(int(0, 10), int(0, 12), (frontier, i) =>
        expect(isRoundLocked(advanceFlow(initialFlow(), frontier), i)).toBe(i > frontier),
      ),
      RUNS,
    );
  });
  test('activeIndexFromTops returns a valid index, and one at/above the line unless it is the first', () => {
    fc.assert(
      fc.property(
        fc.array(num(-3000, 3000), { minLength: 1, maxLength: 12 }),
        num(0, 900),
        (tops, line) => {
          const i = activeIndexFromTops(tops, line);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(tops.length);
          if (i > 0) expect(tops[i]).toBeLessThanOrEqual(line);
          // and no LATER round is also at/above the line
          for (let j = i + 1; j < tops.length; j++) expect(tops[j]).toBeGreaterThan(line);
        },
      ),
      RUNS,
    );
  });
});

describe('chart layout', () => {
  test('stackLanes: baselines strictly increase and the height covers the last one plus the bottom pad', () => {
    fc.assert(
      fc.property(
        fc.array(num(1, 300), { minLength: 1, maxLength: 6 }),
        num(0, 60),
        num(0, 60),
        num(0, 60),
        (hs, firstTop, gap, bottom) => {
          const { baselines, height } = stackLanes(hs, { firstTop, gap, bottom });
          expect(baselines).toHaveLength(hs.length);
          for (let i = 1; i < baselines.length; i++)
            expect(baselines[i]).toBeGreaterThan(baselines[i - 1]);
          expect(baselines[0]).toBeCloseTo(firstTop + hs[0], 9);
          expect(height).toBeCloseTo(baselines.at(-1) + bottom, 9);
        },
      ),
      RUNS,
    );
  });

  test('valueDomain always has a real extent and contains every value (non-negative data)', () => {
    fc.assert(
      fc.property(fc.array(num(0, 1e5), { minLength: 1, maxLength: 30 }), (vs) => {
        const [min, max] = valueDomain(vs);
        expect(max).toBeGreaterThan(min); // a zero-width axis would divide by zero in the scale
        for (const v of vs) {
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
        }
      }),
      RUNS,
    );
  });

  test('a swarm is at least one dot tall and taller when stacked', () => {
    fc.assert(
      fc.property(fc.array(num(0, 500), { maxLength: 40 }), num(2, 12), (vs, r) => {
        const swarm = dodge(vs, (d) => d, r + 1.5);
        expect(swarmHeight(swarm, r)).toBeGreaterThanOrEqual(r * 2 + 6);
      }),
      RUNS,
    );
  });
});

describe('map physics', () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
  const nodeArb = fc.record({
    x: num(0, 1000),
    y: num(0, 800),
    vx: num(-20, 20),
    vy: num(-20, 20),
    frozen: fc.boolean(),
  });
  const pointerArb = fc.option(fc.record({ x: num(-200, 1200), y: num(-200, 1000) }), {
    nil: null,
  });

  test('moveNodes keeps unfrozen icons inside the bounds and never moves frozen ones', () => {
    fc.assert(
      fc.property(
        fc.array(nodeArb, { minLength: 1, maxLength: 13 }),
        num(0, 0.1),
        pointerArb,
        (nodes, dt, pointer) => {
          const before = nodes.map((n) => ({ ...n }));
          moveNodes(nodes, dt, bounds, pointer);
          nodes.forEach((n, i) => {
            if (before[i].frozen) {
              expect([n.x, n.y]).toEqual([before[i].x, before[i].y]);
            } else {
              expect(n.x).toBeGreaterThanOrEqual(bounds.minX);
              expect(n.x).toBeLessThanOrEqual(bounds.maxX);
              expect(n.y).toBeGreaterThanOrEqual(bounds.minY);
              expect(n.y).toBeLessThanOrEqual(bounds.maxY);
            }
            expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
          });
        },
      ),
      RUNS,
    );
  });

  test('separateNodes never produces NaN and preserves the centroid of unfrozen icons', () => {
    fc.assert(
      fc.property(
        fc.array(
          nodeArb.map((n) => ({ ...n, frozen: false })),
          { minLength: 2, maxLength: 13 },
        ),
        num(0, 0.1),
        (nodes, dt) => {
          const cx = nodes.reduce((a, n) => a + n.x, 0);
          const cy = nodes.reduce((a, n) => a + n.y, 0);
          separateNodes(nodes, dt);
          expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
          expect(nodes.reduce((a, n) => a + n.x, 0)).toBeCloseTo(cx, 6);
          expect(nodes.reduce((a, n) => a + n.y, 0)).toBeCloseTo(cy, 6);
        },
      ),
      RUNS,
    );
  });

  test('mulberry32 stays in [0,1) and is reproducible; hashString is a stable u32', () => {
    fc.assert(
      fc.property(fc.integer(), fc.string(), (seed, text) => {
        const a = mulberry32(seed);
        const b = mulberry32(seed);
        for (let i = 0; i < 20; i++) {
          const v = a();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
          expect(b()).toBe(v);
        }
        const h = hashString(text);
        expect(h).toBe(hashString(text));
        expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
      }),
      RUNS,
    );
  });

  test('interpolateTransform hits its endpoints and stays between them', () => {
    const tf = fc.record({ k: num(0.5, 12), x: num(-2000, 2000), y: num(-2000, 2000) });
    fc.assert(
      fc.property(tf, tf, num(0, 1), (a, b, t) => {
        const at = interpolateTransform(a, b);
        const start = at(0);
        // (compare numerically: -0 and 0 are the same position)
        expect(start.k).toBeCloseTo(a.k, 9);
        expect(start.x).toBeCloseTo(a.x, 9);
        expect(start.y).toBeCloseTo(a.y, 9);
        const end = at(1);
        expect(end.k).toBeCloseTo(b.k, 9);
        const mid = at(t);
        expect(mid.k).toBeGreaterThanOrEqual(Math.min(a.k, b.k) - 1e-9);
        expect(mid.k).toBeLessThanOrEqual(Math.max(a.k, b.k) + 1e-9);
      }),
      RUNS,
    );
  });

  test('focusTransform always puts the node on the same on-screen point', () => {
    fc.assert(
      fc.property(num(0, 2000), num(0, 1500), num(400, 3000), num(300, 2000), (nx, ny, w, h) => {
        const t = focusTransform({ x: nx, y: ny }, w, h);
        const [sx, sy] = applyTransform(t, [nx, ny]);
        expect(sx).toBeCloseTo(w * 0.28, 5);
        expect(sy).toBeCloseTo(h * 0.6, 5);
      }),
      RUNS,
    );
  });

  test('computeSafeBounds always leaves a playable rectangle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 4000 }), (w, h) => {
        const b = computeSafeBounds(w, h);
        expect(b.maxX - b.minX).toBeGreaterThanOrEqual(200);
        expect(b.maxY - b.minY).toBeGreaterThanOrEqual(200);
      }),
      RUNS,
    );
  });
});
