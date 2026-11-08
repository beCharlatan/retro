/* =========================================================
   ONLINE DECLARATION: Ложный консенсус (false-consensus)
========================================================= */
import { falseConsensusResults } from '../../src/logic/results.js';
import { choiceValue, intValue } from './validate.js';

const QUESTION =
  'Готовы ли вы прямо сейчас, без подготовки, провести 5-минутную презентацию перед всей командой?';

export default {
  id: 'false-consensus',
  name: 'Ложный консенсус',
  category: 'social',
  minPlayers: 3,

  rules: {
    flow: ['Ваш ответ', 'Ваша оценка других', 'Результаты'],
    items: [
      { title: 'Ваш ответ', text: `${QUESTION} Ответьте честно — да или нет.` },
      {
        title: 'Оценка других',
        text: 'Как вы думаете, какой процент ВАШЕЙ КОМАНДЫ ответит «да»? Впишите число от 0 до 100.',
      },
    ],
  },

  fields: [
    {
      key: 'own',
      kind: 'choice',
      label: QUESTION,
      options: [
        { value: 'yes', label: 'Да' },
        { value: 'no', label: 'Нет' },
      ],
    },
    {
      key: 'estimate',
      kind: 'int',
      label: 'Какой процент команды ответит «да»?',
      hint: 'число от 0 до 100',
      min: 0,
      max: 100,
    },
  ],

  empty: () => ({ own: null, estimate: null }),

  flatten: (payload) => ({ own: payload.own ?? null, estimate: payload.estimate ?? null }),

  validate(raw) {
    const own = choiceValue(raw.own, [{ value: 'yes' }, { value: 'no' }]);
    const estimate = intValue(raw.estimate, { min: 0, max: 100 });
    if (own === null && estimate === null)
      return { ok: false, error: 'Ответьте хотя бы на один вопрос' };
    return { ok: true, answers: { own, estimate } };
  },

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [
        {
          label: 'Ответ',
          value: payload.own === null ? '—' : payload.own === 'yes' ? 'Да' : 'Нет',
        },
        {
          label: 'Ожидание «да», %',
          value: payload.estimate === null ? '—' : String(payload.estimate),
        },
      ],
      payload,
    }));
  },

  compute(named) {
    const r = falseConsensusResults(
      named.map(({ payload }) => ({ own: payload.own, estimate: payload.estimate })),
    );
    return { realYesPct: r.realYesPct, yesAvg: r.yesAvg, noAvg: r.noAvg, filled: r.filled.length };
  },

  headline: (r) => `${r.realYesPct}%`,
  detail: (r) =>
    `Реально ответили «да» ${r.realYesPct}%.` +
    (r.yesAvg !== null && r.noAvg !== null
      ? ` Сторонники «да» ждали ${r.yesAvg}% согласных, противники — всего ${r.noAvg}%.`
      : ''),
};
