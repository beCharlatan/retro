// test/unit/results.test.js
// Each game's results math (src/logic/results.js), on small hand-checkable
// datasets. The point: the numbers a team sees on the results screen
// are right, and "no data" comes back as null/"—", never NaN.
import { describe, expect, test } from 'bun:test';
import {
  anchoringResults,
  availabilityResults,
  availabilityRows,
  barnumResults,
  calibrationBars,
  calibrationResults,
  calibrationRows,
  choiceLabel,
  corrLabel,
  crowdWisdomResults,
  dictatorResults,
  endowmentLotCounts,
  endowmentReady,
  endowmentResults,
  falseConsensusResults,
  framingFrame,
  framingReady,
  framingResults,
  isCorrectAnswer,
  isDeal,
  isRangeHit,
  planningFallacyResults,
  planningRatio,
  prisonersDilemmaPayoff,
  prisonersDilemmaResults,
  prisonersDilemmaRoundRows,
  publicGoodsResults,
  publicGoodsRoundStats,
  publicGoodsSummary,
  scoreOutcomes,
  ultimatumResults,
} from '../../src/logic/results.js';

describe('anchoring', () => {
  const data = [
    { anchor: 10, guess: 20 },
    { anchor: 30, guess: 30 },
    { anchor: 70, guess: 50 },
    { anchor: 90, guess: 60 },
    { anchor: null, guess: 40 }, // incomplete → ignored
    { anchor: 20, guess: null },
  ];
  test('ignores incomplete rows and splits low/high anchors at 50', () => {
    const r = anchoringResults(data);
    expect(r.filled).toHaveLength(4);
    expect(r.lowAvgN).toBe(25);
    expect(r.highAvgN).toBe(55);
    expect(r.lowAvg).toBe('25%');
    expect(r.highAvg).toBe('55%');
  });
  test('reports a strong positive correlation for anchor-following guesses', () => {
    const r = anchoringResults(data);
    expect(r.r).toBeGreaterThan(0.9);
    expect(r.corrText).toContain('положительная');
    expect(r.corrText).toContain('сильная связь');
  });
  test('an empty side becomes null / "—"', () => {
    const r = anchoringResults([
      { anchor: 5, guess: 10 },
      { anchor: 6, guess: 12 },
    ]);
    expect(r.highAvgN).toBeNull();
    expect(r.highAvg).toBe('—');
  });
  test('corrLabel grades strength and direction', () => {
    expect(corrLabel(null)).toContain('Недостаточно данных');
    expect(corrLabel(0.05)).toContain('почти нет связи');
    expect(corrLabel(0.2)).toContain('слабая связь');
    expect(corrLabel(0.4)).toContain('умеренная связь');
    expect(corrLabel(0.6)).toContain('заметная связь');
    expect(corrLabel(-0.8)).toContain('отрицательная');
  });
});

describe('availability', () => {
  const questions = [
    { correct: 'a', short: 'Q1' },
    { correct: 'b', short: 'Q2' },
  ];
  const entries = [
    { answers: ['a', 'b'] }, // both right
    { answers: ['a', 'a'] }, // 1 right
    { answers: ['b', null] }, // 0 right, one skipped
  ];
  test('counts correct answers overall and per question', () => {
    const r = availabilityResults(entries, questions);
    expect(r.totalAnswered).toBe(5);
    expect(r.totalCorrect).toBe(3);
    expect(r.correctRate).toBe('60%');
    expect(r.perQuestionStats).toEqual([
      { pct: 67, answered: 3, correct: 2 },
      { pct: 50, answered: 2, correct: 1 },
    ]);
  });
  test('finds the hardest question', () => {
    expect(availabilityResults(entries, questions).worst).toEqual({ short: 'Q2', pct: 50 });
  });
  test('no answers at all → "—"', () => {
    const r = availabilityResults([{ answers: [null, null] }], questions);
    expect(r.correctRate).toBe('—');
    expect(r.totalAnswered).toBe(0);
  });
});

describe('barnum', () => {
  test('averages the ratings that exist', () => {
    const r = barnumResults([{ rating: 4 }, { rating: 2 }, { rating: null }]);
    expect(r.filled).toHaveLength(2);
    expect(r.avg).toBe(3);
  });
  test('null average with no ratings', () => {
    expect(barnumResults([{ rating: null }]).avg).toBeNull();
  });
});

describe('calibration', () => {
  const questions = [{ answer: 100 }, { answer: 50 }];
  test('counts hits inside the stated range, whichever way round low/high are typed', () => {
    const entries = [
      {
        ranges: [
          { low: 90, high: 110 },
          { low: 60, high: 70 },
        ],
      }, // hit, miss
      {
        ranges: [
          { low: 110, high: 90 },
          { low: 40, high: 60 },
        ],
      }, // swapped hit, hit
      {
        ranges: [
          { low: null, high: 5 },
          { low: 1, high: 2 },
        ],
      }, // skipped, miss
    ];
    const r = calibrationResults(entries, questions);
    expect(r.totalAnswered).toBe(5);
    expect(r.totalHits).toBe(3);
    expect(r.hitRate).toBe('60%');
    expect(r.perQuestionStats).toEqual([{ pct: 100 }, { pct: 33 }]);
  });
  test('the range bounds are inclusive', () => {
    const r = calibrationResults([{ ranges: [{ low: 100, high: 100 }] }], [{ answer: 100 }]);
    expect(r.totalHits).toBe(1);
  });
  test('no ranges at all → "—"', () => {
    expect(
      calibrationResults([{ ranges: [{ low: null, high: null }] }], [{ answer: 1 }]).hitRate,
    ).toBe('—');
  });
});

describe('crowdWisdom', () => {
  const questions = [{ answer: 100 }];
  test('the team average beats everyone who is further from the truth than it is', () => {
    const data = [
      { name: 'A', guesses: [80] },
      { name: 'B', guesses: [100] },
      { name: 'C', guesses: [120] },
      { name: 'D', guesses: [200] },
    ];
    const r = crowdWisdomResults(data, questions);
    const pq = r.perQuestion[0];
    expect(pq.avg).toBe(125);
    expect(pq.avgErr).toBe(25);
    expect(pq.med).toBe(110);
    expect(pq.medErr).toBe(10);
    // errors: A 20, B 0, C 20, D 100 → only D is worse than the 25 average error
    expect(pq.worseThanAvg).toBe(1);
    expect(r.totalAnswered).toBe(4);
    expect(r.totalWorseThanAvg).toBe(1);
    expect(r.hitRate).toBe(25);
  });
  test('pools several questions into one verdict', () => {
    const data = [
      { name: 'A', guesses: [90, 10] },
      { name: 'B', guesses: [110, 30] },
    ];
    const r = crowdWisdomResults(data, [{ answer: 100 }, { answer: 20 }]);
    expect(r.totalAnswered).toBe(4);
    expect(r.perQuestion).toHaveLength(2);
  });
  test('skipped guesses are excluded per question', () => {
    const r = crowdWisdomResults(
      [
        { name: 'A', guesses: [100, null] },
        { name: 'B', guesses: [110, 5] },
      ],
      [{ answer: 100 }, { answer: 5 }],
    );
    expect(r.perQuestion[0].filled).toHaveLength(2);
    expect(r.perQuestion[1].filled).toHaveLength(1);
    expect(r.totalAnswered).toBe(3);
  });
  test('no data → null average and null hit rate', () => {
    const r = crowdWisdomResults([{ name: 'A', guesses: [null] }], questions);
    expect(r.perQuestion[0].avg).toBeNull();
    expect(r.hitRate).toBeNull();
  });
});

describe('dictator', () => {
  test('average given in each round and the change between them', () => {
    const r = dictatorResults([
      { r1: 100, r2: 300 },
      { r1: 300, r2: 500 },
      { r1: null, r2: 900 }, // incomplete → ignored
    ]);
    expect(r.filled).toHaveLength(2);
    expect(r.avgR1).toBe(200);
    expect(r.avgR2).toBe(400);
    expect(r.delta).toBe(200);
  });
  test('no complete rows → null averages and null delta', () => {
    const r = dictatorResults([{ r1: 1, r2: null }]);
    expect(r.avgR1).toBeNull();
    expect(r.delta).toBeNull();
  });
});

describe('endowment', () => {
  // Owners ask, buyers offer — one price per lot (mug, car, house).
  const row = (role, ...prices) => ({ name: role, role, prices });
  const entries = [
    row('owner', 800, 1_600_000, 12_000_000),
    row('owner', 600, 1_400_000, 10_000_000),
    row('buyer', 400, 1_000_000, 9_000_000),
    row('buyer', 500, 1_100_000, 9_000_000),
  ];

  test('per lot: average asking price, average offer, and their ratio', () => {
    const r = endowmentResults(entries, 3);
    expect(r.perLot).toHaveLength(3);
    expect(r.perLot[0]).toMatchObject({ sellers: 2, buyers: 2, avgWTA: 700, avgWTP: 450 });
    expect(r.perLot[0].ratio).toBeCloseTo(700 / 450, 9);
    expect(r.perLot[2].ratio).toBeCloseTo(11_000_000 / 9_000_000, 9);
  });
  test('the headline is the average of the per-lot ratios, so a house does not drown out a mug', () => {
    const r = endowmentResults(entries, 3);
    const expected = (700 / 450 + 1_500_000 / 1_050_000 + 11_000_000 / 9_000_000) / 3;
    expect(r.ratioN).toBeCloseTo(expected, 9);
    expect(r.ratio).toBe(expected.toFixed(1));
  });
  test('roles stay fixed: an owner’s price is only ever an asking price, a buyer’s only an offer', () => {
    const r = endowmentResults([row('owner', 1000), row('buyer', 100)], 1);
    expect(r.perLot[0].avgWTA).toBe(1000);
    expect(r.perLot[0].avgWTP).toBe(100);
  });
  test('people who priced nothing are left out of `filled`; partial rows stay in', () => {
    const r = endowmentResults(
      [row('owner', 1, null, null), row('buyer', null, null, null), row('buyer', 5, 6, 7)],
      3,
    );
    expect(r.filled).toHaveLength(2);
  });
  test('a lot nobody on one side priced has a null ratio, others still count', () => {
    const r = endowmentResults([row('owner', 10, null), row('buyer', 5, 7)], 2);
    expect(r.perLot[0].ratio).toBe(2);
    expect(r.perLot[1].ratio).toBeNull();
    expect(r.ratioN).toBe(2);
  });
  test('ratio is null when buyers offered nothing but zero (no division by zero)', () => {
    const r = endowmentResults([row('owner', 100), row('buyer', 0)], 1);
    expect(r.perLot[0].ratio).toBeNull();
    expect(r.ratio).toBeNull();
  });
  test('no data → null headline, no NaN', () => {
    const r = endowmentResults([row('owner', null, null, null)], 3);
    expect(r.ratio).toBeNull();
    expect(r.ratioN).toBeNull();
    expect(r.filled).toEqual([]);
  });
  test('the lot count defaults to the number of prices per row', () => {
    expect(endowmentResults(entries).perLot).toHaveLength(3);
    expect(endowmentResults([]).perLot).toEqual([]);
  });
  test('endowmentLotCounts counts each side that priced a lot', () => {
    const e = [row('owner', 1, null), row('owner', null, 2), row('buyer', 3, null)];
    expect(endowmentLotCounts(e, 0)).toEqual({ sellers: 1, buyers: 1 });
    expect(endowmentLotCounts(e, 1)).toEqual({ sellers: 1, buyers: 0 });
  });
  test('endowmentReady needs a seller AND a buyer price for EVERY lot', () => {
    expect(endowmentReady(entries, 3)).toBe(true);
    // lot 2 has only a seller price
    const half = [row('owner', 1, 2), row('buyer', 3, null)];
    expect(endowmentReady(half, 2)).toBe(false);
    // nobody priced anything, or there are no lots
    expect(endowmentReady([row('owner', null), row('buyer', null)], 1)).toBe(false);
    expect(endowmentReady(entries, 0)).toBe(false);
  });
  test('a single seller and a single buyer are enough to compare', () => {
    expect(endowmentReady([row('owner', 5), row('buyer', 4)], 1)).toBe(true);
  });
});

describe('falseConsensus', () => {
  const data = [
    { own: 'yes', estimate: 80 },
    { own: 'yes', estimate: 70 },
    { own: 'no', estimate: 30 },
    { own: 'no', estimate: 50 },
    { own: null, estimate: 10 },
  ];
  test('real share of yes and each side’s average forecast', () => {
    const r = falseConsensusResults(data);
    expect(r.filled).toHaveLength(4);
    expect(r.realYesPct).toBe(50);
    expect(r.yesAvg).toBe(75);
    expect(r.noAvg).toBe(40);
    expect(r.compareText).toContain('«да» 50%');
    expect(r.compareText).toContain('75%');
    expect(r.compareText).toContain('40%');
  });
  test('one-sided answers leave the other average null and skip the comparison', () => {
    const r = falseConsensusResults([
      { own: 'yes', estimate: 60 },
      { own: 'yes', estimate: 70 },
    ]);
    expect(r.noAvg).toBeNull();
    expect(r.realYesPct).toBe(100);
    expect(r.compareText).not.toContain('ожидали только');
  });
});

describe('framing', () => {
  // choices: ['1'|'2'|null, ...] — one per scenario. '2' is the gamble.
  const e = (group, ...choices) => ({ name: `${group}-${choices.join('')}`, group, choices });

  test('the wording alternates: A hears gain then loss, B loss then gain', () => {
    expect([framingFrame('A', 0), framingFrame('A', 1)]).toEqual(['gain', 'loss']);
    expect([framingFrame('B', 0), framingFrame('B', 1)]).toEqual(['loss', 'gain']);
    expect(framingFrame('A', 2)).toBe('gain');
  });

  test('per scenario: % who gambled under the gain wording vs the loss wording', () => {
    // scenario 1: A (gain) 1 of 3 gambled = 33%; B (loss) 2 of 3 = 67%
    const r = framingResults(
      [e('A', '1'), e('A', '1'), e('A', '2'), e('B', '2'), e('B', '2'), e('B', '1')],
      1,
    );
    expect(r.perRound[0]).toMatchObject({ gainRisky: 33, lossRisky: 67, diff: 34, flipped: true });
    expect(r.flipText).toBe('Формулировка сработала');
  });

  test('in scenario 2 the groups swap wordings, so group A is now the loss group', () => {
    // scenario 2: A hears LOSS, B hears GAIN
    const r = framingResults([e('A', '1', '2'), e('B', '1', '1')], 2);
    expect(r.perRound[1]).toMatchObject({ lossRisky: 100, gainRisky: 0, flipped: true });
    expect(r.perRound[1].points.find((p) => p.group === 'A').frame).toBe('loss');
  });

  test('pools both scenarios: every person contributes one answer per wording', () => {
    // A: gain→1(safe), loss→2(gamble); B: loss→2(gamble), gain→1(safe)
    const r = framingResults([e('A', '1', '2'), e('B', '2', '1')], 2);
    expect(r.gainRisky).toBe(0);
    expect(r.lossRisky).toBe(100);
    expect(r.diff).toBe(100);
    expect(r.decided).toBe(2);
    expect(r.flippedRounds).toBe(2);
    expect(r.flipText).toBe('Сработала в 2 из 2');
  });

  test('the effect can show in one scenario and not the other', () => {
    // scenario 1: loss group (B) gambles more → flips. scenario 2: gain group (B) gambles more → does not.
    const r = framingResults([e('A', '1', '1'), e('B', '2', '2')], 2);
    expect(r.perRound[0].flipped).toBe(true);
    expect(r.perRound[1].flipped).toBe(false);
    expect(r.flippedRounds).toBe(1);
    expect(r.flipText).toBe('Сработала в 1 из 2');
  });

  test('no flip anywhere', () => {
    const r = framingResults([e('A', '2', '1'), e('B', '1', '2')], 2);
    expect(r.flippedRounds).toBe(0);
    expect(r.flipText).toBe('В этот раз без переворота');
  });

  test('a scenario where one wording was never answered is undecided, the other still counts', () => {
    const r = framingResults([e('A', '2', null), e('B', '1', null)], 2);
    expect(r.perRound[1].flipped).toBeNull();
    expect(r.perRound[1].gainRisky).toBeNull();
    expect(r.decided).toBe(1);
  });

  test('nothing answered → undecided, no NaN', () => {
    const r = framingResults([e('A', null, null)], 2);
    expect(r.flipText).toBe('—');
    expect(r.gainRisky).toBeNull();
    expect(r.diff).toBeNull();
    expect(r.filled).toEqual([]);
  });

  test('ignores nobody who answered at least one scenario', () => {
    expect(
      framingResults([e('A', null, '2'), e('B', '1', null), e('A', null, null)], 2).filled,
    ).toHaveLength(2);
  });

  test('framingReady needs both wordings answered in EVERY scenario', () => {
    expect(framingReady([e('A', '1', '1'), e('B', '2', '2')], 2)).toBe(true);
    // only group A answered scenario 2 → only the loss wording there
    expect(framingReady([e('A', '1', '1'), e('B', '2', null)], 2)).toBe(false);
    // only one group answered anything
    expect(framingReady([e('A', '1', '1'), e('A', '2', '2')], 2)).toBe(false);
    expect(framingReady([], 2)).toBe(false);
    expect(framingReady([e('A', '1')], 0)).toBe(false);
  });
});

describe('planningFallacy', () => {
  test('ratio of actual to best case, plus how many were accurate / badly over', () => {
    const r = planningFallacyResults([
      { best: 10, actual: 10 }, // 1.0 accurate
      { best: 10, actual: 20 }, // 2.0 overrun
      { best: 10, actual: 14 }, // 1.4 neither
    ]);
    expect(r.avgRatio).toBeCloseTo((1 + 2 + 1.4) / 3, 10);
    expect(r.accurateCount).toBe(1);
    expect(r.overrunCount).toBe(1);
  });
  test('skips rows without a positive best case (would divide by zero)', () => {
    const r = planningFallacyResults([
      { best: 0, actual: 5 },
      { best: null, actual: 5 },
      { best: 4, actual: 8 },
    ]);
    expect(r.filled).toHaveLength(1);
    expect(r.avgRatio).toBe(2);
  });
  test('no usable rows → null average', () => {
    expect(planningFallacyResults([{ best: 0, actual: 3 }]).avgRatio).toBeNull();
  });
});

describe('prisonersDilemma', () => {
  test('cooperation share per round and its change', () => {
    const r = prisonersDilemmaResults([
      { r1a: 'C', r1b: 'D', r2a: 'C', r2b: 'C' },
      { r1a: 'D', r1b: 'D', r2a: 'C', r2b: 'D' },
    ]);
    expect(r.coopR1).toBe(25);
    expect(r.coopR2).toBe(75);
    expect(r.delta).toBe(50);
  });
  test('echo rate: how often round 2 repeated the partner’s round-1 move', () => {
    // pair 1: a's r2 (C) vs b's r1 (D) → no; b's r2 (C) vs a's r1 (C) → yes
    // pair 2: a's r2 (C) vs b's r1 (D) → no; b's r2 (D) vs a's r1 (D) → yes
    const r = prisonersDilemmaResults([
      { r1a: 'C', r1b: 'D', r2a: 'C', r2b: 'C' },
      { r1a: 'D', r1b: 'D', r2a: 'C', r2b: 'D' },
    ]);
    expect(r.echoRate).toBe(50);
  });
  test('counts pairs that mutually cooperated in either round', () => {
    const r = prisonersDilemmaResults([
      { r1a: 'C', r1b: 'C', r2a: 'D', r2b: 'D' },
      { r1a: 'D', r1b: 'D', r2a: 'C', r2b: 'C' },
      { r1a: 'C', r1b: 'D', r2a: 'D', r2b: 'C' },
    ]);
    expect(r.ccCount).toBe(2);
  });
  test('pairs missing any move are ignored; nothing left → null shares', () => {
    const r = prisonersDilemmaResults([{ r1a: 'C', r1b: null, r2a: 'C', r2b: 'C' }]);
    expect(r.filled).toHaveLength(0);
    expect(r.coopR1).toBeNull();
    expect(r.delta).toBeNull();
    expect(r.echoRate).toBeNull();
  });
});

describe('publicGoods', () => {
  test('average contribution and total payoff with a doubled pot', () => {
    // 3 players, stake 10, contributions 10/5/0 → 15 in, pot 30
    // total payoff = 3·10 − 15 + 30 = 45
    const s = publicGoodsRoundStats([{ r: 10 }, { r: 5 }, { r: 0 }], 'r', 10);
    expect(s.avg).toBe(5);
    expect(s.totalPayoff).toBe(45);
  });
  test('the change in average contribution between rounds', () => {
    const r = publicGoodsResults(
      [
        { r1: 8, r2: 4 },
        { r1: 6, r2: 2 },
        { r1: null, r2: 10 }, // incomplete → ignored
      ],
      10,
    );
    expect(r.filled).toHaveLength(2);
    expect(r.s1.avg).toBe(7);
    expect(r.s2.avg).toBe(3);
    expect(r.delta).toBe(-4);
  });
});

describe('ultimatum', () => {
  const entries = [
    // round 1: a offers 300, b needs 200 → deal; round 2: b offers 100, a needs 250 → rejected
    { a: 'A', b: 'B', r1_offer: 300, r1_min: 200, r2_offer: 100, r2_min: 250 },
    // only round 1 played: offer 500 ≥ min 500 → deal (boundary)
    { a: 'C', b: 'D', r1_offer: 500, r1_min: 500, r2_offer: null, r2_min: null },
  ];
  test('one instance per played proposal, with proposer and responder swapped in round 2', () => {
    const r = ultimatumResults(entries);
    expect(r.instances).toHaveLength(3);
    expect(r.instances[1]).toMatchObject({ round: 2, proposer: 'B', responder: 'A' });
  });
  test('deal rate, average offer and average minimum', () => {
    const r = ultimatumResults(entries);
    expect(r.deals).toBe(2);
    expect(r.dealRate).toBe('67%');
    expect(r.avgOffer).toBe(300);
    expect(r.avgMin).toBeCloseTo(950 / 3, 10);
  });
  test('nothing played → "—" and null averages', () => {
    const r = ultimatumResults([
      { a: 'A', b: 'B', r1_offer: null, r1_min: null, r2_offer: null, r2_min: null },
    ]);
    expect(r.dealRate).toBe('—');
    expect(r.avgOffer).toBeNull();
  });
});

describe('scoreOutcomes', () => {
  test('counts hits among answered outcomes and ignores nulls', () => {
    expect(scoreOutcomes([true, false, null, true])).toEqual({
      outcomes: [true, false, null, true],
      hits: 2,
      answered: 3,
      pct: 67,
    });
  });
  test('nobody answered → null percentage, not NaN', () => {
    expect(scoreOutcomes([null, null]).pct).toBeNull();
    expect(scoreOutcomes([]).pct).toBeNull();
  });
  test('all misses is a real 0%', () => {
    expect(scoreOutcomes([false, false]).pct).toBe(0);
  });
});

describe('availabilityRows', () => {
  const questions = [
    { correct: 'a', short: 'Q1' },
    { correct: 'b', short: 'Q2' },
  ];
  test('one row per participant with ✓/✕/skipped outcomes and their own rate', () => {
    const rows = availabilityRows(
      [
        { name: 'A', answers: ['a', 'b'] },
        { name: 'B', answers: ['b', null] },
      ],
      questions,
    );
    expect(rows[0]).toMatchObject({ name: 'A', outcomes: [true, true], pct: 100 });
    expect(rows[1]).toMatchObject({ name: 'B', outcomes: [false, null], pct: 0, answered: 1 });
  });
  test('isCorrectAnswer compares against the question’s correct option', () => {
    expect(isCorrectAnswer('a', questions[0])).toBe(true);
    expect(isCorrectAnswer('a', questions[1])).toBe(false);
  });
});

describe('calibration rows and range rule', () => {
  test('isRangeHit is inclusive and order-insensitive', () => {
    expect(isRangeHit({ low: 90, high: 110 }, 100)).toBe(true);
    expect(isRangeHit({ low: 110, high: 90 }, 100)).toBe(true);
    expect(isRangeHit({ low: 100, high: 100 }, 100)).toBe(true);
    expect(isRangeHit({ low: 101, high: 110 }, 100)).toBe(false);
  });
  test('calibrationRows scores each person against each answer; unanswered ranges are null', () => {
    const rows = calibrationRows(
      [
        {
          name: 'A',
          ranges: [
            { low: 1, high: 9 },
            { low: null, high: 5 },
            { low: 50, high: 60 },
          ],
        },
      ],
      [{ answer: 5 }, { answer: 5 }, { answer: 5 }],
    );
    expect(rows[0].outcomes).toEqual([true, null, false]);
    expect(rows[0].pct).toBe(50);
  });
});

describe('planningRatio', () => {
  test('actual as a multiple of the best case', () => {
    expect(planningRatio({ best: 4, actual: 10 })).toBe(2.5);
    expect(planningRatio({ best: 5, actual: 5 })).toBe(1);
  });
});

describe('prisoner’s dilemma rules and rows', () => {
  test('payoff matrix', () => {
    expect(prisonersDilemmaPayoff('C', 'C')).toEqual([3, 3]);
    expect(prisonersDilemmaPayoff('D', 'D')).toEqual([1, 1]);
    expect(prisonersDilemmaPayoff('D', 'C')).toEqual([5, 0]);
    expect(prisonersDilemmaPayoff('C', 'D')).toEqual([0, 5]);
  });
  test('the temptation payoff beats mutual cooperation, which beats mutual defection (it IS a dilemma)', () => {
    const [temptation] = prisonersDilemmaPayoff('D', 'C');
    const [reward] = prisonersDilemmaPayoff('C', 'C');
    const [punishment] = prisonersDilemmaPayoff('D', 'D');
    const [, sucker] = prisonersDilemmaPayoff('D', 'C');
    expect(temptation).toBeGreaterThan(reward);
    expect(reward).toBeGreaterThan(punishment);
    expect(punishment).toBeGreaterThan(sucker);
  });
  test('choiceLabel', () => {
    expect(choiceLabel('C')).toBe('Сотрудничал');
    expect(choiceLabel('D')).toBe('Предал');
  });
  test('two rows per pair, in round order, with the points each player got', () => {
    const rows = prisonersDilemmaRoundRows([
      { a: 'A', b: 'B', r1a: 'C', r1b: 'D', r2a: 'D', r2b: 'D' },
      { a: 'C', b: 'D', r1a: 'C', r1b: 'C', r2a: 'C', r2b: 'C' },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.round)).toEqual([1, 2, 1, 2]);
    expect(rows[0]).toEqual({
      round: 1,
      a: 'A',
      b: 'B',
      choiceA: 'C',
      choiceB: 'D',
      pointsA: 0,
      pointsB: 5,
    });
    expect(rows[1]).toMatchObject({ pointsA: 1, pointsB: 1 });
    expect(rows[2]).toMatchObject({ a: 'C', pointsA: 3, pointsB: 3 });
  });
});

describe('ultimatum deal rule', () => {
  test('a deal needs offer ≥ minimum, boundary included', () => {
    expect(isDeal({ offer: 200, min: 200 })).toBe(true);
    expect(isDeal({ offer: 199, min: 200 })).toBe(false);
    expect(isDeal({ offer: 500, min: 100 })).toBe(true);
  });
});

describe('publicGoodsSummary (the round-1 recap shown in round 2)', () => {
  const rows = (...r1) => r1.map((v) => ({ r1: v, r2: null }));
  test('average, spread, pot after doubling and each player’s equal share', () => {
    // 4 players put in 100, 50, 0, 0 → total 150, pot 300, share 75 each
    const s = publicGoodsSummary(rows(100, 50, 0, 0), 'r1', 100);
    expect(s).toMatchObject({ n: 4, avg: 37.5, min: 0, max: 100, total: 150, pot: 300, share: 75 });
  });
  test('what a full contributor and a free rider each end up with', () => {
    const s = publicGoodsSummary(rows(100, 50, 0, 0), 'r1', 100);
    expect(s.fullContributorGets).toBe(75); // kept nothing, gets the share
    expect(s.freeRiderGets).toBe(175); // kept 100 + the share
    expect(s.freeRiderGets - s.fullContributorGets).toBeCloseTo(100, 9); // the free rider is always exactly the stake ahead
  });
  test('counts free riders and full contributors', () => {
    const s = publicGoodsSummary(rows(100, 100, 0, 30), 'r1', 100);
    expect(s.freeRiders).toBe(1);
    expect(s.fullContributors).toBe(2);
  });
  test('people who have not answered yet are ignored', () => {
    const s = publicGoodsSummary(
      [
        { r1: 40, r2: null },
        { r1: null, r2: null },
        { r1: 60, r2: null },
      ],
      'r1',
      100,
    );
    expect(s.n).toBe(2);
    expect(s.avg).toBe(50);
  });
  test('nothing entered → no recap', () => {
    expect(publicGoodsSummary(rows(null, null), 'r1', 100)).toBeNull();
    expect(publicGoodsSummary([], 'r1', 100)).toBeNull();
  });
  test('works for round 2 too', () => {
    const s = publicGoodsSummary(
      [
        { r1: 10, r2: 20 },
        { r1: 10, r2: 40 },
      ],
      'r2',
      100,
    );
    expect(s.avg).toBe(30);
  });
  test('the pot is exactly double the total, and the shares add up to it', () => {
    const s = publicGoodsSummary(rows(10, 20, 30), 'r1', 100);
    expect(s.pot).toBe(2 * s.total);
    expect(s.share * s.n).toBeCloseTo(s.pot, 9);
  });
});

describe('calibrationBars (data for the interval chart)', () => {
  const questions = [{ answer: 100 }, { answer: 50 }];
  const entries = [
    {
      name: 'A',
      ranges: [
        { low: 90, high: 110 },
        { low: 60, high: 70 },
      ],
    },
    {
      name: 'B',
      ranges: [
        { low: 120, high: 80 },
        { low: null, high: 5 },
      ],
    }, // typed backwards / skipped
  ];
  test('one entry per question, holding every answered range', () => {
    const r = calibrationBars(entries, questions);
    expect(r).toHaveLength(2);
    expect(r[0].bars.map((b) => b.name)).toEqual(['A', 'B']);
    expect(r[1].bars.map((b) => b.name)).toEqual(['A']); // B skipped question 2
  });
  test('ranges typed backwards are normalised so low ≤ high', () => {
    expect(calibrationBars(entries, questions)[0].bars[1]).toMatchObject({ low: 80, high: 120 });
  });
  test('each bar knows whether it contained the true answer', () => {
    const r = calibrationBars(entries, questions);
    expect(r[0].bars.map((b) => b.hit)).toEqual([true, true]);
    expect(r[1].bars[0].hit).toBe(false);
  });
  test('the hit count agrees with calibrationResults', () => {
    const bars = calibrationBars(entries, questions);
    const hits = bars.flatMap((q) => q.bars).filter((b) => b.hit).length;
    expect(hits).toBe(calibrationResults(entries, questions).totalHits);
  });
});
