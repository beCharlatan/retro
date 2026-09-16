// Property tests for src/logic/stats.js — invariants that must hold for ANY input.
import { describe, expect, test } from 'bun:test';
import {
  dodge,
  linearRegression,
  mean,
  median,
  pearson,
  percent,
  sum,
} from '../../../src/logic/stats.js';
import { fc, int, num, RUNS } from './helpers.js';

const nums = fc.array(num(-1e4, 1e4), { minLength: 1, maxLength: 40 });

describe('mean / median', () => {
  test('both lie between the smallest and largest value', () => {
    fc.assert(
      fc.property(nums, (xs) => {
        const lo = Math.min(...xs) - 1e-9;
        const hi = Math.max(...xs) + 1e-9;
        expect(mean(xs)).toBeGreaterThanOrEqual(lo);
        expect(mean(xs)).toBeLessThanOrEqual(hi);
        expect(median(xs)).toBeGreaterThanOrEqual(lo);
        expect(median(xs)).toBeLessThanOrEqual(hi);
      }),
      RUNS,
    );
  });
  test('median ignores order and never mutates its input', () => {
    fc.assert(
      fc.property(nums, (xs) => {
        const copy = xs.slice();
        const shuffled = xs.slice().reverse();
        expect(median(xs)).toBe(median(shuffled));
        expect(xs).toEqual(copy);
      }),
      RUNS,
    );
  });
  test('sum of values equals mean × count', () => {
    fc.assert(
      fc.property(nums, (xs) => expect(mean(xs) * xs.length).toBeCloseTo(sum(xs), 4)),
      RUNS,
    );
  });
});

describe('percent', () => {
  test('a part of a whole is always 0..100', () => {
    fc.assert(
      fc.property(int(0, 500), int(1, 500), (a, b) => {
        const part = Math.min(a, b);
        const whole = Math.max(a, b);
        const p = percent(part, whole);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
        expect(Number.isInteger(p)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('pearson', () => {
  const pairs = fc
    .integer({ min: 2, max: 30 })
    .chain((n) =>
      fc.tuple(
        fc.array(int(-1000, 1000), { minLength: n, maxLength: n }),
        fc.array(int(-1000, 1000), { minLength: n, maxLength: n }),
      ),
    );

  test('is null or within [-1, 1]', () => {
    fc.assert(
      fc.property(pairs, ([xs, ys]) => {
        const r = pearson(xs, ys);
        if (r !== null) {
          expect(r).toBeGreaterThanOrEqual(-1 - 1e-9);
          expect(r).toBeLessThanOrEqual(1 + 1e-9);
        }
      }),
      RUNS,
    );
  });
  test('is symmetric in its two arguments', () => {
    fc.assert(
      fc.property(pairs, ([xs, ys]) => {
        const a = pearson(xs, ys);
        const b = pearson(ys, xs);
        if (a === null) expect(b).toBeNull();
        else expect(a).toBeCloseTo(b, 9);
      }),
      RUNS,
    );
  });
  test('is unchanged by a positive rescale and shift of either variable', () => {
    fc.assert(
      fc.property(pairs, int(1, 20), int(-100, 100), ([xs, ys], scale, shift) => {
        const a = pearson(xs, ys);
        const b = pearson(
          xs.map((x) => x * scale + shift),
          ys,
        );
        if (a === null || b === null) return;
        expect(b).toBeCloseTo(a, 6);
      }),
      RUNS,
    );
  });
});

describe('linearRegression', () => {
  test('recovers the line through exact data', () => {
    fc.assert(
      fc.property(
        num(-10, 10),
        num(-100, 100),
        fc.uniqueArray(int(-50, 50), { minLength: 2, maxLength: 20 }),
        (slope, intercept, xs) => {
          const ys = xs.map((x) => slope * x + intercept);
          const fit = linearRegression(xs, ys);
          expect(fit.slope).toBeCloseTo(slope, 6);
          expect(fit.intercept).toBeCloseTo(intercept, 4);
        },
      ),
      RUNS,
    );
  });
});

describe('dodge (beeswarm)', () => {
  const values = fc.array(num(0, 1000), { maxLength: 60 });
  const radius = num(1, 30);

  test('keeps every datum, sorted by x, never below the axis', () => {
    fc.assert(
      fc.property(values, radius, (vs, r) => {
        const out = dodge(vs, (d) => d, r);
        expect(out).toHaveLength(vs.length);
        for (let i = 1; i < out.length; i++) expect(out[i].x).toBeGreaterThanOrEqual(out[i - 1].x);
        for (const c of out) expect(c.y).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });

  test('no two circles are closer than `radius`', () => {
    fc.assert(
      fc.property(values, radius, (vs, r) => {
        const out = dodge(vs, (d) => d, r);
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const dist = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
            expect(dist).toBeGreaterThanOrEqual(r - 1e-6);
          }
        }
      }),
      RUNS,
    );
  });

  test('clumps of identical values stack in distinct slots', () => {
    fc.assert(
      fc.property(int(1, 12), num(1, 500), num(2, 20), (count, at, r) => {
        const out = dodge(Array(count).fill(at), (d) => d, r);
        const ys = out.map((c) => c.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++)
          expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(r - 1e-6);
      }),
      RUNS,
    );
  });
});
