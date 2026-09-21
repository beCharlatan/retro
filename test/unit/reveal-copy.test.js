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
    {
      ratio: 2.5,
      lots: [
        { name: 'Кружка', ratio: 3 },
        { name: 'Автомобиль', ratio: 2.5 },
        { name: 'Дом', ratio: 2 },
      ],
    },
    {
      ratio: 1.05,
      lots: [
        { name: 'Кружка', ratio: 1 },
        { name: 'Автомобиль', ratio: 1.1 },
        { name: 'Дом', ratio: 1.05 },
      ],
    },
  ],
  falseConsensus: [
    { realYesPct: 60, yesAvg: 75, noAvg: 40 },
    { realYesPct: 60, yesAvg: 55, noAvg: 54 },
  ],
  framing: [
    {
      gainRisky: 25,
      lossRisky: 75,
      rounds: [
        { name: 'Проект', gainRisky: 20, lossRisky: 70 },
        { name: 'Релиз', gainRisky: 30, lossRisky: 80 },
      ],
    },
    {
      gainRisky: 50,
      lossRisky: 40,
      rounds: [
        { name: 'Проект', gainRisky: 50, lossRisky: 40 },
        { name: 'Релиз', gainRisky: 50, lossRisky: 40 },
      ],
    },
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

describe('endowment copy across lots', () => {
  const lots = (a, b, c) => [
    { name: 'Кружка', ratio: a },
    { name: 'Автомобиль', ratio: b },
    { name: 'Дом', ratio: c },
  ];
  test('names every lot with its own ratio', () => {
    const { verdict } = REVEAL_COPY.endowment({ ratio: 1.7, lots: lots(2, 1.7, 1.4) });
    expect(verdict).toContain('Кружка 2.0×');
    expect(verdict).toContain('Автомобиль 1.7×');
    expect(verdict).toContain('Дом 1.4×');
  });
  test('says when the gap fades as the stakes rise', () => {
    expect(REVEAL_COPY.endowment({ ratio: 1.8, lots: lots(2.6, 1.8, 1.1) }).verdict).toContain(
      'тем слабее',
    );
  });
  test('says when the gap grows as the stakes rise', () => {
    expect(REVEAL_COPY.endowment({ ratio: 1.5, lots: lots(1.1, 1.5, 2.1) }).verdict).toContain(
      'тем сильнее',
    );
  });
  test('stays quiet about a trend when the ratios are flat', () => {
    const v = REVEAL_COPY.endowment({ ratio: 1.7, lots: lots(1.7, 1.75, 1.65) }).verdict;
    expect(v).not.toContain('тем слабее');
    expect(v).not.toContain('тем сильнее');
  });
  test('skips lots that could not be compared', () => {
    const v = REVEAL_COPY.endowment({ ratio: 2, lots: lots(2, null, null) }).verdict;
    expect(v).toContain('Кружка 2.0×');
    expect(v).not.toContain('Автомобиль');
  });
});

describe('framing copy across scenarios', () => {
  const r = (project, release) => ({
    gainRisky: 30,
    lossRisky: 60,
    rounds: [
      { name: 'Проект', gainRisky: project[0], lossRisky: project[1] },
      { name: 'Релиз', gainRisky: release[0], lossRisky: release[1] },
    ],
  });
  test('reports each scenario, gain → loss', () => {
    const v = REVEAL_COPY.framing(r([20, 70], [30, 80])).verdict;
    expect(v).toContain('Проект: 20% → 70%');
    expect(v).toContain('Релиз: 30% → 80%');
  });
  test('calls out the work example when the effect shows there too', () => {
    expect(REVEAL_COPY.framing(r([20, 70], [30, 80])).verdict).toContain(
      'На рабочем примере («Релиз») эффект тоже виден',
    );
  });
  test('says so when professional context seems to protect against it', () => {
    expect(REVEAL_COPY.framing(r([20, 70], [50, 40])).verdict).toContain('не сдвинула решения');
  });
  test('stays quiet about the work example when the shift there is small but positive', () => {
    const v = REVEAL_COPY.framing(r([20, 70], [40, 45])).verdict;
    expect(v).not.toContain('На рабочем примере');
  });
  test('no data on one side → no verdict', () => {
    expect(REVEAL_COPY.framing({ gainRisky: null, lossRisky: 50, rounds: [] }).verdict).toBeNull();
  });
});
