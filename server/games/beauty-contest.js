/* =========================================================
   ONLINE DECLARATION: Угадай ⅔ от среднего (beauty-contest)
   Four rounds; each round everyone guesses 0–100. The winner is
   closest to ⅔ of the average. Logic from src/logic/beauty-contest.js.
========================================================= */
import {
  BC_MAX,
  BC_P,
  BC_ROUNDS,
  beautyResults,
  beautyRound,
} from '../../src/logic/beauty-contest.js';
import { intValue } from './validate.js';

const KEYS = Array.from({ length: BC_ROUNDS }, (_, i) => `r${i + 1}`);

export default {
  id: 'beauty-contest',
  name: 'Угадай ⅔ от среднего',
  category: 'cognitive',
  minPlayers: 3,
  rounds: BC_ROUNDS,
  roundTitles: KEYS.map((_, i) => `Раунд ${i + 1} · число`),

  rules: {
    flow: ['Число 0–100', 'Четыре раунда', 'Результаты'],
    items: [
      {
        title: 'Правило',
        text: `Каждый называет число от 0 до ${BC_MAX}. Побеждает тот, чьё число ближе всего к ${BC_P} от СРЕДНЕГО всех чисел.`,
      },
      {
        title: 'Думайте на шаг вперёд',
        text: 'Чтобы выиграть, надо угадать не ответ, а то, что назовут остальные — и что они думают про вас.',
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: KEYS[round],
      kind: 'int',
      label: `Раунд ${round + 1}: ваше число (0–${BC_MAX})`,
      hint: 'побеждает ближайший к ⅔ среднего',
      min: 0,
      max: BC_MAX,
    },
  ],

  empty: () => Object.fromEntries(KEYS.map((k) => [k, null])),

  flatten: (payload) => Object.fromEntries(KEYS.map((k) => [k, payload[k] ?? null])),

  validateRound(raw, round) {
    const v = intValue(raw[KEYS[round]], { min: 0, max: BC_MAX });
    if (v === null) return { ok: false, error: 'Впишите число' };
    return { ok: true, patch: { [KEYS[round]]: v } };
  },

  roundFilled: (payload, round) => payload[KEYS[round]] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => KEYS.every((k) => n.payload[k] != null)),

  recap: (round, named) => {
    const rows = named.map((n) => ({ name: n.name, guesses: KEYS.map((k) => n.payload[k]) }));
    return Array.from({ length: round }, (_, i) => {
      const s = beautyRound(rows, i);
      return s
        ? `Раунд ${i + 1}: среднее ${s.mean}, цель ⅔ — ${s.target}, победил${s.winners.length > 1 ? 'и' : ''} ${s.winners.map((w) => w.name).join(', ')} (${s.winners[0].guess}).`
        : `Раунд ${i + 1}: —`;
    });
  },

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: KEYS.map((k, i) => ({
        label: `Р${i + 1}`,
        value: payload[k] == null ? '—' : String(payload[k]),
      })),
      payload,
    }));
  },

  compute(named) {
    const rows = named.map((n) => ({ name: n.name, guesses: KEYS.map((k) => n.payload[k]) }));
    const r = beautyResults(rows);
    if (!r) return { firstTarget: null, meanByRound: [] };
    return {
      firstTarget: r.rounds[0]?.target ?? null,
      targetByRound: r.targetByRound,
      meanByRound: r.meanByRound,
      levelsR1: r.levelsR1,
      filled: rows.length,
    };
  },

  headline: (r) => (r.firstTarget === null ? '—' : String(r.firstTarget)),
  detail: (r) => {
    const levels = r.levelsR1;
    if (!levels) return 'Цель ⅔ среднего в первом раунде.';
    return `Цель первого раунда (⅔ среднего): ${r.firstTarget}. Распределение ходов: уровень 0 — ${levels.l0}, уровень 1 — ${levels.l1}, глубже — ${levels.l2 + levels.l3plus}, ноль — ${levels.zero}.`;
  },
  timerSeconds: () => 30,
};
