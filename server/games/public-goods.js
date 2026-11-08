/* =========================================================
   ONLINE DECLARATION: Общественное благо (public-goods)
   Two rounds; each round everyone decides how much of their stake to
   put into the common pot (doubled and split equally). Anonymous:
   the projector sees only the sorted contributions. Logic from
   src/logic/results.js. Constants from src/games/public-goods.js.
========================================================= */
import { publicGoodsResults, publicGoodsSummary } from '../../src/logic/results.js';
import { intValue, num } from './validate.js';

const STAKE = 100;

export default {
  id: 'public-goods',
  name: 'Общественное благо',
  category: 'econ',
  minPlayers: 3,
  rounds: 2,
  anonymous: true,
  roundTitles: ['Раунд 1 · первый котёл', 'Раунд 2 · снова тот же котёл'],

  rules: {
    flow: [`${STAKE} фишек`, 'Вклад в котёл', 'Второй раунд', 'Результаты'],
    items: [
      {
        title: `${STAKE} фишек у каждого`,
        text: `Решите, сколько из ${STAKE} вложить в общий котёл. Вклады удваиваются и делятся поровну на всех — вкладываясь или нет.`,
      },
      {
        title: 'Анонимно',
        text: 'Ваш личный вклад не показывается никому, даже ведущему на экране зала. Только суммы.',
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: `r${round + 1}`,
      kind: 'int',
      label: `Сколько из ${STAKE} фишек вложить в общий котёл? (раунд ${round + 1})`,
      hint: `от 0 до ${STAKE}`,
      min: 0,
      max: STAKE,
    },
  ],

  myInfo: () => 'Ваш вклад анонимен: зал увидит только суммы.',

  empty: () => ({ r1: null, r2: null }),

  flatten: (payload) => ({ r1: payload.r1 ?? null, r2: payload.r2 ?? null }),

  validateRound(raw, round) {
    const v = intValue(raw[`r${round + 1}`], { min: 0, max: STAKE });
    if (v === null) return { ok: false, error: 'Впишите число' };
    return { ok: true, patch: { [`r${round + 1}`]: v } };
  },

  roundFilled: (payload, round) => payload[`r${round + 1}`] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => n.payload.r1 != null && n.payload.r2 != null),

  recap: (round, named) => {
    if (round < 1) return null;
    const s = publicGoodsSummary(
      named.map(({ payload }) => ({ r1: payload.r1 })),
      'r1',
      STAKE,
    );
    if (!s) return null;
    return [
      `Первый раунд: в среднем вложили ${s.avg.toFixed(1)} из ${STAKE} (от ${s.min} до ${s.max}).`,
      `Котёл после удвоения — ${s.pot}, каждому досталось по ${Math.round(s.share)}.`,
      `Вложили всё: ${s.fullContributors}, не вложили ничего: ${s.freeRiders}.`,
    ];
  },

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [
        { label: 'Раунд 1', value: num(payload.r1) },
        { label: 'Раунд 2', value: num(payload.r2) },
      ],
      payload,
    }));
  },

  compute(named) {
    const r = publicGoodsResults(
      named.map(({ payload }) => ({ r1: payload.r1, r2: payload.r2 })),
      STAKE,
    );
    return {
      avgR1: Math.round(r.s1.avg * 10) / 10,
      avgR2: Math.round(r.s2.avg * 10) / 10,
      delta: Math.round(r.delta * 10) / 10,
      filled: r.filled.length,
    };
  },

  headline: (r) => (r.delta === null ? '—' : `${r.delta >= 0 ? '+' : ''}${r.delta}`),
  detail: (r) =>
    `Средний вклад: раунд 1 — ${r.avgR1}, раунд 2 — ${r.avgR2} из ${STAKE}. Отрицательная динамика — доверие таяло на глазах.`,
  timerSeconds: () => 30,
};
