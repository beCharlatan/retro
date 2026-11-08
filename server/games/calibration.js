/* =========================================================
   ONLINE DECLARATION: Калибровка уверенности (calibration)
   Four questions, each answered with a RANGE (low/high) that must
   contain the true answer. Constants duplicated from
   src/games/calibration.js.
========================================================= */
import { calibrationResults } from '../../src/logic/results.js';
import { intValue } from './validate.js';

const QUESTIONS = [
  { q: 'Какова температура плавления вольфрама, в градусах Цельсия?', answer: 3422, unit: ' °C' },
  {
    q: 'В каком году состоялась битва при Манцикерте, в которой сельджуки разгромили армию Византии?',
    answer: 1071,
    unit: '',
  },
  {
    q: 'Сколько хромосом в диплоидном наборе клеток домашней собаки?',
    answer: 78,
    unit: ' хромосом',
  },
  {
    q: 'На какой высоте над уровнем моря находится озеро Титикака, в метрах?',
    answer: 3812,
    unit: ' м',
  },
];

export default {
  id: 'calibration',
  name: 'Калибровка уверенности',
  category: 'cognitive',
  minPlayers: 2,

  rules: {
    flow: ['Четыре вопроса', 'Диапазон вместо числа', 'Результаты'],
    items: [
      {
        title: 'Не число, а диапазон',
        text: 'На каждый вопрос назовите ДВА числа: минимум и максимум, между которыми точно лежит ответ.',
      },
      {
        title: 'Без шуток',
        text: 'Диапазон должен накрыть правильный ответ. Узкий — хвалит уверенность, широкий — спасает от ошибки.',
      },
    ],
  },

  fields: QUESTIONS.flatMap((question, i) => [
    {
      key: `q${i}_low`,
      kind: 'int',
      label: `${question.q} — от`,
      hint: 'нижняя граница',
      min: -1_000_000,
      max: 10_000_000,
    },
    {
      key: `q${i}_high`,
      kind: 'int',
      label: `${question.q} — до`,
      hint: 'верхняя граница',
      min: -1_000_000,
      max: 10_000_000,
    },
  ]),

  empty: () => ({ ranges: QUESTIONS.map(() => ({ low: null, high: null })) }),

  flatten: (payload) =>
    Object.fromEntries(
      QUESTIONS.flatMap((_, i) => [
        [`q${i}_low`, payload.ranges?.[i]?.low ?? null],
        [`q${i}_high`, payload.ranges?.[i]?.high ?? null],
      ]),
    ),

  validate(raw) {
    const ranges = QUESTIONS.map((_, i) => ({
      low: intValue(raw[`q${i}_low`], { min: -1_000_000, max: 10_000_000 }),
      high: intValue(raw[`q${i}_high`], { min: -1_000_000, max: 10_000_000 }),
    }));
    if (ranges.every((r) => r.low === null && r.high === null)) {
      return { ok: false, error: 'Заполните хотя бы один диапазон' };
    }
    return { ok: true, answers: { ranges } };
  },

  complete: (named) =>
    named.length >= 2 &&
    named.every(({ payload }) => payload.ranges?.every((r) => r.low !== null && r.high !== null)),

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: QUESTIONS.map((_, i) => ({
        label: `В${i + 1}`,
        value:
          payload.ranges?.[i]?.low == null || payload.ranges?.[i]?.high == null
            ? '—'
            : `${payload.ranges[i].low}–${payload.ranges[i].high}`,
      })),
      payload,
    }));
  },

  compute(named) {
    const entries = named.map(({ payload }) => ({ ranges: payload.ranges }));
    const r = calibrationResults(entries, QUESTIONS);
    return { hitRate: r.hitRate, totalHits: r.totalHits, totalAnswered: r.totalAnswered };
  },

  headline: (r) => r.hitRate,
  detail: (r) =>
    'Доля диапазонов, в которые попал верный ответ. Люди редко накрывают ими 9 из 10 — уверенность обычно завышена.',
  timerSeconds: () => 20,
};
