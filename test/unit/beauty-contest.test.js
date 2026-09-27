// test/unit/beauty-contest.test.js
// "Guess 2/3 of the average" (src/logic/beauty-contest.js): the target, the
// winners (ties included) and the reading of a guess as a step of reasoning.
import { describe, expect, test } from 'bun:test';
import {
  BC_ROUNDS,
  beautyResults,
  beautyRound,
  reasoningLevel,
} from '../../src/logic/beauty-contest.js';

const row = (name, guesses) => ({
  name,
  guesses: [...guesses, ...Array(BC_ROUNDS - guesses.length).fill(null)],
});

describe('beautyRound', () => {
  test('mean, ⅔ of it, and the closest guess wins', () => {
    const r = beautyRound([row('А', [60]), row('Б', [21]), row('В', [9])], 0);
    expect(r.mean).toBe(30);
    expect(r.target).toBe(20);
    expect(r.winners.map((w) => w.name)).toEqual(['Б']);
  });

  test('equally close guesses all win', () => {
    const r = beautyRound([row('А', [50]), row('Б', [30]), row('В', [10])], 0);
    expect(r.target).toBe(20);
    expect(r.winners.map((w) => w.name).sort()).toEqual(['Б', 'В']);
  });

  test('people without a number are left out; an empty round is null', () => {
    expect(beautyRound([row('А', [30]), row('Б', [])], 0).n).toBe(1);
    expect(beautyRound([row('А', []), row('Б', [])], 0)).toBeNull();
  });
});

describe('reasoningLevel', () => {
  test('nearest step within ±3, zero and the impossible are their own kinds', () => {
    expect(reasoningLevel(50)).toBe(0);
    expect(reasoningLevel(35)).toBe(1);
    expect(reasoningLevel(22)).toBe(2);
    expect(reasoningLevel(14)).toBe(3);
    expect(reasoningLevel(0)).toBe('zero');
    expect(reasoningLevel(80)).toBe('impossible');
    expect(reasoningLevel(42)).toBeNull();
  });
});

describe('beautyResults', () => {
  const rows = [
    row('А', [50, 20, 8, 3]),
    row('Б', [33, 15, 6, 2]),
    row('В', [0, 0, 0, 0]),
    row('Г', [90, 30, 10, 4]),
  ];

  test('target per round and the steps of round 1', () => {
    const r = beautyResults(rows);
    expect(r.targetByRound[0]).toBe(28.8); // mean 43.25 × ⅔
    expect(r.levelsR1).toEqual({ l0: 1, l1: 1, l2: 0, l3plus: 0, zero: 1, impossible: 1 });
    expect(r.zeroCount).toBe(1);
  });

  test('wins are counted per person over the rounds', () => {
    const r = beautyResults(rows);
    expect([...r.wins.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(BC_ROUNDS);
    expect(r.wins.get('Б')).toBeGreaterThan(0);
  });

  test('no first round → null; missing later rounds stay null', () => {
    expect(beautyResults([row('А', []), row('Б', [])])).toBeNull();
    const r = beautyResults([row('А', [40]), row('Б', [20])]);
    expect(r.targetByRound.slice(1)).toEqual([null, null, null]);
  });
});
