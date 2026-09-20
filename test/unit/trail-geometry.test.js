// test/unit/trail-geometry.test.js — src/logic/trail-geometry.js

import { describe, expect, test } from 'bun:test';
import * as d3 from 'd3';
import { checkMarkPath, stepAnchors, TRAIL } from '../../src/logic/trail-geometry.js';

describe('stepAnchors', () => {
  test('one anchor per step', () => {
    for (const n of [0, 1, 2, 5, 7]) expect(stepAnchors(n)).toHaveLength(n);
  });
  test('zig-zags between the two columns', () => {
    const xs = stepAnchors(5).map(([x]) => x);
    expect(xs).toEqual([
      TRAIL.columns[0],
      TRAIL.columns[1],
      TRAIL.columns[0],
      TRAIL.columns[1],
      TRAIL.columns[0],
    ]);
  });
  test('first and last steps sit on the padding, the rest evenly between', () => {
    const ys = stepAnchors(5).map(([, y]) => y);
    expect(ys[0]).toBe(TRAIL.padY);
    expect(ys[4]).toBe(TRAIL.maxHeight - TRAIL.padY);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
  });
  test('the total height is capped: a 7-step trail is as tall as a 3-step one', () => {
    const last = (n) => stepAnchors(n).at(-1)[1];
    expect(last(7)).toBe(last(3));
  });
  test('a single step sits mid-rail', () => {
    expect(stepAnchors(1)[0][1]).toBeCloseTo(TRAIL.maxHeight / 2, 9);
  });
  test('matches d3.scalePoint, which this replaced', () => {
    for (const n of [1, 2, 3, 6, 7]) {
      const y = d3
        .scalePoint()
        .domain(d3.range(n))
        .range([TRAIL.padY, TRAIL.maxHeight - TRAIL.padY]);
      const expected = d3.range(n).map((i) => [TRAIL.columns[i % 2], y(i)]);
      const got = stepAnchors(n);
      got.forEach(([x, gy], i) => {
        expect(x).toBe(expected[i][0]);
        expect(gy).toBeCloseTo(expected[i][1], 9);
      });
    }
  });
  test('steps go strictly downward', () => {
    const ys = stepAnchors(6).map(([, y]) => y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });
});

describe('checkMarkPath', () => {
  test('is a 3-point polyline centred on the node', () => {
    expect(checkMarkPath(100, 50, 10)).toBe('M 95,50 L 99,54 L 105.5,45');
  });
  test('scales with the node radius', () => {
    expect(checkMarkPath(0, 0, 20)).toBe('M -10,0 L -2,8 L 11,-10');
  });
});
