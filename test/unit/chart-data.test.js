// test/unit/chart-data.test.js — src/logic/chart-data.js
import { describe, expect, test } from 'bun:test';
import {
  clipInterval,
  dilemmaOutcomes,
  intervalDomain,
  niceCeil,
  quantile,
  ratingCounts,
  sharedDomain,
  sortIntervals,
  zeroBasedDomain,
} from '../../src/logic/chart-data.js';

describe('niceCeil', () => {
  test('rounds up to a tidy axis maximum', () => {
    expect(niceCeil(37)).toBe(40);
    expect(niceCeil(100)).toBe(100);
    expect(niceCeil(101)).toBe(150);
    expect(niceCeil(1234)).toBe(1500);
    expect(niceCeil(0.85)).toBeCloseTo(1, 9);
    expect(niceCeil(7)).toBe(8);
    expect(niceCeil(9.3)).toBe(10);
  });
  test('never goes below the value', () => {
    for (const v of [0.1, 1, 2.2, 3.3, 45, 99, 250, 4999, 1_200_000])
      expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
  });
  test('garbage falls back to 1 instead of NaN', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
  });
});

describe('zeroBasedDomain / sharedDomain', () => {
  test('starts at 0 and leaves a little headroom above the largest value', () => {
    const [lo, hi] = zeroBasedDomain([10, 42, 30]);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(42);
    expect(hi).toBeLessThanOrEqual(60);
  });
  test('all-zero or empty data still gives a real axis', () => {
    expect(zeroBasedDomain([0, 0])[1]).toBeGreaterThan(0);
    expect(zeroBasedDomain([])[1]).toBeGreaterThan(0);
  });
  test('sharedDomain covers both members of every pair', () => {
    const [, hi] = sharedDomain([
      [1, 5],
      [40, 12],
    ]);
    expect(hi).toBeGreaterThanOrEqual(40);
  });
});

describe('quantile', () => {
  test('interpolates and handles the ends', () => {
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([10, 20], 0.5)).toBe(15);
  });
  test('does not depend on input order or mutate it', () => {
    const xs = [5, 1, 3];
    expect(quantile(xs, 0.5)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
  });
  test('an empty list has no quantile', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('ratingCounts', () => {
  test('counts how many gave each rating 0..5', () => {
    expect(ratingCounts([0, 5, 5, 3, 3, 3])).toEqual([1, 0, 0, 3, 0, 2]);
  });
  test('always returns all six buckets, even when nobody chose some', () => {
    expect(ratingCounts([])).toEqual([0, 0, 0, 0, 0, 0]);
  });
  test('out-of-range values are ignored, the total never exceeds the input', () => {
    const c = ratingCounts([-1, 2, 9]);
    expect(c.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('dilemmaOutcomes', () => {
  const e = (r1a, r1b) => ({ r1a, r1b, r2a: r1b, r2b: r1a });
  const rows = [e('C', 'C'), e('C', 'D'), e('D', 'C'), e('D', 'D'), e('C', 'C')];
  test('splits pairs into mutual cooperation, one betrayed, mutual defection', () => {
    expect(dilemmaOutcomes(rows, 1)).toEqual({ mutual: 2, exploited: 2, defect: 1, total: 5 });
  });
  test('the three groups always add up to the number of pairs', () => {
    const o = dilemmaOutcomes(rows, 2);
    expect(o.mutual + o.exploited + o.defect).toBe(o.total);
  });
  test('no pairs → zeros', () => {
    expect(dilemmaOutcomes([], 1)).toEqual({ mutual: 0, exploited: 0, defect: 0, total: 0 });
  });
});

describe('intervalDomain (calibration axis)', () => {
  const bar = (low, high) => ({ low, high });
  test('always contains the true answer', () => {
    for (const answer of [78, 1071, 3422, 3812]) {
      const [lo, hi] = intervalDomain([bar(answer + 100, answer + 200)], answer);
      expect(lo).toBeLessThanOrEqual(answer);
      expect(hi).toBeGreaterThanOrEqual(answer);
    }
  });
  test('one absurd range does not flatten everyone else (outliers are clipped, not accommodated)', () => {
    const sane = Array.from({ length: 10 }, (_, i) => bar(60 + i, 90 + i));
    const withOutlier = [...sane, bar(0, 999_999)];
    const [, hi] = intervalDomain(withOutlier, 78);
    expect(hi).toBeLessThan(300);
  });
  test('no ranges at all → a small window around the answer', () => {
    const [lo, hi] = intervalDomain([], 100);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(100);
  });
  test('a zero answer with degenerate ranges still gets a real width', () => {
    const [lo, hi] = intervalDomain([bar(0, 0)], 0);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('clipInterval', () => {
  test('leaves an interval inside the axis alone', () => {
    expect(clipInterval(10, 20, [0, 100])).toEqual({
      low: 10,
      high: 20,
      clippedLow: false,
      clippedHigh: false,
      visible: true,
    });
  });
  test('cuts what sticks out and says which side', () => {
    expect(clipInterval(-50, 200, [0, 100])).toMatchObject({
      low: 0,
      high: 100,
      clippedLow: true,
      clippedHigh: true,
    });
  });
  test('an interval entirely outside is not visible', () => {
    expect(clipInterval(200, 300, [0, 100]).visible).toBe(false);
    expect(clipInterval(-9, -1, [0, 100]).visible).toBe(false);
  });
  test('touching the edge counts as visible', () => {
    expect(clipInterval(100, 120, [0, 100]).visible).toBe(true);
  });
});

describe('sortIntervals', () => {
  test('narrowest first, ties by lower bound', () => {
    const sorted = sortIntervals([
      { name: 'wide', low: 0, high: 100 },
      { name: 'b', low: 20, high: 30 },
      { name: 'a', low: 10, high: 20 },
    ]);
    expect(sorted.map((b) => b.name)).toEqual(['a', 'b', 'wide']);
  });
  test('does not mutate its input', () => {
    const input = [
      { low: 5, high: 9 },
      { low: 1, high: 2 },
    ];
    sortIntervals(input);
    expect(input[0].low).toBe(5);
  });
});
