/* =========================================================
   ONLINE DECLARATION: Ошибка планирования (planning-fallacy)
========================================================= */
import { planningFallacyResults } from '../../src/logic/results.js';
import { intValue, num, times } from './validate.js';

export default {
  id: 'planning-fallacy',
  name: 'Ошибка планирования',
  category: 'cognitive',
  minPlayers: 2,

  rules: {
    flow: ['Задача', 'Первое число', 'Второе число', 'Результаты'],
    items: [
      {
        title: 'Вспомните задачу',
        text: 'Рутинную рабочую задачу, которую вы сами оцениваете примерно в один день.',
      },
      { title: 'Лучший случай', text: 'Сколько часов она занимает, если всё идёт по плану?' },
      {
        title: 'По факту',
        text: 'Сколько она занимает в среднем на самом деле, если вспомнить последние похожие задачи?',
      },
    ],
  },

  fields: [
    {
      key: 'best',
      kind: 'int',
      label: 'Лучший случай, часов',
      hint: 'если всё идёт по плану',
      min: 1,
      max: 1000,
    },
    {
      key: 'actual',
      kind: 'int',
      label: 'По факту в среднем, часов',
      hint: 'по памяти о похожих задачах',
      min: 0,
      max: 1000,
    },
  ],

  empty: () => ({ best: null, actual: null }),

  flatten: (payload) => ({ best: payload.best ?? null, actual: payload.actual ?? null }),

  validate(raw) {
    const answers = {
      best: intValue(raw.best, { min: 1, max: 1000 }),
      actual: intValue(raw.actual, { min: 0, max: 1000 }),
    };
    if (answers.best === null && answers.actual === null) {
      return { ok: false, error: 'Заполните хотя бы одно поле' };
    }
    return { ok: true, answers };
  },

  entries(answersList) {
    return answersList.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [
        { label: 'Лучший случай', value: num(payload.best) },
        { label: 'По факту', value: num(payload.actual) },
      ],
      payload,
    }));
  },

  compute(answersList) {
    const data = answersList.map(({ payload }) => ({ best: payload.best, actual: payload.actual }));
    const r = planningFallacyResults(data);
    return {
      avgRatio: r.avgRatio,
      accurateCount: r.accurateCount,
      overrunCount: r.overrunCount,
      filled: r.filled.length,
    };
  },

  headline: (r) => times(r.avgRatio),
  detail: (r) =>
    r.avgRatio === null
      ? 'Недостаточно данных — нужны оба числа хотя бы у двоих.'
      : `Фактическое время в среднем в ${r.avgRatio.toFixed(1)} раза больше «лучшего случая». Сильно недооценили (${'>'}×1,5): ${r.overrunCount} из ${r.filled}.`,
};
