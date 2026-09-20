// test/unit/stats.test.js — the numeric helpers under every game's results.
import { describe, expect, test } from 'bun:test';
import {
  dodge,
  linearRegression,
  mean,
  median,
  pearson,
  percent,
  sum,
} from '../../src/logic/stats.js';

describe('sum / mean / median / percent', () => {
  test('sum and mean', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
  });
  test('mean of nothing is null, not NaN', () => {
    expect(mean([])).toBeNull();
  });
  test('median: odd, even, unsorted, empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  test('median does not mutate its input', () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
  test('percent rounds and guards an empty whole', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 5)).toBe(0);
    expect(percent(0, 0)).toBeNull();
  });
});

describe('pearson', () => {
  test('perfect positive / negative correlation', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });
  test('uncorrelated data is near zero', () => {
    expect(Math.abs(pearson([1, 2, 3, 4], [2, 1, 1, 2]))).toBeLessThan(0.1);
  });
  test('null for too few points or a constant series', () => {
    expect(pearson([1], [1])).toBeNull();
    expect(pearson([], [])).toBeNull();
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([2, 2, 2], [1, 2, 3])).toBeNull();
  });
});

describe('linearRegression', () => {
  test('recovers slope and intercept of an exact line', () => {
    const fit = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
  });
  test('null when the x values are all equal or there are too few points', () => {
    expect(linearRegression([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(linearRegression([1], [1])).toBeNull();
  });
});

describe('dodge (beeswarm layout)', () => {
  const identity = (d) => d;
  test('returns one circle per datum, sorted by x', () => {
    const out = dodge([30, 10, 20], identity, 5);
    expect(out.map((c) => c.x)).toEqual([10, 20, 30]);
    expect(out.map((c) => c.data)).toEqual([10, 20, 30]);
  });
  test('well-separated points all sit on the axis', () => {
    const out = dodge([0, 100, 200], identity, 5);
    expect(out.every((c) => c.y === 0)).toBe(true);
  });
  test('identical x values stack upward without overlapping', () => {
    const out = dodge([50, 50, 50], identity, 5);
    const ys = out.map((c) => c.y).sort((a, b) => a - b);
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeGreaterThan(ys[0]);
    expect(ys[2]).toBeGreaterThan(ys[1]);
  });
  test('three identical values all get their own slot (regression: they used to collapse onto two)', () => {
    const ys = dodge([500, 500, 500, 500], identity, 10).map((c) => c.y);
    expect(ys).toEqual([0, 10, 20, 30]);
  });
  test('no two circles come closer than `radius` (the minimum centre distance)', () => {
    const r = 6;
    const out = dodge([10, 12, 13, 14, 30, 31, 31, 32, 33, 60], identity, r);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dist = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y);
        expect(dist).toBeGreaterThanOrEqual(r - 1e-6);
      }
    }
  });
  test('a cluster after a big gap is still stacked (regression: queue restart)', () => {
    const out = dodge([10, 11, 200, 201, 201], identity, 10);
    const second = out.filter((c) => c.x >= 200);
    expect(second.map((c) => c.y).some((y) => y > 0)).toBe(true);
  });
  test('handles an empty list', () => {
    expect(dodge([], identity, 5)).toEqual([]);
  });
});
