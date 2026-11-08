/* =========================================================
   ONLINE DECLARATION: Эффект якоря (anchoring)
   Constants duplicated from src/games/anchoring.js — see
   server/games/index.js for why.
========================================================= */
import { anchoringResults } from '../../src/logic/results.js';
import { intValue, num } from './validate.js';

export default {
  id: 'anchoring',
  name: 'Эффект якоря',
  category: 'cognitive',
  minPlayers: 2,

  rules: {
    flow: ['Своё число', 'Вопрос', 'Ваша оценка', 'Результаты'],
    items: [
      {
        title: 'Сначала — число',
        text: 'Запишите последние две цифры своего номера телефона. Никому не показывайте.',
      },
      {
        title: 'Потом — вопрос',
        text: 'Доля стран Африки среди членов ООН — больше или меньше вашего числа? Ответьте про себя.',
      },
      { title: 'Точная оценка', text: 'Назовите ответ одним числом — в процентах.' },
    ],
  },

  fields: [
    {
      key: 'anchor',
      kind: 'int',
      label: 'Последние две цифры вашего номера телефона',
      hint: 'число от 0 до 99',
      min: 0,
      max: 99,
    },
    {
      key: 'guess',
      kind: 'int',
      label: 'Ваша точная оценка: доля стран Африки среди членов ООН, %',
      hint: 'число от 0 до 100',
      min: 0,
      max: 100,
    },
  ],

  empty: () => ({ anchor: null, guess: null }),

  flatten: (payload) => ({ anchor: payload.anchor ?? null, guess: payload.guess ?? null }),

  validate(raw) {
    const answers = {
      anchor: intValue(raw.anchor, { min: 0, max: 99 }),
      guess: intValue(raw.guess, { min: 0, max: 100 }),
    };
    if (answers.anchor === null && answers.guess === null) {
      return { ok: false, error: 'Заполните хотя бы одно поле' };
    }
    return { ok: true, answers };
  },

  entries(answersList) {
    return answersList.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [
        { label: 'Якорь', value: num(payload.anchor) },
        { label: 'Оценка', value: num(payload.guess) },
      ],
      payload,
    }));
  },

  compute(answersList) {
    const data = answersList.map(({ payload }) => ({
      anchor: payload.anchor,
      guess: payload.guess,
    }));
    const r = anchoringResults(data);
    return {
      r: r.r,
      corrText: r.corrText,
      lowAvg: r.lowAvg,
      highAvg: r.highAvg,
      filled: r.filled.length,
    };
  },

  headline: (r) => (r.r === null ? '—' : `r = ${r.r.toFixed(2)}`),
  detail: (r) =>
    `Средняя оценка при якоре ниже 50: ${r.lowAvg}; при якоре 50 и выше: ${r.highAvg}.`,
};
