// test/unit/chart-layout.test.js — vertical geometry of the dot charts
import { describe, expect, test } from 'bun:test';
import { stackLanes, swarmHeight, valueDomain } from '../../src/logic/chart-layout.js';
import { dodge } from '../../src/logic/stats.js';

describe('swarmHeight', () => {
  test('an empty or flat swarm needs room for one dot plus padding', () => {
    expect(swarmHeight([], 6)).toBe(18);
    expect(swarmHeight([{ y: 0 }, { y: 0 }], 6)).toBe(18);
  });
  test('grows with the tallest stack', () => {
    expect(swarmHeight([{ y: 0 }, { y: 30 }, { y: 12 }], 6)).toBe(48);
  });
  test('a pile of identical answers makes a taller lane than a spread-out team', () => {
    const pile = dodge([500, 500, 500, 500, 500], (d) => d, 7.5);
    const spread = dodge([0, 200, 400, 600, 800], (d) => d, 7.5);
    expect(swarmHeight(pile, 6)).toBeGreaterThan(swarmHeight(spread, 6));
  });
});

describe('valueDomain', () => {
  test('starts at zero and leaves 15% headroom above the largest value', () => {
    const [min, max] = valueDomain([100, 400, 250]);
    expect(min).toBe(0);
    expect(max).toBeCloseTo(460, 9);
  });
  test('extends below zero for negative values', () => {
    expect(valueDomain([-100, 50])[0]).toBeCloseTo(-90, 9);
  });
  test('the extremes always fall strictly inside the domain', () => {
    const values = [10, 60, 400];
    const [min, max] = valueDomain(values);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThan(max);
    }
  });
});

describe('stackLanes', () => {
  test('one lane: baseline = firstTop + height, total adds the bottom pad', () => {
    expect(stackLanes([50], { firstTop: 34, gap: 30, bottom: 40 })).toEqual({
      baselines: [84],
      height: 124,
    });
  });
  test('later lanes sit `gap` + their own height below the previous baseline', () => {
    const { baselines, height } = stackLanes([50, 20], { firstTop: 34, gap: 30, bottom: 40 });
    expect(baselines).toEqual([84, 134]);
    expect(height).toBe(174);
  });
  test('no lanes → just the top and bottom padding', () => {
    expect(stackLanes([], { firstTop: 10, gap: 5, bottom: 7 })).toEqual({
      baselines: [],
      height: 17,
    });
  });
  test('reproduces the crowd-wisdom layout (per-lane top/bottom pad + gap)', () => {
    // MT=40 above each lane's content, MB=30 below its axis, laneGap=26 between lanes.
    const MT = 40;
    const MB = 30;
    const laneGap = 26;
    const heights = [60, 90, 30];
    // The original loop, verbatim:
    let cursorY = 0;
    const original = heights.map((h) => {
      const baseline = cursorY + MT + h;
      cursorY = baseline + MB + laneGap;
      return baseline;
    });
    const originalH = cursorY - laneGap;
    const { baselines, height } = stackLanes(heights, {
      firstTop: MT,
      gap: MT + MB + laneGap,
      bottom: MB,
    });
    expect(baselines).toEqual(original);
    expect(height).toBe(originalH);
  });
  test('baselines increase monotonically', () => {
    const { baselines } = stackLanes([10, 10, 10, 10], { firstTop: 5, gap: 5, bottom: 5 });
    for (let i = 1; i < baselines.length; i++)
      expect(baselines[i]).toBeGreaterThan(baselines[i - 1]);
  });
});
