/* =========================================================
   ONLINE DECLARATION: Эффект Барнума (barnum)
   Three open questions (text), then a private Barnum description
   (раздача в личку) that everyone rates 1–5. Results: the average
   rating. Constants duplicated from src/games/barnum.js.
========================================================= */
import { barnumResults } from '../../src/logic/results.js';
import { intValue } from './validate.js';

const QUESTIONS = [
  'Опишите, как обычно выглядит ваше идеальное утро: что вы делаете в первые полчаса после пробуждения и почему именно это?',
  'Вспомните недавнюю ситуацию на работе, в которой вы поступили не так, как от вас ожидали. Что произошло и как вы к этому пришли?',
  'Представьте свободный день без обязательств и без планов. Чем бы вы его занялись — и что подсказывает вам, что это именно ваше?',
];

// The vague description everyone rates — the spoiler of the game.
// It goes to each participant privately (раздача в личку), never to
// the projector, exactly like the offline spoiler card.
const BARNUM_TEXT = [
  'Психологический портрет',
  '',
  'Вы цените возможность рассчитывать на себя и при этом тяготитесь, когда приходится всё время держать удар одному. У вас развито чувство собственного достоинства: несправедливость по отношению к вам или к близким вы переносите тяжело, хотя внешне не всегда это показываете.',
  '',
  'Вы обладаете незаурядным потенциалом, который раскрывается не полностью — сдерживает не столько лень, сколько привычка откладывать важное до лучшего момента. Внутри вы чаще сомневаетесь, чем кажется окружающим.',
].join('\n');

export default {
  id: 'barnum',
  name: 'Эффект Барнума',
  category: 'social',
  minPlayers: 3,

  rules: {
    flow: ['Три вопроса', 'Портрет в личке', 'Оценка', 'Результаты'],
    items: [
      {
        title: 'Три вопроса',
        text: 'Ответьте парой предложений, своими словами, как первым придёт в голову.',
      },
      {
        title: 'Портрет',
        text: 'После ответов ведущий пришлёт каждому психологический портрет — в личку. Прочитайте его до оценки.',
      },
      { title: 'Оценка', text: 'Оцените по шкале 1–5, насколько портрет вас описывает.' },
    ],
  },

  fields: [
    ...QUESTIONS.map((q, i) => ({ key: `a${i}`, kind: 'text', label: q })),
    {
      key: 'rating',
      kind: 'choice',
      label: 'Насколько точно портрет описывает именно вас?',
      options: [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) })),
    },
  ],

  myInfo: () => 'Портрет уже должен быть у вас в личке с ботом — прочитайте его перед оценкой.',

  empty: () => ({ a0: null, a1: null, a2: null, rating: null }),

  flatten: (payload) => ({
    a0: payload.a0 ?? null,
    a1: payload.a1 ?? null,
    a2: payload.a2 ?? null,
    rating: payload.rating ?? null,
  }),

  validate(raw) {
    const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
    const answers = {
      a0: text(raw.a0),
      a1: text(raw.a1),
      a2: text(raw.a2),
      rating: (() => {
        const n = intValue(raw.rating, { min: 1, max: 5 });
        return n === null && ['1', '2', '3', '4', '5'].includes(raw.rating)
          ? Number(raw.rating)
          : n;
      })(),
    };
    if (answers.rating === null) return { ok: false, error: 'Поставьте оценку 1–5' };
    return { ok: true, answers };
  },

  complete: (named) => named.length >= 3 && named.every(({ payload }) => payload.rating != null),

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [{ label: 'Оценка', value: payload.rating == null ? '—' : String(payload.rating) }],
      payload,
    }));
  },

  compute(named) {
    const r = barnumResults(named.map(({ payload }) => ({ rating: payload.rating })));
    return { avg: r.avg, filled: r.filled.length };
  },

  headline: (r) => (r.avg === null ? '—' : r.avg.toFixed(1)),
  detail: () =>
    'Средняя оценка «насколько портрет про меня». Один и тот же расплывчатый текст обычно получает высокие оценки почти от всех.',

  dispatchText: () => BARNUM_TEXT,
};
