/* =========================================================
   RESULTS — every game's "what did the team do" math, as pure functions
   =========================================================
   Each game used to compute this inside its Lit component's
   _showResults(), tangled up with `this` and the DOM. Now the game just
   collects data and calls one of these, which take plain arrays and
   return plain objects with the same field names the results templates
   already read — so they're unit-testable (test/unit/results.test.js)
   and reusable.

   A field of `null` always means "not enough data", never NaN.
========================================================= */
import { mean, median, pearson, percent, sum } from './stats.js';

// ---------- Эффект якоря ----------

export function corrLabel(r) {
  if (r === null) return 'Недостаточно данных для оценки связи — впишите хотя бы пары значений.';
  const abs = Math.abs(r);
  let strength;
  if (abs < 0.1) strength = 'почти нет связи';
  else if (abs < 0.3) strength = 'слабая связь';
  else if (abs < 0.5) strength = 'умеренная связь';
  else if (abs < 0.7) strength = 'заметная связь';
  else strength = 'сильная связь';
  const dir = r >= 0 ? 'положительная' : 'отрицательная';
  return `Коэффициент корреляции между числом из шага 1 и оценкой: r = ${r.toFixed(2)} — ${dir}, ${strength}. Это число никак не связано с ООН — но, скорее всего, связь всё равно есть.`;
}

// data: [{ anchor, guess }] — `anchor` is the 00–99 number from step 1.
export function anchoringResults(data) {
  const filled = data.filter((d) => d.anchor !== null && d.guess !== null);
  const r = pearson(
    filled.map((d) => d.anchor),
    filled.map((d) => d.guess),
  );
  const low = filled.filter((d) => d.anchor < 50);
  const high = filled.filter((d) => d.anchor >= 50);
  const avgN = (arr) => (arr.length ? Math.round(mean(arr.map((d) => d.guess))) : null);
  const label = (n) => (n === null ? '—' : `${n}%`);
  const lowAvgN = avgN(low);
  const highAvgN = avgN(high);
  return {
    filled,
    r,
    corrText: corrLabel(r),
    lowAvg: label(lowAvgN),
    highAvg: label(highAvgN),
    lowAvgN,
    highAvgN,
  };
}

// ---------- per-person rows (results tables) ----------

// A row of yes/no outcomes for one person: `outcomes[i]` is true (hit),
// false (miss) or null (not answered). Returns the cells to show plus the
// person's own hit rate.
export function scoreOutcomes(outcomes) {
  const answered = outcomes.filter((o) => o !== null);
  const hits = answered.filter(Boolean).length;
  return {
    outcomes,
    hits,
    answered: answered.length,
    pct: answered.length ? percent(hits, answered.length) : null,
  };
}

// ---------- Эвристика доступности ----------

export const isCorrectAnswer = (answer, question) => answer === question.correct;

// One row per participant: ✓/✕/— for every question and their own hit rate.
export function availabilityRows(entries, questions) {
  return entries.map((e) => ({
    name: e.name,
    ...scoreOutcomes(
      questions.map((q, qi) => (e.answers[qi] === null ? null : isCorrectAnswer(e.answers[qi], q))),
    ),
  }));
}

// entries: [{ answers: ('a'|'b'|null)[] }], questions: [{ correct, short }]
export function availabilityResults(entries, questions) {
  const correctPerQuestion = questions.map(() => 0);
  let totalCorrect = 0;
  let totalAnswered = 0;
  for (const e of entries) {
    questions.forEach((q, qi) => {
      const ans = e.answers[qi];
      if (ans === null) return;
      totalAnswered++;
      if (isCorrectAnswer(ans, q)) {
        correctPerQuestion[qi]++;
        totalCorrect++;
      }
    });
  }
  const correctRate = totalAnswered ? `${percent(totalCorrect, totalAnswered)}%` : '—';
  const perQuestionStats = questions.map((_, qi) => {
    const answered = entries.filter((e) => e.answers[qi] !== null).length;
    return {
      pct: answered ? percent(correctPerQuestion[qi], answered) : 0,
      answered,
      correct: correctPerQuestion[qi],
    };
  });
  const worst =
    perQuestionStats
      .map((s, qi) => ({ short: questions[qi].short, pct: s.pct }))
      .sort((a, b) => a.pct - b.pct)[0] ?? null;
  return { correctRate, perQuestionStats, totalCorrect, totalAnswered, worst };
}

// ---------- Эффект Барнума ----------

// data: [{ rating: 0..5 | null }]
export function barnumResults(data) {
  const filled = data.filter((d) => d.rating !== null);
  return { filled, avg: mean(filled.map((d) => d.rating)) };
}

// ---------- Калибровка уверенности ----------

// Did the stated range contain the true answer? low/high may have been typed
// in either order; both bounds are inclusive.
export function isRangeHit(range, answer) {
  const lo = Math.min(range.low, range.high);
  const hi = Math.max(range.low, range.high);
  return answer >= lo && answer <= hi;
}

const rangeAnswered = (r) => r.low !== null && r.high !== null;

// One row per participant, like availabilityRows.
export function calibrationRows(entries, questions) {
  return entries.map((e) => ({
    name: e.name,
    ...scoreOutcomes(
      questions.map((q, qi) =>
        rangeAnswered(e.ranges[qi]) ? isRangeHit(e.ranges[qi], q.answer) : null,
      ),
    ),
  }));
}

// For each question: every named range (low/high normalised so low ≤ high) and
// whether it contained the true answer — the data behind the interval chart.
export function calibrationBars(entries, questions) {
  return questions.map((q, qi) => ({
    question: q,
    bars: entries
      .filter((e) => rangeAnswered(e.ranges[qi]))
      .map((e) => ({
        name: e.name,
        low: Math.min(e.ranges[qi].low, e.ranges[qi].high),
        high: Math.max(e.ranges[qi].low, e.ranges[qi].high),
        hit: isRangeHit(e.ranges[qi], q.answer),
      })),
  }));
}

// entries: [{ ranges: [{ low, high }] }], questions: [{ answer }]
export function calibrationResults(entries, questions) {
  const hitsPerQuestion = questions.map(() => 0);
  let totalHits = 0;
  let totalAnswered = 0;
  for (const e of entries) {
    questions.forEach((q, qi) => {
      const r = e.ranges[qi];
      if (!rangeAnswered(r)) return;
      if (isRangeHit(r, q.answer)) {
        hitsPerQuestion[qi]++;
        totalHits++;
      }
      totalAnswered++;
    });
  }
  const hitRate = totalAnswered ? `${percent(totalHits, totalAnswered)}%` : '—';
  const perQuestionStats = questions.map((_, qi) => {
    const answered = entries.filter((e) => rangeAnswered(e.ranges[qi])).length;
    return { pct: answered ? percent(hitsPerQuestion[qi], answered) : 0 };
  });
  return { hitRate, perQuestionStats, totalHits, totalAnswered };
}

// ---------- Мудрость толпы ----------

// data: [{ name, guesses: (number|null)[] }], questions: [{ answer }]
export function crowdWisdomResults(data, questions) {
  const perQuestion = questions.map((q, qi) => {
    const filled = data
      .filter((d) => d.guesses[qi] !== null)
      .map((d) => ({ name: d.name, guess: d.guesses[qi] }));
    const guesses = filled.map((d) => d.guess);
    const avg = mean(guesses);
    const med = median(guesses);
    const avgErr = avg !== null ? Math.abs(avg - q.answer) : null;
    const medErr = med !== null ? Math.abs(med - q.answer) : null;
    const worseThanAvg =
      avg !== null ? filled.filter((d) => Math.abs(d.guess - q.answer) > avgErr).length : 0;
    return { question: q, filled, avg, med, avgErr, medErr, worseThanAvg };
  });
  // Pool every individual guess across all questions into one bigger-N
  // verdict instead of several small-sample readouts.
  const totalAnswered = sum(perQuestion.map((pq) => pq.filled.length));
  const totalWorseThanAvg = sum(perQuestion.map((pq) => pq.worseThanAvg));
  return {
    perQuestion,
    totalAnswered,
    totalWorseThanAvg,
    hitRate: percent(totalWorseThanAvg, totalAnswered),
  };
}

// ---------- Игра диктатора ----------

// data: [{ r1, r2 }] — amounts given in the anonymous / identified round.
export function dictatorResults(data) {
  const filled = data.filter((d) => d.r1 !== null && d.r2 !== null);
  const avgR1 = mean(filled.map((d) => d.r1));
  const avgR2 = mean(filled.map((d) => d.r2));
  return { filled, avgR1, avgR2, delta: avgR1 === null ? null : avgR2 - avgR1 };
}

// ---------- Эффект владения ----------

// entries: [{ role: 'owner' | 'buyer', prices: (number|null)[] }] — one price per
// lot. Owners state the least they would SELL for (WTA), buyers the most they
// would PAY (WTP); the same people keep the same role for every lot.
const pricesOf = (entries, role, lot) =>
  entries.filter((e) => e.role === role && e.prices[lot] !== null).map((e) => e.prices[lot]);

// How many owners / buyers have named a price for one lot.
export function endowmentLotCounts(entries, lot) {
  return {
    sellers: pricesOf(entries, 'owner', lot).length,
    buyers: pricesOf(entries, 'buyer', lot).length,
  };
}

// A lot can be compared only once BOTH sides have priced it.
export function endowmentReady(entries, lotCount) {
  for (let lot = 0; lot < lotCount; lot++) {
    const { sellers, buyers } = endowmentLotCounts(entries, lot);
    if (sellers < 1 || buyers < 1) return false;
  }
  return lotCount > 0;
}

export function endowmentLotStats(entries, lot) {
  const sell = pricesOf(entries, 'owner', lot);
  const buy = pricesOf(entries, 'buyer', lot);
  const avgWTA = mean(sell);
  const avgWTP = mean(buy);
  return {
    sellers: sell.length,
    buyers: buy.length,
    avgWTA,
    avgWTP,
    ratio: avgWTA !== null && avgWTP !== null && avgWTP > 0 ? avgWTA / avgWTP : null,
  };
}

export function endowmentResults(entries, lotCount = entries[0]?.prices.length ?? 0) {
  const perLot = Array.from({ length: lotCount }, (_, lot) => endowmentLotStats(entries, lot));
  const ratios = perLot.map((l) => l.ratio).filter((r) => r !== null);
  const meanRatio = mean(ratios);
  return {
    // people who priced at least one lot
    filled: entries.filter((e) => e.prices.some((p) => p !== null)),
    perLot,
    // The headline: the average of the per-lot ratios, so a cheap mug and an
    // expensive house count equally rather than the house drowning out the mug.
    ratioN: meanRatio,
    ratio: meanRatio === null ? null : meanRatio.toFixed(1),
  };
}

// ---------- Ложный консенсус ----------

// data: [{ own: 'yes'|'no'|null, estimate: 0..100|null }]
export function falseConsensusResults(data) {
  const filled = data.filter((d) => d.own !== null && d.estimate !== null);
  const yesSide = filled.filter((d) => d.own === 'yes');
  const noSide = filled.filter((d) => d.own === 'no');
  const realYesPct = percent(yesSide.length, filled.length);
  const avg = (arr) => (arr.length ? Math.round(mean(arr.map((d) => d.estimate))) : null);
  const yesAvg = avg(yesSide);
  const noAvg = avg(noSide);

  let compareText = `Реально ответили «да» ${realYesPct}% команды.`;
  if (yesAvg !== null && noAvg !== null) {
    compareText += ` Те, кто сам сказал «да», в среднем ожидали ${yesAvg}% согласных — те, кто сказал «нет», ожидали только ${noAvg}%. Каждая группа тянет прогноз в свою сторону.`;
  }
  return { filled, realYesPct, yesAvg, noAvg, compareText };
}

// ---------- Эффект фрейминга ----------

// The wording each group hears in each scenario. Round 1: group A gets the
// GAIN frame ("saved / fixed"), group B the LOSS frame ("die / left"); round 2
// they swap. Every person therefore hears both wordings, once each.
export function framingFrame(group, round) {
  return (group === 'A') === (round % 2 === 0) ? 'gain' : 'loss';
}

// entries: [{ name, group: 'A'|'B', choices: ('1'|'2'|null)[] }] — '2' is the
// risky gamble, '1' the sure thing (mathematically the same in expectation).
// Per scenario: how many percent gambled under each wording, and whether the
// loss wording pushed people toward the gamble (the effect).
export function framingResults(entries, roundCount = entries[0]?.choices.length ?? 0) {
  const perRound = Array.from({ length: roundCount }, (_, round) => {
    const points = entries
      .filter((e) => e.choices[round] !== null)
      .map((e) => ({
        name: e.name,
        group: e.group,
        frame: framingFrame(e.group, round),
        choice: e.choices[round],
      }));
    const riskyPct = (frame) => {
      const inFrame = points.filter((p) => p.frame === frame);
      return percent(inFrame.filter((p) => p.choice === '2').length, inFrame.length);
    };
    const gainRisky = riskyPct('gain');
    const lossRisky = riskyPct('loss');
    const comparable = gainRisky !== null && lossRisky !== null;
    return {
      points,
      gainRisky,
      lossRisky,
      diff: comparable ? lossRisky - gainRisky : null,
      flipped: comparable ? lossRisky > gainRisky : null,
    };
  });

  // Pool both scenarios (every person contributes one answer per wording).
  const all = perRound.flatMap((r) => r.points);
  const pooledRisky = (frame) => {
    const inFrame = all.filter((p) => p.frame === frame);
    return percent(inFrame.filter((p) => p.choice === '2').length, inFrame.length);
  };
  const gainRisky = pooledRisky('gain');
  const lossRisky = pooledRisky('loss');

  const decided = perRound.filter((r) => r.flipped !== null).length;
  const flippedRounds = perRound.filter((r) => r.flipped === true).length;
  let flipText = '—';
  if (decided > 0) {
    if (flippedRounds === 0) flipText = 'В этот раз без переворота';
    else if (decided === 1) flipText = 'Формулировка сработала';
    else flipText = `Сработала в ${flippedRounds} из ${decided}`;
  }
  return {
    perRound,
    filled: entries.filter((e) => e.choices.some((c) => c !== null)),
    gainRisky,
    lossRisky,
    diff: gainRisky !== null && lossRisky !== null ? lossRisky - gainRisky : null,
    decided,
    flippedRounds,
    flipText,
  };
}

// Results are meaningful once, in every scenario, BOTH wordings were answered
// by at least one person (otherwise there's nothing to compare).
export function framingReady(entries, roundCount) {
  for (let round = 0; round < roundCount; round++) {
    const answered = entries.filter((e) => e.choices[round] !== null);
    const frames = new Set(answered.map((e) => framingFrame(e.group, round)));
    if (!(frames.has('gain') && frames.has('loss'))) return false;
  }
  return roundCount > 0;
}

// ---------- Ошибка планирования ----------

// A planning row is usable once both numbers are in and the "best case" is
// positive — otherwise there is no ratio to compute (and dividing by zero
// would poison the average).
export const isUsablePlanningRow = (d) => d.best !== null && d.actual !== null && d.best > 0;

// Actual time as a multiple of the "best case" the person named.
export const planningRatio = (d) => d.actual / d.best;

// data: [{ best, actual }] — days/hours.
export function planningFallacyResults(data) {
  const filled = data.filter(isUsablePlanningRow);
  const ratios = filled.map(planningRatio);
  return {
    filled,
    avgRatio: mean(ratios),
    accurateCount: ratios.filter((r) => r < 1.3).length,
    overrunCount: ratios.filter((r) => r > 1.5).length,
  };
}

// ---------- Дилемма заключённого ----------

// Points for [player A, player B] from their moves: both cooperate 3/3,
// both defect 1/1, the defector takes 5 and the cooperator gets 0.
export function prisonersDilemmaPayoff(choiceA, choiceB) {
  if (choiceA === 'C' && choiceB === 'C') return [3, 3];
  if (choiceA === 'D' && choiceB === 'D') return [1, 1];
  if (choiceA === 'D' && choiceB === 'C') return [5, 0];
  return [0, 5];
}

export const choiceLabel = (c) => (c === 'C' ? 'Сотрудничал' : 'Предал');

// Two table rows per pair (one per round): who played what and what each got.
export function prisonersDilemmaRoundRows(filled) {
  return filled.flatMap((e) =>
    [1, 2].map((round) => {
      const choiceA = e[`r${round}a`];
      const choiceB = e[`r${round}b`];
      const [pointsA, pointsB] = prisonersDilemmaPayoff(choiceA, choiceB);
      return { round, a: e.a, b: e.b, choiceA, choiceB, pointsA, pointsB };
    }),
  );
}

// entries: [{ r1a, r1b, r2a, r2b }] with 'C' (cooperate) / 'D' (defect).
export function prisonersDilemmaResults(entries) {
  const filled = entries.filter(
    (e) => e.r1a !== null && e.r1b !== null && e.r2a !== null && e.r2b !== null,
  );
  const coopPct = (choices) => percent(choices.filter((c) => c === 'C').length, choices.length);
  const coopR1 = coopPct(filled.flatMap((e) => [e.r1a, e.r1b]));
  const coopR2 = coopPct(filled.flatMap((e) => [e.r2a, e.r2b]));

  // "Tit for tat": how often round-2's move repeated what the partner did
  // in round 1.
  let echoes = 0;
  let totalResponses = 0;
  for (const e of filled) {
    if (e.r2a === e.r1b) echoes++;
    totalResponses++;
    if (e.r2b === e.r1a) echoes++;
    totalResponses++;
  }
  const ccCount = filled.filter(
    (e) => (e.r1a === 'C' && e.r1b === 'C') || (e.r2a === 'C' && e.r2b === 'C'),
  ).length;

  return {
    filled,
    coopR1,
    coopR2,
    delta: coopR1 === null ? null : coopR2 - coopR1,
    echoRate: percent(echoes, totalResponses),
    ccCount,
  };
}

// ---------- Общественное благо ----------

// Per-round summary: average contribution and the team's total payoff
// (each keeps `stake` minus their contribution, plus a share of the
// doubled pot).
export function publicGoodsRoundStats(filled, field, stake) {
  const n = filled.length;
  const sumContrib = sum(filled.map((d) => d[field]));
  const pot = sumContrib * 2;
  return { avg: sumContrib / n, totalPayoff: Math.round(n * stake - sumContrib + pot) };
}

// What a finished round looked like, as a reminder for the next one: how much each
// person put in on average (and the spread), the pot after doubling, and what
// that pays EVERY player on top of what they kept — plus what a full contributor
// and a free rider each ended up with. `field` is 'r1' or 'r2'.
export function publicGoodsSummary(data, field, stake) {
  const values = data.map((d) => d[field]).filter((v) => v !== null);
  const n = values.length;
  if (!n) return null;
  const total = sum(values);
  const pot = total * 2;
  const share = pot / n; // every player gets an equal share, contributors or not
  return {
    n,
    avg: total / n,
    min: Math.min(...values),
    max: Math.max(...values),
    total,
    pot,
    share,
    // ending balance for someone who put in `c`: what they kept + the equal share
    fullContributorGets: share, // put in everything → keeps 0
    freeRiderGets: stake + share, // put in nothing → keeps all
    freeRiders: values.filter((v) => v === 0).length,
    fullContributors: values.filter((v) => v === stake).length,
  };
}

// data: [{ r1, r2 }] contributions in round 1 / round 2.
export function publicGoodsResults(data, stake) {
  const filled = data.filter((d) => d.r1 !== null && d.r2 !== null);
  const s1 = publicGoodsRoundStats(filled, 'r1', stake);
  const s2 = publicGoodsRoundStats(filled, 'r2', stake);
  return { filled, s1, s2, delta: s2.avg - s1.avg };
}

// ---------- Ультиматум ----------

// A deal happens when the offer meets the responder's minimum (inclusive).
export const isDeal = (instance) => instance.offer >= instance.min;

// entries: [{ a, b, r1_offer, r1_min, r2_offer, r2_min }] — in round 1 `a`
// proposes to `b`; in round 2 they swap.
export function ultimatumResults(entries) {
  const instances = [];
  for (const e of entries) {
    if (e.r1_offer !== null && e.r1_min !== null) {
      instances.push({ round: 1, proposer: e.a, responder: e.b, offer: e.r1_offer, min: e.r1_min });
    }
    if (e.r2_offer !== null && e.r2_min !== null) {
      instances.push({ round: 2, proposer: e.b, responder: e.a, offer: e.r2_offer, min: e.r2_min });
    }
  }
  const deals = instances.filter(isDeal).length;
  return {
    instances,
    deals,
    dealRate: instances.length ? `${percent(deals, instances.length)}%` : '—',
    avgOffer: mean(instances.map((x) => x.offer)),
    avgMin: mean(instances.map((x) => x.min)),
  };
}
