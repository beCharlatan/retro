/* =========================================================
   ONLINE DECLARATION: Эвристика доступности (availability)
   Questions duplicated from src/games/availability.js.
========================================================= */
import { availabilityResults } from '../../src/logic/results.js';
import { choiceValue } from './validate.js';

const QUESTIONS = [
  {
    text: 'В мае 2023 года ВОЗ объявила, что COVID-19 больше не чрезвычайная ситуация мирового масштаба. Что унесло больше жизней в мире за 2023 год: COVID-19 или туберкулёз?',
    short: 'COVID-19 или туберкулёз?',
    optA: 'COVID-19',
    optB: 'Туберкулёз',
    correct: 'b',
  },
  {
    text: '2023 и 2024 годы подряд бьют рекорды по жаре, новости полны «смертельной жарой». Что, по оценкам учёных, уносит больше жизней в мире за год: холод или жара?',
    short: 'Холод или жара?',
    optA: 'Холод',
    optB: 'Жара',
    correct: 'a',
  },
  {
    text: 'Каждое лето новости полны историями об утонувших туристах — на курортах Турции, Египта, Таиланда. Что уносит больше жизней в мире за год: утопления или падения (с высоты, с лестниц, в быту)?',
    short: 'Утопления или падения?',
    optA: 'Утопления',
    optB: 'Падения',
    correct: 'b',
  },
  {
    text: 'США, 2022 год. Массовые стрельбы и ДТП — постоянные новости. Что унесло больше жизней в стране: огнестрельное оружие (включая самоубийства) или автомобильные аварии?',
    short: 'Оружие или автоаварии?',
    optA: 'Огнестрельное оружие',
    optB: 'Автоаварии',
    correct: 'a',
  },
];

export default {
  id: 'availability',
  name: 'Эвристика доступности',
  category: 'cognitive',
  minPlayers: 2,

  rules: {
    flow: ['Четыре вопроса', 'Выбор', 'Результаты'],
    items: [
      {
        title: 'Что чаще убивает?',
        text: 'Четыре пары причин смерти. Выберите в каждой паре ту, что уносит больше жизней за год.',
      },
      { title: 'Без обсуждения', text: 'Отвечайте про себя, потом ведущий покажет статистику.' },
    ],
  },

  fields: QUESTIONS.map((question, i) => ({
    key: `a${i}`,
    kind: 'choice',
    label: question.text,
    short: question.short,
    options: [
      { value: 'a', label: question.optA },
      { value: 'b', label: question.optB },
    ],
  })),

  empty: () => ({ answers: QUESTIONS.map(() => null) }),

  flatten: (payload) =>
    Object.fromEntries(QUESTIONS.map((_, i) => [`a${i}`, payload.answers?.[i] ?? null])),

  validate(raw) {
    const flat =
      raw.answers && Array.isArray(raw.answers)
        ? raw.answers
        : QUESTIONS.map((_, i) => raw[`a${i}`]);
    const answers = QUESTIONS.map((_, i) => choiceValue(flat[i], [{ value: 'a' }, { value: 'b' }]));
    if (answers.every((a) => a === null)) {
      return { ok: false, error: 'Ответьте хотя бы на один вопрос' };
    }
    return { ok: true, answers: { answers } };
  },

  entries(answersList) {
    return answersList.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: QUESTIONS.map((q, i) => ({
        label: `В${i + 1}`,
        value: payload.answers[i] === null ? '—' : payload.answers[i] === q.correct ? '✓' : '✕',
      })),
      payload,
    }));
  },

  compute(answersList) {
    const entries = answersList.map(({ payload }) => ({ answers: payload.answers }));
    const r = availabilityResults(entries, QUESTIONS);
    return {
      correctRate: r.correctRate,
      totalAnswered: r.totalAnswered,
      totalCorrect: r.totalCorrect,
      perQuestion: r.perQuestionStats.map((s) => ({ pct: s.pct, answered: s.answered })),
    };
  },

  headline: (r) => r.correctRate,
  detail: () =>
    'Доля верных ответов по всем вопросам и всем участникам. Новости учат оценивать риск не по статистике.',
};
