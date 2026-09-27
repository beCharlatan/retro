// test/unit/leaderboard.test.js
// The end-of-game standings (src/logic/leaderboard.js): places with ties,
// and the per-game scores the board is built from.
import { describe, expect, test } from 'bun:test';
import {
  auctionScores,
  prisonersDilemmaScores,
  rankScores,
  ultimatumScores,
} from '../../src/logic/leaderboard.js';

describe('rankScores', () => {
  test('highest first; tied people share a place, the next place skips', () => {
    const r = rankScores([
      { name: 'В', score: 10 },
      { name: 'А', score: 30 },
      { name: 'Г', score: 10 },
      { name: 'Б', score: 20 },
    ]);
    expect(r.map((x) => [x.name, x.place])).toEqual([
      ['А', 1],
      ['Б', 2],
      ['В', 3],
      ['Г', 3],
    ]);
  });

  test('negative scores sort below zero; missing scores are left out', () => {
    const r = rankScores([
      { name: 'А', score: -5 },
      { name: 'Б', score: 0 },
      { name: 'В', score: Number.NaN },
    ]);
    expect(r.map((x) => x.name)).toEqual(['Б', 'А']);
  });
});

describe('per-game scores', () => {
  test('prisoners dilemma: both rounds added up, a trio member counts both matches', () => {
    const scores = prisonersDilemmaScores([
      { a: 'А', b: 'Б', r1a: 'C', r1b: 'C', r2a: 'D', r2b: 'C' },
      { a: 'Б', b: 'В', r1a: 'D', r1b: 'D', r2a: 'C', r2b: 'C' },
    ]);
    const get = (n) => scores.find((s) => s.name === n).score;
    expect(get('А')).toBe(3 + 5);
    expect(get('Б')).toBe(3 + 0 + 1 + 3);
    expect(get('В')).toBe(1 + 3);
  });

  test('ultimatum: a deal splits the stake, no deal gives both nothing', () => {
    const scores = ultimatumScores(
      [
        { proposer: 'А', responder: 'Б', offer: 300, min: 200 }, // deal
        { proposer: 'Б', responder: 'А', offer: 100, min: 400 }, // rejected
      ],
      1000,
    );
    const get = (n) => scores.find((s) => s.name === n).score;
    expect(get('А')).toBe(700);
    expect(get('Б')).toBe(300);
  });

  test('dollar auction: prize minus the bid for the winner, the runner-up only pays', () => {
    const scores = auctionScores(
      ['А', 'Б', 'В'],
      { winner: 'Б', final: 160, runnerUp: 'А', second: 150 },
      100,
    );
    expect(scores).toEqual([
      { name: 'А', score: -150 },
      { name: 'Б', score: -60 },
      { name: 'В', score: 0 },
    ]);
  });
});
