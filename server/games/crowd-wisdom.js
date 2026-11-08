/* =========================================================
   ONLINE DECLARATION: Мудрость толпы (crowd-wisdom)
   Questions duplicated from src/games/crowd-wisdom.js.
========================================================= */
import { crowdWisdomResults } from '../../src/logic/results.js';
import { intValue, num } from './validate.js';

const QUESTIONS = [
  { q: 'Сколько тонн весит Международная космическая станция?', answer: 420, unit: ' т' },
  { q: 'Сколько костей в скелете взрослого человека?', answer: 206, unit: '' },
  { q: 'Какова длина экватора Земли, в километрах?', answer: 40075, unit: ' км' },
];

export default {
  id: 'crowd-wisdom',
  name: 'Мудрость толпы',
  category: 'cognitive',
  minPlayers: 2,

  rules: {
    flow: ['Три вопроса', 'Оценки', 'Результаты'],
    items: [
      {
        title: 'Три вопроса',
        text: 'На каждый — своя числовая оценка. Отвечайте по очереди, не обсуждая.',
      },
      {
        title: 'Один ответ на вопрос',
        text: 'Целое число — тонны, кости, километры. Точность важнее красоты.',
      },
    ],
  },

  fields: QUESTIONS.map((question, i) => ({
    key: `q${i}`,
    kind: 'int',
    label: question.q,
    hint: 'целое число',
    min: 0,
    max: 1000000,
  })),

  empty: () => ({ guesses: QUESTIONS.map(() => null) }),

  flatten: (payload) =>
    Object.fromEntries(QUESTIONS.map((_, i) => [`q${i}`, payload.guesses?.[i] ?? null])),

  // Accept either { q0, q1, q2 } (flat form fields) or { guesses: [...] }.
  validate(raw) {
    const flat =
      raw.guesses && Array.isArray(raw.guesses)
        ? raw.guesses
        : QUESTIONS.map((_, i) => raw[`q${i}`]);
    const guesses = QUESTIONS.map((_, i) => intValue(flat[i], { min: 0, max: 1000000 }));
    if (guesses.every((g) => g === null)) {
      return { ok: false, error: 'Заполните хотя бы один вопрос' };
    }
    return { ok: true, answers: { guesses } };
  },

  entries(answersList) {
    return answersList.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: QUESTIONS.map((_, i) => ({
        label: `В${i + 1}`,
        value: num(payload.guesses[i]),
      })),
      payload,
    }));
  },

  compute(answersList) {
    const data = answersList.map(({ payload }) => ({ name: '', guesses: payload.guesses }));
    const r = crowdWisdomResults(data, QUESTIONS);
    return {
      hitRate: r.hitRate,
      totalAnswered: r.totalAnswered,
      perQuestion: r.perQuestion.map((pq) => ({
        answer: pq.question.answer,
        unit: pq.question.unit,
        avg: pq.avg === null ? null : Math.round(pq.avg),
        med: pq.med === null ? null : Math.round(pq.med),
        worseThanAvg: pq.worseThanAvg,
        answered: pq.filled.length,
      })),
    };
  },

  headline: (r) => (r.hitRate === null ? '—' : `${r.hitRate}%`),
  detail: () =>
    'Доля оценок, которые оказались хуже среднего по команде: средняя обыграла большинство поодиночке.',
};
