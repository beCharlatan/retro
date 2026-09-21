// Property tests for src/logic/results.js and src/reveal-copy.js:
// whatever the team typed (or left blank), the numbers on the results
// screen are finite and in range, and the words never contain NaN.
import { describe, expect, test } from 'bun:test';
import {
  anchoringResults,
  availabilityResults,
  availabilityRows,
  barnumResults,
  calibrationResults,
  calibrationRows,
  crowdWisdomResults,
  dictatorResults,
  endowmentResults,
  falseConsensusResults,
  framingResults,
  isRangeHit,
  planningFallacyResults,
  prisonersDilemmaResults,
  prisonersDilemmaRoundRows,
  publicGoodsResults,
  publicGoodsSummary,
  scoreOutcomes,
  ultimatumResults,
} from '../../../src/logic/results.js';
import { REVEAL_COPY } from '../../../src/reveal-copy.js';
import { fc, hasBadNumber, int, nullable, RUNS } from './helpers.js';

const rowsOf = (arb) => fc.array(arb, { maxLength: 16 });
const inRange = (v, lo, hi) => v === null || (v >= lo && v <= hi);

describe('no results function ever produces NaN or Infinity', () => {
  const cases = [
    [
      'anchoring',
      rowsOf(fc.record({ anchor: nullable(int(0, 99)), guess: nullable(int(0, 100)) })),
      (d) => anchoringResults(d),
    ],
    ['barnum', rowsOf(fc.record({ rating: nullable(int(0, 5)) })), (d) => barnumResults(d)],
    [
      'dictator',
      rowsOf(fc.record({ r1: nullable(int(0, 1000)), r2: nullable(int(0, 1000)) })),
      (d) => dictatorResults(d),
    ],
    [
      'falseConsensus',
      rowsOf(
        fc.record({ own: nullable(fc.constantFrom('yes', 'no')), estimate: nullable(int(0, 100)) }),
      ),
      (d) => falseConsensusResults(d),
    ],
    [
      'framing',
      rowsOf(
        fc.record({
          name: fc.string(),
          group: fc.constantFrom('A', 'B'),
          choices: fc.array(nullable(fc.constantFrom('1', '2')), { minLength: 2, maxLength: 2 }),
        }),
      ),
      (d) => framingResults(d, 2),
    ],
    [
      'planning',
      rowsOf(fc.record({ best: nullable(int(0, 100)), actual: nullable(int(0, 300)) })),
      (d) => planningFallacyResults(d),
    ],
    [
      'ultimatum',
      rowsOf(
        fc.record({
          a: fc.string(),
          b: fc.string(),
          r1_offer: nullable(int(0, 1000)),
          r1_min: nullable(int(0, 1000)),
          r2_offer: nullable(int(0, 1000)),
          r2_min: nullable(int(0, 1000)),
        }),
      ),
      (d) => ultimatumResults(d),
    ],
    [
      'prisoners',
      rowsOf(
        fc.record({
          a: fc.string(),
          b: fc.string(),
          r1a: nullable(fc.constantFrom('C', 'D')),
          r1b: nullable(fc.constantFrom('C', 'D')),
          r2a: nullable(fc.constantFrom('C', 'D')),
          r2b: nullable(fc.constantFrom('C', 'D')),
        }),
      ),
      (d) => prisonersDilemmaResults(d),
    ],
    [
      'endowment',
      rowsOf(
        fc.record({
          role: fc.constantFrom('owner', 'buyer'),
          prices: fc.array(nullable(int(0, 12_000_000)), { minLength: 3, maxLength: 3 }),
        }),
      ),
      (d) => endowmentResults(d),
    ],
  ];
  for (const [name, arb, fn] of cases) {
    test(name, () => {
      fc.assert(
        fc.property(arb, (data) => expect(hasBadNumber(fn(data))).toBe(false)),
        RUNS,
      );
    });
  }
  // publicGoods divides by n — only meaningful with at least one complete row, as the UI guarantees.
  test('publicGoods (with ≥1 complete row)', () => {
    const complete = fc.record({ r1: int(0, 10), r2: int(0, 10) });
    fc.assert(
      fc.property(fc.array(complete, { minLength: 1, maxLength: 16 }), (d) =>
        expect(hasBadNumber(publicGoodsResults(d, 10))).toBe(false),
      ),
      RUNS,
    );
  });
});

describe('percentages and counts stay in range', () => {
  test('availability: totalCorrect ≤ totalAnswered, per-question % in 0..100', () => {
    const questions = [
      { correct: 'a', short: 'Q1' },
      { correct: 'b', short: 'Q2' },
      { correct: 'a', short: 'Q3' },
    ];
    const entry = fc.record({
      answers: fc.array(nullable(fc.constantFrom('a', 'b')), { minLength: 3, maxLength: 3 }),
    });
    fc.assert(
      fc.property(rowsOf(entry), (entries) => {
        const r = availabilityResults(entries, questions);
        expect(r.totalCorrect).toBeLessThanOrEqual(r.totalAnswered);
        for (const s of r.perQuestionStats) {
          expect(s.pct).toBeGreaterThanOrEqual(0);
          expect(s.pct).toBeLessThanOrEqual(100);
        }
        // the per-person rows agree with the overall total
        const rows = availabilityRows(entries, questions);
        expect(rows.reduce((a, row) => a + row.hits, 0)).toBe(r.totalCorrect);
      }),
      RUNS,
    );
  });

  test('calibration: hits ≤ answered; the per-person rows add up to the totals; range order is irrelevant', () => {
    const range = fc.record({ low: nullable(int(0, 100)), high: nullable(int(0, 100)) });
    const entry = fc.record({ ranges: fc.array(range, { minLength: 2, maxLength: 2 }) });
    const questions = [{ answer: 30 }, { answer: 70 }];
    fc.assert(
      fc.property(rowsOf(entry), (entries) => {
        const r = calibrationResults(entries, questions);
        expect(r.totalHits).toBeLessThanOrEqual(r.totalAnswered);
        const rows = calibrationRows(entries, questions);
        expect(rows.reduce((a, row) => a + row.hits, 0)).toBe(r.totalHits);
        expect(rows.reduce((a, row) => a + row.answered, 0)).toBe(r.totalAnswered);
      }),
      RUNS,
    );
    fc.assert(
      fc.property(int(0, 100), int(0, 100), int(0, 100), (a, b, x) =>
        expect(isRangeHit({ low: a, high: b }, x)).toBe(isRangeHit({ low: b, high: a }, x)),
      ),
      RUNS,
    );
  });

  test('crowd wisdom: worse-than-average ≤ answered, hit rate 0..100 or null', () => {
    const entry = fc.record({
      name: fc.string(),
      guesses: fc.array(nullable(int(0, 1000)), { minLength: 2, maxLength: 2 }),
    });
    fc.assert(
      fc.property(rowsOf(entry), (data) => {
        const r = crowdWisdomResults(data, [{ answer: 100 }, { answer: 500 }]);
        expect(r.totalWorseThanAvg).toBeLessThanOrEqual(r.totalAnswered);
        expect(inRange(r.hitRate, 0, 100)).toBe(true);
        for (const pq of r.perQuestion)
          expect(pq.worseThanAvg).toBeLessThanOrEqual(pq.filled.length);
      }),
      RUNS,
    );
  });

  test('anchoring / false consensus / framing / prisoner’s dilemma shares are 0..100', () => {
    fc.assert(
      fc.property(
        rowsOf(
          fc.record({
            own: nullable(fc.constantFrom('yes', 'no')),
            estimate: nullable(int(0, 100)),
          }),
        ),
        (d) => {
          const r = falseConsensusResults(d);
          expect(inRange(r.realYesPct, 0, 100)).toBe(true);
          expect(inRange(r.yesAvg, 0, 100)).toBe(true);
          expect(inRange(r.noAvg, 0, 100)).toBe(true);
        },
      ),
      RUNS,
    );
    fc.assert(
      fc.property(
        rowsOf(
          fc.record({
            name: fc.string(),
            group: fc.constantFrom('A', 'B'),
            choices: fc.array(nullable(fc.constantFrom('1', '2')), { minLength: 2, maxLength: 2 }),
          }),
        ),
        (d) => {
          const r = framingResults(d, 2);
          expect(inRange(r.gainRisky, 0, 100)).toBe(true);
          expect(inRange(r.lossRisky, 0, 100)).toBe(true);
          for (const round of r.perRound) {
            expect(inRange(round.gainRisky, 0, 100)).toBe(true);
            expect(inRange(round.lossRisky, 0, 100)).toBe(true);
          }
          expect(r.flippedRounds).toBeLessThanOrEqual(r.decided);
          expect(r.decided).toBeLessThanOrEqual(2);
          // every answered choice appears exactly once in exactly one scenario's points
          const answers = d.reduce((n, row) => n + row.choices.filter((c) => c !== null).length, 0);
          expect(r.perRound.reduce((n, x) => n + x.points.length, 0)).toBe(answers);
        },
      ),
      RUNS,
    );
    const move = nullable(fc.constantFrom('C', 'D'));
    fc.assert(
      fc.property(
        rowsOf(
          fc.record({ a: fc.string(), b: fc.string(), r1a: move, r1b: move, r2a: move, r2b: move }),
        ),
        (d) => {
          const r = prisonersDilemmaResults(d);
          expect(inRange(r.coopR1, 0, 100)).toBe(true);
          expect(inRange(r.coopR2, 0, 100)).toBe(true);
          expect(inRange(r.echoRate, 0, 100)).toBe(true);
          expect(r.ccCount).toBeLessThanOrEqual(r.filled.length);
          expect(prisonersDilemmaRoundRows(r.filled)).toHaveLength(r.filled.length * 2);
        },
      ),
      RUNS,
    );
  });

  test('ultimatum: deals ≤ instances, and the deal rate agrees with them', () => {
    const entry = fc.record({
      a: fc.string(),
      b: fc.string(),
      r1_offer: nullable(int(0, 1000)),
      r1_min: nullable(int(0, 1000)),
      r2_offer: nullable(int(0, 1000)),
      r2_min: nullable(int(0, 1000)),
    });
    fc.assert(
      fc.property(rowsOf(entry), (entries) => {
        const r = ultimatumResults(entries);
        expect(r.deals).toBeLessThanOrEqual(r.instances.length);
        expect(r.dealRate).toBe(
          r.instances.length ? `${Math.round((r.deals / r.instances.length) * 100)}%` : '—',
        );
      }),
      RUNS,
    );
  });

  test('dictator: delta is exactly avgR2 − avgR1 (or null with no data)', () => {
    fc.assert(
      fc.property(
        rowsOf(fc.record({ r1: nullable(int(0, 1000)), r2: nullable(int(0, 1000)) })),
        (d) => {
          const r = dictatorResults(d);
          if (r.avgR1 === null) expect(r.delta).toBeNull();
          else expect(r.delta).toBeCloseTo(r.avgR2 - r.avgR1, 9);
        },
      ),
      RUNS,
    );
  });

  test('scoreOutcomes: hits ≤ answered ≤ outcomes, % in 0..100 or null', () => {
    fc.assert(
      fc.property(fc.array(nullable(fc.boolean()), { maxLength: 12 }), (outs) => {
        const s = scoreOutcomes(outs);
        expect(s.hits).toBeLessThanOrEqual(s.answered);
        expect(s.answered).toBeLessThanOrEqual(outs.length);
        expect(inRange(s.pct, 0, 100)).toBe(true);
        expect(s.pct === null).toBe(s.answered === 0);
      }),
      RUNS,
    );
  });
});

describe('publicGoodsSummary', () => {
  test('invariants: pot is double the total, shares add up to the pot, free rider is exactly one stake ahead', () => {
    const stake = 100;
    fc.assert(
      fc.property(fc.array(nullable(int(0, stake)), { minLength: 1, maxLength: 20 }), (vals) => {
        const s = publicGoodsSummary(
          vals.map((v) => ({ r1: v, r2: null })),
          'r1',
          stake,
        );
        if (s === null) return expect(vals.every((v) => v === null)).toBe(true);
        expect(s.pot).toBe(2 * s.total);
        expect(s.share * s.n).toBeCloseTo(s.pot, 6);
        expect(s.freeRiderGets - s.fullContributorGets).toBeCloseTo(stake, 9);
        expect(s.min).toBeLessThanOrEqual(s.avg + 1e-9);
        expect(s.avg).toBeLessThanOrEqual(s.max + 1e-9);
        expect(hasBadNumber(s)).toBe(false);
      }),
      RUNS,
    );
  });
});

describe('the words under the headline number', () => {
  const text = (o) => `${o.what} ${o.read} ${o.verdict ?? ''}`;
  const clean = (o) => {
    expect(text(o)).not.toMatch(/NaN|undefined|null|Infinity/);
    expect(o.what.length).toBeGreaterThan(20);
    expect(o.read.length).toBeGreaterThan(20);
    if (o.verdict !== null) expect(o.verdict.length).toBeGreaterThan(10);
  };

  test('every game’s copy is well-formed for arbitrary plausible team results', () => {
    fc.assert(
      fc.property(
        fc.record({
          pct: int(0, 100),
          n: int(1, 60),
          avg: fc.double({ min: 0, max: 5, noNaN: true }),
          delta: fc.integer({ min: -1000, max: 1000 }),
          ratio: fc.double({ min: 0.5, max: 6, noNaN: true }),
        }),
        ({ pct, n, avg, delta, ratio }) => {
          const worst = { short: 'Q?', pct };
          clean(REVEAL_COPY.anchoring({ lowAvg: pct, highAvg: Math.min(100, pct + (delta % 40)) }));
          clean(
            REVEAL_COPY.availability({
              totalCorrect: Math.min(n, pct),
              totalAnswered: n,
              worst,
              questionCount: 4,
            }),
          );
          clean(REVEAL_COPY.barnum({ avg }));
          clean(
            REVEAL_COPY.calibration({ hitPct: pct, totalHits: Math.min(n, pct), totalAnswered: n }),
          );
          clean(REVEAL_COPY.crowdWisdom({ pct, worse: Math.min(n, pct), total: n }));
          clean(REVEAL_COPY.dictator({ avgR1: 300, avgR2: 300 + delta, delta, pot: 1000 }));
          clean(
            REVEAL_COPY.endowment({
              ratio,
              lots: [
                { name: 'Кружка', ratio },
                { name: 'Автомобиль', ratio: ratio / 2 },
                { name: 'Дом', ratio: null },
              ],
            }),
          );
          clean(
            REVEAL_COPY.falseConsensus({
              realYesPct: pct,
              yesAvg: pct,
              noAvg: Math.max(0, pct - 20),
            }),
          );
          clean(
            REVEAL_COPY.framing({
              gainRisky: pct,
              lossRisky: Math.max(0, 100 - pct),
              rounds: [
                { name: 'Проект', gainRisky: pct, lossRisky: Math.max(0, 100 - pct) },
                { name: 'Релиз', gainRisky: null, lossRisky: pct },
              ],
            }),
          );
          clean(
            REVEAL_COPY.planningFallacy({
              avgRatio: ratio,
              accurateCount: 1,
              overrunCount: 1,
              total: n,
            }),
          );
          clean(
            REVEAL_COPY.prisonersDilemma({
              coopR1: pct,
              coopR2: 100 - pct,
              delta: 100 - 2 * pct,
              echoRate: pct,
            }),
          );
          clean(
            REVEAL_COPY.publicGoods({
              avgR1: 5,
              avgR2: 5 + delta / 100,
              delta: delta / 100,
              stake: 10,
            }),
          );
          clean(
            REVEAL_COPY.ultimatum({
              deals: Math.min(n, pct),
              total: n,
              avgOffer: 300,
              avgMin: 200,
            }),
          );
        },
      ),
      RUNS,
    );
  });

  test('without data every game still explains its number and gives no verdict', () => {
    for (const fn of Object.values(REVEAL_COPY)) {
      const o = fn(null);
      expect(o.what.length).toBeGreaterThan(20);
      expect(o.read.length).toBeGreaterThan(20);
      expect(o.verdict).toBeNull();
    }
  });
});
