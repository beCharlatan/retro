/* =========================================================
   ONLINE DECLARATION: Кто возьмёт на себя (volunteer)
   Three rounds — pairs, fours, the whole team. Each round everyone
   secretly decides whether to take the task. Logic from
   src/logic/volunteer.js (choices are 'V'/'N' there).
========================================================= */
import { mean } from '../../src/logic/stats.js';
import {
  splitIntoGroups,
  VD_BENEFIT,
  VD_COST,
  VD_GROUP_SIZES,
  volunteerResults,
} from '../../src/logic/volunteer.js';
import { choiceValue } from './validate.js';

const ROUNDS = [
  {
    short: 'В парах',
    scenario: 'Упал CI у вас двоих. Кто-то должен разобраться: это час работы вместо своей задачи.',
  },
  {
    short: 'В четвёрках',
    scenario: 'Клиент пишет в общий канал вашей четвёрки. Ответить — значит взять тикет на себя.',
  },
  {
    short: 'Вся команда',
    scenario: 'Пятница, 18:55. Алерт в общем канале команды: падает прод.',
  },
];

const YESNO = [
  { value: 'V', label: 'Беру на себя' },
  { value: 'N', label: 'Не беру' },
];

export default {
  id: 'volunteer',
  name: 'Кто возьмёт на себя',
  category: 'social',
  minPlayers: 3,
  rounds: ROUNDS.length,
  roundTitles: ROUNDS.map((r) => r.short),

  rules: {
    flow: ['Три сценария', 'Тайный выбор', 'Результаты'],
    items: [
      {
        title: 'Тайный выбор',
        text: 'В каждом сценарии решаете про себя: берёте задачу на себя или нет. Отвечаете одновременно и независимо.',
      },
      {
        title: 'Что на кону',
        text: `Если задачу взял кто-то один — он тратит ${VD_COST}, все остальные получают ${VD_BENEFIT}. Если не взял никто — задача сгорает.`,
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: `r${round + 1}`,
      kind: 'choice',
      label: ROUNDS[round].scenario,
      options: YESNO,
    },
  ],

  empty: () => ({ r1: null, r2: null, r3: null }),

  flatten: (payload) => ({
    r1: payload.r1 ?? null,
    r2: payload.r2 ?? null,
    r3: payload.r3 ?? null,
  }),

  validateRound(raw, round) {
    const v = choiceValue(raw[`r${round + 1}`], YESNO);
    if (v === null) return { ok: false, error: 'Сделайте выбор' };
    return { ok: true, patch: { [`r${round + 1}`]: v } };
  },

  roundFilled: (payload, round) => payload[`r${round + 1}`] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => ['r1', 'r2', 'r3'].every((k) => n.payload[k] != null)),

  recap: (round, named) =>
    ROUNDS.slice(0, round).map((r, i) => {
      const took = named.filter((n) => n.payload[`r${i + 1}`] === 'V').length;
      return `${r.short}: взяли на себя ${took} из ${named.length}.`;
    }),

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: ROUNDS.map((_, i) => ({
        label: `Р${i + 1}`,
        value: payload[`r${i + 1}`] == null ? '—' : payload[`r${i + 1}`] === 'V' ? 'Взял' : '—',
      })),
      payload,
    }));
  },

  compute(named) {
    const rows = named.map(({ name, payload }) => ({
      name,
      choices: [payload.r1, payload.r2, payload.r3],
    }));
    const groupsByRound = VD_GROUP_SIZES.map((size) =>
      splitIntoGroups(
        rows.map((r) => r.name),
        size,
      ),
    );
    const r = volunteerResults(rows, groupsByRound);
    if (!r) return { avg: null, nobodyRates: [] };
    const avg = mean(r.people.map((p) => p.total));
    return {
      avg,
      nobodyRates: r.rounds.map((round) => round?.nobodyRate ?? null),
    };
  },

  headline: (r) => (r.avg === null ? '—' : String(Math.round(r.avg))),
  detail: (r) =>
    r.nobodyRates.length
      ? `Средний выигрыш участника (условные единицы). Доля ситуаций, где задачу не взял никто: ${r.nobodyRates.map((x) => (x === null ? '—' : `${x}%`)).join(' · ')}.`
      : 'Недостаточно данных.',
  timerSeconds: () => 20,
};
