/* =========================================================
   ONLINE DECLARATION: Игра диктатора (dictator)
   Two rounds: first anonymous, second open — same people both times.
   Anonymous: the projector sees only sorted amounts, never names
   (mirrors the offline projector behaviour).
   Constants duplicated from src/games/dictator.js.
========================================================= */
import { dictatorResults } from '../../src/logic/results.js';
import { intValue, num } from './validate.js';

const POT = 1000;

export default {
  id: 'dictator',
  name: 'Игра диктатора',
  category: 'econ',
  minPlayers: 3,
  rounds: 2,
  anonymous: true,
  roundTitles: [`Раунд 1 · анонимно`, `Раунд 2 · под своим именем`],

  rules: {
    flow: ['Анонимно', 'Открыто', 'Результаты'],
    items: [
      {
        title: `Вам досталось ${POT} ₽`,
        text: 'Можете поделиться с общим котлом — можете не делить. Никто не узнает, сколько вы внесли.',
      },
      {
        title: 'Решение одним числом',
        text: `Впишите, сколько из ${POT} ₽ вы отдаёте. Во втором раунде — то же самое, но уже открыто.`,
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: `r${round + 1}`,
      kind: 'int',
      label:
        round === 0
          ? `Сколько из ${POT} ₽ вы отдаёте? (никто не узнает)`
          : `Сколько из ${POT} ₽ вы отдаёте открыто?`,
      hint: `от 0 до ${POT}`,
      min: 0,
      max: POT,
    },
  ],

  myInfo: (round) =>
    round === 0
      ? 'Этот раунд анонимный: на экране зала суммы будут показаны без имён.'
      : 'Этот раунд открытый: все увидят, кто сколько отдал.',

  empty: () => ({ r1: null, r2: null }),

  flatten: (payload) => ({ r1: payload.r1 ?? null, r2: payload.r2 ?? null }),

  validateRound(raw, round) {
    const v = intValue(raw[`r${round + 1}`], { min: 0, max: POT });
    if (v === null) return { ok: false, error: 'Впишите число' };
    return { ok: true, patch: { [`r${round + 1}`]: v } };
  },

  roundFilled: (payload, round) => payload[`r${round + 1}`] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => n.payload.r1 != null && n.payload.r2 != null),

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [
        { label: 'Анонимно', value: num(payload.r1) },
        { label: 'Открыто', value: num(payload.r2) },
      ],
      payload,
    }));
  },

  compute(named) {
    const r = dictatorResults(named.map(({ payload }) => ({ r1: payload.r1, r2: payload.r2 })));
    return {
      avgR1: r.avgR1,
      avgR2: r.avgR2,
      delta: r.delta,
      filled: r.filled.length,
    };
  },

  headline: (r) => (r.delta === null ? '—' : `${r.delta >= 0 ? '+' : ''}${Math.round(r.delta)} ₽`),
  detail: (r) =>
    `Анонимно давали в среднем ${Math.round(r.avgR1 ?? 0)} ₽, открыто — ${Math.round(r.avgR2 ?? 0)} ₽ из ${POT} ₽. Разница и есть эффект наблюдения.`,
  timerSeconds: () => 30,
};
