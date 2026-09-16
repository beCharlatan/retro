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
  calibrationResults,
  calibrationRows,
  choiceLabel,
  corrLabel,
  crowdWisdomResults,
  dictatorResults,
  endowmentResults,
  falseConsensusResults,
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
    expect(r.perQuestionStats).toEqual([{ pct: 67 }, { pct: 50 }]);
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
  // Person 1 owned first (asked 300), bought second (offered 100);
  // person 2 bought first (offered 200), owned second (asked 400).
  const entries = [
    { r1Role: 'owner', r2Role: 'buyer', r1Price: 300, r2Price: 100 },
    { r1Role: 'buyer', r2Role: 'owner', r1Price: 200, r2Price: 400 },
  ];
  test('picks each person’s sell price from their owner round and buy price from their buyer round', () => {
    const r = endowmentResults(entries);
    expect(r.avgWTA).toBe(350);
    expect(r.avgWTP).toBe(150);
    expect(r.ratio).toBe('2.3');
  });
  test('ratio is null when nobody would pay anything', () => {
    const r = endowmentResults([{ r1Role: 'owner', r2Role: 'buyer', r1Price: 100, r2Price: 0 }]);
    expect(r.ratio).toBeNull();
  });
  test('no complete rows → null everything', () => {
    const r = endowmentResults([{ r1Role: 'owner', r2Role: 'buyer', r1Price: 1, r2Price: null }]);
    expect(r.avgWTA).toBeNull();
    expect(r.ratio).toBeNull();
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
  const e = (group, choice) => ({ group, choice });
  test('flip: group B (loss frame) takes the risky option more often', () => {
    const r = framingResults([
      e('A', '1'),
      e('A', '1'),
      e('A', '2'),
      e('B', '2'),
      e('B', '2'),
      e('B', '1'),
    ]);
    expect(r.aRisky).toBe(33);
    expect(r.bRisky).toBe(67);
    expect(r.flipText).toBe('Формулировка сработала');
  });
  test('no flip when B is not riskier', () => {
    const r = framingResults([e('A', '2'), e('B', '1')]);
    expect(r.flipText).toBe('В этот раз без переворота');
  });
  test('an empty group leaves the verdict undecided', () => {
    const r = framingResults([e('A', '2')]);
    expect(r.bRisky).toBeNull();
    expect(r.flipText).toBe('—');
  });
  test('ignores people who have not chosen', () => {
    expect(framingResults([e('A', null), e('B', '2')]).filled).toHaveLength(1);
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
