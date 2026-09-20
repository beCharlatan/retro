// test/unit/reveal-copy.test.js
// The results-screen headline copy (src/reveal-copy.js) is pure
// text-from-numbers: every game must give a plain-language "what it is"
// and "how to read it" even before there is data, and a verdict that
// actually changes with the team's numbers.
import { describe, expect, test } from 'bun:test';
import { REVEAL_COPY } from '../../src/reveal-copy.js';

const SAMPLES = {
  anchoring: [
    { lowAvg: 20, highAvg: 40 },
    { lowAvg: 30, highAvg: null },
  ],
  availability: [
    {
      totalCorrect: 9,
      totalAnswered: 40,
      worst: { short: 'Холод или жара?', pct: 10 },
      questionCount: 4,
    },
    {
      totalCorrect: 34,
      totalAnswered: 40,
      worst: { short: 'Холод или жара?', pct: 70 },
      questionCount: 4,
    },
  ],
  barnum: [{ avg: 4.1 }, { avg: 1.4 }],
  calibration: [
    { hitPct: 40, totalHits: 12, totalAnswered: 30 },
    { hitPct: 88, totalHits: 26, totalAnswered: 30 },
  ],
  crowdWisdom: [
    { pct: 80, worse: 31, total: 39 },
    { pct: 40, worse: 16, total: 39 },
  ],
  dictator: [
    { avgR1: 300, avgR2: 450, delta: 150, pot: 1000 },
    { avgR1: 300, avgR2: 305, delta: 5, pot: 1000 },
  ],
  endowment: [
    { avgWTA: 300, avgWTP: 120, ratio: 2.5 },
    { avgWTA: 105, avgWTP: 100, ratio: 1.05 },
  ],
  falseConsensus: [
    { realYesPct: 60, yesAvg: 75, noAvg: 40 },
    { realYesPct: 60, yesAvg: 55, noAvg: 54 },
  ],
  framing: [
    { aRisky: 20, bRisky: 70 },
    { aRisky: 50, bRisky: 40 },
  ],
  planningFallacy: [
    { avgRatio: 2.1, accurateCount: 1, overrunCount: 9, total: 12 },
    { avgRatio: 1.05, accurateCount: 11, overrunCount: 0, total: 12 },
  ],
  prisonersDilemma: [
    { coopR1: 30, coopR2: 60, delta: 30, echoRate: 70 },
    { coopR1: 60, coopR2: 30, delta: -30, echoRate: 65 },
  ],
  publicGoods: [
    { avgR1: 6, avgR2: 3, delta: -3, stake: 10 },
    { avgR1: 5, avgR2: 8, delta: 3, stake: 10 },
  ],
  ultimatum: [
    { deals: 10, total: 16, avgOffer: 300, avgMin: 200 },
    { deals: 16, total: 16, avgOffer: 400, avgMin: 250 },
  ],
};

describe('REVEAL_COPY', () => {
  test('covers every game that has a headline number', () => {
    expect(Object.keys(REVEAL_COPY).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  for (const [game, [a, b]] of Object.entries(SAMPLES)) {
    describe(game, () => {
      test('explains the number even before there is any data', () => {
        const empty = REVEAL_COPY[game](null);
        expect(empty.what.length).toBeGreaterThan(40);
        expect(empty.read.length).toBeGreaterThan(40);
        expect(empty.verdict).toBeNull();
      });

      test('gives a team-specific verdict that reacts to the numbers', () => {
        const first = REVEAL_COPY[game](a);
        const second = REVEAL_COPY[game](b);
        expect(first.verdict).toBeTruthy();
        expect(second.verdict).toBeTruthy();
        expect(first.verdict).not.toEqual(second.verdict);
        expect(first.verdict).not.toMatch(/NaN|undefined|null/);
        expect(second.verdict).not.toMatch(/NaN|undefined|null/);
      });
    });
  }
});
